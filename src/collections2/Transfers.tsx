import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";
import useTransferStore, { DownloadJobStoreType, UploadJobStoreType } from "./transferStore";
import { getDownloadJob, getDownloadJobs, getUploadJob, getUploadJobs, updateUploadJobState, UploadStateEnum } from "./idb/collections2StoreIdb";
import { downloadFile } from "./transferUtils";

function Transfers() {
    return (
        <>
            <h1 className='pt-12 pb-2 text-xl font-bold'>Transfers</h1>
            <Outlet />
        </>
    );
}

export default Transfers;

/**
 * Loads and syncs the download information from the local IDB.
 * Used by AppCollections2 from initial application load.
 * @returns 
 */
export function SyncDownloads() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setDownloadJobs = useTransferStore(state=>state.setDownloadJobs);
    let jobsDirty = useTransferStore(state=>state.downloadJobsDirty);
    let setJobsDirty = useTransferStore(state=>state.setDownloadJobsDirty);

    // let setDownloadTicker = useTransferStore(state=>state.setDownloadTicker);

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

    useEffect(()=>{
        if(!workers || !ready || !userId || !jobsDirty) return;  // Nothing to do
        workers.download.getFuuidsReady()
            .then( async fuuidsReady => {
                if(!fuuidsReady || !userId) return;  // Nothing to do
                for(let fuuid of fuuidsReady) {
                    console.debug("Trigger download of ", fuuid);
                    let job = await getDownloadJob(userId, fuuid);
                    if(job) {
                        downloadFile(job.filename, job.content);
                    } else {
                        console.warn("No job found to download fuuid:%s", fuuid);
                    }
                }
            })
            .catch(err=>console.error("Error getting fuuids to download", err));
    }, [workers, ready, jobsDirty, userId]);

    return <></>;
}

/**
 * Loads and syncs the upload information from the local IDB.
 * Used by AppCollections2 from initial application load.
 * @returns 
 */
export function SyncUploads() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setUploadJobs = useTransferStore(state=>state.setUploadJobs);
    let uploadJobsDirty = useTransferStore(state=>state.uploadJobsDirty);
    let setUploadJobsDirty = useTransferStore(state=>state.setUploadJobsDirty);

    // let setDownloadTicker = useTransferStore(state=>state.setDownloadTicker);

    let [jobsReady, setJobsReady] = useState(true);

    // Throttle updates, max 3/sec.
    useEffect(()=>{
        if(uploadJobsDirty) {
            setJobsReady(false);
            setTimeout(()=>{
                setJobsReady(true);
                setUploadJobsDirty(false);
            }, 350);
        }
    }, [uploadJobsDirty, setUploadJobsDirty]);

    useEffect(()=>{
        if(!userId) return;
        if(!jobsReady) return;
        setUploadJobsDirty(false);  // Avoid loop

        getUploadJobs(userId)
            .then(jobs=>{
                console.debug("Upload jobs", jobs);
                let mappedJobs = jobs.map(item=>{
                    return {
                        uploadId: item.uploadId,
                        processDate: item.processDate,
                        state: item.state,
                        clearSize: item.clearSize,
                        size: item.size,
                        retry: item.retry,
                        filename: item.filename,
                        mimetype: item.mimetype,
                        destinationPath: item.destinationPath,
                        cuuid: item.cuuid,
                    } as UploadJobStoreType;
                });
                setUploadJobs(mappedJobs);
            })
            .catch(err=>console.error("Error loading download jobs", err))

    }, [userId, jobsReady, setUploadJobs, setUploadJobsDirty]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !jobsReady) return;  // Nothing to do
        let {connection, upload} = workers;
        workers.upload.getUploadsSendCommand()
            .then( async uploadIds => {
                console.debug("Uploads send command: %O", uploadIds);
                if(!uploadIds || !userId) return;  // Nothing to do
                for(let uploadId of uploadIds) {
                    console.debug("Trigger send upload command of %d", uploadId);
                    let job = await getUploadJob(uploadId);
                    if(job) {
                        console.debug("Send command for upload job", job);
                        if(job.addCommand && job.keyCommand) {
                            // Send Add File command and set upload to ready.
                            await connection.collection2AddFile(job.addCommand, job.keyCommand);
                            await updateUploadJobState(job.uploadId, UploadStateEnum.READY);
                            await upload.triggerListChanged();
                        } else {
                            console.warn("Error on jobId:%s, no add/key commands present", job.uploadId);
                        }
                    } else {
                        console.warn("No job found to download fuuid:%s", uploadId);
                    }
                }

                // Make sure the worker picks up the new jobs from IDB
                await upload.triggerJobs();
            })
            .catch(err=>console.error("Error getting fuuids to download", err));
    }, [workers, ready, jobsReady, userId]);

    // Pause or resume downloads
    useEffect(()=>{
        if(!workers || !ready || !userId) return;

        let currentlyPaused = localStorage.getItem(`pauseUploading_${userId}`) === 'true';
        console.debug("Currently paused? ", currentlyPaused);

        if(currentlyPaused) {
            // Stop upload worker
            workers.upload.pauseUploading();
        } else {
            // Resume uploading with worker
            workers.upload.resumeUploading();
        }
    }, [workers, ready, userId]);    

    return <></>;
}
