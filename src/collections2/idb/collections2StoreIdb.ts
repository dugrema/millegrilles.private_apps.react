import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { messageStruct } from 'millegrilles.cryptography'
import { DownloadJobType } from '../../workers/download.worker';
import { UploadJobType } from '../../workers/upload.worker';
import { GeneratedSecretKeyResult } from '../../workers/encryption';
import { Collections2AddFileCommand } from '../../workers/connection.worker';
import { getMimetypeByExtensionMap } from '../mimetypes';
import { EncryptionBase64Result } from '../../workers/encryptionUtils';

const DB_NAME = 'collections2';
const STORE_TUUIDS = 'tuuids';
const STORE_VIDEO_PLAY = 'videoPlayback';
const STORE_DOWNLOADS = 'downloads';
const STORE_UPLOADS = 'uploads';
export const STORE_DOWNLOAD_PARTS = 'downloadParts';
export const STORE_DOWNLOAD_DECRYPTED_PARTS = 'downloadDecryptedParts';
export const STORE_UPLOAD_PARTS = 'uploadParts';
const DB_VERSION_CURRENT = 5;

export type TuuidEncryptedMetadata = messageStruct.MessageDecryption & {
    data_chiffre: string,
};

export type TuuidDecryptedMetadata = {
    nom: string,
    dateFichier?: number,
    hachage_original?: string,
    originalSize?: number,
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
    language?: string,
    comments?: EncryptionBase64Result[],
    tags?: string[],
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

export type EncryptedFileComment = {comment_id: string, date: number, encrypted_data: EncryptionBase64Result, user_id?: string};
export type FileComment = {comment_id: string, date: number, comment?: string, tags?: string[], user_id?: string};

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
    thumbnail: Uint8Array | null,
    thumbnailDownloaded?: boolean | null,  // True if high quality (small) image was downloaded to replace the inline thumbnail
    date_creation: number,
    derniere_modification: number,
    lastCompleteSyncSec?: number,  // For directories only, last complete sync of content
    supprime?: boolean | null,
    language?: string | null,
    comments?: EncryptedFileComment[] | null,
    tags?: EncryptionBase64Result | null,
    decryptedComments?: FileComment[],
    decryptedTags?: string[],
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

// Download types

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

export type DownloadDecryptedIdbParts = DownloadIdbParts;

export enum DownloadStateEnum {
    INITIAL = 1,
    PAUSED,
    DOWNLOADING,
    ENCRYPTED,
    DONE,
    ERROR = 99,
};

// Upload types

export type UploadIdbType = {
    uploadId: number,   // Auto-incremented uploadId. Local IDB only, not to be used as upload key.
    userId: string,

    // Commands to upload with the file
    addCommand: Collections2AddFileCommand | null,          // Unsigned file add command
    keyCommand: messageStruct.MilleGrillesMessage | null,   // Signed key add command
    secret: GeneratedSecretKeyResult | null,                // Secret key to use for encryption
    
    // Upload information, index [userId, state, processDate].
    state: UploadStateEnum,
    processDate: number,            // Time added/errored in millisecs.
    retry: number,
    commandRetry?: number | null,   // Retries on sending commands
    uploadUrl: string | null,       // Filehost url for the upload

    // Decrypted metadata for reference on screen
    filename: string,
    lastModified: number,
    mimetype: string,
    cuuid: string,                  // Directory where the file is being uploaded
    destinationPath: string,        // Directory path where the file is being uploaded for reference.
    clearSize: number | null,       // Decrypted file size
    originalDigest: string | null,  // Decrypted file digest
    
    // Encrypted file information
    fuuid: string | null,           // Unique file id, null while file is being encrypted.
    size: number | null,            // Encrypted file size
    decryption: messageStruct.MessageDecryption | null,
};

export type UploadIdbParts = {
    uploadId: string,
    position: number,
    content: Blob,
};

export enum UploadStateEnum {
    // Encryption stages, sequential up to READY unless ERROR.
    INITIAL = 1,
    ENCRYPTING,
    GENERATING,
    SENDCOMMAND,    // To READY or PAUSED

    // Client upload to server. Transition from any to any of these states is possible.
    READY,
    PAUSED,
    UPLOADING,      // TO VERIFYING or ERROR_DURING_PART_UPLOAD

    // After upload completed from client side
    VERIFYING,      // Server-side verification
    DONE,           // Final state

    // Error during UPLOADING - can be resumed.
    ERROR_DURING_PART_UPLOAD = 98,

    // Any state can transition to ERROR. This is a final state like DONE (no resume).
    ERROR = 99,
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
    let downloadStore = null;
    let uploadStore = null;
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
            db.createObjectStore(STORE_DOWNLOAD_PARTS, {keyPath: ['fuuid', 'position']});

            // Create indices
            downloadStore.createIndex('tuuid', ['tuuid', 'userId'], {unique: false, multiEntry: false});
            downloadStore.createIndex('state', ['userId', 'state', 'processDate'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 3: 
            uploadStore = db.createObjectStore(STORE_UPLOADS, {keyPath: 'uploadId', autoIncrement: true});
            db.createObjectStore(STORE_UPLOAD_PARTS, {keyPath: ['uploadId', 'position']});

            // Create indices
            uploadStore.createIndex('state', ['userId', 'state', 'processDate'], {unique: false, multiEntry: false});

        // @ts-ignore Fallthrough
        case 4: // Most recent
            db.createObjectStore(STORE_DOWNLOAD_DECRYPTED_PARTS, {keyPath: ['fuuid', 'position']});
            break;

        // @ts-ignore Fallthrough
        case 5: // Most recent
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

export async function getDownloadContent(fuuid: string, userId?: string): Promise<Blob | null> {
    // const db = await openDB();
    // const store = db.transaction(STORE_DOWNLOADS, 'readonly').store;
    // let value = await store.get([fuuid, userId]) as DownloadJobType;
    // return value?.content;

    let root = await navigator.storage.getDirectory();
    try {
        let downloadDirectory = await root.getDirectoryHandle('downloads');
        try {
            let fileHandle = await downloadDirectory.getFileHandle(`${fuuid}.decrypted`);
            let file = await fileHandle.getFile();
            return file;
        } catch(err) {
            // File does not exist, try the decrypted in place version
            try {
                let fileHandle = await downloadDirectory.getFileHandle(fuuid);
                let file = await fileHandle.getFile();
                return file;
            } catch(err) {
                // File not found
                return null;
            }
        }
    } catch(err) {
        console.debug("Downloads directory not created yet");
        return null;
    }
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

export async function getDownloadJob(userId: string, fuuid: string): Promise<DownloadIdbType> {
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
    const storeDecryptedParts = db.transaction(STORE_DOWNLOAD_DECRYPTED_PARTS, 'readwrite').store;
    storeDecryptedParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
   
    await removeDownloadStorageEntry(fuuid);
}

export async function removeDownloadStorageEntry(fuuid: string) {
    // Remove from filesystem
    let root = await navigator.storage.getDirectory();
    try {
        let downloadDirectory = await root.getDirectoryHandle('downloads');
        try {
            await downloadDirectory.removeEntry(`${fuuid}.decrypted`);
        } catch(err) {
            console.info("Error deleting download file %s", fuuid + '.decrypted')
        }
        try {
            await downloadDirectory.removeEntry(fuuid);
        } catch(err) {
            console.info("Error deleting download file %s", fuuid)
        }
    } catch(err) {
        console.warn("Error deleting download file entry: ", err);
    }
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
    // let content = new Uint8Array(await part.arrayBuffer());
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await store.put({fuuid, position, content: part});
}

export async function saveDownloadDecryptedPart(fuuid: string, position: number, part: Blob) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOAD_DECRYPTED_PARTS, 'readwrite').store;
    await store.put({fuuid, position, content: part});
}

export async function getDecryptedBlob(fuuid: string): Promise<Blob | null> {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOAD_DECRYPTED_PARTS, 'readonly').store;

    // Iterate through file parts. The index ensures the parts are ordered properly
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
    let fileBlobs = [] as Blob[];
    while(cursor) {
        let value = cursor.value as DownloadDecryptedIdbParts;
        fileBlobs.push(value.content);
        cursor = await cursor.continue();
    }

    if(fileBlobs.length === 0) return null;
    return new Blob(fileBlobs);
}

export async function saveDecryptedBlob(fuuid: string, decryptedBlob: Blob) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));
    let userIds = [] as string[];

    // Save the decrypted file to all download jobs matching the fuuid

    // This approach was working but seemed to cause a memory leak on the Blob.
    // while(cursor) {
    //     let value = cursor.value as DownloadIdbType;
    //     // Update the record
    //     value.content = decryptedBlob;
    //     value.secretKey = null;  // Erase key
    //     value.state = DownloadStateEnum.DONE;
    //     console.debug("Replacing file value with decrypted content", value);
    //     await cursor.update(value);  // Replace value
    //     cursor = await cursor.continue();
    // }

    // console.debug("Saving decrypted fuuid:%s blob:%O", fuuid, decryptedBlob);

    // Use less direct approach than with cursor.update. Avoids the memory leak on Firefox.
    while(cursor) {
        let value = cursor.value as DownloadIdbType;
        userIds.push(value.userId);
        cursor = await cursor.continue();
    }

    for(let userId of userIds) {
        let value = await store.get([fuuid, userId]);
        if(value) {
            value.content = decryptedBlob;
            value.secretKey = null;  // Erase key
            value.state = DownloadStateEnum.DONE;
            await store.put(value);
        }
    }

    // Clear the stored parts
    await removeDownloadParts(fuuid);
}

