import { Fragment, useEffect, useMemo, useState } from "react";
import useNotepadStore from "./notepadStore";
import { Link, useParams } from "react-router-dom";
import { NotepadCategoryFieldType, NotepadCategoryType, NotepadDocumentType } from "./idb/notepadStoreIdb";
import HtmlViewer from "./HtmlViewer";

function ViewDocument() {

    const params = useParams();
    let [editDocument, setEditDocument] = useState(false);

    let docId = params.docId as string;

    let categories = useNotepadStore(state=>state.categories);
    let selectedGroup = useNotepadStore(state=>state.selectedGroup);
    let groups = useNotepadStore(state=>state.groups);
    let groupDocuments = useNotepadStore(state=>state.groupDocuments);

    let groupDocument = useMemo(()=>{
        if(!docId || !groupDocuments) return;
        let groupDocument = groupDocuments.filter(item=>item.doc_id===docId).pop();
        console.debug("GroupDocuments %O, Group document for docId: %O = %O", groupDocuments, docId, groupDocument);
        return groupDocument;
    }, [groupDocuments, docId]);

    let [category, group] = useMemo(()=>{
        if(!groupDocument || !groups || !categories) return [null, null];
        let groupId = groupDocument.groupe_id;
        let group = groups.filter(item=>item.groupe_id===groupId).pop();
        let categoryId = group?.categorie_id;
        let category = categories.filter(item=>item.categorie_id===categoryId).pop();

        console.debug("Category: %O, group: %O ", category, group);

        return [category, group];
    }, [groupDocument, groups, categories]);

    if(!category || !groupDocument || !selectedGroup) {
        return (
            <>
                <p>Loading ...</p>
            </>
        );
    }

    return (
        <>
            <nav>
                <Link to={`/apps/notepad/group/${groupDocument.groupe_id}`}
                     className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='text-lg font-bold'>{group?.data?.nom_groupe}</h1>

            <h2 className='font-bold'>{groupDocument.label}</h2>

            {editDocument?
                <EditFields category={category} groupDocument={groupDocument}/>
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

        console.debug("Category %O, document %O", category, groupDocument);

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
            <label className='col-span-2'>{field.nom_champ}</label>
            <div className='col-span-10'>Unsupported field type</div>
        </>        
    )
}

function ViewTextField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = value.data?value.data[field.code_interne]:'';

    return (
        <>
            <label className='col-span-2'>{field.nom_champ}</label>
            <div className='col-span-10'>{data}</div>
        </>
    )
}

function ViewPasswordField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = value.data?value.data[field.code_interne]:'';

    return (
        <>
            <label className='col-span-2'>{field.nom_champ}</label>
            <div className='col-span-10'>{data}</div>
        </>
    )
}

function ViewUrlField(props: ViewFieldProps) {
    let {field, value} = props;

    let data = value.data?value.data[field.code_interne]:'';

    return (
        <>
            <label className='col-span-2'>{field.nom_champ}</label>
            <div className='col-span-10'>{data}</div>
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

};

function EditFields(props: EditFieldsProps) {
    return (
        <section className='grid grid-cols-12'>
            
            <div className='col-span-12 text-center'>
                <button
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Save
                </button>
                <button
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </div>
        </section>
    );
}
