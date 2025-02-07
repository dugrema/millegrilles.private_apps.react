import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import { MouseEvent, useCallback, useMemo } from "react";
import { removeUserUploads, UploadStateEnum } from "./idb/collections2StoreIdb";
import ProgressBar from "./ProgressBar";
import useTransferStore, { UploadJobStoreType, UploadWorkerType } from "./transferStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';
import ForwardIcon from '../resources/icons/forward-svgrepo-com.svg';
import PauseIcon from '../resources/icons/pause-svgrepo-com.svg';

function TransfersUploads() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);

    let completedTransfersPresent = true;

    // let [allPaused, setAllPaused] = useState(false);

    let removeCompletedHandler = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('User Id not provided');
        await removeUserUploads(userId);
        // Signal that the download job content has changed to all tabs.
        await workers.upload.triggerListChanged();
    }, [workers, ready, userId]);

    let pauseAllDownloads = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('User Id not provided');
        throw new Error('Todo');
    }, [workers, ready, userId]);

    return (
        <>
            <section>
                <h2 className='font-bold pt-4 pb-2'>Uploads</h2>

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

export default TransfersUploads;

function WorkerActivity() {

    let uploadProgress = useTransferStore(state=>state.uploadProgress);

    let [uploadPercent, encryptionPercent] = useMemo(()=>{
        if(!uploadProgress) return [null, null];

        let uploadPercent = null as number | null;
        let encryptionPercent = null as number | null;

        for(let progress of uploadProgress) {
            let percent = null as number | null;
            if(typeof(progress.totalSize) === 'number') {
                percent = Math.floor(progress.position / progress.totalSize * 100);
            }
            if(progress.workerType === UploadWorkerType.UPLOAD) {
                uploadPercent = percent;
            } else if(progress.workerType === UploadWorkerType.ENCRYPTION) {
                encryptionPercent = percent;
            } else {
                throw new Error('Unsupported worker type');
            }
        }
        return [uploadPercent, encryptionPercent];
    }, [uploadProgress]);

    return (
        <section>
            <h2>Upload processes</h2>

            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                <p>Encryption</p>
                {typeof(encryptionPercent) === 'number'?
                    <div><ProgressBar value={encryptionPercent} /></div>
                    :<>None</>
                }
            </div>

            <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                <p>Upload</p>
                {typeof(uploadPercent) === 'number'?
                    <div><ProgressBar value={uploadPercent} /></div>
                    :<>None</>
                }
            </div>

        </section>
    )
}

const CONST_ONGOING_STATES = [
    UploadStateEnum.INITIAL,
    UploadStateEnum.ENCRYPTING,
    UploadStateEnum.GENERATING,
    UploadStateEnum.SENDCOMMAND,
    UploadStateEnum.READY,
    UploadStateEnum.PAUSED,
    UploadStateEnum.UPLOADING,
    UploadStateEnum.VERIFYING,
    UploadStateEnum.ERROR,
]

function OngoingTransfers() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);
    let uploadJobs = useTransferStore(state=>state.uploadJobs);

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
        
        let uploadIdString = e.currentTarget.value;
        let uploadId = Number.parseInt(uploadIdString);

        // Stop/cancel the file if it is being processing in the download or decryption workers.
        // This also removes the job and any download parts from IDB.
        console.debug("Cancel upload for fuuid:%s", uploadId)
        await workers.upload.cancelUpload(uploadId);
    }, [workers, ready, userId]);

    let mappedTransfers = useMemo(()=>{
        let jobs = uploadJobs?.filter(item=>CONST_ONGOING_STATES.includes(item.state));
        if(!jobs) return [];

        jobs.sort(sortJobs);
        return jobs.map(item=>(
            <JobRow key={item.uploadId} value={item} onRemove={removeHandler} onPause={pauseHandler} onResume={resumeHandler} />
        ));
    }, [uploadJobs, pauseHandler, removeHandler, resumeHandler]);

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
    let uploadJobs = useTransferStore(state=>state.uploadJobs);

    let removeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('UserId not provided');
        
        let uploadIdString = e.currentTarget.value;
        console.debug("Remove download job for uploadId:%s", uploadIdString)
        let uploadId = Number.parseInt(uploadIdString);
        await removeUserUploads(userId, {uploadId});
        
        // Signal that the download job content has changed to all tabs.
        await workers.upload.triggerListChanged();
    }, [workers, ready, userId]);

    let mappedTransfers = useMemo(()=>{
        let completedJobs = uploadJobs?.filter(item=>item.state === UploadStateEnum.DONE);
        if(!completedJobs) return [];

        completedJobs.sort(sortJobs);

        return completedJobs.map(item=>(
            <JobRow key={item.uploadId} value={item} onRemove={removeHandler} />
        ));
    }, [uploadJobs, removeHandler]);

    if(mappedTransfers.length === 0) return <></>;

    return (
        <section>
            <h2 className='font-bold pt-4 pb-2'>Completed transfers</h2>
            {mappedTransfers}
        </section>
    );
}

