import { ChangeEvent, Dispatch, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import useNotepadStore from "./notepadStore";
import { NotepadDocumentType, NotepadGroupData, NotepadGroupType, NotepadNewGroupType } from "./idb/notepadStoreIdb";
import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import { DecryptionKeyIdb, getDecryptedKeys, saveDecryptedKey } from "../MillegrillesIdb";
import { multiencoding, messageStruct } from "millegrilles.cryptography";
import { sortCategories } from "./Categories";
import { EncryptionResult } from "../workers/encryptionUtils";

function ViewGroupDocuments() {
    const params = useParams();
    const groupId = params.groupId as string;
    const [editGroup, setEditGroup] = useState(groupId === 'new');
    const [restoreDocuments, setRestoreDocuments] = useState(false);

    const openRestoreDocuments = useCallback(() => setRestoreDocuments(true), []);
    const closeRestoreDocuments = useCallback(() => setRestoreDocuments(false), []);

    const groups = useNotepadStore(state => state.groups);

    const group = useMemo(() => {
        if (!groups || !groupId) return null;
        const groupMatch = groups.find(item => item.groupe_id === groupId);
        return groupMatch || null;
    }, [groups, groupId]);

    if (restoreDocuments && group) {
        return <RestoreDocuments group={group} close={closeRestoreDocuments} />;
    } else if (editGroup) {
        return <GroupEdit group={group} edit={setEditGroup} />;
    } else {
        return <ViewGroup group={group} edit={setEditGroup} restore={openRestoreDocuments} />;
    }
}

export default ViewGroupDocuments;

type GroupProps = {
    group: NotepadGroupType | null,
    edit: Dispatch<boolean>,
    restore?: () => void,
}

function ViewGroup(props: GroupProps) {
    const { group, edit, restore } = props;
    const workers = useWorkers();
    const navigate = useNavigate();

    const openEdit = useCallback(() => edit(true), [edit]);

    const deleteGroup = useCallback(() => {
        if (!workers) throw new Error("Workers not initialized");
        if (!group) throw new Error('Group null');
        const groupId = group.groupe_id;
        workers.connection.notepadDeleteGroup(groupId)
            .then(response => {
                if (response.ok) {
                    navigate('/apps/notepad');
                } else {
                    console.error("Error deleting group", response.err);
                }
            })
            .catch(err => console.error("Error deleting group", err));
    }, [workers, group, navigate]);

    if (!group) return <div className="p-4 text-slate-400 animate-pulse">Loading group...</div>;

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <nav className="flex mb-6">
                <Link to='/apps/notepad'
                    className='btn flex items-center text-sm bg-slate-800 hover:bg-slate-700 active:bg-slate-700 px-4 py-2 rounded-md transition-colors'>
                    <i className='fa fa-arrow-left mr-2' /> Back
                </Link>
            </nav>

            <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">{group?.data?.nom_groupe}</h1>
                <div className="flex flex-wrap gap-2">
                    <Link to={`/apps/notepad/group/${group.groupe_id}/new`}
                        className='btn flex items-center text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md transition-colors shadow-sm'>
                        <i className='fa fa-plus mr-2' /> New document
                    </Link>
                    <button onClick={openEdit}
                        className='btn flex items-center text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors'>
                        <i className='fa fa-edit mr-2' /> Edit group
                    </button>
                    <button onClick={restore}
                        className='btn flex items-center text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors'>
                        <i className='fa fa-recycle mr-2' /> Restore
                    </button>
                    <button onClick={deleteGroup}
                    className='btn flex items-center text-sm bg-red-900/50 hover:bg-red-800 text-red-200 px-4 py-2 rounded-md transition-colors border border-red-800/50'>
                        <i className='fa fa-trash mr-2' /> Delete
                    </button>
                </div>
            </header>

            <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                <DocumentList />
            </section>
        </div>
    );
}

