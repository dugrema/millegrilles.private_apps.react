import axios, { AxiosError, AxiosProgressEvent } from 'axios';
import { getUploadPart, removeUploadParts, updateUploadJobState, UploadStateEnum } from '../collections2/idb/collections2StoreIdb';
import { UploadJobType } from './upload.worker';
import { THROTTLE_UPLOAD } from './encryptionUtils';

const CONST_WORKER_UPLOAD_LOCK = 'worker_upload';

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
    pauseUpload: boolean

    constructor() {
        this.callback = null;
        this.currentJob = null;
        this.abortController = null;
        this.pauseUpload = false;
    }

    async setup(callback: UploadWorkerCallbackType) {
        this.callback = callback;
    }

    async pauseJob(): Promise<boolean> {
        if(this.currentJob) {
            await updateUploadJobState(this.currentJob.uploadId, UploadStateEnum.PAUSED);
            this.pauseUpload = true;
            this.abortController?.abort();
            return true;
        }
        return false;
    }

    async cancelJobIf(uploadId: number, opts?: {pause?: boolean}): Promise<boolean> {
        if(this.currentJob?.uploadId === uploadId) {
            if(opts?.pause) {
                this.pauseUpload = true;
            }
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
        if(!!this.currentJob) return true;

        // Use site level lock in the browser as second level check
        let busy = await navigator.locks.request(CONST_WORKER_UPLOAD_LOCK, {ifAvailable: true}, async lock => {
            // console.debug("Lock check: %s, %O", lock?.name, lock?.mode);
            if(!lock) return true;  // Busy
            return false;
        });

        return busy;
    }

    async processJob() {
        await navigator.locks.request(CONST_WORKER_UPLOAD_LOCK, {ifAvailable: true}, async lock => {
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
            await updateUploadJobState(uploadId, UploadStateEnum.ERROR_DURING_PART_UPLOAD);
            if(callback) {
                await callback(uploadId, currentJob.userId, true);
            }
        } finally {
            // Free job
            this.currentJob = null;
            this.abortController = null;
            this.pauseUpload = false;
        }
    }

    async uploadFile(uploadId: number, fuuid: string, filehostUrl: string, fileSize: number) {

        const callback = this.callback;
        const postUrl = `${filehostUrl}/files/${fuuid}`;

        // Iterate through parts to upload from IDB for this uploadId.
        let abortController = new AbortController();
        this.abortController = abortController;
        this.pauseUpload = false;

        let currentJob = this.currentJob;
        if(!currentJob) throw new Error("Current job not set");
        if(!callback) throw new Error("Callback not initialized");

        // Triger change on file state
        await updateUploadJobState(uploadId, UploadStateEnum.UPLOADING);
        callback(uploadId, currentJob.userId, false, 0, currentJob.size, true);

        // Upload all file parts
        let position = await this.uploadParts(postUrl, abortController.signal);
        if(abortController.signal.aborted) return;  // Abort process

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

                // console.debug("Marking file upload as done. Cleaning up.")
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
        // console.debug("Race result: ", result);
        if(!result) {
            console.info("Timeout waiting for file verification, moving to next upload");

            // Attach a job complete callback and error handler on the dangling download process
            let userId = currentJob.userId;
            processFilePromise
                .then(async ()=>{
                    await callback(uploadId, userId, true);
                })
                .catch(err=>console.error("Error finishing file upload: ", err));
        }
    }

    async uploadParts(postUrl: string, signal: AbortSignal): Promise<number | null> {
        const callback = this.callback;
        if(!callback) throw new Error('Callback not initialized');

        let currentJob = this.currentJob;
        if(!currentJob) throw new Error('No job to upload');
        
        let uploadId = currentJob.uploadId;

        let position = 0;

        let onUploadProgress = (e: AxiosProgressEvent) => {
            if(!currentJob) throw new Error("Current job not set (inner)");
            progressEventHandler(e, currentJob, position, callback);
        };

        while(true) {
            // Get next part
            let part = await getUploadPart(uploadId, position);
            // console.debug("Loaded part %s/%s: %O", uploadId, position, part);
            if(!part) break;  // Done

            // Give the browser a chance to offload the part Uint8Array from memory by using a blob
            let partSize = part.content.size;
            let partDataBlob = new Blob([part.content]);
            part = null;

            let putUrl = `${postUrl}/${position}`;
            if(THROTTLE_UPLOAD) await new Promise(resolve=>(setTimeout(resolve, THROTTLE_UPLOAD)));  // Throttle
            try {
                await axios({
                    method: 'PUT', 
                    url: putUrl,
                    withCredentials: true,
                    data: partDataBlob,
                    signal,
                    onUploadProgress,
                });
            } catch(err) {
                if(signal.aborted) {
                    if(!this.pauseUpload) {
                        // Upload cancelled - send DELETE command to filehost
                        axios({method: 'POST', data: {'cancel': true}, url: postUrl, withCredentials: true})
                            .catch(err=>console.warn("Error sending cancel command to filehost for cancelled upload", err));
                    }
                    // Update process progress (done)
                    await callback(uploadId, currentJob.userId, true);
                    return null;
                } else {
                    let axiosErr = err as AxiosError;
                    if(axiosErr.status === 412) {
                        // The part is already uploaded. Just move on to next.
                        // console.warn("axiosErro headers info: %O", axiosErr.response?.headers);
                        const currentPositionStr = axiosErr.response?.headers['x-current-position'];
                        const currentPositionInt = Number.parseInt(currentPositionStr);
                        if(currentPositionInt) {
                            console.info("Resetting upload position from header value: %s", currentPositionInt);
                            position = currentPositionInt;
                            continue;
                        } else {
                            console.info("part %s already uploaded", position);
                        }
                    } else {
                        // Unhandled upload error
                        throw err;
                    }
                }
            }

            // Increment position with current part size
            position += partSize;
        }

        return position;
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
