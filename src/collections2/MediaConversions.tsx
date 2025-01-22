import React, { useEffect, useMemo } from "react";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useMediaConversionStore, { ConversionJobStoreItem } from "./mediaConversionStore";
import { EtatJobEnum } from "../workers/connection.worker";
import useUserBrowsingStore from "./userBrowsingStore";

function MediaConversionsPage() {

    return (
        <>
            <section className='pt-12 pb-4'>
                <h1 className='text-xl font-bold'>Media conversions progress</h1>
            </section>

            <section>
                <MediaConversionsList />
            </section>

            <SyncMediaConversions />
        </>
    )
}

export default MediaConversionsPage;

function MediaConversionsList() {

    let currentJobs = useMediaConversionStore(state=>state.currentJobs);

    let sortedJobs = useMemo(()=>{
        if(!currentJobs) return null;
        let jobs = Object.values(currentJobs);
        jobs.sort(sortJobs)
        return jobs;
    }, [currentJobs]);

    let jobsElem = useMemo(()=>{
        if(!sortedJobs) return [];
        return sortedJobs.map(item=>{
            let params = 'defaults';
            if(item.params) {
                if(item.params.defaults !== true) {
                    params = `${item.params.codecVideo}, ${item.params.resolutionVideo}`
                    if(typeof(item.params.audio_stream_idx) === 'number') {
                        params += ', A' + item.params.audio_stream_idx;
                    }
                    if(typeof(item.params.subtitle_stream_idx) === 'number') {
                        params += ', S' + item.params.subtitle_stream_idx;
                    }
                }
            }

            let progress = null as number | null;
            if(item.etat === EtatJobEnum.RUNNING && typeof(item.pct_progres) === 'number') {
                progress = item.pct_progres;
            }

            console.debug("Job ", item);

            return (
                <React.Fragment key={item.job_id}>
                    <p className='col-span-6 text-sm'>{item.name || item.job_id}</p>
                    <p className='col-span-2 pl-2'>{params}</p>
                    {progress !== null?
                        <div className="pl-2 relative col-span-4 w-11/12 mt-1 h-4 text-xs bg-slate-200 rounded-full dark:bg-slate-700">
                            {progress<=30?
                                <div className='w-full text-violet-800 text-xs text-center'>{progress}%</div>
                                :
                                <></>
                            }
                            <div className="absolute top-0 h-4 bg-violet-600 text-xs font-medium text-violet-100 text-center p-0.5 leading-none rounded-full" style={{width: progress+'%'}}>
                                {progress>30?<>{progress}%</>:''}
                            </div>
                        </div>
                    :
                        <p className='pl-2 col-span-4'><StateValue value={item.etat}/></p>
                    }
                </React.Fragment>
            );
        });
    }, [sortedJobs]);

    if(!currentJobs) return <p>Loading ...</p>;

    return (
        <div className='grid grid-cols-12'>
            {jobsElem}
        </div>
    )
}

function SyncMediaConversions() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let updateConversionJobs = useMediaConversionStore(state=>state.updateConversionJobs);
    let setFileInfoConversionJobs = useMediaConversionStore(state=>state.setFileInfoConversionJobs);
    let tuuidsToLoad = useMediaConversionStore(state=>state.tuuidsToLoad);
    let setTuuidsToLoad = useMediaConversionStore(state=>state.setTuuidsToLoad);
    
    useEffect(()=>{
        if(!workers || !ready || !userId || !tuuidsToLoad) return;
        let jobs = Object.values(tuuidsToLoad)
        if(jobs.length === 0) return;

        setTuuidsToLoad(null);  // Reset, cleanup to avoid loops

        if(tuuidsToLoad.length > 0) {
            console.debug("Load file name for tuuids", tuuidsToLoad);
            // Capture variables for inner context
            let workersInner = workers, userIdInner = userId;
            workers.connection.getFilesByTuuid(tuuidsToLoad)
                .then(async response => {
                    if(response.ok === false) throw new Error(response.err);
                    console.debug("Response", response);
                    if(!response.files || !response.keys) throw new Error('No files/keys received');
                    let files = await workersInner.directory.processDirectoryChunk(workersInner.encryption, userIdInner, response.files, response.keys);
                    console.debug("Files", files);
                    // Map to update job file names
                    let filenamesMappedByTuuid = Object.values(files).map(item=>{
                        let filename = item.decryptedMetadata?.nom || '';  // Setting '' will prevent multiple attemps to load the same file
                        let size = item.fileData?.taille;
                        return {tuuid: item.tuuid, name: filename, size};
                    });
                    console.debug("Mapped filenames", filenamesMappedByTuuid);
                    setFileInfoConversionJobs(filenamesMappedByTuuid);
                })
                .catch(err=>console.error("Error loading tuuids", err));
        } else {
            console.debug("No file name to load for list", jobs);
        }
        
    }, [workers, ready, tuuidsToLoad, userId, setFileInfoConversionJobs, setTuuidsToLoad]);

    useEffect(()=>{
        if(!workers || !ready) return;

        //TODO Register job listener

        workers.connection.collections2GetConversionJobs()
            .then(response=>{
                console.debug("Response", response);
                if(response.ok === false) throw new Error(response.err);
                if(response.jobs) {
                    updateConversionJobs(response.jobs);
                    let tuuids = new Set(response.jobs.map(item=>item.tuuid));
                    let tuuidList = Array.from(tuuids);
                    setTuuidsToLoad(tuuidList);
                }
                else updateConversionJobs([]);
            })
            .catch(err=>console.error("Error loading conversion jobs", err));

        return () => {
            //TODO Unregister job listener
        }
    }, [workers, ready, updateConversionJobs, setTuuidsToLoad]);

    return <></>;
}


function sortJobs(a: ConversionJobStoreItem, b: ConversionJobStoreItem): number {
    if(a === b) return 0;
    if(a.etat === b.etat) {
        if(a.name === b.name) {
            return a.tuuid.localeCompare(b.tuuid);
        }
        if(!a.name) return 1;
        if(!b.name) return -1;
        if(a.name && b.name) return a.name.localeCompare(b.name);
    }

    // First sort order
    if(!a.etat) return 1;
    if(!b.etat) return -1;
    return a.etat - b.etat;
}

function StateValue(props: {value: EtatJobEnum | null | undefined}) {
    let {value} = props;

    if(!value) return <>'N/A'</>;

    switch(value) {
        case EtatJobEnum.PENDING: return <>Pending</>;
        case EtatJobEnum.RUNNING: return <>Running</>;
        case EtatJobEnum.PERSISTING: return <>Persisting</>;
        case EtatJobEnum.ERROR: return <>Error</>;
        case EtatJobEnum.TOO_MANY_RETRIES: return <>Too many retries</>;
    }
}
