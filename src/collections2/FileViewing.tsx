import { ChangeEvent, Dispatch, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios, { AxiosError } from "axios";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';

import { Formatters } from "millegrilles.reactdeps.typescript";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import useWorkers from "../workers/workers";
import { FileComment, FileImageData, FileVideoData, getCurrentVideoPosition, removeVideoPosition, setVideoPosition, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import { CONST_VIDEO_MAX_RESOLUTION } from "./Settings";
import { VIDEO_RESOLUTIONS } from "./picklistValues";
import VideoConversion from "./VideoConversion";
import { isVideoMimetype } from "./mimetypes";
import ActionButton from "../resources/ActionButton";
import { downloadFile, openFile } from "./transferUtils";


import ProgressBar from "./ProgressBar";

export function DetailFileViewLayout(props: {file: TuuidsIdbStoreRowType | null, thumbnail: Uint8Array | null}) {
    let {file, thumbnail} = props;

    let setLastOpenedFile = useUserBrowsingStore(state=>state.setLastOpenedFile);

    let [selectedVideo, setSelectedVideo] = useState(null as FileVideoData | null);
    let [loadProgress, setLoadProgress] = useState(null as number | null);

    let isMedia = useMemo(()=>{
        if(thumbnail) return true;
        if(!file) return false;
        if(file.fileData?.video || file.fileData?.images) return true;
        let mimetype = file.fileData?.mimetype;
        if(mimetype) return isVideoMimetype(mimetype) || supportsAudioFormat(mimetype);
        return false;
    }, [file, thumbnail]);

    // Set this file as the last opened. Used to highlight the file when going back to containing directory.
    useEffect(()=>setLastOpenedFile(file?.tuuid || null), [file, setLastOpenedFile]);

    if(!isMedia) return <FileViewLayout file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} />;
    return <FileMediaLayout file={file} thumbnail={thumbnail} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} setLoadProgress={setLoadProgress} />;
}

function FileMediaLayout(props: FileViewLayoutProps & {thumbnail: Uint8Array | null, setLoadProgress: Dispatch<number | null>}) {

    let {file, thumbnail, selectedVideo, setSelectedVideo, loadProgress, setLoadProgress} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);

    let [blobUrl, setBlobUrl] = useState('');
    let [fullSizeBlobUrl, setFullSizeBlobUrl] = useState('');
    let [viewConversionScreen, setViewConversionScreen] = useState(false);
    let conversionScreenOpen = useCallback(()=>setViewConversionScreen(true), [setViewConversionScreen]);
    let conversionScreenClose = useCallback(()=>setViewConversionScreen(false), [setViewConversionScreen]);
    let [videoError, setVideoError] = useState(0);

    let isVideoFile = useMemo(()=>{
        if(file?.fileData?.video) return true;
        let mimetype = file?.fileData?.mimetype;
        if(mimetype) return isVideoMimetype(mimetype);
        return false;
    }, [file]);

    // Load blob URL
    useEffect(()=>{
        if(!thumbnail) return;
        let blob = new Blob([thumbnail]);
        let blobUrl = URL.createObjectURL(blob);
        // Introduce delay to allow full size to load first when possible (avoids flickering).
        setTimeout(()=>setBlobUrl(blobUrl), 250);
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
            if(file.fileData?.anime && file.fileData.mimetype?.startsWith('image')) {
                // Animated image (e.g animated gif), download the original
                let fuuids_versions = file.fileData?.fuuids_versions;
                if(fuuids_versions && fuuids_versions.length > 0) {
                    let fuuid = fuuids_versions[0]
                    let secretKey = file.secretKey;
                    let {nonce, format} = file.fileData;

                    if(secretKey && nonce && format) {
                        workers.directory.openFile(fuuid, secretKey, {nonce, format})
                        .then(imageBlob=>{
                            let imageBlobUrl = URL.createObjectURL(imageBlob);
                            setFullSizeBlobUrl(imageBlobUrl);
                        })
                        .catch(err=>console.error("Error loading full size image", err));
                        return;  // Loading original image
                    }
                }
            }

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
        <div className='grid grid-cols-1 md:grid-cols-3 pt-2 px-2'>
            <div className='flex grow col-span-2 pr-4 max-h-screen md:pb-32 px-1'>
                <MediaContentDisplay 
                    file={file} 
                    thumbnailBlobUrl={fullSizeBlobUrl || blobUrl} 
                    selectedVideo={selectedVideo} 
                    loadProgress={loadProgress} 
                    setSelectedVideo={setSelectedVideo} 
                    setLoadProgress={setLoadProgress} 
                    videoError={videoError}
                    setVideoError={setVideoError} />
            </div>
            <div className='px-1 md:px-0 pt-2'>
                {isVideoFile?
                    <button onClick={conversionScreenOpen} 
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                            Convert
                    </button>
                :<></>}
                <FileDetail 
                    file={file} 
                    selectedVideo={selectedVideo} 
                    setSelectedVideo={setSelectedVideo} 
                    loadProgress={loadProgress} 
                    isVideo={isVideoFile}
                    videoError={videoError} />
            </div>
        </div>
    )
}

