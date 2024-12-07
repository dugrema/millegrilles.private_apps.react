import { useCallback, useEffect, useMemo, useState } from "react";
import { proxy } from 'comlink';

import { Conversation, decryptConversations, deleteConversation, getMissingConversationKeys, openDB, saveConversationsKeys, saveConversationSync } from "./aichatStoreIdb";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { ConversationSyncResponse, DecryptionKeyResponse } from "../workers/connection.worker";
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
            <CheckRelayAvailable />
            <LoadModels />
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
    let setRelayAvailable = useChatStore(state=>state.setRelayAvailable);

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
        if(!workers || !userId) return null;
        return proxy((event: SubscriptionMessage)=>{
            receiveConversationEvent(workers, userId, event, setRelayAvailable, refreshConversationListHandler);
        })
    }, [workers, userId, setRelayAvailable, refreshConversationListHandler]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !chatConversationEventCb) return;  // Note ready to sync

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
            if(workers && chatConversationEventCb) {
                workers.connection.unsubscribeChatConversationEvents(chatConversationEventCb)
                    .catch(err=>console.error("Error unsubscribing from chat conversation events", err));
            }
        };
    }, [workers, ready, userId, refreshConversationListHandler, chatConversationEventCb])

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
                    await handleConversationKeyResponse(workers, keyResponse, userId);
                }

                // Decrypt conversation labels
                await decryptConversations(workers, userId);
                
                return resolve(null);
            }
        });

        try {
            let initialStreamResponse = await workers.connection.syncConversations(callback);
            if(!initialStreamResponse === true) {
                reject(new Error("Error getting documents for this group"));
            }
        } catch(err) {
            reject(err);
        }
    })
}

function LoadModels() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setModels = useChatStore(state=>state.setModels);

    useEffect(()=>{
        if(!ready || !workers) return;
        workers.connection.getModels()
            .then(response=>{
                // console.debug("Models response: ", response);
                if(response.ok !== true) throw new Error("Error receiving models: " + response.err);
                if(response.models) setModels(response.models);
            })
            .catch(err=>console.error("Error loading models", err));
    }, [ready, workers, setModels]);

    return <></>;
}

function CheckRelayAvailable() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let relayAvailable = useChatStore(state=>state.relayAvailable);
    let setRelayAvailable = useChatStore(state=>state.setRelayAvailable);

    useEffect(()=>{
        if(!ready) {
            setRelayAvailable(false);
            return;
        };
        if(!workers) throw new Error("Workers not initialized");
        if(relayAvailable === true) return;  // Check done
        
        workers.connection.pingRelay()
            .then(response=>{
                // console.debug("Ping response", response);
                let available = !!response.ok;
                setRelayAvailable(available);
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

type ConversationEvent = {
    conversation_id: string,
    conversation?: Conversation,
    event_type: string,
};

type OllamaRelaiStatus = {
    event_type: string,
    available?: boolean | null;
}

function receiveConversationEvent(
    workers: AppWorkers | null, userId: string,
    event: SubscriptionMessage, 
    setRelayAvailable: (available: boolean)=>void, refreshTrigger: ()=>void, 
) {
    let conversationEvent = event.message as ConversationEvent;

    let rks = event.routingKey.split('.');
    let domain = rks[1];
    let action = rks.pop();

    if(domain === 'ollama_relai') {
        if(action === 'status') {
            let message = event.message as OllamaRelaiStatus;
            let available = !!message.available;
            setRelayAvailable(available);
        } else {
            console.warn("Received unhandled event for domain ollama_relai ", event);
        }
    } else if(domain === 'AiLanguage') {
        let {conversation, conversation_id, event_type} = conversationEvent;
        if(event_type === 'new') {
            if(conversation) {
                saveConversationSync([conversation])
                    .then(async () => {
                        if(!workers) throw new Error("Workers not initialized");
                        if(!conversation) throw new Error("Conversation is null");

                        let { cle_id } = conversation;
                        if(!cle_id) throw new Error("Conversation has no cle_id");

                        // Recover key
                        let keyResponse = await workers.connection.getConversationKeys([cle_id]);
                        await handleConversationKeyResponse(workers, keyResponse, userId);

                        // Decrypt conversation
                        await decryptConversations(workers, userId);
                        
                        // Refresh screen
                        refreshTrigger()
                    })
                    .catch(err=>console.error("Error saving new conversation event %O: %O", event, err));
            }
        } else if(event_type === 'deleted') {
            deleteConversation(userId, conversation_id)
                .then(()=>refreshTrigger())
                .catch(err=>console.error("Error deleteing conversationId %s: %O", conversation_id, err));
        } else {
            console.warn("Received unhandled event for domain AiLanguage ", event);
        }
    } else {
        console.warn("Received unhandled event (domain) ", event);
    }
}

async function handleConversationKeyResponse(workers: AppWorkers, keyResponse: DecryptionKeyResponse, userId: string) {
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
