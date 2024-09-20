import { ChangeEvent, useCallback, useMemo, useState } from "react";
import useNotepadStore from "./notepadStore";
import { Link, useNavigate, useParams } from "react-router-dom";
import { NotepadCategoryFieldType, NotepadCategoryType, NotepadDocumentData, NotepadDocumentType, NotepadGroupType, NotepadNewDocumentType } from "./idb/notepadStoreIdb";
import HtmlViewer from "./HtmlViewer";
import HtmlEditor from "./HtmlEditor";
import useWorkers from "../workers/workers";
import { getDecryptedKeys } from "../MillegrillesIdb";
import { multiencoding, random, digest } from "millegrilles.cryptography";
import useConnectionStore from "../connectionStore";

function ViewDocument() {

    let params = useParams();
    let workers = useWorkers();
    let navigate = useNavigate();

    let groupId = params.groupId as string;
    let docId = params.docId as string;

    let [editDocument, setEditDocument] = useState(docId==='new');

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let categories = useNotepadStore(state=>state.categories);
    let selectedGroup = useNotepadStore(state=>state.selectedGroup);
    let groups = useNotepadStore(state=>state.groups);
    let groupDocuments = useNotepadStore(state=>state.groupDocuments);

    let editDocumentOpen = useCallback(()=>setEditDocument(true), [setEditDocument]);
    let editDocumentClose = useCallback(()=>setEditDocument(false), [setEditDocument]);

    let deleteDocument = useCallback(()=>{
        if(!workers) throw new Error('Workers not initialized');
        if(!docId) throw new Error('No docId to delete');
        workers.connection.notepadDeleteDocument(docId)
            .then(response=>{
                if(response.ok) {
                    setEditDocument(false);
                    navigate(`/apps/notepad/group/${groupId}`)
                } else {
                    console.error("Error (1) deleting document: ", response.err);
                }
            })
            .catch(err=>console.error("Error (2) deleting document: ", err));
    }, [workers, docId, groupId, setEditDocument, navigate])

    let [category, group] = useMemo(()=>{
        if(!groups || !categories) return [null, null];
        let group = groups.filter(item=>item.groupe_id===groupId).pop();
        let categoryId = group?.categorie_id;
        let category = categories.filter(item=>item.categorie_id===categoryId).pop();

        return [category, group];
    }, [groupId, groups, categories]);

    let groupDocument = useMemo(()=>{
        if(!docId || !category || !group || !groupDocuments) return;
        let groupDocument = groupDocuments.filter(item=>item.doc_id===docId).pop();
        if(docId === 'new') {
            return {
                label: '', 
                user_id: '',
                groupe_id: groupId, 
                categorie_version: category.version,
                doc_id: 'new',
                cle_id: group.cle_id,
                format: '',
                nonce: '',
                data_chiffre: '',
            } as NotepadDocumentType;
        }
        return groupDocument;
    }, [category, groupDocuments, docId, groupId, group]);

    if(!category || !group || (!groupDocument) || !selectedGroup) {
        return (
            <>
                <p>Loading ...</p>
            </>
        );
    }

    return (
        <>
            <nav>
                {editDocument?
                    <button onClick={editDocumentClose}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Cancel
                    </button>
                :
                    <Link to={`/apps/notepad/group/${groupDocument.groupe_id}`}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Back
                    </Link>
                }
                <button onClick={editDocumentOpen} disabled={editDocument || !ready}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        <i className='fa fa-edit'/> Edit
                </button>

                <div className='w-full sm:inline text-right pr-6'>
                    <button onClick={deleteDocument} disabled={editDocument || !ready}
                        className='varbtn sm:btn pt-2 pb-2 pl-2 pr-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                            <i className='fa fa-remove'/> Delete
                    </button>
                </div>
            </nav>

            <h1 className='text-lg font-bold'>{group?.data?.nom_groupe}</h1>

            <h2 className='font-bold'>{groupDocument.label}</h2>

            {editDocument?
                <EditFields category={category} group={group} groupDocument={groupDocument} close={editDocumentClose}/>
            :
                <ViewFields category={category} groupDocument={groupDocument}/>
            }
        </>
    )
}

export default ViewDocument;

