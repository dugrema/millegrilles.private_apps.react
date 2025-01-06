import { useParams } from "react-router-dom";
import { Breadcrumb, ButtonBar } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";
import { useEffect } from "react";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";

function ViewUserFileBrowsing() {

    let { tuuid } = useParams();

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.syncDirectory(tuuid)
            .then(response=>{
                console.debug("Directory loaded: %O", response)
            })
            .catch(err=>console.error("Error loading directory: %O", err));
    }, [workers, ready, tuuid]);

    return (
        <>
            <Breadcrumb />

            <section className='pt-2'>
                <ButtonBar />                    
            </section>

            <section className='pt-3'>
                <FilelistPane />
            </section>
        </>
    );
}

export default ViewUserFileBrowsing;
