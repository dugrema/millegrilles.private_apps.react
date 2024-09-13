import { ChangeEvent, Dispatch, useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import useNotepadStore from "./notepadStore";
import { NotepadDocumentType, NotepadGroupData, NotepadGroupType, NotepadNewGroupType } from "./idb/notepadStoreIdb";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { DecryptionKeyIdb, getDecryptedKeys } from "../MillegrillesIdb";
import { multiencoding, messageStruct } from "millegrilles.cryptography";
import { EncryptionResult } from "../workers/encryption.worker";
import { sortCategories } from "./Categories";

function ViewGroupDocuments() {

    const params = useParams();

    let groupId = params.groupId as string;
    let [editGroup, setEditGroup] = useState(groupId === 'new');

    let groups = useNotepadStore(state=>state.groups);

    let group = useMemo(()=>{
        if(!groups || !groupId) return null;
        let group = groups.filter(item=>item.groupe_id === groupId).pop();
        return group || null;
    }, [groups, groupId]);

    if(editGroup) {
        return <GroupEdit group={group} edit={setEditGroup} />
    } else {
        return <ViewGroup group={group} edit={setEditGroup} />
    };
}

export default ViewGroupDocuments;

type GroupProps = {
    group: NotepadGroupType | null,
    edit: Dispatch<boolean>,
}

function ViewGroup(props: GroupProps) {

    let { group, edit } = props;

    let openEdit = useCallback(()=>edit(true), [edit]);

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
        let commande = {
            categorie_id: categoryId,
        }

        // @ts-ignore
        if(!newGroupFlag) commande.groupe_id = groupId;

        Promise.resolve().then(async () => {
            if(!workers) throw new Error("Workers not initialized");
            
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
                // @ts-ignore
                let responseGroupId = result.group_id as string;
                // New document, redirect to new docId from response
                edit(false);
                if(!newGroupFlag) {
                    navigate(`/apps/notepad/group/${responseGroupId}`);
                } else {
                    // Check if key is received before opening group ...
                    navigate(`/apps/notepad`);
                }
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
                    <div><CategoryPicklist value={categoryId} onChange={categoryOnChange} /></div>
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

function CategoryPicklist(props: {value: string, onChange: (e: ChangeEvent<HTMLSelectElement>)=>void}) {

    let { value, onChange } = props;

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

    return (
        <>
            <select className='text-black w-full' value={value} onChange={onChange}>
                <option>Select a category</option>
                {categoriesOptions}
            </select>
        </>
    );
}
