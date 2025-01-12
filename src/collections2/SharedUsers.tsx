import { useEffect, useMemo } from "react";
import useUserBrowsingStore, { Collection2SharedWithUser, filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Link, useParams } from "react-router-dom";
import { Breadcrumb } from "./SharedFileBrowsing";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";

function SharedUsers() {

    let {userId} = useParams();

    if(userId) return <SharedFromUser userId={userId} />;
    else return <UserList />;
}

export default SharedUsers;

function UserList() {
    let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    let setSharedContact = useUserBrowsingStore(state=>state.setSharedContact);
    let userElems = useMemo(()=>{
        if(!sharedWithUser?.users) return <></>;
        return sharedWithUser.users.map(item=>{
            return (
                <div key={item.user_id}>
                    <Link to={'/apps/collections2/c/' + item.user_id}>{item.nom_usager}</Link>
                </div>
            )
        });
    }, [sharedWithUser]);

    useEffect(()=>{
        setSharedContact(null);
    }, [setSharedContact])

    return (
        <section>
            <Breadcrumb />
            <h1>Users sharing collections with you</h1>
            {userElems}
        </section>
    )
}

function SharedFromUser(props: {userId: string}) {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = props.userId;
    let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    let setSharedContact = useUserBrowsingStore(state=>state.setSharedContact);
    let updateSharedCurrentDirectory = useUserBrowsingStore(state=>state.updateSharedCurrentDirectory);
    let sharedCurrentDirectory = useUserBrowsingStore(state=>state.sharedCurrentDirectory);
    
    let collectionsElem = useMemo(()=>{
        if(!sharedWithUser?.sharedCollections || !sharedCurrentDirectory) return <></>;
        return sharedWithUser.sharedCollections.filter(item=>item.user_id === userId).map(item=>{
            let name = item.tuuid;
            if(sharedCurrentDirectory) {
                let info = sharedCurrentDirectory[item.tuuid];
                if(info) {
                    name = info.nom;
                }
            }
            return (
                <div key={item.tuuid}>
                    <Link to={`/apps/collections2/c/${item.contact_id}/b/${item.tuuid}`}>{name}</Link>
                </div>
            )
        });
    }, [userId, sharedWithUser, sharedCurrentDirectory]);

    let sharedContact = useMemo(()=>{
        if(!userId || !sharedWithUser?.users) {
            setSharedContact(null);
            return;
        };
        return sharedWithUser.users.filter(item=>item.user_id === userId).pop();
    }, [userId, sharedWithUser]);

    useEffect(()=>{
        setSharedContact(sharedContact || null);
    }, [sharedContact, setSharedContact]);

    useEffect(()=>{
        if(!workers || !ready || !sharedWithUser || !userId) return;
        updateSharedCurrentDirectory(null);  // Clear
        synchronizeSharedCollections(workers, userId, sharedWithUser, updateSharedCurrentDirectory)
            .catch(err=>console.error("Error loading shared collections", err));
    }, [workers, ready, userId, sharedWithUser, updateSharedCurrentDirectory]);

    return (
        <>
            <Breadcrumb />
            {collectionsElem}
        </>
    )
}

async function synchronizeSharedCollections(workers: AppWorkers, userId: string, sharedWithUser: Collection2SharedWithUser, 
    updateSharedCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void) 
{
    if(!sharedWithUser.sharedCollections) {
        throw new Error('Shared collections not loaded properly');
    }

    let tuuids = sharedWithUser.sharedCollections.map(item=>item.tuuid);
    let sharedCollections = await workers.connection.getFilesByTuuid(tuuids, {shared: true});
    console.debug("Shared collections: %O", sharedCollections);
    
    if(sharedCollections.files) {
        let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, sharedCollections.files, sharedCollections.keys);
        // Save files in store
        let storeFiles = filesIdbToBrowsing(files);
        updateSharedCurrentDirectory(storeFiles);
    }
}
