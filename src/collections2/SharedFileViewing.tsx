import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { DetailFileViewLayout } from "./FileViewing";
import { loadTuuid, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import useUserBrowsingStore from "./userBrowsingStore";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DirectorySyncHandler } from "./SharedFileBrowsing";

function SharedFileViewing() {
    let {tuuid, contactId} = useParams();
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);

    let [file, setFile] = useState(null as TuuidsIdbStoreRowType | null);
    let cuuid = useMemo(()=>{
        // console.debug("Shared file %O, cuuid: %s", file, file?.parent);
        if(!file) return null;
        return file.parent;
    }, [file]) as string | null;

    let thumbnailBlob = useMemo(()=>{
        if(!file) return null;
        return file.thumbnail;
    }, [file]) as Blob | null;

    let setSharedContact = useUserBrowsingStore(state=>state.setSharedContact);
    let sharedWithUser = useUserBrowsingStore(state=>state.sharedWithUser);
    let setSharedCollection = useUserBrowsingStore(state=>state.setSharedCollection);

    useEffect(()=>{
        if(!sharedWithUser?.sharedCollections || !contactId) {
            setSharedCollection(null);
        } else {
            let sharedCollection = sharedWithUser.sharedCollections.filter(item=>item.contact_id === contactId).pop();
            // console.debug("Setting shared collection", sharedCollection);
            setSharedCollection(sharedCollection || null);
            if(sharedCollection && sharedWithUser?.users) {
                let sharedUserId = sharedCollection.user_id;
                let sharedContact = sharedWithUser.users.filter(item=>item.user_id === sharedUserId).pop();
                // console.debug("Setting shared contact ", sharedContact);
                setSharedContact(sharedContact || null);
            }
        }
    }, [sharedWithUser, contactId, setSharedCollection, setSharedContact]);

    useEffect(()=>{
        if(tuuid && userId) {
            loadTuuid(tuuid, userId).then(file=>setFile(file))
            .catch(err=>console.error("Error loading file", err));
        } else {
            setFile(null);
        }
    }, [setFile, tuuid, contactId, userId]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !tuuid || !contactId) return;
        workers.connection.getFilesByTuuid([tuuid], {contact_id: contactId})
            .then(async response => {
                if(!workers) throw new Error('workers not initialzed');
                if(!userId) throw new Error('User id is null');
                
                if(response.ok === false) {
                    throw new Error('Error loading file: ' + response.err);
                }
                if(response.files?.length === 1 && response.keys?.length === 1) {
                    let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys, {shared: true});
                    // Update file on screen
                    if(files.length === 1) {
                        setFile(files[0])
                    }
                } else {
                    console.warn("Error loading file, mising content or key for tuuid", tuuid);
                }
            })
            .catch(err=>console.error("Error loading file %s: %O", tuuid, err));
    }, [workers, ready, tuuid, userId, contactId]);

    return (
        <>
            <section className='fixed top-12 pt-1'>
                <Breadcrumb contactId={contactId} file={file} />
            </section>

            <section className='fixed top-20 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <DetailFileViewLayout file={file} thumbnail={thumbnailBlob} />
            </section>
            
            <DirectorySyncHandler tuuid={cuuid} />
        </>
    )
}

export default SharedFileViewing;

type BreadcrumbProps = {
    // onClick?: (tuuid: string | null) => void,
    file: TuuidsIdbStoreRowType | null,
    contactId?: string,
}

function Breadcrumb(props: BreadcrumbProps) {

    let {contactId, file} = props;

    let sharedContact = useUserBrowsingStore(state=>state.sharedContact);
    let breadcrumb = useUserBrowsingStore(state=>state.sharedBreadcrumb);
    let navigate = useNavigate();

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!contactId) throw new Error("Contact_id is null");
        let value = e.currentTarget.dataset.tuuid || null;
        navigate(`/apps/collections2/c/${contactId}/b/${value}`)
    }, [navigate, contactId])

    let breadcrumbMapped = useMemo(()=>{
        if(!sharedContact?.nom_usager || !breadcrumb) return <></>;
        return breadcrumb.filter(item=>item).map((item, idx)=>{
            return (
                <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
            )
        })
    }, [sharedContact, breadcrumb, onClickHandler]);

    if(!sharedContact) return <p className='text-sm'>Loading...</p>;  // Loading

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <Link to='/apps/collections2/c'>Shares</Link>
                    <span className="pointer-events-none ml-2 text-slate-300">&gt;</span>
                </li>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <Link to={`/apps/collections2/c/${sharedContact.user_id}`}>{sharedContact.nom_usager}</Link>
                    <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                </li>
                {breadcrumbMapped}
                <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                    {file?.decryptedMetadata?.nom}
                </li>
            </ol>
        </nav>
    );

    // let { onClick, file } = props;

    // let username = useConnectionStore(state=>state.username);
    // let breadcrumb = useUserBrowsingStore(state=>state.sharedBreadcrumb);

    // let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
    //     if(!onClick) return;
    //     let value = e.currentTarget.dataset.tuuid || null;
    //     onClick(value);
    // }, [onClick]);

    // let breadcrumbMapped = useMemo(()=>{
    //     if(!file || !breadcrumb) return null;
    //     let breadcrumbMapped = [];
    //     breadcrumbMapped = breadcrumb;

    //     let mappedDirectories = breadcrumbMapped.map(item=>{
    //         return (
    //             <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
    //                 {onClick?
    //                     <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
    //                 :
    //                     <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
    //                 }
                    
    //                 <span className="pointer-events-none ml-2 text-slate-800">/</span>
    //             </li>
    //         )
    //     });

    //     let rootUser = (
    //         <li key='root' className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50'>
    //             <Link to={'/apps/collections2/b/root'}>{username}</Link>
    //             <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
    //         </li>
    //     )

    //     let fileElem =(
    //         <li key={file.tuuid} className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
    //             {file.decryptedMetadata?.nom}
    //         </li>
    //     );

    //     return [rootUser, ...mappedDirectories, fileElem];
    // }, [username, file, breadcrumb, onClick, onClickHandler]);

    // if(!breadcrumbMapped) return <p>Loading ...</p>;

    // return (
    //     <nav aria-label='breadcrumb' className='w-max'>
    //         <ol className='flex w-full flex-wrap items-center'>
    //             {breadcrumbMapped}
    //         </ol>
    //     </nav>
    // );
}