type ViewFieldsProps = {
    category: NotepadCategoryType,
    groupDocument: NotepadDocumentType,
}

function ViewFields(props: ViewFieldsProps) {

    let {category, groupDocument} = props;

    let fieldElements = useMemo(()=>{
        if(!category || !groupDocument) return <></>;

        let fields = category.champs;
        return fields.map(item=>{
            let fieldType = item.type_champ;
            let FieldElement = ViewUnsupportedField;
            if(fieldType === 'text') {
                FieldElement = ViewTextField;
            } else if(fieldType === 'password') {
                FieldElement = ViewPasswordField;
            } else if(fieldType === 'url') {
                FieldElement = ViewUrlField;
            } else if(fieldType === 'html') {
                FieldElement = ViewHtmlField;
            }
            return <FieldElement key={item.code_interne} field={item} value={groupDocument} />;
        });
    }, [category, groupDocument]);

    return (
        <section className='grid grid-cols-12'>
            {fieldElements}
        </section>
    );

}

type ViewFieldProps = {
    field: NotepadCategoryFieldType,
    value: NotepadDocumentType
};

function ViewUnsupportedField(props: ViewFieldProps) {
    let {field} = props;
    return (
        <>
            <label className='col-span-4 sm:col-span-2 pt-2 sm:pt-0'>{field.nom_champ}</label>
            <div className='col-span-8 sm:col-span-10'>Unsupported field type</div>
        </>        
    )
}

function ViewTextField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = (value.data?value.data[field.code_interne]:'') as string;

    let [copied, setCopied] = useState(false);

    let copyToClipboard = useCallback(()=>{
        if(data) navigator.clipboard.writeText(data);
        setCopied(true);
        setTimeout(()=>setCopied(false), 3_000);
    }, [data, setCopied]);

    let className = useMemo(()=>{
        if(copied) return ' text-green-600';
        return '';
    }, [copied]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2 pt-2 sm:pt-0'>{field.nom_champ}</label>
            <div onClick={copyToClipboard}
                className={'transition-all col-span-12 sm:col-span-10 break-word cursor-pointer ' + className}>
                    {data}
                    {copied?<i className='pl-2 fa fa-check'/>:<></>}
            </div>
        </>
    )
}

function ViewPasswordField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = (value.data?value.data[field.code_interne]:'') as string;

    let [copied, setCopied] = useState(false);

    let copyToClipboard = useCallback(()=>{
        if(data) navigator.clipboard.writeText(data);
        setCopied(true);
        setTimeout(()=>setCopied(false), 3_000);
    }, [data, setCopied]);

    let className = useMemo(()=>{
        if(copied) return ' text-green-600';
        return '';
    }, [copied]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2 pt-2 sm:pt-0'>{field.nom_champ}</label>
            <div onClick={copyToClipboard}
                className={'transition-all col-span-12 sm:col-span-10 break-word cursor-pointer ' + className}>
                    {data}
                    {copied?<i className='pl-2 fa fa-check'/>:<></>}
            </div>
        </>
    )
}

function ViewUrlField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = (value.data?value.data[field.code_interne]:'') as string;

    let [copied, setCopied] = useState(false);

    let copyToClipboard = useCallback(()=>{
        if(data) navigator.clipboard.writeText(data);
        setCopied(true);
        setTimeout(()=>setCopied(false), 3_000);
    }, [data, setCopied]);

    let className = useMemo(()=>{
        if(copied) return ' text-green-600';
        return '';
    }, [copied]);

    let wellFormed = useMemo(()=>{
        try {
            new URL(data);
            return true;
        } catch(err) {
            return false;
        }
    }, [data]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2 pt-2 sm:pt-0'>{field.nom_champ}</label>
            <div onClick={copyToClipboard}
                 className={'transition-all col-span-12 sm:col-span-10 break-word cursor-pointer ' + className}>
                    {data}
                    {wellFormed?
                        <a href={data} target="_blank" rel="noreferrer"
                            className='varbtn w-10 pt-1 pb-1 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                                <i className='fa fa-external-link'/>
                        </a>
                    :
                        data?<span className='pl-2 font-bold text-red-600'>(Invalid URL)</span>:<></>
                    }
                    {copied?<i className='pl-2 fa fa-check'/>:<></>}
            </div>
        </>
    )
}

