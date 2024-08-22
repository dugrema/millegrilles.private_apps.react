import { Link } from 'react-router-dom';

import useConnectionStore from './connectionStore';
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
        <header className={'fixed top-0 transition grid grid-cols-4 md:grid-cols-12 w-full' + cssDisconnected}>
            <div className='col-span-4'>
                {props.backLink?
                    <Link to='/apps'>{props.title}</Link>
                    :
                    <span>{props.title}</span>
                }
            </div>
            <div className='hidden md:block col-span-4'>
                <a href="/">Portal</a>
            </div>
            <div className='hidden md:block col-span-4'></div>
        </header>
    )
}
