import React from 'react';
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";

import { ErrorPage } from './ErrorBoundary';
import InitializeWorkers from './workers/InitializeWorkers';

import HeaderMenu from './Menu';

import './i18n';

import 'font-awesome/css/font-awesome.min.css';
import 'react-datetime/css/react-datetime.css';
import 'quill/dist/quill.snow.css'; // Add css for snow theme
import './App.css';

import Footer from './Footer';

// AI Chat
const AppAiChat = React.lazy(()=>import('./aichat/AppAiChat'));
const ChatSummaryHistory = React.lazy(()=>import('./aichat/ChatSummaryHistory'));
const AiChatConversation = React.lazy(()=>import('./aichat/Conversation'));

// Collections 2
const AppCollections2 = React.lazy(()=>import('./collections2/AppCollections2'));
const Collections2ViewMainPage = React.lazy(()=>import('./collections2/ViewFileBrowsing'));

// Notepad
const NotepadApp = React.lazy(()=>import('./notepad/AppNotepad'));
const NotepadMainPage = React.lazy(()=>import('./notepad/NotepadMainPage'));
const ViewGroup = React.lazy(()=>import('./notepad/ViewGroup'));
const ViewGroupDocuments = React.lazy(()=>import('./notepad/ViewGroupDocuments'));
const ViewDocument = React.lazy(()=>import('./notepad/ViewDocument'));
const Categories = React.lazy(()=>import('./notepad/Categories'));
const RestoreGroups = React.lazy(()=>import('./notepad/RestoreGroups'));

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
		element: <AppAiChat />,
        errorElement: <ErrorPage />,
        children: [
            { path: "/apps/aichat", element: <ChatSummaryHistory /> },
            { path: "/apps/aichat/newConversation", element: <AiChatConversation /> },
            { path: "/apps/aichat/conversation/:conversationId", element: <AiChatConversation /> },
        ]
  	},
      {
		path: "/apps/collections2",
		element: <AppCollections2 />,
        errorElement: <ErrorPage />,
        children: [
            { path: "/apps/collections2", element: <Collections2ViewMainPage /> },
        ]
  	},
    {
		path: "/apps/notepad",
		element: <NotepadApp />,
        children: [
            { path: "/apps/notepad", element: <NotepadMainPage /> },
            { path: "/apps/notepad/categories", element: <Categories /> },
            { path: "/apps/notepad/restoreGroups", element: <RestoreGroups /> },
            { 
                path: "/apps/notepad/group/:groupId", 
                element: <ViewGroup />,
                children: [
                    {path: "/apps/notepad/group/:groupId", element: <ViewGroupDocuments/>},
                    {path: "/apps/notepad/group/:groupId/:docId", element: <ViewDocument/>}
                ]
            },
        ],
        errorElement: <ErrorPage />
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
        ],
        errorElement: <ErrorPage />
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
                            <li className='pt-2'><Link className='underline'to='/apps/collections2'>Collections 2</Link></li>
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
