import { Link, useParams } from "react-router-dom";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { MouseEvent, useCallback, useEffect, useMemo } from "react";
import { Collection2DirectoryStats, Collections2SharedContactsSharedCollection } from "../workers/connection.worker";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";

function SharedFileBrowsing() {

    let {contactId, tuuid} = useParams();
    
    let setSharedCollection = useUserBrowsingStore(state=>state.setSharedCollection);
    let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    
    useEffect(()=>{
        if(!sharedWithUser?.sharedCollections || !contactId) {
            setSharedCollection(null);
        } else {
            let sharedContact = sharedWithUser.sharedCollections.filter(item=>item.contact_id === contactId).pop();
            setSharedCollection(sharedContact || null);
        }
    }, [sharedWithUser, contactId]);

    return (
        <>
            <p>Shared file browsing</p>
            <DirectorySyncHandler tuuid={tuuid} />
        </>
    );
}

export default SharedFileBrowsing;

type BreadcrumbProps = {
    onClick?: (tuuid: string | null) => void,
}

export function Breadcrumb(props: BreadcrumbProps) {

    let { onClick } = props;

    let sharedContact = useUserBrowsingStore(state=>state.sharedContact);
    let breadcrumb = useUserBrowsingStore(state=>state.sharedBreadcrumb);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick])

    let breadcrumbMapped = useMemo(()=>{
        if(!sharedContact?.nom_usager || !breadcrumb) return <></>;
        let lastIdx = breadcrumb.length - 1;
        return breadcrumb.map((item, idx)=>{
            if(idx === lastIdx) {
                return (
                    <li key={item.tuuid} className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                        {item.nom}
                    </li>
                )
            } else {
                return (
                    <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        {onClick?
                            <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                        :
                            <Link to={'/apps/collections2/c/' + sharedContact?.user_id}>{sharedContact?.nom_usager}</Link>
                        }
                        
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                )
            }
        })
    }, [sharedContact, breadcrumb, onClick, onClickHandler]);

    if(!sharedContact) return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                    Shares
                </li>
            </ol>
        </nav>
    );

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                    <Link to='/apps/collections2/c'>Shares</Link>
                </li>
                {sharedContact?
                    breadcrumb?
                        <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                            {onClick?
                                <p onClick={onClickHandler}>Users</p>
                            :
                                <Link to='/apps/collections2/c'>Users</Link>
                            }
                            
                            <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                        </li>
                    :
                        <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                            {sharedContact.nom_usager}
                        </li>
                :<></>}
                {breadcrumbMapped}
            </ol>
        </nav>
    );
}

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
function DirectorySyncHandler(props: {tuuid: string | null | undefined}) {

    let {tuuid} = props;

    let workers = useWorkers();
    let username = useConnectionStore(state=>state.username);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let updateCurrentDirectory = useUserBrowsingStore(state=>state.updateCurrentDirectory);
    let setSharedCuuid = useUserBrowsingStore(state=>state.setSharedCuuid);
    let setBreadcrumb = useUserBrowsingStore(state=>state.setBreadcrumb);
    let setDirectoryStatistics = useUserBrowsingStore(state=>state.setDirectoryStatistics);
    let deleteFilesDirectory = useUserBrowsingStore(state=>state.deleteFilesDirectory);

    let sharedCollection = useUserBrowsingStore(state=>state.sharedCollection);

    useEffect(()=>{
        if(!workers || !ready || !userId) return;
        let tuuidValue = tuuid || null;

        // Signal to cancel sync
        let cancelled = false;
        let cancelledSignal = () => cancelled;
        let cancel = () => {cancelled = true};

        // Change the current directory in the store. 
        setSharedCuuid(tuuidValue);

        // Clear screen
        updateCurrentDirectory(null);

        // Register directory change listener
        //TODO

        // synchronizeDirectory(workers, userId, username, tuuidValue, cancelledSignal, updateCurrentDirectory, setBreadcrumb, setDirectoryStatistics, deleteFilesDirectory)
        //     .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            cancel();

            // Unregister directory change listener
            //TODO
        }
    }, [workers, ready, userId, username, tuuid, sharedCollection, setSharedCuuid, setBreadcrumb, updateCurrentDirectory, setDirectoryStatistics, deleteFilesDirectory]);

    return <></>;
}

// async function synchronizeUserShares(workers: AppWorkers, userId: string, sharedCollections: Collections2SharedContactsSharedCollection[]) {
//     let tuuids = sharedCollections.map(item=>item.tuuid);
//     let files = await workers.connection.getFilesByTuuid(tuuids);
//     console.debug("Shared collections: %O", files);
// }

async function synchronizeDirectory(
    workers: AppWorkers, userId: string, username: string, tuuid: string | null, 
    cancelledSignal: ()=>boolean, 
    updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
    setBreadcrumb: (username: string, dirs: TuuidsBrowsingStoreRow[] | null) => void,
    setDirectoryStatistics: (directoryStatistics: Collection2DirectoryStats[] | null) => void,
    deleteFilesDirectory: (files: string[]) => void) 
{
    // if(!workers) throw new Error("Workers not initialized");

    // Load folder from IDB (if known)
    let {directory, list, breadcrumb} = await workers.directory.loadDirectory(userId, tuuid);
    // console.debug("Loaded directory: %O, list: %O, breadcrumb: %O", directory, list, breadcrumb);
    if(list) {
        let storeFiles = filesIdbToBrowsing(list);
        updateCurrentDirectory(storeFiles);
    }
    if(breadcrumb) {
        // console.debug("Map breadcrumb: ", breadcrumb);
        let breadcrumbBrowsing = filesIdbToBrowsing(breadcrumb);
        setBreadcrumb(username, breadcrumbBrowsing);
    }
    let syncDate = directory?.lastCompleteSyncSec || null;

    // Sync folder from server
    let complete = false;
    let skip = 0;
    let lastCompleteSyncSec = null as number | null;
    while(!complete) {
        if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 1`)
        // console.debug("Sync tuuid %s skip %d", tuuid, skip);
        let response = await workers.connection.syncDirectory(tuuid, skip, syncDate);

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
        
        if(response.stats) {
            // Update store information with new directory stats
            setDirectoryStatistics(response.stats);
        }

        if(response.deleted_tuuids) {
            console.debug("Delete files %O", response.deleted_tuuids);
            await workers.directory.deleteFiles(response.deleted_tuuids);
            deleteFilesDirectory(response.deleted_tuuids);
        }

        if(!tuuid) {
            setBreadcrumb(username, null);
        } else if(response.breadcrumb) {
            let breadcrumb = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.breadcrumb, response.keys);
            let currentDirIdb = breadcrumb.filter(item=>item.tuuid === tuuid).pop();

            let storeFiles = filesIdbToBrowsing(breadcrumb);

            let breadcrumbByTuuid = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
            for(let dir of storeFiles) {
                breadcrumbByTuuid[dir.tuuid] = dir;
            }
            // Create breadcrumb in reverse order
            let orderedBreadcrumb = [breadcrumbByTuuid[tuuid]];
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

            if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 2`)
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

    if(tuuid && lastCompleteSyncSec) {
        // Update current directory last sync information
        await workers.directory.touchDirectorySync(tuuid, lastCompleteSyncSec);
    }
}
