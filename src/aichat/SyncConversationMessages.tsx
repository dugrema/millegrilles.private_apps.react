import { useEffect, useMemo } from "react";
import { proxy } from 'comlink';

import { ChatMessage, decryptConversationMessages, getConversation, getConversationMessagesById, openDB, saveMessagesSync, setConversationSyncDate } from "./aichatStoreIdb";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { ConversationSyncResponse } from "../workers/connection.worker";
import useChatStore from "./chatStore";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";
import { encryption } from "millegrilles.cryptography";
import { getDecryptedKeys } from "../MillegrillesIdb";

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

    let chatMessageEventCb = useMemo(()=>{
        if(!userId) return null;
        return proxy((event: SubscriptionMessage)=>{
            if(!workers) throw new Error("Workers not initialized");
            if(!userId) throw new Error("userId is null");
            const trigger = ()=>{setLastConversationMessagesUpdate(new Date().getTime());}
            handleChatExchangeEvent(workers, userId, event, trigger);
        })
    }, [workers, userId, setLastConversationMessagesUpdate]);

    useEffect(()=>{
        if(!workers || !ready || !conversationId || !chatMessageEventCb) return;  // Note ready to sync

        // Subscribe to changes on categories and groups
        workers.connection.subscribeChatMessageEvents(conversationId, chatMessageEventCb)
            .catch(err=>console.error("Error subscribing to chat message events", err));

        // Sync chat conversations with messages for the user. Save in IDB.
        syncMessages(workers, conversationId)
            .then(async () => {
                console.info("Sync messages done");
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

        return () => {
            // Remove listener for document changes on group
            if(workers && conversationId && chatMessageEventCb) {
                workers.connection.unsubscribeChatMessageEvents(conversationId, chatMessageEventCb)
                    .catch(err=>console.error("Error unsubscribing from chat message events", err));
            }
        };

    }, [workers, ready, conversationId, userId, setLastConversationMessagesUpdate, chatMessageEventCb])

    return <></>;
}

async function syncMessages(workers: AppWorkers, conversationId: string) {

    await new Promise(async (resolve, reject)=>{
        let conversation = await getConversation(conversationId);
        let lastSync = conversation?.lastSync;

        const callback = proxy(async (response: ConversationSyncResponse) => {
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

type ChatExchangeEvent = {
    cle_id: string,
    user_id: string,
    conversation_id: string,
    model: string,
    new?: boolean,
    query_date: number,
    query_encrypted: encryption.EncryptedData,
    query_message_id: string,
    query_role: string,
    reply_date: number,
    reply_encrypted: encryption.EncryptedData,
    reply_message_id: string,
    reply_role: string,
};

async function handleChatExchangeEvent(workers: AppWorkers, userId: string, event: SubscriptionMessage, updateTrigger: ()=>void) {
    let exchangeMessage = event.message as ChatExchangeEvent;

    // Check is messages already exist
    let conversationId = exchangeMessage.conversation_id;
    let userQueryMessageId = exchangeMessage.query_message_id;
    let assistantReplyMessageId = exchangeMessage.reply_message_id;
    let existingMessages = await getConversationMessagesById([userQueryMessageId, assistantReplyMessageId]);
    let existingIds = new Set(existingMessages.map(item=>item.message_id));

    if(existingIds.has(userQueryMessageId) && existingIds.has(assistantReplyMessageId)) {
        // Both messages already exist in IDB, nothing to do.
        return;
    }

    let keyId = exchangeMessage.cle_id;

    let decryptionKey = (await getDecryptedKeys([keyId])).pop();
    if(!decryptionKey && !exchangeMessage.new) {
        throw new Error(`Unknown decryptionKey ${keyId} for conversation ${conversationId}`);
    }

    let query_encrypted = exchangeMessage.query_encrypted;
    let reply_encrypted = exchangeMessage.reply_encrypted;

    // Save message exchange
    let user_query: ChatMessage = {
        user_id: userId, 
        conversation_id: conversationId, 
        message_id: exchangeMessage.query_message_id,
        decrypted: false, 
        query_encrypted,
        query_role: exchangeMessage.query_role,
        message_date: exchangeMessage.query_date, 
    };

    let assistant_reply: ChatMessage = {
        user_id: userId, 
        conversation_id: conversationId, 
        message_id: exchangeMessage.reply_message_id,
        decrypted: false, 
        query_encrypted: reply_encrypted,
        query_role: exchangeMessage.reply_role, 
        message_date: exchangeMessage.reply_date, 
    };

    if(decryptionKey) {
        // Decrypt message
        if(query_encrypted.nonce) {
            let contentBytes = await workers.encryption.decryptMessage(
                query_encrypted.format, decryptionKey.cleSecrete, query_encrypted.nonce, 
                query_encrypted.ciphertext_base64, query_encrypted.compression);
            user_query.content = new TextDecoder().decode(contentBytes);
            user_query.decrypted = true;
            // delete user_query.query_encrypted;
        }
        if(reply_encrypted.nonce) {
            let contentBytes = await workers.encryption.decryptMessage(
                reply_encrypted.format, decryptionKey.cleSecrete, reply_encrypted.nonce, 
                reply_encrypted.ciphertext_base64, reply_encrypted.compression);
            assistant_reply.content = new TextDecoder().decode(contentBytes);
            assistant_reply.decrypted = true;
            // delete assistant_reply.query_encrypted;
        }
    }

    if(!existingIds.has(userQueryMessageId)) {
        await saveMessagesSync([user_query]);
    }
    if(!existingIds.has(assistantReplyMessageId)) {
        await saveMessagesSync([assistant_reply]);
    }

    if(decryptionKey && (!existingIds.has(userQueryMessageId) || !existingIds.has(assistantReplyMessageId))) {
        // Update screen
        updateTrigger();
    }
}
