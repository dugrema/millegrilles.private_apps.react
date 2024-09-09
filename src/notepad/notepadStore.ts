import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { NotepadCategoryType, NotepadDocumentType, NotepadGroupType } from './idb/notepadStoreIdb';

interface NotepadStoreState {
    categories: Array<NotepadCategoryType>,
    groups: Array<NotepadGroupType>,
    selectedGroup: string | null,
    groupDocuments: Array<NotepadDocumentType> | null,
    syncDone: boolean,
    setCategories: (categories: Array<NotepadCategoryType>) => void,
    setGroups: (groups: Array<NotepadGroupType>) => void,
    setGroupDocuments: (groupDocuments: Array<NotepadDocumentType> | null) => void,
    setSelectedGroup: (groupId: string | null) => void,
    clearGroup: () => void,
    setSyncDone: () => void,
};

const useNotepadStore = create<NotepadStoreState>()(
    devtools(
        (set) => ({
            categories: [],
            groups: [],
            selectedGroup: null,
            groupDocuments: null,
            syncDone: false,

            setCategories: (categories) => set(()=>({categories})),
            setGroups: (groups) => set(()=>({groups})),
            setGroupDocuments: (groupDocuments) => set(()=>({groupDocuments})),
            setSelectedGroup: (groupId) => set(()=>({selectedGroup: groupId})),

            clearGroup: () => set(()=>({selectedGroup: null, groupDocuments: null})),
            setSyncDone: () => set(()=>({syncDone: true})),
        })
    ),
);

export default useNotepadStore;
