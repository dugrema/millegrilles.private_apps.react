import axios from 'axios';
import { expose, Remote, wrap, proxy } from 'comlink';

import { DownloadThreadWorker, DownloadWorkerCallbackType } from './download.worker_thread';
import { DownloadDecryptionWorker } from './download.worker_decryption';
import { addDownload, DownloadIdbType, FileVideoData, getNextDownloadJob, removeDownload } from '../collections2/idb/collections2StoreIdb';
import { createDownloadEntryFromFile, createDownloadEntryFromVideo } from '../collections2/transferUtils';
import { FilehostDirType } from './directory.worker';

export class AppsDownloadWorker {
    currentUserId: string | null
    count: number
    downloadWorker: Remote<DownloadThreadWorker> | null
    decryptionWorker: Remote<DownloadDecryptionWorker> | null
    filehost: FilehostDirType | null
    intervalMaintenance: ReturnType<typeof setInterval> | null
    downloadStateCallbackProxy: DownloadWorkerCallbackType

    constructor() {
        this.currentUserId = null;
        this.count = 0;
        this.downloadWorker = null;
        this.decryptionWorker = null;
        this.filehost = null;
        this.intervalMaintenance = null;
        this.downloadStateCallbackProxy = proxy(this.downloadCallback);
    }

    async setup() {
        // This is a shared worker. Only create instances if not already done.
        if(!this.downloadWorker) {
            let downloadThreadWorker = new Worker(new URL('./download.worker_thread.ts', import.meta.url));
            this.downloadWorker = wrap(downloadThreadWorker);
            this.downloadWorker.setup(this.downloadStateCallbackProxy);
        }
        if(!this.decryptionWorker) {
            let decryptionWorker = new Worker(new URL('./download.worker_decryption.ts', import.meta.url));
            this.decryptionWorker = wrap(decryptionWorker);
        }
        if(!this.intervalMaintenance) {
            this.intervalMaintenance = setInterval(()=>this.maintain(), 20_000);
        }
    }

    async downloadCallback(fuuid: string, userId: string, position: number, done: boolean) {
        console.debug("Download worker callback fuuid: %s, userId: %s, position: %d, done: %O", fuuid, userId, position, done);
        if(done) {
            // Start next download job (if any).
            await this.triggerJobs();
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
        if(this.downloadWorker && await this.downloadWorker.isBusy() === false) {
            let job = await getNextDownloadJob(this.currentUserId);
            if(job) {
                // Generate download url
                let url = filehostUrl;
                if(!url.endsWith('/')) url += '/';
                url += 'files/' + job.fuuid;
                
                let downloadJob = {...job, url};
                console.debug("Add download job", downloadJob);
                await this.downloadWorker.addJob(downloadJob);
            }
        } else {
            console.warn("Download worker not wired");
        }

        // Uploads

    }

    async addDownloadFromFile(tuuid: string, userId: string) {
        let entry = await createDownloadEntryFromFile(tuuid, userId);
        console.debug("New download entry", entry);

        // Add to IDB
        await addDownload(entry);

        await this.triggerJobs();
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

    maintain() {
        console.debug("Run maintenance");
        this.triggerJobs()
            .catch(err=>console.error("Error triggering jobs", err));
    }

}

export type DownloadJobType = DownloadIdbType & {
    url: string,
};

var worker = new AppsDownloadWorker();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
