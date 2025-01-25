import { ChangeEvent, Dispatch, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { Formatters } from "millegrilles.reactdeps.typescript";

import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import useWorkers from "../workers/workers";
import { FileImageData, FileVideoData, getCurrentVideoPosition, removeVideoPosition, setVideoPosition, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import { CONST_VIDEO_MAX_RESOLUTION } from "./Settings";
import { VIDEO_RESOLUTIONS } from "./picklistValues";
import VideoConversion from "./VideoConversion";
import { isVideoMimetype } from "./mimetypes";

export function DetailFileViewLayout(props: {file: TuuidsIdbStoreRowType | null, thumbnail: Blob | null}) {
    let {file, thumbnail} = props;

    let [selectedVideo, setSelectedVideo] = useState(null as FileVideoData | null);
    let [loadProgress, setLoadProgress] = useState(null as number | null);

    let isMedia = useMemo(()=>{
        if(thumbnail) return true;
        if(!file) return false;
        if(file.fileData?.video || file.fileData?.images) return true;
        let mimetype = file.fileData?.mimetype;
        if(mimetype) return isVideoMimetype(mimetype);
        return false;
    }, [file, thumbnail]);

    if(!isMedia) return <FileViewLayout file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} />;
    return <FileMediaLayout file={file} thumbnail={thumbnail} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} setLoadProgress={setLoadProgress} />;
}

function FileMediaLayout(props: FileViewLayoutProps & {thumbnail: Blob | null, setLoadProgress: Dispatch<number | null>}) {

    let {file, thumbnail, selectedVideo, setSelectedVideo, loadProgress, setLoadProgress} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);

    let [blobUrl, setBlobUrl] = useState('');
    let [fullSizeBlobUrl, setFullSizeBlobUrl] = useState('');
    let [viewConversionScreen, setViewConversionScreen] = useState(false);
    let conversionScreenOpen = useCallback(()=>setViewConversionScreen(true), [setViewConversionScreen]);
    let conversionScreenClose = useCallback(()=>setViewConversionScreen(false), [setViewConversionScreen]);

    let isVideoFile = useMemo(()=>{
        if(file?.fileData?.video) return true;
        let mimetype = file?.fileData?.mimetype;
        if(mimetype) return isVideoMimetype(mimetype);
        return false;
    }, [file]);

    // Load blob URL
    useEffect(()=>{
        if(!thumbnail) return;
        let blobUrl = URL.createObjectURL(thumbnail);
        // Introduce delay to allow full size to load first when possible (avoids flickering).
        setTimeout(()=>setBlobUrl(blobUrl), 500);

        return () => {
            URL.revokeObjectURL(blobUrl);
        }
    }, [setBlobUrl, thumbnail]);

    // Load full size image when applicable
    useEffect(()=>{
        if(!workers || !ready || !file?.secretKey) return;

        // Load the full size image if available
        let images = file?.fileData?.images;
        if(images) {
            // Find image with greatest resolution
            let maxImage = Object.values(images).reduce((acc, item)=>{
                if(!acc?.resolution || acc?.resolution < item.resolution) return item;
                return acc;
            }, null as FileImageData | null);
            if(maxImage) {
                // Download image
                let fuuid = maxImage.hachage;
                let secretKey = file.secretKey;

                if(!maxImage.nonce && maxImage.header) {
                    // Legacy, replace the nonce with header
                    maxImage.nonce = maxImage.header.slice(1);  // Remove the leading 'm' multibase marker
                }

                workers.directory.openFile(fuuid, secretKey, maxImage)
                    .then(imageBlob=>{
                        let imageBlobUrl = URL.createObjectURL(imageBlob);
                        setFullSizeBlobUrl(imageBlobUrl);
                    })
                    .catch(err=>console.error("Error loading full size image", err));
            }
        }
    }, [workers, ready, file, setFullSizeBlobUrl]);
    
    // Cleanup full size blob
    useEffect(()=>{
        if(!fullSizeBlobUrl) return;
        return () => {
            URL.revokeObjectURL(fullSizeBlobUrl);
        }
    }, [fullSizeBlobUrl]);

    if(!file) return <></>;
    if(viewConversionScreen) return <VideoConversion file={file} close={conversionScreenClose} />;

    return (
        <div className='grid grid-cols-3 pt-2'>
            <div className='flex grow col-span-2 pr-4 max-h-screen pb-32'>
                <MediaContentDisplay file={file} thumbnailBlobUrl={fullSizeBlobUrl || blobUrl} selectedVideo={selectedVideo} loadProgress={loadProgress} setSelectedVideo={setSelectedVideo} setLoadProgress={setLoadProgress} />
            </div>
            <div>
                <FileDetail 
                    file={file} 
                    selectedVideo={selectedVideo} 
                    setSelectedVideo={setSelectedVideo} 
                    loadProgress={loadProgress} 
                    isVideo={isVideoFile} />

                {isVideoFile?
                    <button onClick={conversionScreenOpen} 
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                            Convert
                    </button>
                :<></>}
            </div>
        </div>
    )
}

