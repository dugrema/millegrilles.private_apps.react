import { useState, useCallback, useMemo, useEffect, useRef, ChangeEvent, KeyboardEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { proxy } from 'comlink';
import { Link, useNavigate, useParams } from 'react-router-dom';

import useWorkers from '../workers/workers';
import useChatStore, { ChatStoreConversationKey, ChatMessage as StoreChatMessage } from './chatStore';

import useConnectionStore from '../connectionStore';
import { ChatAvailable } from './ChatSummaryHistory';
import { ChatMessage, ConversationKey, getConversation, getConversationMessages, saveConversation, saveMessagesSync } from './aichatStoreIdb';
import { MessageResponse, SubscriptionMessage } from 'millegrilles.reactdeps.typescript';
import { messageStruct, multiencoding } from 'millegrilles.cryptography';
import { getDecryptedKeys, saveDecryptedKey } from '../MillegrillesIdb';
import { SendChatMessageCommand } from '../workers/connection.worker';
import SyncConversationMessages from './SyncConversationMessages';
import { EncryptionBase64Result } from '../workers/encryptionUtils';

const CONST_DEFAULT_MODEL = 'llama3.2:3b-instruct-q8_0';


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
    let newConversation = useChatStore(state=>state.newConversation);
    let setNewConversation = useChatStore(state=>state.setNewConversation);

    let setLastConversationMessagesUpdate = useChatStore(state=>state.setLastConversationMessagesUpdate);
    let lastConversationMessagesUpdate = useChatStore(state=>state.lastConversationMessagesUpdate);

    let [model, setModel] = useState(CONST_DEFAULT_MODEL);
    let modelOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setModel(e.currentTarget.value), [setModel]);

    let {conversationId: paramConversationId} = useParams();

    useEffect(()=>{
        if(relayAvailable === null) return;
        setLastConversationMessagesUpdate(new Date().getTime());
    }, [relayAvailable, setLastConversationMessagesUpdate]);

    // Initialize conversationId
    useEffect(()=>{
        if(!ready || !userId || conversationKey) return;
        if(!workers) throw new Error("Workers not initialized");

        if(paramConversationId) {
            // Load the existing conversation messages
            getConversation(paramConversationId)
                .then(async chatConversation => {
                    if(!workers) throw new Error("Workers not initialized");
                    if(!userId) throw new Error("UserId is missing");
                    if(!paramConversationId) throw new Error("paramConversationId is missing");
                    setNewConversation(false);

                    let conversationKey = chatConversation?.conversationKey;
                    if(!conversationKey || !conversationKey.cle_id) throw new Error("Missing keyId information");
                    let decryptedKey = (await getDecryptedKeys([conversationKey.cle_id])).pop();
                    if(!decryptedKey) {
                        // Try to load from server
                        let keyResponse = await workers.connection.getConversationKeys([conversationKey.cle_id]);
                        if(!keyResponse.ok) {
                            throw new Error("Error receiving conversation key: " + keyResponse.err);
                        }
                        let keyInfo = keyResponse.cles.pop();
                        if(!keyInfo || keyInfo.cle_id !== conversationKey.cle_id) throw new Error("No key received");
                        let keyBytes = multiencoding.decodeBase64Nopad(keyInfo.cle_secrete_base64);
                        await saveDecryptedKey(keyInfo.cle_id, keyBytes);
                        decryptedKey = { hachage_bytes: keyInfo.cle_id, cleSecrete: keyBytes };
                    }
                    let encryptedKeys = await workers.encryption.encryptSecretKey(decryptedKey.cleSecrete);
                    let storeConversationKey: ChatStoreConversationKey = {
                        ...conversationKey,
                        secret: decryptedKey.cleSecrete,
                        encrypted_keys: encryptedKeys,
                    };
                    setConversationKey(storeConversationKey);
                    setLastConversationMessagesUpdate(new Date().getTime());

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
                    setConversationKey(conversationKey);
                    setNewConversation(true);
                })
                .catch(err=>console.error("Error creating new conversation encryption key", err));
        }
    }, [workers, userId, setConversationKey, paramConversationId, ready, setNewConversation, conversationKey, setLastConversationMessagesUpdate])

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

    useEffect(()=>{
        if(!userId || !conversationId || !lastConversationMessagesUpdate) return;

        getConversationMessages(userId, conversationId)
            .then((chatMessages)=>{
                // @ts-ignore
                let storeMessageList: StoreChatMessage[] = chatMessages.filter(item=>item.query_role && item.content)
                storeMessageList.sort(sortMessagesByDate);
                setStoreMessages(storeMessageList);
            })
            .catch(err=>console.error("Error loading messages ", err));

    }, [userId, setStoreMessages, lastConversationMessagesUpdate, conversationId]);

    let chatCallback = useMemo(() => {
        if(!conversationId) return null;
        return proxy(async (event: MessageResponse & SubscriptionMessage & {partition?: string, done?: boolean, message_id?: string}) => {
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
            if(!conversationId) throw new Error("ConversationId is null");
            try {
                appendCurrentResponse(conversationId, content);
            } catch(err) {
                console.info("Appending to wrong conversation id (%s)", conversationId);
                return;
            }

            let done = event.done;
            let message_id = event.message_id;
            if(done && message_id) {
                setWaiting(false);
                pushAssistantResponse(message_id);
                setConversationReadyToSave(true);
                // Force one last screen update
                setTimeout(()=>setLastUpdate(new Date().getTime()), 250);
            };
    })}, [conversationId, appendCurrentResponse, setWaiting, pushAssistantResponse, setLastUpdate, setConversationReadyToSave]);

    let userMessageCallback = useMemo(()=>proxy(async (event: messageStruct.MilleGrillesMessage)=>{
        applyCurrentUserCommand(event);
    }), [applyCurrentUserCommand]);

    let submitHandler = useCallback(() => {
        if(!chatInput.trim()) return;  // No message, nothing to do
        if(!workers) throw new Error('workers not initialized');
        if(!conversationKey) throw new Error('Encryption key is not initialized');

        let messageHistory = messages.map(item=>{
            return {role: item.query_role, content: item.content};
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
                model,
                role: 'user', 
                encrypted_content: encryptedUserMessage
            };
            if(newConversation) command.new = true;
            console.debug("Chat message ", command);

            // let attachment = {history: encryptedMessageHistory, key: {signature: conversationKey.signature}};
            setWaiting(true);
                if(!workers) throw new Error("Workers not initialized");
                if(!chatCallback) throw new Error("Chat callback not initialized");
                let ok = await workers.connection.sendChatMessage(
                    command, encryptedMessageHistory, conversationKey.signature, conversationKey.encrypted_keys,
                    // @ts-ignore
                    chatCallback, 
                    userMessageCallback
                );
                if(!ok) console.error("Error sending chat message");
                navigate(`/apps/aichat/conversation/${conversationId}`);
            })
            .catch(err=>console.error("Error sending message ", err))
            .finally(()=>setWaiting(false))
    }, [workers, conversationId, conversationKey, messages, chatInput, setChatInput, chatCallback, setWaiting, 
        pushUserQuery, userMessageCallback, newConversation, model, navigate]
    );

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
            if(newConversation) {
                // Create new conversation
                await saveConversationToIdb(userId, conversationId, messages, conversationKey);
                setNewConversation(false);
            } else {
                // Add messages to existing conversation
                await saveMessagesToIdb(userId, conversationId, messages);
            }
        })
        .catch(err=>console.error("Error saving conversation exchange", err));

    }, [waiting, userId, conversationId, conversationReadyToSave, setConversationReadyToSave, messages, conversationKey, newConversation, setNewConversation]);

    return (
        <>
            <section className='fixed top-8 bottom-48 sm:bottom-36 overflow-y-auto pl-4 pr-4 w-full'>
                <h1>Conversation</h1>
                <ViewHistory triggerScrolldown={lastUpdate}>
                    <div className='font-bold'><ChatAvailable ignoreOk={true} naClassname='text-red-500' /></div>
                </ViewHistory>
            </section>
            
            <div className='grid grid-cols-3 fixed bottom-0 w-full pl-2 pr-6 mb-8'>
                <ModelPickList onChange={modelOnChange} />
                
                <textarea value={chatInput} onChange={chatInputOnChange} onKeyDown={textareaOnKeyDown} 
                    placeholder='Entrez votre question ici. Exemple : Donne-moi une liste de films sortis en 1980.'
                    className='text-black w-full rounded-md h-28 sm:h-16 col-span-3' />
                
                <div className='w-full text-center col-span-3'>
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
            </div>

            <SyncConversationMessages />
        </>
    )
}

