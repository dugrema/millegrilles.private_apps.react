function ProgressBar(props: {value: number | null}) {

    let {value} = props;

    if(typeof(value) !== 'number') return <></>;

    return (
        <div className="ml-2 relative col-span-3 w-11/12 mt-1 h-4 text-xs bg-slate-200 rounded-full dark:bg-slate-700">
            {value<=30?
                <div className='w-full text-violet-800 text-xs font-medium text-center'>{value} %</div>
                :
                <></>
            }
            <div className="absolute top-0 h-4 bg-violet-600 text-xs font-medium text-violet-100 text-center p-0.5 leading-none rounded-full transition-all duration-500" style={{width: value+'%'}}>
                {value>30?<>{value} %</>:''}
            </div>
        </div>            
    )
}

export default ProgressBar;
