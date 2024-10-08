import { useEffect, useMemo, useState } from 'react';
import { proxy } from 'comlink';

import { decryptGroups, deleteGroup, getMissingKeys, getUserCategories, getUserGroups, NotepadCategoryType, NotepadGroupType, openDB, syncCategories, syncGroups } from './idb/notepadStoreIdb';

import useWorkers, { AppWorkers } from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { saveDecryptedKey } from '../MillegrillesIdb';
import useNotepadStore from './notepadStore';
import { SubscriptionMessage } from 'millegrilles.reactdeps.typescript';

let promiseIdb: Promise<void> | null = null;

type MessageUpdateCategoryGroup = {
    groupe_id?: string,
    supprime?: boolean,
    category?: NotepadCategoryType | null,
    group?: NotepadGroupType | null,
}

export default function SyncUserProfile() {

    useEffect(()=>{
        if(!promiseIdb) {
            promiseIdb = init()
                .catch(err=>{
                    console.error("Error initializing Notepad IDB ", err);
                    throw err
                });
            return;
        }
    }, []);

    // Throw to prevent screen from rendering. Caught in <React.Suspense> (index.tsx).
    if(promiseIdb) throw promiseIdb;

    return (
        <>
            <ListenCategoryGroupChanges />
        </>
    );
}

async function init() {
    // Initialize/upgrade the database
    await openDB(true);

    // Remove promise value, will allow screen to render
    promiseIdb = null;
}

/** Syncs categories and groups on initial page load. */
async function syncCategoriesGroups(workers: AppWorkers, setCategories: (categories: Array<NotepadCategoryType>) => void, setGroups: (groups: Array<NotepadGroupType>) => void) {

    // Get userId from user certificate.
    let certificate = await workers.connection.getMessageFactoryCertificate();
    let userId = certificate.extensions?.userId;
    if(!userId) throw new Error("UserId missing from connection certificate");

    try {
        // Sync categories
        let categoryResponse = await workers.connection.getNotepadUserCategories();
        if(categoryResponse.categories) {
            await syncCategories(categoryResponse.categories);
        } else {
            console.error("Error sync categories: ", categoryResponse.err);
        }
        
        // Sync groups
        let groupResponse = await workers.connection.getNotepadUserGroups();
        if(groupResponse.groupes) {
            let supprimes = groupResponse.supprimes;
            await syncGroups(groupResponse.groupes, {userId, supprimes});
        } else {
            console.error("Error sync groups: ", groupResponse.err);
        }
        
        // Check what keys are missing to decrypt the groups.
        let requiredKeyIds = await getMissingKeys(userId);
        if(requiredKeyIds.length > 0) {
            // Get missing group decryption keys
            let keyResponse = await workers.connection.getGroupKeys(requiredKeyIds);
            if(keyResponse.ok !== false) {
                for await (let key of keyResponse.cles) {
                    await saveDecryptedKey(key.cle_id, key.cle_secrete_base64);
                }
            } else {
                throw new Error('Error recovering group decryption keys: ' + keyResponse.err);
            }
        }

        await decryptGroups(workers, userId);

    } finally {
        // Always load from database
        let categoriesIdb = await getUserCategories(userId);
        let groupsIdb = await getUserGroups(userId, true);
        setCategories(categoriesIdb);
        setGroups(groupsIdb);
    }

}