function ViewHtmlField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = (value.data?value.data[field.code_interne]:'') as string | null;

    return (
        <div className='col-span-12 pt-4'>
            <label>{field.nom_champ}</label>
            <div className='pt-2'>
                <HtmlViewer value={data} />
            </div>
        </div>
    )
}

// Edit section

type EditFieldsProps = ViewFieldsProps & {
    group: NotepadGroupType,
    close: ()=>void,
};

function EditFields(props: EditFieldsProps) {

    let { close, category, group, groupDocument} = props;

    let workers = useWorkers();
    let navigate = useNavigate();

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [data, setData] = useState(groupDocument.data || {});
    let [hasChanged, setHasChanged] = useState(false);

    let cancelHandler = useCallback(()=>{
        if(groupDocument.doc_id === 'new') {
            // Cancel brings back to the group
            navigate(`/apps/notepad/group/${groupDocument.groupe_id}`);
            return;
        }
        close();
    }, [groupDocument, close, navigate]);

    let onChangeHtml = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let {name, value} = e.currentTarget;
        let updatedData = {...data, [name]: value};
        setData(updatedData);

        // Check if new field or if field value has changed
        if(!data[name] || data[name] !== value) {
            setHasChanged(true);
        }
    }, [data, setData, setHasChanged]);

    let onChangeValue = useCallback((e: {name: string, value: string})=>{
        let {name, value} = e;
        let updatedData = {...data, [name]: value};
        setData(updatedData);

        // Check if new field or if field value has changed
        if(!data[name] || data[name] !== value) {
            setHasChanged(true);
        }
    }, [data, setData, setHasChanged]);

    let saveHandler = useCallback(()=>{
        const keyId = group.cle_id || group.ref_hachage_bytes;
        if(!keyId) throw new Error("Missing group cle_id/ref_hachage_bytes");
        
        const commande = {
            groupe_id: group.groupe_id,
            categorie_version: category.version,
        }

        // If docId is 'new', set to null. A new docId will be assigned on save.
        let docId = groupDocument.doc_id!=='new'?groupDocument.doc_id:null;

        // @ts-ignore
        if(docId) commande.doc_id = docId
        
        getDecryptedKeys([keyId])
            .then(async keys => {
                if(!workers) throw new Error("Workers not initialized");
                let key = keys.pop();
                if(!key) throw new Error("Unknown key");
                let encryptedData = await workers.encryption.encryptMessageMgs4(data, key.cleSecrete);

                let ciphertextBase64 = multiencoding.encodeBase64Nopad(encryptedData.ciphertext);

                let command = {
                    groupe_id: group.groupe_id,
                    categorie_version: category.version,
                    cle_id: keyId,
                    format: encryptedData.format,
                    nonce: multiencoding.encodeBase64Nopad(encryptedData.nonce),
                    data_chiffre: ciphertextBase64,
                    compression: encryptedData.compression,
                } as NotepadNewDocumentType;

                if(docId !== 'new') command.doc_id = docId;

                let result = await workers.connection.notepadSaveDocument(command);
                if(result.ok) {
                    if(!docId) {
                        // @ts-ignore
                        let responseDocId = result.doc_id as string;
                        // New document, redirect to new docId from response
                        navigate(`/apps/notepad/group/${group.groupe_id}/${responseDocId}`);
                    }

                    // Close the edit screen, back to view.
                    close();
                } else {
                    console.error("Error saving document: ", result.err);
                }
            })
            .catch(err=>{
                console.error("Error encrypting/saving notpad document", err);
            })

    }, [workers, groupDocument, category, group, data, navigate, close]);
    
    let fieldElements = useMemo(()=>{
        if(!category || !groupDocument) return <></>;

        let fields = category.champs;
        return fields.map(item=>{
            let fieldType = item.type_champ;
            let FieldElement = EditUnsupportedField;
            
            if(fieldType === 'text') {
                FieldElement = EditTextField;
            } else if(fieldType === 'password') {
                FieldElement = EditPasswordField;
            } else if(fieldType === 'url') {
                FieldElement = EditUrlField;
            } else if(fieldType === 'html') {
                FieldElement = EditHtmlField;
            }

            return <FieldElement key={item.code_interne} 
                        field={item} value={groupDocument} editData={data} 
                        onChange={onChangeHtml} onChangeValue={onChangeValue} 
                        />;
        });
    }, [category, groupDocument, data, onChangeHtml, onChangeValue]);
    
    return (
        <section className='grid grid-cols-12'>

            {fieldElements}
            
            <div className='col-span-12 text-center pt-4'>
                <button onClick={saveHandler} disabled={!ready || !hasChanged}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Save
                </button>
                <button onClick={cancelHandler}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </div>
        </section>
    );
}

