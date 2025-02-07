import { Outlet } from "react-router-dom";

import HeaderMenu from "./Menu";
import Footer from "../Footer";
import useUserBrowsingStore from "./userBrowsingStore";
import { useEffect } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { getDownloadJob, getDownloadJobs, getUploadJob, getUploadJobs, openDB, updateUploadJobState, UploadStateEnum } from "./idb/collections2StoreIdb";
import { messageStruct } from "millegrilles.cryptography";
import useTransferStore, { DownloadJobStoreType, UploadJobStoreType } from "./transferStore";
import { downloadFile } from "./transferUtils";

function Collections2() {
    return (
        <div className='px-2'>
            <HeaderMenu title='Collections' backLink={true} />
            <main id="main" className='pt-4 pb-2 pl-2 pr-6 w-full'>
                <Outlet />
            </main>
            <Footer />
            <InitializeStore />
            <FilehostManager />
            <TransferStoreSync />
        </div>
    );
}

export default Collections2;

function InitializeStore() {
    let setUserId = useUserBrowsingStore(state=>state.setUserId);

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    useEffect(()=>{
        if(!workers || !ready) return;

        Promise.resolve().then(async ()=>{
            if(!workers) throw new Error("Workers not initialized");
            // Get userId from user certificate.
            let certificate = await workers.connection.getMessageFactoryCertificate();
            let userId = certificate.extensions?.userId;
            if(!userId) throw new Error("UserId missing from connection certificate");
            setUserId(userId);
        })
        .catch(err=>console.error("Error initializing store", err));
    }, [workers, ready, setUserId]);

    useEffect(()=>{
        openDB(true)
            .catch(err=>console.error("Error initializing collections2 IDB", err));
    })

    return <></>;
}

/**
 * Connects and maintains connections to filehosts.
 * @returns 
 */
function FilehostManager() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let filehostAuthenticated = useConnectionStore(state=>state.filehostAuthenticated);
    let setFilehostAuthenticated = useConnectionStore(state=>state.setFilehostAuthenticated);

    // Connect to filehost. This resets on first successful connection to a longer check interval.
    useEffect(()=>{
        if(!workers || !ready) return;

        if(!filehostAuthenticated) {
            // Initial connection attempt
            maintainFilehosts(workers, setFilehostAuthenticated)
                .catch(err=>console.error("Error during filehost initialization", err));
        }

        // Retry every 15 seconds if not authenticated. Reauth every 10 minutes if ok.
        let intervalMillisecs = filehostAuthenticated?600_000:15_000;

        let interval = setInterval(()=>{
            if(!workers) throw new Error('workers not initialized');
            maintainFilehosts(workers, setFilehostAuthenticated)
                .catch(err=>console.error("Error during filehost maintenance", err));
        }, intervalMillisecs);

        return () => {
            clearInterval(interval);
        }
    }, [workers, ready, filehostAuthenticated, setFilehostAuthenticated]);

    return <></>;
}

async function maintainFilehosts(workers: AppWorkers, setFilehostAuthenticated: (authenticated: boolean)=>void) {
    let filehostResponse = await workers.connection.getFilehosts();
    if(!filehostResponse.ok) throw new Error('Error loading filehosts: ' + filehostResponse.err);
    let list = filehostResponse.list;
    try {
        if(list) {
            await workers.directory.setFilehostList(list);
            let localUrl = new URL(window.location.href);
            localUrl.pathname = ''
            await workers.directory.selectFilehost(localUrl.href);

            // Generate an authentication message
            let caPem = (await workers.connection.getMessageFactoryCertificate()).pemMillegrille;
            if(!caPem) throw new Error('CA certificate not available');
            let authMessage = await workers.connection.createRoutedMessage(
                messageStruct.MessageKind.Command, {}, {domaine: 'filehost', action: 'authenticate'});
            authMessage.millegrille = caPem;

            await workers.directory.authenticateFilehost(authMessage);

            setFilehostAuthenticated(true);

            // Transfer selected filehost to transfer workers
            let selectedFilehost = await workers.directory.getSelectedFilehost()
            workers.download.setFilehost(selectedFilehost);
            workers.upload.setFilehost(selectedFilehost);

        } else {
            console.warn("No filehost available on this system");
            setFilehostAuthenticated(false);
        }
    } catch(err) {
        setFilehostAuthenticated(false);
        throw err;
    }
}

/** Maintains the list of transfers. Contents is used in the transfer screen and for the transfer menu. */
function TransferStoreSync() {
    return (
        <>
            <SyncDownloads />
            <SyncUploads />
        </>
    )
}

function SyncDownloads() {

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

function SyncUploads() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let userId = useUserBrowsingStore(state=>state.userId);
    let setUploadJobs = useTransferStore(state=>state.setUploadJobs);
    let uploadJobsDirty = useTransferStore(state=>state.uploadJobsDirty);
    let setUploadJobsDirty = useTransferStore(state=>state.setUploadJobsDirty);

    // let setDownloadTicker = useTransferStore(state=>state.setDownloadTicker);

    useEffect(()=>{
        if(!userId) return;
        if(!uploadJobsDirty) return;
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

    }, [userId, uploadJobsDirty, setUploadJobsDirty]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !uploadJobsDirty) return;  // Nothing to do
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
    }, [workers, ready, uploadJobsDirty, userId]);

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
