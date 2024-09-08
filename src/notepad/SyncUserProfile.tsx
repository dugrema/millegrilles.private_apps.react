import { useEffect } from 'react';
import { decryptGroups, getMissingKeys, openDB, syncCategories, syncGroups } from './idb/notepadStoreIdb';
import useWorkers, { AppWorkers } from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { saveDecryptedKey } from '../MillegrillesIdb';

let promiseIdb: Promise<void> | null = null;

export default function SyncUserProfile() {

    let workers = useWorkers();

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
async function syncCategoriesGroups(workers: AppWorkers) {

    // Get userId from user certificate.
    let certificate = workers.connection.getMessageFactoryCertificate();
    let userId = (await certificate).extensions?.userId;
    if(!userId) throw new Error("UserId missing from connection certificate");

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
        await syncGroups(groupResponse.groupes, {userId});
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
}

/** Listens and updates categories and groups on change. */
function ListenCategoryGroupChanges() {

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let workers = useWorkers();

    useEffect(()=>{
        if(!workers || !ready) return;  // Note ready to sync

        // Subscribe to changes on categories and groups


        // Sync categories and groups for the user. Save in IDB.
        syncCategoriesGroups(workers)
            .then(()=>{
                console.debug("Notepad sync of categories/groups complete");
            })
            .catch(err=>console.error("Error during notepad sync", err));

        return () => {
            // Remove listener on categories and groups
        };

    }, [workers, ready])

    return <></>;
}
