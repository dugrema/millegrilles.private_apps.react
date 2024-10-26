import { messageStruct } from 'millegrilles.cryptography';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ConversationKey } from './aichatStoreIdb';

export type ChatMessage = {message_id: string, query_role: string, content: string, message_date?: number};

export type ChatStoreConversationKey = ConversationKey & {
    secret: Uint8Array,
    encrypted_keys: {[key: string]: string},
};

export type LanguageModelType = {name: string};

interface ChatStoreState {
    messages: Array<ChatMessage>,
    currentResponse: string,
    relayAvailable: null | boolean,
    conversationId: null | string,  // Note: this is the key.keyId
    userId: null | string,
    key: null | ChatStoreConversationKey,
    conversationReadyToSave: boolean,
    newConversation: boolean,
    lastConversationsUpdate: number,  // Last time there was a conversation update (ms)
    lastConversationMessagesUpdate: number,  // Last time there was a conversation update (ms)
    models: LanguageModelType[],
    appendCurrentResponse: (conversation_id: string, chunk: string) => void,
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
    setLastConversationsUpdate: (lastConversationsUpdate: number) => void,
    setLastConversationMessagesUpdate: (lastConversationMessagesUpdate: number) => void,
    setModels: (models: LanguageModelType[]) => void,
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
            lastConversationsUpdate: 1,
            lastConversationMessagesUpdate: 1,
            models: [],
            appendCurrentResponse: (conversation_id, chunk) => set((state) => {
                // Check that the conversation was not switched while receiving updates
                if(state.conversationId !== conversation_id) throw new Error('Wrong conversation id');
                return { currentResponse: state.currentResponse + chunk }
            }),
            pushAssistantResponse: (message_id) => set((state) => { 
                // Ensure we're not duplicating messages. This can happen if the server exchange event is applied first.
                let messages = state.messages.filter(item=>item.message_id !== message_id);
                return {
                    currentResponse: '', 
                    messages: [
                        ...messages, 
                        {message_id: message_id, query_role: 'assistant', content: state.currentResponse, message_date: Math.floor(new Date().getTime())}
                    ] 
                };
            }),
            pushUserQuery: (query) => set((state) => ({ 
                messages: [
                    ...state.messages, 
                    {message_id: 'currentquery', query_role: 'user', content: query, message_date: Math.floor(new Date().getTime())}
                ]
            })),
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
            setLastConversationsUpdate: (lastConversationsUpdate) => set(()=>({lastConversationsUpdate})),
            setLastConversationMessagesUpdate: (lastConversationMessagesUpdate) => set(()=>({lastConversationMessagesUpdate})),
            setModels: (models) => set(()=>({models})),
        })
    ),
);

export default useChatStore;
