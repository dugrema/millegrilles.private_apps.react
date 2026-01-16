import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import useTransferStore, {
  DownloadJobStoreType,
  TransferActivity,
  UploadJobStoreType,
} from "./transferStore";
import {
  getBatchRetryUploadSendCommand,
  getDownloadContent,
  getDownloadJob,
  getDownloadJobs,
  getNextUploadSendCommand,
  getUploadJobs,
  updateUploadJobState,
} from "./idb/collections2StoreIdb";
import { downloadFile } from "./transferUtils";
import {
  DownloadStateEnum,
  UploadStateEnum,
} from "./idb/collections2Store.types";

function Transfers() {
  return (
    <>
      <Outlet />
    </>
  );
}

export default Transfers;

/**
 * Loads and syncs the download information from the local IDB.
 * Used by AppCollections2 from initial application load.
 * @returns
 */
export function SyncDownloads() {
  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);

  let userId = useUserBrowsingStore((state) => state.userId);
  let setDownloadJobs = useTransferStore((state) => state.setDownloadJobs);
  let jobsDirty = useTransferStore((state) => state.downloadJobsDirty);
  let setJobsDirty = useTransferStore((state) => state.setDownloadJobsDirty);

  useEffect(() => {
    if (!userId) return;
    if (!jobsDirty) return;
    setJobsDirty(false); // Avoid loop

    getDownloadJobs(userId)
      .then((jobs) => {
        // console.debug("Download jobs", jobs);
        let mappedJobs = jobs.map((item) => {
          return {
            fuuid: item.fuuid,
            tuuid: item.tuuid,
            processDate: item.processDate,
            state: item.state,
            size: item.size,
            retry: item.retry,
            filename: item.filename,
            mimetype: item.mimetype,
          } as DownloadJobStoreType;
        });
        setDownloadJobs(mappedJobs);
      })
      .catch((err) => console.error("Error loading download jobs", err));
  }, [userId, setDownloadJobs, jobsDirty, setJobsDirty]);

  useEffect(() => {
    if (!workers || !ready || !userId || !jobsDirty) return; // Nothing to do

    let { download, sharedTransfer } = workers;

    // Select the shared worker when present. This ensures only one active process handles the job.
    let promise = null;
    if (sharedTransfer) {
      promise = sharedTransfer.getFuuidsReady();
    } else {
      promise = download.getFuuidsReady();
    }

    promise
      .then(async (fuuidsReady) => {
        if (!fuuidsReady || !userId) return; // Nothing to do
        for (let fuuid of fuuidsReady) {
          // console.debug("Trigger download of ", fuuid);
          let job = await getDownloadJob(userId, fuuid);
          if (job) {
            // Load file from storage
            if (job.state === DownloadStateEnum.DONE) {
              let content = await getDownloadContent(fuuid, userId);
              if (content) {
                downloadFile(job.filename, content);
              }
            } else {
              console.warn("Download %s requested but not ready", job.filename);
            }
          } else {
            console.warn("No job found to download fuuid:%s", fuuid);
          }
        }
      })
      .catch((err) => console.error("Error getting fuuids to download", err));
  }, [workers, ready, jobsDirty, userId]);

  return <></>;
}

/**
 * Loads and syncs the upload information from the local IDB.
 * Used by AppCollections2 from initial application load.
 * @returns
 */
