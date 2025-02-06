import { encryptionMgs4, messageStruct, multiencoding } from 'millegrilles.cryptography';
import { getUploadJob, saveUploadJobAddCommand, saveUploadJobDecryptionInfo, saveUploadPart, updateUploadJobState, UploadIdbType, UploadStateEnum } from '../collections2/idb/collections2StoreIdb';
import { AppsEncryptionWorker } from './encryption';
import { Collections2AddFileCommand } from './connection.worker';

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
    appsEncryptionWorker: AppsEncryptionWorker      // Complete instance of the encryption worker class

    constructor() {
        this.callback = null;
        this.jobs = [];
        this.running = false;
        this.appsEncryptionWorker = new AppsEncryptionWorker();
    }

    async setup(callback: EncryptionWorkerCallbackType, caPem: string) {
        this.callback = callback;
        await this.appsEncryptionWorker.initialize(caPem);
        this.intervalTrigger = setInterval(()=>{
            console.debug("Interval trigger encryption");
            this.triggerJobs().catch(err=>console.error("Error triggering encryption job from interval", err));
        }, 20_000);
    }

    async setEncryptionKeys(pems: Array<string[]>) {
        await this.appsEncryptionWorker.setEncryptionKeys(pems);
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
                    console.error("Error processing encryption job %O: %O", job, err);
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
        let fileSize = uploadJob.file.size;
        let interval = setInterval(()=>{
            console.debug("Encrypt position %s/%s", encryptedPosition, fileSize);
            if(callback && uploadJob.size) {
                callback(uploadJob.uploadId, uploadJob.userId, false, encryptedPosition, fileSize);
            }
        }, 750);

        try {
            let position = 0;
            let partSize = suggestPartSize(fileSize);

            // Encrypt file
            let stream = uploadJob.file.stream();

            let key = uploadJob.secret?.secret;
            if(!key) throw new Error('Secret key not generated');

            let cipher = await encryptionMgs4.getMgs4CipherWithSecret(key);

            // Buffer with chunks and blobs.
            let chunks = [] as Uint8Array[];
            let chunksSize = 0;
            let blobs = [] as Blob[];       // List of blobs to include in the current part
            let blobsSize = 0;              // Current part size
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
                    blobs.push(partBlob);
                    blobsSize += partBlob.size;
                    
                    // Reset chunks
                    chunksSize = 0;
                    chunks = [];
                }

                if(blobsSize > partSize) {
                    // Save blob to IDB
                    let blob = new Blob(blobs);
                    console.info("save part position %s of size %s", position, blob.size);
                    await saveUploadPart(uploadJob.uploadId, position, blob);

                    // Update position for next part
                    position += blobsSize;

                    // Reset blobs
                    blobs = [];
                    blobsSize = 0;
                }
            }

            let finalize = await cipher.finalize();
            if(finalize) {
                chunks.push(finalize);
            }

            if(chunks.length > 0) {
                // Save blob to IDB
                let blob = new Blob(chunks);
                console.info("save last part position %s of size %s", position, blob.size);
                await saveUploadPart(uploadJob.uploadId, position, blob);
                position += blob.size;
            }

            // Save key and other encryption info to IDB
            console.warn("File encrypted, save cipher info to IDB ", cipher);
            let encryptionInfo = {
                cle_id: uploadJob.secret?.cle_id,
                format: 'mgs4',
                nonce: multiencoding.encodeBase64Nopad(cipher.header),
            } as messageStruct.MessageDecryption;
            if(cipher.digest) {
                encryptionInfo.verification = multiencoding.hashEncode('base58btc', 'blake2b-512', cipher.digest);
            }

            await saveUploadJobDecryptionInfo(uploadJob.uploadId, encryptionInfo, position);
            await this.prepareFileAddMetadata(uploadJob.uploadId);
        } catch(err) {
            await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.ERROR);
            await callback(uploadJob.uploadId, uploadJob.userId, true);
            throw err
        } finally {
            clearInterval(interval);
        }
    }

    async prepareFileAddMetadata(uploadId: number) {
        let uploadJob = await getUploadJob(uploadId) as UploadIdbType;
        if(!uploadJob) throw new Error('Unknown upload Id: ' + uploadId);
        if(!uploadJob.secret) throw new Error('Upload without secret key: ' + uploadId);

        let decryptedMetadata = {
            nom: uploadJob.filename,
            date: Math.floor(new Date().getTime()/1000),
            hachage_original: uploadJob.decryption?.verification
        };
        console.debug("Encrypt metadata: ", decryptedMetadata);

        let encryptedMetadata = await this.appsEncryptionWorker.encryptMessageMgs4ToBase64(decryptedMetadata, uploadJob.secret.secret);
        let metadata = {
            data_chiffre: encryptedMetadata.ciphertext_base64,
            cle_id: uploadJob.secret.cle_id,
            nonce: encryptedMetadata.nonce,
            format: encryptedMetadata.format,
        };

        let mimetype = uploadJob.mimetype;
        if(!mimetype) {
            // TODO - try to fix mimetype with file extension when empty            
            console.warn("TODO - fix mimetype with file extension");
            mimetype = 'application/octet-stream';
        }

        let command = {
            fuuid: uploadJob.fuuid,
            cuuid: uploadJob.cuuid,
            mimetype, 
            metadata,
            taille: uploadJob.size,
            cle_id: uploadJob.decryption?.cle_id,
            format: uploadJob.decryption?.format,
            nonce: uploadJob.decryption?.nonce,
        } as Collections2AddFileCommand;
        console.debug("Add file command: ", command);
        await saveUploadJobAddCommand(uploadJob.uploadId, command);
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
