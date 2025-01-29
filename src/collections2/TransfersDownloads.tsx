import { Link } from "react-router-dom";

function TransfersDownloads() {
    return (
        <>
            <p>Downloads</p>

            <Link to={'/apps/collections2/transfers'}
                className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                    Back
            </Link>
        </>
    );
}

export default TransfersDownloads;
