import { Outlet } from "react-router-dom";

import HeaderMenu from "./Menu";
import Footer from "../Footer";

function Collections2() {
    return (
        <div>
            <HeaderMenu title='Collections' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}

export default Collections2;
