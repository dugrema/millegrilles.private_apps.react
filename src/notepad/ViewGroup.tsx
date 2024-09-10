import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import useNotepadStore from "./notepadStore";

import SyncGroupDocuments from "./SyncGroupDocuments";

function ViewGroup() {

    const params = useParams();
    let groupId = params.groupId as string;

    let categories = useNotepadStore(state=>state.categories);
    let groups = useNotepadStore(state=>state.groups);
    let setSelectedGroup = useNotepadStore(state=>state.setSelectedGroup);

    // Set the selected group
    useEffect(()=>{
        if(!categories || !groups) return;  // Wait for sync
        if(categories.length === 0) return;  // New account or loading in progress
        if(groups.length === 0) return;  // No configured groups or loading in progress
        setSelectedGroup(groupId);
    }, [categories, groups, groupId, setSelectedGroup]);

    return (
        <>
            <Outlet />
            <SyncGroupDocuments />
        </>
    )
}

export default ViewGroup;
