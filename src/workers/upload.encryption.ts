import { encryptionMgs4 } from 'millegrilles.cryptography';
import { getUploadJob, updateUploadJobState, UploadIdbType, UploadStateEnum } from '../collections2/idb/collections2StoreIdb';
import { UploadJobType } from './upload.worker';

export type EncryptionWorkerCallbackType = (
    uploadId: number, 
    userId: string, 
    done: boolean, 
    position?: number | null, 
    size?: number | null
) => Promise<void>;

export type EncryptionWorkerJob = UploadIdbType & {
    file: File,
};

const CONST_CHUNK_SOFT_LIMIT = 1024 * 1024;

export class UploadEncryptionWorker {
    callback: EncryptionWorkerCallbackType | null
    jobs: EncryptionWorkerJob[]
    running: boolean
    intervalTrigger: any

    constructor() {
        this.callback = null;
        this.jobs = [];
        this.running = false;
    }

    async setup(callback: EncryptionWorkerCallbackType) {
        this.callback = callback;
        this.intervalTrigger = setInterval(()=>{
            console.debug("Interval trigger encryption");
            this.triggerJobs().catch(err=>console.error("Error triggering encryption job from interval", err));
        }, 20_000);
    }

    async cancelJobIf(fuuid: string, userId: string) {
        console.warn("TODO");
    }

    async isBusy() {
        return false;
    }

    async addJob(uploadId: number, file: File) {
        // Load job from IDB
        let uploadJob = await getUploadJob(uploadId) as UploadIdbType;
        if(!uploadJob) throw new Error('Unknown job id: ' + uploadId);

        let job = {...uploadJob, file} as EncryptionWorkerJob;

        // Push to job list
        this.jobs.push(job);

        await this.triggerJobs();
    }

    async triggerJobs() {
        if(!this.running) {
            // Trigger jobs
            this.processJobs()
                .catch(err=>console.error("Error processing jobs", err));
        }
    }

    async processJobs() {
        this.running = true;
        try {
            while(true) {
                let job = this.jobs.shift();
                if(!job) break;
                try {
                    await this.encryptContent(job);
                } catch(err) {
                    console.error("Error processing job: ", job);
                    //TODO Mark job as in Error
                }
            }
        } finally {
            this.running = false;
        }
    }

    async encryptContent(uploadJob: EncryptionWorkerJob) {
        // if(this.currentJob) throw new Error('Busy');
        if(!uploadJob.file) throw new Error('No file to encrypt');

        console.debug("Encrypting upload job %d", uploadJob.uploadId);
        
        //TODO put status to encrypting in IDB
        await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.ENCRYPTING);

        let callback = this.callback;
        if(!callback) throw new Error('Callback not wired');

        let encryptedPosition = 0;
        let interval = setInterval(()=>{
            console.debug("Decrypt position %d/%d", encryptedPosition, uploadJob.size);
            if(callback && uploadJob.size) {
                callback(uploadJob.uploadId, uploadJob.userId, false, encryptedPosition, uploadJob.size);
            }
        }, 750);

        try {
            let position = 0;
            let partSize = suggestPartSize(uploadJob.file.size);

            // Encrypt file
            let stream = uploadJob.file.stream();
            let cipher = await encryptionMgs4.getMgs4Cipher();

            // Buffer with chunks and blobs.
            let chunks = [] as Uint8Array[];
            let chunksSize = 0;
            let blobs = [] as Blob[];       // List of blobs to include in the current part
            let blobsSize = 0;              // Current part size
            let partBlobs = [] as Blob[];
            for await (let chunk of stream) {
                encryptedPosition += chunk.length;

                //@ts-ignore
                let ciphertext = await cipher.update(chunk);
                if(ciphertext) {
                    chunks.push(ciphertext);
                    chunksSize += ciphertext.length;
                }

                if(chunksSize > CONST_CHUNK_SOFT_LIMIT) {
                    // Offload chunks to blob
                    let partBlob = new Blob(chunks);
                    partBlobs.push(partBlob);
                    blobsSize += partBlob.size;
                    
                    // Reset chunks
                    chunksSize = 0;
                    chunks = [];
                }

                if(blobsSize > partSize) {
                    // Save blob to IDB
                    let blob = new Blob(partBlobs);
                    console.warn("save part position %d of size %d", position, blob.size);

                    // Update position for next part
                    position += blobsSize;

                    // Reset blobs
                    blobs = [];
                    blobsSize = 0;
                }
            }

            let finalize = await cipher.finalize();
            if(finalize) {
                console.warn('TODO - last part');
                chunks.push(finalize);
            }

            if(chunks.length > 0) {
                // Save blob to IDB
                let partBlob = new Blob(chunks);
                console.warn("save last part position %d of size %d", position, partBlob.size);
            }

            await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.UPLOADING);

