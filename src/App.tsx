import React, {useState, useCallback, useEffect, MouseEventHandler, MouseEvent} from 'react';

import Loading from './Loading';
// import InitializeWorkers from './workers/InitializeWorkers';
// import InitializeIdb from './idb/InitializeIdb';
// import useWorkers from './workers/workers';
// import useConnectionStore from "./connectionStore";

import './i18n';
import './App.css';

// const ApplicationList = React.lazy(()=>import('./ApplicationList'));
// const ActivateCode = React.lazy(()=>import('./ActivateCode'));
// const AddSecurityDevice = React.lazy(()=>import('./AddSecurityDevice'));

function App() {

    let logoutHandler: MouseEventHandler<MouseEvent> = useCallback(()=>{
        window.location.href = '/auth/deconnecter_usager';
    }, []);

    return (
        <div className="App">
            <header className="App-header h-screen text-slate-300 flex-1 content-center">
                <div className='overflow-auto pt-4 pb-4'>
                    <p>Todo</p>
                </div>
            </header>
            {/* <InitializeWorkers />
            <InitializeIdb />
            <InitialAuthenticationCheck /> */}
        </div>
    );
}

export default App;