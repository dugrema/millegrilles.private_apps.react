import { useCallback, useEffect, useMemo, useState } from "react";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow, ViewMode } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

import FolderIcon from '../resources/icons/folder-svgrepo-com-duotoneicon.svg';
import FileIcon from '../resources/icons/file-svgrepo-com.svg';
import PdfIcon from '../resources/icons/document-filled-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';

type FileListPaneProps = {
    files: TuuidsBrowsingStoreRow[] | null,
    sortKey?: string | null,
    sortOrder?: number | null,
    dateColumn?: string | null,
    onClickRow: (tuuid:string, typeNode:string) => void,
}

function FilelistPane(props: FileListPaneProps) {

    let viewMode = useUserBrowsingStore(state=>state.viewMode);

    if(viewMode === ViewMode.Thumbnails) return <ThumbnailView {...props} />;
    if(viewMode === ViewMode.Carousel) throw new Error('todo');

    return <ListView {...props} />;
}

export default FilelistPane;

function ListView(props: FileListPaneProps) {
    let { files, sortKey, sortOrder, dateColumn, onClickRow } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;

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

        let mappedFiles = sortedFiles.map(item=>{
            return <FileRow key={item.tuuid} value={item} dateColumn={dateColumn} onClick={onClickRow} />
        })

        return mappedFiles;
    }, [files, sortKey, dateColumn, onClickRow, sortOrder]);

    return (
        <>
            <div className='grid grid-cols-12 bg-slate-800 text-sm'>
                <div className='col-span-7 px-1'>Name</div>
                <p className='col-span-1 px-1'>Size</p>
                <p className='col-span-2 px-1'>Type</p>
                <p className='col-span-2 px-1'>Date</p>
            </div>
            {mappedFiles}
        </>
    );
}

function ThumbnailView(props: FileListPaneProps) {
    let { files, sortKey, sortOrder, dateColumn, onClickRow } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;

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

        let mappedFiles = sortedFiles.map(item=>{
            return <ThumbnailItem key={item.tuuid} value={item} onClick={onClickRow} />
        })

        return mappedFiles;
    }, [files, sortKey, dateColumn, onClickRow, sortOrder]);

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
    onClick:(tuuid:string, typeNode:string)=>void
};

function FileRow(props: FileItem) {
    
    let {value, dateColumn, onClick} = props;
    
    // let navigate = useNavigate();

    let [thumbnail, setThumbnail] = useState('');

    let dateValue = useMemo(()=>{
        if(!value) return null;
        if(dateColumn === 'modification') return value.modification;
        return value.dateFichier || value.modification;
    }, [value, dateColumn]);

    let onclickHandler = useCallback(()=>{
        let tuuid = value.tuuid;
        let typeNode = value.type_node;
        onClick(tuuid, typeNode)
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

    return (
        <div key={value.tuuid} onClick={onclickHandler}
            className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
            <div className='col-span-7 px-1'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <img src={defaultIcon} className='w-4 mr-1 ml-1 inline-block'/>
                }
                
                <span className='pl-3'>{value.nom}</span>
            </div>
            <p className='col-span-1 px-1'>
                <Formatters.FormatteurTaille value={value.taille || undefined} />
            </p>
            <p className='col-span-2 px-1'>{value.mimetype}</p>
            <p className='col-span-2 px-1'>
                <Formatters.FormatterDate value={dateValue || undefined} />
            </p>
        </div>
    )
}

function ThumbnailItem(props: FileItem) {

    let {value, onClick} = props;
    
    let defaultIcon = useMemo(()=>getIcon(value.type_node, value.mimetype), [value]);
    let [thumbnail, setThumbnail] = useState('');
    let [fileIcon, setFileIcon] = useState('');

    let imgSrc = useMemo(()=>{
        // if(fileIcon) return ImageIcon;
        if(thumbnail) return thumbnail;
        return defaultIcon;
    }, [defaultIcon, thumbnail, fileIcon]);

    let onclickHandler = useCallback(()=>{
        let tuuid = value.tuuid;
        let typeNode = value.type_node;
        onClick(tuuid, typeNode)
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
    }, [value, setThumbnail]);

    return (
        <button className="inline-block m-1 border relative" onClick={onclickHandler} value={value.tuuid}>
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
