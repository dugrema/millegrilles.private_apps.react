import {
  ChangeEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import ActionButton from "../resources/ActionButton";
import {
  BITRATES_AUDIO,
  QUALITY_VIDEO,
  VIDEO_CODEC,
  VIDEO_MIMETYPES_BY_CODEC,
  VIDEO_PROFILES,
  VIDEO_RESOLUTIONS,
} from "./picklistValues";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { FileVideoDataWithItemKey, sortVideoEntries } from "./FileViewing";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import {
  Collections2ConvertVideoCommand,
  EtatJobEnum,
} from "../types/connection.types";
import { sortJobs, SyncMediaConversions } from "./MediaConversions";
import useMediaConversionStore, {
  ConversionJobStoreItem,
} from "./mediaConversionStore";

import TrashIcon from "../resources/icons/trash-2-svgrepo-com.svg";
import VideoSubtitles from "./VideoSubtitles";
import { TuuidsIdbStoreRowType } from "./idb/collections2Store.types";

function VideoConversion(props: {
  file: TuuidsIdbStoreRowType;
  close: () => void;
}) {
  let { file, close } = props;

  return (
    <>
      <h1 className="text-xl font-bold pb-4">Video conversion</h1>
      <FileDetail file={file} />
      <Subtitles file={file} />
      <ConversionForm file={file} close={close} />
      <ConversionList file={file} />
      <SyncMediaConversions />
    </>
  );
}

export default VideoConversion;

function FileDetail(props: { file: TuuidsIdbStoreRowType }) {
  let { file } = props;

  return (
    <div className="grid grid-cols-6">
      <p>File size</p>
      <p className="col-span-5">
        <Formatters.FormatteurTaille value={file.fileData?.taille} />
      </p>
      <p>Resolution</p>
      <p className="col-span-5">
        {file.fileData?.width} x {file.fileData?.height}
      </p>
    </div>
  );
}

function Subtitles(props: { file: TuuidsIdbStoreRowType }) {
  return (
    <>
      <h2 className="text-xl font-medium col-span-3 pt-3 pb-3">Subtitles</h2>
      <VideoSubtitles file={props.file} />
    </>
  );
}

function ConversionForm(props: {
  file: TuuidsIdbStoreRowType;
  close: () => void;
}) {
  let { file, close } = props;

  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);
  let setConversionJobs = useMediaConversionStore(
    (state) => state.setConversionJobs,
  );

  let [videoCodec, setVideoCodec] = useState("");
  let [resolution, setResolution] = useState("");
  let [quality, setQuality] = useState("");
  let [subtitles, setSubtitles] = useState("");
  let [preset, setPreset] = useState("");
  let [audioCodec, setAudioCodec] = useState("");
  let [audioBitrate, setAudioBitrate] = useState("");
  let [audioStream, setAudioStream] = useState("");
  let [fileResolution, setFileResolution] = useState(null as number | null);

  let videoCodecOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setVideoCodec(e.currentTarget.value),
    [setVideoCodec],
  );
  let resolutionOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setResolution(e.currentTarget.value),
    [setResolution],
  );
  let qualityOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setQuality(e.currentTarget.value),
    [setQuality],
  );
  let subtitlesOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setSubtitles(e.currentTarget.value),
    [setSubtitles],
  );
  let audioBitrateOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) =>
      setAudioBitrate(e.currentTarget.value),
    [setAudioBitrate],
  );
  let audioStreamOnChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) =>
      setAudioStream(e.currentTarget.value),
    [setAudioStream],
  );

  let convertHandler = useCallback(async () => {
    if (!workers || !ready) throw new Error("workers not initialized");
    if (!file) throw new Error("file not provided");

    let fuuids = file.fileData?.fuuids_versions;
    let fuuid = "";
    if (fuuids && fuuids.length > 0)
      fuuid = fuuids[0]; // Most recent version
    else throw new Error("No fuuid found in file");

    let mimetype = VIDEO_MIMETYPES_BY_CODEC[videoCodec];
    if (!mimetype)
      throw new Error("No mimetype mapping found for codec " + videoCodec);

    let resolutionInt = null,
      qualityInt = null,
      audioBitrateInt = null,
      audioStreamInt = null,
      subtitlesInt = null;
    if (resolution) {
      resolutionInt = Number.parseInt(resolution);
    } else {
      // Original resolution
      let width = file.fileData?.width;
      let height = file.fileData?.height;
      resolutionInt = width || height;
      if (width && height) {
        resolutionInt = Math.min(width, height);
      }
    }
    if (quality) qualityInt = Number.parseInt(quality);
    if (audioBitrate) audioBitrateInt = Number.parseInt(audioBitrate);
    if (audioStream) audioStreamInt = Number.parseInt(audioStream);
    if (subtitles) subtitlesInt = Number.parseInt(subtitles);

    let command = {
      tuuid: file.tuuid,
      fuuid,
      mimetype,
      codecVideo: videoCodec,
      codecAudio: audioCodec,
      resolutionVideo: resolutionInt,
      qualityVideo: qualityInt,
      bitrateVideo: null,
      bitrateAudio: audioBitrateInt,
      preset,
      audio_stream_idx: audioStreamInt,
      subtitle_stream_idx: subtitlesInt,
    } as Collections2ConvertVideoCommand;

    let response = await workers.connection.collections2convertVideo(command);
    // console.debug("Video conversion response", response);
    if (response.ok === false) throw new Error(response.err);
    if (!response.job_id) throw new Error("New job id not received");

    // Add content to list of in progress videos
    let jobId = response.job_id;
    console.debug("Add jobId to list", jobId);

    let params = {
      mimetype,
      codecVideo: videoCodec,
      codecAudio: audioCodec,
      resolutionVideo: resolutionInt,
      qualityVideo: qualityInt,
      bitrateAudio: audioBitrateInt,
      preset,
      audio_stream_idx: audioStreamInt,
      subtitle_stream_idx: subtitlesInt,
    };

    let jobInfo = {
      job_id: jobId,
      tuuid: file.tuuid,
      fuuid: fuuid,
      mimetype,
      etat: EtatJobEnum.PENDING,
      params,
    } as ConversionJobStoreItem;
    setConversionJobs([jobInfo]);
  }, [
    workers,
    ready,
    file,
    videoCodec,
    resolution,
    quality,
    subtitles,
    preset,
    audioCodec,
    audioBitrate,
    audioStream,
    setConversionJobs,
  ]);

  let [videoCodecs, videoResolutions, videoQuality, audioBitrates] =
    useMemo(() => {
      let videoCodecs = VIDEO_CODEC.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ));
      let videoQuality = QUALITY_VIDEO.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ));
      let audioBitrates = BITRATES_AUDIO.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ));

      // For video resolution, only provide a list if the file resolution is known. Otherwise only original and 270p resolutions are available.
      let videoResolutions = VIDEO_RESOLUTIONS.filter((item) => {
        if (item.value < 360) return true; // Resolutions under 360p (e.g. 270p) are always available
        if (!fileResolution) return false;
        return fileResolution >= item.value;
      }).map((item) => (
        <option key={"" + item.value} value={"" + item.value}>
          {item.label}
        </option>
      ));

      return [videoCodecs, videoResolutions, videoQuality, audioBitrates];
    }, [fileResolution]);

  let [audioStreamList, subtitleList] = useMemo(() => {
    if (!file) return [null];
    let fileData = file.fileData;
    let audioStreamList = fileData?.audio?.map((item, idx) => {
      let value = item.language || item.title || "" + idx;
      return (
        <option key={value} value={"" + idx}>
          {value}
        </option>
      );
    });
    let subtitleList = fileData?.subtitles?.map((item, idx) => {
      let value = item.language || item.title || "" + idx;
      return (
        <option key={value} value={"" + idx}>
          {value}
        </option>
      );
    });
    return [audioStreamList, subtitleList];
  }, [file]);

  useEffect(() => {
    // Set defaults
    setVideoCodec("h264");
    let height = file.fileData?.height;
    let width = file.fileData?.width;
    let resolution = height || width;
    if (height && width) {
      resolution = Math.min(height, width);
    }
    if (resolution) setFileResolution(resolution);
    else setFileResolution(null);
  }, [file, setVideoCodec, setFileResolution]);

  useEffect(() => {
    if (!videoCodec) return;
    // Put video codec defaults in
    let profile = VIDEO_PROFILES[videoCodec].default;
    if (profile) {
      setQuality("" + profile.qualityVideo);
      setPreset(profile.preset);
      setAudioCodec(profile.codecAudio);
      setAudioBitrate("" + profile.bitrateAudio);
    }
  }, [videoCodec]);

  return (
    <form className="grid grid-cols-2 pt-4 space-y-4">
      {/* Column 1 - Video */}
      <div className="grid grid-cols-3 pr-4">
        <h2 className="text-xl font-medium col-span-3 pb-3">Video</h2>
        <label htmlFor="codecv-select" className="text-slate-400">
          Codec
        </label>
        <select
          id="codecv-select"
          value={videoCodec}
          onChange={videoCodecOnChange}
          className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
        >
          {videoCodecs}
        </select>
        <label htmlFor="resolution-select" className="text-slate-400">
          Resolution
        </label>
        <select
          id="resolution-select"
          value={resolution}
          onChange={resolutionOnChange}
          className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
        >
          {videoResolutions}
          <option value="">Original</option>
        </select>
        <label htmlFor="quality-select" className="text-slate-400">
          Quality
        </label>
        <select
          id="quality-select"
          value={quality}
          onChange={qualityOnChange}
          className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
        >
          {videoQuality}
        </select>
        <label htmlFor="subtitles-select" className="text-slate-400">
          Subtitles
        </label>
        {subtitleList ? (
          <select
            id="subtitles-select"
            value={subtitles}
            onChange={subtitlesOnChange}
            className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
          >
            <option value="">Default</option>
            {subtitleList}
          </select>
        ) : (
          <p className="text-slate-300 col-span-2">N/A</p>
        )}
        <p className="text-slate-400">Preset</p>
        <p className="col-span-2 text-slate-400">{preset}</p>
      </div>

      {/* Column 2 - Audio */}
      <div className="grid grid-cols-3 pr-4">
        <h2 className="text-xl font-medium col-span-3 pb-3">Audio</h2>
        <p className="text-slate-400">Codec</p>
        <p className="col-span-2 text-slate-400">{audioCodec}</p>
        <label htmlFor="bitrate-select" className="text-slate-400">
          Bitrate
        </label>
        <select
          id="bitrate-select"
          value={audioBitrate}
          onChange={audioBitrateOnChange}
          className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
        >
          {audioBitrates}
        </select>
        <label htmlFor="stream-select" className="text-slate-400">
          Stream
        </label>
        {audioStreamList ? (
          <select
            id="stream-select"
            value={audioStream}
            onChange={audioStreamOnChange}
            className="col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1"
          >
            <option value="">Default</option>
            {audioStreamList}
          </select>
        ) : (
          <p className="text-slate-300 col-span-2">N/A</p>
        )}
      </div>

      {/* Buttons */}
      <div className="text-center w-full col-span-2 pt-4">
        <ActionButton
          onClick={convertHandler}
          disabled={!ready}
          revertSuccessTimeout={3}
          mainButton={true}
        >
          Convert
        </ActionButton>
        <button
          onClick={close}
          className="btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800"
        >
          Back
        </button>
      </div>
    </form>
  );
}

