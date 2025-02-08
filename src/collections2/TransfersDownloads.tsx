import React, { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";
import useTransferStore, { DownloadJobStoreType, DownloadWorkerType } from "./transferStore";
import { DownloadStateEnum, getDownloadContent, removeUserDownloads } from "./idb/collections2StoreIdb";
import { Formatters } from "millegrilles.reactdeps.typescript";
import useUserBrowsingStore from "./userBrowsingStore";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { downloadFile } from "./transferUtils";

import DownloadIcon from '../resources/icons/download-svgrepo-com.svg';
import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';
import ForwardIcon from '../resources/icons/forward-svgrepo-com.svg';
import PauseIcon from '../resources/icons/pause-svgrepo-com.svg';
import ProgressBar from "./ProgressBar";

function TransfersDownloads() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);

    let completedTransfersPresent = true;

    let [allPaused, setAllPaused] = useState(false);

    let removeCompletedHandler = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('User Id not provided');
        await removeUserDownloads(userId);
        // Signal that the download job content has changed to all tabs.
        await workers.download.triggerListChanged();
    }, [workers, ready, userId]);

    let pauseAllDownloads = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('User Id not provided');
        
        let currentlyPaused = localStorage.getItem(`pauseDownloading_${userId}`) === 'true';
        let pauseStatus = !currentlyPaused;  // Toggle
        setAllPaused(pauseStatus);
        localStorage.setItem(`pauseDownloading_${userId}`, pauseStatus?'true':'false');

        if(pauseStatus) {
            // Stop upload worker
            await workers.download.pauseDownloading();
        } else {
            // Resume uploading with worker
            await workers.download.resumeDownloading();
        }
    }, [workers, ready, userId, setAllPaused]);

    useEffect(()=>{
        if(!workers || !ready || !userId) return;
        let currentlyPaused = localStorage.getItem(`pauseDownloading_${userId}`) === 'true';
        console.debug("Currently paused: ", currentlyPaused);
        setAllPaused(currentlyPaused);
    }, [workers, ready, setAllPaused, userId]);

    return (
        <>
            <section className='fixed top-10'>
                <h1 className='font-bold pb-1'>Downloads</h1>

                <div className='grid grid-cols-8 pb-2 space-x-2'>
                    <DownloadSummary />
                </div>

                <div>
                    <ActionButton onClick={removeCompletedHandler} mainButton={true} disabled={!completedTransfersPresent} revertSuccessTimeout={3}>
                        Remove completed
                    </ActionButton>
                    <ActionButton onClick={pauseAllDownloads} revertSuccessTimeout={3}>
                        {allPaused?<>Resume downloading</>:<>Pause downloading</>}
                    </ActionButton>
                </div>

                <WorkerActivity />
            </section>

            <section className='fixed top-52 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <CompletedTransfers />
                <OngoingTransfers />
            </section>
        </>
    );
}

export default TransfersDownloads;

function DownloadSummary() {

    let downloadSummary = useTransferStore(state=>state.downloadSummary);

    let summaryList = useMemo(()=>{
        let list = [] as JSX.Element[];

        let queued = downloadSummary[DownloadStateEnum.INITIAL] + downloadSummary[DownloadStateEnum.DOWNLOADING] + downloadSummary[DownloadStateEnum.ENCRYPTED];
        if(isNaN(queued)) queued = 0;

        list.push(<React.Fragment key='done'><p>Done</p><p className='text-right pr-1'>{downloadSummary[DownloadStateEnum.DONE]}</p></React.Fragment>);
        list.push(<React.Fragment key='pause'><p>Paused</p><p className='text-right pr-1'>{downloadSummary[DownloadStateEnum.PAUSED]}</p></React.Fragment>);
        list.push(<React.Fragment key='initial'><p>Queued</p><p className='text-right pr-1'>{queued}</p></React.Fragment>);
        list.push(<React.Fragment key='error'><p>Error</p><p className='text-right pr-1'>{downloadSummary[DownloadStateEnum.ERROR]}</p></React.Fragment>);

        return list;
    }, [downloadSummary]);

    return <>{summaryList}</>;
}

