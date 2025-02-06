import { Link } from "react-router-dom";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow, ViewMode } from "./userBrowsingStore";
import { ChangeEvent, MouseEvent, useCallback, useMemo, useRef } from "react";
import { Formatters } from "millegrilles.reactdeps.typescript";
import ActionButton from "../resources/ActionButton";

import FileAddIcon from '../resources/icons/file-dock-svgrepo-com.svg';
import FolderAddIcon from '../resources/icons/folder-add-fill-svgrepo-com.svg';
import InfoIcon from '../resources/icons/info-svgrepo-com.svg';
import ListIcon from '../resources/icons/list-pointers-svgrepo-com.svg';
import GridIcon from '../resources/icons/grid-4-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import CopyIcon from '../resources/icons/copy-svgrepo-com.svg';
import CutIcon from '../resources/icons/cut-svgrepo-com.svg';
import ShareIcon from '../resources/icons/share-1-svgrepo-com.svg';
import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';
import EditIcon from '../resources/icons/edit-2-svgrepo-com.svg';
import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { generateFileUploads } from "./transferUtils";

type BreadcrumbProps = {
    root?: {tuuid: string | null, name: string, path?: string} | null,
    onClick?: (tuuid: string | null) => void,
};

export function Breadcrumb(props: BreadcrumbProps) {

    let { root, onClick } = props;

    let username = useUserBrowsingStore(state=>state.usernameBreadcrumb);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick])

    let breadcrumbMapped = useMemo(()=>{
        if(!username || !breadcrumb) return <></>;
        let breadcrumbMapped = [];
        if(root?.tuuid) {
            let ignore = true;
            for(let file of breadcrumb) {
                if(ignore) {
                    if(file.tuuid === root.tuuid) {
                        ignore = false;
                    } else {
                        continue
                    }
                }
                breadcrumbMapped.push(file);
            }
        } else {
            breadcrumbMapped = breadcrumb;
        }

        let lastIdx = breadcrumbMapped.length - 1;
        return breadcrumbMapped
            .filter(item=>{
                if(!item) {
                    console.warn("Breacrumb with null items");
                    return false;
                }
                return true;
            })
            .map((item, idx)=>{
            if(idx === lastIdx) {
                return (
                    <div key={item.tuuid} className='inline pl-1 md:pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                        {item.nom}
                    </div>
                )
            } else {
                return (
                    <div key={item.tuuid} 
                        className='inline cursor-pointer pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                            {onClick?
                                <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                            :
                                <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
                            }
                            <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </div>
                )
            }
        })
    }, [username, breadcrumb, root, onClick, onClickHandler]);

    if(!root && !username) return <p>Loading ...</p>;

    return (
        <nav aria-label='breadcrumb' className='w-screen leading-3 pr-2 line-clamp-2'>
            {breadcrumb?
                <div className='inline cursor-pointer items-center pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    {onClick?
                        <p onClick={onClickHandler}>{root?.name || username}</p>
                    :
                        <Link to={root?.path || '/apps/collections2/b/root'}>{root?.name || username}</Link>
                    }
                    
                    <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                </div>
            :
                <div className='inline p-1 md:p-2 text-sm bg-slate-700 bg-opacity-50'>
                    {root?.name || username}
                </div>
            }
            {breadcrumbMapped}
        </nav>
    );
}

export enum ModalEnum {
    Info=1,
    NewDirectory,
    ImportZip,
    Copy,
    Cut,
    Share,
    Rename
};

export type ButtonBarProps = {
    disableStatistics?: boolean,
    disableEdit?: boolean,
    shared?: boolean,
    // onModal: (modalName: ModalEnum) => void,
};

