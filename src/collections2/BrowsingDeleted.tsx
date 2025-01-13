import { useCallback, useEffect, useMemo, useState } from "react";
import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Breadcrumb } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";

function BrowsingDeleted() {

    let [breadcrumbTuuids, setBreadcrumbTuuids] = useState(null as string[] | null);
    let [tuuid, rootTuuid] = useMemo(()=>{
        if(!breadcrumbTuuids || breadcrumbTuuids.length === 0) return [null, null];
        let rootTuuid = breadcrumbTuuids[0]
        let tuuid = breadcrumbTuuids[breadcrumbTuuids.length-1]
        return [tuuid, rootTuuid];
    }, [breadcrumbTuuids]);

    let filesDict = useUserBrowsingStore(state=>state.currentDirectory);

    let files = useMemo(()=>{
        if(!filesDict) return null;
        let filesValues = Object.values(filesDict);

        return filesValues;
    }, [filesDict]) as TuuidsBrowsingStoreRow[] | null;

    let onClickBreadcrumb = useCallback((tuuid?: string | null)=>{
        if(!tuuid) {
            setBreadcrumbTuuids(null);
            return;
        }

        if(breadcrumbTuuids) {
            let breadcrumbUpdated = [];
            for(let tuuidItem of breadcrumbTuuids) {
                breadcrumbUpdated.push(tuuidItem);
                if(tuuidItem === tuuid) {
                    break;  // Done
                }
            }
            setBreadcrumbTuuids(breadcrumbUpdated);
        } else {
            setBreadcrumbTuuids(null);
        }

    }, [breadcrumbTuuids, setBreadcrumbTuuids]);

    let onClickRow = useCallback((tuuid?: string | null, typeNode?: string | null)=>{
        if(typeNode === 'Fichier') {
            throw new Error('todo')
        } else {
            if(tuuid) {
                if(!breadcrumbTuuids) {
                    setBreadcrumbTuuids([tuuid]);
                } else {
                    setBreadcrumbTuuids([...breadcrumbTuuids, tuuid]);
                }
            } else {
                setBreadcrumbTuuids(null);
            }
        }
    }, [breadcrumbTuuids, setBreadcrumbTuuids]);

    let [sortKey, sortOrder] = useMemo(()=>{
        if(!tuuid) return ['modification', -1];
        return ['nom', 1];
    }, [tuuid]);

    return (
        <>
            <Breadcrumb root={{tuuid: rootTuuid, name: 'Trash'}} onClick={onClickBreadcrumb} />

            <section className='pt-3'>
                <FilelistPane files={files} sortKey={sortKey} sortOrder={sortOrder} dateColumn='modification' onClickRow={onClickRow} />
            </section>

            <DirectorySyncHandler tuuid={tuuid} />
        </>
    );
}

export default BrowsingDeleted;

function DirectorySyncHandler(props: {tuuid?: string | null | undefined}) {

    let {tuuid} = props;

    let workers = useWorkers();
    let username = useConnectionStore(state=>state.username);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let updateCurrentDirectory = useUserBrowsingStore(state=>state.updateCurrentDirectory);
    let setCuuid = useUserBrowsingStore(state=>state.setCuuidDeleted);
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
        setDirectoryStatistics(null);

        // Register directory change listener
        //TODO

        // Sync
        synchronizeDirectory(workers, userId, username, tuuidValue, cancelledSignal, updateCurrentDirectory, setBreadcrumb)
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
    setBreadcrumb: (username: string, dirs: TuuidsBrowsingStoreRow[] | null) => void) 
{
    // Sync folder from server
    let complete = false;
    let skip = 0;
    while(!complete) {
        if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 1`)
        // console.debug("Sync tuuid %s skip %d", tuuid, skip);
        let response = await workers.connection.syncDeletedFiles(skip, tuuid);

        // // console.debug("Directory loaded: %O", response);
        if(!response.ok) throw new Error(`Error during sync: ${response.err}`);
        complete = response.complete;
        
        if(!tuuid) {
            setBreadcrumb(username, null);
        } else if(response.breadcrumb) {
            let breadcrumb = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.breadcrumb, response.keys, {noidb: true});
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
            let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys, {noidb: true});

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
}
