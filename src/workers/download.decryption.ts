import { encryptionMgs4 } from 'millegrilles.cryptography';
import { DownloadIdbParts, DownloadIdbType, getDecryptedBlob, openDB, removeDownload, saveDecryptedBlob, saveDecryptionError, saveDownloadDecryptedPart, STORE_DOWNLOAD_PARTS} from '../collections2/idb/collections2StoreIdb';
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
    cancelled: boolean

    constructor() {
        this.callback = null;
        this.currentJob = null;
        this.cancelled = false;
    }

    async setup(callback: DecryptionWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string): Promise<boolean> {
        if(this.currentJob?.fuuid === fuuid && this.currentJob?.userId === userId) {
            this.cancelled = true;
            return true;
        }
        return false;
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
        let userId = downloadJob.userId;
        this.cancelled = false;

        let decryptedPosition = 0, decryptedPartPosition = 0;
        let interval = setInterval(()=>{
            // console.debug("Decrypt position %d/%d", decryptedPosition, downloadJob.size);
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
            let store = db.transaction(STORE_DOWNLOAD_PARTS, 'readonly').store;

            let part = await store.get([fuuid, 0]) as DownloadIdbParts;
            
            let position = 0;
            while(part) {
                if(this.cancelled) {
                    console.info("Decryption cancelled by user");
                    return;  // Job is cancelled. Just abort processing, cleanup is done from caller.
                }

                console.debug("Decrypt ", part);
                let content = part.content;

                // Open reader for blob, iterate through content.
                // @ts-ignore
                let stream = getIterableStream(content.stream());

                // Buffer with chunks and blobs.
                let chunks = [] as Uint8Array[];
                let chunkSize = 0;
                let partBlobs = [] as Blob[];
                for await (const chunk of stream) {
                    if(this.cancelled) {
                        console.info("Decryption cancelled by user");
                        return;  // Job is cancelled. Just abort processing, cleanup is done from caller.
                    }

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

                // Concatenate all blobs into one larger part blob
                // Save the blob to decrypted table
                let partBlob = new Blob(partBlobs);
                await saveDownloadDecryptedPart(fuuid, decryptedPartPosition, partBlob);
                decryptedPartPosition += partBlob.size;

                position += content.size;

                // New transaction
                store = db.transaction(STORE_DOWNLOAD_PARTS, 'readonly').store;
                part = await store.get([fuuid, position]);
            }

            let finalize = await decipher.finalize();
            if(finalize && finalize.length > 0) {
                await saveDownloadDecryptedPart(fuuid, decryptedPosition, new Blob([finalize]))
            }

            // Concatenate all decrypted parts from IDB into a single blob
            let decryptedFileBlob = await getDecryptedBlob(fuuid);

            if(!decryptedFileBlob || (decryptedFileBlob.size === 0 && downloadJob.size)) {
                throw new Error('Decrypted file %s size is 0 (empty)');
            }

            await saveDecryptedBlob(fuuid, decryptedFileBlob);
            this.currentJob = null;  // Remove job before callback - allows chaining to next job
            await callback(downloadJob.fuuid, downloadJob.userId, true, downloadJob.size, downloadJob.size);
        } catch(err) {
            console.error("Error decrypting file", err);
            try {
                await saveDecryptionError(fuuid);
            } catch(err) {
                console.warn("Error marking download for fuuid %sin error(2): %O, removing download", fuuid, err);
                await removeDownload(fuuid, userId);
            }
            await callback(downloadJob.fuuid, downloadJob.userId, true);
            throw err
        } finally {
            clearInterval(interval);
            this.currentJob = null;
            this.cancelled = false;
        }
    }

}
