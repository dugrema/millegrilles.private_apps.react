import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { getDecryptedKeys } from '../MillegrillesIdb';
import { AppWorkers } from '../workers/workers';
import { encryption, keymaster } from 'millegrilles.cryptography';

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
    startDate: number, 
    decrypted: boolean, 
    conversationKey: ConversationKey,
    encrypted_data?: encryption.EncryptedData,
    lastSync?: null | number, 
    subject?: null | string,
    initial_query?: null | string,
};

export type ChatMessage = {
    user_id: string, 
    conversation_id: string, 
    message_id: string,
    decrypted: boolean, 
    encrypted_data?: encryption.EncryptedData,
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

        case 2: // Most recent
            break;
        default:
            console.warn("createObjectStores Default..., version %O", oldVersion)
    }
}

export async function saveConversation(messages: ChatMessage[], conversationKey: ConversationKey) {
    let db = await openDB();

    let firstMessage = messages[0];
    let conversation = {
        user_id: firstMessage.user_id, 
        conversation_id: firstMessage.conversation_id,
        startDate: firstMessage.date,
        decrypted: true,
        initial_query: firstMessage.content,
        conversationKey,
    } as Conversation;
    
    let conversationStore = db.transaction(STORE_CONVERSATIONS, 'readwrite').store;
    await conversationStore.put(conversation);

    await saveMessages(messages);
}

export async function saveMessages(messages: ChatMessage[]) {
    let db = await openDB();
    let messageStore = db.transaction(STORE_CONVERSATION_MESSAGES, 'readwrite').store;
    for await(let message of messages) {
        await messageStore.put(message);
    }
}

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

// export async function decryptGroupDocuments(workers: AppWorkers, userId: string, groupId: string) {
//     // Get the decryption key from IDB (must already be present)
//     let db = await openDB();
//     let groupStore = db.transaction(STORE_GROUPS, 'readonly').store;
//     let group = await groupStore.get(groupId) as NotepadGroupType;
//     if(!group) throw new Error("Unknown group");
//     let keyId = group.cle_id || group.ref_hachage_bytes;

//     if(!keyId) throw new Error("Error loading keyId");
//     let categoryStore = db.transaction(STORE_CATEGORIES, 'readonly').store;
//     let categoryId = group.categorie_id;
//     let category = await categoryStore.get(categoryId) as NotepadCategoryType;
//     if(!category) throw new Error("Unknown category");
//     let labelFieldName = category?.champs[0]?.code_interne;

//     // Load group decryption key
//     let key = (await getDecryptedKeys([keyId])).pop();
//     if(!key) throw new Error('Decryption key missing for group');

//     // Get list of encrypted documents
//     let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
//     let index = store.index('useridGroup');
//     let cursor = await index.openCursor([userId, groupId]);
//     let encryptedDocuments = [];
//     while(cursor) {
//         const value = cursor.value as NotepadDocumentType;
//         if(value.decrypted !== true) {
//             encryptedDocuments.push(value.doc_id);
//         }
//         cursor = await cursor.continue();
//     }

//     for await(let docId of encryptedDocuments) {
//         let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
//         let groupDocument = await store.get(docId) as NotepadDocumentType;
//         let { cle_id, nonce, header, data_chiffre, format } = groupDocument;

//         // Handle legacy header field
//         let legacyMode = false;
//         if(!nonce && header) {
//             nonce = header.slice(1);  // Remove leading multibase 'm' marker
//             legacyMode = true;
//         }
//         if(!cle_id) {
//             // Reuse the group keyId (not provided in old documents)
//             cle_id = keyId;
//         }

//         if(!nonce) throw new Error("Nonce/header missing from document");

//         if(key) {
//             let ciphertext = data_chiffre;
//             if(legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker

//             let cleartext = await workers.encryption.decryptMessage(format, key.cleSecrete, nonce, ciphertext);
//             let jsonInfo = JSON.parse(new TextDecoder().decode(cleartext)) as NotepadDocumentData;
            
//             // Filter jsonInfo to ensure only data fields get retained
//             let data = {} as NotepadDocumentData;
//             let fields = new Set(category.champs.map(item=>item.code_interne));
//             for(let key of Object.keys(jsonInfo)) {
//                 if(fields.has(key)) {
//                     data[key] = jsonInfo[key];
//                 }
//             }

//             // Extract label
//             let label = data[labelFieldName] || docId;
            
//             let storeRw = db.transaction(STORE_DOCUMENTS, 'readwrite').store;
//             await storeRw.put({...groupDocument, label, data, decrypted: true});
//         } else {
//             console.warn("Missing decryption key: ", cle_id);
//         }
//     }
// }
