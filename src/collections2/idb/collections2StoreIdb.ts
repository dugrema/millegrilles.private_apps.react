import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { messageStruct } from 'millegrilles.cryptography'
import { DownloadJobType } from '../../workers/download.worker';

const DB_NAME = 'collections2';
const STORE_TUUIDS = 'tuuids';
const STORE_VIDEO_PLAY = 'videoPlayback';
const STORE_DOWNLOADS = 'downloads';
export const STORE_DOWNLOAD_PARTS = 'downloadParts';
const DB_VERSION_CURRENT = 3;

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
    format?: string | null,
    nonce?: string | null,
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
    resolution?: number,
    audio_stream_idx?: number | null,
    subtitle_stream_idx?: number | null,
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
    ownerUserId: string | null,  // For shared content
    type_node: string,
    encryptedMetadata?: TuuidEncryptedMetadata,
    secretKey: Uint8Array | null,   // Secret key for metadata (usually the same for associated files)
    keyId: string | null,           // Key Id associated to the secretKey
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

export type VideoPlaybackRowType = {
    tuuid: string,
    userId: string,
    position: number | null,
}

export type DownloadIdbType = {
    fuuid: string,   // primary key 1
    userId: string,  // primary key 2
    tuuid: string,   // Indexed by [tuuid, userId]

    // Download information
    processDate: number,            // Time added/errored in millisecs.
    state: DownloadStateEnum,       // Indexed by [userId, state, processDate].
    position: number,               // Download position of the chunk currently being download or start for the next chunk if download not in progress.
    size: number | null,            // Encrypted file size
    visits: {[instanceId: string]: number},  // Known filehosts with the file
    retry: number,

    // Decryption information
    secretKey: Uint8Array | null,   // Encryption key. Removed once download completes.
    format: string,                 // Encryption format
    nonce?: Uint8Array | null,      // Encryption nonce/header

    // Content
    filename: string,
    mimetype: string,
    content: Blob | null,           // Decrypted content
};

export type DownloadIdbParts = {
    fuuid: string,
    position: number,
    content: Blob,
};

export enum DownloadStateEnum {
    INITIAL = 1,
    PAUSED,
    DOWNLOADING,
    ENCRYPTED,
    DONE,
    ERROR,
}

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
    let tuuidStore = null, downloadStore = null, downloadPartsStore = null;
    switch(oldVersion) {
        // @ts-ignore Fallthrough
        case 0:
        // @ts-ignore Fallthrough
        case 1:
            // Create stores
            tuuidStore = db.createObjectStore(STORE_TUUIDS, {keyPath: ['tuuid', 'user_id']});
            db.createObjectStore(STORE_VIDEO_PLAY, {keyPath: ['tuuid', 'userId']});

            // Create indices
            tuuidStore.createIndex('parent', ['parent', 'user_id'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 2:
            downloadStore = db.createObjectStore(STORE_DOWNLOADS, {keyPath: ['fuuid', 'userId']});
            downloadPartsStore = db.createObjectStore(STORE_DOWNLOAD_PARTS, {keyPath: ['fuuid', 'position']});

            // Create indices
            downloadStore.createIndex('tuuid', ['tuuid', 'userId'], {unique: false, multiEntry: false});
            downloadStore.createIndex('state', ['userId', 'state', 'processDate'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 3: // Most recent
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
        const { tuuid, user_id } = file
        const fileExisting = await store.get([tuuid, user_id]);
        if(fileExisting) {
            await store.put({...fileExisting, ...file});
        } else {
            await store.put(file);
        }
    }
}

export async function loadTuuid(tuuid: string, userId: string): Promise<TuuidsIdbStoreRowType|null> {
    const db = await openDB();
    let store = db.transaction(STORE_TUUIDS, 'readonly').store;
    return await store.get([tuuid, userId]);
}

export async function loadDirectory(userId: string, tuuid: string | null): Promise<LoadDirectoryResultType> {
    const db = await openDB();
    let store = db.transaction(STORE_TUUIDS, 'readonly').store;

    let directoryKey = tuuid || userId;
    let directoryInfo = await store.get([directoryKey, userId]);
    
    store = db.transaction(STORE_TUUIDS, 'readonly').store;
    let parentIndex = store.index('parent');
    let cursor = await parentIndex.openCursor([directoryKey, userId]);
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
            let dirIdb = await store.get([cuuid, userId]);
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

export async function touchDirectorySync(tuuid: string, userId: string, lastCompleteSyncSec: number) {
    const db = await openDB();
    const store = db.transaction(STORE_TUUIDS, 'readwrite').store;
    const fileExisting = await store.get([tuuid, userId]);
    if(!fileExisting) {
        // Not saved yet, ignore
        return;
    }
    let updatedFile = {...fileExisting, lastCompleteSyncSec};
    await store.put(updatedFile);
}

export async function deleteFiles(tuuids: string[], userId: string) {
    const db = await openDB();
    const store = db.transaction(STORE_TUUIDS, 'readwrite').store;
    for(let tuuid of tuuids) {
        await store.delete([tuuid, userId]);
    }
}

export async function setVideoPosition(tuuid: string, userId: string, position: number | null) {
    const db = await openDB();
    const store = db.transaction(STORE_VIDEO_PLAY, 'readwrite').store;
    await store.put({tuuid, userId, position});
}

export async function removeVideoPosition(tuuid: string, userId: string) {
    const db = await openDB();
    const store = db.transaction(STORE_VIDEO_PLAY, 'readwrite').store;
    await store.delete([tuuid, userId])
}

export async function getCurrentVideoPosition(tuuid: string, userId: string): Promise<VideoPlaybackRowType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_VIDEO_PLAY, 'readonly').store;
    return await store.get([tuuid, userId]);
}

export async function getDownloadContent(fuuid: string, userId: string): Promise<Blob | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readonly').store;
    let value = await store.get([fuuid, userId]) as DownloadJobType;
    return value?.content;
}

export async function addDownload(download: DownloadIdbType) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let existing = await store.get([download.fuuid, download.userId]);
    if(existing) {
        console.debug("Download already exists - restart if blocked");
        return;
    } else {
        await store.put(download);  // Add to store
    }
}

