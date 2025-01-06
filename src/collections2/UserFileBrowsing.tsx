import { useParams } from "react-router-dom";
import { Breadcrumb, ButtonBar } from "./BrowsingElements";
import FilelistPane from "./FilelistPane";

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
        </>
    );
}

export default ViewUserFileBrowsing;
