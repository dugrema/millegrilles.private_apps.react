import { useParams } from "react-router-dom";
import { Breadcrumb, ButtonBar } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";
import { useEffect, useMemo } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Collection2DirectoryStats } from "../workers/connection.worker";

function ViewUserFileBrowsing() {

    let { tuuid } = useParams();

    let filesDict = useUserBrowsingStore(state=>state.currentDirectory);

    let files = useMemo(()=>{
        if(!filesDict) return null;
        let filesValues = Object.values(filesDict);

        return filesValues;
    }, [filesDict]) as TuuidsBrowsingStoreRow[] | null;

    return (
        <>
            <Breadcrumb />

            <section className='pt-2'>
                <ButtonBar />                    
            </section>

            <section className='pt-3'>
                <FilelistPane files={files} />
            </section>

            <DirectorySyncHandler tuuid={tuuid} />
        </>
    );
}

export default ViewUserFileBrowsing;

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
    let setCuuid = useUserBrowsingStore(state=>state.setCuuid);
    let setBreadcrumb = useUserBrowsingStore(state=>state.setBreadcrumb);
    let setDirectoryStatistics = useUserBrowsingStore(state=>state.setDirectoryStatistics);
    let deleteFilesDirectory = useUserBrowsingStore(state=>state.deleteFilesDirectory);

    useEffect(()=>{
        if(!workers || !ready || !userId) return;
        let tuuidValue = tuuid || null;

        // Signal to cancel sync
        let cancelled = false;
        let cancelledSignal = () => cancelled;
        let cancel = () => {cancelled = true};

        // Change the current directory in the store. 
        setCuuid(tuuidValue);

        // Clear screen
        updateCurrentDirectory(null);

        // Register directory change listener
        //TODO

        // Sync
        synchronizeDirectory(workers, userId, username, tuuidValue, cancelledSignal, updateCurrentDirectory, setBreadcrumb, setDirectoryStatistics, deleteFilesDirectory)
            .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            cancel();

            // Unregister directory change listener
            //TODO
        }
    }, [workers, ready, userId, username, tuuid, setCuuid, setBreadcrumb, updateCurrentDirectory, setDirectoryStatistics, deleteFilesDirectory]);

    return <></>;
}

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
            console.debug("Initial response batch: %O", response);
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
