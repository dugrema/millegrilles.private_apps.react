import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Collection2ConversionJob } from '../workers/connection.worker';

export type ConversionJobStoreItem = Collection2ConversionJob & {name?: string | null};

interface MediaConversionStoreState {
    currentJobs: {[jobId: string]: ConversionJobStoreItem} | null,
    updateConversionJobs: (jobs: ConversionJobStoreItem[] | null) => void,
}

const useMediaConversionStore = create<MediaConversionStoreState>()(
    devtools(
        (set) => ({
            currentJobs: null,
            updateConversionJobs: (jobs) => set((state)=>{
                if(!jobs) {
                    // Clear
                    return {currentJobs: null};
                }

                let currentJobs = {} as {[jobId: string]: ConversionJobStoreItem};
                if(state.currentJobs) {
                    // Copy existing directory
                    currentJobs = {...state.currentJobs};
                }

                // Add and replace existing jobs
                for(let file of jobs) {
                    let jobId = file.job_id;
                    currentJobs[jobId] = file;
                }

                return {currentJobs};
            }),
        }),
    )
);

export default useMediaConversionStore;
