import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow, ViewMode } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { useVisibility } from 'reactjs-visibility';

import FolderIcon from '../resources/icons/folder-svgrepo-com-duotoneicon.svg';
import FileIcon from '../resources/icons/file-svgrepo-com.svg';
import PdfIcon from '../resources/icons/document-filled-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';
import useWorkers from "../workers/workers";
import { loadTuuid, updateFilesIdb } from "./idb/collections2StoreIdb";
import useConnectionStore from "../connectionStore";
import { useParams } from "react-router-dom";

export type FileListPaneOnClickRowType = (
    e: MouseEvent<HTMLButtonElement | HTMLDivElement>, 
    tuuid:string, 
    typeNode:string, 
    range: TuuidsBrowsingStoreRow[] | null
) => void;

type FileListPaneProps = {
    files: TuuidsBrowsingStoreRow[] | null,
    sortKey?: string | null,
    sortOrder?: number | null,
    dateColumn?: string | null,
    onClickRow: FileListPaneOnClickRowType,
    columnNameOnly?: boolean | null,
}

function FilelistPane(props: FileListPaneProps) {

    let { files, sortKey, sortOrder, dateColumn, onClickRow, columnNameOnly } = props;
    let viewMode = useUserBrowsingStore(state=>state.viewMode);

    let [cursorItemPosition, setCursorItemPosition] = useState('');

    let sortedFiles = useMemo(()=>{
        if(!files) return null;

        let sortedFiles = [...files];
        if(!sortKey || sortKey === 'name') {
            sortedFiles.sort(sortByName)
        } else if(sortKey === 'modification') {
            sortedFiles.sort(sortByModification);
        } else if(sortKey === 'size') {
            sortedFiles.sort(sortBySize);
        }
        if(sortOrder && sortOrder < 0) {
            sortedFiles = sortedFiles.reverse();
        }

        return sortedFiles;
    }, [files, sortKey, sortOrder]);

    let onClickRowHandler = useCallback((e: MouseEvent<HTMLButtonElement | HTMLDivElement>, item: TuuidsBrowsingStoreRow | null)=>{
        e.preventDefault();
        e.stopPropagation();
        if(item) {
            let tuuid = item.tuuid;
            setCursorItemPosition(tuuid);
            let range = null as TuuidsBrowsingStoreRow[] | null;
            if(sortedFiles && e.shiftKey && cursorItemPosition) {
                // Calculate range
                let idxStart = sortedFiles.map(item=>item.tuuid).indexOf(cursorItemPosition);
                let idxEnd = sortedFiles.map(item=>item.tuuid).indexOf(tuuid);
                if(idxStart > idxEnd) {
                    // Swap
                    let idxTemp = idxStart;
                    idxStart = idxEnd;
                    idxEnd = idxTemp;
                }
                range = sortedFiles.slice(idxStart, idxEnd+1);
            }
            onClickRow(e, item.tuuid, item.type_node, range);
        } else {
            setCursorItemPosition('');  // Reset
        }
    }, [onClickRow, cursorItemPosition, sortedFiles, setCursorItemPosition]);

    if(viewMode === ViewMode.Thumbnails) return <ThumbnailView onClick={onClickRowHandler} files={sortedFiles} />;
    if(viewMode === ViewMode.Carousel) throw new Error('todo');

    return <ListView onClick={onClickRowHandler} files={sortedFiles} dateColumn={dateColumn} columnNameOnly={columnNameOnly} />;
}

export default FilelistPane;

type ViewProps = {
    files: TuuidsBrowsingStoreRow[] | null, 
    dateColumn?: string | null, 
    onClick: (e: MouseEvent<HTMLButtonElement | HTMLDivElement>, item: TuuidsBrowsingStoreRow | null)=>void    
}

function ListView(props: ViewProps & {columnNameOnly?: boolean | null}) {
    let { files, dateColumn, onClick, columnNameOnly } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;
        return files.map(item=>{
            return <FileRow key={item.tuuid} value={item} dateColumn={dateColumn} onClick={onClick} columnNameOnly={columnNameOnly} />
        })
    }, [files, dateColumn, columnNameOnly, onClick]);

    return (
        <>
            <div className='grid grid-cols-12 bg-slate-800 text-sm user-select-none'>
                <div className='col-span-7 px-1'>Name</div>
                {columnNameOnly?<></>:<p className='col-span-1 px-1'>Size</p>}
                {columnNameOnly?<></>:<p className='col-span-2 px-1'>Type</p>}
                {columnNameOnly?<></>:<p className='col-span-2 px-1'>Date</p>}
            </div>
            {mappedFiles}
        </>
    );
}

