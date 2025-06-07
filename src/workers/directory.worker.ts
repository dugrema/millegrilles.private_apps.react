import axios from 'axios';
import { expose, Remote } from 'comlink';
import { messageStruct, encryptionMgs4, multiencoding } from 'millegrilles.cryptography';

import { Collections2FileSyncRow, DecryptedSecretKey, Filehost } from './connection.worker';
import { AppsEncryptionWorker } from './encryption';
import { FileData, TuuidDecryptedMetadata, TuuidsIdbStoreRowType, updateFilesIdb, loadDirectory, LoadDirectoryResultType, touchDirectorySync, deleteFiles } from '../collections2/idb/collections2StoreIdb';

type ProcessDirectoryChunkOptions = {
    noidb?: boolean,
    shared?: boolean,
};

export type FilehostDirType = Filehost & {
    url?: string | null,
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

    async getSelectedFilehost(): Promise<FilehostDirType | null> {
        return this.selectedFilehost;
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

        let deletedFiles = new Set();

        // Map files to IDB format
        let mappedFiles = files.map(item=>{
            // Set the parent for the IDB directory index. When shared, set no parent if not in a path (do not index to root).
            let parent = item.path_cuuids?item.path_cuuids[0]:null;
            if(!opts?.shared) {
                parent = parent || userId;
            }

            if(item.supprime || item.supprime_indirect) deletedFiles.add(item.tuuid);

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
                fileData.nonce = version.nonce;
                fileData.format = version.format;
            }

            let mappedFile = {
                tuuid: item.tuuid,
                // user_id: item.user_id,
                user_id: userId,  // Override user_id with provided user (e.g. for shared files)
                ownerUserId: userId!==item.user_id?item.user_id:undefined,  // Keep owner user_id for shared files
                type_node: item.type_node,
                encryptedMetadata: item.metadata,
                secretKey: null,
                keyId: null,
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
    
            // Legacy handling to get keyId
            let fuuids = file.fileData?.fuuids_versions;
            let fuuid = (fuuids&&fuuids.length>0)?fuuids[0]:null;
    
            if(encrypted) {
                let keyId = encrypted.cle_id;
                let data_chiffre = encrypted.data_chiffre;

                //@ts-ignore
                let ref_hachage_bytes = encrypted.ref_hachage_bytes || fuuid as string | null;
                if(!keyId && ref_hachage_bytes) {
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

                        let nonce = encrypted.nonce;
                        if(!nonce && encrypted.header) {  // Legacy
                            nonce = encrypted.header.slice(1);  // Remove multibase 'm' marker
                        }
                        if(!nonce) {
                            console.warn("No format/nonce for metadata of file %s - SKIPPING", file.tuuid);
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
                            // Keep the key to open, download files and images, rename, etc.
                            file.secretKey = secretKeyBytes;
                            file.keyId = keyId;
                        } catch (err) {
                            console.error("Error decrypting %s - SKIPPING. Err:\n%O", file.tuuid, err);
                        }

                        if(file.fileData && key.nonce) {
                            // Legacy - transfer the header/nonce from the key to the fileData structure when present
                            file.fileData.nonce = key.nonce;
                            file.fileData.format = key.format;
                        }

                    } else {
                        console.warn("File tuuid:%s, cleId:%s not provided", file.tuuid, keyId)
                    }
                } else {
                    console.warn("File tuuid:%s, cleId:%s is not available", file.tuuid, keyId);
                }
            }

            try {
                let thumbnail = file.fileData?.images?.thumb;
                if(thumbnail) {
                    let keyId = thumbnail.cle_id;
                    // Legacy handling
                    if(!keyId && fuuid) {
                        keyId = fuuid;
                    }

                    if(keyId && thumbnail.data_chiffre) {
                        let key = keyByCleid[keyId];
                        if(key) {
                            let format = thumbnail.format || key.format;
                            if(format === 'mgs4') {
                                let nonce = thumbnail.nonce;
                                if(!nonce && thumbnail.header) {
                                    nonce = thumbnail.header.slice(1);  // Remove multibase 'm' marker
                                }
                                if(nonce) {
                                    let encryptedData = thumbnail.data_chiffre.slice(1);  // Remove multibase leading 'm'
                                    let thumbnailBytes = await encryption.decryptMessage(
                                        format, key.cle_secrete_base64, nonce, encryptedData, thumbnail.compression);
                                    file.thumbnail = thumbnailBytes;
                                }
                            } else {
                                console.warn("Unsupported encryption format for thumbnail (%s)", format);
                            }
                        } else {
                            console.warn("Key not provided to decrypt thumbnail for tuuid: %s", file.tuuid);
                        }
                    } else {
                        console.warn("No key available to decrypt thumbnail for tuuid: %s", file.tuuid);
                    }
                }
            } catch(err) {
                console.error("Error decrypting thumbnail for tuuid %s: ", file.tuuid, err);
            }
        }

        if(!opts?.noidb) {
            let nonDeletedFiles = mappedFiles.filter(item=>!deletedFiles.has(item.tuuid));
            await updateFilesIdb(nonDeletedFiles);
        }

        return mappedFiles;
    }

    async loadDirectory(userId: string, tuuid: string | null): Promise<LoadDirectoryResultType> {
        let result = await loadDirectory(userId, tuuid);
        return result;
    }

    async touchDirectorySync(tuuid: string, userId: string, lastCompleteSyncSec: number) {
        await touchDirectorySync(tuuid, userId, lastCompleteSyncSec);
    }

    async deleteFiles(tuuids: string[], userId: string) {
        await deleteFiles(tuuids, userId);
    }

    async setFilehostList(filehosts: Filehost[]) {
        this.filehosts = filehosts;
    }

    async selectLocalFilehost(localUrl: string) {
        try {
            await axios({url: localUrl + 'filehost/status'})
            // console.debug("Local filehost is available, using by default");

            let url = new URL(localUrl + 'filehost');
            let localFilehost = {filehost_id: 'LOCAL', url: url.href} as FilehostDirType;
            this.selectedFilehost = localFilehost;
            return;
        } catch(err: any) {
            if(err.status) {
                throw new Error(`Local /filehost is not available: ${err.status}`)
            } else {
                throw err;
            }
        }
    }

    async selectFilehost(localUrl: string, filehostId: string | null) {
        // Check if the local filehost is available first
        if(!this.filehosts || this.filehosts.length === 0) {
            await this.selectLocalFilehost(localUrl);
            return;  // Successful
        }

        if(this.filehosts.length === 1) {
            // Only one filehost, select and test
            let filehost = this.filehosts[0];
            // console.debug("Selecting the only filehost available: ", filehost);

            // Extract url
            if(filehost.url_external && filehost.tls_external !== 'millegrille') {
                let url = new URL(filehost.url_external);
                if(!url.pathname.endsWith('filehost')) {
                    url.pathname += 'filehost';
                }
                filehost.url = url.href;
            } else {
                throw new Error('The only available filehost has no means of accessing it from a browser');
            }

            this.selectedFilehost = filehost;
            return;
        } else if(filehostId) {
            // Try to pick the manually chosen filehost
            let filehost = this.filehosts.filter(item=>item.filehost_id === filehostId).pop();
            if(filehost) {
                // Extract url
                if(filehost.url_external && filehost.tls_external !== 'millegrille') {
                    let url = new URL(filehost.url_external);
                    if(!url.pathname.endsWith('filehost')) {
                        url.pathname += 'filehost';
                    }
                    filehost.url = url.href;
                } else {
                    throw new Error('The only available filehost has no means of accessing it from a browser');
                }

                // console.debug("Using manually chosen filehost ", filehost);
                this.selectedFilehost = filehost;
                return;
            }
        }

        // Default to local
        await this.selectLocalFilehost(localUrl);

        // Find a suitable filehost from the list. Ping the status of each to get an idea of the connection speed.
        //let performance = {} as {[filehostId: string]: number};
        //TODO
    }

    async authenticateFilehost(authenticationMessage: messageStruct.MilleGrillesMessage) {
        let filehost = this.selectedFilehost;
        if(!filehost) throw new Error('No filehost has been selected');
        let urlString = filehost.url;
        if(!urlString) throw new Error('No URL is available for the selected filehost');
        let url = new URL(urlString);

        // console.debug("Log into filehost ", filehost);
        let authUrl = new URL(`https://${url.hostname}:${url.port}/filehost/authenticate`);

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
                console.error("Authentication data response: ", response.data);
                throw new Error("Authentication error: " + response.data.err);
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
    async openFile(fuuid: string, secretKey: Uint8Array, decryptionInformation: messageStruct.MessageDecryption, mimetype?: string | null): Promise<Blob> {
        let filehost = this.selectedFilehost;
        if(!filehost) throw new Error('No filehost is available');
        if(!filehost.authenticated) throw new Error('Connection to filehost not authenticated');
        let url = filehost.url;
        if(!url) throw new Error('No URL is available for the selected filehost');
        if(decryptionInformation.format !== 'mgs4') throw new Error('Unsupported encryption format: ' + decryptionInformation.format);
        if(!decryptionInformation.nonce) throw new Error('Nonce missing');

        let fileUrl = new URL(url + '/files/' + fuuid);
        let response = await axios({method: 'GET', url: fileUrl.href, responseType: 'blob', withCredentials: true});

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
                    const blob = new Blob([output]);
                    blobs.push(blob);
                }
            }
        }

        let finalOutput = await decipher.finalize();
        let outputBlob = null as Blob | null;
        if(finalOutput && finalOutput.length > 0) {
            outputBlob = new Blob([...blobs, finalOutput], {type: mimetype || undefined});
        } else {
            outputBlob = new Blob(blobs, {type: mimetype || undefined});
        }

        return outputBlob;
    }

    async testFileSystem1(): Promise<string> {
        // @ts-ignore
        let syncHandle = null as FileSystemSyncAccessHandle | null;
        let result = '';
        try {
            console.debug("Getting root directory");
            let root = await navigator.storage.getDirectory();
            console.debug("Root direnctory", root);
            let test1Directory = await root.getDirectoryHandle('test1', {create: true});
            console.debug('Directory 1: ', test1Directory);
            // @ts-ignore
            for await(let [key, value] of test1Directory.entries())  {
                console.debug("Directory1 entries: name:%s, value:%O", key, value);
            }
            let fileHandle = await test1Directory.getFileHandle('cfile.bin', {create: true});
            let file = await fileHandle.getFile();
            let fileSize = file.size;
            // @ts-ignore
            syncHandle = await fileHandle.createSyncAccessHandle();
            if(fileSize > 0) {
                let buffer = new Uint8Array(fileSize);  // new DataView(new ArrayBuffer(syncHandle.getSize()));;
                try {
                    let readBytes = syncHandle.read(buffer, {at: 0});
                    console.debug("Bytes read: ", readBytes);
                    result = new TextDecoder().decode(buffer);
                    console.debug("Content of file: ", result);
                } catch(err) {
                    console.error("Error reading from file handle");
                }
            }

            let bytesWritten = syncHandle.write(new TextEncoder().encode('tada'), {at: 0});
            syncHandle.truncate(bytesWritten);
            console.debug("Bytes written", bytesWritten);

        } catch(err) {
            return `Error: ${err}`;
        } finally {
            syncHandle?.flush();
            syncHandle?.close();
        }

        return result;
    }
}

var worker = new DirectoryWorker();
expose(worker);
