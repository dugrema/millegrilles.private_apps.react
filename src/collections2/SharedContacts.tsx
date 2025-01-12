import { useEffect } from "react";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import useUserBrowsingStore from "./userBrowsingStore";
import { Outlet } from "react-router-dom";

function SharedContacts() {

    return (
        <>
            <Outlet />
            <SyncSharedContacts />
        </>
    );
}

export default SharedContacts;

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
            let contacts = await workers.connection.getCollections2Contacts();
            // Shared with this account
            let sharedContactsWithUser = await workers.connection.getCollections2SharedContactsWithUser();
            console.debug("Contacts: %O, shared with: %O", contacts, sharedContactsWithUser);
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