function MediaContentDisplay(props: FileViewLayoutProps & {thumbnailBlobUrl: string | null, setLoadProgress: Dispatch<number | null>, setVideoError: (code: number)=>void}) {
    let {file, thumbnailBlobUrl, selectedVideo, loadProgress, setSelectedVideo, setLoadProgress, setVideoError} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);

    let {videoFuuid, contactId} = useParams();

    let [playVideo, setPlayVideo] = useState(false);
    let [jwt, setJwt] = useState('');
    let [videoReady, setVideoReady] = useState(false);

    let [isVideoFile, isAudioFile, isPdf] = useMemo(()=>{
        let mimetype = file?.fileData?.mimetype;
        if(file?.fileData?.video) {
            // Check that there is at least 1 available video
            return [Object.keys(file.fileData.video).length > 0, false, false];
        } else if(mimetype) {
            if(mimetype === 'application/pdf') return [false, false, true];
            else if(supportsVideoFormat(mimetype)) return [true, true, false];  // Return true for video and audio
            else if(supportsAudioFormat(mimetype)) return [false, true, false];
        }
        return [false, false, false];
    }, [file]);

    let fuuid = useMemo(()=>{
        let fuuids = file?.fileData?.fuuids_versions;
        let fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
        return fuuid;
    }, [file]);

    let videoCss = useMemo(()=>{
        if(loadProgress && loadProgress < 100) return ' contrast-50';
        return '';
    }, [loadProgress]);

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
                setVideoError(0);  // Reset error
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
        .catch(err=>{
            console.error("Error loading video", err);
            let errAxios = err as AxiosError;
            setPlayVideo(false);
            setLoadProgress(0);
            if(errAxios.status) {
                setVideoError(errAxios.status);
            } else {
                setVideoError(1);
            }
        });
    }, [selectedVideo, jwt, setLoadProgress, setVideoReady, setPlayVideo, setVideoError]);

    if(file && selectedVideo && videoReady) {
        return (
            <VideoPlayer 
                className={videoCss}
                fuuidVideo={selectedVideo.fuuid_video || selectedVideo.fuuid} 
                mimetypeVideo={selectedVideo.mimetype} 
                jwt={jwt} 
                thumbnailBlobUrl={thumbnailBlobUrl} />
        
        )
    }
    if(thumbnailBlobUrl) {
        let className = 'grow object-contain object-center md:object-right ' + videoCss;
        if(isPdf) className = 'grow object-contain bg-slate-100 bg-opacity-70';  // for transparency
        return (
            <img src={thumbnailBlobUrl} onClick={onClickStart} alt='Content of the file'
                className={className} />
        );
    } else if(selectedVideo) {
        return (
            <button onClick={onClickStart} 
                className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                    Play video
            </button>
        );
    } else if(isAudioFile) {
        return <AudioPlayer file={file} />
    } else {
        return <></>;
    }
}

type FileViewLayoutProps = {
    file: TuuidsIdbStoreRowType | null, 
    selectedVideo: FileVideoData | null, 
    setSelectedVideo: Dispatch<FileVideoData | null>, 
    loadProgress: number | null,
    videoError?: number,
};

function FileViewLayout(props: FileViewLayoutProps) {

    let {file, selectedVideo, setSelectedVideo, loadProgress, videoError} = props;

    if(!file) return <></>;

    return (
        <div className='pt-2 grid grid-cols-1 md:grid-cols-2'>
            <FileDetail file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} isVideo={false} videoError={videoError} />
        </div>
    )
}

const CONST_SUPPORTED_OPEN_TYPES = [
    'application/pdf', 'application/json', 'application/x-javascript'
];

