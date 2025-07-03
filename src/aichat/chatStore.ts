import { messageStruct } from 'millegrilles.cryptography';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ConversationKey } from './aichatStoreIdb';

export type ChatMessageContent = {content?: string | null, thinking?: string | null};

export type ChatMessage = {message_id: string, query_role: string, content: string, thinking?: string | null, message_date?: number, model?: string | null, tuuids?: string[] | null};

export type ChatStoreConversationKey = ConversationKey & {
    secret: Uint8Array,
    encrypted_keys: {[key: string]: string},
};

export type LanguageModelType = {name: string, num_ctx?: number, capabilities?: string[] | null};

interface ChatStoreState {
    messages: Array<ChatMessage>,
    currentResponse: ChatMessageContent,
    relayAvailable: null | boolean,
    conversationId: null | string,  // Note: this is the key.keyId
    userId: null | string,
    key: null | ChatStoreConversationKey,
    conversationReadyToSave: boolean,
    newConversation: boolean,
    lastConversationsUpdate: number,  // Last time there was a conversation update (ms)
    lastConversationMessagesUpdate: number,  // Last time there was a conversation update (ms)
    models: LanguageModelType[],
    isAdmin: boolean,
    modelsUpdated: boolean,

    appendCurrentResponse: (conversation_id: string, chunk: ChatMessageContent) => void,
    pushAssistantResponse: (message_id: string) => void,
    pushUserQuery: (query: string, tuuids?: string[] | null) => void,
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
    setIsAdmin: (isAdmin: boolean) => void,
    setModelsUpdated: (modelsUpdated: boolean) => void,
};

const useChatStore = create<ChatStoreState>()(
    devtools(
        (set) => ({
            messages: [],
            currentResponse: {content: '', thinking: ''},
            relayAvailable: null,
            conversationId: null,
            userId: null,
            key: null,
            conversationReadyToSave: false,
            newConversation: false,
            lastConversationsUpdate: 1,
            lastConversationMessagesUpdate: 1,
            models: [],
            isAdmin: false,
            modelsUpdated: true,

            appendCurrentResponse: (conversation_id, chunk) => set((state) => {
                // Check that the conversation was not switched while receiving updates
                if(state.conversationId !== conversation_id) throw new Error('Wrong conversation id');
                const content = (state.currentResponse.content || '') + (chunk.content || '');
                const thinking = (state.currentResponse.thinking || '') + (chunk.thinking || '');
                const currentResponse = {content, thinking};
                return { currentResponse }
            }),
            pushAssistantResponse: (message_id) => set((state) => { 
                // Ensure we're not duplicating messages. This can happen if the server exchange event is applied first.
                let messages = state.messages.filter(item=>item.message_id !== message_id);
                return {
                    currentResponse: {}, 
                    messages: [
                        ...messages, 
                        {
                            message_id: message_id, 
                            query_role: 'assistant', 
                            content: state.currentResponse.content || '', 
                            thinking: state.currentResponse.thinking, 
                            message_date: Math.floor(new Date().getTime()),
                        }
                    ] 
                };
            }),
            pushUserQuery: (query, tuuids) => set((state) => ({ 
                messages: [
                    ...state.messages, 
                    {message_id: 'currentquery', query_role: 'user', content: query, message_date: Math.floor(new Date().getTime()), tuuids}
                ]
            })),
            clear: () => set(() => ({
                messages: [], currentResponse: {content: '', thinking: ''}, conversationId: null,
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
            setIsAdmin: (isAdmin) => set(()=>({isAdmin})),
            setModelsUpdated: (modelsUpdated) => set(() => ({ modelsUpdated })),
        })
    ),
);

export default useChatStore;
