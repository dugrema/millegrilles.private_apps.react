import { ChangeEvent, useCallback, useMemo, useState, FormEvent, useEffect, useRef, Dispatch } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from 'swr';

import ActionButton from "../resources/ActionButton";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { Collection2SearchStore, filesIdbToBrowsing, TuuidsBrowsingStoreRow, TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Collection2SearchResultsContent, Collection2SearchResultsDoc, Collections2FileSyncRow, Collections2SearchResults, Collections2SharedContactsSharedCollection, DecryptedSecretKey } from "../workers/connection.worker";
import SearchFilelistPane, { SearchRagResponse } from "./SearchFileListPane";
import { PageSelectors } from "./BrowsingElements";

const CONST_PAGE_SIZE = 25;

function SearchPage() {

    const workers = useWorkers();

    const ready = useConnectionStore(state=>state.connectionAuthenticated);
    const userId = useUserBrowsingStore(state=>state.userId);
    const searchResults = useUserBrowsingStore(state=>state.searchResults);
    const setSearchResults = useUserBrowsingStore(state=>state.setSearchResults);
    const searchResultsPosition = useUserBrowsingStore(state=>state.searchResultsPosition);
    const setSearchResultsPosition = useUserBrowsingStore(state=>state.setSearchResultsPosition);
    const ragQuery = useMemo(()=>!!searchResults?.ragResponse,[searchResults]);
    
    const [page, setPage] = useState(searchResultsPosition || 1);
    const [pageLoaded, setPageLoaded] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    
    const query = useMemo(()=>{
        if(!searchParams) return null;
        return searchParams.get('search');
    }, [searchParams]);

    // Run the search when all parameters are present
    const {data} = useSearchResults();

    useEffect(()=>{
        if(query && data) {
            // console.debug("Search results: %O", data);
            setSearchResults({query, searchResults: data});
        } else if(!ragQuery) {
            setSearchResults(null);
        }
    }, [query, data, ragQuery, setSearchResults]);

    const [searchInput, setSearchInput] = useState(query || '');
    const searchInputHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        setSearchInput(value);
    }, [setSearchInput]);

    const searchHandler = useCallback(async()=>{
        // Reset search variables
        setSearchResults(null);
        setSearchResultsPosition(1);
        setPage(1);
        
        if(!searchInput) {
            setSearchParams(params=>{params.delete('search'); return params;});
        } else {
            setSearchParams(params=>{params.set('search', searchInput); return params;});
        }
    }, [searchInput, setSearchParams, setSearchResults, setPage, setSearchResultsPosition]);

    const submitHandler = useCallback((e: FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        e.stopPropagation();
        searchHandler();
    }, [searchHandler]);

    const queryRagHandler = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('Workers not initialized');

        // Reset search variables
        setSearchResults(null);
        setSearchResultsPosition(1);
        setPage(1);
        setSearchParams(params=>{params.delete('search'); return params;});

        if(searchInput) {
            const encryptedMessage = await workers.encryption.encryptMessageMgs4ForDomain(searchInput, 'ollama_relai');
            // console.debug("Encrypted message %O", encryptedMessage);

            const response = await workers.connection.queryRag(encryptedMessage);
            // console.debug("RAG query response", response);
            if(response.ok !== true) throw new Error("Error during RAG query: " + response.err);

            // Fetch keys for all references
            const references = response.ref;
            let searchResults = null;
            if(references) {
                const tuuids = [] as string[];
                for(const itemId of references) {
                    const tuuid = itemId.id.split('/')[0];
                    if(!tuuids.includes(tuuid)) {
                        tuuids.push(tuuid);
                    }
                }
                // const tuuids = references
                //     .filter(item=>item.id)              // Remove empty ids
                //     .map(item=>item.id.split('/')[0]);  // extract Ids (format is tuuid/...)
                searchResults = await workers.connection.getFilesByTuuid(tuuids);
                // console.debug("Loaded references", searchResults);

                // Fill in search results in order
                const listSize = searchResults.files?.length || 0;
                const mappedFiles = searchResults.files?.reduce((acc, item, idx)=>{
                    const searchResult = {
                        id: item.tuuid,
                        user_id: userId,
                        score: listSize-idx,
                        fuuid : item.version_courante?.fuuid,
                        cuuids: item.path_cuuids,
                    } as Collection2SearchResultsDoc;
                    return {...acc, [item.tuuid]: searchResult};
                }, {} as {[tuuid: string]: Collection2SearchResultsDoc}) || {};
                const docs = tuuids
                    .filter(tuuid=>mappedFiles[tuuid])
                    .map(tuuid=>mappedFiles[tuuid]);

                const content = {
                    docs,
                    max_score: listSize,
                    numFound: listSize,
                    numFoundExact: listSize,
                    start: 0,
                } as Collection2SearchResultsContent;
                // console.debug("Prepared search results content", content);
                searchResults.search_results = content;
            }

            const storeResults = {
                query: searchInput,
                searchResults,
                stats: {files: searchResults?.files?.length || 0, directories: 0},
                resultDate: new Date(),
                ragResponse: response.response,
                error: null,
            } as Collection2SearchStore;
            
            console.debug("RAG response and results:", storeResults);
            setSearchResults(storeResults);
        }
    }, [workers, ready, searchInput, setSearchParams, setSearchResults, setPage, setSearchResultsPosition]);

    useEffect(()=>{
        if(pageLoaded || !workers || !ready || !userId) return;
        setPageLoaded(true);

        let searchQuery = searchResults?.query;
        if(!searchInput && searchQuery) {
            // Put the search query back in the input box
            setSearchInput(searchQuery);
            setSearchParams(params=>{
                if(searchQuery) {
                    params.set('search', searchQuery); 
                }
                return params;
            });
        } 
    }, [
        workers, ready, userId, searchInput, searchResults, setSearchInput, pageLoaded, setPageLoaded, 
        query, setSearchParams]);

    return (
        <>
            <section className='fixed left-0 top-12 pt-1 px-2 w-full'>
                <form onSubmit={submitHandler}>
                    <div className='grid grid-cols-6 sm:grid-cols-12'>
                        <input type='text' value={searchInput} onChange={searchInputHandler} autoFocus
                            className='col-span-4 sm:col-span-10 md:col-span-10 text-black h-6 text-slate-100 bg-slate-500' />
                        <ActionButton onClick={searchHandler} revertSuccessTimeout={3} className='ml-1 text-center col-span-2 md:col-span-1' mainButton={true}>
                            Search
                        </ActionButton>
                        <ActionButton onClick={queryRagHandler} revertSuccessTimeout={3} className='ml-1 text-center col-span-2 md:col-span-1'>
                            RAG
                        </ActionButton>
                    </div>
                </form>
                <SearchStatistics data={data} />
            </section>

            <SearchResultSection data={data} page={page} setPage={setPage} />
        </>
    );
}

