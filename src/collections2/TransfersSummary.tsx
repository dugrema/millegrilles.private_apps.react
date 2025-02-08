import { Link } from "react-router-dom";

function TransfersSummary() {
    return (
        <>
            <p>Summary</p>

            <Link to='/apps/collections2/transfers/uploads'
                className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                    Uploads
            </Link>

            <Link to='/apps/collections2/transfers/downloads'
                className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                    Downloads
            </Link>
        </>
    );
}

export default TransfersSummary;
