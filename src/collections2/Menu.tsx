import { Link } from 'react-router-dom';

import useConnectionStore from '../connectionStore';
import { useMemo } from 'react';

type MenuProps = {
    title: string,
    backLink?: boolean,
};

export default function HeaderMenu(props: MenuProps) {

    let connectionReady = useConnectionStore(state=>state.connectionAuthenticated);

    let cssDisconnected = useMemo(()=>{
        if(connectionReady) return '';
        return ' bg-red-500';
    }, [connectionReady]);

    return (
        <header className={'fixed pl-2 pr-2 pt-2 top-0 transition grid grid-cols-2 md:grid-cols-3 w-full' + cssDisconnected}>
            <div className='text-lg font-bold underline'>
                {props.backLink?
                    <Link to='/apps'>{props.title}</Link>
                    :
                    <span>{props.title}</span>
                }
            </div>
            <div className='hidden md:block'>
                <div className='md:inline-block'>Up/Down</div>
                <div className='md:inline-block'>Search</div>
                <div className='md:inline-block'>Trash</div>
                <div className='md:inline-block'>Media</div>
                <div className='md:inline-block'>Sharing</div>
                <div className='md:inline-block'>Config</div>
            </div>
            <div className='text-right text-lg font-bold underline'>
                <a href="/millegrilles">Portal</a>
            </div>
        </header>
    )
}
