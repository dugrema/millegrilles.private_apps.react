import { Link } from "react-router-dom";

export default function Main() {

    return (
        <>
            <nav>
                <Link to='/apps/senseurspassifs/devices'
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        All devices
                </Link>
            </nav>
            <nav>
                <Link to='/apps'
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>
        </>
    )

}
