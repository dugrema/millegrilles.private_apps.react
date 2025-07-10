import { Outlet } from 'react-router-dom';
import HeaderMenu from '../Menu';
import SyncConversations from './SyncConversations';
import { useEffect } from 'react';
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import useChatStore from './chatStore';
import Footer from '../Footer';

export default function AppAiChat() {

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);
    const setUserId = useChatStore(state=>state.setUserId);
    const setIsAdmin = useChatStore(state=>state.setIsAdmin);

    // Get the userId from the certificate
    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                const userId = certificate.extensions?.userId;
                setUserId(''+userId);

                const delegations = certificate.extensions?.adminGrants || [];
                const isAdmin = delegations.includes("proprietaire")
                setIsAdmin(isAdmin);
            })
            .catch(err=>console.error("Error loading userId", err));
    }, [ready, workers, setUserId, setIsAdmin]);

    return (
        <div>
            <HeaderMenu title='AI Chat' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto w-full'>
                <Outlet />
            </main>
            <Footer />
            <SyncConversations />
        </div>
    )
}
