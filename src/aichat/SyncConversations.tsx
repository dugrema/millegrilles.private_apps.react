import { useEffect, useMemo, useState } from "react";
import { openDB } from "./aichatStoreIdb";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";

let promiseIdb: Promise<void> | null = null;

function SyncConversations() {
    useEffect(()=>{
        if(!promiseIdb) {
            promiseIdb = init()
                .catch(err=>{
                    console.error("Error initializing Notepad IDB ", err);
                    throw err
                });
            return;
        }
    }, []);

    // Throw to prevent screen from rendering. Caught in <React.Suspense> (index.tsx).
    if(promiseIdb) throw promiseIdb;

    return (
        <>
            <ListenConversationChanges />
        </>
    );
}

export default SyncConversations;

async function init() {
    // Initialize/upgrade the database
    await openDB(true);

    // Remove promise value, will allow screen to render
    promiseIdb = null;
}

function ListenConversationChanges() {

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let workers = useWorkers();

    let [userId, setUserId] = useState('');

    useEffect(()=>{
        if(!workers || !ready) return;

        // Get userId from user certificate.
        workers.connection.getMessageFactoryCertificate()
            .then(async certificate => {
                let userId = certificate.extensions?.userId;
                if(!userId) throw new Error("UserId missing from connection certificate");
                setUserId(userId);
            })
            .catch(err=>console.error("Error loading userId", err));

        // Cleanup
        return () => setUserId('');
    }, [workers, ready, setUserId]);

    let categoryGroupEventCb = useMemo(()=>{
        // return proxy((event: SubscriptionMessage)=>{
        //     let message = event.message as MessageUpdateCategoryGroup;
        //     if(message) {
                
        //     }
        // })
    }, [workers, userId]);

    useEffect(()=>{
        if(!workers || !ready) return;  // Note ready to sync

        // // Subscribe to changes on categories and groups
        // workers.connection.subscribeUserCategoryGroup(categoryGroupEventCb)
        //     .catch(err=>console.error("Error subscribing to category/group events", err));

        // // Sync categories and groups for the user. Save in IDB.
        // syncCategoriesGroups(workers, setCategories, setGroups)
        //     .then(()=>{
        //         setSyncDone();
        //     })
        //     .catch(err=>console.error("Error during notepad sync", err));

        // return () => {
        //     // Remove listener for document changes on group
        //     if(workers) {
        //         workers.connection.unsubscribeUserCategoryGroup(categoryGroupEventCb)
        //             .catch(err=>console.error("Error unsubscribing from category/group events", err));
        //     }
        // };

    }, [workers, ready])

    return <></>;
}
