import { useCallback, useEffect, useMemo, useState } from "react";
import { proxy } from 'comlink';

import { decryptConversations, getMissingConversationKeys, openDB, saveConversationsKeys, saveConversationSync } from "./aichatStoreIdb";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { ConversationSyncResponse } from "../workers/connection.worker";
import { multiencoding } from "millegrilles.cryptography";
import useChatStore from "./chatStore";
import { saveDecryptedKey } from "../MillegrillesIdb";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";

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
    let setLastConversationsUpdate = useChatStore(state=>state.setLastConversationsUpdate);

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

    let refreshConversationListHandler = useCallback(()=>{
        // Force a refresh of the conversation list (when applicable)
        setLastConversationsUpdate(new Date().getTime());
    }, [setLastConversationsUpdate]);

    let chatConversationEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            console.debug("Chat conversation event ", event);
        })
    }, []);

    useEffect(()=>{
        if(!workers || !ready || !userId) return;  // Note ready to sync

        // Subscribe to changes on categories and groups
        workers.connection.subscribeChatConversationEvents(chatConversationEventCb)
            .catch(err=>console.error("Error subscribing to chat conversation events", err));

        // Sync chat conversations with messages for the user. Save in IDB.
        syncConversations(workers, userId)
            .then(()=>{
                console.info("Sync conversations done");
                refreshConversationListHandler();
            })
            .catch(err=>console.error("Error during conversation sync: ", err));

        return () => {
            // Remove listener for document changes on group
            if(workers) {
                workers.connection.unsubscribeChatConversationEvents(chatConversationEventCb)
                    .catch(err=>console.error("Error unsubscribing from chat conversation events", err));
            }
        };
    }, [workers, ready, userId, refreshConversationListHandler])

    return <></>;
}

async function syncConversations(workers: AppWorkers, userId: string) {

    await new Promise(async (resolve, reject)=>{
        const callback = proxy(async (response: ConversationSyncResponse) => {
            if(!response.ok) {
                console.error("Error response from conversation sync: ", response);
                reject(response.err);
                return;
            }

            if(response.conversations) {
                // Save conversations to IDB
                await saveConversationSync(response.conversations);
            }

            if(response.done) {
                let missingKeys = await getMissingConversationKeys(userId);

                if(missingKeys.length > 0) {
                    // Try to load from server
                    let keyResponse = await workers.connection.getConversationKeys(missingKeys);
                    if(!keyResponse.ok) {
                        throw new Error("Error receiving conversation key: " + keyResponse.err);
                    }

                    let conversationKeys = keyResponse.cles.map(item=>{
                        if(!item.signature) throw new Error("Domaine signature missing");
                        return {
                            user_id: userId,
                            secret_key: multiencoding.decodeBase64Nopad(item.cle_secrete_base64),
                            conversationKey: {cle_id: item.cle_id, signature: item.signature},
                        };
                    });

                    // Save decrypted keys
                    for await (let key of conversationKeys) {
                        await saveDecryptedKey(key.conversationKey.cle_id, key.secret_key);
                    }

                    await saveConversationsKeys(workers, conversationKeys);
                }

                // Decrypt conversation labels
                await decryptConversations(workers, userId);
                
                return resolve(null);
            }
        });

        let initialStreamResponse = await workers.connection.syncConversations(callback);
        if(!initialStreamResponse === true) {
            reject(new Error("Error getting documents for this group"));
        }
    })
}