function WorkerActivity() {

    let downloadProgress = useTransferStore(state=>state.downloadProgress);

    let [downloadPercent, decryptionPercent] = useMemo(()=>{
        if(!downloadProgress) return [null, null];

        let downloadPercent = null as number | null;
        let decryptionPercent = null as number | null;

        for(let progress of downloadProgress) {
            let percent = null as number | null;
            if(typeof(progress.totalSize) === 'number') {
                percent = Math.floor(progress.position / progress.totalSize * 100);
            }
            if(progress.workerType === DownloadWorkerType.DOWNLOAD) {
                downloadPercent = percent;
            } else if(progress.workerType === DownloadWorkerType.DECRYPTION) {
                decryptionPercent = percent;
            } else {
                throw new Error('Unsupported worker type');
            }
        }
        return [downloadPercent, decryptionPercent];
    }, [downloadProgress]);

    return (
        <>
            <h2>Download processes</h2>

            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                <p>Download</p>
                {typeof(downloadPercent) === 'number'?
                    <div><ProgressBar value={downloadPercent} /></div>
                    :<>None</>
                }
            </div>

            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                <p>Decryption</p>
                {typeof(decryptionPercent) === 'number'?
                    <div><ProgressBar value={decryptionPercent} /></div>
                    :<>None</>
                }
            </div>
        </>
    )
}

const CONST_ONGOING_STATES = [
    DownloadStateEnum.INITIAL,
    DownloadStateEnum.PAUSED,
    DownloadStateEnum.DOWNLOADING,
    DownloadStateEnum.ERROR,
    DownloadStateEnum.ENCRYPTED,
]

function OngoingTransfers() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);
    let downloadJobs = useTransferStore(state=>state.downloadJobs);

    let pauseHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        let fuuid = e.currentTarget.value;
        await workers.download.pauseDownload(fuuid, userId);
    }, [workers, ready, userId]);

    let resumeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        let fuuid = e.currentTarget.value;
        await workers.download.resumeDownload(fuuid, userId);
    }, [workers, ready, userId]);

    let removeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        
        let fuuid = e.currentTarget.value;

        // Stop/cancel the file if it is being processing in the download or decryption workers.
        await workers.download.cancelDownload(fuuid, userId);

        // Remove the job and any download parts from IDB.
        // console.debug("Remove download job for fuuid:%s", fuuid)
        await removeUserDownloads(userId, {fuuid});
        
        // Signal that the download job content has changed to all tabs.
        await workers.download.triggerListChanged();
    }, [workers, ready, userId]);

    let mappedTransfers = useMemo(()=>{
        let jobs = downloadJobs?.filter(item=>CONST_ONGOING_STATES.includes(item.state));
        if(!jobs) return [];

        jobs.sort(sortJobs);
        return jobs.map(item=>(
            <JobRow key={item.fuuid} value={item} onRemove={removeHandler} onPause={pauseHandler} onResume={resumeHandler} />
        ));
    }, [downloadJobs, pauseHandler, removeHandler, resumeHandler]);

    if(mappedTransfers.length === 0) return <></>;

    return (
        <div>
            <h2 className='font-bold pt-4 pb-2'>Transfer queue</h2>
            {mappedTransfers}
        </div>
    );
}

function CompletedTransfers() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);
    let downloadJobs = useTransferStore(state=>state.downloadJobs);

    let downloadHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
        if(!userId) throw new Error('UserId not provided');
        let fuuid = e.currentTarget.value;
        let job = downloadJobs?.filter(item=>item.fuuid===fuuid).pop();
        if(!job) throw new Error('No job matches the file');
        let content = await getDownloadContent(fuuid, userId)
        if(!content) throw new Error(`Download content for ${fuuid} not found`);
        downloadFile(job.filename, content);
    }, [downloadJobs, userId]);

    let removeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        
        let fuuid = e.currentTarget.value;
        // console.debug("Remove download job for fuuid:%s", fuuid)
        await removeUserDownloads(userId, {fuuid});
        
        // Signal that the download job content has changed to all tabs.
        await workers.download.triggerListChanged();
    }, [workers, ready, userId]);

    let mappedTransfers = useMemo(()=>{
        let completedJobs = downloadJobs?.filter(item=>item.state === DownloadStateEnum.DONE);
        if(!completedJobs) return [];

        completedJobs.sort(sortJobs);

        return completedJobs.map(item=>(
            <JobRow key={item.fuuid} value={item} onDownload={downloadHandler} onRemove={removeHandler} />
        ));
    }, [downloadJobs, downloadHandler, removeHandler]);

    if(mappedTransfers.length === 0) return <></>;

    return (
        <div>
            <h2 className='font-bold pt-4 pb-2'>Completed transfers</h2>
            {mappedTransfers}
        </div>
    );
}