export function ButtonBar(props: ButtonBarProps) {

    let {disableStatistics, shared} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let refUpload = useRef(null as HTMLInputElement | null);

    let userId = useUserBrowsingStore(state=>state.userId);

    let viewMode = useUserBrowsingStore(state=>state.viewMode);
    let setViewMode = useUserBrowsingStore(state=>state.setViewMode);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let selection = useUserBrowsingStore(state=>state.selection);
    let cuuid = useUserBrowsingStore(state=>state.currentCuuid);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);
    let setModal = useUserBrowsingStore(state=>state.setModal);
    let onModal = useCallback((modal: ModalEnum)=>setModal(modal), [setModal]);

    let [selectCount, directorySelectCount] = useMemo(()=>{
        if(!selection) return [0, 0];
        let directorySelectCount = 0;
        if(currentDirectory) {
            //@ts-ignore
            let selectedItems = selection.map(item=>currentDirectory[item]).filter(item=>item) as TuuidsBrowsingStoreRow[];
            directorySelectCount = selectedItems.reduce((acc, item)=>{
                if(item.type_node !== 'Fichier') return acc+1;
                return acc;
            }, 0);
        }
        return [selection.length, directorySelectCount];
    }, [selection, currentDirectory]);

    let viewModeOnClick = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = Number.parseInt(e.currentTarget.value) as ViewMode;
        setViewMode(value);
    }, [setViewMode]);

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);

    let addFileHandler = useCallback(() => refUpload?.current?.click(), [refUpload]);

    let deleteHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!selection || selection.length === 0) throw new Error('Nothing selected to delete');
        let response = await workers.connection.deleteFilesCollection2(selection);
        if(!response.ok) throw new Error('Error deleting files/directories: ' + response.err);
        setSelectionMode(false);  // Exit selection mode
    }, [workers, ready, selection, setSelectionMode]);

    let directoryInfoHandler = useCallback(() => onModal(ModalEnum.Info), [onModal]);
    let createDirectoryHandler = useCallback(() => onModal(ModalEnum.NewDirectory), [onModal]);
    let importZipHandler = useCallback(()=>onModal(ModalEnum.ImportZip), [onModal]);
    let renameHandler = useCallback(()=>onModal(ModalEnum.Rename), [onModal]);
    let copyHandler = useCallback(()=>onModal(ModalEnum.Copy), [onModal]);
    let cutHandler = useCallback(()=>onModal(ModalEnum.Cut), [onModal]);
    let shareHandler = useCallback(()=>onModal(ModalEnum.Share), [onModal]);

    let fileUploadHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let files = e.currentTarget.files;
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!cuuid) throw new Error('Root cannot be used to upload files');
        if(!userId) throw new Error("UserId not provided");
        if(!files || files.length === 0) throw new Error('No files provided');
        let breadcrumbString = breadcrumb?.map(item=>item.nom).join('/');

        generateFileUploads(workers, userId, cuuid, files, breadcrumbString)
            .catch(err=>console.error("Error starting upload", err));
        // workers.upload.addUploads(userId, cuuid, files)
        //     .catch(err=>console.error("Error starting upload", err));
    }, [workers, ready, userId, cuuid, breadcrumb]);

    return (
        <div className='grid grid-cols-4 pt-1'>
            <div className='col-span-3'>
                <button onClick={directoryInfoHandler}
                    className={'varbtn px-2 mr-2 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500'}>
                        <img src={InfoIcon} alt='Info' className='w-6 inline-block' />
                </button>

                <button onClick={viewModeOnClick} value={ViewMode.List}
                    className={'varbtn px-2 mr-0 py-2 hover:bg-slate-600 active:bg-slate-500 ' + (viewMode===ViewMode.List?'bg-slate-500':'bg-slate-700')}>
                        <img src={ListIcon} alt='List view' title='List view' className='w-6 inline-block' />
                </button>
                <button onClick={viewModeOnClick} value={ViewMode.Thumbnails}
                    className={'varbtn mx-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 ' + (viewMode===ViewMode.Thumbnails?'bg-slate-500':'bg-slate-700')}>
                        <img src={GridIcon} alt='Grid view' title='Grid view' className='w-6 inline-block' />
                </button>
                <button onClick={viewModeOnClick} value={ViewMode.Carousel} disabled={true}
                    className={'varbtn ml-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900 ' + (viewMode===ViewMode.Carousel?'bg-slate-500':'bg-slate-700')}>
                        <img src={ImageIcon} alt='Carousel view' title='Carousel view' className='w-6 inline-block' />
                </button>

                {props.disableEdit?
                <></>    
                :
                    <>
                        <button onClick={addFileHandler} disabled={!cuuid}
                            className={'varbtn ml-2 px-0.5 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900'}>
                                <img src={FileAddIcon} alt='Add files' title='Add files' className='w-10 inline-block' />
                        </button>

                        <button onClick={createDirectoryHandler}
                            className={'varbtn ml-0 px-0.5 py-0.5 bg-slate-700 hover:bg-slate-600 active:bg-slate-500'}>
                                <img src={FolderAddIcon} alt='Add directory' title='Add directory' className='w-10 inline-block' />
                        </button>

                        <button onClick={importZipHandler} disabled={true}
                            className={'varbtn hidden lg:inline px-2 mr-0 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900'}>
                                <span>+ ZIP</span>
                        </button>
                    </>
                }

                <button onClick={toggleSelectionMode}
                    className={'varbtn ml-4 px-1 py-1 w-10 hover:bg-slate-600 active:bg-slate-500 ' + (selectionMode?'bg-violet-500':'bg-slate-700')}>
                        <img src={SelectionModeIcon} alt="Select files" title="Select files" className='w-8 inline-block'/>
                </button>
                {props.disableEdit?<></>:
                    <button onClick={renameHandler} disabled={!selectionMode || selectCount !== 1}
                        className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                            <img src={EditIcon} alt="Rename files" title='Rename files' className='w-8 inline-block'/>
                    </button>
                }
                <button onClick={copyHandler} disabled={!selectionMode || !selectCount}
                    className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                        <img src={CopyIcon} alt="Copy files" title="Copy files" className='w-8 inline-block'/>
                </button>
                {props.disableEdit?<></>:
                    <>
                        <button onClick={cutHandler} disabled={!selectionMode || !selectCount}
                            className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                                <img src={CutIcon} alt="Move files" title="Move files" className='w-8 inline-block'/>
                        </button>
                        <button onClick={shareHandler} disabled={!selectionMode || !directorySelectCount || selectCount !== directorySelectCount}
                            className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                                <img src={ShareIcon} alt="Share collection" title="Share collection" className='w-8 inline-block'/>
                        </button>
                        <ActionButton disabled={!selectionMode || !selectCount} onClick={deleteHandler} confirm={true} revertSuccessTimeout={2} varwidth={10}>
                            <img src={TrashIcon} alt="Delete files" title="Delete files" className='w-8 inline-block'/>
                        </ActionButton>
                    </>
                }
            </div>
            <div className='text-sm'>
                {disableStatistics?
                    <></>
                :
                    <DirectoryInformation shared={shared} />
                }
                
            </div>
            
            {/* Input that handles file upload. Hidden, it gets triggered through the upload file button. */}
            <input ref={refUpload} id='file_upload' className='hidden' type='file' multiple={true} onChange={fileUploadHandler} />
        </div>        
    );
}

