import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { TuuidsIdbStoreRowType } from './idb/collections2StoreIdb';
import { Collection2DirectoryStats, Collections2SearchResults, Collections2SharedContactsSharedCollection, Collections2SharedContactsUser } from '../workers/connection.worker';
// import { NotepadCategoryType, NotepadDocumentType, NotepadGroupType } from './idb/notepadStoreIdb';

export type TuuidsBrowsingStoreRow = {
    tuuid: string,
    parentCuuid: string | null,
    nom: string,
    type_node: string,
    modification: number,
    dateFichier: number | null,
    taille: number | null,
    mimetype: string | null,
    thumbnail: Blob | null,
    thumbnailDownloaded: boolean,
    loadStatus: number | null,
}

export type TuuidsBrowsingStoreSearchRow = TuuidsBrowsingStoreRow & {score: number};

export type Collection2SearchStore = {
    query: string,
    searchResults: Collections2SearchResults | null,
    stats: {files: number, directories: number},
    resultDate: Date,
}

export type Collection2SharedWithUser = {
    sharedCollections: Collections2SharedContactsSharedCollection[] | null,
    users: Collections2SharedContactsUser[] | null,
}

export enum ViewMode {
    List = 1,
    Thumbnails,
    Carousel,
}

export function filesIdbToBrowsing(files: TuuidsIdbStoreRowType[]): TuuidsBrowsingStoreRow[] {
    return files.map(item=>{
        let decryptedMetadata = item.decryptedMetadata;
        if(!decryptedMetadata) throw new Error("File not decrypted");
        // let images = item.fileData?.images;
        // let smallImageFuuid = null;
        // if(images && images.small) {
        //     smallImageFuuid = images.small.hachage;
        // }

        return {
            tuuid: item.tuuid,
            parentCuuid: item.path_cuuids?item.parent:null,
            nom: decryptedMetadata.nom,
            type_node: item.type_node,
            modification: item.derniere_modification,
            dateFichier: decryptedMetadata.dateFichier,
            taille: item.fileData?.taille,
            mimetype: item.fileData?.mimetype,
            thumbnail: item.thumbnail,
            thumbnailDownloaded: item.thumbnailDownloaded || false,
        } as TuuidsBrowsingStoreRow;
    })
}

interface UserBrowsingStoreState {
    userId: string | null,
    currentCuuid: string | null,
    currentCuuidDeleted: string | null,
    selectedTuuids: string[] | null,
    currentDirectory: {[tuuid: string]: TuuidsBrowsingStoreRow} | null,
    usernameBreadcrumb: string | null,
    breadcrumb: TuuidsBrowsingStoreRow[] | null,
    viewMode: ViewMode,
    directoryStatistics: Collection2DirectoryStats[] | null,
    searchResults: Collection2SearchStore | null,
    searchListing: {[tuuid: string]: TuuidsBrowsingStoreSearchRow} | null,
    
    sharedWithUser: Collection2SharedWithUser | null,
    sharedContact: Collections2SharedContactsUser | null,
    sharedBreadcrumb: TuuidsBrowsingStoreRow[] | null,
    sharedDirectoryStatistics: Collection2DirectoryStats[] | null,
    sharedCollection: Collections2SharedContactsSharedCollection | null,
    sharedCuuid: string | null,
    sharedCurrentDirectory: {[tuuid: string]: TuuidsBrowsingStoreRow} | null,

    selectionMode: boolean,
    selection: string[] | null,
    selectionPosition: string | null,

    modalNavUsername: string | null,
    modalNavBreadcrumb: TuuidsBrowsingStoreRow[] | null,
    modalNavCuuid: string | null,
    modalNavCurrentDirectory: {[tuuid: string]: TuuidsBrowsingStoreRow} | null,

    setCuuid: (cuuid: string | null) => void,
    setCuuidDeleted: (cuuid: string | null) => void,
    setUserId: (userId: string) => void,
    updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
    setBreadcrumb: (username: string, breadcrumb: TuuidsBrowsingStoreRow[] | null) => void,
    setViewMode: (viewMode: ViewMode) => void,
    setDirectoryStatistics: (directoryStatistics: Collection2DirectoryStats[] | null) => void,
    updateThumbnail: (tuuid: string, thumbnail: Blob) => void,
    deleteFilesDirectory: (files: string[]) => void,
    setSearchResults: (searchResults: Collection2SearchStore | null) => void,
    updateSearchListing: (listing: TuuidsBrowsingStoreSearchRow[] | null) => void,
    setSharedWithUser: (sharedWithUser: Collection2SharedWithUser | null) => void,
    setSharedContact: (sharedContact: Collections2SharedContactsUser | null) => void,
    setSharedBreadcrumb: (sharedBreadcrumb: TuuidsBrowsingStoreRow[] | null) => void,
    setSharedDirectoryStatistics: (directoryStatistics: Collection2DirectoryStats[] | null) => void,
    setSharedCollection: (sharedCollection: Collections2SharedContactsSharedCollection | null) => void,
    setSharedCuuid: (sharedCuuid: string | null) => void,
    updateSharedCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,

    setSelectionMode: (selectionMode: boolean) => void,
    setSelection: (selection: string[] | null) => void,
    setSelectionPosition: (selectionPosition: string | null) => void,

    setModalCuuid: (modalNavCuuid: string | null) => void,
    setModalBreadcrumb: (username: string, breadcrumb: TuuidsBrowsingStoreRow[] | null) => void,
    updateModalCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
};