export async function setDownloadJobComplete(fuuid: string) {
    const db = await openDB();
    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));

    // Sett all download jobs on this fuuid to done.
    while(cursor) {
        let value = cursor.value as DownloadIdbType;
        // Update the record
        value.secretKey = null;  // Erase key
        value.state = DownloadStateEnum.DONE;
        await cursor.update(value);  // Replace value
        cursor = await cursor.continue();
    }
}

export async function saveDecryptionError(fuuid: string) {
    const db = await openDB();

    // Clear the stored parts
    const storeParts = db.transaction(STORE_DOWNLOAD_PARTS, 'readwrite').store;
    await storeParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));
    const storeDecryptedParts = db.transaction(STORE_DOWNLOAD_DECRYPTED_PARTS, 'readwrite').store;
    await storeDecryptedParts.delete(IDBKeyRange.bound([fuuid, 0], [fuuid, Number.MAX_SAFE_INTEGER]));

    await removeDownloadStorageEntry(fuuid);

    const store = db.transaction(STORE_DOWNLOADS, 'readwrite').store;
    let cursor = await store.openCursor(IDBKeyRange.bound([fuuid, ''], [fuuid, '~']));

    // Save the decrypted file to all download jobs matching the fuuid
    while(cursor) {
        let value = cursor.value as DownloadIdbType;
        
        // Update the record
        // value.secretKey = null;  // Erase key
        value.state = DownloadStateEnum.PAUSED;  // Note: ERROR just resumes, need a new ERROR type
        await cursor.update(value);  // Replace value
        
        cursor = await cursor.continue();
    }
}

