import React, {useCallback, MouseEventHandler, MouseEvent} from 'react';
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";

import { ErrorPage } from './ErrorBoundary';
import InitializeWorkers from './workers/InitializeWorkers';
// import useWorkers from './workers/workers';
// import useConnectionStore from "./connectionStore";

import HeaderMenu from './Menu';

import './i18n';
import './App.css';
import Footer from './Footer';

// AI Chat
const AppAiChat = React.lazy(()=>import('./aichat/AppAiChat'));

// SenseursPassifs
const AppSenseursPassifs = React.lazy(()=>import('./senseurspassifs/App'));
const SenseursPassifsMain = React.lazy(()=>import('./senseurspassifs/Main'));
const SenseursPassifsAllDevices = React.lazy(()=>import('./senseurspassifs/Devices'));
const SenseursPassifsDevice = React.lazy(()=>import('./senseurspassifs/Device'));

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
		element: <AppSenseursPassifs />,
        children: [
            { path: "/apps/senseurspassifs", element: <SenseursPassifsMain /> },
            { path: "/apps/senseurspassifs/devices", element: <SenseursPassifsAllDevices /> },
            { path: "/apps/senseurspassifs/device/:deviceId", element: <SenseursPassifsDevice /> },
        ]
  	},
]);

function App() {

    let logoutHandler: MouseEventHandler<MouseEvent> = useCallback(()=>{
        window.location.href = '/auth/deconnecter_usager';
    }, []);

    return (
        <>
            <div className="App-background text-slate-300">
                <RouterProvider router={router} />
            </div>
            <InitializeWorkers />
            {/* <AuthenticationCheck /> */}
        </>
    );
}

export default App;

function ApplicationList() {
    return (
        <div className='pl-2 pr-2'>
            <HeaderMenu title='MilleGrilles' />

            <main className='fixed top-6 bottom-8 overflow-y-auto pt-4 pb-2 w-full'>
                <section>
                    <h1>Application list</h1>
                    <nav>
                        <p><Link to='/apps/aichat'>Ai Chat</Link></p>
                        <p><Link to='/apps/senseurspassifs'>SenseursPassifs</Link></p>
                    </nav>
                </section>
            </main>
            
            <Footer />
        </div>
    )
}
