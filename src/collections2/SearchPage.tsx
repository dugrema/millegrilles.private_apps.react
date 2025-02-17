import { ChangeEvent, useCallback, useMemo, useState, FormEvent, useEffect, useRef } from "react";
import ActionButton from "../resources/ActionButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore, { Collection2SearchStore, filesIdbToBrowsing, TuuidsBrowsingStoreRow, TuuidsBrowsingStoreSearchRow } from "./userBrowsingStore";
import { Collection2SearchResultsDoc, Collections2SharedContactsSharedCollection } from "../workers/connection.worker";
import SearchFilelistPane from "./SearchFileListPane";


function SearchPage() {

    let navigate = useNavigate();
    let workers = useWorkers();
    let navSectionRef = useRef(null);

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let username = useConnectionStore(state=>state.username);
    let userId = useUserBrowsingStore(state=>state.userId);
    let searchListing = useUserBrowsingStore(state=>state.searchListing);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let setSearchResults = useUserBrowsingStore(state=>state.setSearchResults);
    let setSearchResultsPosition = useUserBrowsingStore(state=>state.setSearchResultsPosition);
    let updateSearchListing = useUserBrowsingStore(state=>state.updateSearchListing);
    let [sharedCuuids, setSharedCuuids] = useState(null as {[tuuid: string]: Collections2SharedContactsSharedCollection} | null);

    let [pageLoaded, setPageLoaded] = useState(false);
    let [searchParams, setSearchParams] = useSearchParams();
    let query = useMemo(()=>{
        if(!searchParams) return null;
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
        if(!sharedCuuids) throw new Error('Shares not loaded');
        
        // Reset search variables
        setSearchResultsPosition(0);
        setSearchResults(null);
        updateSearchListing(null);
        sessionStorage.removeItem(`search_${userId}`);
        
        if(!searchInput) {
            setSearchParams(params=>{params.delete('search'); return params;});
        } else {
            if(!workers || !ready) throw new Error("workers not initialized");
            if(!userId) throw new Error("User not initialized");
            await runSearchQuery(workers, searchInput, userId, username, setSearchResults, updateSearchListing, sharedCuuids, setSearchResultsPosition);
            setSearchParams(params=>{params.set('search', searchInput); return params;});
        }
    }, [workers, ready, username, userId, searchInput, setSearchResults, setSearchParams, updateSearchListing, sharedCuuids, setSearchResultsPosition]);

    let submitHandler = useCallback((e: FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        e.stopPropagation();
        searchHandler();
    }, [searchHandler]);

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
        if(pageLoaded || !workers || !ready || !userId || !sharedCuuids) return;
        setPageLoaded(true);

        if(searchResults) {
            // Check if we need to put scroll back in position
            let searchPosition = sessionStorage.getItem(`search_${userId}`);
            if(searchPosition) {
                let searchPositionInt = Number.parseInt(searchPosition);
                // @ts-ignore
                navSectionRef.current.scrollTo({top: searchPositionInt});
            }
        }

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
            // Need to run the initial query
            if(!workers || !ready) throw new Error("workers not initialized");
            if(!userId) throw new Error("User not initialized");
            setSearchParams(params=>{params.set('search', searchInput); return params;});
            runSearchQuery(workers, searchInput, userId, username, setSearchResults, updateSearchListing, sharedCuuids, setSearchResultsPosition)
                .catch(err=>{
                    console.error("Error running initial search query", err);
                })
        }
    }, [
        workers, ready, userId, searchInput, searchResults, setSearchInput, pageLoaded, setPageLoaded, 
        query, setSearchParams, setSearchResults, updateSearchListing, username, sharedCuuids, navSectionRef,
        setSearchResultsPosition,
    ]);

    let onClickRow = useCallback((tuuid: string, typeNode: string)=>{
        if(typeNode === 'Fichier') {
            let item = searchListing?searchListing[tuuid]:null;
            if(item && item.contactId) {
                navigate(`/apps/collections2/c/${item.contactId}/f/${tuuid}`);
            } else {
                navigate('/apps/collections2/f/' + tuuid);
            }
        } else {
            // Browse to directory
            navigate('/apps/collections2/b/' + tuuid);
        }
    }, [navigate, searchListing]);

    let [positionChanged, setPositionChanged] = useState(false);
    let onScrollHandler = useCallback((e: Event)=>setPositionChanged(true), [setPositionChanged]);
    useEffect(()=>{
        if(!positionChanged) return;
        let navRef = navSectionRef;
        let timeout = setTimeout(() => {
            //@ts-ignore
            let position = navRef.current.scrollTop;
            sessionStorage.setItem(`search_${userId}`, ''+position)
            setPositionChanged(false);
        }, 750);
        return () => clearTimeout(timeout);
    }, [navSectionRef, userId, positionChanged, setPositionChanged]);

    useEffect(()=>{
        if(!navSectionRef.current) return;
        let navRef = navSectionRef.current;
        //@ts-ignore
        navRef.addEventListener('scroll', onScrollHandler);
        return ()=>{
            //@ts-ignore
            navRef.removeEventListener('scroll', onScrollHandler);
        };
    }, [onScrollHandler, navSectionRef]);

    return (
        <>
            <section className='fixed left-0 top-12 pt-1 px-2 w-full'>
                <form onSubmit={submitHandler}>
                    <div className='grid grid-cols-6 sm:grid-cols-12'>
                        <input type='text' value={searchInput} onChange={searchInputHandler} autoFocus
                            className='col-span-4 sm:col-span-10 md:col-span-11 text-black h-6 text-slate-100 bg-slate-500' />
                        <ActionButton onClick={searchHandler} revertSuccessTimeout={3} className='ml-1 text-center col-span-2 md:col-span-1' mainButton={true}>
                            Search
                        </ActionButton>
                    </div>
                </form>
                <SearchStatistics />
            </section>

            <section ref={navSectionRef} className='fixed top-32 left-0 px-2 bottom-10 overflow-y-auto w-full'>
                <SearchFilelistPane files={files} onClickRow={onClickRow} sortKey='score' sortOrder={-1}/>
                <DisplayMore sharedCuuids={sharedCuuids} />
            </section>
        </>
    );
}

