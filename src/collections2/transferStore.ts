import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DownloadStateEnum } from './idb/collections2StoreIdb';

// export type FileInfoJobs = {tuuid: string, name?: string | null, size?: number | null, thumbnail?: Blob | null};
// export type ConversionJobUpdate = {job_id: string, tuuid: string, fuuid: string, etat?: EtatJobEnum, pct_progres?: number};
// export type ConversionJobStoreItem = Collection2ConversionJob & FileInfoJobs;

export enum TransferActivity {
    IDLE=1,
    RUNNING=2,
    ERROR=3
};

export enum WorkerType {
    DOWNLOAD = 1,
    DECRYPTION,
}

export type TransferProgress = {workerType: WorkerType, fuuid: string, state: DownloadStateEnum, position: number, totalSize: number};

/** Used to update the download state from the worker. */
export type DownloadStateUpdateType = {
    activity?: TransferActivity | null,     // Overall download state.
    transferPercent?: number | null,        // Overall progress of downloads. Excludes Paused and also Done since before last reset/100%.
    activeTransfers?: TransferProgress[],   // State of transfers in workers (download, decryption).
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
    downloadProgress: TransferProgress[],
    downloadJobs: DownloadJobStoreType[] | null,
    jobsDirty: boolean,

    setDownloadTicker: (downloadActivity: TransferActivity, downloadTransferPercent: number | null) => void,
    updateDownloadState: (state: DownloadStateUpdateType) => void,
    setDownloadJobs: (downloadJobs: DownloadJobStoreType[] | null) => void,
    setJobsDirty: (jobsDirty: boolean) => void,
}

const useTransferStore = create<TransferStoreState>()(
    devtools(
        (set) => ({
            downloadActivity: TransferActivity.IDLE,
            downloadTransferPercent: null,
            downloadProgress: [],
            downloadJobs: null,
            jobsDirty: true,

            setDownloadTicker: (downloadActivity, downloadTransferPercent) => set(()=>({downloadActivity, downloadTransferPercent})), 
            updateDownloadState: (updatedState) => set((state)=>{
                console.debug("Received download state update", state);

                let values = {} as TransferStoreState;

                // Updates
                if(updatedState.activeTransfers) {
                    values.downloadProgress = updatedState.activeTransfers;
                }
                if(updatedState.listChanged) {
                    values.jobsDirty = true;
                }

                return values;
            }),

            setDownloadJobs: (downloadJobs) => set(()=>({downloadJobs})),
            setJobsDirty: (jobsDirty) => set(()=>({jobsDirty})),

            // setConversionJobs: (jobs) => set((state)=>{
            //     if(!jobs) {
            //         // Clear
            //         return {currentJobs: null};
            //     }

            //     let currentJobs = {} as {[jobId: string]: ConversionJobStoreItem};

            //     if(state.currentJobs) {
            //         // Copy existing directory
            //         currentJobs = {...state.currentJobs};
            //     }

            //     // Add and replace existing jobs
            //     for(let file of jobs) {
            //         let jobId = file.job_id;
            //         currentJobs[jobId] = file;
            //     }

            //     return {currentJobs};
            // }),
        }),
    )
);

export default useTransferStore;
