import { Link, useParams } from "react-router-dom";
import useNotepadStore from "./notepadStore";
import { useMemo } from "react";

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
            <nav>
                <Link to='/apps/notepad'
                     className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='text-lg font-bold'>{group?.data?.nom_groupe}</h1>

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
        return groupDocuments.map(groupDoc=>{
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
