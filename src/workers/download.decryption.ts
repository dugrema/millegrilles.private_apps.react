import { encryptionMgs4 } from 'millegrilles.cryptography';
import { DownloadIdbType, removeDownload, saveDecryptionError, setDownloadJobComplete } from '../collections2/idb/collections2StoreIdb';

const CONST_WORKER_DECRYPTION_LOCK = 'worker_decryption';

export type DecryptionWorkerCallbackType = (
    fuuid: string, 
    userId: string, 
    done: boolean, 
    position?: number | null, 
    size?: number | null
) => Promise<void>;

// const CONST_CHUNK_SOFT_LIMIT = 1024 * 1024;

export class DownloadDecryptionWorker {
    dedicated: boolean
    callback: DecryptionWorkerCallbackType | null
    currentJob: DownloadIdbType | null
    cancelled: boolean

    constructor(opts?: {dedicated: boolean}) {
        this.dedicated = opts?.dedicated===undefined?true:opts?.dedicated;
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
        // if(!!this.currentJob) return true;

        // Use site level lock in the browser as second level check
        let busy = await navigator.locks.request(CONST_WORKER_DECRYPTION_LOCK, {ifAvailable: true}, async lock => {
            // console.debug("Lock check: %s, %O", lock?.name, lock?.mode);
            if(!lock) return true;  // Busy
            return false;
        });

        return busy;
    }

    async decryptContent(downloadJob: DownloadIdbType) {
        await navigator.locks.request(CONST_WORKER_DECRYPTION_LOCK, {ifAvailable: true}, async lock => {
            // console.debug("Lock check before job: %s, %O", lock?.name, lock?.mode);
            if(!lock) throw new Error('Busy');  // Busy

            // Run the job, the lock is exclusive and will prevent dedicated workers in other tables from processing.
            await this._decryptContent(downloadJob);
        });
    }

    async _decryptContent(downloadJob: DownloadIdbType) {
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

        try {
            // Open handle to the filesystem
            let root = await navigator.storage.getDirectory();
            let downloadDirectory = await root.getDirectoryHandle('downloads', {create: true});
            // console.debug("Download directory", downloadDirectory);
            let fileHandle = await downloadDirectory.getFileHandle(fuuid);

            if(this.dedicated) {
                await this.decryptInPlace(downloadJob, fileHandle);
            } else {
                await this.decryptCopy(downloadJob, fileHandle);
                // Remove the encrypted file. The new fuuid.decrypted file has been created.
                await downloadDirectory.removeEntry(fuuid);
            }

            // console.debug("File decrypted OK");
            await setDownloadJobComplete(fuuid);
            this.currentJob = null;  // Remove job before callback - allows chaining to next job
            await callback(downloadJob.fuuid, downloadJob.userId, true, downloadJob.size, downloadJob.size);
        } catch(err) {
            console.error("Error decrypting file", err);
            try {
                await saveDecryptionError(fuuid);
            } catch(err) {
                console.warn("Error marking download for fuuid %s in error(2): %O, removing download", fuuid, err);
                await removeDownload(fuuid, userId);
            }
            await callback(downloadJob.fuuid, downloadJob.userId, true);
            throw err
        } finally {
            this.currentJob = null;
            this.cancelled = false;
        }
    }