export function SyncUploads() {
  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);

  let userId = useUserBrowsingStore((state) => state.userId);
  let setUploadJobs = useTransferStore((state) => state.setUploadJobs);
  let uploadJobsDirty = useTransferStore((state) => state.uploadJobsDirty);
  let setUploadJobsDirty = useTransferStore(
    (state) => state.setUploadJobsDirty,
  );

  let [jobsReady, setJobsReady] = useState(true);

  // Throttle updates, max 3/sec.
  useEffect(() => {
    if (uploadJobsDirty) {
      setJobsReady(false);
      setTimeout(() => {
        setJobsReady(true);
        setUploadJobsDirty(false);
      }, 350);
    }
  }, [uploadJobsDirty, setUploadJobsDirty]);

  useEffect(() => {
    if (!userId) return;
    if (!jobsReady) return;
    setUploadJobsDirty(false); // Avoid loop

    getUploadJobs(userId)
      .then((jobs) => {
        // console.debug("Upload jobs", jobs);
        let mappedJobs = jobs.map((item) => {
          return {
            uploadId: item.uploadId,
            processDate: item.processDate,
            state: item.state,
            clearSize: item.clearSize,
            size: item.size,
            retry: item.retry,
            filename: item.filename,
            mimetype: item.mimetype,
            destinationPath: item.destinationPath,
            cuuid: item.cuuid,
          } as UploadJobStoreType;
        });
        setUploadJobs(mappedJobs);
      })
      .catch((err) => console.error("Error loading download jobs", err));
  }, [userId, jobsReady, setUploadJobs, setUploadJobsDirty]);

  useEffect(() => {
    if (!workers || !ready || !userId || !jobsReady) return; // Nothing to do
    let { connection, upload } = workers;

    let workersInner = workers,
      userIdInner = userId;
    let runMaintenance = false;
    let maintenanceInterval = setInterval(() => {
      if (!runMaintenance) return;
      runMaintenance = false; // Prevent interval from triggerring other maintenance
      Promise.resolve()
        .then(async () => {
          // console.debug("Run upload stuck in SendCommand state maintenance");
          let jobs = await getBatchRetryUploadSendCommand(userIdInner);
          if (jobs && jobs.length > 0) {
            for await (let job of jobs) {
              // console.debug("Checking if SendCommand for job %O has been completed", job);
              let { fuuid, addCommand, keyCommand } = job;
              if (fuuid && addCommand && keyCommand) {
                let response =
                  await workersInner.connection.collection2CheckUserAccessFuuids(
                    [fuuid],
                  );
                let exists = response.fuuids
                  ? response.fuuids.length === 1
                  : false;
                // console.debug("Fuuid exists?: %s, %O", exists, response);
                if (exists) {
                  // Move on to next state
                } else {
                  // Re-send command and keep going
                  await connection.collection2AddFile(addCommand, keyCommand);
                }
                await updateUploadJobState(job.uploadId, UploadStateEnum.READY);
                await upload.triggerListChanged();
              }
            }
          } else {
            // console.debug("No upload stuck in SendCommand state");
          }
        })
        .catch((err) => {
          console.error(
            "Error during recovery of uploads in SendCommand state",
            err,
          );
        })
        .finally(() => {
          runMaintenance = true;
        });
    }, 20_000);

    // Select the shared worker when present. This ensures only one active process handles the job.
    Promise.resolve()
      .then(async () => {
        let job = await getNextUploadSendCommand(userIdInner);
        while (job) {
          // console.debug("Send command for upload job", job);
          if (job.addCommand && job.keyCommand) {
            // Send Add File command and set upload to ready.
            await connection.collection2AddFile(job.addCommand, job.keyCommand);
            await updateUploadJobState(job.uploadId, UploadStateEnum.READY);
            await upload.triggerListChanged();
          } else {
            console.warn(
              "Error on jobId:%s, no add/key commands present",
              job.uploadId,
            );
          }
          // Get next uploadId to process
          job = await getNextUploadSendCommand(userIdInner);
        }

        // Make sure the worker picks up the new jobs from IDB
        await upload.triggerJobs();
      })
      .catch((err) =>
        console.error("Error processing file creation command", err),
      )
      .finally(() => {
        runMaintenance = true;
      });

    return () => {
      // Stop maintenance interval
      clearInterval(maintenanceInterval);
    };
  }, [workers, ready, jobsReady, userId]);

  // Pause or resume uploads
  useEffect(() => {
    if (!workers || !ready || !userId) return;

    let uploadsCurrentlyPaused =
      localStorage.getItem(`pauseUploading_${userId}`) === "true";
    let downloadsCurrentlyPaused =
      localStorage.getItem(`pauseDownloading_${userId}`) === "true";
    // console.debug("Currently paused? ", uploadsCurrentlyPaused);

    if (uploadsCurrentlyPaused) {
      // Stop upload worker
      workers.upload.pauseUploading();
    } else {
      // Resume uploading with worker
      workers.upload.resumeUploading();
    }

    if (downloadsCurrentlyPaused) {
      // Stop download worker
      workers.download.pauseDownloading();
    } else {
      // Resume downloading with worker
      workers.download.resumeDownloading();
    }
  }, [workers, ready, userId]);

  return <></>;
}

const CONST_STATUS_DOWNLOAD_JOB_TOTAL = [
  DownloadStateEnum.INITIAL,
  DownloadStateEnum.DOWNLOADING,
  DownloadStateEnum.ENCRYPTED,
];

// INITIAL = 1,
// ENCRYPTING,
// GENERATING,
// SENDCOMMAND,    // To READY or PAUSED

