import { useState, useCallback, useMemo, useEffect, useRef, ChangeEvent, KeyboardEvent } from 'react';
import Markdown from 'react-markdown';
import { proxy } from 'comlink';
import { Link, useNavigate, useParams } from 'react-router-dom';

import useWorkers from '../workers/workers';
import useChatStore, { ChatStoreConversationKey, ChatMessage as StoreChatMessage } from './chatStore';

import useConnectionStore from '../connectionStore';
import { ChatAvailable } from './ChatSummaryHistory';
import { ChatMessage, ConversationKey, getConversation, getConversationMessages, saveConversation, saveMessages } from './aichatStoreIdb';
import { MessageResponse, SubscriptionMessage } from 'millegrilles.reactdeps.typescript';
import { messageStruct } from 'millegrilles.cryptography';
import { EncryptionBase64Result } from '../workers/encryption.worker';
import { getDecryptedKeys, saveDecryptedKey } from '../MillegrillesIdb';
import { SendChatMessageCommand } from '../workers/connection.worker';

export default function Chat() {

    let workers = useWorkers();
    let navigate = useNavigate();

    let relayAvailable = useChatStore(state=>state.relayAvailable);
    let conversationId = useChatStore(state=>state.conversationId);
    let conversationKey = useChatStore(state=>state.key);
    let setConversationKey = useChatStore(state=>state.setConversationKey);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useChatStore(state=>state.userId);
    let applyCurrentUserCommand = useChatStore(state=>state.applyCurrentUserCommand);
    let setStoreMessages = useChatStore(state=>state.setMessages);
    let conversationReadyToSave = useChatStore(state=>state.conversationReadyToSave);
    let setConversationReadyToSave = useChatStore(state=>state.setConversationReadyToSave);

    let {conversationId: paramConversationId} = useParams();

    // Initialize conversationId
    useEffect(()=>{
        if(!ready) return;
        if(!workers) throw new Error("Workers not initialized");

        if(userId && paramConversationId) {
            // setConversationId(paramConversationId);

            // Load the existing conversation messages
            getConversation(paramConversationId)
                .then(async chatConversation => {
                    if(!workers) throw new Error("Workers not initialized");
                    if(!userId) throw new Error("UserId is missing");
                    if(!paramConversationId) throw new Error("paramConversationId is missing");

                    let conversationKey = chatConversation?.conversationKey;
                    if(!conversationKey || !conversationKey.cle_id) throw new Error("Missing keyId information");
                    let chatMessages = await getConversationMessages(userId, paramConversationId);
                    let decryptedKey = (await getDecryptedKeys([conversationKey.cle_id])).pop();
                    if(!decryptedKey) {
                        // Try to load from server
                        throw new Error("TODO load conversation key from keymaster");
                    }
                    console.debug("Decode decrypted key", decryptedKey);
                    let encryptedKeys = await workers.encryption.encryptSecretKey(decryptedKey.cleSecrete);
                    let storeConversationKey: ChatStoreConversationKey = {
                        ...conversationKey,
                        secret: decryptedKey.cleSecrete,
                        encrypted_keys: encryptedKeys,
                    };

                    // @ts-ignore
                    let storeMessageList: StoreChatMessage[] = chatMessages.filter(item=>item.role && item.content)
                    storeMessageList.sort(sortMessagesByDate);
                    setConversationKey(storeConversationKey);
                    setStoreMessages(storeMessageList);
                    
                    // Force one last screen scroll
                    setTimeout(()=>setLastUpdate(new Date().getTime()), 250);
                })
                .catch(err=>console.error("Error loading messages from IDB", err));
        } else {
            // Initialize a new conversation key
            workers.encryption.generateSecretKey(['AiLanguage', 'ollama_relai'])
                .then(async key => {
                    if(!workers) throw new Error("Workers not initialized");
                    
                    let encryptedKeys = await workers.encryption.encryptSecretKey(key.secret);
                    let conversationKey: ChatStoreConversationKey = {...key, encrypted_keys: encryptedKeys};
                    console.debug("New conversation key ", conversationKey);
                    setConversationKey(conversationKey);
                })
                .catch(err=>console.error("Error creating new conversation encryption key", err));
        }
    }, [workers, userId, setConversationKey, paramConversationId, setStoreMessages, ready])

    let messages = useChatStore(state=>state.messages);
    let appendCurrentResponse = useChatStore(state=>state.appendCurrentResponse);
    let pushAssistantResponse = useChatStore(state=>state.pushAssistantResponse);
    let pushUserQuery = useChatStore(state=>state.pushUserQuery);
    let clearConversation = useChatStore(state=>state.clear);

    let [chatInput, setChatInput] = useState('');
    let [waiting, setWaiting] = useState(false);
    let [lastUpdate, setLastUpdate] = useState(0);

    let chatInputOnChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        let value = e.currentTarget.value;
        setChatInput(value);
        setLastUpdate(new Date().getTime());
    }, [setChatInput, setLastUpdate]);

    let chatCallback = useMemo(() => proxy(async (event: MessageResponse & SubscriptionMessage & {partition?: string, done?: boolean, message_id?: string}) => {
        let message = event.message as ChatResponse;
        if(!message) { // Status message
            if(!event.ok) {
                console.error("Erreur processing response, ", event);
                setWaiting(false);
            }
            return;
        }

        let chatResponse = message as ChatResponse;
        let content = chatResponse.content;
        appendCurrentResponse(content);
        let done = event.done;
        let message_id = event.message_id;
        if(done && message_id) {
            console.debug("Last message in stream ", event);
            setWaiting(false);
            pushAssistantResponse(message_id);
            setConversationReadyToSave(true);
            // Force one last screen update
            setTimeout(()=>setLastUpdate(new Date().getTime()), 250);
        }
    }), [appendCurrentResponse, setWaiting, pushAssistantResponse, setLastUpdate, setConversationReadyToSave]);

    let userMessageCallback = useMemo(()=>proxy(async (event: messageStruct.MilleGrillesMessage)=>{
        applyCurrentUserCommand(event);
    }), [applyCurrentUserCommand]);

    let submitHandler = useCallback(() => {
        if(!chatInput.trim()) return;  // No message, nothing to do
        if(!workers) throw new Error('workers not initialized');
        if(!conversationKey) throw new Error('Encryption key is not initialized');

        let messageHistory = messages.map(item=>{
            return {role: item.role, content: item.content};
        });
        // let newMessage = {'message_id': 'current', 'role': 'user', 'content': chatInput};
        pushUserQuery(chatInput);
        setChatInput('');  // Reset input
        
        Promise.resolve().then(async () => {
            if(!workers) throw new Error("Workers not initialized"); 
            if(!conversationKey) throw new Error("Encryption key not initialized");
            if(!conversationId) throw new Error("ConversationId not initialized");

            let encryptedMessageHistory = null as null | EncryptionBase64Result;
            if(messages && messages.length > 0) {
                encryptedMessageHistory = await workers.encryption.encryptMessageMgs4ToBase64(messageHistory, conversationKey?.secret);
                encryptedMessageHistory.cle_id = conversationKey.cle_id;
                delete encryptedMessageHistory.digest;  // Remove digest, no need for it
            }
            let encryptedUserMessage = await workers.encryption.encryptMessageMgs4ToBase64(chatInput, conversationKey?.secret);
            encryptedUserMessage.cle_id = conversationKey.cle_id;
            delete encryptedUserMessage.digest;  // Remove digest, no need for it

            let command: SendChatMessageCommand = {
                conversation_id: conversationId, 
                model: 'llama3.1:8b-instruct-q5_0', 
                role: 'user', 
                encrypted_content: encryptedUserMessage
            };

            // let attachment = {history: encryptedMessageHistory, key: {signature: conversationKey.signature}};
            setWaiting(true);
                if(!workers) throw new Error("Workers not initialized");
                console.debug("Sending command %O, history: %O, signature: %O, keys: %O", 
                    command, encryptedMessageHistory, conversationKey.signature, conversationKey.encrypted_keys);
                let ok = await workers.connection.sendChatMessage(
                    command, encryptedMessageHistory, conversationKey.signature, conversationKey.encrypted_keys,
                    // @ts-ignore
                    chatCallback, 
                    userMessageCallback
                );
                if(!ok) console.error("Error sending chat message");
            })
            .catch(err=>console.error("Error sending message ", err))
            .finally(()=>setWaiting(false))
    }, [workers, conversationId, conversationKey, messages, chatInput, setChatInput, chatCallback, setWaiting, pushUserQuery, userMessageCallback]);

    // Submit on ENTER in the textarea
    let textareaOnKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>)=>{
        if(e.key === 'Enter' && !e.shiftKey) {
            e.stopPropagation();
            e.preventDefault();
            submitHandler();
        }
    }, [submitHandler])

    let clearHandler = useCallback(()=>{
        clearConversation();
        setChatInput('');
        navigate('/apps/aichat/newConversation');
    }, [navigate, clearConversation, setChatInput]);

    useEffect(()=>{
        // Clear conversation on exit
        return () => {
            clearConversation();
            setChatInput('');            
        };
    }, [clearConversation, setChatInput]);

    useEffect(()=>{
        if(waiting || !conversationReadyToSave) return;
        if(!conversationId || !userId) throw new Error("Error saving conversation, missing conversationId/userId");
        if(!messages || messages.length === 0) throw new Error("Error saving conversation, no messages to save");

        setConversationReadyToSave(false);  // Avoid loop

        Promise.resolve().then(async () => {
            if(!conversationId) throw new Error("Missing conversationId");
            if(!userId) throw new Error("Missing userId");
            if(!conversationKey) throw new Error("Missing conversationKey");

            // Check if conversation already exists
            let conversation = await getConversation(conversationId);
            if(conversation) {
                // Add messages to existing conversation
                await saveMessagesToIdb(userId, conversationId, messages);
            } else {
                // Create new conversation
                console.debug("Save new conversation id %s: %O, key %O, messages: %O", conversationId, conversationKey, messages);
                await saveConversationToIdb(userId, conversationId, messages, conversationKey);
            }
        })
        .catch(err=>console.error("Error saving conversation exchange", err));

        // if(!conversationId) {
        //     // This is a new conversation
        //     saveConversationToIdb(userId, effectiveConversationId, messages)
        //         .catch(err=>console.error("Error saving conversation to IDB", err));
        // } else {
        //     saveMessagesToIdb(userId, conversationId, messages)
        //         .catch(err=>console.error("Error saving messages to IDB", err));
        // }
    }, [waiting, userId, conversationId, conversationReadyToSave, setConversationReadyToSave, messages, conversationKey]);

    return (
        <>
            <section className='fixed top-8 bottom-48 sm:bottom-36 overflow-y-auto pl-4 pr-4 w-full'>
                <h1>Conversation</h1>
                <div className='font-bold'><ChatAvailable ignoreOk={true} naClassname='text-red-500' /></div>
                <ViewHistory triggerScrolldown={lastUpdate} />
            </section>
            
            <div className='fixed bottom-0 w-full pl-2 pr-6 mb-8 text-center'>
                <textarea value={chatInput} onChange={chatInputOnChange} onKeyDown={textareaOnKeyDown} 
                    placeholder='Entrez votre question ici. Exemple : Donne-moi une liste de films sortis en 1980.'
                    className='text-black w-full rounded-md h-28 sm:h-16' />
                <button disabled={waiting || !ready || !relayAvailable} 
                    className='varbtn w-24 bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900' onClick={submitHandler}>
                        Send
                </button>
                <button disabled={waiting} 
                    className='varbtn w-24 bg-slate-700 hover:bg-slate-600 active:bg-slate-500' onClick={clearHandler}>
                        Clear
                </button>
                <Link to='/apps/aichat' 
                    className='varbtn w-24 inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>
                        Back
                </Link>
            </div>

            <SyncConversation />
        </>
    )
}