export default SearchPage;

function SearchResultSection(props: {data: Collections2SearchResults | null, page: number, setPage: Dispatch<number>}) {

    const {data, page, setPage} = props;

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);
    const userId = useUserBrowsingStore(state=>state.userId);
    const searchResults = useUserBrowsingStore(state=>state.searchResults);

    const navigate = useNavigate();
    const navSectionRef = useRef(null);
    
    const [list, setList] = useState(null as TuuidsBrowsingStoreSearchRow[] | null);
    const [sharedCuuids, setSharedCuuids] = useState(null as {[tuuid: string]: Collections2SharedContactsSharedCollection} | null);

    const pageCount = useMemo(()=>{
        if(!data) return 0

        // Extract basic statistic}s
        const docs = data.search_results?.docs;
        const itemCount = docs?.length || 0;
        const pages = Math.ceil(itemCount / CONST_PAGE_SIZE);

        return pages;
    }, [data]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getCollections2SharedContactsWithUser()
            .then(response=>{
                if(response.ok === false) throw new Error(response.err);
                if(response.partages) {
                    let sharesByTuuid = response.partages.reduce((acc, item)=>{
                        return {...acc, [item.tuuid]: item};
                    }, {} as {[tuuid: string]: Collections2SharedContactsSharedCollection});
                    setSharedCuuids(sharesByTuuid);
                } else {
                    setSharedCuuids({});
                }
            })
            .catch(err=>console.error("Error loading shared directory", err));
    }, [workers, ready, setSharedCuuids]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !sharedCuuids) return;

        if(!data) {
            setList(null);
            return
        }
        parseSearchResults(workers, userId, sharedCuuids, data, page)
            .then(results=>{
                setList(results || null);
            })
    }, [workers, ready, userId, sharedCuuids, data, page]);

    const onClickRow = useCallback((tuuid: string, typeNode: string)=>{
        if(!list) {
            console.warn("No files provided");
            return;
        }

        if(typeNode === 'Fichier') {
            const item = list.filter(item=>item.tuuid === tuuid).pop();
            if(item && item.contactId) {
                navigate(`/apps/collections2/c/${item.contactId}/f/${tuuid}`);
            } else {
                navigate('/apps/collections2/f/' + tuuid);
            }
        } else {
            // Browse to directory
            navigate('/apps/collections2/b/' + tuuid);
        }
    }, [navigate, list]);

    if(!list) return <></>;

    return (
        <section ref={navSectionRef} className='fixed top-32 left-0 px-2 bottom-10 overflow-y-auto w-full'>
            <SearchRagResponse value={searchResults?.ragResponse} />
            <SearchFilelistPane files={list} onClickRow={onClickRow} sortKey='score' sortOrder={-1}/>
            <PageSelectors page={page} setPage={setPage} pageCount={pageCount} />
        </section>
    );
}

