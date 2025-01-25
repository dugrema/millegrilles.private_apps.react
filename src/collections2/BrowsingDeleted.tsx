import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Breadcrumb, ModalEnum } from "./BrowsingElements";
import FilelistPane, { FileListPaneOnClickRowType, sortByName } from "./FilelistPane";

import CopyIcon from '../resources/icons/copy-svgrepo-com.svg';
import RecycleIcon from '../resources/icons/undo-svgrepo-com.svg';
import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';
import ActionButton from "../resources/ActionButton";
import { useNavigate } from "react-router-dom";
import { ModalBrowseAction } from "./Modals";

function BrowsingDeleted() {

    let navigate = useNavigate();

    let [modal, setModal] = useState(null as ModalEnum | null);
    let onModal = useCallback((modal: ModalEnum)=>setModal(modal), [setModal]);
    let closeModal = useCallback(()=>setModal(null), [setModal]);

    let [breadcrumbTuuids, setBreadcrumbTuuids] = useState(null as string[] | null);
    let [tuuid, rootTuuid] = useMemo(()=>{
        if(!breadcrumbTuuids || breadcrumbTuuids.length === 0) return [null, null];
        let rootTuuid = breadcrumbTuuids[0]
        let tuuid = breadcrumbTuuids[breadcrumbTuuids.length-1]
        return [tuuid, rootTuuid];
    }, [breadcrumbTuuids]);

    let filesDict = useUserBrowsingStore(state=>state.currentDirectory);

    // Selecting files
    let selection = useUserBrowsingStore(state=>state.selection);
    let setSelection = useUserBrowsingStore(state=>state.setSelection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let setSelectionPosition = useUserBrowsingStore(state=>state.setSelectionPosition);

    let files = useMemo(()=>{
        console.debug("Files dict", filesDict);
        if(!filesDict) return null;
        let filesValues = Object.values(filesDict);

        // filesValues.sort(sortByName);

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
                    if(!breadcrumbTuuids) {
                        setBreadcrumbTuuids([tuuid]);
                    } else {
                        setBreadcrumbTuuids([...breadcrumbTuuids, tuuid]);
                    }
                } else {
                    setBreadcrumbTuuids(null);
                }
            }
        }
    }, [navigate, selectionMode, selection, setSelectionMode, setSelection, setSelectionPosition]);

    let [sortKey, sortOrder] = useMemo(()=>{
        if(!tuuid) return ['modificationDesc', 1];
        return ['name', 1];
    }, [tuuid]);

    return (
        <>
            <section className='fixed top-12'>
                <Breadcrumb root={{tuuid: rootTuuid, name: 'Trash'}} onClick={onClickBreadcrumb} />

                <div className='pt-2'>
                    <ButtonBar onModal={onModal} />                    
                </div>
            </section>

            <section className='fixed top-32 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <FilelistPane files={files} sortKey={sortKey} sortOrder={sortOrder} dateColumn='modification' onClickRow={onClickRow} />
            </section>

            <DirectorySyncHandler tuuid={tuuid} />
            <Modals show={modal} close={closeModal} />
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
    let updateCurrentDirectory = useUserBrowsingStore(state=>state.updateCurrentDirectoryDeleted);
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
        console.debug("Sync tuuid %s skip %d", tuuid, skip);
        let response = await workers.connection.syncDeletedFiles(skip, tuuid);

        console.debug("Directory loaded: %O", response);
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
            console.debug("Decrypted files", files);

            if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 2`)
            // Save files in store
            let storeFiles = filesIdbToBrowsing(files);
            console.debug("Store files", storeFiles);
            updateCurrentDirectory(storeFiles);
        } else if(response.keys) {
            console.warn("Keys received with no files");
        }
        else { 
            complete = true; 
        }

    }
}

type ButtonBarProps = {
    onModal: (modalName: ModalEnum) => void,
}

export function ButtonBar(props: ButtonBarProps) {

    let {onModal} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let selection = useUserBrowsingStore(state=>state.selection);
    let deleteFilesDirectory = useUserBrowsingStore(state=>state.deleteFilesDirectory);

    let selectCount = useMemo(()=>{
        if(!selection) return null;
        return selection.length;
    }, [selection]);

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);

    let recycleHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!selection || selection.length === 0) throw new Error('Nothing selected to delete');
        let response = await workers.connection.collection2RecycleItems(selection);
        if(!response.ok) throw new Error('Error deleting files/directories: ' + response.err);
        setSelectionMode(false);  // Exit selection mode

        // Remove recycled items from list
        deleteFilesDirectory(selection);
    }, [workers, ready, selection, setSelectionMode, deleteFilesDirectory]);

    let copyHandler = useCallback(()=>onModal(ModalEnum.Copy), [onModal]);

    return (
        <div className='grid grid-cols-2 md:grid-cols-3 pt-1'>
            <div className='col-span-2'>
                <button onClick={toggleSelectionMode}
                    className={'varbtn px-1 py-1 w-10 hover:bg-slate-600 active:bg-slate-500 ' + (selectionMode?'bg-violet-500':'bg-slate-700')}>
                        <img src={SelectionModeIcon} alt="Select files" title="Select files" className='w-8 inline-block'/>
                </button>
                <ActionButton onClick={recycleHandler} disabled={!selectionMode || !selectCount} confirm={true} revertSuccessTimeout={2} varwidth={10}>
                    <img src={RecycleIcon} alt="Recycle files" title="Recycle files" className='w-8 inline-block'/>
                </ActionButton>
                <button onClick={copyHandler} disabled={!selectionMode || !selectCount}
                    className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                        <img src={CopyIcon} alt="Copy files" title="Copy files" className='w-8 inline-block'/>
                </button>
            </div>
            <div className='text-sm'>
                <p>TODO</p>
            </div>
        </div>        
    );
}

function Modals(props: {show: ModalEnum | null, close:()=>void}) {

    let {show, close} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    if(show === ModalEnum.Copy) return <ModalBrowseAction workers={workers} ready={ready} close={close} modalType={show} title='Copy files' includeDeleted={true} />;

    return <></>;
}
