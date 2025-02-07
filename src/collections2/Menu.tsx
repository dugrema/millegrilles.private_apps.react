import { ChangeEvent, MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import useConnectionStore from '../connectionStore';
import useUserBrowsingStore, { ViewMode } from './userBrowsingStore';

import HomeIcon from '../resources/icons/home-1-svgrepo-com.svg';
import DownloadIcon from '../resources/icons/download-svgrepo-com.svg';
import UploadIcon from '../resources/icons/share-2-svgrepo-com.svg';
import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';
import SearchIcon from '../resources/icons/search-svgrepo-com.svg';
import ShareIcon from '../resources/icons/share-1-svgrepo-com.svg';
import SettingIcon from '../resources/icons/settings-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';
import LogoutIcon from '../resources/icons/logout-svgrepo-com.svg';
import CopyIcon from '../resources/icons/copy-svgrepo-com.svg';
import CutIcon from '../resources/icons/cut-svgrepo-com.svg';
import EditIcon from '../resources/icons/edit-2-svgrepo-com.svg';
import MenuIcon from '../resources/icons/menu-hamburger-svgrepo-com.svg';
import FileAddIcon from '../resources/icons/file-dock-svgrepo-com.svg';
import FolderAddIcon from '../resources/icons/folder-add-fill-svgrepo-com.svg';
import InfoIcon from '../resources/icons/info-svgrepo-com.svg';
import ListIcon from '../resources/icons/list-pointers-svgrepo-com.svg';
import GridIcon from '../resources/icons/grid-4-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';


import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';
import { ModalEnum } from './BrowsingElements';
import ActionButton from '../resources/ActionButton';
import useWorkers from '../workers/workers';
import useTransferStore, { TransferActivity } from './transferStore';
import { generateFileUploads } from './transferUtils';

type MenuProps = {
    title: string,
    backLink?: boolean,
};

const selectedClassname = ' bg-violet-500 rounded-t-md';
const unselectedClassname = ' bg-violet-900 bg-opacity-30';

export default function HeaderMenu(props: MenuProps) {

    let location = useLocation();

    let connectionReady = useConnectionStore(state=>state.connectionAuthenticated);
    let filehostAuthenticated = useConnectionStore(state=>state.filehostAuthenticated);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let [showSubmenu, setShowSubmenu] = useState(false);
    let toggleSubmenu = useCallback(()=>setShowSubmenu(!showSubmenu), [showSubmenu, setShowSubmenu]);

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);
    
    let disableEdit = useMemo(()=>{
        let locationPath = location.pathname;
        if(locationPath.startsWith('/apps/collections2/b')) {
            return false;
        }
        return true;
    }, [location]);

    let cssDisconnected = useMemo(()=>{
        if(!connectionReady) return ' bg-red-500';
        if(!filehostAuthenticated) return ' bg-amber-700'
        return '';
    }, [connectionReady, filehostAuthenticated]);

    let selectedSection = useMemo(()=>{
        let locationPath = location.pathname;
        if(showSubmenu) {
            return 'submenu';
        } else if(locationPath.startsWith('/apps/collections2/settings')) {
            return 'settings';
        } else if(locationPath.startsWith('/apps/collections2/conversions')) {
            return 'conversions';
        } else if(locationPath.startsWith('/apps/collections2/transfers')) {
            return 'transfers';
        } else if(locationPath.startsWith('/apps/collections2/b')) {
            return 'browse';
        } else if(locationPath.startsWith('/apps/collections2/s')) {
            return 'search';
        } else if(locationPath.startsWith('/apps/collections2/d')) {
            return 'deleted';
        } else if(locationPath.startsWith('/apps/collections2/c')) {
            return 'share';
        }
        return null;
    }, [location, showSubmenu]);

    return (
        <>
            <header className={'fixed pl-2 pr-6 pt-2 top-0 transition grid grid-cols-4 w-full' + cssDisconnected}>

                {/* Left portion of the menu: banner. Hide when <sm. */}
                <div className='hidden sm:inline text-lg font-bold underline'>
                    {props.backLink?
                        <Link to='/apps'>{props.title}</Link>
                        :
                        <span>{props.title}</span>
                    }
                </div>

                {/* Middle section of the menu. */}
                <div className='col-span-4 sm:col-span-2 text-center sm:text-center border-b border-violet-500'>

                    {/* Selection toggle for mobile mode (when <md). */}
                    <button onClick={toggleSelectionMode}
                        className={'inline-block md:hidden px-1 sm:px-2 mr-1 sm:mr-2 transition-colors duration-300 rounded-t-md ' + (selectionMode?'bg-violet-500':'')}>
                            <img src={SelectionModeIcon} alt="Select files" title="Select files" className='w-7 inline-block'/>
                    </button>

                    {/* Selection buttons for mobile mode. Always hide when >=md. */}
                    <div className={'inline md:hidden'}>
                        <ButtonBarMobile disableEdit={disableEdit} />
                    </div>

                    {/* Regular menu items - need to hide in mobile mode during selection. */}
                    <div className={'inline ' + (selectionMode?'hidden md:inline':'')}>
                        <div className={'hidden lg:inline-block px-1 w-40 transition-colors duration-300' + (selectedSection==='transfers'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/transfers'><TransferTickers /></Link>
                                {/* <img src={UploadIcon} alt='Upload' className='w-7 inline-block' />
                                <p className='inline-block text-sm w-10'>100%</p>
                                <span className='pl-1'>/</span>
                                <img src={DownloadIcon} alt='Download' className='w-7 inline-block' />
                                <p className='inline-block text-sm w-10'>100%</p> */}
                            {/* </Link> */}
                        </div>
                        <div className={'inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='browse'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/b'>
                                <img src={HomeIcon} alt="Browse" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='search'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/s'>
                                <img src={SearchIcon} alt="Search" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='deleted'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/d'>
                                <img src={TrashIcon} alt="Deleted files" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='conversions'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/conversions'>
                                <img src={VideoIcon} alt="Media conversions" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='share'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/c'>
                                <img src={ShareIcon} alt="Share" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline-block hidden md:inline-block px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='settings'?selectedClassname:unselectedClassname)}>
                            <Link to='/apps/collections2/settings'>
                                <img src={SettingIcon} alt="Settings" className='w-7 inline-block' />
                            </Link>
                        </div>
                        <div className={'inline md:hidden px-1 pb-1.5 sm:px-2 transition-colors duration-300' + (['submenu', 'settings'].includes(selectedSection||'')?selectedClassname:unselectedClassname)}>
                            <button onClick={toggleSubmenu}>
                                <img src={MenuIcon} alt="Menu" className='w-7 inline-block' />
                            </button>
                        </div>
                    </div>

                </div>

                {/* Right portion of the menu: back to portal link. Hide when < md. */}
                <div className='hidden sm:inline text-right'>
                    <a href="/millegrilles">
                        <img src={LogoutIcon} alt='Go to portal' className='w-7 inline' title='Back to portal' />
                    </a>
                </div>

            </header>
            {showSubmenu?
                <div id='mobile-nav-submenu' className='fixed px-4 left-0 w-full top-9 z-10 bg-violet-800 bg-opacity-90 py-2'>
                    <div className='grid grid-cols-4'>
                        {/* Banner */}
                        <p className='col-span-3 text-lg font-bold underline'>
                            {props.backLink?
                                <Link to='/apps'>{props.title}</Link>
                            :
                                <span>{props.title}</span>
                            }
                        </p>
                        <p className='w-full text-right'>
                            <button onClick={toggleSubmenu} className='varbtn ml-2 px-2 py-1 bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                                X
                            </button>
                        </p>
                    </div>

                    {/* Button bar */}
                    <div className='py-3'><SubmenuButtonBar disableEdit={disableEdit} close={toggleSubmenu} /></div>

                    {/* Transfers */}
                    <div className='py-3 px-1 w-40 transition-colors duration-300'>
                        <Link to='/apps/collections2/transfers' onClick={toggleSubmenu}>
                            <img src={UploadIcon} alt='Upload' className='w-7 inline-block' />
                            <p className='inline-block text-sm w-10'>100%</p>
                            <span className='pl-1'>/</span>
                            <img src={DownloadIcon} alt='Download' className='w-7 inline-block' />
                            <p className='inline-block text-sm w-10'>100%</p>
                        </Link>
                    </div>

                    {/* Additional links */}
                    <Link to='/apps/collections2/settings' className='block py-3' onClick={toggleSubmenu}>
                        <img src={SettingIcon} alt="Settings" className='w-7 inline-block' />
                        <span className='pl-1'>Settings</span>
                    </Link>
                    <p className='py-3'>
                        <a href="/millegrilles">
                            <img src={LogoutIcon} alt='Go to portal' className='w-7 inline' title='Back to portal' />
                            <span className='pl-1'>Back to portal</span>
                        </a>
                    </p>
                </div>
            :<></>}
        </>
    )
}

function TransferTickers() {

    let downloadActivity = useTransferStore(state=>state.downloadActivity);
    let downloadTransferPercent = useTransferStore(state=>state.downloadTransferPercent);

    let [downloadClassName, downloadLabel] = useMemo(()=>{
        let downloadClassName = '', downloadLabel = <>-</>;
        if(downloadActivity === TransferActivity.ERROR) downloadClassName = 'bg-red-600';
        else if(downloadActivity === TransferActivity.RUNNING) downloadClassName = 'bg-green-600';
        
        if(typeof(downloadTransferPercent) === 'number') downloadLabel = <>{`${downloadTransferPercent}%`}</>;

        return [downloadClassName, downloadLabel];
    }, [downloadActivity, downloadTransferPercent]);

    return (
        <>
            <img src={UploadIcon} alt='Upload' className='w-7 inline-block' />
            <p className='inline-block text-sm w-10'>100%</p>
            <span className='pl-1'>/</span>
            <img src={DownloadIcon} alt='Download' className={'w-7 inline-block ' + downloadClassName} />
            <p className='inline-block text-sm w-10'>{downloadLabel}</p>
        </>
    )
}

function ButtonBarMobile(props: {disableEdit: boolean}) {

    let {disableEdit} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let selection = useUserBrowsingStore(state=>state.selection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let setModal = useUserBrowsingStore(state=>state.setModal);
    let onModal = useCallback((modal: ModalEnum)=>setModal(modal), [setModal]);

    let renameHandler = useCallback(()=>onModal(ModalEnum.Rename), [onModal]);
    let copyHandler = useCallback(()=>onModal(ModalEnum.Copy), [onModal]);
    let cutHandler = useCallback(()=>onModal(ModalEnum.Cut), [onModal]);
    let shareHandler = useCallback(()=>onModal(ModalEnum.Share), [onModal]);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);

    let deleteHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!selection || selection.length === 0) throw new Error('Nothing selected to delete');
        let response = await workers.connection.deleteFilesCollection2(selection);
        if(!response.ok) throw new Error('Error deleting files/directories: ' + response.err);
        setSelectionMode(false);  // Exit selection mode
    }, [workers, ready, selection, setSelectionMode]);

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
    
    if(!selectionMode) return <></>;

    return (
        <div className='inline pl-8'>
            {disableEdit?<></>:
                <button onClick={renameHandler} disabled={!selectionMode || selectCount !== 1}
                    className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                        <img src={EditIcon} alt="Rename files" title='Rename files' className='w-5 h-5 inline-block'/>
                </button>
            }
            <button onClick={copyHandler} disabled={!selectionMode || !selectCount}
                className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                    <img src={CopyIcon} alt="Copy files" title="Copy files" className='w-5 inline-block'/>
            </button>
            {disableEdit?<></>:
                <>
                    <button onClick={cutHandler} disabled={!selectionMode || !selectCount}
                        className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                            <img src={CutIcon} alt="Move files" title="Move files" className='w-5 inline-block'/>
                    </button>
                    <button onClick={shareHandler} disabled={!selectionMode || !directorySelectCount || selectCount !== directorySelectCount}
                        className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                            <img src={ShareIcon} alt="Share collection" title="Share collection" className='w-5 inline-block'/>
                    </button>
                    <ActionButton disabled={!selectionMode || !selectCount} onClick={deleteHandler} confirm={true} revertSuccessTimeout={2}
                        className='px-2 ml-5 w-9 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900 disabled:ring-offset-0 disabled:ring-0 hover:ring-offset-1 hover:ring-1'>
                            <img src={TrashIcon} alt="Delete files" title="Delete files" className='w-5 inline-block'/>
                    </ActionButton>
                </>
            }
        </div>
    );
}

