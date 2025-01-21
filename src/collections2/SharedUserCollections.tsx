import { MouseEvent, useCallback, useEffect, useState } from "react";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Link, useParams } from "react-router-dom";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { Collection2SharedCollection } from "../workers/connection.worker";
import { sortByName } from "./FilelistPane";
import ActionButton from "../resources/ActionButton";

import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';

function SharedUserCollections() {

    let {userId: sharedUserId} = useParams();
    let workers = useWorkers();

    let userId = useUserBrowsingStore(state=>state.userId);

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let [username, setUsername] = useState('');
    let [shares, setShares] = useState(null as Collection2SharedCollection[] | null)
    let [collections, setCollections] = useState(null as TuuidsBrowsingStoreRow[] | null);

    // let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    
    // let [user, collections] = useMemo(()=>{
    //     console.debug("UserId: %s, Shared: %O", userId, sharedWithUser);
    //     if(!userId || !sharedWithUser) return [null, null];
    //     let user = sharedWithUser.users?.filter(item=>item.user_id === userId).pop();
    //     let collections = sharedWithUser.sharedCollections?.filter(item=>item.user_id === userId);
    //     console.debug("User %O, Collections: %O", user, collections);
    //     return [user, collections]
    // }, [userId, sharedWithUser]);

    let deleteHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers || !ready) throw new Error('Workers not initialized');
        let value = e.currentTarget.value;
        console.debug("Delete shared tuuid", value);
        let item = shares?.filter(item=>item.tuuid === value).pop();
        if(item && item.contact_id) {
            workers.connection.removeShareCollection2Collection(item.tuuid, item.contact_id)
                .then(response=>{
                    if(response.ok === false) throw new Error("Error deleting shared collection: " + response.err);
                    if(collections) {
                        let udpatedCollections = collections.filter(item=>item.tuuid !== value);
                        setCollections(udpatedCollections);
                    }
                })
        } else {
            console.debug("Shared collections: ", collections);
            throw new Error('No matching shared collection for tuuid: ' + value);
        }
    }, [workers, ready, shares, collections, setCollections]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !sharedUserId) return;

        Promise.resolve().then(async()=>{
            if(!workers) throw new Error("Workers not initialized");
            if(!userId) throw new Error('userId is null');
            let sharesResponse = await workers.connection.getCollection2SharedCollections();
            console.debug("Shares: ", sharesResponse);
            if(sharesResponse.ok === false || !sharesResponse.partages) {
                throw new Error("Error loading shares: " + sharesResponse.err);
            }
            let contactsResponse = await workers.connection.getCollection2ContactList();
            console.debug("Contacts: ", contactsResponse);
            if(contactsResponse.ok === false || !contactsResponse.contacts) {
                throw new Error("Error loading contacts: " + contactsResponse.err);
            }

            let contacts = contactsResponse.contacts.filter(item=>item.user_id === sharedUserId);
            let username = '';
            let contactIds = new Set();
            for(let item of contacts) {
                username = item.nom_usager;
                contactIds.add(item.contact_id);
            }
            setUsername(username);
            
            let shares = sharesResponse.partages.filter(item=>contactIds.has(item.contact_id));

            if(shares.length > 0) {
                setShares(shares);
                let tuuids = shares.map(item=>item.tuuid);
                let sharedCollections = await workers.connection.getFilesByTuuid(tuuids);
                if(sharedCollections.ok === false) throw new Error("Error loading shared folders: " + sharedCollections.err);
                if(!sharedCollections.files) throw new Error("Error loading shared folders: no files returned");
                let collections = await workers.directory.processDirectoryChunk(
                    workers.encryption, userId, sharedCollections.files, sharedCollections.keys);
                console.debug("Shared collections: ", collections);
                let mappedCollections = filesIdbToBrowsing(collections);
                mappedCollections.sort(sortByName);
                console.debug("Mapped collections: ", mappedCollections);
                setCollections(mappedCollections);
            } else {
                setCollections([]);
                setShares(null);
            }
        })
        .catch(err=>console.error("Error loading shares", err));
    }, [workers, ready, userId, sharedUserId, setUsername, setCollections, setShares]);

    return (
        <>
            <section className='fixed top-12'>
                <h1 className='pt-2 pb-2 text-xl font-bold'>Collections shared with {username}</h1>
            </section>

            <section className='fixed top-24 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <nav className='pb-4'>
                    <Link to='/apps/collections2/c'
                        className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                            Back
                    </Link>
                </nav>
                <DisplayCollections value={collections} onDelete={deleteHandler} />
            </section>
        </>
    );
}

export default SharedUserCollections;

function DisplayCollections(props: {value: TuuidsBrowsingStoreRow[] | null, onDelete: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>}) {
    let {value, onDelete} = props;

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    if(!value) return <p>Loading ...</p>;

    if(value.length === 0) return <p>No collections shared</p>;

    let elems = value.map(item=>{
        return (
            <Link key={item.tuuid} to={`/apps/collections2/b/${item.tuuid}`}
                className="block odd:bg-slate-500 even:bg-slate-400 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm select-none">
                <ActionButton onClick={onDelete} value={item.tuuid} revertSuccessTimeout={3} varwidth={16} confirm={true} disabled={!ready} >
                    <img src={TrashIcon} alt="Remove user" className='w-6 inline' />
                </ActionButton>
                <span className='pl-2'>{item.nom}</span>
            </Link>
        )
    });

    return <>{elems}</>;
}
