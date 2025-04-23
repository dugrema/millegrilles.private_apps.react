import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { encryption, keymaster } from 'millegrilles.cryptography';
import { AppWorkers } from '../workers/workers';
import { getDecryptedKeys } from '../MillegrillesIdb';

const DB_NAME = 'aichat';
const STORE_CONVERSATIONS = 'conversations';
const STORE_CONVERSATION_MESSAGES = 'conversationMessages';
const DB_VERSION_CURRENT = 2;

export type ConversationKey = {
    signature: keymaster.DomainSignature, 
    cle_id: string,
};

export type Conversation = {
    user_id: string, 
    conversation_id: string, 
    conversation_date: number, 
    decrypted: boolean, 
    conversationKey: ConversationKey,
    encrypted_data?: encryption.EncryptedData,
    cle_id?: string,
    lastSync?: null | number, 
    subject?: null | string,
    initial_query?: null | string,
    label_encrypted?: null | encryption.EncryptedData,
    label_source?: null | string,
};

export type ChatMessage = {
    user_id: string, 
    conversation_id: string, 
    message_id: string,
    decrypted: boolean, 
    query_encrypted?: encryption.EncryptedData,
    query_role?: string, 
    content?: string, 
    message_date?: number, 
    model?: string,
};

export async function openDB(upgrade?: boolean): Promise<IDBPDatabase> {
    if(upgrade) {
        return openDbIdb(DB_NAME, DB_VERSION_CURRENT, {
            upgrade(db, oldVersion) {
                createObjectStores(db, oldVersion);
            },
            blocked() {
                console.error("OpenDB %s blocked", DB_NAME);
            },
            blocking() {
                console.warn("OpenDB, blocking");
            }
        });
    } else {
        return openDbIdb(DB_NAME);
    }
}

