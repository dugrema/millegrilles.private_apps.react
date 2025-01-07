import { useParams } from "react-router-dom";
import { Breadcrumb, ButtonBar } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";
import { useEffect } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useUserBrowsingStore from "./userBrowsingStore";

function ViewUserFileBrowsing() {

    let { tuuid } = useParams();

    return (
        <>
            <Breadcrumb />

            <section className='pt-2'>
                <ButtonBar />                    
            </section>

            <section className='pt-3'>
                <FilelistPane />
            </section>

            <DirectorySyncHandler tuuid={tuuid} />
        </>
    );
}

export default ViewUserFileBrowsing;

/**
 * Handles the sync of files in a directory.
 * @returns 
 */
function DirectorySyncHandler(props: {tuuid: string | null | undefined}) {

    let {tuuid} = props;

    let workers = useWorkers();
    let userId = useUserBrowsingStore(state=>state.userId);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    
    let setCuuid = useUserBrowsingStore(state=>state.setCuuid);

    useEffect(()=>{
        if(!workers || !ready || !userId) return;
        let tuuidValue = tuuid || null;

        // Signal to cancel sync
        let cancelled = false;
        let cancelledSignal = () => cancelled;
        let cancel = () => {cancelled = true};

        // Change the current directory in the store. 
        setCuuid(tuuidValue);

        // Register directory change listener
        //TODO

        // Sync
        synchronizeDirectory(workers, userId, tuuidValue, cancelledSignal)
            .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            cancel();

            // Unregister directory change listener
            //TODO
        }
    }, [workers, ready, userId, tuuid, setCuuid]);

    return <></>;
}

async function synchronizeDirectory(workers: AppWorkers, userId: string, tuuid: string | null, cancelledSignal: ()=>boolean) {
    // if(!workers) throw new Error("Workers not initialized");

    // Load folder from IDB (if known)

    // Sync folder from server
    let complete = false;
    let skip = 0;
    while(!complete) {
        if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 1`)
        console.debug("Sync tuuid", tuuid);
        let response = await workers.connection.syncDirectory(tuuid, skip);

        console.debug("Directory loaded: %O", response);
        if(!response.ok) throw new Error(`Error during sync: ${response.err}`);
        complete = response.complete;
        
        if(response.stats) {
            // Update store information with new directory stats
            //TODO
        }

        if(response.files) { 
            skip += response.files.length; 

            // Process and save to IDB
            let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys);

            if(cancelledSignal()) throw new Error(`Sync of ${tuuid} has been cancelled - 2`)
            // Save files in store
            //TODO
        } else if(response.keys) {
            console.warn("Keys received with no files");
        }
        else { 
            complete = true; 
        }

    }
}