type JobRowProps = {
    value: DownloadJobStoreType, 
    onRemove: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onDownload?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onPause?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onResume?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
};

const CONST_RESUME_STATE_CANDIDATES = [DownloadStateEnum.PAUSED, DownloadStateEnum.ERROR];
const CONST_PAUSE_STATE_CANDIDATES = [DownloadStateEnum.INITIAL, DownloadStateEnum.DOWNLOADING];

const CONST_DOWNLOAD_STATE_LABELS = {
    [DownloadStateEnum.INITIAL]: 'Queued',
    [DownloadStateEnum.PAUSED]: 'Paused',
    [DownloadStateEnum.DOWNLOADING]: 'Downloading',
    [DownloadStateEnum.ENCRYPTED]: 'Encrypted',
    [DownloadStateEnum.DONE]: 'Done',
    [DownloadStateEnum.ERROR]: 'Error',
}

function JobRow(props: JobRowProps) {

    let {value, onDownload, onRemove, onPause, onResume} = props;

    let rowBgCss = useMemo(()=>{
        if([DownloadStateEnum.ENCRYPTED, DownloadStateEnum.DOWNLOADING].includes(value.state)) return 'odd:bg-violet-700 even:bg-violet-600';
        if([DownloadStateEnum.ERROR].includes(value.state)) return 'odd:bg-red-700 even:bg-red-600';
        if([DownloadStateEnum.PAUSED].includes(value.state)) return 'odd:bg-yellow-800 even:bg-yellow-700';
        return 'odd:bg-slate-700 even:bg-slate-600';
    }, [value]);

    return (
        <div key={value.fuuid} className={`grid grid-cols-6 ${rowBgCss} odd:bg-opacity-40 even:bg-opacity-40 hover:bg-violet-800 gap-x-1 px-2 py-1`}>
            <Link to={`/apps/collections2/f/${value.tuuid}`} className='col-span-3'>{value.filename}</Link>
            <Formatters.FormatteurTaille value={value.size || undefined} />
            <p>{CONST_DOWNLOAD_STATE_LABELS[value.state]}</p>
            <div>
                {onDownload?
                    <ActionButton onClick={onDownload} value={value.fuuid} varwidth={10} revertSuccessTimeout={3}>
                        <img src={DownloadIcon} alt='Download file' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                {onPause?
                    <ActionButton onClick={onPause} value={value.fuuid} varwidth={10} revertSuccessTimeout={3} disabled={!CONST_PAUSE_STATE_CANDIDATES.includes(value.state)}>
                        <img src={PauseIcon} alt='Pause file download' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                {onResume?
                    <ActionButton onClick={onResume} value={value.fuuid} varwidth={10} revertSuccessTimeout={3} disabled={!CONST_RESUME_STATE_CANDIDATES.includes(value.state)}>
                        <img src={ForwardIcon} alt='Resume file processing' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                <ActionButton onClick={onRemove} value={value.fuuid} varwidth={10}>
                    <img src={TrashIcon} alt='Remove download' className='h-6 pl-1' />
                </ActionButton>
            </div>
        </div>
    )
}

function sortJobs(a: DownloadJobStoreType, b: DownloadJobStoreType) {
    if(a === b) return 0;
    if(a.state === b.state) {
        if(a.processDate === b.processDate) {
            if(a.filename === b.filename) {
                return a.fuuid.localeCompare(b.fuuid);
            }
            return a.filename.localeCompare(b.filename);
        }
        return a.processDate - b.processDate;
    }
    return a.state - b.state;
}