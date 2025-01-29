import { Outlet } from "react-router-dom";

function Transfers() {
    return (
        <>
            <h1 className='pt-12 text-xl font-bold'>Transfers</h1>
            <Outlet />
        </>
    );
}

export default Transfers;
