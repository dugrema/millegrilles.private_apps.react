import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { TuuidsIdbStoreRowType } from './idb/collections2StoreIdb';
// import { NotepadCategoryType, NotepadDocumentType, NotepadGroupType } from './idb/notepadStoreIdb';

export type TuuidsBrowsingStoreRow = {
    tuuid: string,
    nom: string,
    type_node: string,
    modification: number,
    dateFichier: number | null,
    taille: number | null,
    mimetype: string | null,
    thumbnail: Blob | null,
    smallImageFuuid: string | null,
    loadStatus: number | null,
}

export function filesIdbToBrowsing(files: TuuidsIdbStoreRowType[]): TuuidsBrowsingStoreRow[] {
    return files.map(item=>{
        let decryptedMetadata = item.decryptedMetadata;
        if(!decryptedMetadata) throw new Error("File not decrypted");
        let images = item.fileData?.images;
        let smallImageFuuid = null;
        if(images && images.small) {
            smallImageFuuid = images.small.hachage;
        }

        return {
            tuuid: item.tuuid,
            nom: decryptedMetadata.nom,
            type_node: item.type_node,
            modification: item.derniere_modification,
            dateFichier: decryptedMetadata.dateFichier,
            taille: item.fileData?.taille,
            mimetype: item.fileData?.mimetype,
            thumbnail: item.thumbnail,
            smallImageFuuid,
            // loadStatus: null,
        } as TuuidsBrowsingStoreRow;
    })
}

interface UserBrowsingStoreState {
    userId: string | null,
    currentCuuid: string | null,
    selectedTuuids: string[] | null,
    currentDirectory: {[tuuid: string]: TuuidsBrowsingStoreRow} | null,
    usernameBreadcrumb: string | null,
    breadcrumb: TuuidsBrowsingStoreRow[] | null,

    setCuuid: (cuuid: string | null) => void,
    setUserId: (userId: string) => void,
    updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
    setBreadcrumb: (username: string, breadcrumb: TuuidsBrowsingStoreRow[] | null) => void,
};

const useUserBrowsingStore = create<UserBrowsingStoreState>()(
    devtools(
        (set) => ({
            userId: null,
            currentCuuid: null,
            selectedTuuids: null,
            currentDirectory: null,
            usernameBreadcrumb: null,
            breadcrumb: null,

            setCuuid: (cuuid) => set(()=>({currentCuuid: cuuid})),
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
                for(let file of files) {
                    let tuuid = file.tuuid;
                    currentDirectory[tuuid] = file;
                }

                return {currentDirectory};
            }),

            setBreadcrumb: (username, breadcrumb) => set(()=>({usernameBreadcrumb: username, breadcrumb}))
        })
    ),
);

export default useUserBrowsingStore;
