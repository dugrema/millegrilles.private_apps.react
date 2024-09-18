import { messageStruct } from 'millegrilles.cryptography';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ConversationKey } from './aichatStoreIdb';

export type ChatMessage = {message_id: string, role: string, content: string, date?: number};

export type ChatStoreConversationKey = ConversationKey & {
    secret: Uint8Array,
    encrypted_keys: {[key: string]: string},
};

interface ChatStoreState {
    messages: Array<ChatMessage>,
    currentResponse: string,
    relayAvailable: null | boolean,
    conversationId: null | string,  // Note: this is the key.keyId
    userId: null | string,
    key: null | ChatStoreConversationKey,
    conversationReadyToSave: boolean,
    newConversation: boolean,
    appendCurrentResponse: (chunk: string) => void,
    pushAssistantResponse: (message_id: string) => void,
    pushUserQuery: (query: string) => void,
    clear: () => void,
    setRelayAvailable: (available: null | boolean) => void,
    setMessages: (messages: ChatMessage[]) => void,
    applyCurrentUserCommand: (command: null | messageStruct.MilleGrillesMessage) => void,
    setUserId: (userId: null | string) => void,
    setConversationKey: (key: null | ChatStoreConversationKey) => void,
    setConversationReadyToSave: (ready: boolean) => void,
    setNewConversation: (newConversation: boolean) => void,
};

const useChatStore = create<ChatStoreState>()(
    devtools(
        (set) => ({
            messages: [],
            currentResponse: '',
            relayAvailable: null,
            conversationId: null,
            userId: null,
            key: null,
            conversationReadyToSave: false,
            newConversation: false,
            appendCurrentResponse: (chunk) => set((state) => ({ currentResponse: state.currentResponse + chunk })),
            pushAssistantResponse: (message_id) => set((state) => ({ currentResponse: '', messages: [...state.messages, {message_id: message_id, role: 'assistant', content: state.currentResponse, date: Math.floor(new Date().getTime()/1000)}] })),
            pushUserQuery: (query) => set((state) => ({ messages: [...state.messages, {message_id: 'currentquery', role: 'user', content: query, date: Math.floor(new Date().getTime()/1000)}]})),
            clear: () => set(() => ({
                messages: [], currentResponse: '', conversationId: null,
                newConversation: true, conversationReadyToSave: false, key: null,
            })),
            setRelayAvailable: (available) => set(()=>({relayAvailable: available})),
            setMessages: (messages) => set(()=>({messages})),
            applyCurrentUserCommand: (command) => set(state=>{
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
            setUserId: (userId) => set(()=>({userId: userId})),
            setConversationKey: (key) => set(()=>{
                if(key) {
                    // Also set the conversationId
                    return {key: key, conversationId: key.cle_id};
                }
                return {key: null, conversationId: null};
            }),
            setConversationReadyToSave: (ready) => set(()=>({conversationReadyToSave: ready})),
            setNewConversation: (newConversation) => set(()=>({newConversation})),
        })
    ),
);

export default useChatStore;