function MediaContentDisplay(props: FileViewLayoutProps & {thumbnailBlobUrl: string | null, setLoadProgress: Dispatch<number | null>}) {
    let {file, thumbnailBlobUrl, selectedVideo, setSelectedVideo, setLoadProgress} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);

    let {videoFuuid, contactId} = useParams();

    let [playVideo, setPlayVideo] = useState(false);
    let [jwt, setJwt] = useState('');
    let [videoReady, setVideoReady] = useState(false);

    let isVideoFile = useMemo(()=>{
        if(file?.fileData?.video) {
            // Check that there is at least 1 available video
            return Object.keys(file.fileData.video).length > 0;
        } else {
            let mimetype = file?.fileData?.mimetype;
            if(mimetype && supportsVideoFormat(mimetype)) return true;
        }
        return false;
    }, [file]);

    let fuuid = useMemo(()=>{
        let fuuids = file?.fileData?.fuuids_versions;
        let fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
        return fuuid;
    }, [file]);

    let onClickStart = useCallback(()=>{
        if(!isVideoFile) return;  // Not a video, nothing to do
        setPlayVideo(true)
    }, [isVideoFile, setPlayVideo]);

    // Select the video
    useEffect(()=>{
        if(!file) return;
        if(!isVideoFile) return;    // Not a video
        if(selectedVideo) return;   // Already selected

        // Select a video
        let videos = file.fileData?.video;
        // console.debug("Videos: ", videos);
        let mimetype = file.fileData?.mimetype;
        if(!videos) {
            if(mimetype && mimetype.startsWith('video')) {
                if(supportsVideoFormat(mimetype)) {
                    // Use original
                    let video = {fuuid: fuuid, mimetype: file.fileData?.mimetype} as FileVideoData;
                    setSelectedVideo(video);
                    return;
                } else {
                    return;
                }
            } else {
                return;
            }
        }

        if(videoFuuid) {
            // A video parameter is present. Try to match.
            // console.debug("VideoFuuid param: ", videoFuuid);
            if(fuuid === videoFuuid) {
                // Original
                let video = {fuuid: fuuid, mimetype: file.fileData?.mimetype} as FileVideoData;
                // console.debug("Selecting original video: ", video);
                setSelectedVideo(video);
                return;
            } else {
                let video = Object.values(videos).filter(item=>item.fuuid_video === videoFuuid).pop();
                if(video) {
                    // Found match
                    // console.debug("Found param video: %O", video);
                    setSelectedVideo(video);
                    return;
                }
            }
        }

        let userMaxResolution = VIDEO_RESOLUTIONS[0].value;  // Max value for default resolutions
        let userMaxResolutionConfig = localStorage.getItem(CONST_VIDEO_MAX_RESOLUTION) as string;
        if(userMaxResolutionConfig) {
            let resolutionInt = Number.parseInt(userMaxResolutionConfig);
            if(resolutionInt) userMaxResolution = resolutionInt;
        }
        // console.debug("User max resolution", userMaxResolution);

        if(fuuid && mimetype) {
            let originalResolution = null as number | null;
            if(file.fileData?.width && file.fileData?.height) {
                originalResolution = Math.min(file.fileData.width, file.fileData.height);
            } else {
                originalResolution = file?.fileData?.width || file?.fileData?.height || null;
            }
            if(originalResolution && originalResolution < userMaxResolution) {
                // Check if the browser supports the format
                if(supportsVideoFormat(mimetype)) {
                    // console.debug("Set original video as default");
                    setSelectedVideo({fuuid, mimetype} as FileVideoData);
                    return;
                }
            }
        }

        let video = Object.values(videos).reduce((previous, item)=>{
            let resolutionPrevious = null as number | null, resolutionCurrent = null as number | null;
            if(previous && previous.width && previous.height) resolutionPrevious = Math.min(previous.width, previous.height);
            if(item && item.width && item.height) resolutionCurrent = Math.min(item.width, item.height);
            if(resolutionPrevious === resolutionCurrent) return previous;
            if(!supportsVideoData(item)) return previous;
            if(!resolutionPrevious) return item;
            if(!resolutionCurrent) return previous;
            if(resolutionCurrent > userMaxResolution) return previous;
            if(resolutionCurrent < resolutionPrevious) return previous;
            return item;
        }, null as FileVideoData | null);
        // console.debug("Selected video: %O", videos);
        setSelectedVideo(video);
    }, [file, isVideoFile, selectedVideo, setSelectedVideo, fuuid, videoFuuid]);

    useEffect(()=>{
        if(!workers || !ready) return;
        if(!playVideo || !file || !selectedVideo) return;
        // console.debug("Start loading video, file: %O, selected: %O", file, selectedVideo);

        // Reset flags
        setVideoReady(false);
        setLoadProgress(0);

        // Get JWT
        let fuuidVideo = selectedVideo.fuuid_video;
        let fuuidRef = null as string | null;
        if(fuuidVideo) {
            fuuidRef = selectedVideo.fuuid;
        } else {
            fuuidVideo = selectedVideo.fuuid;
        }

        workers.connection.getStreamingJwt(fuuidVideo, fuuidRef, contactId)
            .then(response=>{
                // console.debug("JWT response: ", response);
                if(response.ok === false) throw new Error(response.err);
                if(response.jwt_token) {
                    setJwt(response.jwt_token);
                } else {
                    throw new Error('No streaming JWT received in server response');
                }
            })
            .catch(err=>console.error("Error loading JWT", err));
    }, [workers, ready, file, playVideo, selectedVideo, contactId, setJwt, setLoadProgress]);

    useEffect(()=>{
        if(!jwt || !selectedVideo) return;
        // console.debug("Monitor the loading of the video for token %s, selected video: %O", jwt, selectedVideo);

        let fuuidVideo = selectedVideo.fuuid_video || selectedVideo.fuuid;
        let videoSrc = `/streams/${fuuidVideo}?jwt=${jwt}`;
        setLoadProgress(1);

        Promise.resolve().then(async ()=>{
            // console.debug("Check load progress on video ", videoSrc);
            // Put a limit of 60 HEAD query loads (about 5 seconds each)
            for(let loadingCount = 0; loadingCount < 60; loadingCount++) {
                let result = await axios({method: 'HEAD', url: videoSrc, timeout: 20_000});
                // console.debug("Video load result: ", result.status);
                let status = result.status;
                if(status === 200 || status === 206) {
                    // Done
                    setLoadProgress(100);
                    setVideoReady(true);
                    break;
                } else if(status === 204) {
                    // In progress, headers have detail: 'X-File-Size', 'X-File-Position'
                    let position = Number.parseInt(result.headers['x-file-position']);
                    let size = Number.parseInt(result.headers['x-file-size']);
                    let pctProgress = Math.floor(100 * position / size);
                    setLoadProgress(pctProgress);
                } else {
                    // Error, unsupported status
                    throw new Error('HTTP Status ' + status);
                }
            }
        })
        .catch(err=>console.error("Error loading video", err));
    }, [selectedVideo, jwt, setLoadProgress, setVideoReady]);

    if(file && selectedVideo && videoReady) {
        return (
            <VideoPlayer 
                fuuidVideo={selectedVideo.fuuid_video || selectedVideo.fuuid} 
                mimetypeVideo={selectedVideo.mimetype} 
                jwt={jwt} 
                thumbnailBlobUrl={thumbnailBlobUrl} />
        )
    }
    if(thumbnailBlobUrl) {
        // className='grow object-contain bg-slate-100 bg-opacity-70'  // TODO - for transparency
        return (
            <img src={thumbnailBlobUrl} onClick={onClickStart} alt='Content of the file'
                className='grow object-contain object-right' />
        );
    } else {
        return (
            <button onClick={onClickStart} 
                className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                    Play video
            </button>
        );
    }
}