function SearchStatistics(props: {data: Collections2SearchResults | null}) {

    let {data} = props;

    let [searchParams, ] = useSearchParams();
    let query = useMemo(()=>{
        if(!searchParams) return null;
        return searchParams.get('search');
    }, [searchParams]);
    
    // let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let numberFound = useMemo(()=>{
        if(!data) return 0;

        // Extract basic statistic}s
        let docs = data.search_results?.docs;
        let itemCount = docs?.length || 0;

        return itemCount;
    }, [data]);

    if(!data) {
        if(!query) return <p>Enter en query to begin.</p>;
        return <p>Loading ...</p>;
    }

    return (
        <p className='pt-2 text-sm'>
            <span className='pr-2'>Found {numberFound} files and directories. </span>
        </p>
    )
}

type UseSearchResultsType = {
    data: Collections2SearchResults | null,
    error: any,
    isLoading: boolean
}

/**
 * Runs a search query and returns the first result batch.
 * @returns Search results
 */
function useSearchResults(): UseSearchResultsType {
    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [searchParams] = useSearchParams();
    const searchResults = useUserBrowsingStore(state=>state.searchResults);

    const [fetcherKey, fetcherFunction] = useMemo(()=>{
        const query = searchParams.get('search');
        if(!workers || !ready || !searchParams || !workers || !query) return [null, null];
        const fetcherFunction = async (query: string) => workers?.connection.searchFiles(query, CONST_PAGE_SIZE);
        return [query, fetcherFunction]
    }, [workers, ready, searchParams]);
    
    const { data, error, isLoading } = useSWR(fetcherKey, fetcherFunction);

    if(searchResults?.ragResponse) return {data: searchResults.searchResults || null, error: null, isLoading: false};

    return {data: data || null, error, isLoading};
}

async function parseSearchResults(workers: AppWorkers, userId: string, sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection} | null, 
    data: Collections2SearchResults | null, page: number): Promise<TuuidsBrowsingStoreSearchRow[] | null> 
{
    let pageDocs: Collection2SearchResultsDoc[] | null;
    const docs = data?.search_results?.docs;
    if(!docs) throw new Error('No data to process');

    if(page === 1) {
        pageDocs = docs?.slice(0, CONST_PAGE_SIZE) || null;
    } else {
        const startIdx = (page - 1) * CONST_PAGE_SIZE;
        pageDocs = docs?.slice(startIdx, startIdx + CONST_PAGE_SIZE) || null;
    }

    if(!pageDocs || pageDocs.length === 0) {
        // Empty list, no processing required
        return null;
    };

    if(!workers) throw new Error('Workers not initialized');
    if(!userId) throw new Error('UserId not initialized');
    if(!pageDocs) throw new Error('pageDocs not initialized');
    if(!sharedCuuids) throw new Error('sharedCuuids not initialized');

    let files: Collections2FileSyncRow[] | null = null;
    let keys: DecryptedSecretKey[] | null = null;
    if(page === 1) {
        files = data?.files || null;
        keys = data?.keys || null;
    }

    if(!files) {
        // console.debug("Load files for page %d: %O", page, pageDocs)
        const tuuids = pageDocs.map(item=>item.id);
        const response = await workers.connection.getFilesByTuuid(tuuids, {shared: true});
        files = response.files;
        keys = response.keys;
    }

    if(!files) throw new Error("Files not provided");
    if(!keys) throw new Error("Keys not provided");

    const decryptedFiles = await loadFileData(workers, userId, sharedCuuids, pageDocs, files, keys);

    return decryptedFiles;
}

async function loadFileData(workers: AppWorkers, userId: string, sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection}, docs: Collection2SearchResultsDoc[], files: Collections2FileSyncRow[], keys: DecryptedSecretKey[]): Promise<TuuidsBrowsingStoreSearchRow[] | null> {
    // Process and save to IDB
    if(!workers) throw new Error('Workers not initialized');
    if(!userId) throw new Error('UserId not initialized');
    if(!docs || !files || !keys) throw new Error('docs/files/keys not provided');

    // Process file list. This decrypts them and saves the result to IDB.
    let decryptedFiles = await workers.directory.processDirectoryChunk(workers.encryption, userId, files, keys, {shared: true});

    // Convert data format
    let storeFiles = filesIdbToBrowsing(decryptedFiles);
    let storeFilesByTuuid = storeFiles.reduce((acc, item)=>{
        acc[item.tuuid] = item;

        // Check if this is a shared file
        if(item.ownerUserId) {
            // Shared file. Match to contactId.
            if(item.path_cuuids) {
                for(let cuuid of item.path_cuuids) {
                    let contact = sharedCuuids[cuuid];
                    if(contact) {
                        // Match - this is the contactId
                        item.contactId = contact.contact_id;
                        break;
                    }
                }
            }
        }

        return acc;
    }, {} as {[tuuid: string]: TuuidsBrowsingStoreRow});

    // Put files in order according to score
    if(docs) {
        let orderedFiles = [] as TuuidsBrowsingStoreSearchRow[];
        for(let item of docs) {
            let file = storeFilesByTuuid[item.id];
            if(file) {
                orderedFiles.push({...item, ...file});
            }
        }
        return orderedFiles;
    }

    return null;
}
