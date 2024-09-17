import { messageStruct } from 'millegrilles.cryptography';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ChatMessage = {message_id: string, role: string, content: string, date?: number};

interface ChatStoreState {
    messages: Array<ChatMessage>,
    currentResponse: string,
    relayAvailable: null | boolean,
    conversationId: null | string,
    currentUserCommand: null | messageStruct.MilleGrillesMessage,
    appendCurrentResponse: (chunk: string) => void,
    pushAssistantResponse: (message_id: string) => void,
    pushUserQuery: (query: string) => void,
    clear: () => void,
    setRelayAvailable: (available: null | boolean) => void,
    setConversationId: (conversationId: null | string) => void,
    setMessages: (messages: ChatMessage[]) => void,
    setCurrentUserCommand: (command: null | messageStruct.MilleGrillesMessage) => void,
};

const useChatStore = create<ChatStoreState>()(
    devtools(
        (set) => ({
            messages: [],
            currentResponse: '',
            relayAvailable: null,
            conversationId: null,
            currentUserCommand: null,
            appendCurrentResponse: (chunk) => set((state) => ({ currentResponse: state.currentResponse + chunk })),
            pushAssistantResponse: (message_id) => set((state) => ({ currentResponse: '', messages: [...state.messages, {message_id: message_id, role: 'assistant', content: state.currentResponse, date: Math.floor(new Date().getTime()/1000)}] })),
            pushUserQuery: (query) => set((state) => ({ messages: [...state.messages, {message_id: 'currentquery', role: 'user', content: query, date: Math.floor(new Date().getTime()/1000)}]})),
            clear: () => set(() => ({
                messages: [], currentResponse: '', conversationId: null, currentUserCommand: null,
            })),
            setRelayAvailable: (available) => set(()=>({relayAvailable: available})),
            setConversationId: (conversationId) => set(()=>({conversationId})),
            setMessages: (messages) => set(()=>({messages})),
            setCurrentUserCommand: (command) => set(state=>{
                let update = {currentUserCommand: command} as {currentUserCommand: messageStruct.MilleGrillesMessage, messages?: ChatMessage[]};
                if(command?.id) {
                    // Update the currentquery message to have a real id
                    let updatedMessages: ChatMessage[] = state.messages.map(item=>{
                        if(command.id && item.message_id === 'currentquery') {
                            return {...item, message_id: command.id};
                        }
                        return item;
                    });

                    update.messages = updatedMessages;
                }
                return update;
            }),
        })
    ),
);

export default useChatStore;
