import { Link } from "react-router-dom";

function DisplayCategories() {

    return (
        <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                <Link to='/apps/notepad/' className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    Back
                </Link>
            </div>
            <h1 className='font-bold text-lg'>Categories</h1>
        </>
    )
}

export default DisplayCategories;
