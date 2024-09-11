import { useEffect, useMemo, useState } from "react";
import { proxy } from 'comlink';

import useWorkers, { AppWorkers } from "../workers/workers";
import { decryptGroupDocuments, getGroupDocument, getUserGroupDocuments, NotepadDocumentType, syncDocuments } from "./idb/notepadStoreIdb";
import useNotepadStore from "./notepadStore";
import useConnectionStore from "../connectionStore";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";

function SyncGroupDocuments() {

    let workers = useWorkers();

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let groupId = useNotepadStore(state=>state.selectedGroup);
    let setGroupDocuments = useNotepadStore(state=>state.setGroupDocuments);
    let updateDocument = useNotepadStore(state=>state.updateDocument);
    let [userId, setUserId] = useState('');

    useEffect(()=>{
        workers?.connection.getMessageFactoryCertificate()
            .then(certificate=>{
                let userId = certificate.extensions?.userId;
                setUserId(''+userId);
            })
            .catch(err=>console.error("Error loading userId", err));
    }, [workers, setUserId]);

    // Handler for document updates. Saves to IDB, decrypts and updates view.
    let documentGroupEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            let message = event.message as MessageUpdateDocument;
            let docId = message.document.doc_id;
            syncDocuments([message.document], {userId})
                .then(async () => {
                    if(workers && groupId) {
                        await decryptGroupDocuments(workers, userId, groupId) 

                        let updatedDoc = await getGroupDocument(docId);
                        if(updatedDoc?.decrypted) {
                            // Update documents on display
                            updateDocument(updatedDoc);
                        } else {
                            console.warn("Error retrieving updated document, keeping the old version for display");
                        }
                    } else {
                        console.warn("Workers/groupId not initialized");
                    }
                })
                .catch(err=>console.error("Error updating document from listener", err));
        })
    }, [workers, userId, groupId, updateDocument]);

    useEffect(()=>{
        if(!workers || !userId || !groupId) return;

        // Register document listener for group
        workers.connection.subscribeUserGroupDocument(groupId, documentGroupEventCb)
            .catch(err=>console.error("Error subscribing to category/group events", err));

        // Sync documents of this group
        syncGroupDocuments(workers, userId, groupId, setGroupDocuments);

        return () => {
            // Remove listener for document changes on group
            if(workers && groupId) {
                workers.connection.unsubscribeUserGroupDocument(groupId, documentGroupEventCb)
                    .catch(err=>console.error("Error unsubscribing from document events", err));
            }
        }

    }, [workers, ready, userId, groupId, documentGroupEventCb, setGroupDocuments]);

    return <></>;
}

export default SyncGroupDocuments;

type MessageUpdateDocument = {
    document: NotepadDocumentType,
}


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
