function Loading() {
    return (
        <div className="App">
            <header className="App-header loading App-loading">
            <div>
                <h1>MilleGrilles</h1>
                <p>The page is loading ...</p>
                <p className='pt-2'>
                    <span className='mr-4' onClick={()=>window.location.reload()}>Refresh</span>
                    <a href="/millegrilles">Back to portal</a>
                </p>
            </div>
            </header>
        </div>
    );
}

export default Loading;
