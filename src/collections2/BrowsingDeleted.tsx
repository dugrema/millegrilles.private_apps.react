import { MouseEvent, useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import useConnectionStore from "../connectionStore";
import useWorkers, { AppWorkers } from "../workers/workers";
import useUserBrowsingStore, { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import { ModalEnum, PageSelectors } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";

import CopyIcon from '../resources/icons/copy-svgrepo-com.svg';
import RecycleIcon from '../resources/icons/undo-svgrepo-com.svg';
import SelectionModeIcon from '../resources/icons/pinpaper-filled-svgrepo-com.svg';
import ActionButton from "../resources/ActionButton";
import { useNavigate } from "react-router-dom";
import { Modals } from "./Modals";
import { Collection2DirectoryStats } from "../workers/connection.worker";

const CONST_PAGE_SIZE = 25;

function BrowsingDeleted() {

    let navigate = useNavigate();

    let setModal = useUserBrowsingStore(state=>state.setModal);
    let onModal = useCallback((modal: ModalEnum)=>{
        setModal(modal)
    }, [setModal]);

    let [tuuid, setTuuid] = useState(null as string | null);
    let [pageNo, setPageNo] = useState(1);

    let userId = useUserBrowsingStore(state=>state.userId);

    // Data loader
    let {data: deletedFilesPage, error, isLoading} = useGetDeletedFiles({userId, page: pageNo, cuuid: tuuid});
    // console.debug("Data loader data: %O, error: %O, isLoading: %s", deletedFilesPage, error, isLoading);

    let pageCount = useMemo(()=>{
        let stats = deletedFilesPage?.stats;
        if(!stats) return pageNo;
        let items = stats.reduce((acc, item)=>acc + item.count, 0);
        return Math.ceil(items / CONST_PAGE_SIZE);
    }, [pageNo, deletedFilesPage]) as number;

    // Selecting files
    let selection = useUserBrowsingStore(state=>state.selection);
    let setSelection = useUserBrowsingStore(state=>state.setSelection);
    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let setSelectionPosition = useUserBrowsingStore(state=>state.setSelectionPosition);

    let changePage = useCallback((page: number)=>{
        setPageNo(page);
        setSelectionMode(false);
    }, [setPageNo, setSelectionMode]);

    let onClickBreadcrumb = useCallback((tuuid?: string | null)=>{
        setTuuid(tuuid || null);
        changePage(1);
    }, [setTuuid, changePage]);

    let onClickRow = useCallback((e: MouseEvent<HTMLButtonElement | HTMLDivElement>, tuuid:string, typeNode:string, range: TuuidsBrowsingStoreRow[] | null)=>{
        let ctrl = e?.ctrlKey || false;
        let shift = e?.shiftKey || false;
        let effectiveSelectionMode = selectionMode;
        if(!selectionMode && (ctrl||shift)) {
            // Toggle selection mode
            effectiveSelectionMode = true;
            setSelectionMode(true);
        }

        if(effectiveSelectionMode) {
            // Selection mode
            let selectionSet = new Set() as Set<string>;
            if(selection) selection.forEach(item=>selectionSet.add(item));  // Copy all existing selections to Set

            if(tuuid) {
                if(shift && range) {
                    // Range action
                    range.forEach(item=>selectionSet.add(item.tuuid));
                } else {
                    // Individual action
                    if(selectionSet.has(tuuid)) {
                        selectionSet.delete(tuuid);
                    } else {
                        selectionSet.add(tuuid);
                    }
                }

                // Save position for range selection
                setSelectionPosition(tuuid);

                // Copy set back to array, save.
                let updatedSelection = [] as string[];
                selectionSet.forEach(item=>updatedSelection.push(item));
                setSelection(updatedSelection);
            }
        } else {
            // Navigation mode
            if(typeNode === 'Fichier') {
                navigate('/apps/collections2/f/' + tuuid);
            } else {
                changePage(1);
                setTuuid(tuuid);
            }
        }
    }, [navigate, selectionMode, selection, setSelectionMode, setSelection, setSelectionPosition, changePage, setTuuid]);

    let [sortKey, sortOrder] = useMemo(()=>{
        if(!tuuid) return ['modificationDesc', 1];
        return ['name', 1];
    }, [tuuid]);

    return (
        <>
            <section className='fixed top-12'>
                <Breadcrumb breadcrumb={deletedFilesPage?.breadcrumb} onClick={onClickBreadcrumb} />
                <div className='pt-2'>
                    <ButtonBar onModal={onModal} inSubdirectory={!!tuuid} deletedFiles={deletedFilesPage} />                    
                </div>
            </section>

            <section className='fixed top-32 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
                {error?<p>Error {''+error}</p>:<></>}
                {isLoading?
                    <>Loading ...</>
                :
                    <FilelistPane files={deletedFilesPage?.list} sortKey={sortKey} sortOrder={sortOrder} dateColumn='modification' onClickRow={onClickRow} />
                }
                <PageSelectors page={pageNo} setPage={changePage} pageCount={pageCount} />
            </section>

            <Modals includeDeleted={true} />
        </>
    );
}

export default BrowsingDeleted;

type ButtonBarProps = {
    onModal: (modalName: ModalEnum) => void,
    inSubdirectory: boolean,
    deletedFiles: FetchDeteledFilesPageReturnType | null | undefined,
}

export function ButtonBar(props: ButtonBarProps) {

    let {onModal, inSubdirectory, deletedFiles} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let selectionMode = useUserBrowsingStore(state=>state.selectionMode);
    let setSelectionMode = useUserBrowsingStore(state=>state.setSelectionMode);
    let selection = useUserBrowsingStore(state=>state.selection);
    let deleteFilesDirectory = useUserBrowsingStore(state=>state.deleteFilesDirectory);

    let selectCount = useMemo(()=>{
        if(!selection) return null;
        return selection.length;
    }, [selection]);

    let toggleSelectionMode = useCallback(()=>{
        setSelectionMode(!selectionMode);
    }, [selectionMode, setSelectionMode]);

    let recycleHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('Workers not initialized');
        if(!selection || selection.length === 0) throw new Error('Nothing selected to delete');
        let response = await workers.connection.collection2RecycleItems(selection);
        if(!response.ok) throw new Error('Error deleting files/directories: ' + response.err);
        setSelectionMode(false);  // Exit selection mode

        // Remove recycled items from list
        deleteFilesDirectory(selection);
    }, [workers, ready, selection, setSelectionMode, deleteFilesDirectory]);

    let copyHandler = useCallback(()=>onModal(ModalEnum.Copy), [onModal]);

    let itemCount = useMemo(()=>{
        let stats = deletedFiles?.stats;
        if(!stats) return null;
        let itemCount = stats.reduce((acc, item)=>acc + item.count, 0);
        return itemCount;
    }, [deletedFiles]) as number;

    return (
        <div className='grid grid-cols-2 md:grid-cols-3 pt-1'>
            <div className='col-span-2'>
                <button onClick={toggleSelectionMode}
                    className={'varbtn px-1 py-1 w-10 hover:bg-slate-600 active:bg-slate-500 ' + (selectionMode?'bg-violet-500':'bg-slate-700')}>
                        <img src={SelectionModeIcon} alt="Select files" title="Select files" className='w-8 inline-block'/>
                </button>
                <ActionButton onClick={recycleHandler} disabled={!selectionMode || !selectCount || inSubdirectory} confirm={true} revertSuccessTimeout={2} varwidth={10}>
                    <img src={RecycleIcon} alt="Recycle files" title="Recycle files" className='w-8 inline-block'/>
                </ActionButton>
                <button onClick={copyHandler} disabled={!selectionMode || !selectCount}
                    className='varbtn ml-0 px-1 py-1 hover:bg-slate-600 active:bg-slate-500 bg-slate-700 disabled:bg-slate-900'>
                        <img src={CopyIcon} alt="Copy files" title="Copy files" className='w-8 inline-block'/>
                </button>
            </div>
            <div className='text-sm'>
                {itemCount!==null?<>{itemCount} deleted items</>:<>Loading ...</>}
            </div>
        </div>        
    );
}

