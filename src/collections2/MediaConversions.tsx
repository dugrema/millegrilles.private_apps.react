import React, {
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useMediaConversionStore, {
  ConversionJobStoreItem,
  ConversionJobUpdate,
  FileInfoJobs,
} from "./mediaConversionStore";
import {
  CONST_MEDIA_STATE_DONE,
  CONST_MEDIA_STATE_PROBE,
  CONST_MEDIA_STATE_TRANSCODING,
} from "../types/connection.types";
import {
  Collection2MediaConversionUpdateMessage,
  EtatJobEnum,
} from "../types/connection.types";
import useUserBrowsingStore from "./userBrowsingStore";
import { loadTuuid } from "./idb/collections2StoreIdb";

import VideoIcon from "../resources/icons/video-file-svgrepo-com.svg";
import TrashIcon from "../resources/icons/trash-2-svgrepo-com.svg";
import ActionButton from "../resources/ActionButton";
import { proxy } from "comlink";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";
import { useNavigate } from "react-router-dom";

function MediaConversionsPage() {
  return (
    <>
      <section className="pt-12 pb-4">
        <h1 className="text-xl font-bold">Media conversions progress</h1>
      </section>

      <section>
        <MediaConversionsList />
      </section>

      <SyncMediaConversions />
    </>
  );
}

export default MediaConversionsPage;

function MediaConversionsList() {
  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);
  let navigate = useNavigate();

  let currentJobs = useMediaConversionStore((state) => state.currentJobs);
  let removeConversionJobs = useMediaConversionStore(
    (state) => state.removeConversionJobs,
  );
  let setConversionJobs = useMediaConversionStore(
    (state) => state.setConversionJobs,
  );

  let openFileHandler = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      let tuuid = e.currentTarget.dataset.tuuid;
      navigate(`/apps/collections2/f/${tuuid}`);
    },
    [navigate],
  );

  let resetListHandler = useCallback(() => {
    setConversionJobs(null);
  }, [setConversionJobs]);

  let removeJobHandler = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // Avoid opening video Link
      if (!workers || !ready || !currentJobs)
        throw new Error("Workers not initialized or missing context");
      let jobId = e.currentTarget.value;
      let job = currentJobs[jobId];
      if (!job) throw new Error("Unknown jobId " + jobId);
      let response = await workers.connection.collections2RemoveConversionJob(
        job.tuuid,
        job.fuuid,
        jobId,
      );
      if (response.ok === false) throw new Error(response.err);
      removeConversionJobs([jobId]);
    },
    [workers, ready, currentJobs, removeConversionJobs],
  );

  let sortedJobs = useMemo(() => {
    if (!currentJobs) return null;
    let jobs = Object.values(currentJobs);
    jobs.sort(sortJobs);
    return jobs;
  }, [currentJobs]);

  let jobsElem = useMemo(() => {
    if (!sortedJobs || sortedJobs.length === 0)
      return [<p key="nojobs">No jobs.</p>];
    return sortedJobs.map((item) => {
      let params = "";
      if (item.params) {
        if (item.params.defaults !== true) {
          params = `${item.params.codecVideo}, ${item.params.resolutionVideo}`;
          if (typeof item.params.audio_stream_idx === "number") {
            params += ", A" + item.params.audio_stream_idx;
          }
          if (typeof item.params.subtitle_stream_idx === "number") {
            params += ", S" + item.params.subtitle_stream_idx;
          }
        }
      }

      let progress = null as number | null;
      if (
        item.etat === EtatJobEnum.RUNNING &&
        typeof item.pct_progres === "number"
      ) {
        progress = item.pct_progres;
      }

      return (
        <div
          key={item.job_id}
          onClick={openFileHandler}
          data-tuuid={item.tuuid}
          className="grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 cursor-pointer"
        >
          <div className="text-center">
            <ActionButton
              onClick={removeJobHandler}
              value={item.job_id}
              varwidth={10}
              confirm={true}
            >
              <img src={TrashIcon} alt="Remove job" className="w-8" />
            </ActionButton>
          </div>
          <p className="col-span-6 text-sm pl-1">
            <Thumbnail value={item.thumbnail} />
            <span className="pl-2">{item.name || item.job_id}</span>
          </p>
          <p className="col-span-2 pl-2">{params}</p>
          {progress !== null ? (
            <div className="ml-2 relative col-span-3 w-11/12 mt-1 h-4 text-xs bg-slate-200 rounded-full dark:bg-slate-700">
              {progress <= 30 ? (
                <div className="w-full text-violet-800 text-xs font-medium text-center">
                  {progress} %
                </div>
              ) : (
                <></>
              )}
              <div
                className="absolute top-0 h-4 bg-violet-600 text-xs font-medium text-violet-100 text-center p-0.5 leading-none rounded-full transition-all duration-500"
                style={{ width: progress + "%" }}
              >
                {progress > 30 ? <>{progress} %</> : ""}
              </div>
            </div>
          ) : (
            <p className="pl-2 col-span-3">
              <StateValue value={item.etat} />
            </p>
          )}
        </div>
      );
    });
  }, [sortedJobs, openFileHandler, removeJobHandler]);

  if (!currentJobs) return <p>Loading ...</p>;

  return (
    <>
      <div className="pb-2">
        <button
          onClick={resetListHandler}
          className="btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900"
        >
          Reload
        </button>
      </div>

      <div className="grid grid-cols-12 bg-slate-800 text-sm user-select-none px-1 w-full">
        <p className="col-span-1"></p>
        <p className="col-span-6 text-sm">File name</p>
        <p className="col-span-2 pl-2">Parameters</p>
        <p className="pl-2 col-span-3">State</p>
      </div>

      {jobsElem}
    </>
  );
}