export default SearchPage;

async function runSearchQuery(
    workers: AppWorkers, query: string, userId: string, username: string,
    setSearchResults: (searchResults: Collection2SearchStore | null) => void,
    updateSearchListing: (files: TuuidsBrowsingStoreSearchRow[] | null) => void,
    sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection},
    setSearchResultsPosition: (position: number)=>void)
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
        setSearchResultsPosition(searchResults.files.length);

        // Process and save to IDB
        let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, searchResults.files, searchResults.keys);

        // Save files in store
        let storeFiles = filesIdbToBrowsing(files);
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
        let docs = searchResults.search_results?.docs;
        if(docs) {
            sortedFiles = [];
            for(let item of docs) {
                let file = storeFilesByTuuid[item.id];
                if(file) {
                    sortedFiles.push({...item, ...file});
                }
            }
            updateSearchListing(sortedFiles);
        }
    } else if(searchResults.keys) {
        console.warn("Keys received with no files");
        updateSearchListing(null);
    }
}

function SearchStatistics() {

    let [searchParams, ] = useSearchParams();
    let query = useMemo(()=>{
        if(!searchParams) return null;
        return searchParams.get('search');
    }, [searchParams]);

    
    let searchListing = useUserBrowsingStore(state=>state.searchListing);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let [dirInfo, numberFound, numberDisplayed] = useMemo(()=>{
        if(!searchResults || !searchResults.stats) return [null, null, null];

        let numberDisplayed = searchListing?Object.keys(searchListing).length:0;
        let stats = searchResults.stats;
        let numberFound = searchResults.searchResults?.search_results?.numFound;

        return [stats.directories, numberFound, numberDisplayed];
    }, [searchResults, searchListing]);

    if(!searchResults) {
        if(!query) return <p>Enter en query to begin.</p>;
        return <p>Loading ...</p>;
    }

    return (
        <p className='pt-2 text-sm'>
            <span className='pr-2'>Found {numberFound} files and directories. </span>
            <span className='pr-1'>{numberDisplayed} unique items displayed.</span>
        </p>
    )
}

