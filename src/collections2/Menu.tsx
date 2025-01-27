import { useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';

import useConnectionStore from '../connectionStore';
import useUserBrowsingStore from './userBrowsingStore';

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

import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';
import { ButtonBarProps, ModalEnum } from './BrowsingElements';
import ActionButton from '../resources/ActionButton';
import useWorkers from '../workers/workers';

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

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);
    
    let cssDisconnected = useMemo(()=>{
        if(!connectionReady) return ' bg-red-500';
        if(!filehostAuthenticated) return ' bg-amber-700'
        return '';
    }, [connectionReady, filehostAuthenticated]);

    let selectedSection = useMemo(()=>{
        let locationPath = location.pathname;
        if(locationPath.startsWith('/apps/collections2/settings')) {
            return 'settings';
        } else if(locationPath.startsWith('/apps/collections2/conversions')) {
            return 'conversions';
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
    }, [location]);

    let onModalHandler = useCallback((modalName: ModalEnum)=>{
        console.debug("Modal ", modalName);
    }, []);

    return (
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
                    <ButtonBarMobile disableStatistics={true} onModal={onModalHandler} />
                </div>

                {/* Regular menu items - need to hide in mobile mode during selection. */}
                <div className={'inline ' + (selectionMode?'hidden md:inline':'')}>
                    <div className={'hidden lg:inline-block px-1 w-25 transition-colors duration-300' + (selectedSection==='transfer'?selectedClassname:unselectedClassname)}>
                        <img src={UploadIcon} alt='Upload' className='w-7 inline-block' />
                        <p className='inline-block text-sm'>100%</p>
                        <span className='pl-1'>/</span>
                        <img src={DownloadIcon} alt='Download' className='w-7 inline-block' />
                        <p className='inline-block text-sm'>100%</p>
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
                    <div className={'inline-block hidden md:inline px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='settings'?selectedClassname:unselectedClassname)}>
                        <Link to='/apps/collections2/settings'>
                            <img src={SettingIcon} alt="Settings" className='w-7 inline-block' />
                        </Link>
                    </div>
                    <div className={'inline md:hidden px-1 sm:px-2 transition-colors duration-300' + (selectedSection==='settings'?selectedClassname:unselectedClassname)}>
                        <button>
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
    )
}

function ButtonBarMobile(props: ButtonBarProps) {
    
    let {shared, onModal} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let selection = useUserBrowsingStore(state=>state.selection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);

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
            {props.disableEdit?<></>:
                <button onClick={renameHandler} disabled={!selectionMode || selectCount !== 1}
                    className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                        <img src={EditIcon} alt="Rename files" title='Rename files' className='w-5 h-5 inline-block'/>
                </button>
            }
            <button onClick={copyHandler} disabled={!selectionMode || !selectCount}
                className='px-2 mx-1 transition ease-in-out disabled:bg-slate-900 disabled:text-slate-600 cursor-pointer rounded-t-md bg-slate-700 disabled:bg-slate-900'>
                    <img src={CopyIcon} alt="Copy files" title="Copy files" className='w-5 inline-block'/>
            </button>
            {props.disableEdit?<></>:
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


// disabled:ring-offset-0 disabled:ring-0 hover:ring-offset-1 hover:ring-1