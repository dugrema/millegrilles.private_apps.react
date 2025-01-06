import { IDBPDatabase, openDB as openDbIdb } from 'idb';
import { getDecryptedKeys, saveDecryptedKey } from '../../MillegrillesIdb';
import { AppWorkers } from '../../workers/workers';
import { messageStruct } from 'millegrilles.cryptography'

const DB_NAME = 'collections2';
const STORE_TUUIDS = 'tuuids';
const DB_VERSION_CURRENT = 2;

export type TuuidEncryptedMetadata = messageStruct.MessageDecryption & {
    data_chiffre: string,
}

export type TuuidDecryptedMetadata = {
    nom: string,
    date?: number,
    hachage_original?: string,
}

export type FileData = {
    fuuids_versions?: string[] | null,
    mimetype?: string | null,
    supprime: boolean,
    supprime_indirect: boolean,
    taille?: number,
    visites?: string[],
    height?: number,
    width?: number,
    anime?: boolean,
    duration?: number,
    images?: FileImageDict,
    video?: FileVideoDict,
    audio?: FileAudioData[],
    subtitles?: FileSubtitleData[],
}

export type FileImageDict = {[key: string]: FileImageData}
export type FileVideoDict = {[key: string]: FileVideoData}

export type FileImageData = messageStruct.MessageDecryption & {
    data_chiffre?: string,
    hachage: string,
    mimetype: string,
    width: number,
    height: number,
    taille: number,
    resolution: number,
}

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
}

export type FileAudioData = {
    index?: number,
    title?: string | null,
    language?: string | null,
    codec_name?: string | null,
    bit_rate?: number | null,
    default?: boolean | null,
}

export type FileSubtitleData = {
    index?: number,
    language?: string | null,
    title?: string | null,
    codec_name?: string | null,
}

export type TuuidsIdbStoreRowType = {
    tuuid: string,
    user_id: string,
    type_node: string,
    encryptedMetadata?: TuuidEncryptedMetadata,
    decryptedMetadata?: TuuidDecryptedMetadata,
    parent: string,  // For top level collections, this is the user_id. For all others this is the tuuid of the parent collection.
    path_cuuids?: string[] | null,
    fileData?: FileData,
    derniere_modification: number,
    lastCompleteSyncMs?: number,  // For directories only, last complete sync of content
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
