import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Collection2ConversionJob } from '../workers/connection.worker';

export type FileInfoJobs = {tuuid: string, name?: string | null, size?: number | null, thumbnail?: Blob | null};
export type ConversionJobStoreItem = Collection2ConversionJob & FileInfoJobs;

interface MediaConversionStoreState {
    currentJobs: {[jobId: string]: ConversionJobStoreItem} | null,
    tuuidsToLoad: string[] | null,
    setTuuidsToLoad: (tuuids: string[] | null) => void,
    updateConversionJobs: (jobs: ConversionJobStoreItem[] | null) => void,
    setFileInfoConversionJobs: (jobInfo: FileInfoJobs[]) => void,
}

const useMediaConversionStore = create<MediaConversionStoreState>()(
    devtools(
        (set) => ({
            currentJobs: null,
            tuuidsToLoad: null,
            setTuuidsToLoad: (tuuids) => set(()=>({tuuidsToLoad: tuuids})),
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
            setFileInfoConversionJobs: (jobInfo) => set((state)=>{
                let currentJobs = state.currentJobs;
                if(!currentJobs) return {};
                currentJobs = {...currentJobs};  // Copy

                for(let job of Object.values(currentJobs)) {
                    let tuuid = job.tuuid;
                    let fileinfo = jobInfo.filter(item=>item.tuuid === tuuid).pop();
                    if(fileinfo) {
                        // Update job
                        currentJobs[job.job_id] = {...job, ...fileinfo};
                    }
                }

                return {currentJobs};
            }),
        }),
    )
);

export default useMediaConversionStore;
