import { ChangeEvent, Dispatch, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import useNotepadStore from "./notepadStore";
import { NotepadDocumentType, NotepadGroupData, NotepadGroupType, NotepadNewGroupType, syncDocuments } from "./idb/notepadStoreIdb";
import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import { DecryptionKeyIdb, getDecryptedKeys, saveDecryptedKey } from "../MillegrillesIdb";
import { multiencoding, messageStruct } from "millegrilles.cryptography";
import { EncryptionResult } from "../workers/encryption.worker";
import { sortCategories } from "./Categories";

function ViewGroupDocuments() {

    const params = useParams();

    let groupId = params.groupId as string;
    let [editGroup, setEditGroup] = useState(groupId === 'new');
    let [restoreDocuments, setRestoreDocuments] = useState(false);

    let openRestoreDocuments = useCallback(()=>setRestoreDocuments(true), [setRestoreDocuments]);
    let closeRestoreDocuments = useCallback(()=>setRestoreDocuments(false), [setRestoreDocuments]);

    let groups = useNotepadStore(state=>state.groups);

    let group = useMemo(()=>{
        if(!groups || !groupId) return null;
        let group = groups.filter(item=>item.groupe_id === groupId).pop();
        return group || null;
    }, [groups, groupId]);

    if(restoreDocuments && group) {
        return <RestoreDocuments group={group} close={closeRestoreDocuments} />
    } else if(editGroup) {
        return <GroupEdit group={group} edit={setEditGroup} />
    } else {
        return <ViewGroup group={group} edit={setEditGroup} restore={openRestoreDocuments} />
    };
}

export default ViewGroupDocuments;

type GroupProps = {
    group: NotepadGroupType | null,
    edit: Dispatch<boolean>,
    restore?: ()=>void,
}

function ViewGroup(props: GroupProps) {

    let { group, edit, restore } = props;

    let workers = useWorkers();
    let navigate = useNavigate();

    let openEdit = useCallback(()=>edit(true), [edit]);

    let deleteGroup = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!group) throw new Error('Group null');
        let groupId = group.groupe_id;
        workers.connection.notepadDeleteGroup(groupId)
            .then(response=>{
                if(response.ok) {
                    navigate('/apps/notepad');
                } else {
                    console.error("Error deleteing group", response.err);
                }
            })
            .catch(err=>console.error("Error deleting group", err));
    }, [workers, group, navigate]);

    if(!group) return <></>;  // Loading group

    return (
        <>
            <nav className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <Link to='/apps/notepad'
                     className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='text-lg font-bold pt-2 pb-4'>{group?.data?.nom_groupe}</h1>

            <section className='pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <Link to={`/apps/notepad/group/${group.groupe_id}/new`}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        New document
                </Link>
                <button onClick={openEdit}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-edit'/> Edit group
                </button>
                <button onClick={restore}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-recycle'/> Restore documents
                </button>
                <button onClick={deleteGroup}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-remove'/> Delete group
                </button>
            </section>

            <section className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 pl-2 gap-x-3 pr-4'>
                <DocumentList />
            </section>
        </>
    );

}

function DocumentList() {
    let groupDocuments = useNotepadStore(state=>state.groupDocuments);

    let listElements = useMemo(()=>{
        if(!groupDocuments) return [];

        let sortedGroupDocuments = [...groupDocuments];
        sortedGroupDocuments.sort(sortGroupDocuments);

        return sortedGroupDocuments.map(groupDoc=>{
            return (
                <Link key={groupDoc.doc_id} to={`/apps/notepad/group/${groupDoc.groupe_id}/${groupDoc.doc_id}`}
                    className='varbtn underline font-bold block w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 pt-1 pb-1 pl-2 pr-2'>
                        {groupDoc.label}
                </Link>
            );
        });
    }, [groupDocuments]);

    if(!groupDocuments) return (
        <p>Loading</p>
    );

    return (
        <>
            {listElements}
        </>
    )
}

function sortGroupDocuments(a: NotepadDocumentType, b: NotepadDocumentType, language?: string) {
    language = language || navigator.languages[0] || navigator.language;
    let labelA = (a.label || a.doc_id).toLocaleLowerCase();
    let labelB = (b.label || b.doc_id).toLocaleLowerCase();
    return labelA.localeCompare(labelB, language, {numeric: true, ignorePunctuation: true});
}

