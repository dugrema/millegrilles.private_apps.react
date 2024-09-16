import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import useNotepadStore from "./notepadStore";

import SyncGroupDocuments from "./SyncGroupDocuments";

function ViewGroup() {

    let params = useParams();
    let groupId = params.groupId as string;

    let categories = useNotepadStore(state=>state.categories);
    let groups = useNotepadStore(state=>state.groups);
    let setSelectedGroup = useNotepadStore(state=>state.setSelectedGroup);
    let setGroupDocuments = useNotepadStore(state=>state.setGroupDocuments);

    // Set the selected group
    useEffect(()=>{
        if(!categories || !groups) {}       // Wait for sync
        else if(categories.length === 0) {} // New account or loading in progress
        else if(groups.length === 0) {}     // No configured groups or loading in progress
        else if(groupId === 'new') {}       // Adding a new group
        else {
            setSelectedGroup(groupId);
            return;
        }
        
        setSelectedGroup(null);
    }, [categories, groups, groupId, setSelectedGroup]);

    useEffect(()=>{
        // Reset list of documents when leaving group
        // Avoids flashing previous list of documents when loading new group
        return () => {
            setGroupDocuments(null);
        }
    }, [setGroupDocuments])

    return (
        <>
            <Outlet />
            <SyncGroupDocuments />
        </>
    )
}

export default ViewGroup;
