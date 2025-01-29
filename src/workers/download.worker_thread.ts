import { expose } from 'comlink';
import { DownloadJobType } from './download.worker';
import { DownloadIdbParts, DownloadStateEnum, saveDownloadPart, updateDownloadJobState } from '../collections2/idb/collections2StoreIdb';
import axios from 'axios';

export type DownloadWorkerCallbackType = (fuuid: string, userId: string, position: number, done: boolean)=>Promise<void>;

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
        
        let fuuid = currentJob.fuuid;
        let url = currentJob.url;

        let position = 0;
        try {
            // Check stored download parts to find the resume position (if any)
            //TODO

            // Start downloading
            callback(currentJob.fuuid, currentJob.userId, position, false);
            console.debug("Getting URL", url);
            // let response = await axios({method: 'GET', url, responseType: 'blob', withCredentials: true});
            // console.debug("Response file: ", response);
            // let encryptedBlob = response.data as Blob;
            // // Save encrypted content to IDB
            // await saveDownloadPart(fuuid, 0, encryptedBlob);
            // position = encryptedBlob.size;

            // let response = await axios({method: 'GET', url, responseType: 'stream', withCredentials: true});
            let response = await fetch(url, {
                // signal, 
                cache: 'no-store', keepalive: false, credentials: "include",
                // headers: {'Range': headerContentRange, 'X-Token-Jwt': jwt}
            });
            if(response.status === 206) {
                throw new Error('todo');
            } else if(response.status !== 200) {
                throw new Error(`Invalid HTTP response status: ${response.status}`);
            }
            let contentLength = currentJob.size;  // This is the decrypted size. Good approximation but not always exact for the download.
            let contentLengthString = response.headers.get('Content-Length');
            if(typeof(contentLengthString) === 'string') {
                contentLength = Number.parseInt(contentLengthString);  // This is the exact encrypted file size.
            }
            console.debug("Content length: %d", contentLength);
            await streamResponse(currentJob, response);

            // Done downloading - mark state for decryption
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ENCRYPTED, {position});
            await callback(currentJob.fuuid, currentJob.userId, position, true);
        } catch(err) {
            console.error("Download job error: ", err);
            await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ERROR);
            await callback(currentJob.fuuid, currentJob.userId, position, true);
        } finally {
            this.currentJob = null;
        }
    }

}

const CONST_SIZE_1MB = 1024 * 1024;
// Soft limits for chunks and blobs (will get exceeded).
const CHUNK_SOFT_LIMIT = 1024 * 256;
const PART_SOFT_LIMIT = CONST_SIZE_1MB * 1;

/**
 * Stream the response to the Download parts table. 
 * Uses small buffers and blobs to save the content part by part and support resuming.
 * @param job 
 * @param response 
 */
async function streamResponse(job: DownloadJobType, response: Response) {
    if(!response.body) throw new Error('No body to stream');
    let stream = getIterableStream(response.body);
    
    let position = 0;
    
    let chunks = [] as Uint8Array[];
    let chunksSize = 0;

    let blobPosition = 0;
    let blobs = [] as Blob[];
    let blobsSize = 0;
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

        if(blobsSize > PART_SOFT_LIMIT) {
            // Save to file parts
            let partBlob = new Blob(blobs);  // Concatenate all blobs into one part
            await saveDownloadPart(job.fuuid, blobPosition, partBlob);

            // Reset blobs
            let blobSize = partBlob.size;
            console.debug("Parts blob %d", blobSize);
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
}

// const generateStream = async (): Promise<AsyncIterable<string>> => {
//     const response = await fetch(
//       'http://localhost:5000/api/stream/dummy?chunks_amount=50',
//       {
//         method: 'GET',
//       }
//     )
//     if (response.status !== 200) throw new Error(response.status.toString())
//     if (!response.body) throw new Error('Response body does not exist')
//     return getIterableStream(response.body)
// }

// https://stackoverflow.com/questions/51859873/using-axios-to-return-stream-from-express-app-the-provided-value-stream-is/77107457#77107457
async function* getIterableStream(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
    const reader = body.getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield value;
    }
}

var worker = new DownloadThreadWorker();
expose(worker);
