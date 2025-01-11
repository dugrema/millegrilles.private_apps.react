import { ChangeEvent, useCallback, useMemo, useState, FormEvent, useEffect } from "react";
import ActionButton from "../resources/ActionButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { Collection2SearchStore, filesIdbToBrowsing, TuuidsBrowsingStoreRow, TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Collection2SearchResultsDoc } from "../workers/connection.worker";
import SearchFilelistPane from "./SearchFileListPane";


function SearchPage() {

    let navigate = useNavigate();
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
        } else if(query && !searchResults) {
            console.debug("Run inital query");
            // Need to run the initial query
            if(!workers || !ready) throw new Error("workers not initialized");
            if(!userId) throw new Error("User not initialized");
            setSearchParams(params=>{params.set('search', searchInput); return params;});
            runSearchQuery(workers, searchInput, userId, username, setSearchResults, updateSearchListing)
                .catch(err=>{
                    console.error("Error running initial search query", err);
                })
        }
    }, [workers, ready, userId, searchInput, searchResults, setSearchInput, pageLoaded, setPageLoaded, query, setSearchParams, setSearchResults, updateSearchListing, username]);

    let onClickRow = useCallback((tuuid: string, typeNode: string)=>{
        console.debug("Click tuuid %s, typeNode %s", tuuid, typeNode);
        if(typeNode === 'Fichier') {
            console.warn("Click Fichier - todo");
        } else {
            // Browse to directory
            navigate('/apps/collections2/b/' + tuuid);
        }
    }, [navigate]);

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
                <DisplayMore />
            </section>
        </>
    );
}

export default SearchPage;

async function runSearchQuery(
    workers: AppWorkers, query: string, userId: string, username: string,
    setSearchResults: (searchResults: Collection2SearchStore | null) => void,
    updateSearchListing: (files: TuuidsBrowsingStoreSearchRow[] | null) => void)
{
    // Run search
    let searchResults = await workers.connection.searchFiles(query);

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
            updateSearchListing(sortedFiles);
        }
    } else if(searchResults.keys) {
        console.warn("Keys received with no files");
        updateSearchListing(null);
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
            <span className='pr-2'>Found {numberFound} files and directories. </span>
            <span className='pr-1'>{dirInfo?dirInfo:'No'} directories and</span>
            <span>{fileInfo?fileInfo:'No'} files are available to display.</span>
        </p>
    )
}

function DisplayMore() {

    let searchListing = useUserBrowsingStore(state=>state.searchListing);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);

    let [nextIndex, setNextIndex] = useState(null as number | null);

    let [itemsLoaded, itemsAvailable] = useMemo(()=>{
        if(!searchListing || !searchResults) return [0, 0];
        let docs = searchResults.searchResults?.search_results?.docs;
        if(!docs) return [0, 0];
        return [Object.keys(searchListing).length, docs.length];
    }, [searchListing, searchResults]);

    let onClickHandler = useCallback(async () => {
        // Load all remaining items
        let nextIndex = Math.min(itemsLoaded + 40, itemsAvailable);
        setNextIndex(nextIndex);
    }, [itemsLoaded, itemsAvailable, setNextIndex]);

    if(itemsLoaded === itemsAvailable) return <></>;  // Nothing to do

    return (
        <div className='pt-3 text-center'>
            <ActionButton onClick={onClickHandler}revertSuccessTimeout={2}>Display more</ActionButton>
            <SearchSyncHandler itemsLoaded={itemsLoaded} itemsAvailable={itemsAvailable} nextIndex={nextIndex} />
        </div>
    )
}

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
function SearchSyncHandler(props: {itemsLoaded: number, itemsAvailable: number, nextIndex: number | null}) {

    let {itemsLoaded, itemsAvailable, nextIndex} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let username = useConnectionStore(state=>state.username);
    let userId = useUserBrowsingStore(state=>state.userId);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let updateSearchListing = useUserBrowsingStore(state=>state.updateSearchListing);

    useEffect(()=>{
        if(!workers || !ready || !userId || !searchResults) return;
        if(nextIndex && itemsLoaded < nextIndex) {
            let start = itemsLoaded, end = nextIndex;
            let docs = searchResults?.searchResults?.search_results?.docs;
            if(docs) {
                let tuuids = docs.slice(start, end).map(item=>item.id);

                // Signal to cancel sync
                let cancelled = false;
                let cancelledSignal = () => cancelled;
                let cancel = () => {cancelled = true};

                loadTuuidsToSearch(workers, userId, tuuids, docs, cancelledSignal, updateSearchListing)

                return () => {
                    cancel();
                };
            }
        } else {
            // Empty screen
            console.debug("Empty search screen");
        }
    }, [workers, ready, nextIndex, itemsLoaded, itemsAvailable, userId, username, searchResults, updateSearchListing]);

    return <></>;
}

async function loadTuuidsToSearch(
    workers: AppWorkers, userId: string, tuuids: string[],
    searchResultDocs: Collection2SearchResultsDoc[],
    cancelledSignal: ()=>boolean,
    updateSearchListing: (files: TuuidsBrowsingStoreSearchRow[] | null) => void) 
{
    // Load
    let response = await workers.connection.getFilesByTuuid(tuuids);
    console.debug("Files by tuuid: %O", response);

    if(cancelledSignal()) return;  // Stop, search has changed

    let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files || [], response.keys);

    // Save files in store
    let storeFiles = filesIdbToBrowsing(files);
    console.debug("Search files received", storeFiles);
    let storeFilesByTuuid = storeFiles.reduce((acc, item)=>{
        acc[item.tuuid] = item;
        return acc;
    }, {} as {[tuuid: string]: TuuidsBrowsingStoreRow});

    // Put files in order according to score
    let mappedFiles = [];
    for(let item of searchResultDocs) {
        let file = storeFilesByTuuid[item.id];
        if(file) {
            mappedFiles.push({...item, ...file});
        }
    }
    console.debug("Mapped files: ", mappedFiles);
    updateSearchListing(mappedFiles);
}
