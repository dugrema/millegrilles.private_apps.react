import { useCallback, useEffect, useMemo, useState } from "react";
import { TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

import FolderIcon from '../resources/icons/folder-svgrepo-com-duotoneicon.svg';
import FileIcon from '../resources/icons/file-svgrepo-com.svg';
import PdfIcon from '../resources/icons/document-filled-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';

type SearchFileListPaneProps = {
    files: TuuidsBrowsingStoreSearchRow[] | null,
    sortKey?: string | null,
    sortOrder?: number | null,
    dateColumn?: string | null,
    onClickRow: (tuuid:string, typeNode:string) => void,
}

function SearchFilelistPane(props: SearchFileListPaneProps) {

    let { files, sortKey, sortOrder, dateColumn, onClickRow } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;

        let sortedFiles = [...files];
        if(!sortKey || sortKey === 'name') {
            sortedFiles.sort(sortByName)
        } else if(sortKey === 'score') {
            sortedFiles.sort(sortByScore);
        }
        if(sortOrder && sortOrder < 0) {
            sortedFiles = sortedFiles.reverse();
        }

        let mappedFiles = sortedFiles.map(item=>{
            return <FileRow key={item.tuuid} value={item} dateColumn={dateColumn} onClick={onClickRow} />
        })

        return mappedFiles;
    }, [files, sortKey, dateColumn, onClickRow, sortOrder])

    return (
        <>
            <div className='grid grid-cols-12 bg-slate-800 text-sm'>
                <div className='col-span-6 px-1'>Name</div>
                <p className='col-span-1 px-1'>Score</p>
                <p className='col-span-1 px-1'>Size</p>
                <p className='col-span-2 px-1'>Type</p>
                <p className='col-span-2 px-1'>Date</p>
            </div>
            {mappedFiles}
        </>
    );
}

export default SearchFilelistPane;

function sortByName(a: TuuidsBrowsingStoreSearchRow, b: TuuidsBrowsingStoreSearchRow) {
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

function sortByScore(a: TuuidsBrowsingStoreSearchRow, b: TuuidsBrowsingStoreSearchRow) {
    if(a === b) return 0;
    if(a.score === b.score) {
        return a.tuuid.localeCompare(b.tuuid);
    }
    return a.score - b.score
}

function FileRow(props: {value: TuuidsBrowsingStoreSearchRow, dateColumn?: string | null, onClick:(tuuid:string, typeNode:string)=>void}) {
    
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

    let defaultIcon = useMemo(()=>{
        let typeNode = value.type_node;
        if(typeNode === 'Fichier') {
            let mimetype = value.mimetype;
            if(!mimetype) return FileIcon;
            else if(mimetype === 'application/pdf') return PdfIcon;
            else if(mimetype.startsWith('image')) return ImageIcon;
            else if(mimetype.startsWith('video')) return VideoIcon;
            return FileIcon;
        } else {
            return FolderIcon;
        }
    }, [value]);

    return (
        <div key={value.tuuid} onClick={onclickHandler}
            className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
            <div className='col-span-6 px-1'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <img src={defaultIcon} className='w-4 mr-1 ml-1 inline-block'/>
                }
                
                <span className='pl-3'>{value.nom}</span>
            </div>
            <p className='col-span-1 px-1'>
                <Formatters.FormatteurNombre value={value.score || undefined} precision={3} />
            </p>
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