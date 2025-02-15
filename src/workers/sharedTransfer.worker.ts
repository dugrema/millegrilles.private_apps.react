import { Remote } from "comlink";
import { AppsUploadWorker, UploadStateCallback } from "./upload.worker";
import { AppsDownloadWorker, DownloadStateCallback } from "./download.worker";
import { DownloadStateUpdateType, UploadStateUpdateType } from "../collections2/transferStore";

/**
 * Handles routing download/upload status updates to all browser tabs.
 * Also ensures some tasks only get done once.
 */
export class SharedTransferHandler {
    uploadWorkers: Remote<AppsUploadWorker>[]
    downloadWorkers: Remote<AppsDownloadWorker>[]
    uploadCallbacks: UploadStateCallback[]
    downloadCallbacks: DownloadStateCallback[]
    intervalMaintain: ReturnType<typeof setInterval>

    constructor() {
        this.uploadWorkers = [];
        this.downloadWorkers = [];
        this.uploadCallbacks = [];
        this.downloadCallbacks = [];
        this.intervalMaintain = setInterval(()=>this.maintain(), 10_000);
    }

    async addCallbacks(uploadStateCallback: UploadStateCallback, downloadStateCallback: DownloadStateCallback) 
    {
        this.uploadCallbacks.push(uploadStateCallback);
        this.downloadCallbacks.push(downloadStateCallback);
    }

    async uploadStateCallback(state: UploadStateUpdateType) {
        // console.debug("Shared upload state update: ", state);
        for(let cb of this.uploadCallbacks) {
            cb(state);  // Note: no error check or await, this may hang if port is closed. Will be handled in maintenance().
        }
    }

    async downloadStateCallback(state: DownloadStateUpdateType) {
        // console.debug("Shared download state update: ", state);
        for(let cb of this.downloadCallbacks) {
            cb(state);  // Note: no error check or await, this may hang if port is closed. Will be handled in maintenance().
        }
    }

    async maintain() {
        // console.debug("SharedTransferHandler maintenance START");

        let uploadCbPromise = this.downloadCallbacks.map(uploadCb => new Promise(resolve=>{
            // console.debug("Checking download worker");
            let timeout = setTimeout(()=>{
                console.warn("Upload callback check timeout, removing");
                this.uploadCallbacks = this.uploadCallbacks.filter(item=>item !== uploadCb);
                resolve(null);
            }, 1_000);
            uploadCb({}).then(()=>{
                // Ok, port still open
                clearTimeout(timeout);
                resolve(null);
            });
        }));
        await Promise.all(uploadCbPromise);

        let downloadCbPromise = this.downloadCallbacks.map(downloadCb => new Promise(resolve=>{
            // console.debug("Checking download worker");
            let timeout = setTimeout(()=>{
                console.warn("Download callback check timeout, removing");
                this.downloadCallbacks = this.downloadCallbacks.filter(item=>item !== downloadCb);
                resolve(null);
            }, 1_000);
            downloadCb({}).then(()=>{
                // Ok, port still open
                clearTimeout(timeout);
                resolve(null);
            });
        }));
        await Promise.all(downloadCbPromise);

        // console.debug("SharedTransferHandler maintenance DONE");
    }

}
