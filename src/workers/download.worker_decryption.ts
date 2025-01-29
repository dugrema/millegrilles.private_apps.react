import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { encryptionMgs4 } from 'millegrilles.cryptography';
import { DownloadIdbParts, DownloadIdbType, openDB, saveDecryptedBlob, saveDecryptionError, STORE_DOWNLOAD_PARTS } from '../collections2/idb/collections2StoreIdb';
import { getIterableStream } from '../collections2/transferUtils';

export type DecryptionWorkerCallbackType = (
    fuuid: string, 
    userId: string, 
    done: boolean, 
    position?: number | null, 
    size?: number | null
) => Promise<void>;

const CONST_CHUNK_SOFT_LIMIT = 1024 * 1024;

export class DownloadDecryptionWorker {
    callback: DecryptionWorkerCallbackType | null
    currentJob: DownloadIdbType | null

    constructor() {
        this.callback = null;
        this.currentJob = null;
    }

    async setup(callback: DecryptionWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string) {
        console.warn("TODO");
    }

    async isBusy() {
        return !!this.currentJob;
    }

    async decryptContent(downloadJob: DownloadIdbType) {
        if(this.currentJob) throw new Error('Busy');
        if(downloadJob.format !== 'mgs4') {
            throw new Error('Unsupported encryption format: ' + downloadJob.format);
        }
        if(!downloadJob.secretKey) throw new Error('Secret key not provided');
        if(!downloadJob.nonce) throw new Error('Decryption information (nonce) is missing');

        let callback = this.callback;
        if(!callback) throw new Error('Callback not wired');

        this.currentJob = downloadJob;
        let fuuid = downloadJob.fuuid;

        let decryptedPosition = 0;
        let interval = setInterval(()=>{
            console.debug("Decrypt position %d/%d", decryptedPosition, downloadJob.size);
            if(callback && downloadJob.size) {
                callback(downloadJob.fuuid, downloadJob.userId, false, decryptedPosition, downloadJob.size);
            }
        }, 750);

        try {
            // Decrypt file
            let secretKey = downloadJob.secretKey;
            let nonce = downloadJob.nonce;
            let decipher = await encryptionMgs4.getMgs4Decipher(secretKey, nonce);

            // Open a cursor and iterate through all parts in order
            const db = await openDB();
            let store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;

            let part = await store.get([fuuid, 0]) as DownloadIdbParts;
            
            let blobs = [] as Blob[];
            let position = 0;
            while(part) {
                // console.debug("Decrypt ", part);
                let content = part.content;

                // Open reader for blob, iterate through content.
                // @ts-ignore
                let stream = getIterableStream(content.stream());

                // Buffer with chunks and blobs.
                let chunks = [] as Uint8Array[];
                let chunkSize = 0;
                let partBlobs = [] as Blob[];
                for await (const chunk of stream) {
                    let output = await decipher.update(chunk);
                    if(output && output.length > 0) {
                        decryptedPosition += output.length;  // Use decrypted position
                        chunkSize += output.length;
                        chunks.push(output);
                    }
                    if(chunkSize > CONST_CHUNK_SOFT_LIMIT) {
                        // Offload chunks to blob
                        partBlobs.push(new Blob(chunks));
                        // Reset chunks
                        chunkSize = 0;
                        chunks = [];
                    }
                }
    
                if(chunks.length > 0) {
                    // Last chunk
                    partBlobs.push(new Blob(chunks));
                }
    
                // console.debug("Save %d chunks as decrypted part", partBlobs.length);
                // Concatenate all blobs into one larger part blob
                blobs.push(new Blob(partBlobs));
        
                position += content.size;

                // New transaction
                store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
                part = await store.get([fuuid, position]);
            }

            let finalize = await decipher.finalize();
            if(finalize) blobs.push(new Blob([finalize]));

            // Save all decrypted parts into a single blob
            // console.debug("Save all decrypted parts to IDB");
            let decryptedFileBlob = new Blob(blobs, {type: downloadJob.mimetype});
            await saveDecryptedBlob(fuuid, decryptedFileBlob);
            callback(downloadJob.fuuid, downloadJob.userId, true, downloadJob.size, downloadJob.size);
        } catch(err) {
            await saveDecryptionError(fuuid);
            await callback(downloadJob.fuuid, downloadJob.userId, true);
            throw err
        } finally {
            clearInterval(interval);
            this.currentJob = null;
        }
    }

}

var worker = new DownloadDecryptionWorker();
expose(worker);
