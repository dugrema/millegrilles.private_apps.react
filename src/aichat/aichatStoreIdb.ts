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
};

export type ChatMessage = {
    user_id: string, 
    conversation_id: string, 
    message_id: string,
    decrypted: boolean, 
    query_encrypted?: encryption.EncryptedData,
    role?: string, 
    content?: string, 
    date?: number, 
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
            updated = {...updated, decrypted: false}
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
    let db = await openDB();
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    let updated = await conversationStore.get(conversationId) as Conversation;
    updated.lastSync = syncDate;
    await conversationStore.put(updated);
}

export async function saveConversation(messages: ChatMessage[], conversationKey: ConversationKey) {
    let db = await openDB();

    let firstMessage = messages[0];
    let conversation = {
        user_id: firstMessage.user_id, 
        conversation_id: firstMessage.conversation_id,
        conversation_date: firstMessage.date,
        decrypted: true,
        initial_query: firstMessage.content,
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
        store.put({...conversation, decrypted: true});
    }

}

// export async function getUserCategories(userId: string): Promise<Array<NotepadCategoryType>> {
//     let db = await openDB();
//     let store = db.transaction(STORE_CATEGORIES, 'readonly').store;
//     let index = store.index('userid');
//     let cursor = await index.openCursor(userId);

//     let categories = [];
//     while(cursor) {
//         const value = cursor.value as NotepadCategoryType;
//         categories.push(value);
//         cursor = await cursor.continue();
//     }
//     return categories;
// }

// export async function getUserGroupDocuments(userId: string, groupId: string, decryptedOnly?: boolean): Promise<Array<NotepadDocumentType>> {
//     let db = await openDB();
//     let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
//     let index = store.index('useridGroup');
//     let cursor = await index.openCursor([userId, groupId]);

//     let groupDocuments = [];
//     while(cursor) {
//         const value = cursor.value as NotepadDocumentType;
//         if(decryptedOnly) {
//             if(value.decrypted) groupDocuments.push(value);
//         } else {
//             groupDocuments.push(value);
//         }
//         cursor = await cursor.continue();
//     }

//     return groupDocuments;
// }

// export async function syncCategories(categories: Array<NotepadCategoryType>, opts?: {userId?: string}) {
//     if(!categories) return []

//     const db = await openDB();
//     const store = db.transaction(STORE_CATEGORIES, 'readwrite').store;

//     for await (const infoCategorie of categories) {
//         const { categorie_id } = infoCategorie;
//         const categorieDoc = await store.get(categorie_id);
//         if(categorieDoc) {
//             if(categorieDoc.version !== infoCategorie.version) {
//                 await store.put(infoCategorie);
//             }
//         } else {
//             const user_id = infoCategorie.user_id || opts?.userId;
//             if(!user_id) throw new Error("UserId manquant");
//             await store.put({...infoCategorie, user_id});
//         }
//     }
// }

// export async function getMissingKeys(userId: string): Promise<Array<string>> {
//     let db = await openDB();
//     let store = db.transaction(STORE_GROUPS, 'readonly').store;
//     let index = store.index('userid');
//     let cursor = await index.openCursor(userId);
    
//     let keyIds = [];
//     while(cursor) {
//         const value = cursor.value as NotepadGroupType;
//         if(value.decrypted !== true) {
//             let keyId = value.cle_id || value.ref_hachage_bytes;
//             if(keyId) {
//                 keyIds.push(keyId);
//             } else {
//                 console.warn("Missing cle_id/ref_hachage_bytes for group ", value.groupe_id);
//             }
//         }
//         cursor = await cursor.continue();
//     }

//     // Check each key against the main key repository.
//     let keys = await getDecryptedKeys(keyIds);
//     let missingKeysSet = new Set(keyIds);
//     for(let key of keys) {
//         missingKeysSet.delete(key.hachage_bytes);
//     }

//     return Array.from(missingKeysSet);
// }

