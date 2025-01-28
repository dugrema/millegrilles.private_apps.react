import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { DownloadStateEnum } from '../collections2/idb/collections2StoreIdb';

export type DownloadWorkerCallbackType = (fuuid: string, userId: string, position: number, done: boolean)=>void;

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
        if(this.callback) {
            this.callback(downloadJob.fuuid, downloadJob.userId, DownloadStateEnum.INITIAL, true);
        } else {
            console.warn("Download callback not wired");
        }
    }

    async isBusy(): Promise<boolean> {
        return !!this.currentJob;
    }

    async processJob() {

    }

}

var worker = new DownloadThreadWorker();
expose(worker);