function FileDetail(props: FileViewLayoutProps & {file: TuuidsIdbStoreRowType, isVideo: boolean}) {
    let {file, selectedVideo, setSelectedVideo, loadProgress, isVideo, videoError} = props;
    
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);

    const [fileBlob, setFileBlob] = useState(null as string | null);

    let [fuuid, lastPresence, recentVisits] = useMemo(()=>{
        if(!file) return [null, null, null];
        let fuuids = file.fileData?.fuuids_versions;
        let fuuid = null;
        if(fuuids && fuuids[0]) fuuid = fuuids[0];
        
        let visits = file.fileData?.visites;
        let lastPresence = null as number | null;
        let recentVisits = 0;
        let currentDate = Math.floor(new Date().getTime()/1000);
        let weekExpired = currentDate - 7*86_400;
        if(visits) {
            recentVisits = Object.values(visits).filter(item=>item>weekExpired).length;
            let presence = Object.values(visits).reduce((acc, item)=>{
                if(acc < item) return item;
                return acc;
            }, 0);
            if(presence) lastPresence = presence;
        }

        return [fuuid, lastPresence, recentVisits];
    }, [file]);

    let fileSize = useMemo(()=>{
        if(!file) return null;
        // Return the original decrypted file size when available. It may differ from the encrypted file size.
        return file.decryptedMetadata?.originalSize || file.fileData?.taille;
    }, [file]);

    let downloadHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        let tuuid = file.tuuid;
        let content = await workers.download.addDownloadFromFile(tuuid, userId);
        if(content) {
            let filename = file.decryptedMetadata?.nom || `${file.tuuid}.obj`;
            downloadFile(filename, content);
        }
    }, [workers, ready, file, userId]);

    const canOpen = useMemo(()=>{
        const mimetype = (file.fileData?.mimetype || '').toLocaleLowerCase();
        return CONST_SUPPORTED_OPEN_TYPES.includes(mimetype) || mimetype.startsWith('text/') || mimetype.startsWith('image/');
    }, [file]);

    const openFileHandler = useCallback(async () => {
        if(fileBlob) {
            // Reuses the existing URL.
            // This is a workaround for opening a tab on iOS, needs to be done before await (after that the event gets tainted).
            openFile(fileBlob);
            return;
        }
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!canOpen) throw new Error('File cannot be opened');
        // console.debug("Open file: ", file);
        const secretKey = file.secretKey;
        const fileData = file.fileData;
        if(!fileData) throw new Error('File contains no data');
        const {nonce, format} = fileData;
        if(!fuuid || !nonce || !format) throw new Error('Insufficient information to decrypt file');
        if(secretKey && nonce && format) {
            const mimetype = (file.fileData?.mimetype || '').toLocaleLowerCase();
            const fileBlob = await workers.directory.openFile(fuuid, secretKey, {nonce, format}, mimetype);
            const fileBlobUrl = URL.createObjectURL(fileBlob);
            setFileBlob(fileBlobUrl);
            openFile(fileBlobUrl);  // Open in same tab
        }
    }, [workers, ready, file, fuuid, canOpen, fileBlob, setFileBlob]);

    useEffect(()=>{
        if(!fileBlob) return;
        return () => URL.revokeObjectURL(fileBlob);  // Cleanup
    }, [fileBlob, setFileBlob]);

    return (
        <div className='grid grid-cols-6 md:grid-cols-1'>
            {isVideo?
                <>
                    <VideoDuration file={file} />
                    <VideoSelectionDetail file={file} selectedVideo={selectedVideo} setSelectedVideo={setSelectedVideo} loadProgress={loadProgress} videoError={videoError} />
                </>
            :<></>}
            <p className='col-span-6 text-slate-400'>File name</p>
            <p className='col-span-6 break-words'>{file.decryptedMetadata?.nom}</p>
            <p className='col-span-2 text-slate-400'>File size</p>
            <p className='col-span-4' title={fileSize + ' bytes'}><Formatters.FormatteurTaille value={fileSize || undefined} /></p>
            <p className='col-span-2 text-slate-400'>File date</p>
            <p className='col-span-4'><Formatters.FormatterDate value={file.decryptedMetadata?.dateFichier || file.date_creation} /></p>
            <p className='col-span-2 text-slate-400'>Type</p>
            <p className='col-span-4'>{file.fileData?.mimetype}</p>
            <ImageDimensions file={file} />
            <p className='col-span-2 text-slate-400'>Last presence check</p>
            <p className='col-span-4'><Formatters.FormatterDate value={lastPresence || undefined} /></p>
            <p className='col-span-2 text-slate-400'>Number of copies</p>
            <p className='col-span-4'>{recentVisits}</p>
            <p className='col-span-6 text-slate-400'>File unique Id</p>
            <p className='col-span-6 break-words text-sm'>{fuuid}</p>
            <div className='col-span-6'>
                {canOpen?
                    <ActionButton onClick={openFileHandler} disabled={!ready && !fileBlob} revertSuccessTimeout={1}>
                        Open
                    </ActionButton>
                    :
                    <></>
                }
                <ActionButton onClick={downloadHandler} revertSuccessTimeout={3}>
                    Download
                </ActionButton>
            </div>
        </div>
    );
}