function ThumbnailView(props: ViewProps) {
    let { files, onClick } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;
        return files.map(item=>{
            return <ThumbnailItem key={item.tuuid} value={item} onClick={onClick} />
        })
    }, [files, onClick]);

    return (
        <>
            {mappedFiles}
        </>
    );
}

function sortByName(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
    // NodeType first (Directory at top)
    if(a.type_node !== b.type_node) {
        // Fichier goes lower, Collection/Repertoire are equivalent
        if(a.type_node === 'Fichier') return 1;
        else return -1;
    }
    if(a.nom === b.nom) {
        return a.tuuid.localeCompare(b.tuuid);
    }
    return a.nom.localeCompare(b.nom);
}

function sortByModification(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
    if(a.modification === b.modification) {
        return a.tuuid.localeCompare(b.tuuid);
    }
    return a.modification - b.modification
}

function sortBySize(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
    // Directories/Collections do not have a size. Show first.
    if(!b.taille) return 1;
    if(!a.taille) return -1;
    // NodeType (Directory at top)
    if(a.type_node !== b.type_node) {
        // Fichier goes lower, Collection/Repertoire are equivalent
        if(a.type_node === 'Fichier') return 1;
        else return -1;
    }

    // Compare size
    if(a.taille === b.taille) {
        // Same size, sort by name / tuuid (same as name sort)
        if(a.nom === b.nom) {
            return a.tuuid.localeCompare(b.tuuid);
        }
        return a.nom.localeCompare(b.nom);
    }
    return a.taille - b.taille;
}

type FileItem = {
    value: TuuidsBrowsingStoreRow, 
    dateColumn?: string | null, 
    onClick:(e: MouseEvent<HTMLButtonElement | HTMLDivElement>, value: TuuidsBrowsingStoreRow | null)=>void
};

function FileRow(props: FileItem & {columnNameOnly?: boolean | null}) {
    
    let {value, dateColumn, onClick, columnNameOnly} = props;
    let selection = useUserBrowsingStore(state=>state.selection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);

    // let navigate = useNavigate();

    let [thumbnail, setThumbnail] = useState('');

    let dateValue = useMemo(()=>{
        if(!value) return null;
        if(dateColumn === 'modification') return value.modification;
        return value.dateFichier || value.modification;
    }, [value, dateColumn]);

    let onclickHandler = useCallback((e: MouseEvent<HTMLDivElement>)=>{
        onClick(e, value)
    }, [value, onClick]);

    useEffect(()=>{
        if(!value || !value.thumbnail) return;

        let objectUrl = URL.createObjectURL(value.thumbnail);
        setThumbnail(objectUrl);

        return () => {
            // Cleanup
            setThumbnail('');
            URL.revokeObjectURL(objectUrl);
        }
    }, [value]);

    let defaultIcon = useMemo(()=>getIcon(value.type_node, value.mimetype), [value]);

    let selectionCss = useMemo(()=>{
        if(selectionMode) {
            // Disable text select (copy/paste)
            if(selection?.includes(value.tuuid)) {
                return 'grid grid-cols-12 odd:bg-violet-600 even:bg-violet-500 hover:bg-violet-800 odd:bg-opacity-70 even:bg-opacity-70 text-sm cursor-pointer select-none';
            }
            return 'grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer select-none';
        }
        // Allow text select
        return 'grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer';
    }, [value, selection, selectionMode]);

    return (
        <div key={value.tuuid} onClick={onclickHandler}
            className={selectionCss}>
            <div className='col-span-7 px-1'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <img src={defaultIcon} className='w-4 mr-1 ml-1 inline-block' alt='File icon' />
                }
                
                <span className='pl-3'>{value.nom}</span>
            </div>
            {columnNameOnly?
                <></>
                :
                <>
                    <p className='col-span-1 px-1'>
                        <Formatters.FormatteurTaille value={value.taille || undefined} />
                    </p>
                    <p className='col-span-2 px-1'>{value.mimetype}</p>
                    <p className='col-span-2 px-1'>
                        <Formatters.FormatterDate value={dateValue || undefined} />
                    </p>
                </>
            }
        </div>
    )
}