const useUserBrowsingStore = create<UserBrowsingStoreState>()(
    devtools(
        (set) => ({
            userId: null,
            currentCuuid: null,
            currentCuuidDeleted: null,
            selectedTuuids: null,
            currentDirectory: null,
            usernameBreadcrumb: null,
            breadcrumb: null,
            viewMode: ViewMode.List,
            directoryStatistics: null,
            searchResults: null,
            searchListing: null,
            
            sharedWithUser: null,
            sharedContact: null,
            sharedBreadcrumb: null,
            sharedDirectoryStatistics: null,
            sharedCollection: null,
            sharedCuuid: null,
            sharedCurrentDirectory: null,

            selectionMode: false,
            selection: null,
            selectionPosition: null,

            modalNavUsername: null,
            modalNavBreadcrumb: null,
            modalNavCuuid: null,
            modalNavCurrentDirectory: null,
        
            setCuuid: (cuuid) => set(()=>({currentCuuid: cuuid, selection: null, selectionMode: false})),
            setCuuidDeleted: (cuuid) => set(()=>({currentCuuidDeleted: cuuid})),
            setUserId: (userId) => set(()=>({userId})),

            updateCurrentDirectory: (files) => set((state)=>{
                if(!files) {
                    // Clear
                    return {currentDirectory: null};
                }

                let currentDirectory = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
                if(state.currentDirectory) {
                    // Copy existing directory
                    currentDirectory = {...state.currentDirectory};
                }

                // Add and replace existing files
                let cuuid = state.currentCuuid;
                for(let file of files) {
                    // Ensure the file is for the correct directory (e.g. not a late event)
                    if(cuuid) {
                        if(file.parentCuuid !== cuuid) continue;  // Directory changed
                    } else {
                        if(file.parentCuuid) continue;  // Directory changed to root
                    }
                    let tuuid = file.tuuid;
                    currentDirectory[tuuid] = file;
                }

                return {currentDirectory};
            }),

            setBreadcrumb: (username, breadcrumb) => set(()=>({usernameBreadcrumb: username, breadcrumb})),
            setViewMode: (viewMode) => set(()=>({viewMode})),
            setDirectoryStatistics: (directoryStatistics) => set(()=>({directoryStatistics})),
            updateThumbnail: (tuuid, thumbnail) => set((state)=>{
                let currentDirectory = state.currentDirectory;
                if(currentDirectory) {
                    currentDirectory = {...currentDirectory};  // Copy
                    let file = currentDirectory[tuuid];
                    if(file) {
                        let fileCopy = {...file};
                        fileCopy.thumbnail = thumbnail;
                        fileCopy.thumbnailDownloaded = true;
                        currentDirectory[tuuid] = fileCopy;
                    }
                }
                return {currentDirectory};
            }),
            
            deleteFilesDirectory: (files: string[]) => set((state)=>{
                let updatedDirectory = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
                if(state.currentDirectory) {
                    updatedDirectory = {...state.currentDirectory};
                    // Filter out deleted files
                    for(let tuuid of files) {
                        delete updatedDirectory[tuuid];
                    }
                }
                return {currentDirectory: updatedDirectory};
            }),

            setSearchResults: (searchResults) => set(()=>({searchResults})),

            updateSearchListing: (listing) => set((state)=>{
                if(!listing) {
                    // Clear
                    return {searchListing: null};
                }

                let searchListing = {} as {[tuuid: string]: TuuidsBrowsingStoreSearchRow};
                if(state.searchListing) {
                    // Copy existing directory
                    searchListing = {...state.searchListing};
                }

                // Add and replace existing files
                for(let file of listing) {
                    let tuuid = file.tuuid;
                    searchListing[tuuid] = file;
                }

                return {searchListing};
            }),

            setSharedWithUser: (sharedWithUser) => set(()=>({sharedWithUser})),
            setSharedContact: (sharedContact) => set(()=>({sharedContact})),
            setSharedBreadcrumb: (sharedBreadcrumb) => set(()=>({sharedBreadcrumb})),
            setSharedDirectoryStatistics: (sharedDirectoryStatistics) => set(()=>({sharedDirectoryStatistics})),
            setSharedCollection: (sharedCollection) => set(()=>({sharedCollection})),
            setSharedCuuid: (sharedCuuid) => set(()=>({sharedCuuid, selection: null, selectionMode: false})),
            updateSharedCurrentDirectory: (files) => set((state)=>{
                if(!files) {
                    // Clear
                    return {sharedCurrentDirectory: null};
                }

                let currentDirectory = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
                if(state.sharedCurrentDirectory) {
                    // Copy existing directory
                    currentDirectory = {...state.sharedCurrentDirectory};
                }

                // Add and replace existing files
                for(let file of files) {
                    let tuuid = file.tuuid;
                    currentDirectory[tuuid] = file;
                }

                return {sharedCurrentDirectory: currentDirectory};
            }),

            setSelectionMode: (selectionMode) => set(()=>({selectionMode, selection: null})),
            setSelection: (selection) => set(()=>({selection})),
            setSelectionPosition: (selectionPosition) => set(()=>({selectionPosition})),

            setModalCuuid: (modalNavCuuid) => set(()=>({modalNavCuuid})),
            setModalBreadcrumb: (username, breadcrumb) => set(()=>({modalNavUsername: username, modalNavBreadcrumb: breadcrumb})),
            updateModalCurrentDirectory: (files) => set((state)=>{
                if(!files) {
                    // Clear
                    return {modalNavCurrentDirectory: null};
                }

                let currentDirectory = {} as {[tuuid: string]: TuuidsBrowsingStoreRow};
                if(state.modalNavCurrentDirectory) {
                    // Copy existing directory
                    currentDirectory = {...state.modalNavCurrentDirectory};
                }

                // Add and replace existing files
                for(let file of files) {
                    let tuuid = file.tuuid;
                    currentDirectory[tuuid] = file;
                }

                return {modalNavCurrentDirectory: currentDirectory};
            }),
        })
    ),
);

export default useUserBrowsingStore;