/**
 * Returns the current max position of the parts in the store for a file.
 * @param fuuid File parts to look for.
 */
export async function findDownloadPosition(fuuid: string): Promise<number | null> {
    let root = await navigator.storage.getDirectory();
    try {
        let downloadDirectory = await root.getDirectoryHandle('downloads');
        let currentDownload = await downloadDirectory.getFileHandle(fuuid);
        let file = await currentDownload.getFile();
        return file.size;
    } catch(err) {
        // File does not exist
        return null;
    }

    // const db = await openDB();
    // const store = db.transaction(STORE_DOWNLOAD_PARTS, 'readonly').store;

    // // Open the index in reverse. We want the last value (it is sorted by position).
    // // Ignore the position 0 (open: true).
    // let cursor = await store.openCursor(IDBKeyRange.lowerBound([fuuid, 0], true), 'prev');
    // let lastValue = cursor?.value as DownloadIdbParts;

    // if(!lastValue) return null;

    // let position = lastValue.position;
    // let size = lastValue.content.size;
    // return position + size;
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
            
            // Need to cleanup the downloaded file parts table.
            fuuids.add(value.fuuid);
            
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

        fuuids.forEach(fuuid=>{
            removeDownloadStorageEntry(fuuid as string)
                .catch(err=>console.error("Error deleting downloaded file %s: %O", fuuid, err));
        })
    }
}

// Uploads

export async function getUploadJobs(userId: string): Promise<UploadJobType[]> {
    const db = await openDB();
    let store = db.transaction(STORE_UPLOADS, 'readonly').store;
    let stateIndex = store.index('state');
    let jobs = await stateIndex.getAll(
        IDBKeyRange.bound([userId, UploadStateEnum.INITIAL, 0], [userId, UploadStateEnum.ERROR, Number.MAX_SAFE_INTEGER])) as UploadJobType[];
    return jobs;
}

export type AddUploadFileOptions = {
    destinationPath?: string | null,
    secret?: GeneratedSecretKeyResult,
    keyCommand?: messageStruct.MilleGrillesMessage,
}

