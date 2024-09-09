import React from 'react';
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

const NotepadApp = React.lazy(()=>import('./notepad/AppNotepad'));
const NotepadMainPage = React.lazy(()=>import('./notepad/NotepadMainPage'));
const ViewGroupDocuments = React.lazy(()=>import('./notepad/ViewGroupDocuments'));
const ViewDocument = React.lazy(()=>import('./notepad/ViewDocument'));

// SenseursPassifs
const AppSenseursPassifs = React.lazy(()=>import('./senseurspassifs/App'));
const SenseursPassifsMain = React.lazy(()=>import('./senseurspassifs/Main'));
const SenseursPassifsAllDevices = React.lazy(()=>import('./senseurspassifs/Devices'));
const SenseursPassifsDevice = React.lazy(()=>import('./senseurspassifs/Device'));
const SenseursPassifsBluetoothConfiguration = React.lazy(()=>import('./senseurspassifs/bluetooth/Bluetooth'));
const SenseursPassifsComponentDetail = React.lazy(()=>import('./senseurspassifs/ComponentDetail'));
const SenseursPassifsEditDeviceDisplays = React.lazy(()=>import('./senseurspassifs/EditDeviceDisplays'));
const SenseursPassifsEditDevicePrograms = React.lazy(()=>import('./senseurspassifs/EditDevicePrograms'));
const SenseursPassifsAccountConfiguration = React.lazy(()=>import('./senseurspassifs/AccountConfiguration'));

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
		path: "/apps/notepad",
		element: <NotepadApp />,
        children: [
            { path: "/apps/notepad", element: <NotepadMainPage /> },
            { path: "/apps/notepad/group/:groupId", element: <ViewGroupDocuments /> },
            { path: "/apps/notepad/document/:docId", element: <ViewDocument /> },
        ]
  	},
    {
		path: "/apps/senseurspassifs",
		element: <AppSenseursPassifs />,
        children: [
            { path: "/apps/senseurspassifs", element: <SenseursPassifsMain /> },
            { path: "/apps/senseurspassifs/devices", element: <SenseursPassifsAllDevices /> },
            { path: "/apps/senseurspassifs/device/:deviceId", element: <SenseursPassifsDevice /> },
            { path: "/apps/senseurspassifs/device/:deviceId/component/:componentId", element: <SenseursPassifsComponentDetail /> },
            { path: "/apps/senseurspassifs/device/:deviceId/displays", element: <SenseursPassifsEditDeviceDisplays /> },
            { path: "/apps/senseurspassifs/device/:deviceId/programs", element: <SenseursPassifsEditDevicePrograms /> },
            { path: "/apps/senseurspassifs/bluetooth", element: <SenseursPassifsBluetoothConfiguration /> },
            { path: "/apps/senseurspassifs/configuration", element: <SenseursPassifsAccountConfiguration /> },
        ]
  	},
]);

function App() {

    // let logoutHandler: MouseEventHandler<MouseEvent> = useCallback(()=>{
    //     window.location.href = '/auth/deconnecter_usager';
    // }, []);

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
        <div>
            <HeaderMenu title='MilleGrilles' />

            <main className='fixed top-6 bottom-8 overflow-y-auto pt-4 pb-2 pl-2 pr-2 w-full'>
                <section>
                    <h1 className='text-xl font-bold'>Application list</h1>
                    <nav className='pt-6'>
                        <ul>
                            <li className='pt-2'><Link className='underline' to='/apps/aichat'>Ai Chat</Link></li>
                            <li className='pt-2'><Link className='underline'to='/apps/notepad'>Notepad</Link></li>
                            <li className='pt-2'><Link className='underline'to='/apps/senseurspassifs'>SenseursPassifs</Link></li>
                            <li className='pt-2'><a href='/millegrilles' className='underline'>Back to portal</a></li>
                        </ul>
                    </nav>
                </section>
            </main>
            
            <Footer />
        </div>
    )
}