// function Modals(props: {show: ModalEnum | null, close:()=>void}) {

//     let {show, close} = props;
//     let workers = useWorkers();
//     let ready = useConnectionStore(state=>state.connectionAuthenticated);

//     if(show === ModalEnum.Copy) return <ModalBrowseAction workers={workers} ready={ready} close={close} modalType={show} title='Copy files' includeDeleted={true} />;

//     return <></>;
// }

type UseGetDeletedFilesType = {
    data: FetchDeteledFilesPageReturnType | null,
    error: any,
    isLoading: boolean
}

type FetcherParams = {
    userId: string | null,
    page: number,
    cuuid?: string | null
}

/**
 * Runs a search query and returns the first result batch.
 * @returns Search results
 */
function useGetDeletedFiles(params: FetcherParams): UseGetDeletedFilesType {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [fetcherKey, fetcherFunction] = useMemo(()=>{
        let fetcherFunction = async (params: FetcherParams) => fetchDeletedFilesPage(workers, ready, params);
        return [params, fetcherFunction]
    }, [workers, ready, params]);

    let { data, error, isLoading } = useSWR(fetcherKey, fetcherFunction);
    return {data: data || null, error, isLoading};
}

type FetchDeteledFilesPageReturnType = {
    list: TuuidsBrowsingStoreRow[] | null,
    breadcrumb: TuuidsBrowsingStoreRow[] | null,
    stats: Collection2DirectoryStats[] | null,
}