function GroupEdit(props: GroupProps) {

    let { group, edit } = props;

    let workers = useWorkers();

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let navigate = useNavigate();
    let params = useParams();
    let { groupId } = params;

    let newGroupFlag = useMemo(()=>groupId==='new', [groupId]);

    let [hasChanged, setHasChanged] = useState(false);
    let [categoryId, setCategoryId] = useState(group?.categorie_id || '');
    let [editedGroupData, setEditedGroupData] = useState(group?.data || {} as NotepadGroupData);

    let onChangeHtml = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let {name, value} = e.currentTarget;
        let updatedData = {...editedGroupData, [name]: value};
        setEditedGroupData(updatedData);

        // Check if new field or if field value has changed
        // @ts-ignore
        if(!editedGroupData[name] || editedGroupData[name] !== value) {
            setHasChanged(true);
        }
    }, [editedGroupData, setEditedGroupData, setHasChanged]);

    let categoryOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        setCategoryId(value);
        if(value) setHasChanged(true);
    }, [setCategoryId, setHasChanged]);

    let backHandler = useCallback(()=>{
        if(newGroupFlag) {
            navigate('/apps/notepad');
        } else {
            navigate(`/apps/notepad/group/${groupId}`);
        }
        edit(false);  // Close edit mode
    }, [navigate, groupId, edit, newGroupFlag]);

    let saveGroupHandler = useCallback(()=>{
        if(!categoryId) throw new Error("Category not selected");

        // @ts-ignore
        let keyId = group?(group.cle_id || group.ref_hachage_bytes):null;
        if(!keyId) throw new Error("Missing cle_id/ref_hachage_bytes from group");
        let commande = {
            categorie_id: categoryId,
        }

        // @ts-ignore
        if(!newGroupFlag) commande.groupe_id = groupId;

        Promise.resolve().then(async () => {
            if(!workers) throw new Error("Workers not initialized");
            if(!keyId) throw new Error("Missing keyId");
            
            let newKey = null as any;
            let key = null as DecryptionKeyIdb | null | undefined;
            if(!newGroupFlag) {
                let keys = await getDecryptedKeys([keyId]);
                key = keys.pop();
                if(!key) throw new Error("Unknown key");
            }

            let cleartextData = new TextEncoder().encode(JSON.stringify(editedGroupData));

            let encryptedData = null as EncryptionResult | null;
            if(key) {
                encryptedData = await workers.encryption.encryptMessageMgs4(cleartextData, key.cleSecrete);
            } else {
                encryptedData = await workers.encryption.encryptMessageMgs4(cleartextData);

                // Sign the new key command
                if(encryptedData.cle && encryptedData.keyId) {
                    keyId = encryptedData.keyId
                    newKey = await workers.connection.createRoutedMessage(
                        messageStruct.MessageKind.Command, encryptedData.cle, 
                        {domaine: 'MaitreDesCles', action: 'ajouterCleDomaines'}
                    );
                } else {
                    throw new Error("New key encryption is missing");
                }
            }

            let ciphertextBase64 = multiencoding.encodeBase64Nopad(encryptedData.ciphertext);

            let command = {
                categorie_id: categoryId,
                cle_id: keyId,
                format: encryptedData.format,
                nonce: multiencoding.encodeBase64Nopad(encryptedData.nonce),
                data_chiffre: ciphertextBase64,
            } as NotepadNewGroupType;

            if(!newGroupFlag) command.groupe_id = groupId;

            let result = await workers.connection.notepadSaveGroup(command, newKey);
            if(result.ok) {
                // Save the new decryption key locally
                if(encryptedData.cleSecrete) {
                    await saveDecryptedKey(command.cle_id, encryptedData.cleSecrete);
                }

                // @ts-ignore
                let responseGroupId = result.group_id as string;

                // Redirect to group page
                edit(false);
                navigate(`/apps/notepad/group/${responseGroupId}`);
            } else {
                console.error("Error saving document: ", result.err);
            }

        })
        .catch(err=>console.error("Error saving group", err));
        
    }, [workers, newGroupFlag, group, categoryId, editedGroupData, groupId, navigate, edit]);

    return (
        <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <button onClick={backHandler} className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    Back
                </button>
            </div>

            <section>
                <h1 className='font-bold text-lg'>Edit group</h1>
                <div className='grid grid-cols-2 pr-2'>
                    <label>Category</label>
                    <div>
                        <CategoryPicklist value={categoryId} onChange={categoryOnChange} readOnly={!newGroupFlag} />
                    </div>
                    <label htmlFor='nameInput'>Name</label>
                    <input id='nameInput' type='text' name='nom_groupe' value={editedGroupData.nom_groupe || ''} onChange={onChangeHtml} 
                        className='text-black'/>
                </div>
            </section>

            <div className='col-span-12 text-center pt-4'>
                <button onClick={saveGroupHandler} disabled={!ready || !hasChanged}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Save
                </button>
                <button onClick={backHandler}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </div>
        </>
    );
    
}

function CategoryPicklist(props: {value: string, onChange: (e: ChangeEvent<HTMLSelectElement>)=>void, readOnly?: boolean} ) {

    let { value, onChange, readOnly } = props;

    let categories = useNotepadStore(state=>state.categories);

    let categoriesOptions = useMemo(()=>{
        if(!categories) return [];

        let sortedCategories = [...categories];
        sortedCategories.sort(sortCategories);

        return sortedCategories.map(cat=>{
            return (
                <option key={cat.categorie_id} value={cat.categorie_id}>{cat.nom_categorie}</option>
            )
        })
    }, [categories]);

    let categorySpan = useMemo(()=>{
        if(!readOnly) return null;
        let cat = categories.filter(item=>item.categorie_id===value).pop();
        return <span>{cat?.nom_categorie}</span>
    }, [readOnly, categories, value])

    if(categorySpan) return categorySpan;

    return (
        <>
            <select className='text-black w-full' value={value} onChange={onChange}>
                <option>Select a category</option>
                {categoriesOptions}
            </select>
        </>
    );
}

