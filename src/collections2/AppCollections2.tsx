import { Outlet, useLocation } from "react-router-dom";

import HeaderMenu from "./Menu";
import Footer from "../Footer";
import useUserBrowsingStore from "./userBrowsingStore";
import { useEffect } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { openDB } from "./idb/collections2StoreIdb";
import { messageStruct } from "millegrilles.cryptography";
import { SyncDownloads, SyncUploads, TransferTickerUpdate } from "./Transfers";

function Collections2() {

    return (
        <div className='px-2'>
            
            {/* Visual components */}
            <HeaderMenu title='Collections' backLink={true} />
            <main id="main" className='pt-4 pb-2 pl-2 pr-6 w-full'>
                <Outlet />
            </main>
            <Footer />

            {/* Background operation components - no effect on screen. */}
            <InitializeUserStore />
            <FilehostManager />
            <TransferStoreSync />
            <SaveCurrentLocation />

        </div>
    );
}

export default Collections2;

export function InitializeUserStore() {
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
    let filehostAuthenticated = useConnectionStore(state=>state.filehostAuthenticated);
    let setFilehostAuthenticated = useConnectionStore(state=>state.setFilehostAuthenticated);
    let filehostId = useConnectionStore(state=>state.filehostId);
    let setFilehostId = useConnectionStore(state=>state.setFilehostId);
    let userId = useUserBrowsingStore(state=>state.userId);

    // Load pre-selected filehostId from localStorage
    useEffect(()=>{
        if(!userId) return;
        let filehostId = localStorage.getItem(`filehost_${userId}`) || 'LOCAL';
        if(filehostId) {
            // console.debug("Initializing with filehostId:%s", filehostId);
            setFilehostId(filehostId);
        } else {
            filehostId = 'LOCAL';  // Use truthy value to ensure it gets picked up by the connect to filehost useEffect().
        }
    }, [userId, setFilehostId]);

    // Trigger a reauthentication for a newly selected filehostId
    useEffect(()=>{
        console.debug("Changing filehost id to", filehostId);
        setFilehostAuthenticated(false);
    }, [filehostId, setFilehostAuthenticated]);

    // Connect to filehost. This resets on first successful connection to a longer check interval.
    useEffect(()=>{
        // console.debug("useEffect maintain filehostAuthenticated:%s, filehostId:%s", filehostAuthenticated, filehostId);
        if(!workers || !ready || !userId || !filehostId) return;

        let filehostIdInner = filehostId;
        if(filehostIdInner === 'LOCAL') filehostIdInner = '';  // Reset filehost placeholder value

        if(!filehostAuthenticated) {
            // Initial connection attempt
            maintainFilehosts(workers, filehostIdInner, setFilehostAuthenticated)
                .catch(err=>console.error("Error during filehost initialization", err));
        }

        // Retry every 15 seconds if not authenticated. Reauth every 10 minutes if ok.
        let intervalMillisecs = filehostAuthenticated?600_000:15_000;

        let interval = setInterval(()=>{
            if(!workers) throw new Error('workers not initialized');
            maintainFilehosts(workers, filehostIdInner, setFilehostAuthenticated)
                .catch(err=>console.error("Error during filehost maintenance", err));
        }, intervalMillisecs);

        return () => {
            clearInterval(interval);
        }
    }, [workers, ready, filehostAuthenticated, filehostId, setFilehostAuthenticated, userId]);

    return <></>;
}

async function maintainFilehosts(workers: AppWorkers, filehostId: string | null, setFilehostAuthenticated: (authenticated: boolean)=>void) {
    let filehostResponse = await workers.connection.getFilehosts();
    if(!filehostResponse.ok) throw new Error('Error loading filehosts: ' + filehostResponse.err);

    // console.debug("maintainFilehost with id:%s, list received: %O", filehostId, filehostResponse);

    let list = filehostResponse.list;
    try {
        if(list) {
            await workers.directory.setFilehostList(list);
            let localUrl = new URL(window.location.href);
            localUrl.pathname = ''
            localUrl.search = ''
            await workers.directory.selectFilehost(localUrl.href, filehostId);

            // Generate an authentication message
            let caPem = (await workers.connection.getMessageFactoryCertificate()).pemMillegrille;
            if(!caPem) throw new Error('CA certificate not available');
            let authMessage = await workers.connection.createRoutedMessage(
                messageStruct.MessageKind.Command, {}, {domaine: 'filehost', action: 'authenticate'});
            authMessage.millegrille = caPem;

            await workers.directory.authenticateFilehost(authMessage);

            setFilehostAuthenticated(true);

            // Transfer selected filehost to transfer workers
            let selectedFilehost = await workers.directory.getSelectedFilehost();
            console.debug("Selected filehost id: ", selectedFilehost?.filehost_id);
            workers.download.setFilehost(selectedFilehost);
            workers.upload.setFilehost(selectedFilehost);

        } else {
            console.warn("No filehost available on this system");
            setFilehostAuthenticated(false);
        }
    } catch(err) {
        setFilehostAuthenticated(false);
        throw err;
    }
}

/** Maintains the list of transfers. Contents is used in the transfer screen and for the transfer menu. */
function TransferStoreSync() {
    return (
        <>
            <SyncDownloads />
            <SyncUploads />
            <TransferTickerUpdate />
        </>
    )
}

function SaveCurrentLocation() {
    let location = useLocation();
    let userId = useUserBrowsingStore(state=>state.userId);
    useEffect(()=>{
        let pathname = location.pathname;
        let search = location.search;
        if(search) pathname += search;
        localStorage.setItem(`location_${userId}`, pathname);
    }, [location, userId]);
    return <></>;
}