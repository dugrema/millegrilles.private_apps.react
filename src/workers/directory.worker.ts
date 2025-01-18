import axios from 'axios';
import { expose, Remote } from 'comlink';
import { messageStruct, encryptionMgs4, multiencoding } from 'millegrilles.cryptography';

import { Collections2FileSyncRow, DecryptedSecretKey, Filehost } from './connection.worker';
import { AppsEncryptionWorker } from './encryption.worker';
import { FileData, TuuidDecryptedMetadata, TuuidsIdbStoreRowType, updateFilesIdb, loadDirectory, LoadDirectoryResultType, touchDirectorySync, deleteFiles } from '../collections2/idb/collections2StoreIdb';

type ProcessDirectoryChunkOptions = {
    noidb?: boolean,
    shared?: boolean,
};

type FilehostDirType = Filehost & {
    url?: URL | null,
    jwt?: string | null,
    authenticated?: boolean | null,
    lastPing?: number | null,
};

/**
 * Worker that handles browsing and file opening tasks.
 */
export class DirectoryWorker {
    filehosts: FilehostDirType[] | null;
    selectedFilehost: FilehostDirType | null;

    constructor() {
        this.filehosts = null;
        this.selectedFilehost = null;
    }

    async processDirectoryChunk(encryption: Remote<AppsEncryptionWorker>, userId: string, files: Collections2FileSyncRow[], 
        keys: DecryptedSecretKey[] | null, opts?: ProcessDirectoryChunkOptions): Promise<TuuidsIdbStoreRowType[]> 
    {
        // Map keys
        let keyByCleid = {} as {[cleId: string]: DecryptedSecretKey};
        if(keys) {
            for(let key of keys) {
                keyByCleid[key.cle_id] = key;
            }
        }

        // Map files to IDB format
        let mappedFiles = files.map(item=>{
            // Set the parent for the IDB directory index. When shared, set no parent if not in a path (do not index to root).
            let parent = item.path_cuuids?item.path_cuuids[0]:null;
            if(!opts?.shared) {
                parent = parent || userId;
            }

            let fileData = {
                fuuids_versions: item.fuuids_versions,
                mimetype: item.mimetype,
                supprime: item.supprime,
                supprime_indirect: item.supprime_indirect,
            } as FileData;

            let version = item.version_courante;
            if(version) {
                fileData.taille = version.taille;
                fileData.visites = version.visites;
                fileData.height = version.height;
                fileData.width = version.width;
                fileData.anime = version.anime;
                fileData.duration = version.duration;
                fileData.images = version.images;
                fileData.video = version.video;
                fileData.audio = version.audio;
                fileData.subtitles = version.subtitles;
            }

            let mappedFile = {
                tuuid: item.tuuid,
                // user_id: item.user_id,
                user_id: userId,  // Override user_id with provided user (e.g. for shared files)
                type_node: item.type_node,
                encryptedMetadata: item.metadata,
                secretKey: null,
                parent,
                path_cuuids: item.path_cuuids,
                fileData,
                thumbnailDownloaded: false,
                date_creation: item.date_creation,
                derniere_modification: item.derniere_modification,
            } as TuuidsIdbStoreRowType;

            return mappedFile
        });

        // Decrypt file metadata
        for(let file of mappedFiles) {
            let encrypted = file.encryptedMetadata;
            if(encrypted) {
                let keyId = encrypted.cle_id;
                let data_chiffre = encrypted.data_chiffre;

                // Legacy handling to get keyId
                let fuuids = file.fileData?.fuuids_versions;
                let fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
                //@ts-ignore
                let ref_hachage_bytes = encrypted.ref_hachage_bytes || fuuid as string | null;
                if(!keyId && (ref_hachage_bytes || fuuid)) {
                    keyId = ref_hachage_bytes;  // ref_hachage_bytes is the old format for cle_id
                    data_chiffre = data_chiffre.slice(1);  // Remove leading multibase 'm' marker
                }

                if(keyId) {
                    let key = keyByCleid[keyId]
                    if(key) {
                        let format = encrypted.format || key.format;
                        if(format !== 'mgs4') {
                            console.warn("Unsupported decryption format: %s - SKIPPING", format);
                            continue;
                        }

                        let nonce = encrypted.nonce || key.nonce;
                        let header = encrypted.header;
                        if(!nonce && header) {  // Legacy
                            nonce = header.slice(1);  // Remove multibase 'm' marker
                        }
                        if(!nonce) {
                            console.warn("No format/nonce for file %s - SKIPPING", file.tuuid);
                            continue;
                        }
                        let compression = encrypted.compression;

                        try {
                            let secretKeyBytes = multiencoding.decodeBase64(key.cle_secrete_base64);
                            let decryptedBytes = await encryption.decryptMessage(
                                format, 
                                secretKeyBytes, 
                                nonce, 
                                data_chiffre,
                                compression,
                            );
                            let decrypted = JSON.parse(new TextDecoder().decode(decryptedBytes)) as TuuidDecryptedMetadata;
                            file.decryptedMetadata = decrypted;
                            file.secretKey = secretKeyBytes;  // Keep the key to open, download files and images, rename, etc.
                        } catch (err) {
                            console.error("Error decrypting %s - SKIPPING", file.tuuid);
                        }
                    } else {
                        console.warn("File tuuid:%s, cleId:%s not provided", file.tuuid, keyId)
                    }
                } else {
                    console.warn("File tuuid:%s, cleId:%s is not available", file.tuuid, keyId);
                }
            }

            let thumbnail = file.fileData?.images?.thumb;
            if(thumbnail && thumbnail.cle_id && thumbnail.data_chiffre) {
                let key = keyByCleid[thumbnail.cle_id];
                if(key) {
                    let nonce = thumbnail.nonce || key.nonce;
                    let format = thumbnail.format || key.format;
                    if(nonce && format) {
                        let encryptedData = thumbnail.data_chiffre.slice(1);  // Remove multibase leading 'm'
                        let thumbnailBytes = await encryption.decryptMessage(
                            format, key.cle_secrete_base64, nonce, encryptedData, thumbnail.compression);
                        let thumbnailBlob = new Blob([thumbnailBytes]);
                        file.thumbnail = thumbnailBlob;
                    }
                }
            }
        }

        if(!opts?.noidb) {
            await updateFilesIdb(mappedFiles);
        }

        return mappedFiles;
    }

