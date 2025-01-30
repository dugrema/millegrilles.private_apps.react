import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { getDownloadJobs } from "./idb/collections2StoreIdb";
import useUserBrowsingStore from "./userBrowsingStore";
import useTransferStore, { DownloadJobStoreType } from "./transferStore";

function Transfers() {
    return (
        <>
            <h1 className='pt-12 pb-2 text-xl font-bold'>Transfers</h1>
            <Outlet />
            <SyncDownloads />
        </>
    );
}

export default Transfers;

function SyncDownloads() {
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setDownloadJobs = useTransferStore(state=>state.setDownloadJobs);
    let jobsDirty = useTransferStore(state=>state.jobsDirty);
    let setJobsDirty = useTransferStore(state=>state.setJobsDirty);

    useEffect(()=>{
        if(!userId) return;
        if(!jobsDirty) return;
        setJobsDirty(false);  // Avoid loop

        getDownloadJobs(userId)
            .then(jobs=>{
                console.debug("Download jobs", jobs);
                let mappedJobs = jobs.map(item=>{
                    return {
                        fuuid: item.fuuid,
                        tuuid: item.tuuid,
                        processDate: item.processDate,
                        state: item.state,
                        size: item.size,
                        retry: item.retry,
                        filename: item.filename,
                        mimetype: item.mimetype,
                    } as DownloadJobStoreType;
                });
                setDownloadJobs(mappedJobs);
            })
            .catch(err=>console.error("Error loading download jobs", err))
    }, [userId, setDownloadJobs, jobsDirty, setJobsDirty]);

    return <></>;
}