function Thumbnail(props: { value: Blob | null | undefined }) {
  let { value } = props;

  let [url, setUrl] = useState("");

  useEffect(() => {
    if (!value) return;
    let blobUrl = URL.createObjectURL(value);
    setUrl(blobUrl);
    return () => {
      URL.revokeObjectURL(blobUrl);
    };
  }, [value, setUrl]);

  if (!url)
    return (
      <img
        src={VideoIcon}
        className="ml-1 w-12 h-12 my-0.5 inline-block rounded"
        alt="File icon"
      />
    );
  return (
    <img
      src={url}
      alt="File icon"
      className="ml-1 w-12 h-12 my-0.5 inline-block rounded"
    />
  );
}

export function SyncMediaConversions() {
  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);
  let userId = useUserBrowsingStore((state) => state.userId);
  let currentJobs = useMediaConversionStore((state) => state.currentJobs);
  let setConversionJobs = useMediaConversionStore(
    (state) => state.setConversionJobs,
  );
  let setFileInfoConversionJobs = useMediaConversionStore(
    (state) => state.setFileInfoConversionJobs,
  );
  let updateConversionJob = useMediaConversionStore(
    (state) => state.updateConversionJob,
  );
  let tuuidsToLoad = useMediaConversionStore((state) => state.tuuidsToLoad);
  let setTuuidsToLoad = useMediaConversionStore(
    (state) => state.setTuuidsToLoad,
  );

  // Mechanism to regularly reload list. Not all events are mapped on the media conversion list, this is the way to catch all changes.
  let [reloadToggle, setReloadToggle] = useState(false);
  useEffect(() => {
    if (!workers || !ready) return;
    setReloadToggle(true);
    let interval = setInterval(() => setReloadToggle(true), 30_000);
    return () => {
      clearInterval(interval);
    };
  }, [workers, ready, setReloadToggle]);

  // Toggles reload on list reset
  useEffect(() => {
    if (!workers || !ready || currentJobs) return;
    setReloadToggle(true);
  }, [workers, ready, currentJobs, setReloadToggle]);

  let conversionJobsUpdateHandler = useCallback(
    (e: SubscriptionMessage) => {
      if (!workers || !userId) {
        console.warn(
          "Subscription message received when workers/userId is not initialized, ignored",
        );
        return;
      }

      let action = e.routingKey.split(".").pop();
      if (action === "transcodageProgres") {
        let content = e.message as Collection2MediaConversionUpdateMessage;
        let update = {
          job_id: content.job_id,
          fuuid: content.fuuid,
          tuuid: content.tuuid,
        } as ConversionJobUpdate;
        if (typeof content.pctProgres === "number")
          update.pct_progres = content.pctProgres;
        if (content.etat === CONST_MEDIA_STATE_DONE)
          update.etat = EtatJobEnum.DONE;
        else if (
          content.etat === CONST_MEDIA_STATE_PROBE ||
          content.etat === CONST_MEDIA_STATE_TRANSCODING
        )
          update.etat = EtatJobEnum.RUNNING;
        else update.etat = EtatJobEnum.ERROR;
        updateConversionJob(update);
      } else {
        console.warn("Unknown message action: ", action);
      }
    },
    [workers, userId, updateConversionJob],
  );

  let conversionJobsUpdateHandlerProxy = useMemo(() => {
    if (!workers || !ready) return null;
    return proxy(conversionJobsUpdateHandler);
  }, [workers, ready, conversionJobsUpdateHandler]);

  useEffect(() => {
    if (!workers || !ready || !userId || !tuuidsToLoad) return;
    let jobs = Object.values(tuuidsToLoad);
    if (jobs.length === 0) return;

    setTuuidsToLoad(null); // Reset, cleanup to avoid loops

    // Capture variables for inner context
    let workersInner = workers,
      userIdInner = userId,
      tuuidsToLoadInner = tuuidsToLoad;
    Promise.resolve()
      .then(async () => {
        // preload using idb
        let remainingTuuid = [] as string[];
        let mappedFiles = [] as FileInfoJobs[];
        for (let tuuid of tuuidsToLoadInner) {
          let item = await loadTuuid(tuuid, userIdInner);
          if (item) {
            let thumbnail = item.thumbnail ? new Blob([item.thumbnail]) : null;
            let file = {
              tuuid,
              name: item.decryptedMetadata?.nom,
              size: item.fileData?.taille,
              thumbnail,
            };
            mappedFiles.push(file);
          } else {
            remainingTuuid.push(tuuid);
          }
        }
        if (mappedFiles.length > 0) {
          setFileInfoConversionJobs(mappedFiles);
        }

        if (remainingTuuid.length > 0) {
          // console.debug("Load file name for tuuids", remainingTuuid);
          let response =
            await workersInner.connection.getFilesByTuuid(remainingTuuid);
          if (response.ok === false) throw new Error(response.err);
          // console.debug("Response", response);
          if (!response.files || !response.keys)
            throw new Error("No files/keys received");
          let files = await workersInner.directory.processDirectoryChunk(
            workersInner.encryption,
            userIdInner,
            response.files,
            response.keys,
          );
          // console.debug("Files", files);
          // Map to update job file names
          let filenamesMappedByTuuid = Object.values(files).map((item) => {
            let thumbnail = item.thumbnail ? new Blob([item.thumbnail]) : null;
            let filename = item.decryptedMetadata?.nom || ""; // Setting '' will prevent multiple attemps to load the same file
            let size = item.fileData?.taille;
            return { tuuid: item.tuuid, name: filename, size, thumbnail };
          });
          // console.debug("Mapped filenames", filenamesMappedByTuuid);
          setFileInfoConversionJobs(filenamesMappedByTuuid);
        }
      })
      .catch((err) => console.error("Error loading tuuids", err));
  }, [
    workers,
    ready,
    tuuidsToLoad,
    userId,
    setFileInfoConversionJobs,
    setTuuidsToLoad,
  ]);

  useEffect(() => {
    if (!workers || !ready || !conversionJobsUpdateHandlerProxy) return;

    // Capturing for inner context
    let workersInner = workers,
      conversionJobsUpdateHandlerProxyInner = conversionJobsUpdateHandlerProxy;

    //TODO Register job listener
    workers.connection
      .collection2SubscribeMediaConversionEvents(
        conversionJobsUpdateHandlerProxy,
      )
      .catch((err) =>
        console.error(
          "Error registering listener for media conversion events",
          err,
        ),
      );

    return () => {
      //TODO Unregister job listener
      workersInner.connection
        .collection2UnsubscribeMediaConversionEvents(
          conversionJobsUpdateHandlerProxyInner,
        )
        .catch((err) =>
          console.error(
            "Error unregistering listener for media conversion events",
            err,
          ),
        );
    };
  }, [
    workers,
    ready,
    setConversionJobs,
    setTuuidsToLoad,
    conversionJobsUpdateHandlerProxy,
  ]);

  useEffect(() => {
    if (!workers || !ready || !reloadToggle) return;
    setReloadToggle(false); // Got triggered, prevent new execution until the proper time
    // console.debug("Reload media list");
    workers.connection
      .collections2GetConversionJobs()
      .then((response) => {
        if (response.ok === false) throw new Error(response.err);
        if (response.jobs) {
          setConversionJobs(response.jobs);
          let tuuids = new Set(response.jobs.map((item) => item.tuuid));
          let tuuidList = Array.from(tuuids);
          setTuuidsToLoad(tuuidList);
        } else setConversionJobs([]);
      })
      .catch((err) => console.error("Error loading conversion jobs", err));
  }, [
    workers,
    ready,
    reloadToggle,
    setReloadToggle,
    setConversionJobs,
    setTuuidsToLoad,
  ]);

  return <></>;
}

export function sortJobs(
  a: ConversionJobStoreItem,
  b: ConversionJobStoreItem,
): number {
  if (a === b) return 0;
  if (a.etat === b.etat) {
    if (a.name === b.name) {
      return a.tuuid.localeCompare(b.tuuid);
    }
    if (!a.name) return 1;
    if (!b.name) return -1;
    if (a.name && b.name) return a.name.localeCompare(b.name);
  }

  // First sort order
  if (!a.etat) return 1;
  if (!b.etat) return -1;
  return a.etat - b.etat;
}

function StateValue(props: { value: EtatJobEnum | null | undefined }) {
  let { value } = props;

  if (!value) return <>'N/A'</>;

  switch (value) {
    case EtatJobEnum.PENDING:
      return <>Pending</>;
    case EtatJobEnum.RUNNING:
      return <>Running</>;
    case EtatJobEnum.PERSISTING:
      return <>Persisting</>;
    case EtatJobEnum.ERROR:
      return <>Error</>;
    case EtatJobEnum.TOO_MANY_RETRIES:
      return <>Too many retries</>;
    case EtatJobEnum.DONE:
      return <>Complete</>;
    default:
      return <>Unknown</>;
  }
}
