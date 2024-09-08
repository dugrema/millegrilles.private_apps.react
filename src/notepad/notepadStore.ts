import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface NotepadStoreState {
    // messages: Array<ChatMessages>,
    // currentResponse: string,
    // appendCurrentResponse: (chunk: string) => void,
    // pushAssistantResponse: () => void,
    // pushUserQuery: (query: string) => void,
    // clear: () => void,
};

const useNotepadStore = create<NotepadStoreState>()(
    devtools(
        (set) => ({
            // messages: [],
            // currentResponse: '',
            // appendCurrentResponse: (chunk) => set((state) => ({ currentResponse: state.currentResponse + chunk })),
            // pushAssistantResponse: () => set((state) => ({ currentResponse: '', messages: [...state.messages, {role: 'assistant', content: state.currentResponse, date: Math.floor(new Date().getTime()/1000)}] })),
            // pushUserQuery: (query) => set((state) => ({ messages: [...state.messages, {role: 'user', content: query, date: Math.floor(new Date().getTime()/1000)}]})),
            // clear: () => set(() => ({messages: [], currentResponse: ''})),
        })
    ),
);

export default useNotepadStore;