function ImageDimensions(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.height || !file?.fileData?.width) return <></>;
    return (
        <>
            <p className='col-span-2 text-slate-400'>Dimension</p>
            <p className='col-span-4'>{file.fileData.width} x {file.fileData.height}</p>
        </>
    )
}

function VideoDuration(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.duration) return <></>;
    return (
        <>
            <p className='col-span-2 text-slate-400'>Duration</p>
            <p className='col-span-4'><Formatters.FormatterDuree value={file.fileData.duration} /></p>
        </>
    )
}

type VideoPlayerProps = {
    thumbnailBlobUrl: string | null, 
    fuuidVideo: string, 
    mimetypeVideo: string, 
    jwt: string | null,
    className?: string | null,
};

function VideoPlayer(props: VideoPlayerProps) {

    let {fuuidVideo, mimetypeVideo, thumbnailBlobUrl, jwt, className} = props;
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
        let classNameProps = className || '';
        if(fullscreen) return `grow object-contain object-center ${classNameProps}`;
        return `grow object-contain object-right ${classNameProps}`;
    }, [fullscreen, className]);

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
    let {file, selectedVideo, setSelectedVideo, loadProgress, videoError} = props;

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
            if(support) {
                let originalSelected = false;
                if(!selectedVideo?.fuuid_video && selectedVideo?.fuuid === fuuid) {
                    originalSelected = true;
                }
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
            <p className='col-span-6 pt-4 text-slate-400'>Selected video resolution</p>
            <ol className="col-span-6 cursor-pointer items-pl-2 max-w-48">
                {elems}
            </ol>
            <p className={'col-span-2 md:col-span-1 text-slate-400 duration-700 transition-all' + progressClassHide}>Loading progress</p>
            <div className={'col-span-4 md:col-span-5 transition-all' + progressClassHide}>
                {videoError?
                    <div className='font-bold text-red-700'>Error HTTP {videoError}</div>
                :
                    <ProgressBar value={loadProgress} />
                }
                
            </div>
        </>
    )
}

type AudioPlayProps = {
    file: TuuidsIdbStoreRowType | null
}

export function AudioPlayer(props: AudioPlayProps) {

    const {file} = props;
    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [audioBlob, setAudioBlob] = useState(null as string | null);

    let [fuuid, fileData] = useMemo(()=>{
        const fileData = file?.fileData;
        if(!fileData) return [null, null];
        const fuuids = fileData.fuuids_versions;
        const fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
        return [fuuid, fileData];
    }, [file]);

    useEffect(()=>{
        if(!workers || !ready) return;
        if(!file || !fuuid || !fileData) return;

        const secretKey = file.secretKey;
        const {nonce, format} = fileData;

        if(secretKey && nonce && format) {
            workers.directory.openFile(fuuid, secretKey, {nonce, format})
            .then(audioBlob=>{
                const audioBlobUrl = URL.createObjectURL(audioBlob);
                setAudioBlob(audioBlobUrl);
            })
            .catch(err=>console.error("Error loading audio file", err));
            return;  // Loading original image
        }
    }, [workers, ready, file, fuuid, fileData])

    // Blob URL cleanup
    useEffect(()=>{
        if(!audioBlob) return;
        return () => {
            URL.revokeObjectURL(audioBlob);
        }
    }, [audioBlob]);

    if(!audioBlob) return <p>Loading ...</p>;

    return (
        <div className='grid grid-cols-1'>
            <p>Audio playback</p>
            <audio controls src={audioBlob} />
        </div>
    );
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

export function supportsAudioFormat(audioType: string): boolean {
    const audio = document.createElement('audio');
    const canPlayType = audio.canPlayType(audioType);
    return ['probably', 'maybe'].includes(canPlayType);
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

type FileAddProps = {file: TuuidsIdbStoreRowType | null, refreshTrigger: ()=>Promise<void>};

function AddComment(props: FileAddProps) {

    const {file, refreshTrigger} = props;

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.workersReady);

    const [comment, setComment] = useState('');
    const commentOnChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>)=>setComment(e.currentTarget.value), [setComment]);

    const addHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not intialized');
        if(!file?.secretKey) throw new Error('File key not ready');
        if(!comment) throw new Error('No comment / empty comment provided');
        const encryptedComment = await workers.encryption.encryptMessageMgs4ToBase64({comment}, file.secretKey);
        const keyId = file.keyId || file.encryptedMetadata?.cle_id;
        if(!keyId) throw new Error('Missing key id, unable to encrypt comment')
        encryptedComment.cle_id = keyId;
        delete encryptedComment.digest;
        delete encryptedComment.cle;
        delete encryptedComment.cleSecrete;
        const response = await workers.connection.collection2AddFileComment(file.tuuid, encryptedComment);
        if(response.ok !== true) throw new Error('Error adding comment: ' + response.err);
        
        // Reset comment
        setComment('');
        if(refreshTrigger) await refreshTrigger()
    }, [workers, ready, file, comment, setComment, refreshTrigger]);

    return (
        <div className='grid grid-cols-12 px-2 pb-4'>
            <textarea value={comment} onChange={commentOnChange} 
                placeholder='Add a comment here.'
                className='text-black rounded-md p-0 h-24 sm:p-1 sm:h-24 col-span-12 w-full col-span-12 md:col-span-11' />
            <ActionButton onClick={addHandler} disabled={!ready || !comment} revertSuccessTimeout={3}
                className='varbtn w-20 md:w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    Add
            </ActionButton>
        </div>
    )
}