export async function getDownloadJob(userId: string, fuuid: string) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readonly').store;
    return await store.get([fuuid, userId]);
}

export async function removeDownload(fuuid: string, userId: string) {
    await removeDownloadParts(fuuid);
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    await store.delete([fuuid, userId]);
}

export async function removeDownloadParts(fuuid: string) {
    const db = await openDB();
    const storeParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    storeParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
}

export async function getNextDownloadJob(userId: string): Promise<DownloadIdbType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readonly').store;

    // Get next jobs with initial state
    let stateIndex = store.index('state');
    let job = await stateIndex.getAll(
        IDBKeyRange.bound([userId, DownloadStateEnum.INITIAL, 0], [userId, DownloadStateEnum.INITIAL, Number.MAX_SAFE_INTEGER]), 
        1);

    if(job.length === 0) return null;
    return job[0] as DownloadJobType;
}

/**
 * Looks for a job in Error state that can be restarted.
 * @param userId 
 * @returns 
 */
export async function restartNextJobInError(userId: string): Promise<DownloadIdbType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;

    // Get next jobs with initial state
    let stateIndex = store.index('state');
    let cursor = await stateIndex.openCursor(
        IDBKeyRange.bound([userId, DownloadStateEnum.ERROR, 0], [userId, DownloadStateEnum.ERROR, Number.MAX_SAFE_INTEGER]));

    while(cursor) {
        let job = cursor.value as DownloadIdbType;
        // Ignore jobs with too many retries
        if(job.retry <= 3) {
            // Increment job retry count and start date
            job.state = DownloadStateEnum.INITIAL;
            job.retry += 1;
            job.processDate = new Date().getTime();  // Changing processDate puts the job at the end of the index. Allows rotating through errors.
            await cursor.update(job);
            return job;
        }
        cursor = await cursor.continue();
    }

    return null;
}

export async function getNextDecryptionJob(userId: string): Promise<DownloadIdbType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readonly').store;

    // Get next jobs with initial state
    let stateIndex = store.index('state');
    let job = await stateIndex.getAll(
        IDBKeyRange.bound([userId, DownloadStateEnum.ENCRYPTED, 0], [userId, DownloadStateEnum.ENCRYPTED, Number.MAX_SAFE_INTEGER]), 
        1);

    if(job.length === 0) return null;
    return job[0] as DownloadIdbType;
}

export async function updateDownloadJobState(fuuid: string, userId: string, state: DownloadStateEnum, opts?: {position?: number}) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let job = await store.get([fuuid, userId]) as DownloadIdbType | null;
    if(!job) throw new Error(`Download job fuuid:${fuuid} userId:${userId} not found`);

    // Update job content
    job.state = state;
    if(opts?.position) job.position = opts.position;

    // Save
    await store.put(job);
}

export async function saveDownloadPart(fuuid: string, position: number, part: Blob) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await store.put({fuuid, position, content: part});
}

export async function saveDecryptedBlob(fuuid: string, decryptedBlob: Blob) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));

    // Save the decrypted file to all download jobs matching the fuuid
    while(cursor) {
        let value = cursor.value as DownloadIdbType;
        
        // Update the record
        value.content = decryptedBlob;
        value.secretKey = null;  // Erase key
        value.state = DownloadStateEnum.DONE;
        await cursor.update(value);  // Replace value
        
        cursor = await cursor.continue();
    }

    // Clear the stored parts
    const storeParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await storeParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
}

