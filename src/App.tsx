import React, {useCallback, MouseEventHandler, MouseEvent} from 'react';
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";

import { ErrorPage } from './ErrorBoundary';
import InitializeWorkers from './workers/InitializeWorkers';
// import useWorkers from './workers/workers';
// import useConnectionStore from "./connectionStore";

import './i18n';
import './App.css';

const AppAiChat = React.lazy(()=>import('./aichat/AppAiChat'));
const AppSenseursPassifs = React.lazy(()=>import('./senseurspassifs/AppSenseursPassifs'));

const router = createBrowserRouter([
	{
	  	path: "/apps",
	  	element: <ApplicationList />,
		errorElement: <ErrorPage />
	},
	{
		path: "/apps/aichat",
		element: <AppAiChat />
  	},
    {
		path: "/apps/senseurspassifs",
		element: <AppSenseursPassifs />
  	},
]);

function App() {

    let logoutHandler: MouseEventHandler<MouseEvent> = useCallback(()=>{
        window.location.href = '/auth/deconnecter_usager';
    }, []);

    return (
        <div className="App">
            <header className="App-header h-screen text-slate-300 flex-1 content-center">
                <div className='overflow-auto pt-4 pb-4'>
                    <RouterProvider router={router} />
                </div>
            </header>
            <InitializeWorkers />
            {/* <AuthenticationCheck /> */}
        </div>
    );
}

export default App;

function ApplicationList() {
    return (
        <div>
            <p>Todo</p>

            <div>
                <p><Link to='/apps/aichat'>Ai Chat</Link></p>
                <p><Link to='/apps/senseurspassifs'>SenseursPassifs</Link></p>
            </div>
        </div>
    )
}