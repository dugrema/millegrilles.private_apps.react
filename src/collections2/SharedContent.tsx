import { useEffect, useState } from "react";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import useUserBrowsingStore from "./userBrowsingStore";
import { Outlet, useNavigate, useParams } from "react-router-dom";

function SharedContent() {

    return (
        <>
            <Outlet />
            <SyncSharedContacts />
            <BackToDirectory />
        </>
    );
}

export default SharedContent;

function SyncSharedContacts() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setSharedWithUser = useUserBrowsingStore(state=>state.setSharedWithUser);

    useEffect(()=>{
        if(!workers || !ready) return;

        // Start listing to shared contact changes, new shared collections
        //TODO

        Promise.resolve().then(async () => {
            if(!workers || !ready) throw new Error("Workers not initialized");
            // Contacts for this account
            //let contacts = await workers.connection.getCollections2Contacts();
            // Shared with this account
            let sharedContactsWithUser = await workers.connection.getCollections2SharedContactsWithUser();
            setSharedWithUser({
                sharedCollections: sharedContactsWithUser.partages || null, 
                users: sharedContactsWithUser.usagers || null
            });
        })
        .catch(err=>console.error("Error loading shared contacts", err));

        return () => {
            // Stop listening to shared contacts changes, new shared collections
            //TODO
        }

    }, [workers, ready, setSharedWithUser]);

    return <></>;
}

/** Puts user back to last browsing position */
function BackToDirectory() {
    let {contactId, userId, tuuid} = useParams();

    let navigate = useNavigate();

    let [latch, setLatch] = useState(false);

    let sharedContact = useUserBrowsingStore(state=>state.sharedContact);
    let sharedCollection = useUserBrowsingStore(state=>state.sharedCollection);
    let sharedCuuid = useUserBrowsingStore(state=>state.sharedCuuid);

    useEffect(()=>{
        if(latch) return;  // Already loaded once
        setLatch(true);
        if(contactId || userId || tuuid) return;  // Nothing to do
        if(sharedContact) {
            if(sharedCollection) {
                if(sharedCuuid) {
                    // Go back to directory
                    navigate(`/apps/collections2/c/${sharedCollection.contact_id}/b/${sharedCuuid}`)
                } else {
                    navigate(`/apps/collections2/c/${sharedCollection.contact_id}/b/${sharedCollection.tuuid}`)
                }
            } else {
                // Go back to user
                let userId = sharedContact.user_id;
                navigate(`/apps/collections2/c/${userId}`)
            }
        }
    }, [navigate, contactId, userId, tuuid, sharedContact, sharedCuuid, sharedCollection, latch, setLatch]);

    return <></>;
}