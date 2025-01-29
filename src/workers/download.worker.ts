import { Remote, wrap, proxy } from 'comlink';

import { DownloadThreadWorker, DownloadWorkerCallbackType } from './download.worker_thread';
import { DecryptionWorkerCallbackType, DownloadDecryptionWorker } from './download.worker_decryption';
import { addDownload, DownloadIdbType, DownloadStateEnum, FileVideoData, getDownloadContent, getNextDecryptionJob, getNextDownloadJob, removeDownload, restartNextJobInError } from '../collections2/idb/collections2StoreIdb';
import { createDownloadEntryFromFile, createDownloadEntryFromVideo } from '../collections2/transferUtils';
import { FilehostDirType } from './directory.worker';
import { DownloadStateUpdateType, TransferProgress, WorkerType } from '../collections2/transferStore';

export type DownloadStateCallback = (state: DownloadStateUpdateType)=>Promise<void>;

export class AppsDownloadWorker {
    currentUserId: string | null
    count: number
    downloadWorker: Remote<DownloadThreadWorker> | null
    decryptionWorker: Remote<DownloadDecryptionWorker> | null
    filehost: FilehostDirType | null
    intervalMaintenance: ReturnType<typeof setInterval> | null
    downloadStateCallbackProxy: DownloadWorkerCallbackType
    decryptionStateCallbackProxy: DecryptionWorkerCallbackType
    stateCallbacks: DownloadStateCallback[]
    downloadStatus: TransferProgress | null
    decryptionStatus: TransferProgress | null

    constructor() {
        this.currentUserId = null;
        this.count = 0;
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

        this.stateCallbacks = [];
        this.downloadStatus = null;
        this.decryptionStatus = null;
    }

    async setup(stateCallback: DownloadStateCallback) {
        this.stateCallbacks.push(stateCallback);
        console.debug("Callback count: ", this.stateCallbacks.length);

        // This is a shared worker. Only create instances if not already done.
        if(!this.downloadWorker) {
            let downloadThreadWorker = new Worker(new URL('./download.worker_thread.ts', import.meta.url));
            this.downloadWorker = wrap(downloadThreadWorker);
            this.downloadWorker.setup(this.downloadStateCallbackProxy);
        }
        if(!this.decryptionWorker) {
            let decryptionWorker = new Worker(new URL('./download.worker_decryption.ts', import.meta.url));
            this.decryptionWorker = wrap(decryptionWorker);
            this.decryptionWorker.setup(this.decryptionStateCallbackProxy);
        }
        if(!this.intervalMaintenance) {
            this.intervalMaintenance = setInterval(()=>this.maintain(), 20_000);
        }
    }

    async unregister(stateCallback: DownloadStateCallback) {
        console.debug("unregister ", stateCallback);
        //TODO
    }

    async downloadCallback(fuuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) {
        console.debug("Download worker callback fuuid: %s, userId: %s, done: %O, position: %d, size: %d", fuuid, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.downloadStatus = null;
            await this.triggerJobs();
        } else {
            let download = {workerType: WorkerType.DOWNLOAD, fuuid, state: DownloadStateEnum.DOWNLOADING, position, totalSize: size} as TransferProgress;
            this.downloadStatus = download;
            await this.produceState();
        }
    }

    async decryptionCallback(fuuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) {
        console.debug("Decryption worker callback fuuid: %s, userId: %s, done: %O, position: %d, size: %d", fuuid, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.decryptionStatus = null;
            await this.triggerJobs();
        } else {
            let decryption = {workerType: WorkerType.DECRYPTION, fuuid, state: DownloadStateEnum.ENCRYPTED, position, totalSize: size} as TransferProgress;
            this.decryptionStatus = decryption;
            await this.produceState();
        }
    }
    
    // async stopWorker() {
    //     let interval = this.intervalMaintenance;
    //     this.intervalMaintenance = null;
    //     if(interval) clearInterval(interval);
    // }