function DisplayMore(props: {sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection} | null}) {

    let {sharedCuuids} = props;

    let searchListing = useUserBrowsingStore(state=>state.searchListing);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let searchResultsPosition = useUserBrowsingStore(state=>state.searchResultsPosition);

    let [nextIndex, setNextIndex] = useState(null as number | null);

    // let [itemsLoaded, itemsAvailable] = useMemo(()=>{
    let itemsAvailable = useMemo(()=>{
        // if(!searchListing || !searchResults) return [0, 0];
        if(!searchListing || !searchResults) return 0;
        let docs = searchResults.searchResults?.search_results?.docs;
        // if(!docs) return [0, 0];
        if(!docs) return 0;
        // return [Object.keys(searchListing).length, docs.length];
        return docs.length
    }, [searchListing, searchResults]);

    let onClickHandler = useCallback(async () => {
        // Load all remaining items
        let nextIndex = Math.min(searchResultsPosition + 40, itemsAvailable);
        setNextIndex(nextIndex);
    }, [itemsAvailable, setNextIndex, searchResultsPosition]);

    useEffect(()=>{
        return () => {setNextIndex(0);};
    }, [setNextIndex]);

    if(searchResultsPosition === itemsAvailable || !sharedCuuids) return <></>;  // Nothing to do

    return (
        <div className='pt-3 text-center'>
            <ActionButton onClick={onClickHandler}revertSuccessTimeout={2}>Display more</ActionButton>
            <SearchSyncHandler itemsAvailable={itemsAvailable} nextIndex={nextIndex} sharedCuuids={sharedCuuids} />
        </div>
    )
}

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
function SearchSyncHandler(
    props: {/*itemsLoaded: number,*/ itemsAvailable: number, nextIndex: number | null,
    sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection}}) 
{

    let {sharedCuuids} = props;

    let {/*itemsLoaded,*/ itemsAvailable, nextIndex} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let username = useConnectionStore(state=>state.username);
    let userId = useUserBrowsingStore(state=>state.userId);
    let searchResults = useUserBrowsingStore(state=>state.searchResults);
    let updateSearchListing = useUserBrowsingStore(state=>state.updateSearchListing);
    let searchResultsPosition = useUserBrowsingStore(state=>state.searchResultsPosition);
    let setSearchResultsPosition = useUserBrowsingStore(state=>state.setSearchResultsPosition);

    useEffect(()=>{
        if(!workers || !ready || !userId || !searchResults) return;
        
        if(nextIndex) setSearchResultsPosition(nextIndex);  // Ensure index is updated
        
        if(nextIndex && searchResultsPosition < nextIndex) {
            let start = searchResultsPosition, end = nextIndex;
            let docs = searchResults?.searchResults?.search_results?.docs;

            // console.debug("Update search results from %s to %s: %O ", start, end, docs)

            if(docs) {
                let tuuids = docs.slice(start, end).map(item=>item.id);
                // console.debug("Updated result with tuuids", tuuids);

                // Signal to cancel sync
                let cancelled = false;
                let cancelledSignal = () => cancelled;
                let cancel = () => {cancelled = true};

                loadTuuidsToSearch(workers, userId, tuuids, docs, cancelledSignal, updateSearchListing, sharedCuuids);

                return () => {
                    cancel();
                };
            }
        } else {
            // Empty screen
            //console.debug("Empty search screen");
        }
    }, [workers, ready, nextIndex, searchResultsPosition, itemsAvailable, userId, username, searchResults, sharedCuuids, updateSearchListing, setSearchResultsPosition]);

    return <></>;
}

async function loadTuuidsToSearch(
    workers: AppWorkers, userId: string, tuuids: string[],
    searchResultDocs: Collection2SearchResultsDoc[],
    cancelledSignal: ()=>boolean,
    updateSearchListing: (files: TuuidsBrowsingStoreSearchRow[] | null) => void,
    sharedCuuids: {[tuuid: string]: Collections2SharedContactsSharedCollection}) 
{
    // Load
    let response = await workers.connection.getFilesByTuuid(tuuids);
    // console.debug("Tuuids %O loaded\n%O", tuuids, response);
    
    //TODO - Fix cancel, always getting triggered on nextIndex change
    // if(cancelledSignal()) return;  // Stop, search has changed

    let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files || [], response.keys);

    // Save files in store
    let storeFiles = filesIdbToBrowsing(files);
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
    let mappedFiles = [];
    for(let item of searchResultDocs) {
        let file = storeFilesByTuuid[item.id];
        if(file) {
            mappedFiles.push({...item, ...file});
        }
    }

    // console.debug("Add mapped files: ", mappedFiles);

    updateSearchListing(mappedFiles);
}
