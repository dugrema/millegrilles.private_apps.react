import { useEffect, useMemo, useState } from "react";
import { proxy } from "comlink";

import useWorkers, { AppWorkers } from "../workers/workers";
import {
  decryptGroupDocuments,
  deleteGroupDocument,
  getDirtyDocumentsIdsForGroup,
  getGroupDocument,
  getUserGroup,
  getUserGroupDocuments,
  NotepadDocumentType,
  syncDocumentIdentitiess,
  syncDocuments,
} from "./idb/notepadStoreIdb";
import useNotepadStore from "./notepadStore";
import useConnectionStore from "../connectionStore";
import {
  MessageResponse,
  SubscriptionMessage,
} from "millegrilles.reactdeps.typescript";
import { NotepadDocumentIdentitiesResponse } from "../types/connection.types";

function SyncGroupDocuments() {
  const workers = useWorkers();

  const ready = useConnectionStore((state) => state.connectionAuthenticated);
  const groupId = useNotepadStore((state) => state.selectedGroup);
  const setGroupDocuments = useNotepadStore((state) => state.setGroupDocuments);
  const updateDocument = useNotepadStore((state) => state.updateDocument);
  const removeDocument = useNotepadStore((state) => state.removeDocument);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    workers?.connection
      .getMessageFactoryCertificate()
      .then((certificate) => {
        const userId = certificate.extensions?.userId;
        setUserId("" + userId);
      })
      .catch((err) => console.error("Error loading userId", err));
  }, [workers, setUserId]);

  // Handler for document updates. Saves to IDB, decrypts and updates view.
  const documentGroupEventCb = useMemo(() => {
    return proxy((event: SubscriptionMessage) => {
      const message = event.message as MessageUpdateDocument;

      if (message.document) {
        const docId = message.document.doc_id;
        syncDocumentIdentitiess([message.document], { userId })
          .then(async () => {
            if (workers && groupId) {
              await decryptGroupDocuments(workers, userId, groupId);

              const updatedDoc = await getGroupDocument(docId);
              if (updatedDoc?.decrypted) {
                // Update documents on display
                updateDocument(updatedDoc);
              } else {
                console.warn(
                  "Error retrieving updated document, keeping the old version for display",
                );
              }
            } else {
              console.warn("Workers/groupId not initialized");
            }
          })
          .catch((err) =>
            console.error("Error updating document from listener", err),
          );
      } else if (message.supprime !== undefined) {
        // This is a delete/restore event
        const docId = message.doc_id;
        if (docId && message.supprime) {
          deleteGroupDocument(docId)
            .then(() => {
              if (docId) {
                removeDocument(docId); // Remove from view
              }
            })
            .catch((err) => console.error("Error deleting document", err));
        }
      }
    });
  }, [workers, userId, groupId, updateDocument, removeDocument]);

  useEffect(() => {
    if (!workers || !userId || !groupId) return;

    // Register document listener for group
    workers.connection
      .subscribeUserGroupDocument(groupId, documentGroupEventCb)
      .catch((err) =>
        console.error("Error subscribing to category/group events", err),
      );

    // Sync documents of this group
    syncGroupDocuments(workers, userId, groupId, setGroupDocuments);

    return () => {
      // Remove listener for document changes on group
      if (workers && groupId) {
        workers.connection
          .unsubscribeUserGroupDocument(groupId, documentGroupEventCb)
          .catch((err) =>
            console.error("Error unsubscribing from document events", err),
          );
      }
    };
  }, [
    workers,
    ready,
    userId,
    groupId,
    documentGroupEventCb,
    setGroupDocuments,
  ]);

  return <></>;
}

export default SyncGroupDocuments;

type MessageUpdateDocument = {
  doc_id?: string;
  supprime?: string;
  document?: NotepadDocumentType;
};

async function syncGroupDocuments(
  workers: AppWorkers,
  userId: string,
  groupId: string,
  setGroupDocuments: (groupDocuments: Array<NotepadDocumentType>) => void,
) {
  console.debug("syncGroupDocuments userId: %s, groupId: %s", userId, groupId);
  const groupDocuments = await workers.connection.getNotepadDocumentsForGroup(groupId);
  console.debug("Document identities:", groupDocuments);

  // Validate response
  if(!groupDocuments.ok) throw new Error(`Error getting documents: ${groupDocuments.err}`);
  if(groupDocuments.done !== true) {
    throw new Error('Paging not implemented for retriving group documents');
  }

  // Map response to IDB
  const documents = groupDocuments.documents || [];
  const supprimes = groupDocuments.supprimes;
  await syncDocumentIdentitiess(documents, userId, groupId, supprimes);

  // Retrieve dirty documents in batches
  await syncDirtyDocumentsFromGroup(workers, userId, groupId);

  // Set group documents from IDB
  const userGroupDocuments = await getUserGroupDocuments(userId, groupId, true);
  setGroupDocuments(userGroupDocuments);
}

async function syncDirtyDocumentsFromGroup(workers: AppWorkers, userId: string, groupId: string) {
  console.debug("Sync all dirty documents from groupId", groupId);
  const dirtyDocIds = await getDirtyDocumentsIdsForGroup(userId, groupId);
  console.debug("Dirty doc ids", dirtyDocIds);
  if(dirtyDocIds.length > 0) {
    const response = await workers.connection.getDocumentsContent(groupId, dirtyDocIds);
    console.debug("Dirty doc response", response);
    if(!response.documents || !response.ok) throw new Error(`Error retrieving document content: ${response.err}`);
    // Sync and decrypt documents
    await syncDocuments(response.documents, userId, groupId);
    await decryptGroupDocuments(workers, userId, groupId);
  }
}

// async function syncGroupDocuments(
//   workers: AppWorkers,
//   userId: string,
//   groupId: string,
//   setGroupDocuments: (groupDocuments: Array<NotepadDocumentType>) => void,
// ) {
//   const callback = proxy(
//     async (response: MessageResponse | NotepadDocumentsResponse) => {
//       const documentsForGroup = response as NotepadDocumentsResponse;
//       if (documentsForGroup.ok === false) {
//         console.warn(
//           "Error response received on document sync",
//           documentsForGroup.err,
//         );
//         return;
//       } else if (
//         documentsForGroup.ok === true &&
//         documentsForGroup.code === 1
//       ) {
//         // Ok, streaming has started.
//         return;
//       }

//       const groupDocuments = documentsForGroup.documents;
//       const dateSync = documentsForGroup.date_sync;

//       if (groupDocuments) {
//         // Save to IDB
//         await syncDocuments(groupDocuments, {
//           userId,
//           deleted: documentsForGroup.supprimes,
//           groupId,
//           dateSync,
//         });
//       } else {
//         console.warn(
//           "No document list received in document sync batch ",
//           documentsForGroup,
//         );
//       }

//       if (documentsForGroup.done) {
//         // Decrypt all encrypted documents
//         await decryptGroupDocuments(workers, userId, groupId);
//         const groupDocuments = await getUserGroupDocuments(userId, groupId, true);
//         setGroupDocuments(groupDocuments);
//       }
//     },
//   );

//   const groupIdb = await getUserGroup(groupId);
//   const previousDateSync = groupIdb?.dateSync;

//   const initialStreamResponse =
//     await workers.connection.getNotepadDocumentsForGroupStreamed(
//       groupId,
//       callback,
//       undefined,
//       previousDateSync,
//     );
//   if (!initialStreamResponse === true) {
//     throw new Error("Error getting documents for this group");
//   }
// }
