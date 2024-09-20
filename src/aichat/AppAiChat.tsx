import { Outlet } from 'react-router-dom';
import HeaderMenu from '../Menu';
import SyncConversations from './SyncConversations';
import { useEffect } from 'react';
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import useChatStore from './chatStore';
import Footer from '../Footer';

export default function AppAiChat() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setUserId = useChatStore(state=>state.setUserId);

    // Get the userId from the certificate
    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                let userId = certificate.extensions?.userId;
                setUserId(''+userId);
            })
            .catch(err=>console.error("Error loading userId", err));
    }, [ready, workers, setUserId]);

    return (
        <div>
            <HeaderMenu title='AI Chat' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
            <SyncConversations />
        </div>
    )
}