type SubmenuButtonBarProps = {
    disableEdit: boolean,
    close: () => void,
}

function SubmenuButtonBar(props: SubmenuButtonBarProps) {

    let {disableEdit, close} = props;

    let refUpload = useRef(null as HTMLInputElement | null);
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let cuuid = useUserBrowsingStore(state=>state.currentCuuid);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);
    let userId = useUserBrowsingStore(state=>state.userId);

    let viewMode = useUserBrowsingStore(state=>state.viewMode);
    let setViewMode = useUserBrowsingStore(state=>state.setViewMode);

    let setModal = useUserBrowsingStore(state=>state.setModal);
    let onModal = useCallback((modal: ModalEnum)=>setModal(modal), [setModal]);

    let directoryInfoHandler = useCallback(()=>{
        onModal(ModalEnum.Info);
        close()
    }, [onModal, close]);
    let viewModeOnClick = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = Number.parseInt(e.currentTarget.value) as ViewMode;
        setViewMode(value);
        close();
    }, [close, setViewMode]);
    let addFileHandler = useCallback(() => refUpload?.current?.click(), [refUpload]);
    let createDirectoryHandler = useCallback(()=>{
        onModal(ModalEnum.NewDirectory);
        close()
    }, [onModal, close]);

    let fileUploadHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let files = e.currentTarget.files;
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!cuuid) throw new Error('Root cannot be used to upload files');
        if(!userId) throw new Error("UserId not provided");
        if(!files || files.length === 0) throw new Error('No files provided');
        let breadcrumbString = breadcrumb?.map(item=>item.nom).join('/');

        generateFileUploads(workers, userId, cuuid, files, breadcrumbString)
            .catch(err=>console.error("Error starting upload", err));
    }, [workers, ready, userId, cuuid, breadcrumb]);

    return (
        <>
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

            {disableEdit?
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

                    {/* Input that handles file upload. Hidden, it gets triggered through the upload file button. */}
                    <input ref={refUpload} id='menu_file_upload' className='hidden' type='file' multiple={true} onChange={fileUploadHandler} />
                </>
            }
        </>
    )
}
