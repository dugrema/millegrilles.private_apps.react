import React from 'react';

// Importing using React lazy to allow faster load on initial /app page access
const Collections2DefaultPageRedirect = React.lazy(()=>import('./DefaultRedirect'));
const Collections2Configuration = React.lazy(()=>import('./Configuration'));
const Collections2UserFileBrowsing = React.lazy(()=>import('./UserFileBrowsing'));
const Collections2UserFileViewing = React.lazy(()=>import('./UserFileViewing'));
const Collections2UserDeletedFilesBrowsing = React.lazy(()=>import('./BrowsingDeleted'));
const Collections2Search = React.lazy(()=>import('./SearchPage'));
const Collections2SharedContent = React.lazy(()=>import('./SharedContent'));
const Collections2SharedUsers = React.lazy(()=>import('./SharedUsers'));
const Collections2SharedFileBrowsing = React.lazy(()=>import('./SharedFileBrowsing'));
const Collections2SharedFileViewing = React.lazy(()=>import('./SharedFileViewing'));
const Collections2SharedUserCollections = React.lazy(()=>import('./SharedUserCollections'));
const SettingsPage = React.lazy(()=>import('./Settings'));
const MediaConversionsPage = React.lazy(()=>import('./MediaConversions'));

function createCollections2ReactBrowserChildren() {
    return [
        { path: "", element: <Collections2DefaultPageRedirect /> },
        { path: "config", element: <Collections2Configuration /> },
        { path: "b", element: <Collections2UserFileBrowsing /> },
        { path: "b/:tuuid", element: <Collections2UserFileBrowsing /> },
        { path: "f/:tuuid", element: <Collections2UserFileViewing /> },
        { path: "f/:tuuid/v/:videoFuuid", element: <Collections2UserFileViewing /> },
        { path: "d", element: <Collections2UserDeletedFilesBrowsing /> },
        { path: "d/:tuuid", element: <Collections2UserDeletedFilesBrowsing /> },
        { path: "conversions", element: <MediaConversionsPage /> },
        { path: "s", element: <Collections2Search /> },
        { 
            path: "c", 
            element: <Collections2SharedContent />,
            children: [
                { path: "", element: <Collections2SharedUsers /> },
                { path: ":userId", element: <Collections2SharedUsers /> },
                { path: ":userId/shares", element: <Collections2SharedUserCollections /> },
                { path: ":contactId/b/:tuuid", element: <Collections2SharedFileBrowsing /> },
                { path: ":contactId/f/:tuuid", element: <Collections2SharedFileViewing /> },
                { path: ":contactId/f/:tuuid/v/:videoFuuid", element: <Collections2SharedFileViewing /> },
            ]
        },
        { path: "settings", element: <SettingsPage /> },
    ];
}

export default createCollections2ReactBrowserChildren;
