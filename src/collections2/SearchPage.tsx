import { ChangeEvent, FormEventHandler, useCallback, useMemo, useState, FormEvent, useEffect } from "react";
import ActionButton from "../resources/ActionButton";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { Collection2SearchStore, filesIdbToBrowsing, TuuidsBrowsingStoreRow, TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Collection2DirectoryStats, Collection2SearchResultsDoc } from "../workers/connection.worker";
import SearchFilelistPane from "./SearchFileListPane";


function SearchPage() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let username = useConnectionStore(state=>state.username);
    let userId = useUserBrowsingStore(state=>state.userId);
    let searchListing = useUserBrowsingStore(state=>state.searchListing);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let setSearchResults = useUserBrowsingStore(state=>state.setSearchResults);
    let updateSearchListing = useUserBrowsingStore(state=>state.updateSearchListing);

    let [pageLoaded, setPageLoaded] = useState(false);
    let [searchParams, setSearchParams] = useSearchParams();
    let query = useMemo(()=>{
        if(!searchParams) return null;
        console.debug("Search params", searchParams);
        return searchParams.get('search');
    }, [searchParams]);

    let files = useMemo(()=>{
        if(!searchListing) return null;
        let filesValues = Object.values(searchListing);

        return filesValues;
    }, [searchListing]) as TuuidsBrowsingStoreSearchRow[] | null;

    let [searchInput, setSearchInput] = useState(query || '');
    let searchInputHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        setSearchInput(value);
    }, [setSearchInput]);

    let searchHandler = useCallback(async()=>{
        setSearchResults(null);
        updateSearchListing(null);
        if(!searchInput) {
            setSearchParams(params=>{params.delete('search'); return params;});
        } else {
            if(!workers || !ready) throw new Error("workers not initialized");
            if(!userId) throw new Error("User not initialized");
            let result = await runSearchQuery(workers, searchInput, userId, username, setSearchResults, updateSearchListing);
            console.debug("Search result ", result);
            setSearchParams(params=>{params.set('search', searchInput); return params;});
        }
    }, [workers, ready, username, userId, searchInput, setSearchResults, setSearchParams, updateSearchListing]);

    let submitHandler = useCallback((e: FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        e.stopPropagation();
        searchHandler();
    }, [searchHandler]);

    useEffect(()=>{
        if(pageLoaded) return;
        setPageLoaded(true);
        if(!searchInput && searchResults?.query) {
            // Put the search query back in the input box
            setSearchInput(searchResults.query);
        }
    }, [searchInput, searchResults, setSearchInput, pageLoaded, setPageLoaded]);

    let onClickRow = useCallback(()=>{
        console.debug("Click row - TODO");
    }, []);

    return (
        <>
            <section className='pt-1'>
                <form onSubmit={submitHandler}>
                    <div className='grid grid-cols-12'>
                        <label className='col-span-2'>Search query</label>
                        <input type='text' value={searchInput} onChange={searchInputHandler}
                            className='col-span-8 text-black' />
                        <ActionButton onClick={searchHandler}>Search</ActionButton>
                    </div>
                </form>
            </section>

            <section>
                <SearchStatistics />
            </section>

            <section className='pt-3'>
                <SearchFilelistPane files={files} onClickRow={onClickRow} sortKey='score' sortOrder={-1}/>
            </section>

            <SearchSyncHandler query={query} />
        </>
    );
}

