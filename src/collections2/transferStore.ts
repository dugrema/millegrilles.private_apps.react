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

export type TransferProgress = {[fuuid: string]: {state: DownloadStateEnum, transferPercent: number}};

/** Used to update the download state from the worker. */
export type DownloadStateUpdateType = {
    activity?: TransferActivity | null,     // Overall download state.
    transferPercent?: number | null,        // Overall progress of downloads. Excludes Paused and also Done since before last reset/100%.
    activeTransfers?: TransferProgress,     // State of transfers in workers (download, decryption).
    listChanged?: boolean,                  // Transfers added/removed.
};

interface TransferStoreState {
    downloadActivity: TransferActivity,
    downloadTransferPercent: number | null,
    updateDownloadState: (state: DownloadStateUpdateType) => void,
}

const useTransferStore = create<TransferStoreState>()(
    devtools(
        (set) => ({
            downloadActivity: TransferActivity.IDLE,
            downloadTransferPercent: null,

            updateDownloadState: (state) => {
                console.debug("Received download state update", state);
                set({});
            },

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