/** Listens and updates categories and groups on change. */
function ListenCategoryGroupChanges() {

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let workers = useWorkers();
    let setCategories = useNotepadStore(state=>state.setCategories);
    let setGroups = useNotepadStore(state=>state.setGroups);
    let setSyncDone = useNotepadStore(state=>state.setSyncDone);

    let updateCategory = useNotepadStore(state=>state.updateCategory);

    let [userId, setUserId] = useState('');

    useEffect(()=>{
        if(!workers || !ready) return;

        // Get userId from user certificate.
        workers.connection.getMessageFactoryCertificate()
            .then(async certificate => {
                let userId = certificate.extensions?.userId;
                if(!userId) throw new Error("UserId missing from connection certificate");
                setUserId(userId);
            })
            .catch(err=>console.error("Error loading userId", err));

        // Cleanup
        return () => setUserId('');
    }, [workers, ready, setUserId]);

    let categoryGroupEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            let message = event.message as MessageUpdateCategoryGroup;
            if(message) {
                let {group, category, groupe_id, supprime} = message;
                if(group) {
                    // Save/update group, fetch key and decrypt.
                    syncGroups([group], {userId})
                        .then(async ()=>{
                            if(!workers) throw new Error("Workers not initialized");
                            if(!group) throw new Error("Illegal state, group null");

                            // Check if the key exists locally
                            let keyId = group.cle_id || group.ref_hachage_bytes;
                            if(!keyId) throw new Error("Missing cle_id/ref_hachage_bytes");
                            let requiredKeyIds = await getMissingKeys(userId);
                            if(requiredKeyIds.includes(keyId)) {
                                // Fetch missing group key
                                let keyResponse = await workers.connection.getGroupKeys([keyId]);
                                if(keyResponse.ok !== false) {
                                    for await (let key of keyResponse.cles) {
                                        await saveDecryptedKey(key.cle_id, key.cle_secrete_base64);
                                    }
                                } else {
                                    throw new Error('Error recovering group decryption keys: ' + keyResponse.err);
                                }
                            }

                            await decryptGroups(workers, userId);

                            // Recover all groups (decrypted) from IDB, and set new list.
                            let updatedGroups = await getUserGroups(userId, true);
                            setGroups(updatedGroups);
                        })
                        .catch(err=>console.error("Error saving group event", err));
                }
                if(category) {
                    // Save/update category
                    syncCategories([category], {userId})
                        .then(()=>{
                            if(!category) throw new Error("Illegal state, category is null");
                            updateCategory(category)
                        })
                        .catch(err=>console.error("Error saving category event", err));
                }
                if(supprime !== undefined) {
                    if(groupe_id) {
                        // Delete the group
                        if(supprime) {
                            deleteGroup(groupe_id)
                                .then(async () => {
                                    let updatedGroups = await getUserGroups(userId, true);
                                    setGroups(updatedGroups);
                                })
                                .catch(err=>console.error("Error deleting group", err));
                        } else {
                            // Group is restored, sync groups
                            workers?.connection.getNotepadUserGroups()
                                .then(async groupResponse=>{
                                    if(workers && groupResponse.groupes) {
                                        await syncGroups(groupResponse.groupes, {userId});
                                        await decryptGroups(workers, userId);
                                        let updatedGroups = await getUserGroups(userId, true);
                                        setGroups(updatedGroups);
                                    } else {
                                        console.error("Error sync groups: ", groupResponse.err);
                                    }
                                })
                        }
                    }
                }
            }
        })
    }, [workers, userId, updateCategory, setGroups]);

    useEffect(()=>{
        if(!workers || !ready) return;  // Note ready to sync

        // Subscribe to changes on categories and groups
        workers.connection.subscribeUserCategoryGroup(categoryGroupEventCb)
            .catch(err=>console.error("Error subscribing to category/group events", err));


        // Sync categories and groups for the user. Save in IDB.
        syncCategoriesGroups(workers, setCategories, setGroups)
            .then(()=>{
                setSyncDone();
            })
            .catch(err=>console.error("Error during notepad sync", err));

        return () => {
            // Remove listener for document changes on group
            if(workers) {
                workers.connection.unsubscribeUserCategoryGroup(categoryGroupEventCb)
                    .catch(err=>console.error("Error unsubscribing from category/group events", err));
            }
        };

    }, [workers, ready, setCategories, setGroups, setSyncDone, categoryGroupEventCb])

    return <></>;
}
