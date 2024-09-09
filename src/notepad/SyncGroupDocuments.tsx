import { useEffect, useState } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import { decryptGroupDocuments, getUserGroupDocuments, NotepadDocumentType, syncDocuments } from "./idb/notepadStoreIdb";
import useNotepadStore from "./notepadStore";
import { useParams } from "react-router-dom";

type SyncGroupDocumentsProps = {
    groupId: string,
}

function SyncGroupDocuments(props: SyncGroupDocumentsProps) {

    let workers = useWorkers();
    let params = useParams();
    let groupId = params.groupId;

    let setGroupDocuments = useNotepadStore(state=>state.setGroupDocuments);
    let [userId, setUserId] = useState('');

    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                let userId = certificate.extensions?.userId;
                setUserId(''+userId);
            })
            .catch(err=>console.error("Error loading userId", err));
    }, [workers, setUserId]);

    useEffect(()=>{
        if(!workers || !userId || !groupId) return;

        // Register document listener for group

        // Sync documents of this group
        syncGroupDocuments(workers, userId, groupId, setGroupDocuments);

        return () => {
            // Remove listener for document changes on group

        }

    }, [workers, userId, groupId, setGroupDocuments]);

    return <></>;
}

export default SyncGroupDocuments;

async function syncGroupDocuments(workers: AppWorkers, userId: string, groupId: string, setGroupDocuments: (groupDocuments: Array<NotepadDocumentType>)=>void) {
    
    try {
        let documentsForGroup = await workers.connection.getNotepadDocumentsForGroup(groupId);
        let groupDocuments = documentsForGroup.documents;

        if(!groupDocuments) {
            throw new Error("Error synchronizing documents: " + documentsForGroup.err);
        }

        // Save to IDB
        await syncDocuments(groupDocuments, {userId});

        // Decrypt all encrypted documents
        await decryptGroupDocuments(workers, userId, groupId);
    } finally {
        let groupDocuments = await getUserGroupDocuments(userId, groupId, true);
        setGroupDocuments(groupDocuments);
    }

}