// // Client upload to server. Transition from any to any of these states is possible.
// READY,
// PAUSED,
// UPLOADING,      // TO VERIFYING or ERROR_DURING_PART_UPLOAD

// // After upload completed from client side
// VERIFYING,      // Server-side verification
// DONE,           // Final state

// // Error during UPLOADING - can be resumed.
// ERROR_DURING_PART_UPLOAD = 98,

// // Any state can transition to ERROR. This is a final state like DONE (no resume).
// ERROR = 99,

const CONST_STATUS_UPLOAD_JOB_TOTAL = [
  UploadStateEnum.INITIAL,
  UploadStateEnum.ENCRYPTING,
  UploadStateEnum.GENERATING,
  UploadStateEnum.SENDCOMMAND,
  UploadStateEnum.READY,
  UploadStateEnum.UPLOADING,
  UploadStateEnum.VERIFYING,
];

// Used to calculate the current upload bytes that are encrypted - counts for half the upload work
const CONST_STATUS_UPLOAD_ENCRYPTION_DONE = [
  UploadStateEnum.GENERATING,
  UploadStateEnum.SENDCOMMAND,
  UploadStateEnum.READY,
  // Include subsequent states to "double-count"
  UploadStateEnum.UPLOADING,
  UploadStateEnum.VERIFYING,
];

const CONST_STATUS_UPLOADING = [
  UploadStateEnum.UPLOADING,
  UploadStateEnum.VERIFYING,
];

