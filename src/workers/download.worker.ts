import { Remote, wrap, proxy } from 'comlink';

import { DownloadThreadWorker, DownloadWorkerCallbackType } from './download.thread';
import { DecryptionWorkerCallbackType, DownloadDecryptionWorker } from './download.decryption';
import { addDownload, DownloadIdbType, DownloadStateEnum, FileVideoData, getDownloadContent, getDownloadJob, getNextDecryptionJob, getNextDownloadJob, removeDownload, restartNextJobInError, updateDownloadJobState } from '../collections2/idb/collections2StoreIdb';
import { createDownloadEntryFromFile, createDownloadEntryFromVideo } from '../collections2/transferUtils';
import { FilehostDirType } from './directory.worker';
import { DownloadStateUpdateSharedType, DownloadStateUpdateType, DownloadTransferProgress, DownloadWorkerType } from '../collections2/transferStore';

export type DownloadStateCallback = (state: DownloadStateUpdateType)=>Promise<void>;

export class AppsDownloadWorker {
    currentUserId: string | null
    downloadWorker: Remote<DownloadThreadWorker> | DownloadThreadWorker | null
    decryptionWorker: Remote<DownloadDecryptionWorker> | DownloadDecryptionWorker | null
    filehost: FilehostDirType | null
    intervalMaintenance: ReturnType<typeof setInterval> | null
    downloadStateCallbackProxy: DownloadWorkerCallbackType
    decryptionStateCallbackProxy: DecryptionWorkerCallbackType
    stateCallback: DownloadStateCallback | null
    downloadStatus: DownloadTransferProgress | null
    decryptionStatus: DownloadTransferProgress | null
    listChanged: boolean
    fuuidsReady: string[] | null    // List of files for which the download just completed
    triggerDebounceTimeout: ReturnType<typeof setTimeout> | null;
    pauseDownloads: boolean
    sharedMode: boolean

    constructor() {
        this.currentUserId = null;
        this.downloadWorker = null;
        this.decryptionWorker = null;
        this.filehost = null;
        this.intervalMaintenance = null;

        let downloadCb = async (uuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) => {
            await this.downloadCallback(uuid, userId, done, position, size);
        }
        this.downloadStateCallbackProxy = proxy(downloadCb);

        let decryptionCb = async (uuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) => {
            await this.decryptionCallback(uuid, userId, done, position, size);
        }
        this.decryptionStateCallbackProxy = proxy(decryptionCb);

        this.stateCallback = null;
        this.downloadStatus = null;
        this.decryptionStatus = null;
        this.listChanged = true;
        this.fuuidsReady = null;

        this.triggerDebounceTimeout = null;
        this.pauseDownloads = false;
        this.sharedMode = false;
    }

    async setup(stateCallback: DownloadStateCallback, sharedMode: boolean) {
        this.stateCallback = stateCallback;
        this.sharedMode = sharedMode;

        let spawnSupported = false;
        try {
            spawnSupported = !!Worker;
        } catch(err) {
            console.info("Spawning sub-workers is not supported");
        }

        if(spawnSupported) {
            // Try spawning dedicated sub-workers
            try {
                let downloadThreadWorker = new Worker(new URL('download.worker_thread.ts', import.meta.url));
                this.downloadWorker = wrap(downloadThreadWorker);
                console.info("Spawned download thread subworker");
            } catch(err) {
                // Support using class directly if starting a Dedicated Worker from another worker fails (e.g. on iOS).
                console.warn("Error starting a Dedicated WebWorker, using direct instanciation", err);
            }
            
            try {
                let decryptionWorker = new Worker(new URL('./download.worker_decryption.ts', import.meta.url));
                this.decryptionWorker = wrap(decryptionWorker);
                console.info("Spawned download decryption subworker");
            } catch(err) {
                // Support using class directly if starting a Dedicated Worker from another worker fails (e.g. on iOS).
                console.warn("Error starting a Dedicated WebWorker, using direct instanciation", err);
            }
        }

        if(!this.downloadWorker) {
            let {DownloadThreadWorker}  = await import('./download.thread');
            this.downloadWorker = new DownloadThreadWorker();
        }
        if(!this.decryptionWorker) {
            let {DownloadDecryptionWorker}  = await import('./download.decryption');
            this.decryptionWorker = new DownloadDecryptionWorker({dedicated: true});
        }

        await this.downloadWorker.setup(this.downloadStateCallbackProxy);
        await this.decryptionWorker.setup(this.decryptionStateCallbackProxy);

        if(!this.intervalMaintenance) {
            this.intervalMaintenance = setInterval(()=>this.maintain(), 20_000);
        }
    }

