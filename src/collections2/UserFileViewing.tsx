import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { loadTuuid, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import useUserBrowsingStore from "./userBrowsingStore";
import { DirectorySyncHandler } from "./UserFileBrowsing";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { DetailFileViewLayout, ViewFileComments } from "./FileViewing";

function UserFileViewing() {

    let {tuuid} = useParams();
    let navigate = useNavigate();
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);

    let [file, setFile] = useState(null as TuuidsIdbStoreRowType | null);
    let cuuid = useMemo(()=>{
        if(!file) return null;
        return file.parent;
    }, [file]) as string | null;

    let thumbnailBlob = useMemo(()=>{
        if(!file) return null;
        return file.thumbnail;
    }, [file]);

    let breacrumbOnClick = useCallback((tuuid: string | null)=>{
        if(tuuid) {
            navigate('/apps/collections2/b/' + tuuid);
        } else {
            navigate('/apps/collections2/b');
        }
    }, [navigate]);

    const updateFileHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!tuuid) throw new Error('Tuuid not provided');
        // console.debug("Update file ", tuuid);
        const response = await workers.connection.getFilesByTuuid([tuuid])
        if(!workers) throw new Error('workers not initialzed');
        if(!userId) throw new Error('User id is null');
        
        if(response.ok === false) {
            throw new Error('Error loading file: ' + response.err);
        }
        if(response.files?.length === 1 && response.keys?.length === 1) {
            let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys);
            // Update file on screen
            if(files.length === 1) {
                setFile(files[0])
            }
        } else {
            throw new Error(`Error loading file, mising content or key for tuuid:${tuuid}`);
        }
    }, [workers, ready, tuuid]);

    const deleteCommentHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
        if(!workers || !ready) throw new Error("Workers not initialized");
        if(!tuuid) throw new Error('No file tuuid provided');
        const commentId = e.currentTarget.value;
        // console.debug(`Delete comment ${commentId} of tuuid ${tuuid}`);
        const response = await workers.connection.deleteCollection2Comment(tuuid, commentId);
        if(response.ok !== true) throw new Error(`Error deleting comment: ${response.err}`);
        await updateFileHandler();
    }, [workers, ready, tuuid, updateFileHandler]);

    useEffect(()=>{
        if(tuuid && userId) {
            loadTuuid(tuuid, userId).then(file=>setFile(file))
                .catch(err=>console.error("Error loading file", err));
        } else {
            setFile(null);
        }
    }, [setFile, tuuid, userId]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !tuuid) return;
        updateFileHandler()
            .catch(err=>console.error("Error loading file %s: %O", tuuid, err));
    }, [workers, ready, updateFileHandler]);

    return (
        <>
            <section className='fixed top-10 md:top-12'>
                <Breadcrumb onClick={breacrumbOnClick} file={file} />
            </section>

            <section className='fixed top-20 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                <DetailFileViewLayout file={file} thumbnail={thumbnailBlob} />
                <ViewFileComments file={file} thumbnail={thumbnailBlob} updateFileHandler={updateFileHandler} deleteCommentHandler={deleteCommentHandler} />
            </section>
            
            <DirectorySyncHandler tuuid={cuuid} />
        </>
    )
}

export default UserFileViewing;

type BreadcrumbProps = {
    onClick?: (tuuid: string | null) => void,
    file: TuuidsIdbStoreRowType | null,
}

function Breadcrumb(props: BreadcrumbProps) {

    let { onClick, file } = props;

    let username = useConnectionStore(state=>state.username);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick]);

    let breadcrumbMapped = useMemo(()=>{
        if(!file || !breadcrumb) return null;
        let breadcrumbMapped = [];
        breadcrumbMapped = breadcrumb;

        let mappedDirectories = breadcrumbMapped.map(item=>{
            return (
                <div key={item.tuuid} 
                    className='inline cursor-pointer pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        {onClick?
                            <p className='inline' onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                        :
                            <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
                        }
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </div>
            )
        });

        let rootUser = (
            <div key='root' className='inline cursor-pointer pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                <Link to={'/apps/collections2/b/root'}>{username}</Link>
                <span className="pointer-events-none  ml-2 text-slate-400 font-bold">&gt;</span>
            </div>
        )

        let fileElem =(
            <div key={file.tuuid} className='inline items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                {file.decryptedMetadata?.nom}
            </div>
        );

        return [rootUser, ...mappedDirectories, fileElem];
    }, [username, file, breadcrumb, onClick, onClickHandler]);

    if(!breadcrumbMapped) return <p>Loading ...</p>;

    return (
        <nav aria-label='breadcrumb' className='w-screen leading-3 pr-2 line-clamp-2'>
            {breadcrumbMapped}
        </nav>
    );
}

