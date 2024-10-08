import { useEffect, useMemo, useState } from "react";
import { proxy } from 'comlink';

import useWorkers, { AppWorkers } from "../workers/workers";
import { decryptGroupDocuments, deleteGroupDocument, getGroupDocument, getUserGroup, getUserGroupDocuments, NotepadDocumentType, syncDocuments } from "./idb/notepadStoreIdb";
import useNotepadStore from "./notepadStore";
import useConnectionStore from "../connectionStore";
import { MessageResponse, SubscriptionMessage } from "millegrilles.reactdeps.typescript";
import { NotepadDocumentsResponse } from "../workers/connection.worker";

function SyncGroupDocuments() {

    let workers = useWorkers();

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let groupId = useNotepadStore(state=>state.selectedGroup);
    let setGroupDocuments = useNotepadStore(state=>state.setGroupDocuments);
    let updateDocument = useNotepadStore(state=>state.updateDocument);
    let removeDocument = useNotepadStore(state=>state.removeDocument);
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

            if(message.document) {
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
            } else if(message.supprime !== undefined) {
                // This is a delete/restore event
                let docId = message.doc_id;
                if(docId && message.supprime) {
                    deleteGroupDocument(docId)
                        .then(()=>{
                            if(docId) {
                                removeDocument(docId);  // Remove from view
                            }
                        })
                        .catch(err=>console.error("Error deleting document", err));
                }
            }
        })
    }, [workers, userId, groupId, updateDocument, removeDocument]);

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
    doc_id?: string,
    supprime?: string,
    document?: NotepadDocumentType,
}

async function syncGroupDocuments(workers: AppWorkers, userId: string, groupId: string, setGroupDocuments: (groupDocuments: Array<NotepadDocumentType>)=>void) {

    const callback = proxy(async (response: MessageResponse | NotepadDocumentsResponse) => {
        let documentsForGroup = response as NotepadDocumentsResponse;
        if(documentsForGroup.ok === false) {
            console.warn("Error response received on document sync", documentsForGroup.err);
            return;
        } else if(documentsForGroup.ok === true && documentsForGroup.code === 1) {
            // Ok, streaming has started.
            return;
        }

        let groupDocuments = documentsForGroup.documents;
        let dateSync = documentsForGroup.date_sync;

        if(groupDocuments) {
            // Save to IDB
            await syncDocuments(groupDocuments, {userId, deleted: documentsForGroup.supprimes, groupId, dateSync});
        } else {
            console.warn("No document list received in document sync batch ", documentsForGroup);
        }

        if(documentsForGroup.done) {
            // Decrypt all encrypted documents
            await decryptGroupDocuments(workers, userId, groupId);
            let groupDocuments = await getUserGroupDocuments(userId, groupId, true);
            setGroupDocuments(groupDocuments);
        }
    });

    let groupIdb = await getUserGroup(groupId);
    let previousDateSync = groupIdb?.dateSync;

    let initialStreamResponse = await workers.connection.getNotepadDocumentsForGroupStreamed(groupId, callback, undefined, previousDateSync);
    if(!initialStreamResponse === true) {
        throw new Error("Error getting documents for this group");
    }
}
