import { expose, Remote } from 'comlink';

import { Collections2FileSyncRow, DecryptedSecretKey } from './connection.worker';
import { AppsEncryptionWorker } from './encryption.worker';
import { FileData, TuuidDecryptedMetadata, TuuidsIdbStoreRowType } from '../collections2/idb/collections2StoreIdb';

export class DirectoryWorker {
    async processDirectoryChunk(encryption: Remote<AppsEncryptionWorker>, userId: string, files: Collections2FileSyncRow[], keys: DecryptedSecretKey[] | null) {
        console.debug("processDirectoryChunk\nFiles: %O\nKeys: %O", files, keys);

        // Map keys
        let keyByCleid = {} as {[cleId: string]: DecryptedSecretKey};
        if(keys) {
            for(let key of keys) {
                keyByCleid[key.cle_id] = key;
            }
        }

        // Map files to IDB format
        let mappedFiles = files.map(item=>{
            let parent = item.path_cuuids?item.path_cuuids[0]:userId;

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
                user_id: item.user_id,
                type_node: item.type_node,
                encryptedMetadata: item.metadata,
                parent,
                path_cuuids: item.path_cuuids,
                fileData,
                derniere_modification: item.derniere_modification,
            } as TuuidsIdbStoreRowType;

            return mappedFile
        });

        // Decrypt file metadata
        for(let file of mappedFiles) {
            let encrypted = file.encryptedMetadata;
            if(encrypted && encrypted.cle_id) {
                let key = keyByCleid[encrypted.cle_id]
                if(key) {
                    let format = encrypted.format || key.format;
                    let nonce = encrypted.nonce || key.nonce;
                    if(!format || !nonce) {
                        console.warn("No format/nonce for file %s - SKIPPING", file.tuuid);
                        continue;
                    }
                    let compression = encrypted.compression;

                    try {
                        let decryptedBytes = await encryption.decryptMessage(
                            format, 
                            key.cle_secrete_base64, 
                            nonce, 
                            encrypted.data_chiffre,
                            compression,
                        );
                        let decrypted = JSON.parse(new TextDecoder().decode(decryptedBytes)) as TuuidDecryptedMetadata;
                        console.debug("Decrypted metadata", decrypted);
                        file.decryptedMetadata = decrypted;
                    } catch (err) {
                        console.error("Error decrypting %s - SKIPPING", file.tuuid);
                    }
                }
            }
        }

        console.debug("Decrypted and mapped files: %O", mappedFiles);
    }
}

var worker = new DirectoryWorker();
expose(worker);
