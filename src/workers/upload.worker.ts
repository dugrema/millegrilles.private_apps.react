import { proxy, Remote, wrap } from "comlink";
import { addUploadFile, UploadIdbType } from "../collections2/idb/collections2StoreIdb";
import { UploadStateUpdateType, UploadTransferProgress } from "../collections2/transferStore";
import { FilehostDirType } from "./directory.worker";
import { UploadThreadWorker, UploadWorkerCallbackType } from "./upload.thread";
import { EncryptionWorkerCallbackType, UploadEncryptionWorker } from "./upload.encryption";
import { messageStruct } from "millegrilles.cryptography";

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
    fuuidsReady: string[] | null    // List of files for which the download just completed

    constructor() {
        this.currentUserId = null;
        this.uploadWorker = null;
        this.encryptionWorker = null;
        this.filehost = null;
        this.intervalMaintenance = null;

        let uploadCb = async (uuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) => {
            await this.uploadCallback(uuid, userId, done, position, size);
        }
        this.uploadStateCallbackProxy = proxy(uploadCb);

        let encryptionCb = async (uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null) => {
            await this.encryptionCallback(uploadId, userId, done, position, size);
        }
        this.encryptionStateCallbackProxy = proxy(encryptionCb);

        this.stateCallbacks = [];
        this.uploadStatus = null;
        this.encryptionStatus = null;
        this.listChanged = true;
        this.fuuidsReady = null;
    }

    async setup(stateCallback: UploadStateCallback) {
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
            await this.encryptionWorker.setup(this.encryptionStateCallbackProxy);
        }

        if(!this.intervalMaintenance) {
            this.intervalMaintenance = setInterval(()=>this.maintain(), 20_000);
        }
    }

    async unregister(stateCallback: UploadStateCallback) {
        console.debug("unregister ", stateCallback);
        //TODO
    }

    async uploadCallback(fuuid: string, userId: string, done: boolean, position?: number | null, size?: number | null) {
        console.debug("Download worker callback fuuid: %s, userId: %s, done: %O, position: %d, size: %d", fuuid, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.uploadStatus = null;
            this.listChanged = true;
            await this.triggerJobs();
        } else {
            throw new Error('todo uploadCallback');
            // let download = {workerType: WorkerType.DOWNLOAD, fuuid, state: DownloadStateEnum.DOWNLOADING, position, totalSize: size} as TransferProgress;
            // this.downloadStatus = download;
            // await this.produceState();
        }
    }

    async encryptionCallback(uploadId: number, userId: string, done: boolean, position?: number | null, size?: number | null) {
        console.debug("Decryption worker callback uploadId: %d, userId: %s, done: %O, position: %d, size: %d", uploadId, userId, done, position, size);
        if(done) {
            // Start next download job (if any). Also does a produceState()
            this.encryptionStatus = null;
            this.listChanged = true;
            
            // Add fuuid to list of new files that are ready
            // if(this.fuuidsReady) this.fuuidsReady.push(fuuid);
            // else this.fuuidsReady = [fuuid];
            
            await this.triggerJobs();
        } else {
            throw new Error('todo encryptionCallback');
            // let decryption = {workerType: WorkerType.DECRYPTION, fuuid, state: DownloadStateEnum.ENCRYPTED, position, totalSize: size} as TransferProgress;
            // this.decryptionStatus = decryption;
            // await this.produceState();
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

        // Encrypt
        // if(this.encryptionWorker) {
        //     if((await this.encryptionWorker.isBusy()) === false) {
        //         let job = await getNextEncryptJob(this.currentUserId);
        //         if(job) {
        //             console.debug("Trigger job encryptionWorker next", job);
        //             this.encryptionWorker.encryptContent(job)
        //                 .catch(err=>console.error("Error encrypting file", err));
        //         }
        //     } else {
        //         console.info("Encryption worker busy");
        //     }
        // } else {
        //     console.warn("Encryption worker not wired");
        // }

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
            console.warn("TODO - Trigger upload worker jobs")
        } else {
            console.warn("Upload worker not wired");
        }

        // // Downloads
        // if(this.downloadWorker) {
        //     console.debug("Trigger job downloadWorker check");
        //     if(await this.downloadWorker.isBusy() === false) {
        //         let job = await getNextDownloadJob(this.currentUserId);
        //         console.debug("Trigger job downloadWorker next", job);
        //         if(!job) {
        //             // Check if we can resume a download in Error state
        //             job = await restartNextJobInError(this.currentUserId);
        //         }
        //         if(job) {
        //             // Generate download url
        //             let url = filehostUrl;
        //             if(!url.endsWith('/')) url += '/';
        //             url += 'files/' + job.fuuid;
                    
        //             let downloadJob = {...job, url};
        //             console.debug("Add download job", downloadJob);
        //             await this.downloadWorker.addJob(downloadJob);
        //         }
        //     }
        // } else {
        //     console.warn("Download worker not wired");
        // }

        // // Decryption
        // if(this.decryptionWorker) {
        //     if(await this.decryptionWorker.isBusy() === false) {
        //         let job = await getNextDecryptionJob(this.currentUserId);
        //         if(job) {
        //             await this.decryptionWorker.decryptContent(job);
        //         }
        //     }
        // } else {
        //     console.warn("Download decryption worker not wired");
        // }

        // // Uploads


        // Update state
        await this.produceState();
    }

    async addUploads(userId: string, cuuid: string, files: FileList): Promise<void> {
        console.debug("Adding upload for user %s, cuuid: %s, files: %O", userId, cuuid, files);
        if(!this.encryptionWorker) throw new Error('Encryption worker not ready');
        for await (let file of files) {
            console.debug("Saving file: ", file);
            // Generate new IDB upload entry. This returns a locally unique Id for the upload.
            let uploadId = await addUploadFile(userId, cuuid, file);
            console.debug("New upload Id added: ", uploadId);

            // Start encryption
            this.encryptionWorker.addJob(uploadId, file);
        }

        // Start processing all jobs
        await this.triggerJobs();
    }

    // async addUploadFromFile(tuuid: string, userId: string): Promise<Blob | null> {
    //     if(!this.uploadWorker || !this.encryptionWorker) throw new Error('Dedicated workers not initialized');
        
    //     let entry = await createUploadEntryFromFile(tuuid, userId);
    //     console.debug("New upload entry", entry);

    //     let content = await getUploadContent(entry.fuuid, userId);
    //     console.debug("Existing upload content", content);
    //     if(content) {
    //         // Upload already completed, return the file
    //         return content;
    //     }

    //     // Add to IDB
    //     await addUpload(entry);

    //     this.listChanged = true;
    //     await this.triggerJobs();

    //     return null;
    // }

    async cancelUpload(fuuid: string, userId: string) {
        throw new Error('todo cancelUpload');
        // await removeUpload(fuuid, userId);
        // await this.uploadWorker?.cancelJobIf(fuuid, userId);
        // await this.encryptionWorker?.cancelJobIf(fuuid, userId);
        // await this.triggerJobs();
    }

    async pauseUpload(fuuid: string, userId: string) {
        throw new Error('todo pauseUpload');
    }

    async resumeUpload(fuuid: string, userId: string) {
        throw new Error('todo resumeUpload');
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
            cb(update);
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
        throw new Error('todo triggerListChanged');
        // await this.produceState();
    }

    /** Consume the list of fuuids that are ready to be automatically uploaded. */
    async getFuuidsReady() {
        let fuuidsReady = this.fuuidsReady;
        this.fuuidsReady = null;
        return fuuidsReady;
    }

}

export type UploadJobType = UploadIdbType & {
    // url: string,
};