function DocumentList() {
    const groupDocuments = useNotepadStore(state => state.groupDocuments);

    const listElements = useMemo(() => {
        if (!groupDocuments) return null;

        if (groupDocuments.length === 0) {
            return (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
                    <i className="fa fa-folder-open text-5xl mb-4 opacity-20" />
                    <p className="text-lg">No documents in this group.</p>
                </div>
            );
        }

        const sortedDocs = [...groupDocuments].sort(sortGroupDocuments);

        return sortedDocs.map(doc => (
            <Link key={doc.doc_id} to={`/apps/notepad/group/${doc.groupe_id}/${doc.doc_id}`}
                className='group bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 hover:border-indigo-500/50 p-4 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md'>
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200">
                        <i className="fa fa-file text-indigo-400 text-xl" />
                    </div>
                    <span className="text-slate-200 font-medium truncate w-full text-sm sm:text-base">{doc.label || doc.doc_id}</span>
                    <span className="text-slate-500 text-xs mt-1">{doc.decrypted ? 'Decrypted' : 'Encrypted'}</span>
                </div>
            </Link>
        ));
    }, [groupDocuments]);

    if (!groupDocuments) return (
        <div className="col-span-full flex items-center justify-center py-20 text-slate-500 animate-pulse">
            <p>Loading documents...</p>
        </div>
    );

    return <>{listElements}</>;
}

function sortGroupDocuments(a: NotepadDocumentType, b: NotepadDocumentType, language?: string) {
    language = language || navigator.languages[0] || navigator.language;
    const labelA = (a.label || a.doc_id).toLocaleLowerCase();
    const labelB = (b.label || b.doc_id).toLocaleLowerCase();
    return labelA.localeCompare(labelB, language, { numeric: true, ignorePunctuation: true });
}

function GroupEdit(props: GroupProps) {
    const { group, edit } = props;
    const workers = useWorkers();
    const ready = useConnectionStore(state => state.connectionAuthenticated);
    const navigate = useNavigate();
    const params = useParams();
    const { groupId } = params;

    const isNewGroup = useMemo(() => groupId === 'new', [groupId]);

    const [hasChanged, setHasChanged] = useState(false);
    const [categoryId, setCategoryId] = useState(group?.categorie_id || '');
    const [editedGroupData, setEditedGroupData] = useState(group?.data || {} as NotepadGroupData);

    const onChangeHtml = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.currentTarget;
        const updatedData = { ...editedGroupData, [name]: value };
        setEditedGroupData(updatedData);

        // @ts-ignore
        if (!editedGroupData[name] || editedGroupData[name] !== value) {
            setHasChanged(true);
        }
    }, [editedGroupData, setHasChanged]);

    const categoryOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
        const value = e.currentTarget.value;
        setCategoryId(value);
        if (value) setHasChanged(true);
    }, [setHasChanged]);

    const backHandler = useCallback(() => {
        if (isNewGroup) {
            navigate('/apps/notepad');
        } else {
            navigate(`/apps/notepad/group/${groupId}`);
        }
        edit(false);
    }, [navigate, groupId, edit, isNewGroup]);

    const saveGroupHandler = useCallback(() => {
        if (!categoryId) throw new Error("Category not selected");

        // @ts-ignore
        let keyId = group ? (group.cle_id || group.ref_hachage_bytes) : null;
        const commande = {
            categorie_id: categoryId,
        } as NotepadNewGroupType;

        if (!isNewGroup) {
            commande.groupe_id = groupId;
            if (!keyId) throw new Error("Missing cle_id/ref_hachage_bytes from group");
        }

        Promise.resolve().then(async () => {
            if (!workers) throw new Error("Workers not initialized");

            let newKey = null as any;
            let key = null as DecryptionKeyIdb | null | undefined;
            if (!isNewGroup) {
                if (!keyId) throw new Error("Missing keyId");
                const keys = await getDecryptedKeys([keyId]);
                key = keys.pop();
                if (!key) throw new Error("Unknown key");
            }

            const cleartextData = new TextEncoder().encode(JSON.stringify(editedGroupData));
            let encryptedData = null as EncryptionResult | null;

            if (key) {
                encryptedData = await workers.encryption.encryptMessageMgs4(cleartextData, { key: key.cleSecrete });
            } else {
                encryptedData = await workers.encryption.encryptMessageMgs4(cleartextData, { domain: 'Documents' });

                if (encryptedData.cle && encryptedData.cle_id) {
                    keyId = encryptedData.cle_id;
                    newKey = await workers.connection.createRoutedMessage(
                        messageStruct.MessageKind.Command, encryptedData.cle,
                        { domaine: 'MaitreDesCles', action: 'ajouterCleDomaines' }
                    );
                } else {
                    throw new Error("New key encryption is missing");
                }
            }

            const ciphertextBase64 = multiencoding.encodeBase64Nopad(encryptedData.ciphertext);

            const command = {
                categorie_id: categoryId,
                cle_id: keyId,
                format: encryptedData.format,
                nonce: multiencoding.encodeBase64Nopad(encryptedData.nonce),
                data_chiffre: ciphertextBase64,
            } as NotepadNewGroupType;

            if (!isNewGroup) command.groupe_id = groupId;

            const result = await workers.connection.notepadSaveGroup(command, newKey);
            if (result.ok) {
                if (encryptedData.cleSecrete) {
                    await saveDecryptedKey(command.cle_id, encryptedData.cleSecrete);
                }

                // @ts-ignore
                const responseGroupId = result.group_id as string;
                edit(false);
                navigate(`/apps/notepad/group/${responseGroupId}`);
            } else {
                console.error("Error saving group: ", result.err);
            }
        }).catch(err => console.error("Error saving group", err));

    }, [workers, isNewGroup, group, categoryId, editedGroupData, groupId, navigate, edit]);

    return (
        <div className="p-4 max-w-2xl mx-auto">
            <button onClick={backHandler} className="btn mb-6 flex items-center text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md transition-colors">
                <i className="fa fa-arrow-left mr-2" /> Back
            </button>

            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl mb-8">
                <h1 className="font-bold text-xl mb-6 text-white">Edit Group</h1>
                <div className="space-y-6">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-slate-400">Category</label>
                        <CategoryPicklist value={categoryId} onChange={categoryOnChange} readOnly={!isNewGroup} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="nameInput" className="text-sm font-medium text-slate-400">Name</label>
                        <input id="nameInput" type="text" name="nom_groupe" value={editedGroupData.nom_groupe || ''} onChange={onChangeHtml}
                            className="bg-slate-900 text-white p-3 rounded-lg border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                </div>
            </section>

            <div className="flex gap-4">
                <button onClick={saveGroupHandler} disabled={!ready || !hasChanged}
                    className="btn flex-1 text-center bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Save Changes
                </button>
                <button onClick={backHandler}
                    className="btn flex-1 text-center bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-lg transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    );
}