        //     // Open a cursor and iterate through all parts in order
        //     const db = await openDB();
        //     let store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;

        //     let part = await store.get([fuuid, 0]) as DownloadIdbParts;
            
        //     let blobs = [] as Blob[];
        //     let position = 0;
        //     while(part) {
        //         // console.debug("Decrypt ", part);
        //         let content = part.content;

        //         // Open reader for blob, iterate through content.
        //         // @ts-ignore
        //         let stream = getIterableStream(content.stream());

        //         // Buffer with chunks and blobs.
        //         let chunks = [] as Uint8Array[];
        //         let chunkSize = 0;
        //         let partBlobs = [] as Blob[];
        //         for await (const chunk of stream) {
        //             let output = await decipher.update(chunk);
        //             if(output && output.length > 0) {
        //                 decryptedPosition += output.length;  // Use decrypted position
        //                 chunkSize += output.length;
        //                 chunks.push(output);
        //             }
        //             if(chunkSize > CONST_CHUNK_SOFT_LIMIT) {
        //                 // Offload chunks to blob
        //                 partBlobs.push(new Blob(chunks));
        //                 // Reset chunks
        //                 chunkSize = 0;
        //                 chunks = [];
        //             }
        //         }
    
        //         if(chunks.length > 0) {
        //             // Last chunk
        //             partBlobs.push(new Blob(chunks));
        //         }
    
        //         // console.debug("Save %d chunks as decrypted part", partBlobs.length);
        //         // Concatenate all blobs into one larger part blob
        //         blobs.push(new Blob(partBlobs));
        
        //         position += content.size;

        //         // New transaction
        //         store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
        //         part = await store.get([fuuid, position]);
        //     }

        //     let finalize = await decipher.finalize();
        //     if(finalize) blobs.push(new Blob([finalize]));

        //     // Save all decrypted parts into a single blob
        //     // console.debug("Save all decrypted parts to IDB");
        //     let decryptedFileBlob = new Blob(blobs, {type: downloadJob.mimetype});
        //     await saveDecryptedBlob(fuuid, decryptedFileBlob);
            // await callback(uploadJob.uploadId, uploadJob.userId, true, uploadJob.size, uploadJob.size);
        } catch(err) {
            await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.ERROR);
            await callback(uploadJob.uploadId, uploadJob.userId, true);
            throw err
        } finally {
            clearInterval(interval);
        }
    }

}

const CONST_SIZE_1MB = 1024 * 1024;
const CONST_SIZE_1GB = 1024 * 1024 * 1024;

function suggestPartSize(fileSize: number | null) {
    if(!fileSize) {
        // Unknown file size. Default to 1MB parts.
        return CONST_SIZE_1MB;
    }

    if(fileSize < 100 * CONST_SIZE_1MB) {       // 100MB
        return CONST_SIZE_1MB;
    } else if(fileSize < 10 * CONST_SIZE_1GB){  // 10GB
        // Recommend parts of 1% of the file size. Gives good granularity for resuming.
        return Math.floor(fileSize / 100);
    } else {                                    // >10GB
        // For anything over 10 GB, clamp to 100MB per part
        return 100 * CONST_SIZE_1MB;
    }
}