    async downloadCallback(fuuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) {
        // console.debug("Download worker callback fuuid: %s, userId: %s, done: %O, position: %d, size: %d", fuuid, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.downloadStatus = null;
            this.listChanged = true;
            await this.triggerJobs();
        } else {
            let download = {workerType: DownloadWorkerType.DOWNLOAD, fuuid, state: DownloadStateEnum.DOWNLOADING, position, totalSize: size} as DownloadTransferProgress;
            this.downloadStatus = download;
            await this.produceState();
        }
    }

    async decryptionCallback(fuuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) {
        // console.debug("Decryption worker callback fuuid: %s, userId: %s, done: %O, position: %d, size: %d", fuuid, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.decryptionStatus = null;
            this.listChanged = true;
            
            // Add fuuid to list of new files that are ready
            if(this.fuuidsReady) this.fuuidsReady.push(fuuid);
            else this.fuuidsReady = [fuuid];
            
            await this.triggerJobs();
        } else {
            let decryption = {workerType: DownloadWorkerType.DECRYPTION, fuuid, state: DownloadStateEnum.ENCRYPTED, position, totalSize: size} as DownloadTransferProgress;
            this.decryptionStatus = decryption;
            await this.produceState();
        }
    }
    
    /** The filehost connection is maintained by DirectoryWorker. */
    async setFilehost(filehost: FilehostDirType | null) {
        console.info("Setting filehost URL for download: ", filehost?.url);
        this.filehost = filehost;
    }

    async changeUser(userId: string | null) {
        //let previousUserId = this.currentUserId;
        this.currentUserId = userId;

        // if(previousUserId && previousUserId !== userId) {
        //     // Pause downloads from other user
        //     console.debug("Pausing all downloads for user %s", previousUserId);
        // }

        // if(userId) {
        //     // Resume downloads for this user
        //     console.debug("Restarting downloads for user %s", userId);
        // }
    }

    async triggerJobs() {
        if(!this.triggerDebounceTimeout) {
            this.triggerDebounceTimeout = setTimeout(()=>{
                this._triggerJobs();
            }, 300);
        }
    }

    /**
     * Triggers the downloading process.
     * No effect if already running.
     */
    async _triggerJobs() {
        if(this.triggerDebounceTimeout) {
            // Debounce cleanup
            clearTimeout(this.triggerDebounceTimeout);
            this.triggerDebounceTimeout = null;
        }

        if(!this.currentUserId) return;
        let filehost = this.filehost;
        if(!filehost) {
            console.warn("No filehost available for download");
            return;
        }
        let filehostUrl = filehost.url;
        if(!filehostUrl) {
            console.warn("No filehost url");
            return;
        }

        // Downloads
        if(this.downloadWorker) {
            if(!this.pauseDownloads) {
                // console.debug("Trigger job downloadWorker check");
                if(await this.downloadWorker.isBusy() === false) {
                    let job = await getNextDownloadJob(this.currentUserId);
                    // console.debug("Trigger job downloadWorker next", job);
                    if(!job) {
                        // Check if we can resume a download in Error state
                        job = await restartNextJobInError(this.currentUserId);
                    }
                    if(job) {
                        // Generate download url
                        let url = filehostUrl;
                        if(!url.endsWith('/')) url += '/';
                        url += 'files/' + job.fuuid;
                        
                        let downloadJob = {...job, url};
                        //console.debug("Add download job", downloadJob);
                        await this.downloadWorker.addJob(downloadJob);
                    }
                }
            }
        } else {
            console.warn("Download worker not wired");
        }

        // Decryption
        if(this.decryptionWorker) {
            if(await this.decryptionWorker.isBusy() === false) {
                let job = await getNextDecryptionJob(this.currentUserId);
                if(job) {
                    await this.decryptionWorker.decryptContent(job);
                }
            }
        } else {
            console.warn("Download decryption worker not wired");
        }

        // Update state
        await this.produceState();
    }

    async addDownloadFromFile(tuuid: string, userId: string): Promise<Blob | null> {
        if(!this.downloadWorker || !this.decryptionWorker) throw new Error('Dedicated workers not initialized');
        
        // console.debug("addDownloadFromFile tuuid:%s userId:%s", tuuid, userId);
        let entry = await createDownloadEntryFromFile(tuuid, userId);
        // console.debug("New download entry", entry);

        let content = await getDownloadContent(entry.fuuid, userId);
        // console.debug("Existing download content", content);
        if(content) {
            // Download already completed, return the file
            return new Blob([content]);
        }

        // Add to IDB
        await addDownload(entry);

        this.listChanged = true;
        await this.triggerJobs();

        return null;
    }

    async addDownloadFromVideo(tuuid: string, userId: string, video: FileVideoData) {
        let entry = await createDownloadEntryFromVideo(tuuid, userId, video);
        // console.debug("New video download entry", entry);

        // Add to IDB
        await addDownload(entry);
        
        this.listChanged = true;
        await this.triggerJobs();
    }

    async cancelDownload(fuuid: string, userId: string) {
        await removeDownload(fuuid, userId);
        await this.downloadWorker?.cancelJobIf(fuuid, userId);
        await this.decryptionWorker?.cancelJobIf(fuuid, userId);
        await this.triggerJobs();
        await this.triggerListChanged();
    }

    async pauseDownload(fuuid: string, userId: string) {
        let job = await getDownloadJob(userId, fuuid);
        if(!job) throw new Error('Unknown job');

        const CONST_PAUSABLE_STATES = [DownloadStateEnum.INITIAL, DownloadStateEnum.DOWNLOADING];
        if(!CONST_PAUSABLE_STATES.includes(job.state)) throw new Error('Job cannot be paused');

        // Cancel download
        await this.downloadWorker?.cancelJobIf(fuuid, userId);
        await updateDownloadJobState(fuuid, userId, DownloadStateEnum.PAUSED);

        // Chain next download
        await this.triggerJobs();
        await this.triggerListChanged();
    }

    async isPaused() {
        return this.pauseDownloads;
    }

    async pauseDownloading() {
        this.pauseDownloads = true;
        await this.downloadWorker?.pauseJob();
    }

    async resumeDownloading() {
        this.pauseDownloads = false;
        await this.triggerJobs();
    }

    async resumeDownload(fuuid: string, userId: string) {
        let job = await getDownloadJob(userId, fuuid);
        if(!job) throw new Error('Unknown job');

        const CONST_RESUMABLE_STATES = [DownloadStateEnum.PAUSED, DownloadStateEnum.ERROR];
        if(!CONST_RESUMABLE_STATES.includes(job.state)) throw new Error('Job cannot be resumed');

        await updateDownloadJobState(fuuid, userId, DownloadStateEnum.INITIAL);
        await this.triggerJobs();
        await this.triggerListChanged();
    }

    async produceState() {
        if(!this.stateCallback) {
            console.warn("Download state callback not initialized");
            return;
        }

        let stateList = [] as DownloadTransferProgress[];
        if(this.downloadStatus) stateList.push(this.downloadStatus);
        if(this.decryptionStatus) stateList.push(this.decryptionStatus);
        let update = {activeTransfers: stateList} as DownloadStateUpdateType;

        // Reset listChanged
        if(this.listChanged) update.listChanged = true;
        this.listChanged = false;

        if(this.sharedMode) {
            // Additional content for the shared worker
            let sharedContent = {} as DownloadStateUpdateSharedType;
            if(this.fuuidsReady) {
                sharedContent.fuuidsReady = this.fuuidsReady;
                this.fuuidsReady = null;
            }
            update.sharedContent = sharedContent;
        }

        this.stateCallback(update);
    }

    maintain() {
        this.triggerJobs()
            .catch(err=>console.error("Error triggering jobs", err));
    }

    /** Allows any process to use the shared worker to trigger a list reload. */
    async triggerListChanged() {
        this.listChanged = true;
        await this.produceState();
    }

    /** Consume the list of fuuids that are ready to be automatically downloaded. */
    async getFuuidsReady() {
        let fuuidsReady = this.fuuidsReady;
        this.fuuidsReady = null;
        return fuuidsReady;
    }
}

export type DownloadJobType = DownloadIdbType & {
    url: string,
};
