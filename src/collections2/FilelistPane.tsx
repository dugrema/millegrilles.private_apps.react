import { useCallback, useEffect, useMemo, useState } from "react";
import { TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

type FileListPaneProps = {
    files: TuuidsBrowsingStoreRow[] | null,
    sortKey?: string | null,
    sortOrder?: number | null,
    dateColumn?: string | null,
    onClickRow: (tuuid:string, typeNode:string) => void,
}

function FilelistPane(props: FileListPaneProps) {

    let { files, sortKey, sortOrder, dateColumn, onClickRow } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;

        let sortedFiles = [...files];
        if(!sortKey || sortKey === 'name') {
            sortedFiles.sort(sortByName)
        } else if(sortKey === 'modification') {
            sortedFiles.sort(sortByModification);
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
                <div className='col-span-7 px-1'>Name</div>
                <p className='col-span-1 px-1'>Size</p>
                <p className='col-span-2 px-1'>Type</p>
                <p className='col-span-2 px-1'>Date</p>
            </div>
            {mappedFiles}
        </>
    );
}

function sortByName(a: TuuidsBrowsingStoreRow, b: TuuidsBrowsingStoreRow) {
    if(a === b) return 0;
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

export default FilelistPane;

function FileRow(props: {value: TuuidsBrowsingStoreRow, dateColumn?: string | null, onClick:(tuuid:string, typeNode:string)=>void}) {
    
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
        // if(typeNode === 'Fichier') {
        //     // Open file
        //     throw new Error('todo');
        // } else {
        //     // Browse directory
        //     if(!tuuid) {
        //         // Back to top
        //         navigate('/apps/collections2/b');
        //     } else {
        //         navigate('/apps/collections2/b/' + tuuid);
        //     }
        // }
    }, [value, onClick]);
    // }, [navigate, value]);

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

    return (
        <div key={value.tuuid} onClick={onclickHandler}
            className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
            <div className='col-span-7 px-1'>
                {thumbnail?
                    <img src={thumbnail} className='ml-1 w-5 h-5 my-0.5 inline-block rounded' alt='File icon' />
                :
                    <div className='ml-1 p-1 inline-block'>TN</div>
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