export default SearchPage;

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
function SearchSyncHandler(props: {query: string | null | undefined}) {

    let {query} = props;
    
    let [searchStatistics, setSearchStatistics] = useState(null as Collection2DirectoryStats[] | null);

    let [breadcrumbTuuids, setBreadcrumbTuuids] = useState(null as string[] | null);
    let [tuuid, rootTuuid] = useMemo(()=>{
        if(!breadcrumbTuuids || breadcrumbTuuids.length === 0) return [null, null];
        let rootTuuid = breadcrumbTuuids[0]
        let tuuid = breadcrumbTuuids[breadcrumbTuuids.length-1]
        return [tuuid, rootTuuid];
    }, [breadcrumbTuuids]);

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let username = useConnectionStore(state=>state.username);
    let userId = useUserBrowsingStore(state=>state.userId);
    let setSearchResults = useUserBrowsingStore(state=>state.setSearchResults);

    // useEffect(()=>{
    //     if(!workers || !ready || !userId) return;
    //     if(query) {
    //         console.debug("Search with query: %s", query);

    //         // Signal to cancel sync
    //         let cancelled = false;
    //         let cancelledSignal = () => cancelled;
    //         let cancel = () => {cancelled = true};

    //         setBreadcrumbTuuids(null);

    //         runSearchQuery(workers, query, userId, username, cancelledSignal, setSearchResults)
    //             .catch(err=>console.error("Error running search", err));

    //         return () => {
    //             cancel();
    //         };

    //     } else {
    //         // Empty screen
    //         console.debug("Empty search screen");
    //     }
    // }, [workers, ready, query, userId, username, setBreadcrumbTuuids, setSearchResults]);

    return <></>;
}

async function runSearchQuery(
    workers: AppWorkers, query: string, userId: string, username: string,
    setSearchResults: (searchResults: Collection2SearchStore | null) => void,
    setSearchListing: (files: TuuidsBrowsingStoreSearchRow[] | null) => void)
{
    // Run search
    let searchResults = await workers.connection.searchFiles(query);

    console.debug("Search results: ", searchResults);
    if(!searchResults.ok) throw new Error(`Error during sync: ${searchResults.err}`);

    // Extract basic statistics
    let fileCount = 0, directoryCount = 0;
    let docs = searchResults.search_results?.docs;
    if(docs) {
        for(let item of docs) {
            if(item.fuuid) fileCount++;
            else directoryCount++;
        }
    }

    setSearchResults({
        query,
        searchResults,
        stats: {files: fileCount, directories: directoryCount},
        resultDate: new Date(),
    });

    let sortedFiles = null as TuuidsBrowsingStoreSearchRow[] | null;
    if(searchResults.files) { 
        // Process and save to IDB
        let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, searchResults.files, searchResults.keys);

        // Save files in store
        let storeFiles = filesIdbToBrowsing(files);
        console.debug("Search files received", storeFiles);
        let storeFilesByTuuid = storeFiles.reduce((acc, item)=>{
            acc[item.tuuid] = item;
            return acc;
        }, {} as {[tuuid: string]: TuuidsBrowsingStoreRow});

        // Put files in order according to score
        let docs = searchResults.search_results?.docs;
        if(docs) {
            sortedFiles = [];
            for(let item of docs) {
                let file = storeFilesByTuuid[item.id];
                if(file) {
                    sortedFiles.push({...item, ...file});
                }
            }
            console.debug("Sorted files: ", sortedFiles);
            setSearchListing(sortedFiles);
        }
    } else if(searchResults.keys) {
        console.warn("Keys received with no files");
        setSearchListing(null);
    }
}

function SearchStatistics() {
    
    let searchResults = useUserBrowsingStore(state=>state.searchResults);

    let [fileInfo, dirInfo, numberFound] = useMemo(()=>{
        if(!searchResults || !searchResults.stats) return [null, null, null];

        let stats = searchResults.stats;
        let numberFound = searchResults.searchResults?.search_results?.numFound;

        return [stats.files, stats.directories, numberFound];
    }, [searchResults]);

    if(!searchResults) {
        if(searchResults === false) return <></>
        return (<p>Loading ...</p>)
    }

    return (
        <p className='pt-2'>
            <span className='pr-2'>Found {numberFound} results:</span>
            <span className='pr-1'>{dirInfo?dirInfo:'No'} directories,</span>
            <span>{fileInfo?fileInfo:'No'} files</span>
        </p>
    )
}
