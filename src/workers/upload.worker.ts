import { proxy, Remote, wrap } from "comlink";
import { getNextUploadReadyJob, getUploadJob, removeUserUploads, updateUploadJobState, UploadIdbType, UploadStateEnum } from "../collections2/idb/collections2StoreIdb";
import { UploadStateUpdateType, UploadTransferProgress, UploadWorkerType } from "../collections2/transferStore";
import { FilehostDirType } from "./directory.worker";
import { UploadThreadWorker, UploadWorkerCallbackType } from "./upload.thread";
import { EncryptionWorkerCallbackType, UploadEncryptionWorker } from "./upload.encryption";

export type UploadStateCallback = (state: UploadStateUpdateType)=>Promise<void>;

export class AppsUploadWorker {
    currentUserId: string | null
    uploadWorker: Remote<UploadThreadWorker> | UploadThreadWorker | null
    encryptionWorker: Remote<UploadEncryptionWorker> | UploadEncryptionWorker | null
    filehost: FilehostDirType | null
    intervalMaintenance: ReturnType<typeof setInterval> | null
    uploadStateCallbackProxy: UploadWorkerCallbackType
    encryptionStateCallbackProxy: EncryptionWorkerCallbackType
    stateCallbacks: UploadStateCallback[]
    uploadStatus: UploadTransferProgress | null
    encryptionStatus: UploadTransferProgress | null
    listChanged: boolean
    uploadsSendCommand: number[] | null    // List of uploads that need the connectionWorker to send the add file command.
    pauseUploads: boolean

    constructor() {
        this.currentUserId = null;
        this.uploadWorker = null;
        this.encryptionWorker = null;
        this.filehost = null;
        this.intervalMaintenance = null;

        let uploadCb = async (uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null, stateChanged?: boolean | null) => {
            await this.uploadCallback(uploadId, userId, done, position, size, stateChanged);
        }
        this.uploadStateCallbackProxy = proxy(uploadCb);

        let encryptionCb = async (uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null, stateChanged?: boolean | null) => {
            await this.encryptionCallback(uploadId, userId, done, position, size, stateChanged);
        }
        this.encryptionStateCallbackProxy = proxy(encryptionCb);

        this.stateCallbacks = [];
        this.uploadStatus = null;
        this.encryptionStatus = null;
        this.listChanged = true;
        this.uploadsSendCommand = null;
        this.pauseUploads = false;
    }

    async setup(stateCallback: UploadStateCallback, caPem: string) {
        this.stateCallbacks.push(stateCallback);
        // console.debug("Callback count: ", this.stateCallbacks.length);

        // This is a shared worker. Only create instances if not already done.
        if(!this.uploadWorker) {
            try {
                let uploadThreadWorker = new Worker(new URL('./upload.worker_thread', import.meta.url));
                this.uploadWorker = wrap(uploadThreadWorker);
            } catch(err) {
                // Support using class directly if starting a Dedicated Worker from another worker fails (e.g. on iOS).
                console.warn("Error starting a Dedicated WebWorker, using direct instanciation", err);
                let {UploadThreadWorker} = await import('./upload.thread');
                this.uploadWorker = new UploadThreadWorker();
            }
            await this.uploadWorker.setup(this.uploadStateCallbackProxy);
        }
        if(!this.encryptionWorker) {
            try {
                let encryptionThreadWorker = new Worker(new URL('./upload.worker_encryption', import.meta.url));
                this.encryptionWorker = wrap(encryptionThreadWorker);
            } catch(err) {
                // Support using class directly if starting a Dedicated Worker from another worker fails (e.g. on iOS).
                console.warn("Error starting a Dedicated WebWorker, using direct instanciation", err);
                let {UploadEncryptionWorker}  = await import('./upload.encryption');
                this.encryptionWorker = new UploadEncryptionWorker();
            }
            await this.encryptionWorker.setup(this.encryptionStateCallbackProxy, caPem);
        }

        if(!this.intervalMaintenance) {
            this.intervalMaintenance = setInterval(()=>this.maintain(), 20_000);
        }
    }

    async setEncryptionKeys(pems: Array<string[]>) {
        if(!this.encryptionWorker) throw new Error('Upload encryption worker not initialized');
        await this.encryptionWorker.setEncryptionKeys(pems);
    }

    async unregister(stateCallback: UploadStateCallback) {
        console.debug("unregister ", stateCallback);
        //TODO
    }

    async uploadCallback(uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null, stateChanged?: boolean | null) {
        console.debug("Download worker callback uploadId: %d, userId: %s, done: %O, position: %d, size: %d", uploadId, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.uploadStatus = null;
            this.listChanged = true;
            this.triggerJobs().catch(err=>console.error("uploadCallback Error on triggerJobs", err));
            await this.triggerListChanged();
        } else {
            let upload = {workerType: UploadWorkerType.UPLOAD, uploadId, state: UploadStateEnum.UPLOADING, position, totalSize: size} as UploadTransferProgress;
            this.uploadStatus = upload;
            if(stateChanged) {
                console.warn("Trigger list changed");
                await this.triggerListChanged();
            } else {
                await this.produceState();
            }
        }
    }

