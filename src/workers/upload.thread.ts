import axios, { AxiosProgressEvent } from 'axios';
import { getUploadPart, removeUploadParts, updateUploadJobState, UploadStateEnum } from '../collections2/idb/collections2StoreIdb';
import { UploadJobType } from './upload.worker';
import { THROTTLE_UPLOAD } from './encryptionUtils';

export type UploadWorkerCallbackType = (
    uploadId: number, 
    userId: string, 
    done: boolean, 
    position?: number | null,
    size?: number | null,
    stateChanged?: boolean | null,
) => Promise<void>;

export class UploadThreadWorker {
    callback: UploadWorkerCallbackType | null
    currentJob: UploadJobType | null
    abortController: AbortController | null

    constructor() {
        this.callback = null;
        this.currentJob = null;
        this.abortController = null;
    }

    async setup(callback: UploadWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(uploadId: number): Promise<boolean> {
        if(this.currentJob?.uploadId === uploadId) {
            this.abortController?.abort();
            return true;
        }
        return false;
    }

    async addJob(uploadJob: UploadJobType): Promise<void> {
        if(!!this.currentJob) throw new Error('Busy');
        this.currentJob = uploadJob;
        if(!this.callback) throw new Error('Callback not wired');

        // Change job state to UPLOADING
        let uploadUrl = uploadJob?.uploadUrl || undefined;
        await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.UPLOADING, {uploadUrl});

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

        let {uploadId, fuuid, uploadUrl, size} = currentJob;

        try {
            if(!callback) throw new Error('Callback not wired');
            if(!fuuid) throw new Error('File unique identifier (fuuid) not provided');
            if(!uploadUrl) throw new Error('No filehost url provided for the upload');
            if(!size) throw new Error('No file size provided for the upload');
            
            // Run the upload
            await this.uploadFile(uploadId, fuuid, uploadUrl, size);

            // Upload complete, state is either VERIFYING or DONE. 
            // Send feedback, triggers the next job
            callback(uploadId, currentJob.userId, true, currentJob.size, currentJob.size);

        } catch(err) {
            console.error("Error uploading file %O: %O", currentJob, err);
            await updateUploadJobState(uploadId, UploadStateEnum.ERROR);
            if(callback) {
                await callback(uploadId, currentJob.userId, true);
            }
        } finally {
            // Free job
            this.currentJob = null;
            this.abortController = null;
        }
    }

    async uploadFile(uploadId: number, fuuid: string, filehostUrl: string, fileSize: number) {

        const callback = this.callback;
        const postUrl = `${filehostUrl}/files/${fuuid}`;

        // Iterate through parts to upload from IDB for this uploadId.
        let position = 0;
        this.abortController = new AbortController();

        let currentJob = this.currentJob;
        if(!currentJob) throw new Error("Current job not set");
        if(!callback) throw new Error("Callback not initialized");
        let onUploadProgress = (e: AxiosProgressEvent) => {
            if(!currentJob) throw new Error("Current job not set (inner)");
            progressEventHandler(e, currentJob, position, callback);
        };

        // Triger change on file state
        await updateUploadJobState(uploadId, UploadStateEnum.UPLOADING);
        callback(uploadId, currentJob.userId, false, 0, currentJob.size, true);
        
        while(true) {
            // Get next part
            let part = await getUploadPart(uploadId, position);
            if(!part) break;  // Done

            let partSize = part.content.size;

            let putUrl = `${postUrl}/${position}`;
            if(THROTTLE_UPLOAD) await new Promise(resolve=>(setTimeout(resolve, THROTTLE_UPLOAD)));  // Throttle
            await axios({
                method: 'PUT', 
                url: putUrl,
                withCredentials: true,
                data: part.content,
                signal: this.abortController.signal,
                onUploadProgress,
            });

            if(this.abortController.signal.aborted) {
                return;  // Stop the upload
            }

            // Increment position with current part size
            position += partSize;
        }

        // Compare uploaded size to expected file size
        if(position !== fileSize) {
            // Delete uploaded content from server (invalid).

            throw new Error('Mismatch in expected file size and uploaded parts');
        }

        // All parts have been completed. 
        // Mark file as uploaded pending the server-side verification.
        await updateUploadJobState(uploadId, UploadStateEnum.VERIFYING);
        callback(uploadId, currentJob.userId, false, currentJob.size, currentJob.size, true);

        // Launch a promise to tell the server to finish processing the file.
        // Wait for a while but then move on to the next upload if it takes too long.
        let processFilePromise = Promise.resolve().then(async () => {
            try {

                // Start server-side verification.
                let response = await axios({
                    method: 'POST',
                    url: postUrl,
                    withCredentials: true,
                    timeout: 300_000,    // The server will check the entire file. Give 5 minutes then consider failed.
                });

                if(response.status !== 200) {
                    throw new Error('Unsupported response status for file uploda POST verification: ' + response.status);
                }

                console.debug("Marking file upload as done. Cleaning up.")
                await updateUploadJobState(uploadId, UploadStateEnum.DONE);
                await removeUploadParts(uploadId);

                return true;
            } catch(err) {
                await updateUploadJobState(uploadId, UploadStateEnum.ERROR);

                // let errAxios = err as AxiosError;
                // if(errAxios.code === 'ECONNABORTED') {
                //     // Client-side timeout. The server is still checking the file. 
                //     // Will have to rely on getting the newFuuid event or a "visits" entry in the file.
                //     console.warn("Timeout POST");
                // }

                throw err;
            }
        }) as Promise<boolean>;

        let timeoutPromise = new Promise(resolve=>{
            setTimeout(()=>{
                // console.debug("File POST timeout promise done");
                resolve(false);
            }, 15_000);
        }) as Promise<boolean>;

        // Race the two promises. If the verification finishes up first (result===true), all good.
        // If the timeout occurs (result===false), we'll just move on. 
        // The upload will still get marked as completed when the server returns (within the axios timeout). 
        // If all else fails, the newFuuid events and "visits" file element will indicate that the file was 
        // successfully uploaded. The flag in IDB remains VERIFYING until then. 
        // Manual cleanup may be necessary upon failure. This allows retrying the upload.
        let result = await Promise.race([processFilePromise, timeoutPromise]);
        console.debug("Race result: ", result);
        if(!result) {
            console.debug("Timeout waiting for file response, moving to next upload");

            // Attach an error handler on the dangling download process
            processFilePromise.catch(err=>console.error("Error finishing file upload: ", err));
        }
    }
}

function progressEventHandler(e: AxiosProgressEvent, job: UploadJobType, position: number, callback: UploadWorkerCallbackType) {
    let totalSize = job.size;
    let partPosition = e.loaded;
    let currentPosition = position + partPosition;
    callback(job.uploadId, job.userId, false, currentPosition, totalSize)
        .catch(err=>console.error("Error on progressEventHandler", err));
}


// Axios error codes from https://dev.to/mperon/axios-error-handling-like-a-boss-333d
// ERR_FR_TOO_MANY_REDIRECTS, ERR_BAD_OPTION_VALUE, ERR_BAD_OPTION, ERR_NETWORK, ERR_DEPRECATED, ERR_BAD_RESPONSE, ERR_BAD_REQUEST, ERR_CANCELED, ECONNABORTED, ETIMEDOUT