type FileViewLayoutProps = {
    file: TuuidsIdbStoreRowType | null, 
    selectedVideo: FileVideoData | null, 
    setSelectedVideo: Dispatch<FileVideoData | null>, 
    loadProgress: number | null
};

function FileViewLayout(props: FileViewLayoutProps) {

    let {file, selectedVideo, setSelectedVideo, loadProgress} = props;

    if(!file) return <></>;

    return (
        <div className='pt-2'>
            <FileDetail file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} isVideo={false} />
        </div>
    )
}

function FileDetail(props: FileViewLayoutProps & {file: TuuidsIdbStoreRowType, isVideo: boolean}) {
    let {file, selectedVideo, setSelectedVideo, loadProgress, isVideo} = props;
    
    return (
        <div className='grid-cols-1'>
            <p className='text-slate-400'>File name</p>
            <p>{file.decryptedMetadata?.nom}</p>
            <p className='text-slate-400'>File size</p>
            <p><Formatters.FormatteurTaille value={file.fileData?.taille} /></p>
            <p className='text-slate-400'>File date</p>
            <p><Formatters.FormatterDate value={file.decryptedMetadata?.dateFichier || file.date_creation} /></p>
            <p className='text-slate-400'>Type</p>
            <p>{file.fileData?.mimetype}</p>
            <ImageDimensions file={file} />
            {isVideo?
                <>
                    <VideoDuration file={file} />
                    <VideoSelectionDetail file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} />
                </>
            :<></>}
        </div>
    );
}

