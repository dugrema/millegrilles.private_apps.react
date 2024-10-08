import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { getDecryptedKeys, saveDecryptedKey } from '../../MillegrillesIdb';
import { AppWorkers } from '../../workers/workers';

const DB_NAME = 'notepad';
const STORE_CATEGORIES = 'categories';
const STORE_GROUPS = 'groups';
const STORE_DOCUMENTS = 'documents';
const DB_VERSION_CURRENT = 2;

export type NotepadCategoryFieldType = {
    nom_champ: string,
    code_interne: string,
    type_champ: string,
    taille_maximum: number,
    requis?: boolean,
}

export type NotepadNewCategoryType = {
    categorie_id?: string,
    version: number,
    nom_categorie: string,
    champs: Array<NotepadCategoryFieldType>,
};

export type NotepadCategoryType = {
    categorie_id: string,
    version: number,
    user_id: string,
    nom_categorie: string,
    champs: Array<NotepadCategoryFieldType>,
};

export type NotepadGroupData = {nom_groupe: string, securite_groupe: string};

export type NotepadNewGroupType = {
    groupe_id?: string | null,
    user_id: string,
    categorie_id: string,
    cle_id: string,
    format: string,
    nonce: string,
    data_chiffre: string,
};

export type NotepadGroupType = {
    user_id: string,
    categorie_id: string,
    groupe_id: string,
    cle_id?: string,
    ref_hachage_bytes?: string,
    format: string,
    nonce?: string,
    header?: string,
    data_chiffre: string,
    data?: NotepadGroupData,
    decrypted?: boolean,
    dateSync?: number,
}

export type NotepadDocumentData = {[nom: string]: string | number | null};

export type NotepadNewDocumentType = {
    groupe_id: string,
    categorie_version?: number,
    cle_id?: string,
    format?: string,
    nonce?: string,
    data_chiffre?: string,
    doc_id?: string | null,
}

export type NotepadDocumentType = {
    user_id: string,
    groupe_id: string,
    categorie_version: number,
    doc_id: string,
    cle_id?: string,
    format: string,
    nonce?: string,
    header?: string,
    compression?: string,
    data_chiffre: string,
    supprime?: boolean,
    label?: string,
    data?: NotepadDocumentData,
    decrypted?: boolean,
};

export async function openDB(upgrade?: boolean): Promise<IDBPDatabase> {
    if(upgrade) {
        return openDbIdb(DB_NAME, DB_VERSION_CURRENT, {
            upgrade(db, oldVersion) {
                createObjectStores(db, oldVersion)
            },
            blocked() {
                console.error("OpenDB %s blocked", DB_NAME)
            },
            blocking() {
                console.warn("OpenDB, blocking")
            }
        });
    } else {
        return openDbIdb(DB_NAME)
    }
}