function ThumbnailItem(props: FileItem) {

    let {value, onClick} = props;
    let {contactId} = useParams();
    let { ref, visible } = useVisibility({});
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let filehostReady = useConnectionStore(state=>state.filehostAuthenticated);
    let updateThumbnail = useUserBrowsingStore(state=>state.updateThumbnail);
    let updateSharedThumbnail = useUserBrowsingStore(state=>state.updateSharedThumbnail);

    let defaultIcon = useMemo(()=>getIcon(value.type_node, value.mimetype), [value]);
    let [thumbnail, setThumbnail] = useState('');
    // let [smallImage, setSmallImage] = useState('');

    let imgSrc = useMemo(()=>{
        // if(fileIcon) return ImageIcon;
        if(thumbnail) return thumbnail;
        return defaultIcon;
    }, [defaultIcon, thumbnail]);

    let onclickHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        onClick(e, value)
    }, [value, onClick]);

    useEffect(()=>{
        if(!workers || !ready || !filehostReady) return;    // Not ready
        if(value.thumbnailDownloaded) return;               // High quality thumbnail already downloaded, nothing to do
        if(!visible) return;                                // Not visible
        
        Promise.resolve()
            .then(async ()=>{
                if(!workers) throw new Error('workers not initialized');
                let tuuid = value.tuuid;
                let file = await loadTuuid(tuuid);

                let secretKey = file?.secretKey;
                let fileData = file?.fileData
                let images = file?.fileData?.images;
                if(file && secretKey && fileData && images && images.small) {
                    let smallImageInfo = images.small;
            
                    let fuuid = smallImageInfo.hachage;

                    if(!smallImageInfo.nonce && smallImageInfo.header) {
                        // Legacy, replace the nonce with header
                        smallImageInfo.nonce = smallImageInfo.header.slice(1);  // Remove the leading 'm' multibase marker
                    }

                    // let fuuid = fileData.fuuids_versions?fileData.fuuids_versions[0]:null;
                    if(fuuid) {
                        let imageBlob = await workers.directory.openFile(fuuid, secretKey, smallImageInfo);
                        
                        // Save high quality thumbnail to IDB
                        file.thumbnail = imageBlob;
                        file.thumbnailDownloaded = true;
                        await updateFilesIdb([file]);
                        
                        // Reload on screen
                        if(!contactId) {
                            updateThumbnail(tuuid, imageBlob);
                        } else {
                            updateSharedThumbnail(tuuid, imageBlob);
                        }
                    }
                }
            })
            .catch(err=>console.error("Error loading small image", err));
    }, [workers, value, visible, ready, filehostReady, contactId, updateThumbnail, updateSharedThumbnail]);

    useEffect(()=>{
        if(!value || !value.thumbnail) return;

        let objectUrl = URL.createObjectURL(value.thumbnail);
        setThumbnail(objectUrl);

        return () => {
            // Cleanup
            setThumbnail('');
            URL.revokeObjectURL(objectUrl);
        }
    }, [value, setThumbnail]);

    return (
        <button ref={ref} className="inline-block m-1 border relative" onClick={onclickHandler} value={value.tuuid}>
            <p className='text-sm break-all font-bold absolute align-center bottom-0 bg-slate-800 w-full bg-opacity-70 px-1 pb-1'>{value.nom}</p>
            <img src={imgSrc} alt={'File ' + value.nom} width={200} height={200} className='opacity-100' />
        </button>
    );
}

function getIcon(typeNode: string, mimetype?: string | null) {
    if(typeNode === 'Fichier') {
        if(!mimetype) return FileIcon;
        else if(mimetype === 'application/pdf') return PdfIcon;
        else if(mimetype.startsWith('image')) return ImageIcon;
        else if(mimetype.startsWith('video')) return VideoIcon;
        return FileIcon;
    } else {
        return FolderIcon;
    }
}