function DirectoryInformation(props: {shared?: boolean}) {
    
    let {shared} = props;
    let browseStatistics = useUserBrowsingStore(state=>state.directoryStatistics);
    let sharedStatistics = useUserBrowsingStore(state=>state.sharedDirectoryStatistics);
    let selection = useUserBrowsingStore(state=>state.selection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);

    let statistics = useMemo(()=>{
        if(shared) return sharedStatistics;
        return browseStatistics;
    }, [shared, browseStatistics, sharedStatistics])

    let [fileInfo, dirInfo] = useMemo(()=>{
        if(!statistics) return [null, null, 0];
        let fileInfo = null, dirInfo = null, totalTuuids = 0;
        for(let info of statistics) {
            if(info.type_node === 'Fichier') {
                fileInfo = info;
            } else if(['Repertoire', 'Collection'].includes(info.type_node)) {
                dirInfo = info;
            }
        }
        return [fileInfo, dirInfo, totalTuuids];
    }, [statistics]);

    let selectionElem = useMemo(()=>{
        if(!selectionMode) return <></>;
        if(!selection || selection.length === 0) return <p>No items selected</p>;
        if(selection.length === 1) return <p>1 item selected</p>;
        return <p>{selection.length} items selected</p>;
    }, [selectionMode, selection]);

    if(!statistics) {
        if(statistics === false) return <></>
        return (<p>Loading ...</p>);
    }

    return (
        <div className='grid grid-cols-2'>
            <div>
                {fileInfo?.count?
                    <p>{fileInfo.count} files (<Formatters.FormatteurTaille value={fileInfo?.taille} />)</p>
                :
                    <p>No files</p>
                }
                <p>{dirInfo?.count?dirInfo.count:'No'} directories</p>
                {selectionElem}
            </div>
            <LoadingStatus />
        </div>
    )
}

function LoadingStatus() {

    let statistics = useUserBrowsingStore(state=>state.directoryStatistics);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);

    let totalTuuids = useMemo(()=>{
        if(!statistics) return 0;
        let totalTuuids = 0;
        for(let info of statistics) {
            if(info.count) totalTuuids += info.count;
        }
        return totalTuuids;
    }, [statistics]);

    let pctLoaded = useMemo(()=>{
        if(!currentDirectory || !totalTuuids) return null;
        let current = Object.keys(currentDirectory).length;
        if(current < totalTuuids) {
            let pctLoaded = Math.floor(current / totalTuuids * 100);
            return pctLoaded;
        }
        return null;
    }, [currentDirectory, totalTuuids]);

    if(pctLoaded && pctLoaded < 100) {
        return <p>Loading {pctLoaded}%</p>;
    }

    return (
        <></>
    );
}