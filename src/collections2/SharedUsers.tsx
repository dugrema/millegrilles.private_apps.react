import { MouseEvent, useCallback, useEffect, useMemo } from "react";
import useUserBrowsingStore, { Collection2SharedWithUser, filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Link, useNavigate, useParams } from "react-router-dom";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { Collections2SharedContactsUser } from "../workers/connection.worker";
import FilelistPane, { FileListPaneOnClickRowType } from "./FilelistPane";

function SharedUsers() {

    let {userId} = useParams();

    let setSharedCuuid = useUserBrowsingStore(state=>state.setSharedCuuid);
    let setSharedCollection = useUserBrowsingStore(state=>state.setSharedCollection);
    
    useEffect(()=>{
        // Reset browsing values
        setSharedCuuid(null);
        setSharedCollection(null);
    }, [setSharedCuuid, setSharedCollection]);

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
                <li key={item.user_id}>
                    <Link to={'/apps/collections2/c/' + item.user_id}
                        className='underline font-bold'>
                            {item.nom_usager}
                    </Link>
                </li>
            )
        });
    }, [sharedWithUser]);

    useEffect(()=>{
        setSharedContact(null);
    }, [setSharedContact])

    return (
        <section>
            <Breadcrumb />
            <h1 className='pt-2 pb-2'>Users sharing collections with you</h1>
            <ol>
                {userElems}
            </ol>
        </section>
    )
}

function SharedFromUser(props: {userId: string}) {

    let navigate = useNavigate();
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let userId = props.userId;
    let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    let setSharedContact = useUserBrowsingStore(state=>state.setSharedContact);
    let updateSharedCurrentDirectory = useUserBrowsingStore(state=>state.updateSharedCurrentDirectory);
    let sharedCurrentDirectory = useUserBrowsingStore(state=>state.sharedCurrentDirectory);
    
    let sharedCollections = useMemo(()=>{
        if(!sharedWithUser?.sharedCollections || !sharedCurrentDirectory) return null;
        return sharedWithUser.sharedCollections.filter(item=>item.user_id === userId).map(item=>{
            if(!sharedCurrentDirectory) throw new Error('sharedCurrentDirectory not initialized');
            return sharedCurrentDirectory[item.tuuid];
        }).filter(item=>item);
    }, [userId, sharedWithUser, sharedCurrentDirectory]);

    let sharedContact = useMemo(()=>{
        if(!userId || !sharedWithUser?.users) {
            setSharedContact(null);
            return;
        };
        return sharedWithUser.users.filter(item=>item.user_id === userId).pop();
    }, [userId, sharedWithUser, setSharedContact]);

    let onClickRowHandler = useCallback((e, tuuid, typeNode, range)=>{
        if(sharedWithUser?.sharedCollections) {
            let collection = sharedWithUser.sharedCollections.filter(item=>item.tuuid === tuuid && item.user_id === userId).pop();
            if(collection) {
                navigate(`/apps/collections2/c/${collection.contact_id}/b/${tuuid}`);
            }
        }
    }, [navigate, userId, sharedWithUser]) as FileListPaneOnClickRowType;

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
            <Breadcrumb sharedContact={sharedContact} />

            <section className='pt-3'>
                <FilelistPane files={sharedCollections} onClickRow={onClickRowHandler} />
            </section>
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
    
    if(sharedCollections.files) {
        let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, sharedCollections.files, sharedCollections.keys);
        // Save files in store
        let storeFiles = filesIdbToBrowsing(files);
        updateSharedCurrentDirectory(storeFiles);
    }
}

type BreadcrumbProps = {
    sharedContact?: Collections2SharedContactsUser
}

export function Breadcrumb(props: BreadcrumbProps) {

    let { sharedContact } = props;

    if(!sharedContact) return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                    Shares
                </li>
            </ol>
        </nav>
    );

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <Link to='/apps/collections2/c'>Shares</Link>
                    <span className="pointer-events-none ml-2 text-slate-300">&gt;</span>
                </li>
                <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                    {sharedContact.nom_usager}
                </li>
            </ol>
        </nav>
    );
}