type JobRowProps = {
    value: UploadJobStoreType, 
    onRemove: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onPause?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
    onResume?: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>,
};

const CONST_RESUME_STATE_CANDIDATES = [UploadStateEnum.PAUSED, UploadStateEnum.ERROR];
const CONST_PAUSE_STATE_CANDIDATES = [UploadStateEnum.READY, UploadStateEnum.UPLOADING];

const UPLOAD_STATE_LABEL = {
    [UploadStateEnum.INITIAL]: 'Initial',
    [UploadStateEnum.ENCRYPTING]: 'Encrypting',
    [UploadStateEnum.GENERATING]: 'Generating',
    [UploadStateEnum.SENDCOMMAND]: 'Send add command',
    [UploadStateEnum.READY]: 'Ready',
    [UploadStateEnum.PAUSED]: 'Paused',
    [UploadStateEnum.UPLOADING]: 'Uploading',
    [UploadStateEnum.VERIFYING]: 'Verifying',
    [UploadStateEnum.DONE]: 'Done',
    [UploadStateEnum.ERROR]: 'Error',
};

function JobRow(props: JobRowProps) {

    let {value, onRemove, onPause, onResume} = props;

    let fullpath = useMemo(()=>{
        let filepath = [] as JSX.Element[];
        if(value.destinationPath) {
            filepath.push(<span key='path'>{value.destinationPath}/</span>);
        }
        filepath.push(<span key='filename' className='font-bold'>{value.filename}</span>);
        return filepath;
    }, [value]);

    let disablePauseButton = useMemo(()=>!CONST_PAUSE_STATE_CANDIDATES.includes(value.state), [value]);
    let disableResumeButton = useMemo(()=>!CONST_RESUME_STATE_CANDIDATES.includes(value.state), [value]);

    return (
        <div key={value.uploadId} className='grid grid-cols-6 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 gap-x-1 px-2 py-1'>
            <Link to={`/apps/collections2/b/${value.cuuid}`} className='col-span-3'>{fullpath}</Link>
            <Formatters.FormatteurTaille value={value.clearSize || value.size || undefined} />
            <p>{UPLOAD_STATE_LABEL[value.state]}</p>
            <div>
                {onPause?
                    <ActionButton onClick={onPause} value={''+value.uploadId} varwidth={10} revertSuccessTimeout={3} disabled={disablePauseButton}>
                        <img src={PauseIcon} alt='Pause file download' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                {onResume?
                    <ActionButton onClick={onResume} value={''+value.uploadId} varwidth={10} revertSuccessTimeout={3} disabled={disableResumeButton}>
                        <img src={ForwardIcon} alt='Resume file processing' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                <ActionButton onClick={onRemove} value={''+value.uploadId} varwidth={10}>
                    <img src={TrashIcon} alt='Remove download' className='h-6 pl-1' />
                </ActionButton>
            </div>
        </div>
    )
}

function sortJobs(a: UploadJobStoreType, b: UploadJobStoreType) {
    if(a === b) return 0;
    if(a.state === b.state) {
        if(a.processDate === b.processDate) {
            if(a.filename === b.filename) {
                return a.uploadId - b.uploadId;
            }
            return a.filename.localeCompare(b.filename);
        }
        return a.processDate - b.processDate;
    }
    return a.state - b.state;
}
