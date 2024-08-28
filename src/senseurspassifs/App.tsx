import { Outlet } from "react-router-dom";
import HeaderMenu from "../Menu";
import Footer from '../Footer';
import DeviceEvents from "./DeviceEvents";

import 'font-awesome/css/font-awesome.min.css';

export default function SenseursPassifs() {

    // Note : loading of device information and event updates are handled in <DeviceEvents />

    return (
        <div className='pl-2 pr-2'>
            <HeaderMenu title='Senseurs Passifs' backLink={true} />
            <div id="main" className="pt-8 pb-10"><Outlet /></div>
            <Footer />
            <DeviceEvents />
        </div>
    )
}
