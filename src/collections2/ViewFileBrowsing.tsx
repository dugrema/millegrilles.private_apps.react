import { Link } from "react-router-dom";

function ViewMainPage() {
    return (
        <>
            <nav aria-label='breadcrumb' className='w-max'>
                <ol className='flex w-full flex-wrap items-center rounded-md bg-slate-500 px-1 py-1'>
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors duration-300'>
                        <span>Usager</span>
                        <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                    </li>
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors duration-300'>
                        <span>test 2025-01-05</span>
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors duration-300'>
                        <span>subdir 1</span>
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors duration-300'>
                        <span>i</span>
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 transition-colors duration-300'>
                        <span>Documents from last year</span>
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                </ol>
            </nav>

            <section>
                <h2 className='font-bold pt-4 pb-2'>Edit</h2>
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                    <Link to='/apps/collection2/test'
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Test
                    </Link>
                </div>
            </section>

            <section>
                <h2 className='font-bold pt-4 pb-2'>Groups</h2>
                
            </section>
        </>
    );
}

export default ViewMainPage;