function ImageDimensions(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.height || !file?.fileData?.width) return <></>;
    return (
        <>
            <p className='text-slate-400'>Dimension</p>
            <p>{file.fileData.width} x {file.fileData.height}</p>
        </>
    )
}

function VideoDuration(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.duration) return <></>;
    return (
        <>
            <p className='text-slate-400'>Duration</p>
            <Formatters.FormatterDuree value={file.fileData.duration} />
        </>
    )
}

function VideoPlayer(props: {thumbnailBlobUrl: string | null, fuuidVideo: string, mimetypeVideo: string, jwt: string | null}) {

    let {fuuidVideo, mimetypeVideo, thumbnailBlobUrl, jwt} = props;
    let {tuuid} = useParams();
    let userId = useUserBrowsingStore(state=>state.userId);
    
    let [fullscreen, setFullscreen] = useState(false);

    let refVideo = useRef(null as HTMLVideoElement | null);

    let [jumpToTimeStamp, setJumpToTimeStamp] = useState(null as number | null);

    let videoSrc = useMemo(()=>{
        if(!fuuidVideo || !jwt) return '';
        return `/streams/${fuuidVideo}?jwt=${jwt}`;
    }, [fuuidVideo, jwt]);

    let onTimeUpdate = useCallback((e: ChangeEvent<HTMLVideoElement>)=>{
        let currentTime = e.target.currentTime
        if(!tuuid || !userId) return;  // Missing information
        setVideoPosition(tuuid, userId, currentTime)
            .catch(err=>console.warn("Error updating video position", err));
    }, [tuuid, userId]);

    let onEnded = useCallback((e: ChangeEvent<HTMLVideoElement>)=>{
        if(!tuuid || !userId) return;  // Missing information
        removeVideoPosition(tuuid, userId)
            .catch(err=>console.warn("Error removing video position", err));
    }, [tuuid, userId]);

    let fullScreenChange = useCallback(()=>{
        // Detect if there is a fullscreen element to know whether we change to or from full screen mode.
        if(document.fullscreenElement) {
            setFullscreen(true);
        } else {
            setFullscreen(false);
        }
    }, [setFullscreen]);

    let videoClassname = useMemo(()=>{
        // In full screen mode, the video goes in the center
        if(fullscreen) return 'grow object-contain object-center';
        return 'grow object-contain object-right';
    }, [fullscreen]);

    useEffect(()=>{
        if(!tuuid || !userId) return;
        getCurrentVideoPosition(tuuid, userId)
            .then(positionRow=>{
                if(positionRow && positionRow.position) {
                    setJumpToTimeStamp(positionRow.position);
                }
            })
            .catch(err=>console.warn("Error getting video position", err));
    }, [tuuid, userId, setJumpToTimeStamp]);

    useEffect(()=>{
        if(!jumpToTimeStamp) return;
        if(refVideo.current && refVideo.current.currentTime !== undefined) {
            refVideo.current.currentTime = jumpToTimeStamp;
        }
    }, [jumpToTimeStamp, refVideo]);

    useEffect(()=>{
        if(!fullScreenChange) return;
        if(!refVideo?.current) return;

        let currenRef = refVideo?.current;
        currenRef.addEventListener('fullscreenchange', fullScreenChange);

        return () => {
            currenRef.removeEventListener('fullscreenchange', fullScreenChange);
        }
    }, [refVideo, fullScreenChange]);

    return (
        <>
            <video ref={refVideo} controls poster={thumbnailBlobUrl || undefined} className={videoClassname} autoPlay 
                onTimeUpdate={onTimeUpdate} onEnded={onEnded}>
                {videoSrc?
                    <source src={videoSrc} type={mimetypeVideo} />
                    :
                    <></>
                }
            </video>
        </>
    )
}

