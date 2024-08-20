import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ChatMessages = {role: string, content: string};

interface ChatStoreState {
    messages: Array<ChatMessages>,
    currentResponse: string,
    appendCurrentResponse: (chunk: string) => void,
    pushAssistantResponse: () => void,
    pushUserQuery: (query: string) => void,
    clear: () => void,
};

const useChatStore = create<ChatStoreState>()(
    devtools(
        (set) => ({
            messages: [],
            currentResponse: '',
            appendCurrentResponse: (chunk) => set((state) => ({ currentResponse: state.currentResponse + chunk })),
            pushAssistantResponse: () => set((state) => ({ currentResponse: '', messages: [...state.messages, {role: 'assistant', content: state.currentResponse}] })),
            pushUserQuery: (query) => set((state) => ({ messages: [...state.messages, {role: 'user', content: query}]})),
            clear: () => set(() => ({messages: [], currentResponse: ''})),
        })
    ),
);

export default useChatStore;
