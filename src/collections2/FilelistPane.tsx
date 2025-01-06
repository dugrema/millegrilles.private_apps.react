function FilelistPane() {
    return (
        <>
            <div className='grid grid-cols-12 bg-slate-800 text-sm'>
                <div className='col-span-7 px-1'>Name</div>
                <p className='col-span-1 px-1'>Size</p>
                <p className='col-span-2 px-1'>Type</p>
                <p className='col-span-2 px-1'>Date</p>
            </div>
            <div className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                <div className='col-span-7 px-1'>
                    <div className='p-1 inline-block'>TN</div>
                    <span className='pl-1'>File 2.pdf</span>
                </div>
                <p className='col-span-1 px-1'>28.9 kb</p>
                <p className='col-span-2 px-1'>application/pdf</p>
                <p className='col-span-2 px-1'>1999/02/05 09:09:10</p>
            </div>
            <div className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                <div className='col-span-7 px-1'>
                    <div className='p-1 inline-block'>TN</div>
                    <span className='pl-1'>File 2.pdf</span>
                </div>
                <p className='col-span-1 px-1'>124 kb</p>
                <p className='col-span-2 px-1'>application/pdf</p>
                <p className='col-span-2 px-1'>1999/02/05 09:09:10</p>
            </div>
            <div className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                <div className='col-span-7 px-1'>
                    <span className='pr-1'>TN</span>
                    <span>File 3.pdf</span>
                </div>
                <p className='col-span-1 px-1'>12.3 mb</p>
                <p className='col-span-2 px-1'>application/pdf</p>
                <p className='col-span-2 px-1'>1999/02/05 09:09:10</p>
            </div>
            <div className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                <div className='col-span-7 px-1'>
                    <span className='pr-1'>TN</span>
                    <span>File 4.pdf</span>
                </div>
                <p className='col-span-1 px-1'>28.9kb</p>
                <p className='col-span-2 px-1'>application/pdf</p>
                <p className='col-span-2 px-1'>1999/02/05 09:09:10</p>
            </div>
            <div className='grid grid-cols-12 odd:bg-slate-700 even:bg-slate-600 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm cursor-pointer'>
                <div className='col-span-7 px-1'>
                    <span className='pr-1'>TN</span>
                    <span>File 5.pdf</span>
                </div>
                <p className='col-span-1 px-1'>28.9kb</p>
                <p className='col-span-2 px-1'>application/pdf</p>
                <p className='col-span-2 px-1'>1999/02/05 09:09:10</p>
            </div>
        </>
    );
}

export default FilelistPane;