function CategoryPicklist(props: { value: string, onChange: (e: ChangeEvent<HTMLSelectElement>) => void, readOnly?: boolean }) {
    const { value, onChange, readOnly } = props;
    const categories = useNotepadStore(state => state.categories);

    const categoriesOptions = useMemo(() => {
        if (!categories) return [];
        const sortedCategories = [...categories].sort(sortCategories);
        return sortedCategories.map(cat => (
            <option key={cat.categorie_id} value={cat.categorie_id}>{cat.nom_categorie}</option>
        ));
    }, [categories]);

    const categorySpan = useMemo(() => {
        if (!readOnly) return null;
        const cat = categories?.find(item => item.categorie_id === value);
        return <span className="text-slate-400">{cat?.nom_categorie}</span>;
    }, [readOnly, categories, value]);

    if (categorySpan) return categorySpan;

    return (
        <select className="bg-slate-900 text-white p-3 rounded-lg border border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-full transition-all" value={value} onChange={onChange}>
            <option value="">Select a category</option>
            {categoriesOptions}
        </select>
    );
}

function RestoreDocuments(props: { group: NotepadGroupType, close: () => void }) {
    const { group, close } = props;
    
    const workers = useWorkers();
    const ready = useConnectionStore(state => state.connectionAuthenticated);
    const categories = useNotepadStore(state => state.categories);
    const updateDocument = useNotepadStore(state => state.updateDocument);

    const [docs, setDocs] = useState(null as null | Array<NotepadDocumentType>);
    const [userId, setUserId] = useState('');

    useEffect(() => {
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate => {
                const uId = certificate.extensions?.userId;
                setUserId('' + uId);
            })
            .catch(err => console.error("Error loading userId", err));
    }, [workers]);

    const firstField = useMemo(() => {
        if (!categories || !group) return null;
        const category = categories.find(item => item.categorie_id === group.categorie_id);
        return category?.champs[0]?.code_interne || null;
    }, [categories, group]);

    const restoreHandler = useCallback((e: MouseEvent<HTMLButtonElement>) => {
        if (!workers || !docs) throw new Error("Workers/docs not initialized");
        const docId = e.currentTarget.value;
        const docToRestore = docs.filter(item => item.doc_id === docId).pop();
        if (!docToRestore) throw new Error("Document to restore is null");

        workers.connection.notepadRestoreDocument(docId)
            .then(async response => {
                if (response.ok === false) throw new Error(response.err);
                if (docs) setDocs(docs.filter(item => item.doc_id !== docId));
                if (docToRestore && userId) {
                    await syncDocumentIdentities([docToRestore], { userId });
                    updateDocument(docToRestore);
                }
            })
            .catch(err => console.error("Error restoring document", err));
    }, [workers, docs, updateDocument, userId]);

    useEffect(() => {
        if (!ready || !workers || !firstField) return;
        getDeletedDocuments(workers, group, firstField)
            .then(setDocs)
            .catch(err => console.error("Error loading deleted documents", err));
    }, [workers, ready, group, setDocs, firstField]);

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <button onClick={close} className="btn mb-6 flex items-center text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-md transition-colors">
                <i className="fa fa-arrow-left mr-2" /> Back
            </button>

            <section className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl">
                <h1 className="font-bold text-xl mb-6 text-white">Restore Documents</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <ListDeletedDocuments docs={docs} onRestore={restoreHandler} />
                </div>
            </section>
        </div>
    );
}

