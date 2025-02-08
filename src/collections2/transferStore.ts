import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DownloadStateEnum, UploadStateEnum } from './idb/collections2StoreIdb';

export enum TransferActivity {
    IDLE_EMTPY=1,           // No items
    IDLE_CONTENT=2,         // Items but no activity
    RUNNING_ENCRYPTION=3,   // Upload only, this step must not be interrupted
    RUNNING=4,              // At least 1 worker running (upload, download or decryption, encryption is a different state)
    PENDING=5,              // No worker running, at least 1 item in pause/recoverable error state
    ERROR=99,               // At least 1 transfer in _unrecoverable_ error
};

// Downloads

export enum DownloadWorkerType {
    DOWNLOAD = 1,
    DECRYPTION,
};

export type DownloadTransferProgress = {workerType: DownloadWorkerType, fuuid: string, state: DownloadStateEnum, position: number, totalSize: number};

/** Used to update the download state from the worker. */
export type DownloadStateUpdateType = {
    activity?: TransferActivity | null,     // Overall download state.
    transferPercent?: number | null,        // Overall progress of downloads. Excludes Paused and also Done since before last reset/100%.
    activeTransfers?: DownloadTransferProgress[],   // State of transfers in workers (download, decryption).
    listChanged?: boolean,                  // Transfers added/removed.
};

export type DownloadJobStoreType = {
    fuuid: string,
    tuuid: string,

    // Download information
    processDate: number,            // Time added/errored in millisecs.
    state: DownloadStateEnum,       // Indexed by [userId, state, processDate].
    size: number | null,            // Encrypted file size
    retry: number,

    // Content
    filename: string,
    mimetype: string,
};

// Uploads

export enum UploadWorkerType {
    UPLOAD = 1,
    ENCRYPTION,
};

export type UploadTransferProgress = {workerType: UploadWorkerType, uploadId: number, state: UploadStateEnum, position: number, totalSize: number};

/** Used to update the download state from the worker. */
export type UploadStateUpdateType = {
    activity?: TransferActivity | null,             // Overall upload state.
    transferPercent?: number | null,                // Overall progress of uploads. Excludes Paused and also Done since before last reset/100%.
    activeTransfers?: UploadTransferProgress[],     // State of transfers in workers (upload, encryption).
    listChanged?: boolean,                          // Transfers added/removed.
};

export type UploadJobStoreType = {
    uploadId: number,

    // Upload information
    processDate: number,            // Time added/errored in millisecs.
    state: UploadStateEnum,
    clearSize: number,              // Decrypted file size
    size: number | null,            // Encrypted file size
    retry: number,

    // Content
    filename: string,
    mimetype: string,
    cuuid: string,
    destinationPath: string,
};

// Store definition

interface TransferStoreState {
    // Overall activity, used for transfer items in menu
    downloadActivity: TransferActivity,
    downloadTransferPercent: number | null,
    downloadSummary: {[state: number]: number},
    downloadSessionStart: Date | null,          // Used to include DONE downloads for the current progress

    uploadActivity: TransferActivity,
    uploadTransferPercent: number | null,
    uploadSummary: {[state: number]: number},
    uploadSessionStart: Date | null,          // Used to include DONE downloads for the current progress

    // Current processes in workers
    downloadProgress: DownloadTransferProgress[],
    downloadJobs: DownloadJobStoreType[] | null,
    downloadJobsDirty: boolean,

    uploadProgress: UploadTransferProgress[],
    uploadJobs: UploadJobStoreType[] | null,
    uploadJobsDirty: boolean,

    setDownloadTicker: (downloadActivity: TransferActivity, downloadTransferPercent: number | null, opts?: {states: {[state: number]: number}}) => void,
    setDownloadSessionStart: (downloadSessionStart: Date | null) => void,
    updateDownloadState: (state: DownloadStateUpdateType) => void,
    setDownloadJobs: (downloadJobs: DownloadJobStoreType[] | null) => void,
    setDownloadJobsDirty: (jobsDirty: boolean) => void,

    setUploadTicker: (uploadActivity: TransferActivity, uploadTransferPercent: number | null, opts?: {states: {[state: number]: number}}) => void,
    setUploadSessionStart: (uploadSessionStart: Date | null) => void,
    updateUploadState: (state: UploadStateUpdateType) => void,
    setUploadJobs: (uploadJobs: UploadJobStoreType[] | null) => void,
    setUploadJobsDirty: (uploadJobsDirty: boolean) => void,
}

const useTransferStore = create<TransferStoreState>()(
    devtools(
        (set) => ({
            downloadActivity: TransferActivity.IDLE_EMTPY,
            downloadTransferPercent: null,
            downloadSummary: {},
            downloadSessionStart: null,

            uploadActivity: TransferActivity.IDLE_EMTPY,
            uploadTransferPercent: null,
            uploadSummary: {},
            uploadSessionStart: null,

            downloadProgress: [],
            downloadJobs: null,
            downloadJobsDirty: true,

            uploadProgress: [],
            uploadJobs: null,
            uploadJobsDirty: true,

            setDownloadTicker: (downloadActivity, downloadTransferPercent, opts) => set(()=>{
                let values = {downloadActivity, downloadTransferPercent} as TransferStoreState;
                if(opts?.states) {
                    values.downloadSummary = opts.states;
                }
                return values;
            }), 
            setDownloadSessionStart: (downloadSessionStart) => set(()=>({downloadSessionStart})), 
            updateDownloadState: (updatedState) => set((state)=>{
                let values = {} as TransferStoreState;

                // Updates
                if(updatedState.activeTransfers) {
                    // Save new session start
                    if(!state.downloadSessionStart) values.downloadSessionStart = new Date();
                    values.downloadProgress = updatedState.activeTransfers;
                }
                if(updatedState.listChanged) {
                    values.downloadJobsDirty = true;
                }

                return values;
            }),

            setDownloadJobs: (downloadJobs) => set(()=>({downloadJobs})),
            setDownloadJobsDirty: (downloadJobsDirty) => set(()=>({downloadJobsDirty})),

            setUploadTicker: (uploadActivity, uploadTransferPercent, opts) => set(()=>{
                let values = {uploadActivity, uploadTransferPercent} as TransferStoreState;
                if(opts?.states) {
                    values.uploadSummary = opts.states;
                }
                return values;
            }), 
            setUploadSessionStart: (uploadSessionStart) => set(()=>({uploadSessionStart})), 
            updateUploadState: (updatedState) => set((state)=>{
                // console.debug("Received upload state update", state);

                let values = {} as TransferStoreState;

                // Updates
                if(updatedState.activeTransfers) {
                    if(!state.uploadSessionStart) values.uploadSessionStart = new Date();
                    values.uploadProgress = updatedState.activeTransfers;
                }
                if(updatedState.listChanged) {
                    values.uploadJobsDirty = true;
                }

                return values;
            }),

            setUploadJobs: (uploadJobs) => set(()=>({uploadJobs})),
            setUploadJobsDirty: (uploadJobsDirty) => set(()=>({uploadJobsDirty})),
        }),
    )
);

export default useTransferStore;
