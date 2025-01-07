import { Outlet } from "react-router-dom";

import HeaderMenu from "./Menu";
import Footer from "../Footer";
import useUserBrowsingStore from "./userBrowsingStore";
import { useEffect } from "react";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { openDB } from "./idb/collections2StoreIdb";

function Collections2() {
    return (
        <div>
            <HeaderMenu title='Collections' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
            <InitializeStore />
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