function createObjectStores(db: IDBPDatabase, oldVersion?: number) {
    let documentStore = null, groupStore = null, categoryStore = null;
    switch(oldVersion) {
        // @ts-ignore Fallthrough
        case 0:
        // @ts-ignore Fallthrough
        case 1:
            // Create stores
            categoryStore = db.createObjectStore(STORE_CATEGORIES, {keyPath: 'categorie_id'});
            groupStore = db.createObjectStore(STORE_GROUPS, {keyPath: 'groupe_id'});
            documentStore = db.createObjectStore(STORE_DOCUMENTS, {keyPath: 'doc_id'});

            // Create indices
            categoryStore.createIndex('userid', 'user_id', {unique: false, multiEntry: false});
            groupStore.createIndex('userid', 'user_id', {unique: false, multiEntry: false});
            documentStore.createIndex('userid', 'user_id', {unique: false, multiEntry: false});
            documentStore.createIndex('useridGroup', ['user_id', 'groupe_id'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 2: // Most recent
            break;
        default:
            console.warn("createObjectStores Default..., version %O", oldVersion)
    }
}

export async function getUserCategories(userId: string): Promise<Array<NotepadCategoryType>> {
    let db = await openDB();
    let store = db.transaction(STORE_CATEGORIES, 'readonly').store;
    let index = store.index('userid');
    let cursor = await index.openCursor(userId);

    let categories = [];
    while(cursor) {
        const value = cursor.value as NotepadCategoryType;
        categories.push(value);
        cursor = await cursor.continue();
    }
    return categories;
}

export async function getUserGroup(groupId: string): Promise<NotepadGroupType | null> {
    let db = await openDB();
    let store = db.transaction(STORE_GROUPS, 'readonly').store;
    return await store.get(groupId);
}

export async function getUserGroups(userId: string, decryptedOnly?: boolean): Promise<Array<NotepadGroupType>> {
    let db = await openDB();
    let store = db.transaction(STORE_GROUPS, 'readonly').store;
    let index = store.index('userid');
    let cursor = await index.openCursor(userId);

    let groups = [];
    while(cursor) {
        const value = cursor.value as NotepadGroupType;
        if(decryptedOnly) {
            if(value.decrypted) groups.push(value);
        } else {
            groups.push(value);
        }
        cursor = await cursor.continue();
    }

    return groups;
}

export async function deleteGroup(groupId: string) {
    let db = await openDB();
    let store = db.transaction(STORE_GROUPS, 'readwrite').store;
    await store.delete(groupId);
}

export async function getUserGroupDocuments(userId: string, groupId: string, decryptedOnly?: boolean): Promise<Array<NotepadDocumentType>> {
    let db = await openDB();
    let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
    let index = store.index('useridGroup');
    let cursor = await index.openCursor([userId, groupId]);

    let groupDocuments = [];
    while(cursor) {
        const value = cursor.value as NotepadDocumentType;
        if(decryptedOnly) {
            if(value.decrypted) groupDocuments.push(value);
        } else {
            groupDocuments.push(value);
        }
        cursor = await cursor.continue();
    }

    return groupDocuments;
}

export async function getGroupDocument(docId: string): Promise<NotepadDocumentType | null> {
    let db = await openDB();
    let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
    return await store.get(docId);
}

export async function deleteGroupDocument(docId: string) {
    let db = await openDB();
    let store = db.transaction(STORE_DOCUMENTS, 'readwrite').store;
    await store.delete(docId);
}

// export async function getCategory(categoryId: string): Promise<NotepadCategoryType | null>{
//     let db = await openDB();
//     let store = db.transaction(STORE_CATEGORIES, 'readonly').store;
//     return store.get(categoryId);
// }

// export async function getGroup(groupId: string): Promise<NotepadGroupType | null> {
//     let db = await openDB();
//     let store = db.transaction(STORE_GROUPS, 'readonly').store;
//     return store.get(groupId);
// }

export async function syncCategories(categories: Array<NotepadCategoryType>, opts?: {userId?: string}) {
    if(!categories) return []

    const db = await openDB();
    const store = db.transaction(STORE_CATEGORIES, 'readwrite').store;

    for await (const infoCategorie of categories) {
        const { categorie_id } = infoCategorie;
        const categorieDoc = await store.get(categorie_id);
        if(categorieDoc) {
            if(categorieDoc.version !== infoCategorie.version) {
                await store.put(infoCategorie);
            }
        } else {
            const user_id = infoCategorie.user_id || opts?.userId;
            if(!user_id) throw new Error("UserId manquant");
            await store.put({...infoCategorie, user_id});
        }
    }
}

export async function syncGroups(groupes: Array<NotepadGroupType>, opts?: {userId?: string, supprimes?: Array<string>}) {
    if(!groupes) return [];

    const db = await openDB();
    const store = db.transaction(STORE_GROUPS, 'readwrite').store;

    for await (const infoGroupe of groupes) {
        const { groupe_id } = infoGroupe;
        const groupeDoc = await store.get(groupe_id);
        if(groupeDoc) {
            if(groupeDoc.nonce !== infoGroupe.nonce) {
                await store.put({...groupeDoc, ...infoGroupe, decrypted: false});
            }
        } else {
            const user_id = infoGroupe.user_id || opts?.userId;
            if(!user_id) throw new Error("UserId manquant");
            await store.put({...infoGroupe, user_id, decrypted: false});
        }
    }
    if(opts?.supprimes) {
        for await (let groupId of opts.supprimes) {
            await store.delete(groupId);
        }
    }
}

export async function getMissingKeys(userId: string): Promise<Array<string>> {
    let db = await openDB();
    let store = db.transaction(STORE_GROUPS, 'readonly').store;
    let index = store.index('userid');
    let cursor = await index.openCursor(userId);
    
    let keyIds = [];
    while(cursor) {
        const value = cursor.value as NotepadGroupType;
        if(value.decrypted !== true) {
            let keyId = value.cle_id || value.ref_hachage_bytes;
            if(keyId) {
                keyIds.push(keyId);
            } else {
                console.warn("Missing cle_id/ref_hachage_bytes for group ", value.groupe_id);
            }
        }
        cursor = await cursor.continue();
    }

    // Check each key against the main key repository.
    let keys = await getDecryptedKeys(keyIds);
    let missingKeysSet = new Set(keyIds);
    for(let key of keys) {
        missingKeysSet.delete(key.hachage_bytes);
    }

    return Array.from(missingKeysSet);
}

// Met dirty a true et dechiffre a false si mismatch derniere_modification
export async function syncDocuments(docs: Array<NotepadDocumentType>, opts?: {groupId?: string, dateSync?: number, userId?: string, deleted?: Array<string>}) {
    const db = await openDB();
    const store = db.transaction(STORE_DOCUMENTS, 'readwrite').store;

    if(docs) {
        for await (const infoDoc of docs) {
            const { doc_id, nonce } = infoDoc
            const documentDoc = await store.get(doc_id);
            if(documentDoc) {
                if(nonce !== documentDoc.nonce) {
                    // Known file but different version.
                    await store.put({...documentDoc, ...infoDoc, decrypted: false});
                }
            } else {
                const user_id = infoDoc.user_id || opts?.userId;
                if(!user_id) throw new Error("Missing userId");
                await store.put({...infoDoc, user_id, decrypted: false});
            }
        }
    }

    let deletedDocuments = opts?.deleted;
    if(deletedDocuments) {
        for await (let docId of deletedDocuments) {
            await store.delete(docId);
        }
    }

    if(opts?.groupId && opts?.dateSync) {
        // Save the last sync date
        let store = db.transaction(STORE_GROUPS, 'readwrite').store;
        let group = await store.get(opts.groupId);
        await store.put({...group, dateSync: opts.dateSync});
    }
}

/** Decrypts all encrypted groups using an already downloaded key. */
export async function decryptGroups(workers: AppWorkers, userId: string) {
    let db = await openDB();
    let store = db.transaction(STORE_GROUPS, 'readonly').store;
    let index = store.index('userid');
    let cursor = await index.openCursor(userId);
    let encryptedGroups = [];
    while(cursor) {
        const value = cursor.value as NotepadGroupType;
        if(value.decrypted !== true) {
            encryptedGroups.push(value.groupe_id);
        }
        cursor = await cursor.continue();
    }

    for await(let groupId of encryptedGroups) {
        store = db.transaction(STORE_GROUPS, 'readonly').store;
        let group = await store.get(groupId) as NotepadGroupType;
        let { cle_id, ref_hachage_bytes, nonce, header, data_chiffre, format } = group;

        // Handle legacy header and ref_hachage_bytes fields
        let legacyMode = false;
        if(!nonce && header) {
            nonce = header.slice(1);  // Remove leading multibase 'm' marker
        }
        if(!cle_id && ref_hachage_bytes) {
            cle_id = ref_hachage_bytes;
            legacyMode = true;
        }

        if(!cle_id || !nonce) throw new Error("Error loading cle_id or nonce");
        let key = (await getDecryptedKeys([cle_id])).pop();
        if(key) {
            let ciphertext = data_chiffre;
            if(legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker
            let cleartext = await workers.encryption.decryptMessage(format, key.cleSecrete, nonce, ciphertext);
            let jsonInfo = JSON.parse(new TextDecoder().decode(cleartext)) as NotepadGroupData;
            let storeRw = db.transaction(STORE_GROUPS, 'readwrite').store;
            await storeRw.put({...group, data: jsonInfo, decrypted: true});
        } else {
            console.warn("Missing decryption key: ", cle_id);
        }
    }

}

export async function decryptGroupDocuments(workers: AppWorkers, userId: string, groupId: string) {
    // Get the decryption key from IDB (must already be present)
    let db = await openDB();
    let groupStore = db.transaction(STORE_GROUPS, 'readonly').store;
    let group = await groupStore.get(groupId) as NotepadGroupType;
    if(!group) throw new Error("Unknown group");
    let keyId = group.cle_id || group.ref_hachage_bytes;

    if(!keyId) throw new Error("Error loading keyId");
    let categoryStore = db.transaction(STORE_CATEGORIES, 'readonly').store;
    let categoryId = group.categorie_id;
    let category = await categoryStore.get(categoryId) as NotepadCategoryType;
    if(!category) throw new Error("Unknown category");
    let labelFieldName = category?.champs[0]?.code_interne;

    // Load group decryption key
    let key = (await getDecryptedKeys([keyId])).pop();
    if(!key) {
        // Get missing group decryption keys
        let keyResponse = await workers.connection.getGroupKeys([keyId]);
        if(keyResponse.ok !== false) {
            for await (let key of keyResponse.cles) {
                await saveDecryptedKey(key.cle_id, key.cle_secrete_base64);
            }
        } else {
            throw new Error('Error recovering group decryption keys: ' + keyResponse.err);
        }
    }

    // Get list of encrypted documents
    let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
    let index = store.index('useridGroup');
    let cursor = await index.openCursor([userId, groupId]);
    let encryptedDocuments = [];
    while(cursor) {
        const value = cursor.value as NotepadDocumentType;
        if(value.decrypted !== true) {
            encryptedDocuments.push(value.doc_id);
        }
        cursor = await cursor.continue();
    }

    for await(let docId of encryptedDocuments) {
        let store = db.transaction(STORE_DOCUMENTS, 'readonly').store;
        let groupDocument = await store.get(docId) as NotepadDocumentType;
        let { cle_id, nonce, header, data_chiffre, format, compression } = groupDocument;

        // Handle legacy header field
        let legacyMode = false;
        if(!nonce && header) {
            nonce = header.slice(1);  // Remove leading multibase 'm' marker
            legacyMode = true;
        }
        if(!cle_id) {
            // Reuse the group keyId (not provided in old documents)
            cle_id = keyId;
        }

        if(!nonce) throw new Error("Nonce/header missing from document");

        if(key) {
            let ciphertext = data_chiffre;
            if(legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker

            try {
                let cleartext = await workers.encryption.decryptMessage(format, key.cleSecrete, nonce, ciphertext, compression);
                let jsonInfo = JSON.parse(new TextDecoder().decode(cleartext)) as NotepadDocumentData;
                
                // Filter jsonInfo to ensure only data fields get retained
                let data = {} as NotepadDocumentData;
                let fields = new Set(category.champs.map(item=>item.code_interne));
                for(let key of Object.keys(jsonInfo)) {
                    if(fields.has(key)) {
                        data[key] = jsonInfo[key];
                    }
                }

                // Extract label
                let label = data[labelFieldName] || docId;
                
                let storeRw = db.transaction(STORE_DOCUMENTS, 'readwrite').store;
                await storeRw.put({...groupDocument, label, data, decrypted: true});
            } catch(err) {
                console.warn("Error decrypting document %s, skipping", docId);
                let storeRw = db.transaction(STORE_DOCUMENTS, 'readwrite').store;
                await storeRw.put({...groupDocument, label: `!!id: ${docId} !!`, data: null, decrypted: true});
            }
        } else {
            console.warn("Missing decryption key: ", cle_id);
        }
    }
}