type ChatResponse = {content: string, role: string};

function ViewHistory(props: {triggerScrolldown: number}) {
 
    let { triggerScrolldown } = props;

    let messages = useChatStore(state=>state.messages);
    let currentResponse = useChatStore(state=>state.currentResponse);

    let refBottom = useRef(null);

    useEffect(()=>{
        if(!refBottom || !messages) return;
        // @ts-ignore
        refBottom.current?.scrollIntoView({behavior: 'smooth'});

        // Note: currentResponse is needed to make the screen update during the response.
    }, [refBottom, messages, currentResponse, triggerScrolldown]);

    return (
        <div className='text-left w-full pr-4'>
            {messages.map((item, idx)=>(<ChatBubble key={''+idx} value={item} />))}
            {currentResponse?
                <ChatBubble value={{role: 'assistant', content: currentResponse, message_id: 'currentresponse'}} />
                :''
            }
            <div ref={refBottom}></div>
        </div>
    )
}

type MessageRowProps = {value: StoreChatMessage};

// Src : https://flowbite.com/docs/components/chat-bubble/
function ChatBubble(props: MessageRowProps) {

    let {role, content, date: messageDate} = props.value;

    let messageDateStr = useMemo(()=>{
        if(!messageDate) return '';
        let d = new Date(messageDate * 1000);
        return d.toLocaleTimeString();
    }, [messageDate]);

    let [roleName, bubbleSide] = useMemo(()=>{
        switch(role) {
            case 'user': return ['toé', 'right'];
            case 'assistant': return ['l\'autre', 'left'];
            default: return ['N/D', 'right'];
        };
    }, [role]);

    if(bubbleSide === 'left') {
        return (
            <div className="flex items-start gap-2.5 pb-2">
                <div className="flex flex-col gap-1 pr-20">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-sm font-semibold text-white">{roleName}</span>
                        <span className="text-sm font-normal text-gray-300">{messageDateStr}</span>
                    </div>
                    <div className="flex flex-col leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl">
                        <Markdown className="text-sm font-normal text-gray-900 dark:text-white">{content}</Markdown>
                    </div>
                </div>
            </div>        
        )
    } else {
        return (
            <div className="flex items-start gap-2.5 pb-2">
                <div className="flex flex-col gap-1 w-full pl-20 items-end">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-sm font-semibold text-white">{roleName}</span>
                        <span className="text-sm font-normal text-gray-300">{messageDateStr}</span>
                    </div>
                    <div className="flex flex-col leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-s-xl rounded-ee-xl">
                        <Markdown className="text-sm font-normal text-gray-900 dark:text-white">{content}</Markdown>
                    </div>
                </div>
            </div>        
        )
    }

}

