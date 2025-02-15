import { DownloadJobType } from './download.worker';
import { DownloadStateEnum, findDownloadPosition, removeDownloadParts, updateDownloadJobState } from '../collections2/idb/collections2StoreIdb';

const CONST_WORKER_DOWNLOAD_LOCK = 'worker_download';

export type DownloadWorkerCallbackType = (
    fuuid: string, 
    userId: string, 
    done: boolean, 
    position?: number | null,
    size?: number | null
) => Promise<void>;

export class DownloadThreadWorker {
    callback: DownloadWorkerCallbackType | null
    currentJob: DownloadJobType | null
    abortController: AbortController | null

    constructor() {
        this.callback = null;
        this.currentJob = null;
        this.abortController = null;
    }

    async setup(callback: DownloadWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string): Promise<boolean> {
        if(this.currentJob?.userId === userId && this.currentJob.fuuid === fuuid) {
            if(this.abortController) {
                this.abortController.abort();    
                return true;
            }
        }
        return false;
    }

    async pauseJob() {
        // Just cancel the current job if any.
        this.abortController?.abort();
    }

    async addJob(downloadJob: DownloadJobType): Promise<void> {
        if(!!this.currentJob) throw new Error('Busy');
        this.currentJob = downloadJob;
        if(!this.callback) throw new Error('Callback not wired');
        this.processJob().catch(err=>{
            console.error("Error processing download job", err);
        })
    }

    async isBusy(): Promise<boolean> {
        if(!!this.currentJob) return true;

        // Use site level lock in the browser as second level check
        let busy = await navigator.locks.request(CONST_WORKER_DOWNLOAD_LOCK, {ifAvailable: true}, async lock => {
            // console.debug("Lock check: %s, %O", lock?.name, lock?.mode);
            if(!lock) return true;  // Busy
            return false;
        });

        return busy;
    }
    
    async processJob() {
        await navigator.locks.request(CONST_WORKER_DOWNLOAD_LOCK, {ifAvailable: true}, async lock => {
            // console.debug("Lock check before job: %s, %O", lock?.name, lock?.mode);
            if(!lock) throw new Error('Busy');  // Busy

            // Run the job, the lock is exclusive and will prevent dedicated workers in other tables from processing.
            await this._processJob();
        });
    }

    async _processJob() {
        let currentJob = this.currentJob;
        let callback = this.callback;

        // Validations
        if(!currentJob) return;  // Nothing to do
        if(!callback) throw new Error('Callback not wired');
        
        let url = currentJob.url;

        let positionOuter = 0;
        let headerContentRange = null as string | null;
        let headers = {} as {[key: string]: string};
        try {
            let abortController = new AbortController();
            this.abortController = abortController;
            // Check stored download parts to find the resume position (if any)
            let resumePosition = await findDownloadPosition(currentJob.fuuid);
            if(resumePosition) {
                positionOuter = resumePosition;
                // Add header to request file position from server
                headerContentRange = `bytes=${resumePosition}-`
                headers['Range'] = headerContentRange;
            }

            // Start downloading
            // console.debug("Getting URL", url);
            let response = await fetch(url, {
                signal: abortController.signal,
                cache: 'no-store', keepalive: false, credentials: "include", headers,
            });
            if(response.status === 206) {
                // Resuming
                console.debug("Resuming download of fuuid:%s from position", currentJob.fuuid, positionOuter);
            } else if(response.status === 200) {
                if(positionOuter > 0) {
                    // No resuming possible
                    positionOuter = 0;
                    // Clear already downloaded parts
                    await removeDownloadParts(currentJob.fuuid);
                }
            } else if(response.status !== 200) {
                throw new Error(`Invalid HTTP response status: ${response.status}`);
            }

            let currentJobLocal = currentJob;
            let statusCallback = (position: number, totalSize: number | null) => {
                positionOuter = position;
                if(!totalSize) totalSize = currentJobLocal.size;
                // console.debug("Download position for file %s: %d / %d", currentJobLocal.fuuid, position, totalSize);
                if(callback && totalSize) {
                    callback(currentJobLocal.fuuid, currentJobLocal.userId, false, position, totalSize);
                }
            }

            // console.debug("Content length: %d", contentLength);
            await streamResponse(currentJob, response, positionOuter, statusCallback);

            // Done downloading - mark state for decryption
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ENCRYPTED, {position: positionOuter});
            this.currentJob = null;  // Remove job before callback - allows chaining to next job
            await callback(currentJob.fuuid, currentJob.userId, true, positionOuter, positionOuter);
        } catch(err) {
            console.error("Download job error: ", err);
            if(this.abortController?.signal.aborted) {
                // Download has been cancelled - not an error
            } else {
                // Error
                await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ERROR);
            }
            await callback(currentJob.fuuid, currentJob.userId, true);
        } finally {
            this.currentJob = null;
            this.abortController = null;
        }
    }

}

/**
 * Stream the response to the Download parts table. 
 * Uses small buffers and blobs to save the content part by part and support resuming.
 * @param job 
 * @param response 
 */
async function streamResponse(job: DownloadJobType, response: Response, initialPosition: number, statusCallback: (position: number, totalSize: number | null)=>void) {
    if(!response.body) throw new Error('No body to stream');
    // let stream = getIterableStream(response.body);
    
    let contentLength = job.size;  // This is the decrypted size. Good approximation but not always exact for the download.
    let contentLengthString = response.headers.get('Content-Length');
    if(typeof(contentLengthString) === 'string') {
        contentLength = Number.parseInt(contentLengthString);  // This is the exact encrypted file size.
    }

    let position = initialPosition;

    // Initial feedback
    statusCallback(position, contentLength);
    // Regular feedback
    let interval = setInterval(()=>statusCallback(position, contentLength), 750);

    // @ts-ignore
    let writeFileHandle = null as FileSystemWritableFileStream | null;
    try {
        let root = await navigator.storage.getDirectory();
        let downloadDirectory = await root.getDirectoryHandle('downloads', {create: true});
        let fileHandle = await downloadDirectory.getFileHandle(job.fuuid, {create: true});
        let fileObject = await fileHandle.getFile();

        // syncFileHandle = await fileHandle.createSyncAccessHandle();
        if(position > 0) {
            let fileSize = fileObject.size;
            if(fileSize !== position) throw new Error("File position downloading and actual mismatch");
        }
        // @ts-ignore
        writeFileHandle = await fileHandle.createWritable({keepExistingData: true});

        let reader = response.body.getReader();
        let streamResult = await reader.read();
        while(!streamResult.done) {
            if(streamResult.value) {
                await writeFileHandle.write(streamResult.value);
                position += streamResult.value.length;
            }
            streamResult = await reader.read();
        }

        // Done
        statusCallback(position, contentLength);
    } finally {
        clearInterval(interval);
        if(writeFileHandle) {
            await writeFileHandle.close();
        }
    }
}
