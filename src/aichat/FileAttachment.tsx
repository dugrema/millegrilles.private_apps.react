import { useCallback, useMemo } from "react";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow } from "../collections2/userBrowsingStore";
import FilelistPane, { FileListPaneOnClickRowType } from "../collections2/FilelistPane";
import { ModalBreadcrumb, ModalDirectorySyncHandler } from "../collections2/ModalBrowsing";

type ModalInformationProps = {close: ()=>void, selectFiles: (files: TuuidsBrowsingStoreRow[])=>void};

export function ModalBrowseAction(props: ModalInformationProps) {

    let {close, selectFiles} = props;

    let filesDict = useUserBrowsingStore(state=>state.modalNavCurrentDirectory);
    let setModalCuuid = useUserBrowsingStore(state=>state.setModalCuuid);
    
    let files = useMemo(()=>{
        if(!filesDict) return null;
        // const filesValues = Object.values(filesDict).filter(item=>item.type_node !== 'Fichier');
        const filesValues = Object.values(filesDict);
        return filesValues;
    }, [filesDict]) as TuuidsBrowsingStoreRow[] | null;

    let onClickRow = useCallback((e, tuuid, typeNode, range)=>{
        if(typeNode === 'Repertoire' || typeNode === 'Collection') {
            setModalCuuid(tuuid);
        } else {
            const selectedFile = files?.filter(item=>item.tuuid === tuuid).pop();
            // console.debug("Selected file", selectedFile);
            if(selectedFile) selectFiles([selectedFile]);
        }
    }, [setModalCuuid, selectFiles, files]) as FileListPaneOnClickRowType;

    return (
        <>
            <div tabIndex={-1} aria-hidden="true" 
                className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-2rem)] max-h-full">
                <div className="relative p-4 w-full max-w-2xl max-h-full">
                    <div className="relative rounded-lg shadow bg-gray-800">
                        <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t border-gray-600">
                            <h3 className="text-xl font-semibold text-white">Select file</h3>
                            <button onClick={close} className="bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white" data-modal-hide="default-modal">
                                <CloseIcon />
                                <span className="sr-only">Close</span>
                            </button>
                        </div>

                        <div className="p-4 md:p-5 space-y-4">
                            <div className='grid grid-cols-12'>
                                <p>To:</p>
                                <ModalBreadcrumb />
                            </div>
                            <div className='h-44 lg:h-96 overflow-y-scroll'>
                                <FilelistPane files={files} onClickRow={onClickRow} columnNameOnly={true} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <ModalDirectorySyncHandler />
        </>
    );
}

function CloseIcon() {
    return (
        <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
        </svg>
    )
}
