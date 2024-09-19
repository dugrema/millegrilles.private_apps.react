import { useEffect } from "react";
import { proxy } from 'comlink';

import { decryptConversationMessages, getConversation, openDB, saveConversation, saveConversationSync, saveMessagesSync, setConversationSyncDate } from "./aichatStoreIdb";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { ConversationSyncResponse } from "../workers/connection.worker";
import useChatStore from "./chatStore";

let promiseIdb: Promise<void> | null = null;

function SyncConversationMessages() {

    useEffect(()=>{
        if(!promiseIdb) {
            promiseIdb = init()
                .catch(err=>{
                    console.error("Error initializing Message IDB ", err);
                    throw err
                });
            return;
        }
    }, []);

    // Throw to prevent screen from rendering. Caught in <React.Suspense> (index.tsx).
    if(promiseIdb) throw promiseIdb;

    return (
        <>
            <ListenMessageChanges />
        </>
    );
}

export default SyncConversationMessages;

async function init() {
    // Initialize/upgrade the database
    await openDB(true);

    // Remove promise value, will allow screen to render
    promiseIdb = null;
}

function ListenMessageChanges() {

    let conversationId = useChatStore(state=>state.conversationId);
    let userId = useChatStore(state=>state.userId);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setLastConversationMessagesUpdate = useChatStore(state=>state.setLastConversationMessagesUpdate);

    let workers = useWorkers();

    useEffect(()=>{
        if(!workers || !ready || !conversationId) return;  // Note ready to sync

        // // Subscribe to changes on categories and groups
        // workers.connection.subscribeUserCategoryGroup(categoryGroupEventCb)
        //     .catch(err=>console.error("Error subscribing to category/group events", err));

        // Sync chat conversations with messages for the user. Save in IDB.
        syncMessages(workers, conversationId)
            .then(async () => {
                console.debug("Sync done");
                // Decrypt messages
                if(workers && conversationId && userId) {
                    await decryptConversationMessages(workers, userId, conversationId)
                } else {
                    console.error("Workers not initialized or conversationId null or userId null");
                }
                // Refresh screen
                setLastConversationMessagesUpdate(new Date().getTime());
            })
            .catch(err=>console.error("Error during conversation sync: ", err));

        // return () => {
        //     // Remove listener for document changes on group
        //     if(workers) {
        //         workers.connection.unsubscribeUserCategoryGroup(categoryGroupEventCb)
        //             .catch(err=>console.error("Error unsubscribing from category/group events", err));
        //     }
        // };

    }, [workers, ready, conversationId, userId, setLastConversationMessagesUpdate])

    return <></>;
}

async function syncMessages(workers: AppWorkers, conversationId: string) {

    await new Promise(async (resolve, reject)=>{
        let conversation = await getConversation(conversationId);
        let lastSync = conversation?.lastSync;

        const callback = proxy(async (response: ConversationSyncResponse) => {
            console.debug("Streaming event ", response);
    
            if(!response.ok) {
                console.error("Error response from conversation sync: ", response);
                return reject(response.err);
            }
    
            if(response.messages) {
                // Save received messages for conversation
                await saveMessagesSync(response.messages);
            }
    
            if(response.done) {
                // Save sync date in conversation
                await setConversationSyncDate(conversationId, response.sync_date);
                resolve(null);
            }
        });
    
        let initialStreamResponse = await workers.connection.syncConversationMessages(conversationId, callback, lastSync);
        if(!initialStreamResponse === true) {
            reject(new Error("Error getting documents for this group"));
        }

    })

    
}
