import axios from 'axios';
import { getUploadPart, updateUploadJobState, UploadStateEnum } from '../collections2/idb/collections2StoreIdb';
import { UploadJobType } from './upload.worker';

export type UploadWorkerCallbackType = (
    uploadId: number, 
    userId: string, 
    done: boolean, 
    position?: number | null,
    size?: number | null
) => Promise<void>;

export class UploadThreadWorker {
    callback: UploadWorkerCallbackType | null
    currentJob: UploadJobType | null

    constructor() {
        this.callback = null;
        this.currentJob = null;
    }

    async setup(callback: UploadWorkerCallbackType) {
        this.callback = callback;
    }

    async cancelJobIf(fuuid: string, userId: string): Promise<boolean> {
        if(this.currentJob?.userId === userId && this.currentJob.fuuid === fuuid) {
            throw new Error('todo')
            // return true;
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

            // Upload completed
            await updateUploadJobState(uploadId, UploadStateEnum.DONE);

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
        }

        // let url = currentJob.url;

        // let positionOuter = 0;
        // let headerContentRange = null as string | null;
        // let headers = {} as {[key: string]: string};
        // try {
        //     // Check stored download parts to find the resume position (if any)
        //     let resumePosition = await findDownloadPosition(currentJob.fuuid);
        //     if(resumePosition) {
        //         positionOuter = resumePosition;
        //         // Add header to request file position from server
        //         headerContentRange = `bytes=${resumePosition}-`
        //         headers['Range'] = headerContentRange;
        //     }

        //     // Start downloading
        //     // console.debug("Getting URL", url);
        //     let response = await fetch(url, {
        //         // signal, 
        //         cache: 'no-store', keepalive: false, credentials: "include", headers,
        //     });
        //     if(response.status === 206) {
        //         // Resuming
        //         console.debug("Resuming download of fuuid:%s from position", currentJob.fuuid, positionOuter);
        //     } else if(response.status === 200) {
        //         if(positionOuter > 0) {
        //             // No resuming possible
        //             positionOuter = 0;
        //             // Clear already downloaded parts
        //             await removeDownloadParts(currentJob.fuuid);
        //         }
        //     } else if(response.status !== 200) {
        //         throw new Error(`Invalid HTTP response status: ${response.status}`);
        //     }

        //     let currentJobLocal = currentJob;
        //     let statusCallback = (position: number, totalSize: number | null) => {
        //         positionOuter = position;
        //         if(!totalSize) totalSize = currentJobLocal.size;
        //         // console.debug("Download position for file %s: %d / %d", currentJobLocal.fuuid, position, totalSize);
        //         if(callback && totalSize) {
        //             callback(currentJobLocal.fuuid, currentJobLocal.userId, false, position, totalSize);
        //         }
        //     }

        //     // console.debug("Content length: %d", contentLength);
        //     await streamResponse(currentJob, response, positionOuter, statusCallback);

        //     // Done downloading - mark state for decryption
        //     await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ENCRYPTED, {position: positionOuter});
        //     this.currentJob = null;  // Remove job before callback - allows chaining to next job
        //     await callback(currentJob.fuuid, currentJob.userId, true, positionOuter, positionOuter);
        // } catch(err) {
        //     console.error("Download job error: ", err);
        //     await updateDownloadJobState(currentJob.fuuid, currentJob.userId, DownloadStateEnum.ERROR);
        //     await callback(currentJob.fuuid, currentJob.userId, true);
        // } finally {
        //     this.currentJob = null;
        // }
    }

    async uploadFile(uploadId: number, fuuid: string, filehostUrl: string, fileSize: number) {

        const postUrl = `${filehostUrl}/files/${fuuid}`;

        // Iterate through parts to upload from IDB for this uploadId.
        let position = 0;
        while(true) {
            // Get next part
            let part = await getUploadPart(uploadId, position);
            if(!part) break;  // Done

            let partSize = part.content.size;

            let putUrl = `${postUrl}/${position}`;
            console.debug("Upload to ", putUrl);
            await axios({
                method: 'PUT', 
                url: putUrl,
                withCredentials: true,
                data: part.content
            });

            // Increment position with current part size
            position += partSize;
        }

        // Compare uploaded size to expected file size
        if(position !== fileSize) {
            // Delete uploaded content from server (invalid).

            throw new Error('Mismatch in expected file size and uploaded parts');
        }

        // Post to complete file upload
        console.debug("Post to ", postUrl);
        await axios({
            method: 'POST',
            url: postUrl,
            withCredentials: true,
        });

    }
}
