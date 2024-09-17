import { Outlet } from 'react-router-dom';
import HeaderMenu from '../Menu';
import SyncConversations from './SyncConversations';
import { useEffect } from 'react';
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import useChatStore from './chatStore';

export default function AppAiChat() {
    return (
        <div className='pl-2 pr-2'>
            <HeaderMenu title='AI Chat' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <SyncConversations />
            <CheckRelayAvailable />
        </div>
    )
}

function CheckRelayAvailable() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let relayAvailable = useChatStore(state=>state.relayAvailable);
    let setRelayAvailable = useChatStore(state=>state.setRelayAvailable);

    useEffect(()=>{
        if(!ready) return;
        if(!workers) throw new Error("Workers not initialized");
        if(relayAvailable === true) return;  // Check done
        
        workers.connection.pingRelay()
            .then(response=>{
                if(response.ok === true) {
                    setRelayAvailable(true);
                } else {
                    console.warn("Error on ping relay: %O", response.err);
                    setRelayAvailable(false);
                    // Check again later
                    setTimeout(()=>setRelayAvailable(null), 20_000);
                }
            })
            .catch(err=>{
                console.warn("Error on ping relay, consider it offline: ", err);
                setRelayAvailable(false);
                // Check again later
                setTimeout(()=>setRelayAvailable(null), 20_000);
            })
    }, [workers, ready, relayAvailable, setRelayAvailable]);

    return <></>;
}
