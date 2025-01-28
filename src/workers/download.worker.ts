import { expose } from 'comlink';

export class AppsDownloadWorker {
    count: number

    constructor() {
        this.count = 0;
    }

    async getActiveDownloads() {
        return this.count++;
    }

}

var worker = new AppsDownloadWorker();
// Expose as a shared worker
// @ts-ignore
onconnect = (e) => expose(worker, e.ports[0]);
