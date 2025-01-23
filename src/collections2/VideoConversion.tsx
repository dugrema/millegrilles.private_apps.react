import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import ActionButton from "../resources/ActionButton";
import { BITRATES_AUDIO, QUALITY_VIDEO, VIDEO_CODEC, VIDEO_PROFILES, VIDEO_RESOLUTIONS } from "./picklistValues";
import { FileVideoData, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { FileVideoDataWithItemKey, sortVideoEntries } from "./FileViewing";

function VideoConversion(props: {file: TuuidsIdbStoreRowType, close: ()=>void}) {
    
    let {file, close} = props;
    
    return (
        <>
            <h1 className='text-xl font-bold pb-4'>Video conversion</h1>
            <FileDetail file={file} />
            <ConversionForm file={file} close={close} />
            <ConversionList file={file} />
        </>
    );

}

export default VideoConversion;

function FileDetail(props: {file: TuuidsIdbStoreRowType}) {

    let {file} = props;

    return (
        <div className='grid grid-cols-6'>
            <p>File size</p>
            <p className='col-span-5'><Formatters.FormatteurTaille value={file.fileData?.taille} /></p>
            <p>Resolution</p>
            <p className='col-span-5'>{file.fileData?.width} x {file.fileData?.height}</p>
        </div>
    )
}

type AudioStreamItem = {label: string, value: number};
type SubtitleItem = {label: string, value: number};

function ConversionForm(props: {file: TuuidsIdbStoreRowType, close: ()=>void}) {

    let {file, close} = props;

    let convertHandler = useCallback(async ()=>{

    }, []);

    let [videoCodec, setVideoCodec] = useState('');
    let [resolution, setResolution] = useState('');
    let [quality, setQuality] = useState('');
    let [subtitles, setSubtitles] = useState('');
    let [preset, setPreset] = useState('');
    let [audioCodec, setAudioCodec] = useState('');
    let [audioBitrate, setAudioBitrate] = useState('');
    let [audioStream, setAudioStream] = useState('');
    let [fileResolution, setFileResolution] = useState(null as number | null);

    let videoCodecOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setVideoCodec(e.currentTarget.value), [setVideoCodec]);
    let resolutionOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setResolution(e.currentTarget.value), [setResolution]);
    let qualityOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setQuality(e.currentTarget.value), [setQuality]);
    let subtitlesOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setSubtitles(e.currentTarget.value), [setSubtitles]);
    let audioBitrateOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setAudioBitrate(e.currentTarget.value), [setAudioBitrate]);
    let audioStreamOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setAudioStream(e.currentTarget.value), [setAudioStream]);

    let [videoCodecs, videoResolutions, videoQuality, audioBitrates] = useMemo(()=>{
        let videoCodecs = VIDEO_CODEC.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));
        let videoQuality = QUALITY_VIDEO.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));
        let audioBitrates = BITRATES_AUDIO.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));

        // For video resolution, only provide a list if the file resolution is known. Otherwise only original and 270p resolutions are available.
        let videoResolutions = VIDEO_RESOLUTIONS
            .filter(item=>{
                if(item.value < 360) return true; // Resolutions under 360p (e.g. 270p) are always available
                if(!fileResolution) return false;
                return fileResolution >= item.value;
            })
            .map(item=>(<option key={''+item.value} value={''+item.value}>{item.label}</option>));

        return [videoCodecs, videoResolutions, videoQuality, audioBitrates];
    }, [fileResolution]);

    let [audioStreamList, subtitleList] = useMemo(()=>{
        if(!file) return [null];
        console.debug("Load file values", file);
        let fileData = file.fileData;
        let audioStreamList = fileData?.audio?.map((item, idx)=>{
            let value = item.language || item.title || ''+idx;
            return <option key={value} value={''+idx}>{value}</option>
        });
        let subtitleList = fileData?.subtitles?.map((item, idx)=>{
            let value = item.language || item.title || ''+idx;
            return <option key={value} value={''+idx}>{value}</option>
        });
        return [audioStreamList, subtitleList];
    }, [file]);

    useEffect(()=>{
        // Set defaults
        setVideoCodec('h264');
        let height = file.fileData?.height;
        let width = file.fileData?.width;
        let resolution = height || width;
        if(height && width) {resolution = Math.min(height, width);}
        if(resolution) setFileResolution(resolution);
        else setFileResolution(null);
    }, [file, setVideoCodec, setFileResolution]);

    useEffect(()=>{
        if(!videoCodec) return;
        // Put video codec defaults in
        let profile = VIDEO_PROFILES[videoCodec].default;
        if(profile) {
            console.debug("Set defaults for profile %s: %O", videoCodec, profile);
            setQuality(''+profile.qualityVideo);
            setPreset(profile.preset);
            setAudioCodec(profile.codecAudio);
            setAudioBitrate(''+profile.bitrateAudio);
        }
    }, [videoCodec]);

    return (
        <form className='grid grid-cols-2 pt-4 space-y-4'>

            {/* Column 1 - Video */}
            <div className='grid grid-cols-3 pr-4'>
                <h2 className='text-xl font-medium col-span-3 pb-3'>Video</h2>
                <label htmlFor='codecv-select' className='text-slate-400'>Codec</label>
                <select id='codecv-select' value={videoCodec} onChange={videoCodecOnChange}
                    className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                        {videoCodecs}
                </select>
                <label htmlFor='resolution-select' className='text-slate-400'>Resolution</label>
                <select id='resolution-select' value={resolution} onChange={resolutionOnChange}
                    className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                        {videoResolutions}
                        <option>Original</option>
                </select>
                <label htmlFor='quality-select' className='text-slate-400'>Quality</label>
                <select id='quality-select' value={quality} onChange={qualityOnChange}
                    className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                        {videoQuality}
                </select>
                <label htmlFor='subtitles-select' className='text-slate-400'>Subtitles</label>
                {subtitleList?
                    <select id='subtitles-select' value={subtitles} onChange={subtitlesOnChange}
                        className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                            <option value=''>Default</option>
                            {subtitleList}
                    </select>
                :
                    <p className='text-slate-300 col-span-2'>N/A</p>
                }
                <p className='text-slate-400'>Preset</p>
                <p className='col-span-2 text-slate-400'>{preset}</p>
            </div>

            {/* Column 2 - Audio */}
            <div className='grid grid-cols-3 pr-4'>
                <h2 className='text-xl font-medium col-span-3 pb-3'>Audio</h2>
                <p className='text-slate-400'>Codec</p>
                <p className='col-span-2 text-slate-400'>{audioCodec}</p>
                <label htmlFor='bitrate-select' className='text-slate-400'>Bitrate</label>
                <select id='bitrate-select' value={audioBitrate} onChange={audioBitrateOnChange}
                    className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                        {audioBitrates}
                </select>
                <label htmlFor='stream-select' className='text-slate-400'>Stream</label>
                {audioStreamList?
                    <select id='stream-select' value={audioStream} onChange={audioStreamOnChange}
                        className='col-span-2 bg-slate-600 text-slate-300 cursor-pointer rounded-md mb-1'>
                            <option value=''>Default</option>
                            {audioStreamList}
                    </select>
                :
                    <p className='text-slate-300 col-span-2'>N/A</p>
                }
            </div>

            {/* Buttons */}
            <div className='text-center w-full col-span-2 pt-4'>
                <ActionButton onClick={convertHandler} revertSuccessTimeout={3} mainButton={true}>Convert</ActionButton>
                <button onClick={close}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                    Back
                </button>
            </div>

        </form>
    );
}