function ConversionList(props: { file: TuuidsIdbStoreRowType }) {
  let { file } = props;

  let workers = useWorkers();
  let ready = useConnectionStore((state) => state.connectionAuthenticated);

  let currentJobs = useMediaConversionStore((state) => state.currentJobs);
  let removeConversionJobs = useMediaConversionStore(
    (state) => state.removeConversionJobs,
  );

  let sortedCurrentJobs = useMemo(() => {
    if (!currentJobs) return null;
    let jobs = Object.values(currentJobs).filter(
      (item) => item.tuuid === file.tuuid,
    );
    jobs.sort(sortJobs);
    jobs = jobs.reverse();
    return jobs;
  }, [file, currentJobs]);

  let removeJobHandler = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      if (!workers || !ready) throw new Error("workers not initialized");
      if (!file) throw new Error("No file information");
      let jobId = e.currentTarget.value;
      console.debug("Remove job id", jobId);
      let tuuid = file.tuuid;
      let fuuids = file.fileData?.fuuids_versions;
      let fuuid = null as string | null;
      if (fuuids && fuuids.length > 0) fuuid = fuuids[0];
      if (!fuuid) throw new Error("no fuuid for file");
      let response = await workers.connection.collections2RemoveConversionJob(
        tuuid,
        fuuid,
        jobId,
      );
      if (response.ok === false) throw new Error(response.err);

      setTimeout(() => removeConversionJobs([jobId]), 500); // Error on cancel, wait 500ms to remove job
    },
    [workers, ready, file, removeConversionJobs],
  );

  let removeVideoHandler = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      if (!workers || !ready) throw new Error("workers not initialized");
      let videoFuuid = e.currentTarget.value;
      console.debug("Remove video fuuid", videoFuuid);
      let response =
        await workers.connection.collections2RemoveVideo(videoFuuid);
      console.debug("Response delete video", response);
      if (response.ok === false) throw new Error(response.err);
    },
    [workers, ready],
  );

  let mappedJobs = useMemo(() => {
    if (!sortedCurrentJobs) return <></>;
    return sortedCurrentJobs.map((item) => {
      let jobState = "Error";
      if (item.etat === EtatJobEnum.PENDING) jobState = "Pending";
      else if (item.etat === EtatJobEnum.RUNNING) jobState = "Running";
      else if (item.etat === EtatJobEnum.DONE) jobState = "Complete";

      let mimetype = "video/mp4",
        codec = "h264",
        quality = "28",
        resolution = 270;
      let params = item.params;
      if (params) {
        if (params.mimetype) mimetype = params.mimetype as string;
        if (params.codecVideo) codec = params.codecVideo as string;
        if (params.qualityVideo) quality = params.qualityVideo as string;
        if (params.resolutionVideo)
          resolution = params.resolutionVideo as number;
      } else {
        // User defaults (already set)
      }

      let pctProgress = null as number | null;
      if (
        item.etat === EtatJobEnum.RUNNING &&
        typeof item.pct_progres === "number"
      ) {
        pctProgress = item.pct_progres;
      }

      return (
        <div
          key={item.job_id}
          className="grid grid-cols-12 px-2 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm"
        >
          <p className="col-span-2">{mimetype}</p>
          <p>{codec}</p>
          <p>{quality}</p>
          <p>{resolution}p</p>
          {pctProgress !== null ? (
            <div className="ml-2 relative col-span-3 w-11/12 mt-1 h-4 text-xs bg-slate-200 rounded-full dark:bg-slate-700">
              {pctProgress <= 30 ? (
                <div className="w-full text-violet-800 text-xs font-medium text-center">
                  {pctProgress} %
                </div>
              ) : (
                <></>
              )}
              <div
                className="absolute top-0 h-4 bg-violet-600 text-xs font-medium text-violet-100 text-center p-0.5 leading-none rounded-full transition-all duration-500"
                style={{ width: pctProgress + "%" }}
              >
                {pctProgress > 30 ? <>{pctProgress} %</> : ""}
              </div>
            </div>
          ) : (
            <p className="col-span-3">{jobState}</p>
          )}
          <div>
            <ActionButton
              onClick={removeJobHandler}
              varwidth={10}
              confirm={true}
              value={item.job_id}
              disabled={!ready}
            >
              <img src={TrashIcon} alt="Remove job" className="w-6 inline" />
            </ActionButton>
          </div>
        </div>
      );
    });
  }, [sortedCurrentJobs, ready, removeJobHandler]);

  let sortedConversions = useMemo(() => {
    let video = file.fileData?.video;
    if (video) {
      let videoList = Object.values(video).map((item) => {
        let resolution = item.resolution;
        if (!resolution) {
          let height = item.height,
            width = item.width;
          resolution = height || width;
          if (height && width) resolution = Math.min(height, width);
        }
        return { ...item, resolution } as FileVideoDataWithItemKey;
      });

      videoList.sort(sortVideoEntries);
      videoList = videoList.reverse();

      return videoList;
    }
    return null;
  }, [file]);

  let mappedExistingConversions = useMemo(() => {
    if (!sortedConversions) return null;
    let videoList = sortedConversions.map((item) => {
      return (
        <div
          key={item.cle_conversion}
          className="grid grid-cols-12 px-2 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm"
        >
          <p className="col-span-2">{item.mimetype}</p>
          <p>{item.codec}</p>
          <p>{item.quality}</p>
          <p>
            {item.width} x {item.height}
          </p>
          <p className="col-span-2">
            {typeof item.audio_stream_idx === "number" ? (
              <span className="pr-1">Audio {item.audio_stream_idx}</span>
            ) : (
              <></>
            )}
            {typeof item.subtitle_stream_idx === "number" ? (
              <span className="pr-1">Sub {item.subtitle_stream_idx}</span>
            ) : (
              <></>
            )}
          </p>
          <Formatters.FormatteurTaille value={item.taille_fichier} />
          <div>
            <ActionButton
              onClick={removeVideoHandler}
              varwidth={10}
              confirm={true}
              value={item.fuuid_video}
              disabled={!ready}
            >
              <img src={TrashIcon} alt="Remove job" className="w-6 inline" />
            </ActionButton>
          </div>
        </div>
      );
    });
    return videoList;
  }, [sortedConversions, ready, removeVideoHandler]);

  return (
    <>
      <h2 className="text-lg font-medium pt-6">Conversions</h2>
      <div>
        <div>
          <p>Resolution</p>
        </div>
        {mappedJobs}
        {mappedExistingConversions}
      </div>
    </>
  );
}