export type FileVideoDataWithItemKey = FileVideoData & {entryKey: string, resolution: number};

export function sortVideoEntries(a: FileVideoDataWithItemKey, b: FileVideoDataWithItemKey): number {
    if(a === b) return 0;
    let resolutionA = a.resolution;
    let resolutionB = b.resolution;
    if(resolutionA === resolutionB) {
        if(a.mimetype === b.mimetype) {
            if(a.codec === b.codec) {
                if(a.quality === b.quality) {
                    if(a.subtitle_stream_idx === b.subtitle_stream_idx) {
                        if(a.audio_stream_idx === b.audio_stream_idx) {
                            return a.fuuid.localeCompare(b.fuuid);
                        }
                        if(typeof(a.audio_stream_idx) !== 'number') return -1;
                        if(typeof(b.audio_stream_idx) !== 'number') return 1;
                        return a.audio_stream_idx - b.audio_stream_idx;
                    }
                    if(typeof(a.subtitle_stream_idx) !== 'number') return -1;
                    if(typeof(b.subtitle_stream_idx) !== 'number') return 1;
                    return a.subtitle_stream_idx - b.subtitle_stream_idx;
                }
                if(!a.quality) return 1;
                if(!b.quality) return -1;
                return a.quality - b.quality;
            }
            if(!a.codec) return 1;
            if(!b.codec) return -1;
            return a.codec.localeCompare(b.codec);
        } else {
            return a.mimetype.localeCompare(b.mimetype);
        }
    };

    if(typeof(resolutionA) !== 'number') return 1;
    if(typeof(resolutionB) !== 'number') return -1;
    return resolutionA - resolutionB;
}

