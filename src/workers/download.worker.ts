import axios from 'axios';
import { expose, Remote, wrap } from 'comlink';
import { DownloadThreadWorker } from './download.worker_thread';
import { DownloadDecryptionWorker } from './download.worker_decryption';
import { DownloadIdbType } from '../collections2/idb/collections2StoreIdb';
import { createDownloadEntryFromFile } from '../collections2/transferUtils';

export class AppsDownloadWorker {
    currentUserId: string | null
    count: number
    downloadWorker: Remote<DownloadThreadWorker> | null
    decryptionWorker: Remote<DownloadDecryptionWorker> | null

    constructor() {
        this.currentUserId = null;
        this.count = 0;
        this.downloadWorker = null;
        this.decryptionWorker = null;
    }

    async setup() {
        // Wire the workers
        let downloadThreadWorker = new Worker(new URL('./download.worker_thread.ts', import.meta.url));
        this.downloadWorker = wrap(downloadThreadWorker);
        let decryptionWorker = new Worker(new URL('./download.worker_decryption.ts', import.meta.url));
        this.decryptionWorker = wrap(decryptionWorker);
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

    async addDownloadFromFile(tuuid: string, userId: string) {
        let entry = await createDownloadEntryFromFile(tuuid, userId);
        console.debug("New download entry", entry);
    }

    async cancelDownload(fuuid: string, userId: string) {

    }

    async pauseDownload(fuuid: string, userId: string) {

    }

    async resumeDownload(fuuid: string, userId: string) {

    }

    async getActiveDownloads() {
        return this.count++;
    }

}

var worker = new AppsDownloadWorker();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
