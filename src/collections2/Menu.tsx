import { Link, useLocation } from 'react-router-dom';

import useConnectionStore from '../connectionStore';
import { useMemo } from 'react';

import HomeIcon from '../resources/icons/home-1-svgrepo-com.svg';
import DownloadIcon from '../resources/icons/download-svgrepo-com.svg';
import UploadIcon from '../resources/icons/share-2-svgrepo-com.svg';
import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';
import SearchIcon from '../resources/icons/search-svgrepo-com.svg';
import ShareIcon from '../resources/icons/share-1-svgrepo-com.svg';
import SettingIcon from '../resources/icons/settings-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';
import LogoutIcon from '../resources/icons/logout-svgrepo-com.svg';

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

    return (
        <header className={'fixed pl-2 pr-6 pt-2 top-0 transition grid grid-cols-4 w-full' + cssDisconnected}>
            <div className='hidden sm:inline text-lg font-bold underline'>
                {props.backLink?
                    <Link to='/apps'>{props.title}</Link>
                    :
                    <span>{props.title}</span>
                }
            </div>
            <div className='col-span-4 sm:col-span-2 text-center sm:text-center border-b border-violet-500'>
                <div className={'hidden lg:inline-block px-1 w-25 transition-colors duration-300' + (selectedSection==='transfer'?selectedClassname:unselectedClassname)}>
                    <img src={UploadIcon} alt='Upload' className='w-7 inline-block' />
                    <p className='inline-block text-sm'>100%</p>
                    <span className='pl-1'>/</span>
                    <img src={DownloadIcon} alt='Download' className='w-7 inline-block' />
                    <p className='inline-block text-sm'>100%</p>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='browse'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/b'>
                        <img src={HomeIcon} alt="Browse" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='search'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/s'>
                        <img src={SearchIcon} alt="Search" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='deleted'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/d'>
                        <img src={TrashIcon} alt="Deleted files" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='conversions'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/conversions'>
                        <img src={VideoIcon} alt="Media conversions" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='share'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/c'>
                        <img src={ShareIcon} alt="Share" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className={'inline-block px-2 transition-colors duration-300' + (selectedSection==='settings'?selectedClassname:unselectedClassname)}>
                    <Link to='/apps/collections2/settings'>
                        <img src={SettingIcon} alt="Settings" className='w-7 inline-block' />
                    </Link>
                </div>
                <div className='inline sm:hidden px-2'>
                    <a href="/millegrilles">
                        <img src={LogoutIcon} alt='Go to portal' className='w-7 inline' title='Back to portal' />
                    </a>
                </div>

            </div>
            <div className='hidden sm:inline text-right'>
                <a href="/millegrilles">
                    <img src={LogoutIcon} alt='Go to portal' className='w-7 inline' title='Back to portal' />
                </a>
            </div>
        </header>
    )
}