async function getDeletedDocuments(workers: AppWorkers, group: NotepadGroupType, firstField: string): Promise<Array<NotepadDocumentType>> {
    const groupId = group.groupe_id;
    const keyId = group.cle_id || group.ref_hachage_bytes;

    if (!keyId) throw new Error("Missing cle_id/ref_hachage_bytes from group");

    const deletedDocumentIdentitiesResponse = await workers.connection.getNotepadDocumentsForGroup(groupId, true);
    if (deletedDocumentIdentitiesResponse.ok === false || !deletedDocumentIdentitiesResponse.documents) {
        throw new Error("Error getting deleted document identities: " + deletedDocumentIdentitiesResponse.err);
    }
    const docIds = deletedDocumentIdentitiesResponse.documents.map(item => item.doc_id);

    const key = (await getDecryptedKeys([keyId])).pop();
    if (!key) throw new Error("Unknown group key");

    const deletedDocuments = await workers.connection.getDocumentsContent(groupId, docIds);
    if (!deletedDocuments.ok || !deletedDocuments.documents) {
        throw new Error("Error getting deleted documents: " + deletedDocuments.err);
    }

    const docList = deletedDocuments.documents;

    for (const doc of docList) {
        let nonce = doc.nonce;
        let legacyMode = false;
        if (!nonce && doc.header) {
            nonce = doc.header.slice(1);  // Remove multibase 'm' marker
            legacyMode = true;
        }
        if (!nonce) continue;

        let ciphertext = doc.data_chiffre;
        if (legacyMode) ciphertext = ciphertext.slice(1);  // Remove 'm' multibase marker

        const cleartext = await workers.encryption.decryptMessage(doc.format, key.cleSecrete, nonce, ciphertext);
        const data = JSON.parse(new TextDecoder().decode(cleartext));
        doc.data = data;
        doc.label = data[firstField] || doc.doc_id;
        doc.decrypted = true;
    }

    return docList;
}

function ListDeletedDocuments(props: { docs: Array<NotepadDocumentType> | null, onRestore: (e: MouseEvent<HTMLButtonElement>) => void }) {
    const { docs, onRestore } = props;

    const docElems = useMemo(() => {
        if (!docs) return null;
        if(docs.length === 0) {
            return <p>There are no deleted documents.</p>
        }

        return [...docs]
            .sort(sortGroupDocuments)
            .map(item => (
                <div key={item.doc_id} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg border border-slate-600/50">
                    <span className="text-slate-300 text-sm truncate pr-2">{item.label}</span>
                    <button value={item.doc_id} onClick={onRestore}
                        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded transition-colors">
                        Restore
                    </button>
                </div>
            ));
    }, [docs, onRestore]);

    if (!docElems) {
        return <p className="text-slate-500">Loading ...</p>;
    }

    return <>{docElems}</>;
}
