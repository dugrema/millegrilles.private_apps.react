import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';

import { FileComment, loadTuuid, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import useUserBrowsingStore from "./userBrowsingStore";
import { DirectorySyncHandler } from "./UserFileBrowsing";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { DetailFileViewLayout } from "./FileViewing";
import ActionButton from "../resources/ActionButton";
import { Formatters } from "millegrilles.reactdeps.typescript";

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
                <div className='md:relative md:-top-8 lg:-top-12 xl:-top-28'>
                    <h2 className='font-bold text-lg pb-2'>Comments</h2>
                    <AddComment file={file} refreshTrigger={updateFileHandler} />
                    <FileComments file={file} deleteHandler={deleteCommentHandler} />
                </div>
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

type FileCommentsProps = {file: TuuidsIdbStoreRowType | null, deleteHandler: (commentId: MouseEvent<HTMLButtonElement>)=>Promise<void>};

function FileComments(props: FileCommentsProps) {
    const {file, deleteHandler} = props;
    const comments = file?.decryptedComments;

    const ready = useConnectionStore(state=>state.workersReady);

    const sortedComments = useMemo(()=>{
        if(!comments) return null;
        const commentCopy = [...comments];
        commentCopy.sort((a, b)=>b.date - a.date);
        return commentCopy;
    }, [comments]) as FileComment[] | null;

    if(!sortedComments) return <></>;

    const plugins = [remarkGfm, remarkRehype];

    const elems = sortedComments.map((item, idx)=>{
        let contentString = 'N/A';        
        if(item.comment) {
            contentString = (item.user_id?'':'## System generated\n\n') + item.comment;
        } else if(item.tags) {
            contentString = '## Tags\n\n ' + item.tags.join(', ');
        }
        return (
            <div key={item.comment_id} className='grid grid-cols-3 lg:grid-cols-12 mb-4 hover:bg-violet-600/50'>
                <p className='col-span-2 lg:col-span-2 bg-violet-800/50 lg:bg-violet-800/25'>
                    <Formatters.FormatterDate value={item.date} />
                </p>
                <div className='lg:hidden text-right bg-violet-800/50 lg:bg-violet-800/25'>
                    <ActionButton onClick={deleteHandler} disabled={!ready || !deleteHandler} confirm={true} value={item.comment_id} varwidth={10}>
                            X
                    </ActionButton>
                </div>
                <div className='col-span-3 lg:col-span-9 markdown pb-2 lg:pb-1 bg-violet-800/25'>
                    <Markdown remarkPlugins={plugins}>{contentString}</Markdown>
                </div>
                <div className='hidden lg:block'>
                    <ActionButton onClick={deleteHandler} disabled={!ready || !deleteHandler} confirm={true} value={item.comment_id} varwidth={10}>
                            X
                    </ActionButton>
                </div>
            </div>
        )
    });

    return (
        <>
            {elems}
        </>
    );
}

type FileAddProps = {file: TuuidsIdbStoreRowType | null, refreshTrigger: ()=>Promise<void>};

function AddComment(props: FileAddProps) {

    const {file, refreshTrigger} = props;

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.workersReady);

    const [comment, setComment] = useState('');
    const commentOnChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>)=>setComment(e.currentTarget.value), [setComment]);

    const addHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not intialized');
        if(!file?.secretKey) throw new Error('File key not ready');
        if(!comment) throw new Error('No comment / empty comment provided');
        const encryptedComment = await workers.encryption.encryptMessageMgs4ToBase64({comment}, file.secretKey);
        const keyId = file.keyId || file.encryptedMetadata?.cle_id;
        if(!keyId) throw new Error('Missing key id, unable to encrypt comment')
        encryptedComment.cle_id = keyId;
        delete encryptedComment.digest;
        delete encryptedComment.cle;
        delete encryptedComment.cleSecrete;
        const response = await workers.connection.collection2AddFileComment(file.tuuid, encryptedComment);
        if(response.ok !== true) throw new Error('Error adding comment: ' + response.err);
        
        // Reset comment
        setComment('');
        if(refreshTrigger) await refreshTrigger()
    }, [workers, ready, file, comment, setComment, refreshTrigger]);

    return (
        <div className='grid grid-cols-12 px-2 pb-4'>
            <textarea value={comment} onChange={commentOnChange} 
                placeholder='Add a comment here.'
                className='text-black rounded-md p-0 h-24 sm:p-1 sm:h-24 col-span-12 w-full col-span-12 md:col-span-11' />
            <ActionButton onClick={addHandler} disabled={!ready || !comment} revertSuccessTimeout={3}
                className='varbtn w-20 md:w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    Add
            </ActionButton>
        </div>
    )
}
