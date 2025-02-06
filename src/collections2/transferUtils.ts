import { keymaster, messageStruct, multiencoding, x25519 } from "millegrilles.cryptography";
import { addUploadFile, DownloadIdbType, DownloadStateEnum, FileVideoData, loadTuuid } from "./idb/collections2StoreIdb";
import { AppWorkers } from "../workers/workers";

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
        retry: 0,

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
        retry: 0,

        // Decryption information
        secretKey, format, nonce,
        
        // Content
        filename,
        mimetype: file.fileData.mimetype,
        content: null,
    } as DownloadIdbType;

    return entry;
}

// const generateStream = async (): Promise<AsyncIterable<string>> => {
//     const response = await fetch(
//       'http://localhost:5000/api/stream/dummy?chunks_amount=50',
//       {
//         method: 'GET',
//       }
//     )
//     if (response.status !== 200) throw new Error(response.status.toString())
//     if (!response.body) throw new Error('Response body does not exist')
//     return getIterableStream(response.body)
// }

// https://stackoverflow.com/questions/51859873/using-axios-to-return-stream-from-express-app-the-provided-value-stream-is/77107457#77107457
export async function* getIterableStream(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
    const reader = body.getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        yield value;
    }
}

export function downloadFile(filename: string, content: Blob) {
    // File received already, download it now.
    // console.debug("Download handler, content received ", content);
    // const filename = file.decryptedMetadata?.nom || `${file.tuuid}.obj`;
    let objectUrl = window.URL.createObjectURL(content);
    let a = document.createElement('a');
    a.href = objectUrl;
    if (filename) a.download = filename;
    a.target = '_blank';
    a.click();
    URL.revokeObjectURL(objectUrl);
}

export async function generateFileUploads(workers: AppWorkers, userId: string, cuuid: string, files: FileList, breadcrumb?: string) {
    for await (let file of files) {
        // Generate new key using the master key.
        let secret = await workers.encryption.generateSecretKey(['GrosFichiers']);
        let encryptedKeys = await workers.encryption.encryptSecretKey(secret.secret);

        // Generate key command
        let keyCommand = {
            signature: secret.signature,
            cles: encryptedKeys,
        };

        let keyCommandSigned = await workers.connection.createRoutedMessage(
            messageStruct.MessageKind.Command, keyCommand, {domaine: 'MaitreDesCles', action: 'ajouterCleDomaines'});
        console.debug("Key command signed", keyCommandSigned);

        let uploadId = await addUploadFile(userId, cuuid, file, {secret, keyCommand: keyCommandSigned, destinationPath: breadcrumb});
        await workers.upload.addUpload(uploadId, file);
    }
}