export async function addUploadFile(userId: string, cuuid: string, file: File, opts?: AddUploadFileOptions): Promise<number> {
    const db = await openDB();

    // iOS uses character combining. Fix with normalize().
    let filename = file.name.normalize();

    let mimetype = file.type;
    if(!mimetype || mimetype === 'application/octet-stream') {
        // Try to detect the mimetype by using the file extension.
        let extension = filename.split('.').pop();
        if(extension) {
            extension = extension.toLocaleLowerCase();
            let mapExtensions = getMimetypeByExtensionMap();
            mimetype = mapExtensions[extension];
        }
        // Set default when required
        if(!mimetype) mimetype = 'application/octet-stream';
    }

    let entry = {
        // uploadId: number,   // Auto-incremented uploadId - leave empty.
        userId,
    
        // Commands to upload with the file
        addCommand: null,
        keyCommand: opts?.keyCommand,
        secret: opts?.secret,
        
        // Upload information, index [userId, state, processDate].
        state: UploadStateEnum.INITIAL,
        processDate: new Date().getTime(),
        retry: 0,
    
        // Decrypted metadata for reference on screen
        filename,
        lastModified: file.lastModified,
        mimetype,
        cuuid,
        destinationPath: opts?.destinationPath,
        clearSize: file.size,
        
        // Encrypted file information
        fuuid: null,
        size: null,
    } as UploadIdbType;
    let storeUploads = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let newKey = await storeUploads.add(entry) as number;
    return newKey;
}

export async function getUploadJob(uploadId: number): Promise<UploadJobType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readonly').store;
    return await store.get(uploadId);
}

export async function getNextUploadSendCommand(userId: string, retry?: boolean): Promise<UploadIdbType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let stateIndex = store.index('state');
    let cursor = await stateIndex.openCursor(
        IDBKeyRange.bound([userId, UploadStateEnum.SENDCOMMAND, 0], [userId, UploadStateEnum.SENDCOMMAND, Number.MAX_SAFE_INTEGER]));
    while(cursor) {
        let value = cursor.value as UploadIdbType;
        if(value.commandRetry) {
            if(retry) {
                throw new Error('TODO - Retry send addFile command');
            } else {
                // Skip entry
            }
        } else {
            // Take value
            await cursor.update({...value, commandRetry: 1});
            return value;
        }
        
        cursor = await cursor.continue();
    }

    return null;
}

export async function getBatchRetryUploadSendCommand(userId: string): Promise<UploadIdbType[] | null> {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let stateIndex = store.index('state');
    let cursor = await stateIndex.openCursor(
        IDBKeyRange.bound([userId, UploadStateEnum.SENDCOMMAND, 0], [userId, UploadStateEnum.SENDCOMMAND, Number.MAX_SAFE_INTEGER]));
    let commands = [] as UploadIdbType[];
    while(cursor) {
        let value = cursor.value as UploadIdbType;
        if(value.commandRetry) {
            // Take value
            await cursor.update({...value, commandRetry: value.commandRetry + 1});
            commands.push(value);
        }
        if(commands.length > 50) break;  // Max batch size
        cursor = await cursor.continue();
    }

    return commands;
}

export async function updateUploadJobState(uploadId: number, state: UploadStateEnum, opts?: {uploadUrl?: string}) {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let job = await store.get(uploadId) as UploadIdbType | null;
    if(!job) throw new Error(`Download job uploadId:${uploadId} not found`);

    // Update job content
    job.state = state;
    if(opts?.uploadUrl) job.uploadUrl = opts.uploadUrl;

    // Save
    await store.put(job);
}

export async function removeUploadParts(uploadId: number) {
    const db = await openDB();
    const storeParts = db.transaction(STORE_UPLOAD_PARTS, 'readwrite').store;
    storeParts.delete(IDBKeyRange.bound([uploadId, 0], [uploadId, Number.MAX_SAFE_INTEGER]));
}

export async function getUploadPart(uploadId: number, position: number): Promise<UploadIdbParts | null> {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOAD_PARTS, 'readonly').store;
    return await store.get([uploadId, position]);
}

export async function saveUploadJobDecryptionInfo(uploadId: number, decryptionInfo: messageStruct.MessageDecryption, fileSize: number, originalDigest: string) {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let job = await store.get(uploadId) as UploadIdbType | null;
    if(!job) throw new Error(`Download job uploadId:${uploadId} not found`);

    // Update job content
    job.decryption = decryptionInfo;
    job.state = UploadStateEnum.GENERATING;
    job.size = fileSize;
    job.originalDigest = originalDigest;
    if(decryptionInfo.verification) {
        job.fuuid = decryptionInfo.verification;
    } else {
        throw new Error('File unique id (fuuid) not available from encrypted information')
    }

    // Save
    await store.put(job);
}

