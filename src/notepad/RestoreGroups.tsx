import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useWorkers, { AppWorkers } from "../workers/workers";
import { NotepadGroupData, NotepadGroupType } from "./idb/notepadStoreIdb";
import { multiencoding } from "millegrilles.cryptography";
import { sortGroups } from "./GroupPicklist";
import useConnectionStore from "../connectionStore";
import { saveDecryptedKey } from "../MillegrillesIdb";

function RestoreGroups() {

    return (
        <>
            <nav className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <Link to='/apps/notepad'
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-arrow-left'/> Back
                </Link>
            </nav>

            <section>
                <h1 className='font-bold text-lg pt-2 pb-4'>Restore groups</h1>
                <DeletedGroups />
            </section>

        </>
    );
}

export default RestoreGroups;

function DeletedGroups() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [groups, setGroups] = useState(null as null | Array<NotepadGroupType>);
    let [keys, setKeys] = useState(null as null | {[key: string]: string});

    let restoreHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers) throw new Error("Workers not initialized");
        let groupId = e.currentTarget.value;
        workers.connection.notepadRestoreGroup(groupId)
            .then(async response => {
                if(response.ok) {
                    // Ensure the group key is saved
                    let group = groups?.filter(item=>item.groupe_id === groupId).pop();
                    let keyId = group?.cle_id;
                    let key = (keys && keyId)?keys[keyId]:null;
                    if(key && keyId) {
                        saveDecryptedKey(keyId, key).catch(err=>console.warn("Error saving group key", err));
                    }
                    // Update the screen by removing the group that was restored
                    if(groups) {
                        let updatedGroups = groups.filter(item=>item.groupe_id !== groupId);
                        setGroups(updatedGroups);
                    }
                } else {
                    console.error("Error (1) restoring group: ", response.err);
                }
            })
            .catch(err=>console.error("Error (2) restoring group: ", err));
    }, [workers, groups, keys, setGroups]);

    useEffect(()=>{
        if(!ready || !workers) return;
        loadDeletedGroups(workers)
            .then(groupKeys=>{
                setGroups(groupKeys[0]);
                setKeys(groupKeys[1]);
            })
            .catch(err=>console.error("Error loading deleted groups", err));
    }, [workers, ready, setGroups]);

    return (
        <div className='grid grid-cols-1'>
            {groups?
                <ListDeletedGroups value={groups} onRestore={restoreHandler} />
            :
                <p>Loading deleted groups ...</p>
            }
        </div>
    )
}

function ListDeletedGroups(props: {value: Array<NotepadGroupType>, onRestore: (e: MouseEvent<HTMLButtonElement>)=>void}) {
    let { value, onRestore } = props;

    let groupElems = useMemo(()=>{
        return value.map(item=>{
            return (
                <div key={item.groupe_id}>
                    <button value={item.groupe_id} onClick={onRestore}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            <i className='fa fa-recycle'/> Restore
                    </button>
                    <span>{item.data?.nom_groupe}</span>
                </div>
            )
        })
    }, [value, onRestore]);

    return <>{groupElems}</>
}

async function loadDeletedGroups(workers: AppWorkers): Promise<[Array<NotepadGroupType>, {[key: string]: string}]> {

    let response = await workers.connection.getNotepadUserGroups(true);
    if(response.ok === false) throw new Error(response.err);

    // Recover decryption keys
    let groups = response.groupes;
    let groupIds = groups
        .map(item=>item.cle_id || item.ref_hachage_bytes)
        .filter(item=>item) as string[];
    let keyResponse = await workers.connection.getGroupKeys(groupIds);
    if(keyResponse.ok === false) throw new Error(keyResponse.err);

    // Map keys to their keyId
    let keyDict = {} as {[key: string]: string};
    for(let key of keyResponse.cles) {
        keyDict[key.cle_id] = key.cle_secrete_base64
    }

    // Decrypt each group's data
    for await (let group of groups) {
        let keyId = group.cle_id || group.ref_hachage_bytes;
        if(!keyId) {
            console.warn("Missing group cle_id/ref_hachage_bytes");
            continue;
        }
        let key = keyDict[keyId];
        if(!key) {
            console.warn("Decryption key not available for groupId ", group.groupe_id);
            continue;
        }
        let secretKey = multiencoding.decodeBase64Nopad(key);

        let nonce = group.nonce;
        if(!nonce && group.header) nonce = group.header.slice(1);  // Remove multibase 'm' marker
        if(!nonce) {
            console.warn("Missing group nonce/header");
            continue;
        }

        let cleartext = await workers.encryption.decryptMessage(group.format, secretKey, nonce, group.data_chiffre);
        let jsonInfo = JSON.parse(new TextDecoder().decode(cleartext)) as NotepadGroupData;
        group.data = jsonInfo;
        group.decrypted = true;
    }

    groups.sort(sortGroups);

    return [groups, keyDict];
}