// // Met dirty a true et dechiffre a false si mismatch derniere_modification
// export async function syncDocuments(docs: Array<NotepadDocumentType>, opts?: {groupId?: string, dateSync?: number, userId?: string, deleted?: Array<string>}) {
//     const db = await openDB();
//     const store = db.transaction(STORE_DOCUMENTS, 'readwrite').store;

//     if(docs) {
//         for await (const infoDoc of docs) {
//             const { doc_id, nonce } = infoDoc
//             const documentDoc = await store.get(doc_id);
//             if(documentDoc) {
//                 if(nonce !== documentDoc.nonce) {
//                     // Known file but different version.
//                     await store.put({...documentDoc, ...infoDoc, decrypted: false});
//                 }
//             } else {
//                 const user_id = infoDoc.user_id || opts?.userId;
//                 if(!user_id) throw new Error("Missing userId");
//                 await store.put({...infoDoc, user_id, decrypted: false});
//             }
//         }
//     }

//     let deletedDocuments = opts?.deleted;
//     if(deletedDocuments) {
//         for await (let docId of deletedDocuments) {
//             await store.delete(docId);
//         }
//     }

//     if(opts?.groupId && opts?.dateSync) {
//         // Save the last sync date
//         let store = db.transaction(STORE_GROUPS, 'readwrite').store;
//         let group = await store.get(opts.groupId);
//         await store.put({...group, dateSync: opts.dateSync});
//     }
// }

// /** Decrypts all encrypted groups using an already downloaded key. */
// export async function decryptGroups(workers: AppWorkers, userId: string) {
//     let db = await openDB();
//     let store = db.transaction(STORE_GROUPS, 'readonly').store;
//     let index = store.index('userid');
//     let cursor = await index.openCursor(userId);
//     let encryptedGroups = [];
//     while(cursor) {
//         const value = cursor.value as NotepadGroupType;
//         if(value.decrypted !== true) {
//             encryptedGroups.push(value.groupe_id);
//         }
//         cursor = await cursor.continue();
//     }

//     for await(let groupId of encryptedGroups) {
//         store = db.transaction(STORE_GROUPS, 'readonly').store;
//         let group = await store.get(groupId) as NotepadGroupType;
//         let { cle_id, ref_hachage_bytes, nonce, header, data_chiffre, format } = group;

//         // Handle legacy header and ref_hachage_bytes fields
//         let legacyMode = false;
//         if(!nonce && header) {
//             nonce = header.slice(1);  // Remove leading multibase 'm' marker
//         }
//         if(!cle_id && ref_hachage_bytes) {
//             cle_id = ref_hachage_bytes;
//             legacyMode = true;
//         }

//         if(!cle_id || !nonce) throw new Error("Error loading cle_id or nonce");
//         let key = (await getDecryptedKeys([cle_id])).pop();
//         if(key) {
//             let ciphertext = data_chiffre;
//             if(legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker
//             let cleartext = await workers.encryption.decryptMessage(format, key.cleSecrete, nonce, ciphertext);
//             let jsonInfo = JSON.parse(new TextDecoder().decode(cleartext)) as NotepadGroupData;
//             let storeRw = db.transaction(STORE_GROUPS, 'readwrite').store;
//             await storeRw.put({...group, data: jsonInfo, decrypted: true});
//         } else {
//             console.warn("Missing decryption key: ", cle_id);
//         }
//     }

// }

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

    console.debug("Encrypted messages for %s: %O, keyIds: %O", conversationId, encryptedMessageIds, keyIds);
    let keyIdsList = Array.from(keyIds);
    let keyList = await getDecryptedKeys(keyIdsList);
    let decryptionKeys = {} as {[key: string]: Uint8Array};
    for(let key of keyList) {
        decryptionKeys[key.hachage_bytes] = key.cleSecrete;
    }

    console.debug("Decryption keys", decryptionKeys);
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
                console.debug("Save decrypted message ", existing);
                await messageStoreRw.put(existing);
            }
        }
    }

}
