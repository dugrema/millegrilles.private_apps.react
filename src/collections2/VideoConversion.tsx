import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import ActionButton from "../resources/ActionButton";
import { BITRATES_AUDIO, QUALITY_VIDEO, VIDEO_CODEC, VIDEO_RESOLUTIONS } from "./picklistValues";
import { TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";

function VideoConversion(props: {file: TuuidsIdbStoreRowType, close: ()=>void}) {
    
    let {file, close} = props;
    
    return (
        <>
            <h1 className='text-xl font-bold pb-4'>Video conversion</h1>
            <ConversionForm file={file} close={close} />
            <ConversionList />
        </>
    );

}

export default VideoConversion;

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
    let [audioBitrate, setAudioBitrate] = useState('');
    let [audioStream, setAudioStream] = useState('');

    let videoCodecOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setVideoCodec(e.currentTarget.value), [setVideoCodec]);
    let resolutionOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setResolution(e.currentTarget.value), [setResolution]);
    let qualityOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setQuality(e.currentTarget.value), [setQuality]);
    let subtitlesOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setSubtitles(e.currentTarget.value), [setSubtitles]);
    let audioBitrateOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setAudioBitrate(e.currentTarget.value), [setAudioBitrate]);
    let audioStreamOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setAudioStream(e.currentTarget.value), [setAudioStream]);

    let [videoCodecs, videoResolutions, videoQuality, audioBitrates] = useMemo(()=>{
        let videoCodecs = VIDEO_CODEC.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));
        let videoResolutions = VIDEO_RESOLUTIONS.map(item=>(<option key={''+item.value} value={''+item.value}>{item.label}</option>));
        let videoQuality = QUALITY_VIDEO.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));
        let audioBitrates = BITRATES_AUDIO.map(item=>(<option key={item.value} value={item.value}>{item.label}</option>));
        return [videoCodecs, videoResolutions, videoQuality, audioBitrates];
    }, []);

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

    return (
        <form className='grid grid-cols-2 py-4 space-y-4'>

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
                <p className='col-span-2 text-slate-400'>Slow</p>
            </div>

            {/* Column 2 - Audio */}
            <div className='grid grid-cols-3 pr-4'>
                <h2 className='text-xl font-medium col-span-3 pb-3'>Audio</h2>
                <p className='text-slate-400'>Codec</p>
                <p className='col-span-2 text-slate-400'>AAC</p>
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

function ConversionList() {
    return <p>List</p>
}
