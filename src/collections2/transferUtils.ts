import { multiencoding } from "millegrilles.cryptography";
import { DownloadIdbType, DownloadStateEnum, FileVideoData, loadTuuid } from "./idb/collections2StoreIdb";

/**
 * Helper function to create a file download from an IDB entry.
 * @param tuuid 
 * @param userId 
 */
export async function createDownloadEntryFromFile(tuuid: string, userId: string): Promise<DownloadIdbType> {
    let file = await loadTuuid(tuuid, userId);

    // Content validation
    if(!file) throw new Error(`Unkonwn file tuuid: ${tuuid} for userId: ${userId}`);
    if(file.type_node !== 'Fichier') throw new Error(`File tuuid ${tuuid} is of type ${file.type_node}. Only 'Fichiers' type can be downloaded`);
    if(!file.fileData) throw new Error(`File ${tuuid} has missing metadata`);

    let filename = file.decryptedMetadata?.nom;
    if(!filename) throw new Error(`File name not provided for ${tuuid}`);

    let fileSize = file.fileData.taille;
    if(typeof(fileSize) !== 'number') throw new Error(`The size for file ${tuuid} was not provided.`);

    let visits = file.fileData.visites;
    if(!visits || Object.keys(visits).length === 0) throw new Error(`There are no known locations to download file tuuid ${tuuid}`);
    
    let fuuids = file.fileData.fuuids_versions;
    if(!fuuids || fuuids.length === 0) throw new Error(`File ${tuuid} is missing version information for download`);
    let fuuid = fuuids[0];  // Use latest version

    // Prepare decryption information
    let secretKey = file.secretKey;
    if(!secretKey) throw new Error(`Decryption key for file tuuid ${tuuid} not found`);
    let format = file.fileData.format;
    if(!format) throw new Error(`Decryption format for file tuuid ${tuuid} not found`);
    let nonceBase64 = file.fileData.nonce;
    if(!nonceBase64) throw new Error(`Decryption nonce for file tuuid ${tuuid} not found`);
    let nonce = multiencoding.decodeBase64Nopad(nonceBase64);

    // Create download entry
    let entry = {
        fuuid, userId, tuuid,

        // Download information
        processDate: new Date().getTime(),
        state: DownloadStateEnum.INITIAL,
        position: 0,
        size: fileSize,
        visits,

        // Decryption information
        secretKey, format, nonce,
        
        // Content
        filename,
        mimetype: file.fileData.mimetype,
        content: null,
    } as DownloadIdbType;

    return entry;
}

export async function createDownloadEntryFromVideo(tuuid: string, userId: string, video: FileVideoData): Promise<DownloadIdbType> {
    let file = await loadTuuid(tuuid, userId);
   
    // Content validation
    if(!file) throw new Error(`Unkonwn file tuuid: ${tuuid} for userId: ${userId}`);
    if(file.type_node !== 'Fichier') throw new Error(`File tuuid ${tuuid} is of type ${file.type_node}. Only 'Fichiers' type can be downloaded`);
    if(!file.fileData) throw new Error(`File ${tuuid} has missing metadata`);

    let filename = file.decryptedMetadata?.nom;
    if(!filename) throw new Error(`File name not provided for ${tuuid}`);

    let fileSize = video.taille_fichier;
    if(typeof(fileSize) !== 'number') throw new Error(`The size for video of file ${tuuid} was not provided.`);

    let visits = file.fileData.visites;
    if(!visits || Object.keys(visits).length === 0) throw new Error(`There are no known locations to download file tuuid ${tuuid}`);
    
    let fuuid = video.fuuid_video;
    if(!fuuid) throw new Error('File identifier (fuuid) not provided for video');

    // Prepare decryption information
    let secretKey = file.secretKey;
    if(!secretKey) throw new Error(`Decryption key for file tuuid ${tuuid} not found`);
    let format = video.format;
    if(!format) throw new Error(`Decryption format for video of ${tuuid} not found`);
    let nonceBase64 = video.nonce;
    if(!nonceBase64) throw new Error(`Decryption nonce for video of tuuid ${tuuid} not found`);
    let nonce = multiencoding.decodeBase64Nopad(nonceBase64);

    // Create download entry
    let entry = {
        fuuid, userId, tuuid,

        // Download information
        processDate: new Date().getTime(),
        state: DownloadStateEnum.INITIAL,
        position: 0,
        size: fileSize,
        visits,

        // Decryption information
        secretKey, format, nonce,
        
        // Content
        filename,
        mimetype: file.fileData.mimetype,
        content: null,
    } as DownloadIdbType;

    return entry;
}
