import { Link, useParams } from "react-router-dom";
import useNotepadStore from "./notepadStore";
import { useMemo } from "react";
import { NotepadDocumentType } from "./idb/notepadStoreIdb";

function ViewGroupDocuments() {

    const params = useParams();

    let groupId = params.groupId as string;
    let groups = useNotepadStore(state=>state.groups);

    let group = useMemo(()=>{
        if(!groups || !groupId) return;
        let group = groups.filter(item=>item.groupe_id === groupId).pop();
        return group;
    }, [groups, groupId]);

    return (
        <>
            <nav className='grid grid-cols-6'>
                <Link to='/apps/notepad'
                     className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='text-lg font-bold pt-2 pb-4'>{group?.data?.nom_groupe}</h1>

            <section className='pb-4 grid grid-cols-6'>
                <Link to={`/apps/notepad/group/${groupId}/new`}
                     className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        New
                </Link>
                <button
                     className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-edit'/> Edit
                </button>
            </section>

            <section>
                <DocumentList />
            </section>
        </>
    )
}

export default ViewGroupDocuments;

function DocumentList() {
    let groupDocuments = useNotepadStore(state=>state.groupDocuments);

    let listElements = useMemo(()=>{
        if(!groupDocuments) return [];

        let sortedGroupDocuments = [...groupDocuments];
        sortedGroupDocuments.sort(sortGroupDocuments);

        return sortedGroupDocuments.map(groupDoc=>{
            return (
                <div key={groupDoc.doc_id}>
                    <Link to={`/apps/notepad/group/${groupDoc.groupe_id}/${groupDoc.doc_id}`}
                        className='font-bold underline'>
                            {groupDoc.label}
                    </Link>
                </div>
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

function sortGroupDocuments(a: NotepadDocumentType, b: NotepadDocumentType) {
    let labelA = (a.label || a.doc_id).toLocaleLowerCase();
    let labelB = (b.label || b.doc_id).toLocaleLowerCase();
    return labelA.localeCompare(labelB);
}