// function sortConversions(a: FileVideoData, b: FileVideoData): number {
//     if(a === b) return 0;
//     if(a.resolution === b.resolution) {
//         if(a.mimetype === b.mimetype) {
//             if(a.codec === b.codec) {
//                 if(a.quality === b.quality) {
//                     return a.fuuid.localeCompare(b.fuuid);
//                 }
//                 if(!a.quality) return 1;
//                 if(!b.quality) return -1;
//                 return a.quality - b.quality;
//             }
//             if(!a.codec) return 1;
//             if(!b.codec) return -1;
//             return a.codec.localeCompare(b.codec);
//         } else {
//             return a.mimetype.localeCompare(b.mimetype);
//         }
//     }
//     if(!a.resolution) return 1;
//     if(!b.resolution) return -1;
//     return a.resolution - b.resolution;
// }

function ConversionList(props: {file: TuuidsIdbStoreRowType}) {

    let {file} = props;

    let sortedConversions = useMemo(()=>{
        let video = file.fileData?.video;
        if(video) {
            let videoList = Object.values(video).map(item=>{
                let resolution = item.resolution;
                if(!resolution) {
                    let height = item.height, width = item.width;
                    resolution = height || width;
                    if(height && width) resolution = Math.min(height, width);
                }
                return {...item, resolution} as FileVideoDataWithItemKey;
            });

            videoList.sort(sortVideoEntries);
            videoList = videoList.reverse();

            return videoList;
        }
        return null;
    }, [file]);

    let mappedExistingConversions = useMemo(()=>{
        if(!sortedConversions) return null;
        let videoList = sortedConversions.map(item=>{
            return (
                <div className='grid grid-cols-12 px-2 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm'>
                    <p className='col-span-2'>{item.mimetype}</p>
                    <p>{item.codec}</p>
                    <p>{item.quality}</p>
                    <p>{item.width} x {item.height}</p>
                    <p>
                        {typeof(item.audio_stream_idx)==='number'?<span className="pr-1">Audio {item.audio_stream_idx}</span>:<></>}
                        {typeof(item.subtitle_stream_idx)==='number'?<span className="pr-1">Sub {item.subtitle_stream_idx}</span>:<></>}
                    </p>
                    <Formatters.FormatteurTaille value={item.taille_fichier}/>
                </div>
            )
        });
        return videoList;
    }, [sortedConversions]);

    return (
        <>
            <h2 className='text-lg font-medium pt-6'>Conversions</h2>
            <div>
                <div>
                    <p>Resolution</p>
                </div>
                {mappedExistingConversions}
            </div>
        </>
    )
}
