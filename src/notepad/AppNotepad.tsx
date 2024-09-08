import { Outlet } from "react-router-dom";

import SyncUserProfile from "./SyncUserProfile";
import HeaderMenu from "../Menu";
import Footer from "../Footer";

function NotepadApp() {
    return (
        <div>
            <HeaderMenu title='MilleGrilles Notepad' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
            <SyncUserProfile />
        </div>
    );
}

export default NotepadApp;