function SyncConversation() {
    let { conversationId } = useParams();

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    useMemo(()=>{
        if(!ready) return;
        if(!workers) throw new Error("Workers not initialized");
        if(conversationId) {
            console.debug("Sync conversation ", conversationId);
            // Load from IDB and sync the conversation from back-end.

        }
    }, [workers, ready, conversationId]);

    return <></>;
}

// type NewChatMessage = {message_id: string, role: string, content: string, date: number};

/**
 * Initializes a new conversation in IDB.
 * @param conversationId Initial user message id
 * @param messages Initial use message and first assistant response
 */
async function saveConversationToIdb(userId: string, conversationId: string, messages: StoreChatMessage[], conversationKey: ChatStoreConversationKey) {
    
    let conversationKeyIdb: ConversationKey = {
        signature: conversationKey.signature,
        cle_id: conversationKey.cle_id,
    };
    
    await saveDecryptedKey(conversationKey.cle_id, conversationKey.secret);

    // Prepare messages
    let messagesIdb = messages.map(item=>({
        user_id: userId, conversation_id: conversationId, decrypted: true, 
        ...item,
    } as ChatMessage));
    await saveConversation(messagesIdb, conversationKeyIdb);
}

/**
 * Adds subsequent messages to IDB
 * @param conversationId 
 * @param message 
 */
async function saveMessagesToIdb(userId: string, conversationId: string,  messages: StoreChatMessage[]) {
    let messagesIdb = messages.map(item=>({user_id: userId, conversation_id: conversationId, decrypted: true, ...item} as ChatMessage));
    await saveMessages(messagesIdb);
}

function sortMessagesByDate(a: StoreChatMessage, b: StoreChatMessage) {
    let aDate = a.date, bDate = b.date;
    if(aDate && bDate) {
        return aDate - bDate;
    }
    return a.message_id.localeCompare(b.message_id);
}
