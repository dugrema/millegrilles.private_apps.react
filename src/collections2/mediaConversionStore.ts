import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  Collection2ConversionJob,
  EtatJobEnum,
} from "../types/connection.types";

export type FileInfoJobs = {
  tuuid: string;
  name?: string | null;
  size?: number | null;
  thumbnail?: Blob | null;
};
export type ConversionJobUpdate = {
  job_id: string;
  tuuid: string;
  fuuid: string;
  etat?: EtatJobEnum;
  pct_progres?: number;
};
export type ConversionJobStoreItem = Collection2ConversionJob & FileInfoJobs;

interface MediaConversionStoreState {
  currentJobs: { [jobId: string]: ConversionJobStoreItem } | null;
  tuuidsToLoad: string[] | null;
  setTuuidsToLoad: (tuuids: string[] | null) => void;
  setConversionJobs: (jobs: ConversionJobStoreItem[] | null) => void;
  updateConversionJob: (job: ConversionJobUpdate) => void;
  removeConversionJobs: (jobIds: string[]) => void;
  setFileInfoConversionJobs: (jobInfo: FileInfoJobs[]) => void;
}

const useMediaConversionStore = create<MediaConversionStoreState>()(
  devtools((set) => ({
    currentJobs: null,
    tuuidsToLoad: null,
    setTuuidsToLoad: (tuuids) => set(() => ({ tuuidsToLoad: tuuids })),
    setConversionJobs: (jobs) =>
      set((state) => {
        if (!jobs) {
          // Clear
          return { currentJobs: null };
        }

        let currentJobs = {} as { [jobId: string]: ConversionJobStoreItem };

        if (state.currentJobs) {
          // Copy existing directory
          currentJobs = { ...state.currentJobs };
        }

        // Add and replace existing jobs
        for (let file of jobs) {
          let jobId = file.job_id;
          currentJobs[jobId] = file;
        }

        return { currentJobs };
      }),
    setFileInfoConversionJobs: (jobInfo) =>
      set((state) => {
        let currentJobs = state.currentJobs;
        if (!currentJobs) return {};
        currentJobs = { ...currentJobs }; // Copy

        for (let job of Object.values(currentJobs)) {
          let tuuid = job.tuuid;
          let fileinfo = jobInfo.filter((item) => item.tuuid === tuuid).pop();
          if (fileinfo) {
            // Update job
            currentJobs[job.job_id] = { ...job, ...fileinfo };
          }
        }

        return { currentJobs };
      }),
    updateConversionJob: (job) =>
      set((state) => {
        let jobs = state.currentJobs;
        let jobId = job.job_id;
        if (!jobs) return {};
        jobs = { ...jobs }; // Copy
        let tuuidsToLoad = [...(state.tuuidsToLoad || [])]; // Copy
        let existingJob = jobs[jobId];
        if (!existingJob) {
          tuuidsToLoad.push(job.tuuid);
          jobs = { ...jobs, [jobId]: job };
          return { currentJobs: jobs, tuuidsToLoad };
        }
        let updatedJob = { ...existingJob, ...job }; // Update as copy
        jobs[jobId] = updatedJob;
        return { currentJobs: jobs, tuuidsToLoad };
      }),
    removeConversionJobs: (jobIds: string[]) =>
      set((state) => {
        let currentJobs = state.currentJobs;
        if (!currentJobs) return {};
        currentJobs = { ...currentJobs };
        for (let jobId of jobIds) {
          delete currentJobs[jobId];
        }
        return { currentJobs };
      }),
  })),
);

export default useMediaConversionStore;
