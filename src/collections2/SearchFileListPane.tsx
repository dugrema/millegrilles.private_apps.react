import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';

import FolderIcon from '../resources/icons/folder-svgrepo-com-duotoneicon.svg';
import FileIcon from '../resources/icons/file-svgrepo-com.svg';
import PdfIcon from '../resources/icons/document-filled-svgrepo-com.svg';
import ImageIcon from '../resources/icons/image-1-svgrepo-com.svg';
import VideoIcon from '../resources/icons/video-file-svgrepo-com.svg';
import ShareIcon from '../resources/icons/share-1-svgrepo-com.svg';

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
            <div className='w-full pr-4'>
                <div className='grid grid-cols-6 md:grid-cols-12 bg-slate-800 text-sm px-1'>
                    <div className='col-span-6 px-1'>Name</div>
                    <p className='col-span-1 px-1'>Score</p>
                    <p className='col-span-1 px-1'>Size</p>
                    <p className='col-span-2 px-1'>Type</p>
                    <p className='col-span-2 px-1'>Date</p>
                </div>
            </div>
            <div className='md:pb-5'></div>
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

        let blob = new Blob([value.thumbnail]);
        let objectUrl = URL.createObjectURL(blob);
        setThumbnail(objectUrl);

        return () => {
            // Cleanup
            setThumbnail('');
            URL.revokeObjectURL(objectUrl);
        }
    }, [value]);

    let shared = useMemo(()=>!!value.contactId, [value]);

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
            className='grid grid-cols-8 md:grid-cols-12 py-1 md:py-0 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
            <div className='col-span-8 md:col-span-6 px-1 truncate'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <img src={defaultIcon} alt='File icon' className='w-5 h-5 my-0.5 mr-0 ml-1 inline-block'/>
                }
                
                {shared?<img src={ShareIcon} className='ml-1 w-5 inline-block' alt="Shared file"/>:<></>}
                
                <span className='pl-3'>{value.nom}</span>
            </div>
            <p className='col-span-1 px-1 text-sm md:text-base'>
                <Formatters.FormatteurNombre value={value.score || undefined} precision={3} />
            </p>
            <p className='col-span-2 md:col-span-1 px-1 text-xs lg:text-base'>
                <Formatters.FormatteurTaille value={value.taille || undefined} />
            </p>
            <p className='col-span-2 px-1 text-xs lg:text-base'>{value.mimetype}</p>
            <p className='col-span-3 md:col-span-2 px-1 text-xs lg:text-base'>
                <Formatters.FormatterDate value={dateValue || undefined} />
            </p>
        </div>
    )
}

export function SearchRagResponse(props: {value: string | null | undefined}) {
    const {value} = props;

    if(!value) return <></>;

    const plugins = [remarkGfm, remarkRehype, rehypeKatex];

    return (
        <>
            <section className=''>
                <h1 className='text-xl font-bold pb-2'>Response</h1>
                <div className="text-sm font-normal text-gray-300 markdown">
                    <Markdown remarkPlugins={plugins}>{value}</Markdown>
                </div>
            </section>
            <p className='py-2'>The following files were used as context for the answer.</p>
        </>
    )
}
