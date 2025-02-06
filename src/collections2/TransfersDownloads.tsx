import { MouseEvent, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";
import useTransferStore, { DownloadJobStoreType, WorkerType } from "./transferStore";
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

function TransfersDownloads() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);

    let completedTransfersPresent = true;

    // let [allPaused, setAllPaused] = useState(false);

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
        throw new Error('Todo');
    }, [workers, ready, userId]);

    return (
        <>
            <section>
                <h2 className='font-bold pt-4 pb-2'>Downloads</h2>

                <div>
                    <ActionButton onClick={removeCompletedHandler} mainButton={true} disabled={!completedTransfersPresent} revertSuccessTimeout={3}>
                        Remove completed
                    </ActionButton>
                    <ActionButton onClick={pauseAllDownloads} revertSuccessTimeout={3}>
                        Pause all
                    </ActionButton>
                    <Link to={'/apps/collections2/transfers'}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                            Back
                    </Link>
                </div>
            </section>

            <WorkerActivity />
            <CompletedTransfers />
            <OngoingTransfers />
        </>
    );
}

export default TransfersDownloads;

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
            if(progress.workerType === WorkerType.DOWNLOAD) {
                downloadPercent = percent;
            } else if(progress.workerType === WorkerType.DECRYPTION) {
                decryptionPercent = percent;
            } else {
                throw new Error('Unsupported worker type');
            }
        }
        return [downloadPercent, decryptionPercent];
    }, [downloadProgress]);

    return (
        <section>
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
        </section>
    )
}

const CONST_ONGOING_STATES = [
    DownloadStateEnum.INITIAL,
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
        throw new Error('todo');
    }, [workers, ready, userId]);

    let resumeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        throw new Error('todo');
    }, [workers, ready, userId]);

    let removeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        
        let fuuid = e.currentTarget.value;

        // Stop/cancel the file if it is being processing in the download or decryption workers.
        await workers.download.cancelDownload(fuuid, userId);

        // Remove the job and any download parts from IDB.
        console.debug("Remove download job for fuuid:%s", fuuid)
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
        <section>
            <h2 className='font-bold pt-4 pb-2'>Transfer queue</h2>
            {mappedTransfers}
        </section>
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
        console.debug("Remove download job for fuuid:%s", fuuid)
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
        <section>
            <h2 className='font-bold pt-4 pb-2'>Completed transfers</h2>
            {mappedTransfers}
        </section>
    );
}

function ProgressBar(props: {value: number | null}) {

    let {value} = props;

    if(typeof(value) !== 'number') return <></>;

    return (
        <div className="ml-2 relative col-span-3 w-11/12 mt-1 h-4 text-xs bg-slate-200 rounded-full dark:bg-slate-700">
            {value<=30?
                <div className='w-full text-violet-800 text-xs font-medium text-center'>{value} %</div>
                :
                <></>
            }
            <div className="absolute top-0 h-4 bg-violet-600 text-xs font-medium text-violet-100 text-center p-0.5 leading-none rounded-full transition-all duration-500" style={{width: value+'%'}}>
                {value>30?<>{value} %</>:''}
            </div>
        </div>            
    )
}

type JobRowProps = {
    value: DownloadJobStoreType, 
    onRemove: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onDownload?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onPause?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onResume?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
};

const CONST_RESUME_STATE_CANDIDATES = [DownloadStateEnum.PAUSED, DownloadStateEnum.ERROR];

function JobRow(props: JobRowProps) {

    let {value, onDownload, onRemove, onPause, onResume} = props;

    return (
        <div key={value.fuuid} className='grid grid-cols-6'>
            <Link to={`/apps/collections2/f/${value.tuuid}`} className='col-span-3'>{value.filename}</Link>
            <Formatters.FormatteurTaille value={value.size || undefined} />
            <div>
                {onDownload?
                    <ActionButton onClick={onDownload} value={value.fuuid} varwidth={10} revertSuccessTimeout={3}>
                        <img src={DownloadIcon} alt='Download file' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                {onPause?
                    <ActionButton onClick={onPause} value={value.fuuid} varwidth={10} revertSuccessTimeout={3} disabled={value.state === DownloadStateEnum.PAUSED}>
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