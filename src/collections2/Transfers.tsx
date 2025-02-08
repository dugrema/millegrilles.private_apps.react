import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import useTransferStore, { DownloadJobStoreType, TransferActivity, UploadJobStoreType } from "./transferStore";
import { DownloadStateEnum, getDownloadJob, getDownloadJobs, getUploadJob, getUploadJobs, updateUploadJobState, UploadStateEnum } from "./idb/collections2StoreIdb";
import { downloadFile } from "./transferUtils";

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
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setDownloadJobs = useTransferStore(state=>state.setDownloadJobs);
    let jobsDirty = useTransferStore(state=>state.downloadJobsDirty);
    let setJobsDirty = useTransferStore(state=>state.setDownloadJobsDirty);

    useEffect(()=>{
        if(!userId) return;
        if(!jobsDirty) return;
        setJobsDirty(false);  // Avoid loop

        getDownloadJobs(userId)
            .then(jobs=>{
                // console.debug("Download jobs", jobs);
                let mappedJobs = jobs.map(item=>{
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
            .catch(err=>console.error("Error loading download jobs", err))

    }, [userId, setDownloadJobs, jobsDirty, setJobsDirty]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !jobsDirty) return;  // Nothing to do
        workers.download.getFuuidsReady()
            .then( async fuuidsReady => {
                if(!fuuidsReady || !userId) return;  // Nothing to do
                for(let fuuid of fuuidsReady) {
                    // console.debug("Trigger download of ", fuuid);
                    let job = await getDownloadJob(userId, fuuid);
                    if(job) {
                        if(job.content) {
                            downloadFile(job.filename, job.content);
                        } else {
                            console.error("No content to download found for fuuid:%s", fuuid)
                        }
                    } else {
                        console.warn("No job found to download fuuid:%s", fuuid);
                    }
                }
            })
            .catch(err=>console.error("Error getting fuuids to download", err));
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
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setUploadJobs = useTransferStore(state=>state.setUploadJobs);
    let uploadJobsDirty = useTransferStore(state=>state.uploadJobsDirty);
    let setUploadJobsDirty = useTransferStore(state=>state.setUploadJobsDirty);

    let [jobsReady, setJobsReady] = useState(true);

    // Throttle updates, max 3/sec.
    useEffect(()=>{
        if(uploadJobsDirty) {
            setJobsReady(false);
            setTimeout(()=>{
                setJobsReady(true);
                setUploadJobsDirty(false);
            }, 350);
        }
    }, [uploadJobsDirty, setUploadJobsDirty]);

    useEffect(()=>{
        if(!userId) return;
        if(!jobsReady) return;
        setUploadJobsDirty(false);  // Avoid loop

        getUploadJobs(userId)
            .then(jobs=>{
                // console.debug("Upload jobs", jobs);
                let mappedJobs = jobs.map(item=>{
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
            .catch(err=>console.error("Error loading download jobs", err))

    }, [userId, jobsReady, setUploadJobs, setUploadJobsDirty]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !jobsReady) return;  // Nothing to do
        let {connection, upload} = workers;
        workers.upload.getUploadsSendCommand()
            .then( async uploadIds => {
                // console.debug("Uploads send command: %O", uploadIds);
                if(!uploadIds || !userId) return;  // Nothing to do
                for(let uploadId of uploadIds) {
                    // console.debug("Trigger send upload command of %d", uploadId);
                    let job = await getUploadJob(uploadId);
                    if(job) {
                        // console.debug("Send command for upload job", job);
                        if(job.addCommand && job.keyCommand) {
                            // Send Add File command and set upload to ready.
                            await connection.collection2AddFile(job.addCommand, job.keyCommand);
                            await updateUploadJobState(job.uploadId, UploadStateEnum.READY);
                            await upload.triggerListChanged();
                        } else {
                            console.warn("Error on jobId:%s, no add/key commands present", job.uploadId);
                        }
                    } else {
                        console.warn("No job found to download fuuid:%s", uploadId);
                    }
                }

                // Make sure the worker picks up the new jobs from IDB
                await upload.triggerJobs();
            })
            .catch(err=>console.error("Error getting fuuids to download", err));
    }, [workers, ready, jobsReady, userId]);

    // Pause or resume downloads
    useEffect(()=>{
        if(!workers || !ready || !userId) return;

        let currentlyPaused = localStorage.getItem(`pauseUploading_${userId}`) === 'true';
        // console.debug("Currently paused? ", currentlyPaused);

        if(currentlyPaused) {
            // Stop upload worker
            workers.upload.pauseUploading();
        } else {
            // Resume uploading with worker
            workers.upload.resumeUploading();
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
    UploadStateEnum.UPLOADING, 
    UploadStateEnum.VERIFYING, 
];


/** Maintains the transfer ticker (pct upload/download) */
export function TransferTickerUpdate() {

    let downloadJobs = useTransferStore(state=>state.downloadJobs);
    let downloadProgress = useTransferStore(state=>state.downloadProgress);
    let setDownloadTicker = useTransferStore(state=>state.setDownloadTicker);
    let downloadSessionStart = useTransferStore(state=>state.downloadSessionStart);
    let setDownloadSessionStart = useTransferStore(state=>state.setDownloadSessionStart);

    let uploadJobs = useTransferStore(state=>state.uploadJobs);
    let uploadProgress = useTransferStore(state=>state.uploadProgress);
    let setUploadTicker = useTransferStore(state=>state.setUploadTicker);
    let uploadSessionStart = useTransferStore(state=>state.uploadSessionStart);
    let setUploadSessionStart = useTransferStore(state=>state.setUploadSessionStart);

    // Download ticker
    useEffect(()=>{
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

        if(downloadJobs && downloadJobs.length > 0) {
            // We have some activity - can be overriden later on
            activity = TransferActivity.IDLE_CONTENT;

            // Total bytes downloading
            let total = downloadJobs
                .filter(item=>CONST_STATUS_DOWNLOAD_JOB_TOTAL.includes(item.state))
                .map(item=>item.size)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc;
                }, 0);
            totalBytesDownloading = total || 0;

            if(downloadSessionStart) {
                // Add jobs that have completed since the start of this session to the total
                let startTimestamp = downloadSessionStart.getTime();
                let totalCompleted = downloadJobs
                    .filter(item=>{
                        return item.state === DownloadStateEnum.DONE && item.processDate >= startTimestamp;
                    })
                    .map(item=>item.size)
                    .reduce((acc, item)=>{
                        if(acc && item) return acc + item;
                        if(item) return item;
                        return acc;
                    }, 0);
                if(totalCompleted) totalBytesDownloading += totalCompleted;

                // Current progress when adding jobs DONE that started in the current session
                let currentDone = downloadJobs
                    .filter(item=>{
                        return item.state === DownloadStateEnum.DONE && item.processDate >= startTimestamp;
                    })
                    .map(item=>item.size)
                    .reduce((acc, item)=>{
                        if(acc && item) return acc + item;
                        if(item) return item;
                        return acc;
                    }, 0);
                if(currentDone) bytesPosition += currentDone;
            }

            // Jobs that are completely downloaded by not decrypted
            let currentEncrypted = downloadJobs
                .filter(item=>item.state===DownloadStateEnum.ENCRYPTED)
                .map(item=>item.size)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc;
                }, 0);
            if(currentEncrypted) {
                // Downloaded but not decrypted files count for half the "byte work".
                bytesPosition += Math.floor(currentEncrypted / 2);
            }

            // Check states
            downloadStates = downloadJobs.map(item=>item.state).reduce((acc, item)=>{
                acc[item] += 1;
                return acc;
            }, downloadStates);
        }

        if(downloadProgress && downloadProgress.length > 0) {
            activity = TransferActivity.RUNNING;    // Workers active

            // Get current download position
            let downloadWorkerPosition = downloadProgress
                .filter(item=>item.state === DownloadStateEnum.DOWNLOADING)
                .map(item=>item.position)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc
                }, 0);

            // Download is half the work
            if(downloadWorkerPosition) bytesPosition += downloadWorkerPosition / 2;
            
            // Get current download position
            let encryptedWorkerPosition = downloadProgress
                .filter(item=>item.state === DownloadStateEnum.ENCRYPTED)
                .map(item=>item.position)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc
                }, 0);

            // Decrypting is half the work
            if(encryptedWorkerPosition) bytesPosition += encryptedWorkerPosition / 2;
        }

        if(downloadStates[DownloadStateEnum.ERROR] > 0) {
            activity = TransferActivity.ERROR;
        } else if(downloadStates[DownloadStateEnum.PAUSED] > 0) {
            activity = TransferActivity.PENDING;
        }

        // console.debug("Download activity: %s, position: %s, total: %s, states: %O", activity, bytesPosition, totalBytesDownloading, downloadStates);
        let percent = null as number | null;
        if(typeof(bytesPosition) === 'number' && totalBytesDownloading) {
            percent = Math.floor(bytesPosition / totalBytesDownloading * 100);
            if(percent > 100) {
                console.warn("Error - download pct %s over 100 - clamping", percent);
                percent = 100;
            } else if(percent < 0) {
                console.warn("Error - download pct %s below 0 - clamping", percent);
                percent = 0;
            }
        } else if(activity === TransferActivity.IDLE_CONTENT) {
            percent = 100;  // We have some completed transfers
        }
        
        setDownloadTicker(activity, percent, {states: downloadStates});

        if(downloadStates[DownloadStateEnum.INITIAL] === 0 &&
            downloadStates[DownloadStateEnum.DOWNLOADING] === 0 &&
            downloadStates[DownloadStateEnum.ENCRYPTED] === 0
        ) {
            // Reset download session start
            setDownloadSessionStart(null);
        }
    }, [downloadJobs, downloadProgress, setDownloadTicker, downloadSessionStart, setDownloadSessionStart]);

    // Upload ticker
    useEffect(()=>{
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

        if(uploadJobs && uploadJobs.length > 0) {
            // We have some activity - can be overriden later on
            activity = TransferActivity.IDLE_CONTENT;

            // Total bytes uploading, excluding completed uploads
            let total = uploadJobs
                .filter(item=>CONST_STATUS_UPLOAD_JOB_TOTAL.includes(item.state))
                .map(item=>item.size)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc;
                }, 0);
            totalBytesUploading = total || 0;

            if(uploadSessionStart) {
                // Add jobs that have completed since the start of this session to the total
                let startTimestamp = uploadSessionStart.getTime();
                let totalCompleted = uploadJobs
                    .filter(item=>{
                        return item.state === UploadStateEnum.DONE && item.processDate >= startTimestamp;
                    })
                    .map(item=>item.size)
                    .reduce((acc, item)=>{
                        if(acc && item) return acc + item;
                        if(item) return item;
                        return acc;
                    }, 0);
                if(totalCompleted) totalBytesUploading += totalCompleted;

                // Current progress when adding jobs DONE that started in the current session
                let currentDone = uploadJobs
                    .filter(item=>{
                        return item.state === UploadStateEnum.DONE && item.processDate >= startTimestamp;
                    })
                    .map(item=>item.size)
                    .reduce((acc, item)=>{
                        if(acc && item) return acc + item;
                        if(item) return item;
                        return acc;
                    }, 0);
                if(currentDone) bytesPosition += currentDone;
            }

            // Jobs that are completely encrypted by not uploaded
            let currentEncrypted = uploadJobs
                .filter(item=>item.state===UploadStateEnum.UPLOADING)
                .map(item=>item.size)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc;
                }, 0);
            if(currentEncrypted) {
                // Downloaded but not decrypted files count for half the "byte work".
                bytesPosition += Math.floor(currentEncrypted / 2);
            }

            // Check states
            uploadStates = uploadJobs.map(item=>item.state).reduce((acc, item)=>{
                acc[item] += 1;
                return acc;
            }, uploadStates);
        }

        if(uploadProgress && uploadProgress.length > 0) {
            activity = TransferActivity.RUNNING;    // Workers active

            // Get current encryption position - count as half the bytes to process
            let uploadWorkerPosition = uploadProgress
                .filter(item=>item.state === UploadStateEnum.ENCRYPTING)
                .map(item=>item.position)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc
                }, 0);
            // Encrypting is half the work
            if(uploadWorkerPosition) bytesPosition += uploadWorkerPosition / 2;

            // Counting all files already encrypted as half the bytes to process
            let alreadyEncryptedBytes = uploadProgress
                .filter(item=>CONST_STATUS_UPLOAD_ENCRYPTION_DONE.includes(item.state))
                .map(item=>item.position)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc
                }, 0);
            if(alreadyEncryptedBytes) bytesPosition += alreadyEncryptedBytes / 2;
            
            // Get current upload position
            let encryptedWorkerPosition = uploadProgress
                .filter(item=>item.state === UploadStateEnum.UPLOADING)
                .map(item=>item.position)
                .reduce((acc, item)=>{
                    if(acc && item) return acc + item;
                    if(item) return item;
                    return acc
                }, 0);

            // Uploading is half the work
            if(encryptedWorkerPosition) bytesPosition += encryptedWorkerPosition / 2;
        }

        if(uploadStates[UploadStateEnum.ERROR] > 0) {
            activity = TransferActivity.ERROR;
        } else if(uploadStates[UploadStateEnum.PAUSED] > 0 || uploadStates[UploadStateEnum.ERROR_DURING_PART_UPLOAD] > 0) {
            activity = TransferActivity.PENDING;
        }

        // console.debug("Download activity: %s, position: %s, total: %s, states: %O", activity, bytesPosition, totalBytesDownloading, downloadStates);
        let percent = null as number | null;
        if(typeof(bytesPosition) === 'number' && totalBytesUploading) {
            percent = Math.floor(bytesPosition / totalBytesUploading * 100);
            if(percent > 100) {
                console.warn("Error - download pct %s over 100 - clamping", percent);
                percent = 100;
            } else if(percent < 0) {
                console.warn("Error - download pct %s below 0 - clamping", percent);
                percent = 0;
            }
        } else if(activity === TransferActivity.IDLE_CONTENT) {
            percent = 100;  // We have some completed transfers
        }
        setUploadTicker(activity, percent);

        if(uploadStates[UploadStateEnum.INITIAL] === 0 &&
            uploadStates[UploadStateEnum.ENCRYPTING] === 0 &&
            uploadStates[UploadStateEnum.GENERATING] === 0 &&
            uploadStates[UploadStateEnum.SENDCOMMAND] === 0 &&
            uploadStates[UploadStateEnum.READY] === 0 &&
            uploadStates[UploadStateEnum.UPLOADING] === 0 &&
            uploadStates[UploadStateEnum.VERIFYING] === 0
        ) {
            // Reset download session start
            setDownloadSessionStart(null);
        }
    }, [uploadJobs, uploadProgress, setUploadTicker, uploadSessionStart, setUploadSessionStart]);

    return <></>;
}
