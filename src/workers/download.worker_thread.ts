import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { DownloadStateEnum, saveDownloadPart, updateDownloadJobState } from '../collections2/idb/collections2StoreIdb';
import axios from 'axios';

export type DownloadWorkerCallbackType = (fuuid: string, userId: string, position: number, done: boolean)=>Promise<void>;

export class DownloadThreadWorker {
    callback: DownloadWorkerCallbackType | null
    currentJob: DownloadJobType | null

    constructor() {
        this.callback = null;
        this.currentJob = null;
    }

    async setup(callback: DownloadWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string): Promise<boolean> {
        if(this.currentJob?.userId === userId && this.currentJob.fuuid === fuuid) {
            throw new Error('todo')
            // return true;
        }
        return false;
    }

    async addJob(downloadJob: DownloadJobType): Promise<void> {
        if(!!this.currentJob) throw new Error('Busy');
        this.currentJob = downloadJob;
        if(!this.callback) throw new Error('Callback not wired');
        this.processJob().catch(err=>{
            console.error("Error processing download job", err);
        })
    }

    async isBusy(): Promise<boolean> {
        return !!this.currentJob;
    }

    async processJob() {
        let currentJob = this.currentJob;
        let callback = this.callback;

        // Validations
        if(!currentJob) return;  // Nothing to do
        if(!callback) throw new Error('Callback not wired');
        
        let fuuid = currentJob.fuuid;
        let url = currentJob.url;

        let position = 0;
        try {
            // Check stored download parts to find the resume position (if any)
            //TODO

            // Start downloading
            callback(currentJob.fuuid, currentJob.userId, position, false);
            console.debug("Getting URL", url);
            let response = await axios({method: 'GET', url, responseType: 'blob', withCredentials: true});
            console.debug("Response file: ", response);
            let encryptedBlob = response.data as Blob;

            // Save encrypted content to IDB
            await saveDownloadPart(fuuid, 0, encryptedBlob);
            position = encryptedBlob.size;

            // Done downloading - mark state for decryption
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ENCRYPTED, {position});
            await callback(currentJob.fuuid, currentJob.userId, position, true);
        } catch(err) {
            console.error("Download job error: ", err);
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ERROR);
            await callback(currentJob.fuuid, currentJob.userId, position, true);
        } finally {
            this.currentJob = null;
        }
    }

}

var worker = new DownloadThreadWorker();
expose(worker);