async function fetchDeletedFilesPage(workers: AppWorkers | null, ready: boolean, params: FetcherParams): Promise<FetchDeteledFilesPageReturnType | null> {
    if(!workers || !ready) return null;
    
    let userId = params.userId;
    if(!userId) return null;
    
    // Pagination
    let page = params.page;
    let startIdx = (page - 1) * CONST_PAGE_SIZE;

    let response = await workers.connection.syncDeletedFiles(startIdx, params.cuuid, CONST_PAGE_SIZE);
    // console.debug("fetchDeletedFilesPage Data: ", response);
    if(!response.ok) throw new Error(`Error during sync: ${response.err}`);

    let responseFiles = response.files;
    if(!responseFiles) throw new Error('No files provided');

    let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, responseFiles, response.keys, {noidb: true});
    // console.debug("Decrypted deleted files", files);
    let storeFiles = filesIdbToBrowsing(files);
    // console.debug("Store structured files", storeFiles);

    let breadcrumb: TuuidsBrowsingStoreRow[] | null = null;
    let responseBreadcrumb = response.breadcrumb;
    if(responseBreadcrumb) {
        let decryptedBreadcrumb = await workers.directory.processDirectoryChunk(workers.encryption, userId, responseBreadcrumb, response.keys, {noidb: true});
        breadcrumb = filesIdbToBrowsing(decryptedBreadcrumb);
        // console.debug("Response breadcrumb", breadcrumb);
    }

    return {list: storeFiles, breadcrumb, stats: response.stats};
}

type BreadcrumbProps = {
    breadcrumb: TuuidsBrowsingStoreRow[] | null | undefined,
    onClick?: (tuuid: string | null) => void,
};

function Breadcrumb(props: BreadcrumbProps) {

    let { breadcrumb, onClick } = props;

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick])

    let breadcrumbMapped = useMemo(()=>{
        if(!breadcrumb) return <></>;

        let lastIdx = breadcrumb.length - 1;
        let breadcrumbMapped = breadcrumb.filter(item=>{
            if(!item) {
                console.warn("Breacrumb with null items");
                lastIdx -= 1;
                return false;
            }
            return true;
        });

        // The breadcrumb is provided with last item first
        breadcrumbMapped.reverse();

        return breadcrumbMapped
            .map((item, idx)=>{
                if(idx === lastIdx) {
                    return (
                        <div key={item.tuuid} className='inline pl-1 md:pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                            {item.nom}
                        </div>
                    )
                } else {
                    return (
                        <div key={item.tuuid} 
                            className='inline cursor-pointer pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                                <span onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</span>
                                <span className="pointer-events-none ml-2 text-slate-800">/</span>
                        </div>
                    )
                }
            })
    }, [breadcrumb, onClickHandler]);

    return (
        <nav aria-label='breadcrumb' className='w-screen leading-3 pr-2 line-clamp-2'>
            {breadcrumb?
                <div className='inline cursor-pointer items-center pl-1 md:pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span className='' onClick={onClickHandler}>Trash</span>
                    <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                </div>
            :
                <div className='inline p-1 md:p-2 text-sm bg-slate-700 bg-opacity-50'>
                    Trash
                </div>
            }
            {breadcrumbMapped}
        </nav>
    );
}
