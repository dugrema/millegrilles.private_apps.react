import { Outlet } from "react-router-dom";
import HeaderMenu from "../Menu";
import Footer from '../Footer';
import DeviceEvents from "./DeviceEvents";

export default function SenseursPassifs() {

    // Note : loading of device information and event updates are handled in <DeviceEvents />

    return (
        <div>
            <HeaderMenu title='Senseurs Passifs' backLink={true} />
            <main id="main" className='fixed top-8 bottom-10 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <Outlet />
            </main>
            <Footer />
            <DeviceEvents />
        </div>
    )
}
