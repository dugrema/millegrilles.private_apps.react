import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { encryptionMgs4 } from 'millegrilles.cryptography';
import { DownloadIdbParts, openDB, saveDecryptedBlob, STORE_DOWNLOAD_PARTS } from '../collections2/idb/collections2StoreIdb';

export type DecryptionWorkerCallbackType = (fuuid: string, userId: string, done: boolean)=>Promise<void>;

export class DownloadDecryptionWorker {
    callback: DecryptionWorkerCallbackType | null
    currentJob: DownloadJobType | null

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

    async decryptContent(downloadJob: DownloadJobType) {
        if(this.currentJob) throw new Error('Busy');
        if(downloadJob.format !== 'mgs4') {
            throw new Error('Unsupported encryption format: ' + downloadJob.format);
        }
        if(!downloadJob.secretKey) throw new Error('Secret key not provided');
        if(!downloadJob.nonce) throw new Error('Decryption information (nonce) is missing');

        let callback = this.callback;
        if(!callback) throw new Error('Callback not wired');

        this.currentJob = downloadJob;

        try {
            // Decrypt file
            let secretKey = downloadJob.secretKey;
            let nonce = downloadJob.nonce;
            let decipher = await encryptionMgs4.getMgs4Decipher(secretKey, nonce);

            // Open a cursor and iterate through all parts in order
            const db = await openDB();
            let store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
            let fuuid = downloadJob.fuuid;

            let part = await store.get([fuuid, 0]) as DownloadIdbParts;
            
            let blobs = [] as Blob[];  // Save all chunks in blobs, they will get concatenated at finalize.

            let position = 0;
            while(part) {
                console.debug("Decrypt ", part);
                let content = part.content;

                // Open reader for blob, iterate through content.
                // @ts-ignore
                let readableStream = content.stream() as ReadableStream;
                let reader = readableStream.getReader();
                let partBlobs = [] as Blob[];
                while(true) {
                    let {done, value} = await reader.read();
                    if(done) break;
                    if(value && value.length > 0) {
                        let output = await decipher.update(value);
                        if(output && output.length > 0) {
                            let blob = new Blob([output]);
                            partBlobs.push(blob);
                        }
                    }
                }
                console.debug("Save %d chunks as decrypted part", partBlobs.length);
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
            console.debug("Save all decrypted parts to IDB");
            let decryptedFileBlob = new Blob(blobs, {type: downloadJob.mimetype});
            await saveDecryptedBlob(fuuid, decryptedFileBlob);
        } finally {
            this.currentJob = null;
            await callback(downloadJob.fuuid, downloadJob.userId, true);
        }
    }

}

var worker = new DownloadDecryptionWorker();
expose(worker);