export async function saveDecryptionError(fuuid: string,) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));

    // Save the decrypted file to all download jobs matching the fuuid
    while(cursor) {
        let value = cursor.value as DownloadIdbType;
        
        // Update the record
        value.secretKey = null;  // Erase key
        value.state = DownloadStateEnum.ERROR;
        await cursor.update(value);  // Replace value
        
        cursor = await cursor.continue();
    }

    // Clear the stored parts
    const storeParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await storeParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
}

/**
 * Returns the current max position of the parts in the store for a file.
 * @param fuuid File parts to look for.
 */
export async function findDownloadPosition(fuuid: string): Promise<number | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOAD_PARTS, 'readonly').store;

    // Open the index in reverse. We want the last value (it is sorted by position).
    // Ignore the position 0 (open: true).
    let cursor = await store.openCursor(IDBKeyRange.lowerBound([fuuid, 0], true), 'prev');
    let lastValue = cursor?.value as DownloadIdbParts;

    if(!lastValue) return null;

    let position = lastValue.position;
    let size = lastValue.content.size;
    return position + size;
}

export async function getDownloadJobs(userId: string): Promise<DownloadJobType[]> {
    const db = await openDB();
    let store = db.transaction(STORE_DOWNLOADS, 'readonly').store;
    let stateIndex = store.index('state');
    let jobs = await stateIndex.getAll(
        IDBKeyRange.bound([userId, DownloadStateEnum.INITIAL, 0], [userId, DownloadStateEnum.ERROR, Number.MAX_SAFE_INTEGER])) as DownloadJobType[];
    return jobs;
}

export async function testBounds(fuuid: string) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let items = await store.getAll(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));  // Using ~ as end bound (after z, userId is base58btc)
    console.debug("Fuuid %s\nItem value", fuuid, items);
}

export async function removeUserDownloads(userId: string, opts?: {state?: DownloadStateEnum, fuuid?: string}) {
    const db = await openDB();

    let fuuids = new Set();

    let storeDownloads = db.transaction(STORE_DOWNLOADS, 'readwrite').store;

    if(opts?.fuuid) {
        let fuuid = opts.fuuid;
        // Need to cleanup the downloaded file parts table.
        fuuids.add(fuuid);
        await storeDownloads.delete([fuuid, userId]);
    } else {
        // Go through all downloads for the user.
        let state = opts?.state || DownloadStateEnum.DONE;  // Default is to remove completed jobs
        let stateIndex = storeDownloads.index('state');
        let cursorUserJobs = await stateIndex.openCursor(
            IDBKeyRange.bound([userId, state, 0], [userId, state, Number.MAX_SAFE_INTEGER]));
        
        while(cursorUserJobs) {
            let value = cursorUserJobs.value as DownloadIdbType;
            
            if(state !== DownloadStateEnum.DONE) {
                // Need to cleanup the downloaded file parts table.
                fuuids.add(value.fuuid);
            }
            
            await cursorUserJobs.delete();  // Remove the download entry
            cursorUserJobs = await cursorUserJobs.continue();
        }
    }

    if(fuuids.size > 0) {
        // Go through all download jobs to ensure no other user is downloading the fuuid
        let otherStoreDownloads = db.transaction(STORE_DOWNLOADS, 'readonly').store;
        let cursorOtherJobs = await otherStoreDownloads.openCursor();
        while (cursorOtherJobs) {
            let value = cursorOtherJobs.value as DownloadIdbType;
            if(value.userId !== userId) {
                // The file is also used by another user's download jobs.
                // Ensure that fuuid is not removed from list.
                fuuids.delete(value.fuuid);
            }
            cursorOtherJobs = await cursorOtherJobs.continue();
        }

        let storeDownloadParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
        let cursorParts = await storeDownloadParts.openCursor();
        while(cursorParts) {
            let value = cursorParts.value as DownloadIdbParts;
            if(fuuids.has(value.fuuid)) {
                await cursorParts.delete();  // Remove this part
            }
            cursorParts = await cursorParts.continue();
        }
    }
}

/** Clears all stores. */
export async function cleanup() {
    const db = await openDB();

    let storeTuuids = db.transaction(STORE_TUUIDS, 'readwrite').store;
    await storeTuuids.clear();

    let storeVideo = db.transaction(STORE_VIDEO_PLAY, 'readwrite').store;
    await storeVideo.clear();

    let storeDownloads = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    await storeDownloads.clear();

    let storeDownloadParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await storeDownloadParts.clear();
}
