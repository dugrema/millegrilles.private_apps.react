import { MouseEvent, useCallback, useEffect, useMemo } from "react";
import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";

export function ModalBreadcrumb() {
    let breadcrumb = useUserBrowsingStore(state=>state.modalNavBreadcrumb);
    let modalNavUsername = useUserBrowsingStore(state=>state.modalNavUsername);
    let setModalCuuid = useUserBrowsingStore(state=>state.setModalCuuid);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        let value = e.currentTarget.dataset.tuuid || null;
        setModalCuuid(value);
    }, [setModalCuuid])

    let breadcrumbMapped = useMemo(()=>{
        if(!breadcrumb) return <></>;
        let lastIdx = breadcrumb.length - 1;
        return breadcrumb.filter(item=>item).map((item, idx)=>{
            if(idx === lastIdx) {
                return (
                    <li key={item.tuuid} className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                        {item.nom}
                    </li>
                )
            } else {
                return (
                    <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                )
            }
        })
    }, [breadcrumb, onClickHandler]);

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'
                    onClick={onClickHandler}>
                    {modalNavUsername}
                    <span className="pointer-events-none ml-2 text-slate-300">&gt;</span>
                </li>
                {breadcrumbMapped}
            </ol>
        </nav>
    );
}

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
export function ModalDirectorySyncHandler() {

    let workers = useWorkers();
    let username = useConnectionStore(state=>state.username);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let currentCuuid = useUserBrowsingStore(state=>state.modalNavCuuid);
    let updateCurrentDirectory = useUserBrowsingStore(state=>state.updateModalCurrentDirectory);
    let setBreadcrumb = useUserBrowsingStore(state=>state.setModalBreadcrumb);

    useEffect(()=>{
        if(!workers || !ready || !userId ) return;

        // Signal to cancel sync
        let cancelled = false;
        let cancelledSignal = () => cancelled;
        let cancel = () => {cancelled = true};

        // Clear screen
        updateCurrentDirectory(null);

        synchronizeDirectory(
            workers, userId, username, currentCuuid, cancelledSignal, 
            updateCurrentDirectory, setBreadcrumb)
            .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            cancel();
        }
    }, [workers, ready, userId, username, currentCuuid,
        setBreadcrumb, updateCurrentDirectory]);

    return <></>;
}

async function synchronizeDirectory(
    workers: AppWorkers, userId: string, username: string, cuuid: string | null, 
    cancelledSignal: ()=>boolean, 
    updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
    setBreadcrumb: (username: string, dirs: TuuidsBrowsingStoreRow[] | null) => void
    ) 
{
    // Load folder from IDB (if known)
    let {directory, list, breadcrumb} = await workers.directory.loadDirectory(userId, cuuid);
    if(list) {
        let storeFiles = filesIdbToBrowsing(list);
        updateCurrentDirectory(storeFiles);
    }
    if(breadcrumb) {
        // Trucate breadcrumb up to the shared collection tuuid
        let breadcrumbBrowsing = filesIdbToBrowsing(breadcrumb);
        setBreadcrumb(username, breadcrumbBrowsing);
    }
    let syncDate = directory?.lastCompleteSyncSec || null;

    // Sync folder from server
    let complete = false;
    let skip = 0;
    let lastCompleteSyncSec = null as number | null;
    while(!complete) {
        if(cancelledSignal()) throw new Error(`Sync of ${cuuid} has been cancelled - 1`)
        let response = await workers.connection.syncDirectory(cuuid, skip, syncDate, /*{filter: ['Collection', 'Repertoire']}*/);

        if(skip === 0) {
            // Keep initial response time for complete sync date
            if(response.__original?.estampille) {
                // Get previous second to ensure we're getting all sub-second changes on future syncs.
                lastCompleteSyncSec = response.__original.estampille - 1;
            }
            // console.debug("Initial response batch: %O", response);
        }

        // console.debug("Directory loaded: %O", response);
        if(!response.ok) throw new Error(`Error during sync: ${response.err}`);
        complete = response.complete;
        
        if(response.deleted_tuuids) {
            console.debug("Delete files %O", response.deleted_tuuids);
            await workers.directory.deleteFiles(response.deleted_tuuids, userId);
            // deleteFilesDirectory(response.deleted_tuuids);
        }

        if(!cuuid) {
            setBreadcrumb(username, null);
        } else if(response.breadcrumb) {
            let breadcrumb = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.breadcrumb, response.keys);
            let currentDirIdb = breadcrumb.filter(item=>item.tuuid === cuuid).pop();

            let storeFiles = filesIdbToBrowsing(breadcrumb);

            let breadcrumbByTuuid = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
            for(let dir of storeFiles) {
                breadcrumbByTuuid[dir.tuuid] = dir;
            }

            // Create breadcrumb in reverse order
            let orderedBreadcrumb = [breadcrumbByTuuid[cuuid]];
            if(currentDirIdb?.path_cuuids) {
                for(let cuuid of currentDirIdb.path_cuuids) {
                    let dirValue = breadcrumbByTuuid[cuuid];
                    orderedBreadcrumb.push(dirValue);
                }
            }
            // Put breadcrumb in proper order
            orderedBreadcrumb = orderedBreadcrumb.reverse();

            // console.debug("breadcrumb: %O, StoreFiles: %O", breadcrumb, storeFiles);
            setBreadcrumb(username, orderedBreadcrumb);
        }

        if(response.files) { 
            skip += response.files.length; 

            // Process and save to IDB
            let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys);

            if(cancelledSignal()) throw new Error(`Sync of ${cuuid} has been cancelled - 2`)
            // Save files in store
            let storeFiles = filesIdbToBrowsing(files);
            updateCurrentDirectory(storeFiles);
        } else if(response.keys) {
            console.warn("Keys received with no files");
        }
        else { 
            complete = true; 
        }

    }

    if(cuuid && lastCompleteSyncSec) {
        // Update current directory last sync information
        await workers.directory.touchDirectorySync(cuuid, userId, lastCompleteSyncSec);
    }
}