type EditFieldProps = ViewFieldProps & {
    editData: NotepadDocumentData,
    onChange: ((e: ChangeEvent<HTMLInputElement>)=>void),
    onChangeValue: ((e: {name: string, value: string})=>void),
};

function EditUnsupportedField(props: EditFieldProps) {
    let {field} = props;
    return (
        <>
            <label className='col-span-4 sm:col-span-2'>{field.nom_champ}</label>
            <div className='col-span-8 sm:col-span-10'>Unsupported field type</div>
        </>        
    )
}

function EditTextField(props: EditFieldProps) {
    let {field, editData, onChange} = props;

    let data = useMemo(() => editData[field.code_interne] || '', [editData, field]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2'>{field.nom_champ}</label>
            <div className='col-span-12 sm:col-span-10'>
                <input type='text' name={field.code_interne} value={data} onChange={onChange} 
                    className='w-full text-black' />
            </div>
        </>
    )
}

function EditUrlField(props: EditFieldProps) {
    let {field, editData, onChange} = props;

    let data = useMemo(() => editData[field.code_interne] || '', [editData, field]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2'>{field.nom_champ}</label>
            <div className='col-span-12 sm:col-span-10'>
                <input type='text' name={field.code_interne} value={data} onChange={onChange} 
                    className='w-full text-black' />
            </div>
        </>
    )
}

function EditPasswordField(props: EditFieldProps) {
    let {field, editData, onChange, onChangeValue} = props;

    let data = useMemo(() => editData[field.code_interne] || '', [editData, field]);

    let generatePassword = useCallback((passwd: string)=>{
        onChangeValue({name: field.code_interne, value: passwd});
    }, [onChangeValue, field]);

    return (
        <>
            <label className='col-span-12 sm:col-span-2'>{field.nom_champ}</label>
            <div className='col-span-8 sm:col-span-8'>
                <input type='text' name={field.code_interne} value={data} onChange={onChange} 
                    className='w-full text-black' />
            </div>
            <div className='col-span-4 sm:col-span-2'>
                <PasswordGenerator onChange={generatePassword}
                    className='varbtn w-24 pt-2 pb-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Generate
                </PasswordGenerator>
            </div>
        </>
    )
}

function EditHtmlField(props: EditFieldProps) {
    let {field, value, onChangeValue} = props;

    let onChangeHandler = useCallback((value: string)=>{
        onChangeValue({name: field.code_interne, value});
    }, [onChangeValue, field]);

    let data = (value.data?value.data[field.code_interne]:'') as string | null;

    return (
        <div className='col-span-12 pt-4'>
            <label>{field.nom_champ}</label>
            <div className='pt-2 w-full h-96 pb-24 md:pb-12'>
                <HtmlEditor value={data} onChange={onChangeHandler} />
            </div>
        </div>
    )
}

function PasswordGenerator(props: {onChange: (e: string)=>void, className?: string, children?: any}) {

    const { onChange, className } = props

    const generer = useCallback(()=>{
        // use 16 random bytes, hash with blake2s and retain 16 characters of the base64 encoding.
        // Note: the first 7 characters are multibase and multihash values (not random) so they are skipped.
        const randomBytes = random.getRandom(16);
        digest.digest(randomBytes, {digestName: 'blake2s-256', encoding: 'base64'})
            .then(hashedValue=>{
                let value = hashedValue.slice(7,23) as string;
                onChange(value);
            })
            .catch(err=>console.error("Error generating password", err));
    }, [onChange])

    return (
        <button className={className} onClick={generer}>{props.children}</button>
    )
}
