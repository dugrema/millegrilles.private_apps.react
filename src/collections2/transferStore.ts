import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DownloadStateEnum, UploadStateEnum } from './idb/collections2StoreIdb';

export enum TransferActivity {
    IDLE=1,
    RUNNING=2,
    ERROR=3
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

    // Data used to prepare the total on screen
    // downloadStartReference: number | null,  // Start of the download period. Files older that this do not get included in the totals.
    // downloadTotalSize: number | null,       // Size to use for calculating 100% of the download completed
    // downloadCompletedSize: number | null,   // Current sum of the completed files to use in the download progress.
    // downloadPosition: number | null,        // Position of the current download worker files
    // decryptionPosition: number | null,      // Position of the current decryption worker files

    // Current processes in workers
    downloadProgress: DownloadTransferProgress[],
    downloadJobs: DownloadJobStoreType[] | null,
    downloadJobsDirty: boolean,

    uploadProgress: UploadTransferProgress[],
    uploadJobs: UploadJobStoreType[] | null,
    uploadJobsDirty: boolean,

    setDownloadTicker: (downloadActivity: TransferActivity, downloadTransferPercent: number | null) => void,
    updateDownloadState: (state: DownloadStateUpdateType) => void,
    setDownloadJobs: (downloadJobs: DownloadJobStoreType[] | null) => void,
    setDownloadJobsDirty: (jobsDirty: boolean) => void,

    updateUploadState: (state: UploadStateUpdateType) => void,
    setUploadJobs: (uploadJobs: UploadJobStoreType[] | null) => void,
    setUploadJobsDirty: (uploadJobsDirty: boolean) => void,
}

const useTransferStore = create<TransferStoreState>()(
    devtools(
        (set) => ({
            downloadActivity: TransferActivity.IDLE,
            downloadTransferPercent: null,
            downloadProgress: [],
            downloadJobs: null,
            downloadJobsDirty: true,

            uploadActivity: TransferActivity.IDLE,
            uploadTransferPercent: null,
            uploadProgress: [],
            uploadJobs: null,
            uploadJobsDirty: true,

            setDownloadTicker: (downloadActivity, downloadTransferPercent) => set(()=>({downloadActivity, downloadTransferPercent})), 
            updateDownloadState: (updatedState) => set((state)=>{
                let values = {} as TransferStoreState;

                // Updates
                if(updatedState.activeTransfers) {
                    values.downloadProgress = updatedState.activeTransfers;
                }
                if(updatedState.listChanged) {
                    values.downloadJobsDirty = true;
                }

                return values;
            }),

            setDownloadJobs: (downloadJobs) => set(()=>({downloadJobs})),
            setDownloadJobsDirty: (downloadJobsDirty) => set(()=>({downloadJobsDirty})),

            updateUploadState: (updatedState) => set((state)=>{
                // console.debug("Received upload state update", state);

                let values = {} as TransferStoreState;

                // Updates
                if(updatedState.activeTransfers) {
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
