import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { DownloadStateEnum, findDownloadPosition, removeDownloadParts, saveDownloadPart, updateDownloadJobState } from '../collections2/idb/collections2StoreIdb';
import { getIterableStream } from '../collections2/transferUtils';

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

    constructor() {
        this.callback = null;
        this.currentJob = null;
    }

    async setup(callback: DownloadWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string): Promise<boolean> {
        if(this.currentJob?.userId === userId && this.currentJob.fuuid === fuuid) {
            throw new Error('todo')
            // return true;
        }
        return false;
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
        return !!this.currentJob;
    }

    async processJob() {
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
                // signal, 
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
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ERROR);
            await callback(currentJob.fuuid, currentJob.userId, true);
        } finally {
            this.currentJob = null;
        }
    }

}

const CONST_SIZE_1MB = 1024 * 1024;
const CONST_SIZE_1GB = 1024 * 1024 * 1024;
// Soft limits for chunks and blobs (will get exceeded).
const CHUNK_SOFT_LIMIT = 1024 * 256;            // Soft limit for chunks in memory

/**
 * Stream the response to the Download parts table. 
 * Uses small buffers and blobs to save the content part by part and support resuming.
 * @param job 
 * @param response 
 */
async function streamResponse(job: DownloadJobType, response: Response, initialPosition: number, statusCallback: (position: number, totalSize: number | null)=>void) {
    if(!response.body) throw new Error('No body to stream');
    let stream = getIterableStream(response.body);
    
    let contentLength = job.size;  // This is the decrypted size. Good approximation but not always exact for the download.
    let contentLengthString = response.headers.get('Content-Length');
    if(typeof(contentLengthString) === 'string') {
        contentLength = Number.parseInt(contentLengthString);  // This is the exact encrypted file size.
    }

    // Determine size of parts - dynamic, depends on file size
    let softPartSize = suggestPartSize(contentLength);
    // console.debug("File size: %d, Part size: %d", contentLength, softPartSize);

    let position = initialPosition;

    // Initial feedback
    statusCallback(position, contentLength);
    // Regular feedback
    let interval = setInterval(()=>statusCallback(position, contentLength), 750);
    
    try {
        let chunks = [] as Uint8Array[];
        let chunksSize = 0;

        let blobPosition = position;    // Position for the next part
        let blobs = [] as Blob[];       // List of blobs to include in the current part
        let blobsSize = 0;              // Current part size
        for await (const chunk of stream) {
            position += chunk.length;
            chunksSize += chunk.length;
            
            chunks.push(chunk);

            if(chunksSize > CHUNK_SOFT_LIMIT) {
                // Concatenate into blob (gives a chance to offload memory)
                let blob = new Blob(chunks);
                blobs.push(blob);
                blobsSize += blob.size;

                // Reset chunks
                chunksSize = 0;
                chunks = [];
            }

            if(blobsSize > softPartSize) {
                // Save to file parts
                let partBlob = new Blob(blobs);  // Concatenate all blobs into one part
                await saveDownloadPart(job.fuuid, blobPosition, partBlob);

                // Reset blobs
                let blobSize = partBlob.size;
                // console.debug("Parts blob %d", blobSize);
                blobPosition += blobSize;   // Increment start position for next blob
                blobsSize = 0;
                blobs = [];
            }
        }

        if(chunks.length > 0) {
            // Final blob
            blobs.push(new Blob(chunks));
        }

        if(blobs.length > 0) {
            // Save final part
            let partBlob = new Blob(blobs);
            await saveDownloadPart(job.fuuid, blobPosition, partBlob);
        }

        // Done
        statusCallback(position, contentLength);
    } finally {
        clearInterval(interval);
    }
}

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

var worker = new DownloadThreadWorker();
expose(worker);
