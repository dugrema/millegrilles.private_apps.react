import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ChatMessages = {role: string, content: string, date?: number};

interface ChatStoreState {
    messages: Array<ChatMessages>,
    currentResponse: string,
    relayAvailable: null | boolean,
    appendCurrentResponse: (chunk: string) => void,
    pushAssistantResponse: () => void,
    pushUserQuery: (query: string) => void,
    clear: () => void,
    setRelayAvailable: (available: null | boolean) => void,
};

const useChatStore = create<ChatStoreState>()(
    devtools(
        (set) => ({
            messages: [],
            currentResponse: '',
            relayAvailable: null,
            appendCurrentResponse: (chunk) => set((state) => ({ currentResponse: state.currentResponse + chunk })),
            pushAssistantResponse: () => set((state) => ({ currentResponse: '', messages: [...state.messages, {role: 'assistant', content: state.currentResponse, date: Math.floor(new Date().getTime()/1000)}] })),
            pushUserQuery: (query) => set((state) => ({ messages: [...state.messages, {role: 'user', content: query, date: Math.floor(new Date().getTime()/1000)}]})),
            clear: () => set(() => ({messages: [], currentResponse: ''})),
            setRelayAvailable: (available) => set(()=>({relayAvailable: available})),
        })
    ),
);

export default useChatStore;
