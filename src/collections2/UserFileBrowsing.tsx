import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { proxy } from "comlink";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";

import { Breadcrumb, ButtonBar, ModalEnum } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Collection2DirectoryContentUpdateMessage, Collection2DirectoryStats, Collection2DirectoryUpdateMessage } from "../workers/connection.worker";
import { ModalInformation, ModalNewDirectory, ModalBrowseAction, ModalShareCollection, ModalImportZip, ModalRenameFile } from './Modals';

function ViewUserFileBrowsing() {

    let { tuuid } = useParams();

    let [modal, setModal] = useState(null as ModalEnum | null);

    let filesDict = useUserBrowsingStore(state=>state.currentDirectory);
    let cuuid = useUserBrowsingStore(state=>state.currentCuuid);
    let setCuuid = useUserBrowsingStore(state=>state.setCuuid);
    let navigate = useNavigate();

    // Selecting files
    let selection = useUserBrowsingStore(state=>state.selection);
    let setSelection = useUserBrowsingStore(state=>state.setSelection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let setSelectionPosition = useUserBrowsingStore(state=>state.setSelectionPosition);

    let files = useMemo(()=>{
        if(!filesDict) return null;
        let filesValues = Object.values(filesDict);

        return filesValues;
    }, [filesDict]) as TuuidsBrowsingStoreRow[] | null;

    let onModal = useCallback((modal: ModalEnum)=>setModal(modal), [setModal]);
    let closeModal = useCallback(()=>setModal(null), [setModal]);

    let onClickRow = useCallback((e: MouseEvent<HTMLButtonElement | HTMLDivElement>, tuuid:string, typeNode:string, range: TuuidsBrowsingStoreRow[] | null)=>{
        let ctrl = e?.ctrlKey || false;
        let shift = e?.shiftKey || false;
        let effectiveSelectionMode = selectionMode;
        if(!selectionMode && (ctrl||shift)) {
            // Toggle selection mode
            effectiveSelectionMode = true;
            setSelectionMode(true);
        }

        if(effectiveSelectionMode) {
            // Selection mode
            let selectionSet = new Set() as Set<string>;
            if(selection) selection.forEach(item=>selectionSet.add(item));  // Copy all existing selections to Set

            if(tuuid) {
                if(shift && range) {
                    // Range action
                    range.forEach(item=>selectionSet.add(item.tuuid));
                } else {
                    // Individual action
                    if(selectionSet.has(tuuid)) {
                        selectionSet.delete(tuuid);
                    } else {
                        selectionSet.add(tuuid);
                    }
                }

                // Save position for range selection
                setSelectionPosition(tuuid);

                // Copy set back to array, save.
                let updatedSelection = [] as string[];
                selectionSet.forEach(item=>updatedSelection.push(item));
                setSelection(updatedSelection);
            }
        } else {
            // Navigation mode
            if(typeNode === 'Fichier') {
                navigate('/apps/collections2/f/' + tuuid);
            } else {
                if(tuuid) {
                    navigate('/apps/collections2/b/' + tuuid);
                } else {
                    navigate('/apps/collections2/b');
                }
            }
        }
    }, [selectionMode, selection, setSelectionMode, navigate, setSelection, setSelectionPosition]);

    // Handle initial screen load (return to cuuid) or set current directory.
    useEffect(()=>{
        if(!tuuid && cuuid) {
            // Reloading browse screen. Redirect to current directory.
            navigate('/apps/collections2/b/' + cuuid);
        } else {
            if(tuuid === 'root') {
                setCuuid(null);
                navigate('/apps/collections2/b');
            } else {
                setCuuid(tuuid || null);
            }
        }
    }, [tuuid, cuuid, navigate, setCuuid]);

    return (
        <>
            <section className='fixed top-12'>
                <Breadcrumb />

                <div className='pt-2'>
                    <ButtonBar onModal={onModal} />                    
                </div>
            </section>

            <section className='fixed top-36 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <FilelistPane files={files} onClickRow={onClickRow} />
            </section>

            <DirectorySyncHandler tuuid={cuuid} />
            <Modals show={modal} close={closeModal} />
        </>
    );
}

export default ViewUserFileBrowsing;

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
export function DirectorySyncHandler(props: {tuuid: string | null | undefined}) {

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

    let directoryUpdateHandler = useCallback((e: SubscriptionMessage)=>{
        console.debug("directoryUpdateHandler Event: ", e);
        if(!workers || !userId) {
            console.warn("Subscription message received when workers/userId is not initialized, ignored");
            return;
        }
        let content = e.message as Collection2DirectoryUpdateMessage;
        console.debug("Update breadcrumb with ", content);
        // updateCollection(workers, userId, updateBreadcrumb, content)
        //     .catch(err=>console.error("Error handling directory content update", err));
    }, [workers, userId]);
    let directoryUpdateProxy = useMemo(()=>proxy(directoryUpdateHandler), [directoryUpdateHandler]);

    let directoryContentUpdateHandler = useCallback((e: SubscriptionMessage)=>{
        console.debug("directoryContentUpdateHandler Event: ", e);
        if(!workers || !userId) {
            console.warn("Subscription message received when workers/userId is not initialized, ignored");
            return;
        }
        let content = e.message as Collection2DirectoryContentUpdateMessage;
        updateCollectionContent(workers, userId, updateCurrentDirectory, deleteFilesDirectory, content)
            .catch(err=>console.error("Error handling directory content update", err));
    }, [workers, userId, updateCurrentDirectory, deleteFilesDirectory]);
    let directoryContentUpdateProxy = useMemo(()=>proxy(directoryContentUpdateHandler), [directoryContentUpdateHandler]);

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
        Promise.resolve().then(async () => {
            if(!workers) throw new Error("workers not initialized");
            await workers.connection.subscribe("collection2CollectionEvents", directoryUpdateProxy, {cuuid: tuuid});
            await workers.connection.subscribe("collection2CollectionContentEvents", directoryContentUpdateProxy, {cuuid: tuuid});
        })
        .catch(err=>console.error("Error registering directory listener on %s: %O", tuuid, err));

        // Sync
        synchronizeDirectory(workers, userId, username, tuuidValue, cancelledSignal, updateCurrentDirectory, setBreadcrumb, setDirectoryStatistics, deleteFilesDirectory)
            .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            cancel();

            // Unregister directory change listener
            Promise.resolve().then(async () => {
                if(!workers) throw new Error("workers not initialized");
                await workers.connection.unsubscribe("collection2CollectionEvents", directoryUpdateProxy, {cuuid: tuuid});
                await workers.connection.unsubscribe("collection2CollectionContentEvents", directoryContentUpdateProxy, {cuuid: tuuid});
            })
            .catch(err=>console.error("Error unregistering directory listener on %s: %O", tuuid, err));
        }
    }, [workers, ready, userId, username, tuuid, 
        setCuuid, setBreadcrumb, updateCurrentDirectory, setDirectoryStatistics, deleteFilesDirectory, 
        directoryUpdateProxy, directoryContentUpdateProxy]);

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
            await workers.directory.deleteFiles(response.deleted_tuuids, userId);
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
        await workers.directory.touchDirectorySync(tuuid, userId, lastCompleteSyncSec);
    }
}

