import { useParams } from "react-router-dom";
import { Breadcrumb, ButtonBar } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";
import { useEffect } from "react";
import useWorkers from "../workers/workers";
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
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setCuuid = useUserBrowsingStore(state=>state.setCuuid);

    useEffect(()=>{
        if(!workers || !ready) return;

        Promise.resolve().then(async () => {
            if(!workers) throw new Error("Workers not initialized");
            
            // Change the current directory in the store. 
            // This will stop the processing of events in flight for the previous directory (they will be ignored).
            setCuuid(tuuid || null);

            // Register directory change listener

            // Load folder from IDB (if known)

            // Sync folder from server
            let complete = false;
            let skip = 0;
            while(!complete) {
                console.debug("Sync tuuid", tuuid);
                let response = await workers.connection.syncDirectory(tuuid, skip);
                console.debug("Directory loaded: %O", response);
                if(!response.ok) throw new Error(`Error during sync: ${response.err}`);
                complete = response.complete;
                if(response.files) { skip += response.files.length; }
                else { complete = true; }
            }

        })
        .catch(err=>console.error("Error loading directory: %O", err));

        return () => {
            // Unregister directory change listener
        }
    }, [workers, ready, tuuid, setCuuid]);


    return <></>;
}