    async loadDirectory(userId: string, tuuid: string | null): Promise<LoadDirectoryResultType> {
        let result = await loadDirectory(userId, tuuid);
        return result;
    }

    async touchDirectorySync(tuuid: string, lastCompleteSyncSec: number) {
        await touchDirectorySync(tuuid, lastCompleteSyncSec);
    }

    async deleteFiles(tuuids: string[]) {
        await deleteFiles(tuuids);
    }

    async setFilehostList(filehosts: Filehost[]) {
        this.filehosts = filehosts;
    }

    async selectFilehost(localUrl: string) {
        // Check if the local filehost is available first
        try {
            await axios({url: localUrl + 'filehost/status'})
            // console.debug("Local filehost is available, using by default");

            let url = new URL(localUrl + 'filehost');
            let localFilehost = {filehost_id: 'LOCAL', url} as FilehostDirType;
            this.selectedFilehost = localFilehost;

            return;
        } catch(err: any) {
            if(err.status) {
                console.info("Local /filehost is not available: ", err.status);
            } else {
                throw err;
            }
        }

        if(!this.filehosts || this.filehosts.length === 0) throw new Error('No filehosts are available');
        if(this.filehosts.length === 1) {
            // Only one filehost, select and test
            let filehost = this.filehosts[0];
            // console.debug("Selecting the only filehost available: ", filehost);

            // Extract url
            if(filehost.url_external && filehost.tls_external !== 'millegrille') {
                let url = new URL(filehost.url_external);
                if(url.pathname.endsWith('filehost')) {
                    url.pathname += 'filehost';
                }
            } else {
                throw new Error('The only available filehost has no means of accessing it from a browser');
            }

            this.selectedFilehost = filehost;
            return;
        }

        // Find a suitable filehost from the list. Ping the status of each to get an idea of the connection speed.
        //let performance = {} as {[filehostId: string]: number};
        throw new Error('todo - select filehost from list');
    }

    async authenticateFilehost(authenticationMessage: messageStruct.MilleGrillesMessage) {
        let filehost = this.selectedFilehost;
        if(!filehost) throw new Error('No filehost has been selected');
        let url = filehost.url;
        if(!url) throw new Error('No URL is available for the selected filehost');

        // console.debug("Log into filehost ", filehost);

        let authUrl = new URL(url + '/authenticate')
        // authUrl.pathname = authUrl.pathname.replaceAll('//', '/');

        // console.debug('Authenticate url: %s, Signed message: %O', authUrl.href, authenticationMessage);
        try {
            let response = await axios({
                method: 'POST',
                url: authUrl.href,
                data: authenticationMessage,
                withCredentials: true,
            });

            // console.debug("Authentication response: ", response)
            if(!response.data.ok) {
                throw new Error("Authentication error");
            }

            filehost.authenticated = true;
        } catch(err) {
            filehost.authenticated = false;
            filehost.jwt = null;
            throw err;
        }
    }

    /**
     * 
     * @param fuuid File unique identifier
     * @param secretKey Secret key used to decrypt the file
     * @param decryptionInformation Decryption information (nonce, format, etc.)
     */
    async openFile(fuuid: string, secretKey: Uint8Array, decryptionInformation: messageStruct.MessageDecryption): Promise<Blob> {
        let filehost = this.selectedFilehost;
        if(!filehost) throw new Error('No filehost is available');
        if(!filehost.authenticated) throw new Error('Connection to filehost not authenticated');
        let url = filehost.url;
        if(!url) throw new Error('No URL is available for the selected filehost');
        if(decryptionInformation.format !== 'mgs4') throw new Error('Unsupported encryption format: ' + decryptionInformation.format);
        if(!decryptionInformation.nonce) throw new Error('Nonce missing');

        let fileUrl = new URL(url + '/files/' + fuuid);
        let response = await axios({method: 'GET', url: fileUrl.href, responseType: 'blob'})

        let encryptedBlob = response.data as Blob;
        
        // Decrypt file
        let nonce = multiencoding.decodeBase64(decryptionInformation.nonce);
        let decipher = await encryptionMgs4.getMgs4Decipher(secretKey, nonce);

        // @ts-ignore
        let readableStream = encryptedBlob.stream() as ReadableStream;
        let reader = readableStream.getReader();
        let blobs = [] as Blob[];  // Save all chunks in blobs, they will get concatenated at finalize.
        while(true) {
            let {done, value} = await reader.read();
            if(done) break;
            if(value && value.length > 0) {
                let output = await decipher.update(value);
                if(output && output.length > 0) {
                    let blob = new Blob([output]);
                    blobs.push(blob);
                }
            }
        }

        let finalOutput = await decipher.finalize();
        let outputBlob = null as Blob | null;
        if(finalOutput && finalOutput.length > 0) {
            outputBlob = new Blob([...blobs, finalOutput]);
        } else {
            outputBlob = new Blob(blobs);
        }

        return outputBlob;
    }
}

var worker = new DirectoryWorker();
expose(worker);