    async encryptionCallback(uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null, stateChanged?: boolean | null) {
        console.debug("Encryption worker callback uploadId: %d, userId: %s, done: %O, position: %d, size: %d", uploadId, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.encryptionStatus = null;
            this.listChanged = true;
            
            // Add uploadId to list of AddFile command to send
            if(this.uploadsSendCommand) this.uploadsSendCommand.push(uploadId);
            else this.uploadsSendCommand = [uploadId];
            
            this.triggerJobs().catch(err=>console.error("encryptionCallback Error on triggerJobs", err));
            await this.triggerListChanged();
        } else {
            let encryption = {workerType: UploadWorkerType.ENCRYPTION, uploadId, state: UploadStateEnum.ENCRYPTING, position, totalSize: size} as UploadTransferProgress;
            this.encryptionStatus = encryption;
            if(stateChanged) {
                await this.triggerListChanged()
            } else {
                await this.produceState();
            }
        }
    }
    
    // // async stopWorker() {
    // //     let interval = this.intervalMaintenance;
    // //     this.intervalMaintenance = null;
    // //     if(interval) clearInterval(interval);
    // // }

    /** The filehost connection is maintained by DirectoryWorker. */
    async setFilehost(filehost: FilehostDirType | null) {
        console.debug("Setting filehost for upload: ", filehost);
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

        // Note: encryption jobs cannot be recovered - the original content blob does not get saved.

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

        // Upload
        if(this.uploadWorker) {
            if(!this.pauseUploads) {
                if((await this.uploadWorker.isBusy()) === false) {
                    let job = await getNextUploadReadyJob(this.currentUserId);
                    if(job) {
                        if(!job.uploadUrl) {
                            // Set the current filehost as upload url
                            job.uploadUrl = filehostUrl;
                        }
                        try {
                            await this.uploadWorker.addJob(job);
                        } catch (err) {
                            console.info("Upload worker busy, will retry");
                        }
                    }
                }
            }
        } else {
            console.warn("Upload worker not wired");
        }

        // Update state
        await this.produceState();
    }

    async addUpload(uploadId: number, file: File): Promise<void> {
        if(!this.encryptionWorker) throw new Error('Encryption worker not ready');
        this.encryptionWorker.addJob(uploadId, file);
        // Start processing all jobs
        await this.triggerJobs();
        await this.triggerListChanged();
    }

    async cancelUpload(uploadId: number) {
        await this.encryptionWorker?.cancelJobIf(uploadId);
        await this.uploadWorker?.cancelJobIf(uploadId);
        if(this.currentUserId) {
            await removeUserUploads(this.currentUserId, {uploadId});
        }
        await this.triggerJobs();
        await this.triggerListChanged();
    }

    async pauseUpload(uploadId: number) {
        // Pause current work on the upload.
        await this.uploadWorker?.cancelJobIf(uploadId, {pause: true});
        // Mark upload as paused
        if(this.currentUserId) {
            await updateUploadJobState(uploadId, UploadStateEnum.PAUSED);
        }
        // Find next job
        await this.triggerJobs();

        // Update screen
        await this.triggerListChanged();
    }

    async isPaused() {
        return this.pauseUploads;
    }

    async pauseUploading() {
        this.pauseUploads = true;
        await this.uploadWorker?.pauseJob();
    }

    async resumeUploading() {
        this.pauseUploads = false;
        await this.triggerJobs();
    }

    async resumeUpload(uploadId: number) {
        let job = await getUploadJob(uploadId);
        if(!job) throw new Error('Unknown job ID:' + uploadId);

        const CONST_RESUMABLE_STATES = [UploadStateEnum.PAUSED, UploadStateEnum.ERROR_DURING_PART_UPLOAD]
        if(!CONST_RESUMABLE_STATES.includes(job.state)) throw new Error('Job not in a resumable state');

        await updateUploadJobState(uploadId, UploadStateEnum.READY);
        // Find next job
        await this.triggerJobs();
        // Update screen
        await this.triggerListChanged();
    }

    async produceState() {
        if(this.stateCallbacks.length === 0) {
            console.warn("Upload state callback not initialized");
            return;
        }
        let stateList = [] as UploadTransferProgress[];
        if(this.uploadStatus) stateList.push(this.uploadStatus);
        if(this.encryptionStatus) stateList.push(this.encryptionStatus);
        let update = {activeTransfers: stateList} as UploadStateUpdateType;

        // Reset listChanged
        if(this.listChanged) update.listChanged = true;
        this.listChanged = false;
        
        for (let cb of this.stateCallbacks) {
            cb(update)
                .catch(err=>console.error("Error on upload produceState callback", err));
        }
    }

    maintain() {
        this.triggerJobs()
            .catch(err=>console.error("Error triggering jobs", err));
        this.maintainCallbacks()
            .catch(err=>console.error("Error maintaining callbacks", err));
    }

    // HACK: Remove callbacks that no longer respond
    // TODO: Find way to unregister the callbacks directly, or at least a proper test.
    async maintainCallbacks() {
        // console.debug("Callback check, count %d", this.stateCallbacks.length);
        let list = [] as UploadStateCallback[];
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

    /** Allows any process to use the shared worker to trigger a list reload. */
    async triggerListChanged() {
        this.listChanged = true;
        await this.produceState();
    }

    /** Consume the list of uploadIds that need the AddFile command from the connection worker. */
    async getUploadsSendCommand() {
        let uploadsSendCommand = this.uploadsSendCommand;
        this.uploadsSendCommand = null;
        return uploadsSendCommand;
    }

}

export type UploadJobType = UploadIdbType & {
    // url: string,
};