function createObjectStores(db: IDBPDatabase, oldVersion?: number) {
    let conversationStore = null, conversationMessageStore = null;
    switch(oldVersion) {
        // @ts-ignore Fallthrough
        case 0:
        // @ts-ignore Fallthrough
        case 1:
            // Create stores
            conversationStore = db.createObjectStore(STORE_CONVERSATIONS, {keyPath: 'conversation_id'});
            conversationMessageStore = db.createObjectStore(STORE_CONVERSATION_MESSAGES, {keyPath: 'message_id'});

            // Create indices
            conversationStore.createIndex('userid', 'user_id', {unique: false, multiEntry: false});
            conversationMessageStore.createIndex('useridConversation', ['user_id', 'conversation_id'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 2: // Most recent
            break;
        default:
            console.warn("createObjectStores Default..., version %O", oldVersion)
    }
}

export async function saveConversationSync(conversations: Conversation[]) {
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    for await(let conversation of conversations) {
        let updated = await conversationStore.get(conversation.conversation_id);
        if(!updated) {
            // New
            updated = {...updated, decrypted: !conversation.label_encrypted}
        }
        updated = {...updated, ...conversation};
        await conversationStore.put(updated);
    }
}

export async function saveMessagesSync(messages: ChatMessage[]) {
    let db = await openDB();
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;

    for await (let message of messages) {
        let updated = await messageStore.get(message.message_id);
        if(!updated) {
            updated = {decrypted: false};
        }
        await messageStore.put({...updated, ...message});
    }
}

export async function setConversationSyncDate(conversationId: string, syncDate: number) {
    if(!conversationId) throw new TypeError("conversationId is null");
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    let updated = await conversationStore.get(conversationId) as Conversation;
    if(updated) {
        updated.lastSync = syncDate;
        await conversationStore.put(updated);
    }
}

export async function saveConversation(messages: ChatMessage[], conversationKey: ConversationKey) {
    let db = await openDB();

    let firstMessage = messages[0];
    let conversation = {
        user_id: firstMessage.user_id, 
        conversation_id: firstMessage.conversation_id,
        conversation_date: firstMessage.message_date?firstMessage.message_date/1000:new Date().getTime(),
        decrypted: true,
        subject: firstMessage.content,
        conversationKey,
    } as Conversation;
    
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    await conversationStore.put(conversation);

    await saveMessagesSync(messages);
}

// export async function saveMessages(messages: ChatMessage[]) {
//     let db = await openDB();
//     let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;
//     for await(let message of messages) {
//         await messageStore.put(message);
//     }
// }

export async function getConversations(userId: string): Promise<Conversation[]> {
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readonly').store;
    let index = conversationStore.index('userid');
    let cursor = await index.openCursor(userId);

    let conversations = [];
    while(cursor) {
        const value = cursor.value as Conversation;
        conversations.push(value);
        cursor = await cursor.continue();
    }
    return conversations;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readonly').store;
    return await conversationStore.get(conversationId);
}

export async function getConversationMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
    let db = await openDB();
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readonly').store;
    let index = messageStore.index('useridConversation');
    let cursor = await index.openCursor([userId, conversationId]);

    let messages = [];
    while(cursor) {
        const value = cursor.value as ChatMessage;
        messages.push(value);
        cursor = await cursor.continue();
    }
    return messages;
}

export async function getConversationMessagesById(messageIds: string[]): Promise<ChatMessage[]> {
    let db = await openDB();
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readonly').store;
    let messages = [];
    for await (let messageId of messageIds) {
        let message = await messageStore.get(messageId);
        if(message) messages.push(message);
    }
    return messages;
}

export async function deleteConversation(userId: string, conversationId: string) {
    let db = await openDB();

    // Delete messages of this conversation
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;
    let index = messageStore.index('useridConversation');
    let cursor = await index.openCursor([userId, conversationId]);
    while(cursor) {
        await cursor.delete();        
        cursor = await cursor.continue();
    }

    // Delete conversation
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    await conversationStore.delete(conversationId);
}

export async function getMissingConversationKeys(userId: string): Promise<Array<string>> {
    let db = await openDB();
    let store = db.transaction(STORE_CONVERSATIONS, 'readonly').store;
    let index = store.index('userid');
    let cursor = await index.openCursor(userId);
    
    let keyIds = [];
    while(cursor) {
        const value = cursor.value as Conversation;
        if(!value.conversationKey || value.decrypted !== true) {
            let keyId = value.cle_id;
            if(keyId) {
                keyIds.push(keyId);
            } else {
                console.warn("Missing cle_id/ref_hachage_bytes for group ", value.conversation_id);
            }
        }
        cursor = await cursor.continue();
    }

    // Check each key against the main key repository.
    // let keys = await getDecryptedKeys(keyIds);
    // let missingKeysSet = new Set(keyIds);
    // for(let key of keys) {
    //     missingKeysSet.delete(key.hachage_bytes);
    // }

    return keyIds;
}

export async function saveConversationsKeys(
    workers: AppWorkers, 
    keys: Array<{user_id: string, secret_key: Uint8Array, conversationKey: ConversationKey}>,
) {
    let db = await openDB();
    let store = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;

    for await (let key of keys) {
        let conversation = await store.get(key.conversationKey.cle_id);  // Note: cle_id is also the conversationId
        conversation.conversationKey = key.conversationKey;
        store.put({...conversation});
    }

}

export async function decryptConversations(workers: AppWorkers, userId: string) {
    // Get the decryption key from IDB (must already be present)
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readonly').store;
    let index = conversationStore.index('userid');
    let cursor = await index.openCursor(userId);
    let encryptedConversationIds = [];
    let keyIds: Set<string> = new Set();
    while(cursor) {
        const value = cursor.value as Conversation;
        if(value.decrypted !== true) {
            encryptedConversationIds.push(value.conversation_id);
            if(value.label_encrypted?.cle_id) {
                keyIds.add(value.label_encrypted.cle_id);
            }
        }
        cursor = await cursor.continue();
    }

    let keyIdsList = Array.from(keyIds);
    let keyList = await getDecryptedKeys(keyIdsList);
    let decryptionKeys = {} as {[key: string]: Uint8Array};
    for(let key of keyList) {
        decryptionKeys[key.hachage_bytes] = key.cleSecrete;
    }

    for await (let conversationId of encryptedConversationIds) {
        let conversationStoreRw = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
        let existing = await conversationStoreRw.get(conversationId) as Conversation;
        let encryptedLabel = existing.label_encrypted;
        if(encryptedLabel) {
            let {cle_id, nonce} = encryptedLabel;
            if(cle_id && nonce) {
                let key = decryptionKeys[cle_id];
                if(key) {
                    try {
                        let cleartext = await workers.encryption.decryptMessage(
                            encryptedLabel.format, key, nonce, encryptedLabel.ciphertext_base64, encryptedLabel.compression);
                        existing.subject = new TextDecoder().decode(cleartext);
                        existing.decrypted = true;
                        conversationStoreRw = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
                        await conversationStoreRw.put(existing);
                    } catch (err) {
                        console.error("Error decrypting conversation label for conversationId %s: %O ", conversationId, err);
                    }
                } else {
                    console.warn("Missing keyId %s for conversation %s", cle_id, conversationId);
                }
            }
        }
    }
}

export async function decryptConversationMessages(workers: AppWorkers, userId: string, conversationId: string) {
    // Get the decryption key from IDB (must already be present)
    let db = await openDB();
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readonly').store;
    let index = messageStore.index('useridConversation');
    let cursor = await index.openCursor([userId, conversationId]);
    let encryptedMessageIds = [];
    let keyIds: Set<string> = new Set();
    while(cursor) {
        const value = cursor.value as ChatMessage;
        if(value.decrypted !== true) {
            encryptedMessageIds.push(value.message_id);
            if(value.query_encrypted?.cle_id) {
                keyIds.add(value.query_encrypted.cle_id);
            }
        }
        cursor = await cursor.continue();
    }

    let keyIdsList = Array.from(keyIds);
    let keyList = await getDecryptedKeys(keyIdsList);
    let decryptionKeys = {} as {[key: string]: Uint8Array};
    for(let key of keyList) {
        decryptionKeys[key.hachage_bytes] = key.cleSecrete;
    }

    let messageStoreRw = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;
    for await (let messageId of encryptedMessageIds) {
        let existing = await messageStoreRw.get(messageId) as ChatMessage;
        let encryptedQuery = existing.query_encrypted;
        if(encryptedQuery) {
            let {cle_id, nonce} = encryptedQuery;
            if(cle_id && nonce) {
                let key = decryptionKeys[cle_id];
                let cleartext = await workers.encryption.decryptMessage(
                    encryptedQuery.format, key, nonce, encryptedQuery.ciphertext_base64, encryptedQuery.compression);
                existing.content = new TextDecoder().decode(cleartext);
                existing.decrypted = true;
                messageStoreRw = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;
                await messageStoreRw.put(existing);
            }
        }
    }
}