    /** The filehost connection is maintained by DirectoryWorker. */
    async setFilehost(filehost: FilehostDirType | null) {
        console.debug("Setting filehost for download: ", filehost);
        this.filehost = filehost;
    }

    async changeUser(userId: string | null) {
        let previousUserId = this.currentUserId;
        this.currentUserId = userId;

        if(previousUserId && previousUserId !== userId) {
            // Pause downloads from other user
            console.debug("Pausing all downloads for user %s", previousUserId);
        }

        if(userId) {
            // Resume downloads for this user
            console.debug("Restarting downloads for user %s", userId);
        }
    }

    /**
     * Triggers the downloading process.
     * No effect if already running.
     */
    async triggerJobs() {
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
            console.debug("Trigger job downloadWorker check");
            if(await this.downloadWorker.isBusy() === false) {
                let job = await getNextDownloadJob(this.currentUserId);
                console.debug("Trigger job downloadWorker next", job);
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
                    console.debug("Add download job", downloadJob);
                    await this.downloadWorker.addJob(downloadJob);
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

        // Uploads


        // Update state
        await this.produceState();
    }

    async addDownloadFromFile(tuuid: string, userId: string): Promise<Blob | null> {
        let entry = await createDownloadEntryFromFile(tuuid, userId);
        console.debug("New download entry", entry);

        let content = await getDownloadContent(entry.fuuid, userId);
        console.debug("Existing download content", content);
        if(content) {
            // Download already completed, return the file
            return content;
        }

        // Add to IDB
        await addDownload(entry);

        await this.triggerJobs();

        return null;
    }

    async addDownloadFromVideo(tuuid: string, userId: string, video: FileVideoData) {
        let entry = await createDownloadEntryFromVideo(tuuid, userId, video);
        console.debug("New video download entry", entry);

        // Add to IDB
        await addDownload(entry);

        await this.triggerJobs();
    }

    async cancelDownload(fuuid: string, userId: string) {
        await removeDownload(fuuid, userId);
        await this.downloadWorker?.cancelJobIf(fuuid, userId);
        await this.decryptionWorker?.cancelJobIf(fuuid, userId);
        await this.triggerJobs();
    }

    async pauseDownload(fuuid: string, userId: string) {
        throw new Error('todo');
    }

    async resumeDownload(fuuid: string, userId: string) {
        throw new Error('todo');
    }

    async getActiveDownloads() {
        return this.count++;
    }

    async produceState() {
        if(this.stateCallbacks.length === 0) {
            console.warn("Download state callback not initialized");
            return;
        }
        let stateList = [] as TransferProgress[];
        if(this.downloadStatus) stateList.push(this.downloadStatus);
        if(this.decryptionStatus) stateList.push(this.decryptionStatus);
        for (let cb of this.stateCallbacks) {
            cb({activeTransfers: stateList});
        }
    }

    maintain() {
        console.debug("Run maintenance");
        this.triggerJobs()
            .catch(err=>console.error("Error triggering jobs", err));
        this.maintainCallbacks()
            .catch(err=>console.error("Error maintaining callbacks", err));
    }

    // HACK: Remove callbacks that no longer respond
    // TODO: Find way to unregister the callbacks directly, or at least a proper test.
    async maintainCallbacks() {
        // console.debug("Callback check, count %d", this.stateCallbacks.length);
        let list = [] as DownloadStateCallback[];
        for await(let cb of this.stateCallbacks) {
            // console.debug("Callback found");
            await new Promise(async (resolve) => {
                setTimeout(resolve, 100);
                cb({}).then(()=>{
                    list.push(cb);  // Keep
                    resolve(null);
                })
            });
        }
        this.stateCallbacks = list;  // Update liste to keep
        // console.debug("Callback check, count after %d", this.stateCallbacks.length);
    }

}

export type DownloadJobType = DownloadIdbType & {
    url: string,
};
