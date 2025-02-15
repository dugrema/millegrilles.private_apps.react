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
    uploadsSendCommand: number[] | null     // List of uploads that need the connectionWorker to send the add file command.
    fuuidsReady: string[] | null            // List of files for which the download just completed

    constructor() {
        this.uploadWorkers = [];
        this.downloadWorkers = [];
        this.uploadCallbacks = [];
        this.downloadCallbacks = [];
        this.intervalMaintain = setInterval(()=>this.maintain(), 10_000);
        this.uploadsSendCommand = null;
        this.fuuidsReady = null;
    }

    async addCallbacks(uploadStateCallback: UploadStateCallback, downloadStateCallback: DownloadStateCallback) 
    {
        this.uploadCallbacks.push(uploadStateCallback);
        this.downloadCallbacks.push(downloadStateCallback);
    }

    async uploadStateCallback(state: UploadStateUpdateType) {
        // console.debug("Shared upload state update: ", state);

        // Intercept shared content
        let sharedContent = state.sharedContent;
        if(sharedContent) {
            delete state.sharedContent;  // Content consumed
            if(sharedContent.uploadsSendCommand) {
                // console.debug("Intercepting send command", sharedContent.uploadsSendCommand);
                this.uploadsSendCommand = [...this.uploadsSendCommand || [], ...sharedContent.uploadsSendCommand];
            }
        }

        for(let cb of this.uploadCallbacks) {
            cb(state);  // Note: no error check or await, this may hang if port is closed. Will be handled in maintenance().
        }
    }

    async downloadStateCallback(state: DownloadStateUpdateType) {
        // console.debug("Shared download state update: ", state);

        // Intercept shared content
        let sharedContent = state.sharedContent;
        if(sharedContent) {
            delete state.sharedContent;  // Content consumed
            if(sharedContent.fuuidsReady) {
                // console.debug("Intercepting send command", sharedContent.uploadsSendCommand);
                this.fuuidsReady = [...this.fuuidsReady || [], ...sharedContent.fuuidsReady];
            }
        }

        for(let cb of this.downloadCallbacks) {
            cb(state);  // Note: no error check or await, this may hang if port is closed. Will be handled in maintenance().
        }
    }

    /** Consume the list of uploadIds that need the AddFile command from the connection worker. */
    async getUploadsSendCommand() {
        let uploadsSendCommand = this.uploadsSendCommand;
        this.uploadsSendCommand = null;
        return uploadsSendCommand;
    }

    /** Consume the list of fuuids that are ready to be automatically downloaded. */
    async getFuuidsReady() {
        let fuuidsReady = this.fuuidsReady;
        this.fuuidsReady = null;
        return fuuidsReady;
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
