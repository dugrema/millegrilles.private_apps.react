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
    updateDocument: (doc: NotepadDocumentType) => void,  // Update/add document in current group
    updateCategory: (cat: NotepadCategoryType) => void,
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

            updateDocument: doc => set((state)=>{
                let updatedDocs = state.groupDocuments || [];
                
                // Check if we're updating the current group
                let selectedGroup = state.selectedGroup;
                if(doc.groupe_id !== selectedGroup) return {};  // Not current group, no change to apply.

                if(state.groupDocuments) {
                    let found = false;
                    updatedDocs = state.groupDocuments.map(d=>{
                        if(d.doc_id === doc.doc_id) {
                            // Replace the document with the udpate
                            found = true;
                            return doc;
                        } else {
                            return d;
                        }
                    });

                    if(!found) {
                        updatedDocs.push(doc);  // This is a new document
                    }
                } else {
                    updatedDocs.push(doc);  // The group is null
                }

                return {groupDocuments: updatedDocs};
            }),

            updateCategory: cat => set((state)=>{
                let updatedCategories = state.categories || [];

                if(state.categories) {
                    let found = false;
                    updatedCategories = updatedCategories.map(item=>{
                        if(item.categorie_id === cat.categorie_id) {
                            found = true;
                            return cat;
                        } else {
                            return item;
                        }
                    })
                    if(!found) updatedCategories.push(cat);
                } else {
                    updatedCategories.push(cat);
                }

                return {categories: updatedCategories};
            })
        })
    ),
);

export default useNotepadStore;