function VideoSelectionDetail(props: FileViewLayoutProps & {file: TuuidsIdbStoreRowType} & {setSelectedVideo: Dispatch<FileVideoData | null>}) {
    let {file, selectedVideo, setSelectedVideo, loadProgress} = props;

    let {contactId} = useParams();

    let fuuid = useMemo(()=>{
        let fuuids = file?.fileData?.fuuids_versions;
        let fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
        return fuuid;
    }, [file]);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement>)=>{
        let value = e.currentTarget.dataset.key;
        let videos = file?.fileData?.video;
        if(value !== 'original' && !videos) throw new Error('No video information to select');
        videos = videos || {};
        // console.debug("Selecting ", value);
        if(value) {
            let video = videos[value];
            if(video) {
                setSelectedVideo(video);
            } else if(fuuid && value === 'original') {
                // Create original entry as FileVideoData
                let originalEntry = {fuuid, mimetype: file?.fileData?.mimetype} as FileVideoData;
                setSelectedVideo(originalEntry);
            } else {
                console.warn("No video matches key ", value);
            }
        } else {
            console.warn("No dataset.key value provided");
        }
    }, [file, fuuid, setSelectedVideo]);

    let elems = useMemo(()=>{
        let video = file?.fileData?.video;
        let mimetype = file?.fileData?.mimetype;
        if(!video && mimetype?.startsWith('video')) {
            video = {};  // Go ahead with empty list - we'll check if the original mimetype is supported later on.
        }

        if(!video) return [<div key='1'></div>];

        let videoItems = Object.keys(video)
        .map(key=>{
            if(!video) throw new Error('video null');
            let videoData = video[key] || {};
            let resolution = videoData.resolution;
            if(!resolution) {
                if(videoData.height && videoData.width) {
                    resolution = Math.min(videoData.height, videoData.width);
                } else {
                    resolution = videoData.height || videoData.width || 0;
                }
            }
            return {entryKey: key, resolution, ...videoData} as FileVideoDataWithItemKey;
        })
        .sort(sortVideoEntries);

        let values = [];
        
        for(let videoItem of videoItems) {
            let selected = videoItem.fuuid_video === selectedVideo?.fuuid_video;

            let streamInfo = '';
            if(typeof(videoItem.audio_stream_idx)==='number') {
                streamInfo += 'A' + videoItem.audio_stream_idx;
            }
            if(typeof(videoItem.subtitle_stream_idx)==='number') {
                streamInfo += 'S' + videoItem.subtitle_stream_idx;
            }

            let url = `/apps/collections2/f/${file?.tuuid}/v/${videoItem.fuuid_video}`;
            if(contactId) {
                url = `/apps/collections2/c/${contactId}/f/${file?.tuuid}/v/${videoItem.fuuid_video}`;
            }

            let mimetype = videoItem.mimetype;
            if(mimetype) {
                let supported = supportsVideoData(videoItem);
                // console.debug("Mimetype %s codec %s supported? %O", mimetype, codec, supported);
                if(!supported) continue;  // Not supported, skip
            }

            values.push((
                <li key={videoItem.fuuid_video} data-key={videoItem.entryKey} onClick={onClickHandler} className={'pl-2 hover:bg-violet-500 ' + (selected?'bg-violet-800 font-bold':'')} >
                    <Link to={url}>
                        {videoItem.resolution}
                        {videoItem.codec?<span className='pl-1'>{videoItem.codec}</span>:<></>}
                        {streamInfo?<span className='pl-2'>{streamInfo}</span>:<></>}
                    </Link>
                </li>
            ));
        }

        // Handle original format, detect if it is supported
        if(fuuid && mimetype) {
            let support = supportsVideoFormat(mimetype);
            //let originalItem = { fuuid, mimetype, height, width, codec, supportMedia };
            // codec, fuuid, fuuid_video: fuuid, width, height, mimetype, quality: 1, original: true
            if(support) {
                let originalSelected = false;
                if(!selectedVideo?.fuuid_video && selectedVideo?.fuuid === fuuid) {
                    originalSelected = true;
                }
                // console.debug("Original video format %s supported (%s), selected: %s ", mimetype, support, originalSelected);
                let url = `/apps/collections2/f/${file?.tuuid}/v/${fuuid}`;
                if(contactId) {
                    url = `/apps/collections2/c/${contactId}/f/${file?.tuuid}/v/${fuuid}`;
                }
                values.push(
                    <li key='original' data-key='original' onClick={onClickHandler} className={'pl-2 hover:bg-violet-500 ' + (originalSelected?'bg-violet-800 font-bold':'')}>
                        <Link to={url}>Original</Link>
                    </li>
                );
            }
        }

        values = values.reverse();

        return values;
    }, [file, fuuid, selectedVideo, contactId, onClickHandler]);

    let progressClassHide = useMemo(()=>{
        if(loadProgress !== null && loadProgress < 100) return '';
        return ' opacity-0';
    }, [loadProgress]);

    if(elems.length === 0) return <></>;

    return (
        <>
            <p className='pt-4 text-slate-400'>Selected video resolution</p>
            <ol className="cursor-pointer items-pl-2 max-w-48">
                {elems}
            </ol>
            <p className={'text-slate-400 duration-700 transition-all' + progressClassHide}>Loading progress</p>
            <p className={'duration-500 transition-all' + progressClassHide}>{loadProgress}%</p>
        </>
    )
}

/**
 * 
 * @param videoType Video type string. Example: 'video/webm; codecs="vp9, vorbis"'
 * @returns One of: 'probably', 'maybe', ''
 */
export function supportsVideoFormat(videoType: string): CanPlayTypeResult {
    // Example: 'video/webm; codecs="vp9, vorbis"'
    const video = document.createElement('video')
    const canPlayType = video.canPlayType(videoType)
    // Returns 'probably', 'maybe', ''
    return canPlayType
}

/**
 * 
 * @param videoType Video type string. Example: 'video/webm; codecs="vp9, vorbis"'
 * @returns One of: 'probably', 'maybe', ''
 */
export function supportsVideoData(video: FileVideoData): CanPlayTypeResult {
    // Example: 'video/webm; codecs="vp9, vorbis"'

    let mimetype = video.mimetype;
    let codec = video.codec;
    let supported = '' as CanPlayTypeResult;

    if(codec === 'hevc') {
        // iOS video codec name for hevc
        codec = 'hvc1';
    }
    
    // Always return true for h264 mp4s (faster, not creating a Video elem).
    if(mimetype === 'video/mp4' && codec === 'h264') return 'probably';
    
    // Check in detail
    if(codec) {
        let videoType = `${mimetype}; codecs="${codec}"`;
        supported = supportsVideoFormat(videoType);
        if(supported !== 'probably') supported = '';
    } else {
        supported = supportsVideoFormat(mimetype);
    }

    return supported;
}