type ChatResponse = {content: string, role: string};

function ViewHistory(props: {triggerScrolldown: number, children: React.ReactNode}) {
 
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
                <ChatBubble value={{query_role: 'assistant', content: currentResponse, message_id: 'currentresponse'}} />
                :''
            }
            {props.children}
            <div ref={refBottom}></div>
        </div>
    )
}

type MessageRowProps = {value: StoreChatMessage};

// Src : https://flowbite.com/docs/components/chat-bubble/
function ChatBubble(props: MessageRowProps) {

    const {query_role: role, content, message_date: messageDate} = props.value;

    let messageDateStr = useMemo(()=>{
        if(!messageDate) return '';
        let d = new Date(messageDate);
        let dateString = d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
        return dateString;
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
                        <div className="text-sm font-normal text-gray-900 dark:text-white markdown">
                            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                        </div>
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
                        <div className="text-sm font-normal text-gray-900 dark:text-white markdown">
                            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                        </div>
                    </div>
                </div>
            </div>        
        )
    }

}

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
    await saveMessagesSync(messagesIdb);
}

function sortMessagesByDate(a: StoreChatMessage, b: StoreChatMessage) {
    let aDate = a.message_date, bDate = b.message_date;
    if(aDate && bDate) {
        return aDate - bDate;
    }
    return a.message_id.localeCompare(b.message_id);
}

function ModelPickList(props: {onChange: (e: ChangeEvent<HTMLSelectElement>)=>void}) {

    let {onChange} = props;

    let models = useChatStore(state=>state.models);

    let modelElems = useMemo(()=>{
        if(!models) return [<option key='default'>Default</option>];
        let copyModels = [...models];
        copyModels.sort((a,b)=>a.name.localeCompare(b.name));

        // Move default model at top of list
        copyModels = copyModels.filter(item=>item.name!==CONST_DEFAULT_MODEL);
        copyModels.unshift({name: CONST_DEFAULT_MODEL});

        return copyModels.map(item=>{
            return <option key={item.name} value={item.name}>{item.name}</option>
        });
    }, [models]);

    return (
        <>
            <label htmlFor='selectModel'>Model</label>
            <select id='selectModel' className='text-black col-span-2' onChange={onChange}>
                {modelElems}
            </select>
        </>
    )
}