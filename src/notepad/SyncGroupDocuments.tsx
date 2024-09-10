import { useEffect, useMemo, useState } from "react";
import { proxy } from 'comlink';

import useWorkers, { AppWorkers } from "../workers/workers";
import { decryptGroupDocuments, getUserGroupDocuments, NotepadDocumentType, syncDocuments } from "./idb/notepadStoreIdb";
import useNotepadStore from "./notepadStore";
import useConnectionStore from "../connectionStore";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";

function SyncGroupDocuments() {

    let workers = useWorkers();

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let groupId = useNotepadStore(state=>state.selectedGroup);
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

    let documentGroupEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            console.debug("Event on group document", event);
            // let message = event.message as MessageUpdateCategoryGroup;
        })
    }, []);

    useEffect(()=>{
        if(!workers || !userId || !groupId) return;

        // Register document listener for group
        workers.connection.subscribeUserGroupDocument(documentGroupEventCb)
            .catch(err=>console.error("Error subscribing to category/group events", err));

        // Sync documents of this group
        syncGroupDocuments(workers, userId, groupId, setGroupDocuments);

        return () => {
            // Remove listener for document changes on group
            if(workers) {
                workers.connection.unsubscribeUserGroupDocument(documentGroupEventCb)
                    .catch(err=>console.error("Error unsubscribing from document events", err));
            }
        }

    }, [workers, ready, userId, groupId, documentGroupEventCb, setGroupDocuments]);

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
