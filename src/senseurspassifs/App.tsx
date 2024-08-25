import { Outlet } from "react-router-dom";
import HeaderMenu from "../Menu";
import Footer from '../Footer';

export default function SenseursPassifs() {
    return (
        <div className='pl-2 pr-2'>
            <HeaderMenu title='Senseurs Passifs' backLink={true} />
            <div id="main" className="pt-8"><Outlet /></div>
            <Footer />
        </div>
    )
}