function Modals(props: {show: ModalEnum | null, close:()=>void}) {

    let {show, close} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    if(show === ModalEnum.Info) return <ModalInformation workers={workers} ready={ready} close={close} modalType={show} />;
    if(show === ModalEnum.NewDirectory) return <ModalNewDirectory workers={workers} ready={ready} close={close} modalType={show} />;
    if(show === ModalEnum.Copy) return <ModalBrowseAction workers={workers} ready={ready} close={close} modalType={show} title='Copy files' />;
    if(show === ModalEnum.Cut) return <ModalBrowseAction workers={workers} ready={ready} close={close} modalType={show} title='Move files' />;
    if(show === ModalEnum.Share) return <ModalShareCollection workers={workers} ready={ready} modalType={show} close={close} />;
    if(show === ModalEnum.ImportZip) return <ModalImportZip workers={workers} ready={ready} modalType={show} close={close} />;
    if(show === ModalEnum.Rename) return <ModalRenameFile workers={workers} ready={ready} modalType={show} close={close} />;

    return <></>;
}

async function updateCollectionContent(
    workers: AppWorkers, 
    userId: string,
    updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void, 
    deleteFilesDirectory: (files: string[]) => void, 
    message: Collection2DirectoryContentUpdateMessage) 
{
    let tuuids = [
        ...(message.fichiers_ajoutes?message.fichiers_ajoutes:[]),
        ...(message.fichiers_modifies?message.fichiers_modifies:[]),
        ...(message.collections_ajoutees?message.collections_ajoutees:[]),
        ...(message.collections_modifiees?message.collections_modifiees:[]),
    ];

    if(tuuids.length > 0) {
        let response = await workers.connection.getFilesByTuuid(tuuids);
        if(response.files && response.keys) {
            let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys);
            let storeFiles = filesIdbToBrowsing(files);
            updateCurrentDirectory(storeFiles);
        } else {
            console.error("Error loading file/directory updates: ", response.err);
        }
    }

    if(message.retires && message.retires.length > 0) {
        let removedTuuids = message.retires;
        await workers.directory.deleteFiles(removedTuuids, userId);
        deleteFilesDirectory(removedTuuids);
    }
}
