import { Outlet } from "react-router-dom";

import HeaderMenu from "./Menu";
import Footer from "../Footer";
import useUserBrowsingStore from "./userBrowsingStore";
import { useEffect } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { openDB } from "./idb/collections2StoreIdb";
import { messageStruct } from "millegrilles.cryptography";

function Collections2() {
    return (
        <div>
            <HeaderMenu title='Collections' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
            <InitializeStore />
            <FilehostManager />
        </div>
    );
}

export default Collections2;

function InitializeStore() {
    let setUserId = useUserBrowsingStore(state=>state.setUserId);

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    useEffect(()=>{
        if(!workers || !ready) return;

        Promise.resolve().then(async ()=>{
            if(!workers) throw new Error("Workers not initialized");
            // Get userId from user certificate.
            let certificate = await workers.connection.getMessageFactoryCertificate();
            let userId = certificate.extensions?.userId;
            if(!userId) throw new Error("UserId missing from connection certificate");
            setUserId(userId);
        })
        .catch(err=>console.error("Error initializing store", err));
    }, [workers, ready, setUserId]);

    useEffect(()=>{
        openDB(true)
            .catch(err=>console.error("Error initializing collections2 IDB", err));
    })

    return <></>;
}

/**
 * Connects and maintains connections to filehosts.
 * @returns 
 */
function FilehostManager() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setFilehostAuthenticated = useConnectionStore(state=>state.setFilehostAuthenticated);

    useEffect(()=>{
        if(!workers || !ready) return;

        maintainFilehosts(workers, setFilehostAuthenticated)
            .catch(err=>console.error("Error during filehost initialization", err));

        let interval = setInterval(()=>{
            if(!workers) throw new Error('workers not initialized');
            maintainFilehosts(workers, setFilehostAuthenticated)
                .catch(err=>console.error("Error during filehost maintenance", err));
        }, 180_000);

        return () => {
            clearInterval(interval);
        }
    }, [workers, ready, setFilehostAuthenticated]);

    return <></>;
}

async function maintainFilehosts(workers: AppWorkers, setFilehostAuthenticated: (authenticated: boolean)=>void) {
    let filehostResponse = await workers.connection.getFilehosts();
    if(!filehostResponse.ok) throw new Error('Error loading filehosts: ' + filehostResponse.err);
    let list = filehostResponse.list;
    try {
        if(list) {
            await workers.directory.setFilehostList(list);
            let localUrl = new URL(window.location.href);
            localUrl.pathname = ''
            await workers.directory.selectFilehost(localUrl.href);

            // Generate an authentication message
            let caPem = (await workers.connection.getMessageFactoryCertificate()).pemMillegrille;
            if(!caPem) throw new Error('CA certificate not available');
            let authMessage = await workers.connection.createRoutedMessage(
                messageStruct.MessageKind.Command, {}, {domaine: 'filehost', action: 'authenticate'});
            authMessage.millegrille = caPem;

            await workers.directory.authenticateFilehost(authMessage);

            setFilehostAuthenticated(true);
        } else {
            console.warn("No filehost available on this system");
            setFilehostAuthenticated(false);
        }
    } catch(err) {
        setFilehostAuthenticated(false);
        throw err;
    }
}
