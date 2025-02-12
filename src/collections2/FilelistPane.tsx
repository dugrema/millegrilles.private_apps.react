import { DragEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow, ViewMode } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { useVisibility } from 'reactjs-visibility';
import useWorkers from "../workers/workers";
import { loadTuuid, updateFilesIdb } from "./idb/collections2StoreIdb";
import useConnectionStore from "../connectionStore";
import { useParams } from "react-router-dom";
import { generateFileUploads } from "./transferUtils";

import FolderIcon from '../resources/icons/folder-svgrepo-com-duotoneicon.svg';
import FileIcon from '../resources/icons/file-svgrepo-com.svg';
import PdfIcon from '../resources/icons/document-filled-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';
import SpinnerIcon from '../resources/icons/spinner-svgrepo-com.svg';
import QuestionIcon from '../resources/icons/question-circle-svgrepo-com.svg';

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
    let lastOpenedFile = useUserBrowsingStore(state=>state.lastOpenedFile);
    let setLastOpenedFile = useUserBrowsingStore(state=>state.setLastOpenedFile);

    let [cursorItemPosition, setCursorItemPosition] = useState('');

    let sortedFiles = useMemo(()=>{
        if(!files) return null;

        let sortedFiles = [...files];
        if(!sortKey || sortKey === 'name') {
            sortedFiles.sort(sortByName)
        } else if(sortKey === 'modification') {
            sortedFiles.sort(sortByModification);
        } else if(sortKey === 'modification-desc') {
            sortedFiles.sort(sortByModificationDesc);
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

    // Remove the last opened file if it was not from the current directory
    useEffect(()=>{
        if(!files || !lastOpenedFile) return;
        let filteredFiles = files.filter(item=>item.tuuid === lastOpenedFile);
        if(filteredFiles.length === 0) setLastOpenedFile(null);
    }, [files, lastOpenedFile, setLastOpenedFile]);

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

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let cuuid = useUserBrowsingStore(state=>state.currentCuuid);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);

    let [dragOverFileButton, setDragOverFileButton] = useState(false);

    let cssDragFilesPanel = useMemo(()=>{
        if(dragOverFileButton) return ' bg-slate-600';
        return '';
    }, [dragOverFileButton]);

    // Drag and drop files on the Add File button
    let fileDragEnterHandler = useCallback((e: DragEvent<HTMLDivElement>)=>{
        e.preventDefault();
        setDragOverFileButton(true);
    }, [setDragOverFileButton]);
    let fileDragLeaveHandler = useCallback((e: DragEvent<HTMLDivElement>)=>{
        e.preventDefault();
        setDragOverFileButton(false);
    }, [setDragOverFileButton]);
    let fileDragOverHandler = useCallback((e: DragEvent<HTMLDivElement>)=>{
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOverFileButton(true);
    }, [setDragOverFileButton]);
    let fileDropHandler = useCallback((e: DragEvent<HTMLDivElement>)=>{
        e.preventDefault();
        setDragOverFileButton(false);

        let files = e.dataTransfer.files;
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!cuuid) throw new Error('Root cannot be used to upload files');
        if(!userId) throw new Error("UserId not provided");
        if(!files || files.length === 0) throw new Error('No files provided');
        let breadcrumbString = breadcrumb?.map(item=>item.nom).join('/');

        generateFileUploads(workers, userId, cuuid, files, breadcrumbString)
            .catch(err=>console.error("Error starting upload", err));
    }, [workers, ready, cuuid, userId, breadcrumb, setDragOverFileButton]);

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;
        return files.map(item=>{
            return <FileRow key={item.tuuid} value={item} dateColumn={dateColumn} onClick={onClick} columnNameOnly={columnNameOnly} />
        })
    }, [files, dateColumn, columnNameOnly, onClick]);

    return (
        <div onDrop={fileDropHandler} onDragEnter={fileDragEnterHandler} onDragLeave={fileDragLeaveHandler} onDragOver={fileDragOverHandler} 
            className={cssDragFilesPanel}>
                {/* Fixed header */}
                <div className='fixed w-full pr-4'>
                    <div className='grid grid-cols-12 bg-slate-800 text-sm select-none mx-2 px-1'>
                        <div className='col-span-7 px-1'>Name</div>
                        {columnNameOnly?<></>:<p className='col-span-1 px-1'>Size</p>}
                        {columnNameOnly?<></>:<p className='col-span-2 px-1'>Type</p>}
                        {columnNameOnly?<></>:<p className='col-span-2 px-1'>Date</p>}
                    </div>
                </div>
                {/* Padding to push content below header */}
                <div className='pb-5'></div>
                {/* Content */}
                {mappedFiles}
        </div>
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

export function sortByName(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
    // NodeType first (Directory at top)
    let isFileA = a.type_node === 'Fichier';
    let isFileB = b.type_node === 'Fichier';
    if(isFileA !== isFileB) {
        // Fichier goes lower, Collection/Repertoire are equivalent
        if(isFileA) return 1;
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
        if(a.nom === b.nom) {
            return a.tuuid.localeCompare(b.tuuid);
        }
        return a.nom.localeCompare(b.nom);
    }
    return a.modification - b.modification
}

function sortByModificationDesc(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
    if(a.modification === b.modification) {
        if(a.nom === b.nom) {
            return a.tuuid.localeCompare(b.tuuid);
        }
        return a.nom.localeCompare(b.nom);
    }
    return b.modification - a.modification
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
    let lastOpenedFile = useUserBrowsingStore(state=>state.lastOpenedFile);
    let { ref, visible } = useVisibility({});

    let [thumbnail, setThumbnail] = useState('');

    let dateValue = useMemo(()=>{
        if(!value) return null;
        if(dateColumn === 'modification') return value.modification;
        return value.dateFichier || value.modification;
    }, [value, dateColumn]);

    let onclickHandler = useCallback((e: MouseEvent<HTMLDivElement>)=>{
        onClick(e, value)
    }, [value, onClick]);

    let visitsElem = useMemo(()=>{
        if(value.type_node !== 'Fichier') return null;  // Only apply to files

        let visits = value.visits;
        let currentDate = Math.floor(new Date().getTime()/1000);
        let weekExpired = currentDate - 7*86_400;
        let monthExpired = currentDate - 31*86_400;
        if(visits) {
            if(visits.nouveau) {
                // Special flag, the file is considered as just uploaded
                return <img src={SpinnerIcon} alt='Processing' title='Processing' className='inline-block w-4 ml-1 animate-spin bg-violet-700 rounded-full' />;
            }
            let visitNumber = Object.keys(visits).length;
            if(visitNumber === 0) {
                return <img src={QuestionIcon} alt='File gone' title='File gone' className='inline-block w-4 ml-1 bg-red-800 rounded-full' />;
            }

            // Check last visit date. Warnings start after a week.
            let mostRecentVisit = Object.values(visits).reduce((acc, item)=>{
                if(acc < item) return item;
                return acc;
            }, 0);
            if(mostRecentVisit < monthExpired) {
                return <img src={QuestionIcon} alt='File presence over a month old' title='File presence over a month old' className='inline-block w-4 ml-1 bg-red-800 rounded-full' />;
            } else if(mostRecentVisit < weekExpired) {
                return <img src={QuestionIcon} alt='File presence over a week old' title='File presence over a week old' className='inline-block w-4 ml-1 bg-yellow-500 rounded-full' />;
            }

            return null;  // No issues
        }
        return <img src={QuestionIcon} alt='File presence issue' title='File presence issue' className='inline-block w-4 ml-1 bg-red-800 rounded-full' />;
    }, [value]);

    useEffect(()=>{
        if(!value || !value.thumbnail) return;
        if(!visible) return;

        let objectUrl = URL.createObjectURL(value.thumbnail);
        setThumbnail(objectUrl);

        return () => {
            // Cleanup
            setThumbnail('');
            URL.revokeObjectURL(objectUrl);
        }
    }, [value, visible]);

    let defaultIcon = useMemo(()=>getIcon(value.type_node, value.mimetype), [value]);

    let selectionCss = useMemo(()=>{
        if(selectionMode) {
            // Disable text select (copy/paste)
            if(selection?.includes(value.tuuid)) {
                return 'grid grid-cols-6 md:grid-cols-12 mx-2 odd:bg-violet-600 even:bg-violet-500 hover:bg-violet-800 odd:bg-opacity-70 even:bg-opacity-70 text-sm cursor-pointer select-none';
            }
            return 'grid grid-cols-6 md:grid-cols-12 mx-2 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer select-none';
        }

        if(lastOpenedFile === value.tuuid) {
            // Highlight the file that was just opened (back in containing folder)
            return 'grid grid-cols-6 md:grid-cols-12 mx-2 bg-slate-500 hover:bg-violet-800 bg-opacity-80 text-sm cursor-pointer';
        }

        // Allow text select
        return 'grid grid-cols-6 md:grid-cols-12 mx-2 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer';
    }, [value, selection, selectionMode, lastOpenedFile]);

    return (
        <div key={value.tuuid} onClick={onclickHandler} className={'h-11 md:h-6 ' + selectionCss}>
            <div ref={ref} className='col-span-7 px-1 truncate'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <img src={defaultIcon} alt='File icon' className='w-5 h-5 my-0.5 mr-0 ml-1 inline-block'/>
                }
                
                <span className='pl-3'>{value.nom}</span>
            </div>
            {columnNameOnly?
                <></>
                :
                <>
                    <p className='col-span-1 px-1 text-xs lg:text-sm'>
                        <Formatters.FormatteurTaille value={value.taille || undefined} />
                    </p>
                    <p className='col-span-2 px-1 text-xs text-xs lg:text-sm truncate'>{value.mimetype}</p>
                    <p className='col-span-3 text-right md:col-span-2 md:text-left px-1 text-xs lg:text-sm'>
                        {visitsElem?
                            visitsElem
                            :
                            <Formatters.FormatterDate value={dateValue || undefined} />
                        }
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
    let selection = useUserBrowsingStore(state=>state.selection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let lastOpenedFile = useUserBrowsingStore(state=>state.lastOpenedFile);
    let userId = useUserBrowsingStore(state=>state.userId);

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

    let [selectionCss, imageCss] = useMemo(()=>{
        if(selectionMode) {
            // Disable text select (copy/paste)
            if(selection?.includes(value.tuuid)) {
                return ['border ring-2 ring-violet-300', 'opacity-50 contrast-50'];
            }
            return ['border border-slate-500', 'opacity-100'];
        }

        if(lastOpenedFile === value.tuuid) {
            // Highlight the file that was just opened (back in containing folder)
            return ['border ring-4 ring-indigo-400 border-slate-300', 'opacity-100'];
        }

        // Allow text select
        return ['border border-slate-500', 'opacity-100'];
    }, [value, selection, selectionMode, lastOpenedFile]);

    useEffect(()=>{
        if(!workers || !ready || !filehostReady) return;    // Not ready
        if(!userId) return;                                 // UserId not loaded
        if(value.thumbnailDownloaded) return;               // High quality thumbnail already downloaded, nothing to do
        if(!visible) return;                                // Not visible
        
        Promise.resolve()
            .then(async ()=>{
                if(!workers) throw new Error('workers not initialized');
                if(!userId) throw new Error('UserId not provided');
                
                let tuuid = value.tuuid;
                let file = await loadTuuid(tuuid, userId);

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
    }, [workers, value, visible, ready, filehostReady, contactId, userId, updateThumbnail, updateSharedThumbnail]);

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
        <button ref={ref} className={`inline-block m-1 relative ${selectionCss}`} onClick={onclickHandler} value={value.tuuid}>
            <p className='text-sm break-all font-bold absolute align-center bottom-0 bg-slate-800 w-full bg-opacity-70 px-1 pb-1'>{value.nom}</p>
            <div className='w-40 sm:w-full object-cover'>
                <img src={imgSrc} alt={'File ' + value.nom} width={200} height={200} className={imageCss} />
            </div>
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