export async function saveUploadJobAddCommand(uploadId: number, command: Collections2AddFileCommand) {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readwrite').store;
    let job = await store.get(uploadId) as UploadIdbType | null;
    if(!job) throw new Error(`Download job uploadId:${uploadId} not found`);

    // Update job content
    job.state = UploadStateEnum.SENDCOMMAND;
    job.addCommand = command;

    // Save
    await store.put(job);
}

export async function saveUploadPart(uploadId: number, position: number, part: Blob) {
    const db = await openDB();
    // let partArray = new Uint8Array(await part.arrayBuffer());
    const store = db.transaction(STORE_UPLOAD_PARTS, 'readwrite').store;
    await store.put({uploadId, position, content: part});
}

export async function getNextUploadReadyJob(userId: string): Promise<UploadJobType | null> {
    const db = await openDB();
    const store = db.transaction(STORE_UPLOADS, 'readonly').store;

    // Get next jobs with initial state
    let stateIndex = store.index('state');
    let job = await stateIndex.getAll(
        IDBKeyRange.bound([userId, UploadStateEnum.READY, 0], [userId, UploadStateEnum.READY, Number.MAX_SAFE_INTEGER]), 
        1);

    if(job.length === 0) return null;
    return job[0] as UploadJobType;
}

export async function removeUserUploads(userId: string, opts?: {state?: UploadStateEnum, uploadId?: number}) {
    const db = await openDB();

    let uploadIds = new Set();

    let storeUploads = db.transaction(STORE_UPLOADS, 'readwrite').store;

    if(opts?.uploadId) {
        let uploadId = opts.uploadId;
        uploadIds.add(uploadId);  // Need to cleanup the uploaded file parts table for that uploadId.
        await storeUploads.delete(uploadId);
    } else {
        // Go through all uploads for the user.
        let state = opts?.state || UploadStateEnum.DONE;  // Default is to remove completed jobs
        let stateIndex = storeUploads.index('state');
        let cursorUserJobs = await stateIndex.openCursor(
            IDBKeyRange.bound([userId, state, 0], [userId, state, Number.MAX_SAFE_INTEGER]));
        
        while(cursorUserJobs) {
            let value = cursorUserJobs.value as UploadIdbType;
            
            if(state !== UploadStateEnum.DONE) {
                // Need to cleanup the downloaded file parts table.
                uploadIds.add(value.uploadId);
            }
            
            await cursorUserJobs.delete();  // Remove the download entry
            cursorUserJobs = await cursorUserJobs.continue();
        }
    }

    if(uploadIds.size > 0) {
        let storeDownloadParts = db.transaction(STORE_UPLOAD_PARTS, 'readwrite').store;
        let cursorParts = await storeDownloadParts.openCursor();
        while(cursorParts) {
            let value = cursorParts.value as UploadIdbParts;
            if(uploadIds.has(value.uploadId)) {
                await cursorParts.delete();  // Remove this part
            }
            cursorParts = await cursorParts.continue();
        }
    }
}
    
// export async function getNextEncryptJob(userId: string): Promise<UploadJobType | null> {
//     const db = await openDB();
//     const store = db.transaction(STORE_UPLOADS, 'readonly').store;

//     // Get next jobs with initial state
//     let stateIndex = store.index('state');
//     let job = await stateIndex.getAll(
//         IDBKeyRange.bound([userId, UploadStateEnum.INITIAL, 0], [userId, UploadStateEnum.INITIAL, Number.MAX_SAFE_INTEGER]), 
//         1);

//     console.debug("getNextEncryptJob for %s: %O", userId, job)

//     if(job.length === 0) return null;
//     return job[0] as UploadJobType;
// }

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

    let storeDownloadDecryptedParts = db.transaction(STORE_DOWNLOAD_DECRYPTED_PARTS, 'readwrite').store;
    await storeDownloadDecryptedParts.clear();

    let storeUploads = db.transaction(STORE_UPLOADS, 'readwrite').store;
    await storeUploads.clear();

    let storeUploadParts = db.transaction(STORE_UPLOAD_PARTS, 'readwrite').store;
    await storeUploadParts.clear();

    try {
        let root = await navigator.storage.getDirectory();
        let downloadDirectory = await root.getDirectoryHandle('downloads');
        // @ts-ignore
        for await(let filename of downloadDirectory.values()) {
            // console.debug("Deleting downloaded file ", filename);
            await downloadDirectory.removeEntry(filename.name);
        }
        // console.debug("Deleting downloads directory");
        await root.removeEntry('downloads');
    } catch(err) {
        console.warn("Error deleting download directory entry: ", err);
    }
}
