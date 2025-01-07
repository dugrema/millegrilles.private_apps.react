import { useMemo } from "react";
import { TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { Formatters } from "millegrilles.reactdeps.typescript";

type FileListPaneProps = {
    files: TuuidsBrowsingStoreRow[] | null,
    sortKey?: string | null,
}

function FilelistPane(props: FileListPaneProps) {

    let { files, sortKey } = props;

    let mappedFiles = useMemo(()=>{
        if(!files) return <></>;

        let sortedFiles = [...files];
        if(!sortKey || sortKey === 'name') {
            sortedFiles.sort(sortByName)
        }

        let mappedFiles = sortedFiles.map(item=>{
            return (
                <div key={item.tuuid} className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                    <div className='col-span-7 px-1'>
                        <div className='p-1 inline-block'>TN</div>
                        <span className='pl-1'>{item.nom}</span>
                    </div>
                    <p className='col-span-1 px-1'>
                        <Formatters.FormatteurTaille value={item.taille || undefined} />
                    </p>
                    <p className='col-span-2 px-1'>{item.mimetype}</p>
                    <p className='col-span-2 px-1'>
                        <Formatters.FormatterDate value={item.dateFichier || item.modification || undefined} />
                    </p>
                </div>
            )
        })

        return mappedFiles;
    }, [files, sortKey])

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

export default FilelistPane;
