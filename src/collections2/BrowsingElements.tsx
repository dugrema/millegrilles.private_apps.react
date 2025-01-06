import { Link } from "react-router-dom";

export function Breadcrumb() {
    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span>Usager</span>
                    <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                </li>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span>test 2025-01-05</span>
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span>subdir 1</span>
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span>i</span>
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
                <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    <span>Documents from last year</span>
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
            </ol>
        </nav>
    );
}

export function ButtonBar() {
    return (
        <div className='grid grid-cols-2 md:grid-cols-3'>
            <div className='col-span-2'>
                <Link to='/apps/collection2/test'
                    className='varbtn px-3 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        i
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        a
                </Link>
                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        b
                </Link>
                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        c
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Fichier
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Collection
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + ZIP
                </Link>
            </div>
            <div className='py-2 align-text-bottom'>
                <p>Loading ...</p>
            </div>
        </div>        
    );
}