/** Maintains the transfer ticker (pct upload/download) */
export function TransferTickerUpdate() {
  let downloadJobs = useTransferStore((state) => state.downloadJobs);
  let downloadProgress = useTransferStore((state) => state.downloadProgress);
  let setDownloadTicker = useTransferStore((state) => state.setDownloadTicker);
  let downloadSessionStart = useTransferStore(
    (state) => state.downloadSessionStart,
  );
  let setDownloadSessionStart = useTransferStore(
    (state) => state.setDownloadSessionStart,
  );

  let uploadJobs = useTransferStore((state) => state.uploadJobs);
  let uploadProgress = useTransferStore((state) => state.uploadProgress);
  let setUploadTicker = useTransferStore((state) => state.setUploadTicker);
  let uploadSessionStart = useTransferStore(
    (state) => state.uploadSessionStart,
  );
  let setUploadSessionStart = useTransferStore(
    (state) => state.setUploadSessionStart,
  );

  // Download ticker
  useEffect(() => {
    let activity = TransferActivity.IDLE_EMTPY;
    let bytesPosition = 0;
    let totalBytesDownloading = 0;
    let downloadStates = {
      [DownloadStateEnum.INITIAL]: 0,
      [DownloadStateEnum.DOWNLOADING]: 0,
      [DownloadStateEnum.ENCRYPTED]: 0,
      [DownloadStateEnum.DONE]: 0,
      [DownloadStateEnum.PAUSED]: 0,
      [DownloadStateEnum.ERROR]: 0,
    };

    if (downloadJobs && downloadJobs.length > 0) {
      // We have some activity - can be overriden later on
      activity = TransferActivity.IDLE_CONTENT;

      // Total bytes downloading
      let total = downloadJobs
        .filter((item) => CONST_STATUS_DOWNLOAD_JOB_TOTAL.includes(item.state))
        .map((item) => item.size)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);
      totalBytesDownloading = total || 0;

      if (downloadSessionStart) {
        // Add jobs that have completed since the start of this session to the total
        let startTimestamp = downloadSessionStart.getTime();
        let totalCompleted = downloadJobs
          .filter((item) => {
            return (
              item.state === DownloadStateEnum.DONE &&
              item.processDate >= startTimestamp
            );
          })
          .map((item) => item.size)
          .reduce((acc, item) => {
            if (acc && item) return acc + item;
            if (item) return item;
            return acc;
          }, 0);
        if (totalCompleted) totalBytesDownloading += totalCompleted;

        // Current progress when adding jobs DONE that started in the current session
        let currentDone = downloadJobs
          .filter((item) => {
            return (
              item.state === DownloadStateEnum.DONE &&
              item.processDate >= startTimestamp
            );
          })
          .map((item) => item.size)
          .reduce((acc, item) => {
            if (acc && item) return acc + item;
            if (item) return item;
            return acc;
          }, 0);
        if (currentDone) bytesPosition += currentDone;
      }

      // Jobs that are completely downloaded by not decrypted
      let currentEncrypted = downloadJobs
        .filter((item) => item.state === DownloadStateEnum.ENCRYPTED)
        .map((item) => item.size)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);
      if (currentEncrypted) {
        // Downloaded but not decrypted files count for half the "byte work".
        bytesPosition += Math.floor(currentEncrypted / 2);
      }

      // Check states
      downloadStates = downloadJobs
        .map((item) => item.state)
        .reduce((acc, item) => {
          acc[item] += 1;
          return acc;
        }, downloadStates);
    }

    if (downloadProgress && downloadProgress.length > 0) {
      activity = TransferActivity.RUNNING; // Workers active

      // Get current download position
      let downloadWorkerPosition = downloadProgress
        .filter((item) => item.state === DownloadStateEnum.DOWNLOADING)
        .map((item) => item.position)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);

      // Download is half the work
      if (downloadWorkerPosition) bytesPosition += downloadWorkerPosition / 2;

      // Get current download position
      let encryptedWorkerPosition = downloadProgress
        .filter((item) => item.state === DownloadStateEnum.ENCRYPTED)
        .map((item) => item.position)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);

      // Decrypting is half the work
      if (encryptedWorkerPosition) bytesPosition += encryptedWorkerPosition / 2;
    }

    if (downloadStates[DownloadStateEnum.ERROR] > 0) {
      activity = TransferActivity.ERROR;
    } else if (downloadStates[DownloadStateEnum.PAUSED] > 0) {
      activity = TransferActivity.PENDING;
    }

    // console.debug("Download activity: %s, position: %s, total: %s, states: %O", activity, bytesPosition, totalBytesDownloading, downloadStates);
    let percent = null as number | null;
    if (typeof bytesPosition === "number" && totalBytesDownloading) {
      percent = Math.floor((bytesPosition / totalBytesDownloading) * 100);
      if (percent > 100) {
        console.warn("Error - download pct %s over 100 - clamping", percent);
        percent = 100;
      } else if (percent < 0) {
        console.warn("Error - download pct %s below 0 - clamping", percent);
        percent = 0;
      }
    } else if (activity === TransferActivity.IDLE_CONTENT) {
      percent = 100; // We have some completed transfers
    }

    setDownloadTicker(activity, percent, { states: downloadStates });

    if (
      downloadStates[DownloadStateEnum.INITIAL] === 0 &&
      downloadStates[DownloadStateEnum.DOWNLOADING] === 0 &&
      downloadStates[DownloadStateEnum.ENCRYPTED] === 0
    ) {
      // Reset download session start
      setDownloadSessionStart(null);
    }
  }, [
    downloadJobs,
    downloadProgress,
    setDownloadTicker,
    downloadSessionStart,
    setDownloadSessionStart,
  ]);

  // Upload ticker
  useEffect(() => {
    let activity = TransferActivity.IDLE_EMTPY;
    let bytesPosition = 0;
    let totalBytesUploading = 0;
    let uploadStates = {
      [UploadStateEnum.INITIAL]: 0,
      [UploadStateEnum.ENCRYPTING]: 0,
      [UploadStateEnum.GENERATING]: 0,
      [UploadStateEnum.SENDCOMMAND]: 0,
      [UploadStateEnum.READY]: 0,
      [UploadStateEnum.PAUSED]: 0,
      [UploadStateEnum.UPLOADING]: 0,
      [UploadStateEnum.VERIFYING]: 0,
      [UploadStateEnum.DONE]: 0,
      [UploadStateEnum.ERROR_DURING_PART_UPLOAD]: 0,
      [UploadStateEnum.ERROR]: 0,
    };

    if (uploadJobs && uploadJobs.length > 0) {
      // We have some activity - can be overriden later on
      activity = TransferActivity.IDLE_CONTENT;

      // Total bytes uploading, excluding completed uploads
      let total = uploadJobs
        .filter((item) => CONST_STATUS_UPLOAD_JOB_TOTAL.includes(item.state))
        .map((item) => item.size || item.clearSize)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);
      totalBytesUploading = total || 0;

      if (uploadSessionStart) {
        // Add jobs that have completed since the start of this session to the total
        let startTimestamp = uploadSessionStart.getTime();
        let totalCompleted = uploadJobs
          .filter((item) => {
            return (
              item.state === UploadStateEnum.DONE &&
              item.processDate >= startTimestamp
            );
          })
          .map((item) => item.size)
          .reduce((acc, item) => {
            if (acc && item) return acc + item;
            if (item) return item;
            return acc;
          }, 0);

        if (totalCompleted) {
          totalBytesUploading += totalCompleted;
          bytesPosition += totalCompleted;
        }

        // // Current progress when adding jobs DONE that started in the current session
        // let currentDone = uploadJobs
        //     .filter(item=>{
        //         return item.state === UploadStateEnum.DONE && item.processDate >= startTimestamp;
        //     })
        //     .map(item=>item.size)
        //     .reduce((acc, item)=>{
        //         if(acc && item) return acc + item;
        //         if(item) return item;
        //         return acc;
        //     }, 0);
        // if(currentDone) {
        //     bytesPosition += currentDone;
        // }
      }

      // Jobs that are completely encrypted by not uploaded
      let currentEncrypted = uploadJobs
        .filter((item) =>
          CONST_STATUS_UPLOAD_ENCRYPTION_DONE.includes(item.state),
        )
        .map((item) => item.size)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);

      if (currentEncrypted) {
        // Encrypted but not uploaded files count for half the "byte work".
        bytesPosition += Math.floor(currentEncrypted / 2);
      }

      // let currentUploading = uploadJobs
      //     .filter(item=>CONST_STATUS_UPLOADING.includes(item.state))
      //     .map(item=>item.size)
      //     .reduce((acc, item)=>{
      //         if(acc && item) return acc + item;
      //         if(item) return item;
      //         return acc;
      //     }, 0);

      // if(currentUploading) {
      //     // Uploaded files count for half the "byte work".
      //     bytesPosition += Math.floor(currentUploading / 2);
      // }

      // Check states
      uploadStates = uploadJobs
        .map((item) => item.state)
        .reduce((acc, item) => {
          acc[item] += 1;
          return acc;
        }, uploadStates);
    }

    if (uploadProgress && uploadProgress.length > 0) {
      if (!uploadSessionStart) setUploadSessionStart(new Date());

      activity = TransferActivity.RUNNING; // Workers active

      // Get current encryption position - count as half the bytes to process
      let encryptionWorkerPosition = uploadProgress
        .filter((item) => item.state === UploadStateEnum.ENCRYPTING)
        .map((item) => item.position)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);
      // Encrypting is half the work
      if (encryptionWorkerPosition)
        bytesPosition += encryptionWorkerPosition / 2;

      // Get current upload position
      let uploadWorkerPosition = uploadProgress
        .filter((item) => item.state === UploadStateEnum.UPLOADING)
        .map((item) => item.position)
        .reduce((acc, item) => {
          if (acc && item) return acc + item;
          if (item) return item;
          return acc;
        }, 0);

      // Uploading is half the work
      if (uploadWorkerPosition) bytesPosition += uploadWorkerPosition / 2;
    }

    if (uploadStates[UploadStateEnum.ERROR] > 0) {
      activity = TransferActivity.ERROR;
    } else if (
      uploadStates[UploadStateEnum.PAUSED] > 0 ||
      uploadStates[UploadStateEnum.ERROR_DURING_PART_UPLOAD] > 0
    ) {
      activity = TransferActivity.PENDING;
    }

    // console.debug("Upload activity: %s, position: %s, total: %s, states: %O", activity, bytesPosition, totalBytesUploading, uploadStates);
    let percent = null as number | null;
    if (typeof bytesPosition === "number" && totalBytesUploading) {
      percent = Math.floor((bytesPosition / totalBytesUploading) * 100);
      if (percent > 100) {
        console.warn("Error - download pct %s over 100 - clamping", percent);
        percent = 100;
      } else if (percent < 0) {
        console.warn("Error - download pct %s below 0 - clamping", percent);
        percent = 0;
      }
    } else if (activity === TransferActivity.IDLE_CONTENT) {
      percent = 100; // We have some completed transfers
    }
    setUploadTicker(activity, percent, { states: uploadStates });

    if (
      uploadStates[UploadStateEnum.INITIAL] === 0 &&
      uploadStates[UploadStateEnum.ENCRYPTING] === 0 &&
      uploadStates[UploadStateEnum.GENERATING] === 0 &&
      uploadStates[UploadStateEnum.SENDCOMMAND] === 0 &&
      uploadStates[UploadStateEnum.READY] === 0 &&
      uploadStates[UploadStateEnum.UPLOADING] === 0 &&
      uploadStates[UploadStateEnum.VERIFYING] === 0
    ) {
      // Reset download session start
      setUploadSessionStart(null);
    }
  }, [
    uploadJobs,
    uploadProgress,
    setUploadTicker,
    uploadSessionStart,
    setUploadSessionStart,
  ]);

  return <></>;
}
