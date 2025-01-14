import { Link } from "react-router-dom";
import useUserBrowsingStore, { ViewMode } from "./userBrowsingStore";
import { MouseEvent, useCallback, useMemo } from "react";
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
import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';

type BreadcrumbProps = {
    root?: {tuuid: string | null, name: string, path?: string} | null,
    onClick?: (tuuid: string | null) => void,
}

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
        return breadcrumbMapped.map((item, idx)=>{
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
                            <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
                        }
                        
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                )
            }
        })
    }, [username, breadcrumb, root, onClick, onClickHandler]);

    if(!root && !username) return <p>Loading ...</p>;

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                {breadcrumb?
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        {onClick?
                            <p onClick={onClickHandler}>{root?.name || username}</p>
                        :
                            <Link to={root?.path || '/apps/collections2/b/root'}>{root?.name || username}</Link>
                        }
                        
                        <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                    </li>
                :
                    <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                        {root?.name || username}
                    </li>
                }
                {breadcrumbMapped}
            </ol>
        </nav>
    );
}

type ButtonBarProps = {
    disableStatistics?: boolean,
    disableEdit?: boolean,
    shared?: boolean,
}

export function ButtonBar(props: ButtonBarProps) {

    let {disableStatistics, shared} = props;

    let viewMode = useUserBrowsingStore(state=>state.viewMode);
    let setViewMode = useUserBrowsingStore(state=>state.setViewMode);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);

    let viewModeOnClick = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = Number.parseInt(e.currentTarget.value) as ViewMode;
        setViewMode(value);
    }, [setViewMode]);

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);

    let directoryInfoHandler = useCallback(async () => {
        console.debug("Info!");
    }, []);

    let addFileHandler = useCallback(async () => {
        console.debug("Add files!");
    }, []);

    let createDirectoryHandler = useCallback(async () => {
        console.debug("Create directory!");
    }, []);

    let importZipHandler = useCallback(async () => {
        console.debug("Import zip!");
    }, []);

    let copyHandler = useCallback(async () => {
        console.debug("Copy!");
    }, []);

    let cutHandler = useCallback(async () => {
        console.debug("Cut!");
    }, []);

    let shareHandler = useCallback(async () => {
        console.debug("Share!");
    }, []);

    let deleteHandler = useCallback(async () => {
        console.debug("Delete!");
    }, []);

    return (
        <div className='grid grid-cols-2 md:grid-cols-3 pt-1'>
            <div className='col-span-2'>
                <button onClick={directoryInfoHandler}
                    className={'varbtn px-2 mr-2 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500'}>
                        <img src={InfoIcon} alt='Info' className='w-6 inline-block' />
                </button>

                <button onClick={viewModeOnClick} value={ViewMode.List}
                    className={'varbtn px-2 mr-0 py-2 hover:bg-slate-600 active:bg-slate-500 ' + (viewMode===ViewMode.List?'bg-slate-500':'bg-slate-700')}>
                        <img src={ListIcon} alt='List view' className='w-6 inline-block' />
                </button>
                <button onClick={viewModeOnClick} value={ViewMode.Thumbnails}
                    className={'varbtn mx-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 ' + (viewMode===ViewMode.Thumbnails?'bg-slate-500':'bg-slate-700')}>
                        <img src={GridIcon} alt='Grid view' className='w-6 inline-block' />
                </button>
                <button onClick={viewModeOnClick} value={ViewMode.Carousel}
                    className={'varbtn ml-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 ' + (viewMode===ViewMode.Carousel?'bg-slate-500':'bg-slate-700')}>
                        <img src={ImageIcon} alt='Carousel view' className='w-6 inline-block' />
                </button>

                {props.disableEdit?
                <></>    
                :
                    <>
                        <button onClick={addFileHandler} disabled={true}
                            className={'varbtn ml-2 px-2 bg-slate-700 py-2 hover:bg-slate-600 active:bg-slate-500'}>
                                <img src={FileAddIcon} alt='Add files' className='w-6 inline-block' />
                        </button>

                        <button onClick={createDirectoryHandler}
                            className={'varbtn ml-0 px-2 bg-slate-700 py-2 hover:bg-slate-600 active:bg-slate-500'}>
                                <img src={FolderAddIcon} alt='Add directory' className='w-6 inline-block' />
                        </button>

                        <button onClick={importZipHandler}
                            className={'varbtn px-2 mr-0 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-500'}>
                                <span>+ ZIP</span>
                        </button>
                    </>
                }

                <button onClick={toggleSelectionMode}
                    className={'varbtn ml-4 px-2 py-2 w-10 hover:bg-slate-600 active:bg-slate-500 ' + (selectionMode?'bg-violet-500':'bg-slate-700')}>
                        <img src={SelectionModeIcon} alt="Select files" className='w-6 inline-block'/>
                </button>
                <button onClick={copyHandler} disabled={!selectionMode}
                    className='varbtn ml-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 bg-slate-700'>
                        <img src={CopyIcon} alt="Copy files" className='w-6 inline-block'/>
                </button>
                <button onClick={cutHandler} disabled={!selectionMode}
                    className='varbtn ml-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 bg-slate-700'>
                        <img src={CutIcon} alt="Move files" className='w-6 inline-block'/>
                </button>
                <button onClick={shareHandler} disabled={!selectionMode}
                    className='varbtn ml-0 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 bg-slate-700'>
                        <img src={ShareIcon} alt="Share collection" className='w-6 inline-block'/>
                </button>
                <ActionButton disabled={!selectionMode} onClick={deleteHandler} confirm={true} revertSuccessTimeout={2} varwidth={10}>
                    <img src={TrashIcon} alt="Delete files" className='w-6 inline-block'/>
                </ActionButton>
                {/* <button disabled={!selectionMode}
                    className='varbtn ml-0 ml-4 px-2 py-2 hover:bg-slate-600 active:bg-slate-500 bg-slate-700'>
                        <img src={TrashIcon} alt="Delete files" className='w-6 inline-block'/>
                        
                </button> */}

            </div>
            <div className='text-sm'>
                {disableStatistics?
                    <></>
                :
                    <DirectoryInformation shared={shared} />
                }
                
            </div>
        </div>        
    );
}

function DirectoryInformation(props: {shared?: boolean}) {
    
    let {shared} = props;
    let browseStatistics = useUserBrowsingStore(state=>state.directoryStatistics);
    let sharedStatistics = useUserBrowsingStore(state=>state.sharedDirectoryStatistics);

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