    /**
     * Decrypts the file over the downloaded encrypted content. Minimizes the amount of space required.
     * Only available in Dedicated Workers (firefox).
     * @param downloadJob 
     * @param fileHandle 
     * @returns 
     */
    async decryptInPlace(downloadJob: DownloadIdbType, fileHandle: FileSystemFileHandle) {
        
        let fileObject = await fileHandle.getFile();
        let fileSize = fileObject.size;

        // console.debug("Decrypting file", downloadJob);

        let callback = this.callback;
        if(!callback) throw new Error('Callback not wired');

        // Decrypt file
        if(!downloadJob.secretKey) throw new Error('Secret key not provided');
        if(!downloadJob.nonce) throw new Error('Decryption information (nonce) is missing');
        let secretKey = downloadJob.secretKey;
        let nonce = downloadJob.nonce;
        let decipher = await encryptionMgs4.getMgs4Decipher(secretKey, nonce);

        // let arrayBuffer = new ArrayBuffer(64*1024);
        // let buffer = new DataView(arrayBuffer);
        let buffer = new Uint8Array(64*1024);

        // @ts-ignore
        let syncFileHandle = null as FileSystemSyncAccessHandle | null;

        let decryptedPosition = 0;
        let interval = setInterval(()=>{
            // console.debug("Decrypt position %s/%s", decryptedPosition, downloadJob.size);
            if(callback && downloadJob.size) {
                callback(downloadJob.fuuid, downloadJob.userId, false, decryptedPosition, downloadJob.size);
            }
        }, 750);

        try {
            // @ts-ignore
            syncFileHandle = await fileHandle.createSyncAccessHandle();

            // Read the encrypted content then write the decrypted content back in place (same file).
            // Avoids having to use double the disk space to decrypt the file.
            let positionReading = 0;
            let chunkCount = 0;
            
            while(positionReading < fileSize) {
                if(decryptedPosition > positionReading) throw new Error("Overlap in reading/writing positions");
                if(this.cancelled) {
                    console.info("Decryption cancelled by user");
                    return;  // Job is cancelled. Just abort processing, cleanup is done from caller.
                }

                let readLen = syncFileHandle.read(buffer, {at: positionReading});
                
                let cleartext = await decipher.update(buffer.slice(0, readLen));
                if(cleartext) {
                    let writeLen = syncFileHandle.write(cleartext, {at: decryptedPosition});
                    decryptedPosition += writeLen;    // Move write position
                }

                if(chunkCount++ >= 50) {
                    chunkCount = 0;
                    // Throttle a bit to let other promises execute (e.g. callback)
                    await new Promise(resolve=>setTimeout(resolve, 0));
                }

                positionReading += readLen;         // Move read position
            }

            // console.debug("Position reading: %s, file size: %s", positionReading, fileSize);

            // Finalize decryption
            let finalChunk = await decipher.finalize();
            if(finalChunk) {
                syncFileHandle.write(finalChunk, {at: decryptedPosition});
                decryptedPosition += finalChunk.length;
            }
            // Additional validation of output
            if(decryptedPosition > positionReading) throw new Error("Error decrypting file - clear content longer than encrypted");

            // Close file
            syncFileHandle.truncate(decryptedPosition);  // Truncate - the decrypted file is smaller than the encrypted version
        } finally {
            clearInterval(interval);
            syncFileHandle?.flush();
            syncFileHandle?.close();
        }
    }

    async decryptCopy(downloadJob: DownloadIdbType, fileHandle: FileSystemFileHandle) {
        let callback = this.callback;
        if(!callback) throw new Error('Callback not wired');

        // Decrypt file
        if(!downloadJob.secretKey) throw new Error('Secret key not provided');
        if(!downloadJob.nonce) throw new Error('Decryption information (nonce) is missing');
        let secretKey = downloadJob.secretKey;
        let nonce = downloadJob.nonce;
        let decipher = await encryptionMgs4.getMgs4Decipher(secretKey, nonce);

        let root = await navigator.storage.getDirectory();
        let downloadDirectory = await root.getDirectoryHandle('downloads', {create: true});

        // @ts-ignore
        let fileObject = await fileHandle.getFile();
        let reader = fileObject.stream();       // Note: Blob.stream() can crash the browser on larger files.
        
        let outputFileHandle = await downloadDirectory.getFileHandle(downloadJob.fuuid + '.decrypted', {create: true});
        // @ts-ignore
        let outputWriter = await outputFileHandle.createWritable({keepExistingData: false});

        let decryptedPosition = 0;
        let interval = setInterval(()=>{
            // console.debug("Decrypt position %s/%s", decryptedPosition, downloadJob.size);
            if(callback && downloadJob.size) {
                callback(downloadJob.fuuid, downloadJob.userId, false, decryptedPosition, downloadJob.size);
            }
        }, 750);

        try {
            for await(let chunk of reader) {
                if(this.cancelled) throw new Error('Cancelled');

                let cleartext = await decipher.update(chunk as any);
                if(cleartext) {
                    await outputWriter.write(cleartext);
                    decryptedPosition += cleartext.length;
                }
            }

            // Finalize decryption
            let finalChunk = await decipher.finalize();
            if(finalChunk) {
                await outputWriter.write(finalChunk);
                decryptedPosition += finalChunk.length;
            }
        } finally {
            clearInterval(interval);
            await outputWriter.close();
        }
    }

}
