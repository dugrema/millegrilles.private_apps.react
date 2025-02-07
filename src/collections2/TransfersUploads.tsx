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
            {/* <OngoingTransfers /> */}
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
        await workers.download.triggerListChanged();
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

    return (
        <div key={value.uploadId} className='grid grid-cols-6'>
            <Link to={`/apps/collections2/b/${value.cuuid}`} className='col-span-3'>{fullpath}</Link>
            <Formatters.FormatteurTaille value={value.size || undefined} />
            <div>
                {onPause?
                    <ActionButton onClick={onPause} value={''+value.uploadId} varwidth={10} revertSuccessTimeout={3} disabled={value.state === UploadStateEnum.PAUSED}>
                        <img src={PauseIcon} alt='Pause file download' className='h-6 pl-1' />
                    </ActionButton>
                :<></>}
                {onResume?
                    <ActionButton onClick={onResume} value={''+value.uploadId} varwidth={10} revertSuccessTimeout={3} disabled={!CONST_RESUME_STATE_CANDIDATES.includes(value.state)}>
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
