import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { messageStruct } from 'millegrilles.cryptography'

const DB_NAME = 'collections2';
const STORE_TUUIDS = 'tuuids';
const DB_VERSION_CURRENT = 2;

export type TuuidEncryptedMetadata = messageStruct.MessageDecryption & {
    data_chiffre: string,
};

export type TuuidDecryptedMetadata = {
    nom: string,
    dateFichier?: number,
    hachage_original?: string,
};

export type FileData = {
    fuuids_versions?: string[] | null,
    mimetype?: string | null,
    supprime: boolean,
    supprime_indirect: boolean,
    taille?: number,
    visites?: {[instanceId: string]: number},
    height?: number,
    width?: number,
    anime?: boolean,
    duration?: number,
    images?: FileImageDict,
    video?: FileVideoDict,
    audio?: FileAudioData[],
    subtitles?: FileSubtitleData[],
}

export type FileImageDict = {[key: string]: FileImageData};
export type FileVideoDict = {[key: string]: FileVideoData};

export type FileImageData = messageStruct.MessageDecryption & {
    data_chiffre?: string,
    hachage: string,
    mimetype: string,
    width: number,
    height: number,
    taille: number,
    resolution: number,
};

export type FileVideoData = messageStruct.MessageDecryption & {
    fuuid: string,
    fuuid_video: string,
    taille_fichier: number,
    mimetype: string,
    cle_conversion?: string,
    codec?: string,
    width?: number,
    height?: number,
    quality?: number,
    resolution: number,
};

export type FileAudioData = {
    index?: number,
    title?: string | null,
    language?: string | null,
    codec_name?: string | null,
    bit_rate?: number | null,
    default?: boolean | null,
};

export type FileSubtitleData = {
    index?: number,
    language?: string | null,
    title?: string | null,
    codec_name?: string | null,
};

export type TuuidsIdbStoreRowType = {
    tuuid: string,
    user_id: string,
    type_node: string,
    encryptedMetadata?: TuuidEncryptedMetadata,
    secretKey: Uint8Array | null,
    decryptedMetadata?: TuuidDecryptedMetadata,
    parent: string,  // For top level collections, this is the user_id. For all others this is the tuuid of the parent collection.
    path_cuuids?: string[] | null,
    fileData?: FileData,
    thumbnail: Blob | null,
    thumbnailDownloaded?: boolean | null,  // True if high quality (small) image was downloaded to replace the inline thumbnail
    date_creation: number,
    derniere_modification: number,
    lastCompleteSyncSec?: number,  // For directories only, last complete sync of content
};

export type LoadDirectoryResultType = {
    directory: TuuidsIdbStoreRowType | null, 
    list: TuuidsIdbStoreRowType[],
    breadcrumb: TuuidsIdbStoreRowType[] | null,
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
    let tuuidStore = null;
    switch(oldVersion) {
        // @ts-ignore Fallthrough
        case 0:
        // @ts-ignore Fallthrough
        case 1:
            // Create stores
            tuuidStore = db.createObjectStore(STORE_TUUIDS, {keyPath: 'tuuid'});

            // Create indices
            tuuidStore.createIndex('parent', 'parent', {unique: false, multiEntry: false});
            // documentStore.createIndex('useridGroup', ['user_id', 'groupe_id'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 2: // Most recent
            break;
        default:
            console.warn("createObjectStores Default..., version %O", oldVersion)
    }
}

// Met dirty a true et dechiffre a false si mismatch derniere_modification
export async function updateFilesIdb(tuuids: TuuidsIdbStoreRowType[]) {
    const db = await openDB();
    const store = db.transaction(STORE_TUUIDS, 'readwrite').store;

    for await (const file of tuuids) {
        const { tuuid } = file
        const fileExisting = await store.get(tuuid);
        if(fileExisting) {
            await store.put({...fileExisting, ...file});
        } else {
            await store.put(file);
        }
    }
}

export async function loadTuuid(tuuid: string): Promise<TuuidsIdbStoreRowType|null> {
    const db = await openDB();
    let store = db.transaction(STORE_TUUIDS, 'readonly').store;
    return await store.get(tuuid);
}

export async function loadDirectory(userId: string, tuuid: string | null): Promise<LoadDirectoryResultType> {
    const db = await openDB();
    let store = db.transaction(STORE_TUUIDS, 'readonly').store;

    let directoryKey = tuuid || userId;
    let directoryInfo = await store.get(directoryKey);
    
    store = db.transaction(STORE_TUUIDS, 'readonly').store;
    let parentIndex = store.index('parent');
    let cursor = await parentIndex.openCursor(directoryKey);
    let files = [] as TuuidsIdbStoreRowType[];
    while(cursor) {
        let value = cursor.value as TuuidsIdbStoreRowType;
        if(value.user_id !== userId) continue;  // Security check
        files.push(value);
        cursor = await cursor.continue();
    }

    // Build breadcrumb in reverse
    let breadcrumb = null as TuuidsIdbStoreRowType[] | null;
    if(directoryInfo?.path_cuuids) {
        let breadcrumbInner = [directoryInfo];
        store = db.transaction(STORE_TUUIDS, 'readonly').store;
        for(let cuuid of directoryInfo.path_cuuids) {
            let dirIdb = await store.get(cuuid);
            if(!dirIdb) break;  // Incomplete breadcrumb / truncated (shared)
            breadcrumbInner.push(dirIdb);
        }
        // Put back in proper order
        breadcrumb = breadcrumbInner.reverse();
    } else if(tuuid && directoryInfo) {
        // Top-level collection
        breadcrumb = [directoryInfo];
    }

    return {directory: directoryInfo, list: files, breadcrumb};
}

export async function touchDirectorySync(tuuid: string, lastCompleteSyncSec: number) {
    const db = await openDB();
    const store = db.transaction(STORE_TUUIDS, 'readwrite').store;
    const fileExisting = await store.get(tuuid);
    if(!fileExisting) {
        // Not saved yet, ignore
        return;
    }
    let updatedFile = {...fileExisting, lastCompleteSyncSec};
    await store.put(updatedFile);
}

export async function deleteFiles(tuuids: string[]) {
    const db = await openDB();
    const store = db.transaction(STORE_TUUIDS, 'readwrite').store;
    for(let tuuid of tuuids) {
        await store.delete(tuuid);
    }
}
