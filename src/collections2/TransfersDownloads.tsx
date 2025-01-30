import { MouseEvent, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";
import useTransferStore, { DownloadJobStoreType, WorkerType } from "./transferStore";
import { DownloadStateEnum, removeUserDownloads } from "./idb/collections2StoreIdb";
import { Formatters } from "millegrilles.reactdeps.typescript";
import useUserBrowsingStore from "./userBrowsingStore";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";

function TransfersDownloads() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = useUserBrowsingStore(state=>state.userId);

    let completedTransfersPresent = true;

    let removeCompletedHandler = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!userId) throw new Error('User Id not provided');
        await removeUserDownloads(userId);
        // Signal that the download job content has changed to all tabs.
        await workers.download.triggerListChanged();
    }, [workers, ready, userId]);

    return (
        <>
            <section>
                <h2 className='font-bold pt-4 pb-2'>Downloads</h2>

                <div>
                    <ActionButton onClick={removeCompletedHandler} mainButton={true} disabled={!completedTransfersPresent} revertSuccessTimeout={3}>
                        Remove completed
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
    let downloadJobs = useTransferStore(state=>state.downloadJobs);

    let mappedTransfers = useMemo(()=>{
        
        let jobs = downloadJobs?.filter(item=>CONST_ONGOING_STATES.includes(item.state));
        if(!jobs) return [];

        jobs.sort(sortJobs);
        return jobs.map(item=>{
            return (
                <div key={item.fuuid} className='grid grid-cols-6'>
                    <p className='col-span-3'>{item.filename}</p>
                    <Formatters.FormatteurTaille value={item.size || undefined} />
                </div>
            )
        });
    }, [downloadJobs]);

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

        return completedJobs.map(item=>{
            return (
                <div key={item.fuuid} className='grid grid-cols-6'>
                    <p className='col-span-3'>{item.filename}</p>
                    <Formatters.FormatteurTaille value={item.size || undefined} />
                    <div>
                        <ActionButton onClick={removeHandler} value={item.fuuid}>X</ActionButton>
                    </div>
                </div>
            )
        });
    }, [downloadJobs]);

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