type FileCommentsProps = {file: TuuidsIdbStoreRowType | null, deleteHandler: (commentId: MouseEvent<HTMLButtonElement>)=>Promise<void>};

function FileComments(props: FileCommentsProps) {
    const {file, deleteHandler} = props;
    const comments = file?.decryptedComments;

    const ready = useConnectionStore(state=>state.workersReady);

    const sortedComments = useMemo(()=>{
        if(!comments) return null;
        const commentCopy = [...comments];
        commentCopy.sort((a, b)=>b.date - a.date);
        return commentCopy;
    }, [comments]) as FileComment[] | null;

    if(!sortedComments) return <></>;

    const plugins = [remarkGfm, remarkRehype];

    const elems = sortedComments.map((item, idx)=>{
        let contentString = 'N/A';        
        if(item.comment) {
            contentString = (item.user_id?'':'## System generated\n\n') + item.comment;
        } else if(item.tags) {
            contentString = '## Tags\n\n ' + item.tags.join(', ');
        }
        return (
            <div key={item.comment_id} className='grid grid-cols-3 lg:grid-cols-12 mb-4 hover:bg-violet-600/50'>
                <p className='col-span-2 lg:col-span-2 bg-violet-800/50 lg:bg-violet-800/25'>
                    <Formatters.FormatterDate value={item.date} />
                </p>
                <div className='lg:hidden text-right bg-violet-800/50 lg:bg-violet-800/25'>
                    <ActionButton onClick={deleteHandler} disabled={!ready || !deleteHandler} confirm={true} value={item.comment_id} varwidth={10}>
                            X
                    </ActionButton>
                </div>
                <div className='col-span-3 lg:col-span-9 markdown pb-2 lg:pb-1 bg-violet-800/25'>
                    <Markdown remarkPlugins={plugins}>{contentString}</Markdown>
                </div>
                <div className='hidden lg:block'>
                    <ActionButton onClick={deleteHandler} disabled={!ready || !deleteHandler} confirm={true} value={item.comment_id} varwidth={10}>
                            X
                    </ActionButton>
                </div>
            </div>
        )
    });

    return (
        <>
            {elems}
        </>
    );
}

type ViewFileCommentsProps = {
    file: TuuidsIdbStoreRowType | null, 
    thumbnail: Uint8Array | null,
    updateFileHandler: ()=>Promise<void>, 
    deleteCommentHandler: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>
}

export function ViewFileComments(props: ViewFileCommentsProps) {
    const {file, updateFileHandler, deleteCommentHandler, thumbnail} = props;

    const [isVisualMedia, isAudioMedia] = useMemo(()=>{
        if(thumbnail) return [true, false];
        if(!file) return [false, false];
        if(file.fileData?.video || file.fileData?.images) return [true, false];
        const mimetype = file.fileData?.mimetype || '';
        const isVideo = isVideoMimetype(mimetype);
        const isAudio = supportsAudioFormat(mimetype);
        if(mimetype) return [isVideo, isAudio];
        return [false, false];
    }, [file, thumbnail]);

    const cssPadding = useMemo(()=>{
        if(isVisualMedia) return 'md:relative md:-top-8 lg:-top-12 xl:-top-28';
        else if(isAudioMedia) return 'md:relative md:-top-2 lg:-top-4 xl:-top-12';
        return '';
    }, [isVisualMedia, isAudioMedia]);

    return (
        <div className={cssPadding}>
            <h2 className='font-bold text-lg pb-2'>Comments</h2>
            <AddComment file={file} refreshTrigger={updateFileHandler} />
            <FileComments file={file} deleteHandler={deleteCommentHandler} />
        </div>
    );
}