function RestoreDocuments(props: {group: NotepadGroupType, close: ()=>void}) {

    let { group, close } = props;
    
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let categories = useNotepadStore(state=>state.categories);
    let updateDocument = useNotepadStore(state=>state.updateDocument);

    let [docs, setDocs] = useState(null as null | Array<NotepadDocumentType>);

    let [userId, setUserId] = useState('');

    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                let userId = certificate.extensions?.userId;
                setUserId(''+userId);
            })
            .catch(err=>console.error("Error loading userId", err));
    }, [workers, setUserId]);

    // Get the first field code (used for label).
    let firstField = useMemo(()=>{
        if(!categories || !group) return null;
        let category = categories.filter(item=>item.categorie_id===group.categorie_id).pop();

        let firstField = null;
        if(category) {
            firstField = category.champs[0].code_interne;
        }

        return firstField;
    }, [categories, group]);

    let restoreHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !docs) throw new Error("Workers/docs not initialized");
        let docId = e.currentTarget.value;
        let docToRestore = docs.filter(item=>item.doc_id===docId).pop();
        if(!docToRestore) throw new Error("Document to restore is null");

        workers.connection.notepadRestoreDocument(docId)
            .then(async response => {
                if(response.ok === false) throw new Error(response.err);

                if(docs) {
                    let updatedDocs = docs.filter(item=>item.doc_id!==docId);
                    setDocs(updatedDocs);
                }

                if(docToRestore && userId) {
                    // Save to IDB
                    await syncDocuments([docToRestore], {userId});
                    // Update on screen
                    updateDocument(docToRestore);
                }
            })
            .catch(err=>console.error("Error restoring document", err));

    }, [workers, docs, setDocs, updateDocument, userId]);

    useEffect(()=>{
        if(!ready || !workers || !firstField) return;
        getDeletedDocuments(workers, group, firstField) 
            .then(setDocs)
            .catch(err=>console.error("Error loading deleted documents", err));
    }, [workers, ready, group, setDocs, firstField])

    return (
        <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <button onClick={close} className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    Back
                </button>
            </div>

            <section>
                <h1 className='font-bold text-lg'>Restore documents</h1>
                <div className='grid grid-cols-1'>
                    <ListDeletedDocuments docs={docs} onRestore={restoreHandler} />
                </div>
            </section>
        </>
    )
}

async function getDeletedDocuments(workers: AppWorkers, group: NotepadGroupType, firstField: string): Promise<Array<NotepadDocumentType>> {
    let groupId = group.groupe_id;
    let keyId = group.cle_id || group.ref_hachage_bytes;

    if(!keyId) throw new Error("Missing cle_id/ref_hachage_bytes from group");

    let deletedDocumentsResponse = await workers.connection.getNotepadDocumentsForGroup(groupId, true);

    let deletedDocuments = deletedDocumentsResponse.documents;
    if(deletedDocumentsResponse.ok === false || !deletedDocuments) {
        throw new Error("Error getting deleted documents: " + deletedDocumentsResponse.err);
    }

    let key = (await getDecryptedKeys([keyId])).pop();
    if(!key) throw new Error("Unknown group key");

    for await (let doc of deletedDocuments) {
        let nonce = group.nonce;
        let legacyMode = false;
        if(!nonce && group.header) {
            nonce = group.header.slice(1);  // Remove multibase 'm' marker
            legacyMode = true;
        }
        if(!nonce) {
            console.warn("Missing group nonce/header");
            continue;
        }
        
        let ciphertext = doc.data_chiffre;
        if(legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker

        let cleartext = await workers.encryption.decryptMessage(doc.format, key.cleSecrete, nonce, ciphertext);
        let data = JSON.parse(new TextDecoder().decode(cleartext));
        doc.data = data;
        doc.label = data[firstField] || doc.doc_id;
        doc.decrypted = true;
    }

    return deletedDocuments;
}

function ListDeletedDocuments(props: {docs: Array<NotepadDocumentType> | null, onRestore: (e: MouseEvent<HTMLButtonElement>)=>void}) {

    let { docs, onRestore } = props;

    let docElems = useMemo(()=>{
        if(!docs) return null;

        let docsCopy = [...docs];
        docsCopy.sort(sortGroupDocuments);
        
        return docsCopy.map(item=>{
            return (
                <div key={item.doc_id}>
                    <button value={item.doc_id} onClick={onRestore}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Restore
                    </button>
                    <span className='pl-2'>{item.label}</span>
                </div>
            )
        });
    }, [docs, onRestore]);

    if(!docElems) {
        return <p>Loading ...</p>;
    }

    return <>{docElems}</>;
}
