import { useState, useCallback, useMemo, useEffect, useRef, ChangeEvent, KeyboardEvent, Dispatch, MouseEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import { proxy } from 'comlink';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useVisibility } from 'reactjs-visibility';

import useWorkers from '../workers/workers';
import useChatStore, { ChatStoreConversationKey, ChatMessage as StoreChatMessage } from './chatStore';

import useConnectionStore from '../connectionStore';
import { ChatAvailable } from './ChatSummaryHistory';
import { ChatMessage, ConversationKey, getConversation, getConversationMessages, saveConversation, saveMessagesSync } from './aichatStoreIdb';
import { Formatters, MessageResponse, SubscriptionMessage } from 'millegrilles.reactdeps.typescript';
import { messageStruct, multiencoding } from 'millegrilles.cryptography';
import { getDecryptedKeys, saveDecryptedKey } from '../MillegrillesIdb';
import { FileAttachment, SendChatMessageCommand } from '../workers/connection.worker';
import SyncConversationMessages from './SyncConversationMessages';
import { EncryptionBase64Result } from '../workers/encryptionUtils';
import { ModalBrowseAction } from './FileAttachment';
import { filesIdbToBrowsing, TuuidsBrowsingStoreRow } from '../collections2/userBrowsingStore';
import { ThumbnailItem } from '../collections2/FilelistPane';
import { loadTuuid, TuuidsIdbStoreRowType } from '../collections2/idb/collections2StoreIdb';
import { InitializeUserStore } from '../collections2/AppCollections2';

const CONST_DEFAULT_MODEL = 'llama3.2:3b-instruct-q8_0';


type ContentToEncryptType = {
    messageHistory?: {role: string, content: string}[] | null,
    attachmentKeys?: {[key: string]: string},
}


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
    const [defaultModel, setDefaultModel] = useState(CONST_DEFAULT_MODEL);

    let setLastConversationMessagesUpdate = useChatStore(state=>state.setLastConversationMessagesUpdate);
    let lastConversationMessagesUpdate = useChatStore(state=>state.lastConversationMessagesUpdate);

    let [model, setModel] = useState('');
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
    const [fileAttachments, setFileAttachments] = useState(null as TuuidsBrowsingStoreRow[] | null);

    let chatInputOnChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        let value = e.currentTarget.value;
        setChatInput(value);
        // setLastUpdate(new Date().getTime());
    }, [setChatInput]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getConfiguration()
            .then(response=>{
                console.debug("AI Configuration", response);
                const defaultModel = response.default?.model_name || CONST_DEFAULT_MODEL;
                setDefaultModel(defaultModel);
            })
            .catch(err=>console.error("Error loading configuration", err));
    }, [workers, ready, setDefaultModel]);

    useEffect(()=>{
        if(!userId || !conversationId || !lastConversationMessagesUpdate) return;

        getConversationMessages(userId, conversationId)
            .then((chatMessages)=>{
                // @ts-ignore
                let storeMessageList: StoreChatMessage[] = chatMessages.filter(item=>item.query_role && item.content)
                storeMessageList.sort(sortMessagesByDate);
                setStoreMessages(storeMessageList);

                // Reuse model of last assistant message
                const model = storeMessageList.reduce((acc, item)=>{
                    if(item.model) return item.model;
                    return acc;
                }, defaultModel);
                // console.debug("Re-setting model", model);
                setModel(model);
            })
            .catch(err=>console.error("Error loading messages ", err));

    }, [userId, setStoreMessages, lastConversationMessagesUpdate, conversationId, defaultModel, setModel]);

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

        // let newMessage = {'message_id': 'current', 'role': 'user', 'content': chatInput};
        const tuuids = fileAttachments?.map(item=>item.tuuid);
        pushUserQuery(chatInput, tuuids);
        // Reset inputs
        setChatInput('');
        setFileAttachments(null);
        
        Promise.resolve().then(async () => {
            if(!workers) throw new Error("Workers not initialized"); 
            if(!conversationKey) throw new Error("Encryption key not initialized");
            if(!conversationId) throw new Error("ConversationId not initialized");

            let attachmentKeys = null as {[key: string]: string} | null;
            let attachments = null as FileAttachment[] | null;
            if(fileAttachments && userId) {
                const result = await prepareAttachments(userId, fileAttachments);
                attachmentKeys = result.attachmentKeys;
                attachments = result.attachments;
            }

            const contentToEncrypt = {} as ContentToEncryptType;
            if(messages && messages.length > 0) {
                contentToEncrypt.messageHistory = messages.map(item=>{
                    return {role: item.query_role, content: item.content};
                });
            }
            if(attachmentKeys) contentToEncrypt.attachmentKeys = attachmentKeys;
    
            let encryptedMessageHistory = null as null | EncryptionBase64Result;
            if(Object.keys(contentToEncrypt).length > 0) {
                // console.debug("Encrypting content: ", contentToEncrypt);
                encryptedMessageHistory = await workers.encryption.encryptMessageMgs4ToBase64(contentToEncrypt, conversationKey?.secret);
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
                encrypted_content: encryptedUserMessage,
            };
            if(attachments) command.attachments = attachments;

            if(newConversation) command.new = true;
            // console.debug("Chat message ", command);

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
            if(!ok) {
                console.error("Error sending chat message");
            }
            navigate(`/apps/aichat/conversation/${conversationId}`);
        })
        .catch(err=>console.error("submitHandler Error sending message ", err))
        .finally(()=>setWaiting(false))
    }, [workers, userId, conversationId, conversationKey, messages, chatInput, setChatInput, chatCallback, setWaiting, 
        pushUserQuery, userMessageCallback, newConversation, model, navigate, fileAttachments, setFileAttachments]
    );

    // Submit on ENTER in the textarea
    let textareaOnKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>)=>{
        if(e.key === 'Enter' && !e.shiftKey) {
            e.stopPropagation();
            e.preventDefault();
            submitHandler();
        }
    }, [submitHandler])

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
            <section className='fixed top-8 mb-10 bottom-64 sm:bottom-52 overflow-y-auto px-4 w-full'>
                <h1>Conversation</h1>
                <ViewHistory triggerScrolldown={lastUpdate}>
                    <div className='font-bold'><ChatAvailable ignoreOk={true} naClassname='text-red-500' /></div>
                </ViewHistory>
            </section>
            
            <div className='grid grid-cols-1 md:grid-cols-3 fixed bottom-0 w-full pl-2 pr-6 mb-8'>
                <ModelPickList value={model} onChange={modelOnChange} defaultModel={defaultModel} />
                
                <textarea value={chatInput} onChange={chatInputOnChange} onKeyDown={textareaOnKeyDown} 
                    placeholder='Entrez votre question ici. Exemple : Donne-moi une liste de films sortis en 1980.'
                    className='text-black rounded-md h-28 sm:h-16 col-span-12' />

                <div className='w-full col-span-12'>
                    <FileAttachments files={fileAttachments} setFiles={setFileAttachments} />
                </div>

                <div className='text-center col-span-12'>
                    <button disabled={waiting || !ready || !relayAvailable} 
                        className='varbtn w-24 bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900' onClick={submitHandler}>
                            Send
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
    let [currentVisible, setCurrentVisible] = useState(true);
    const [loaded, setLoaded] = useState(false);  // Used to load most recent message once

    let refBottom = useRef(null);

    useEffect(()=>{
        if(!refBottom || !messages || !currentVisible) return;
        // @ts-ignore
        refBottom.current?.scrollIntoView({behavior: 'smooth'});

        // Note: currentResponse is needed to make the screen update during the response.
    }, [refBottom, messages, currentResponse, triggerScrolldown, currentVisible]);

    // Initial message load
    useEffect(()=>{
        if(!refBottom || !messages || loaded) return;
        setLoaded(true);
        // @ts-ignore
        refBottom.current?.scrollIntoView({behavior: 'smooth'});
    }, [refBottom, messages, loaded, setLoaded])

    return (
        <div className='text-left w-full pr-4'>
            {messages.map(item=>(<ChatBubble key={''+item.message_id} value={item} />))}
            {currentResponse?
                <ChatBubble setVisible={setCurrentVisible} value={{query_role: 'assistant', content: currentResponse, message_id: 'currentresponse'}} />
                :''
            }
            {props.children}
            <div ref={refBottom}></div>
        </div>
    )
}

type MessageRowProps = {value: StoreChatMessage, setVisible?: Dispatch<boolean> | null};

// Src : https://flowbite.com/docs/components/chat-bubble/
function ChatBubble(props: MessageRowProps) {

    const {setVisible} = props;
    const {query_role: role, content, message_date: messageDate, model, tuuids} = props.value;

    const { ref, visible } = useVisibility({});

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);
    const userId = useChatStore(state=>state.userId);

    const [attachedFiles, setAttachedFiles] = useState(null as TuuidsBrowsingStoreRow[] | null);

    useEffect(()=>{
        if(setVisible) setVisible(!!visible);
    }, [visible, setVisible])

    const messageDateSecs = useMemo(()=>{
        if(!messageDate) return undefined;
        return messageDate / 1000;
    }, [messageDate]);

    // let messageDateStr = useMemo(()=>{
    //     if(!messageDate) return '';
    //     let d = new Date(messageDate);
    //     let dateString = d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
    //     return dateString;
    // }, [messageDate]);

    let [roleName, bubbleSide] = useMemo(()=>{
        switch(role) {
            case 'user': return ['User', 'right'];
            case 'assistant': return ['Assistant', 'left'];
            default: return ['N/D', 'right'];
        };
    }, [role]);

    const [contentBlock, thinkBlock] = useMemo(()=>{
        const THINK_OPEN_SIZE = '<think>'.length;
        const THINK_CLOSE_SIZE = '</think>'.length;
        if(content.startsWith('<think>')) {
            const posEnd = content.indexOf('</think>');
            if(posEnd < 0) {
                return [null, content.slice(THINK_OPEN_SIZE)];
            }
            const thinkBlock = content.slice(THINK_OPEN_SIZE, posEnd);
            const contentBlock = content.slice(posEnd + THINK_CLOSE_SIZE);
            return [contentBlock, thinkBlock];
        }
        return [content, null];
    }, [content]);

    useEffect(()=>{
        if(!tuuids) {
            setAttachedFiles(null);
            return;
        };
        if(!workers || !ready || !userId) return;
        console.debug("Message tuuids: %O", tuuids);
        Promise.resolve().then(async () => {
            let files = [] as TuuidsIdbStoreRowType[];
            const missing = [] as string[];

            // Use already loaded files from IDB when possible. Flag missing tuuids.
            for await(const tuuid of tuuids) {
                const file = await loadTuuid(tuuid, userId);
                console.debug("Loaded tuuid %s: %O", tuuid, file);
                if(file) files.push(file);
                else missing.push(tuuid);
            }

            if(missing.length > 0) {
                // Load missing tuuids
                const response = await workers.connection.getFilesByTuuid(missing, {shared: true});
                const responseFiles = response.files;
                const keys = response.keys;
                if(!responseFiles) throw new Error("Files not provided");
                if(!keys) throw new Error("Keys not provided");
            
                // Load files - checks IDB when required. Note that this does not load the detailed thumbnail.
                const decryptedFiles = await workers.directory.processDirectoryChunk(
                    workers.encryption, userId, responseFiles, keys, {shared: true});

                if(decryptedFiles.length > 0) {
                    files = [...files, ...decryptedFiles];
                }
            }

            if(files.length > 0) {
                setAttachedFiles(filesIdbToBrowsing(files));
                console.debug("Attached files: ", attachedFiles);
            } else {
                setAttachedFiles(null);
            }
        })
        .catch(err=>console.error("Error loading file attachments", err));

    }, [workers, ready, userId, tuuids, attachedFiles, setAttachedFiles]);

    const plugins = [remarkMath, remarkGfm, remarkRehype, rehypeKatex];

    if(bubbleSide === 'left') {
        return (
            <div ref={ref} className="flex items-start gap-2.5 pb-2">
                <div className="flex flex-col gap-1 pr-5 lg:pr-20">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-sm font-semibold text-white">{roleName}</span>
                        <span className="text-sm font-normal text-gray-300">
                            <Formatters.FormatterDate value={messageDateSecs} />
                        </span>
                        {
                            model?
                            <span className='text-sm font-normal text-gray-400'>{model}</span>
                            :<></>
                        }
                    </div>
                    <div className="flex flex-col leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-e-xl rounded-es-xl">
                        <ThinkBlock value={thinkBlock} done={!!contentBlock} />
                        {contentBlock?
                            <div className="text-sm font-normal text-gray-900 dark:text-white markdown">
                                <Markdown remarkPlugins={plugins}>{contentBlock}</Markdown>
                            </div>
                            :<></>
                        }
                    </div>
                </div>
            </div>        
        )
    } else {
        return (
            <div ref={ref} className="flex items-start gap-2.5 pb-2">
                <div className="flex flex-col gap-1 w-full lg:pl-20 items-end">
                    <div className="flex items-center space-x-2 rtl:space-x-reverse">
                        <span className="text-sm font-semibold text-white">{roleName}</span>
                        <span className="text-sm font-normal text-gray-300">
                            <Formatters.FormatterDate value={messageDateSecs} />
                        </span>
                    </div>
                    <div className="flex flex-col leading-1.5 p-4 border-gray-200 bg-gray-100 rounded-s-xl rounded-ee-xl">
                        <div className="text-sm font-normal text-gray-900 dark:text-white markdown">
                            <Markdown remarkPlugins={plugins}>{content}</Markdown>
                        </div>
                        <div>
                            <AttachmentThumbnailsView files={attachedFiles} />
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

function ModelPickList(props: {value: string, onChange: (e: ChangeEvent<HTMLSelectElement>)=>void, defaultModel: string}) {

    let {value, onChange, defaultModel} = props;

    let models = useChatStore(state=>state.models);

    let modelElems = useMemo(()=>{
        if(!models) return [<option key='default'>Default</option>];
        let copyModels = [...models];
        copyModels.sort((a,b)=>a.name.localeCompare(b.name));

        // Move default model at top of list
        copyModels = copyModels.filter(item=>item.name!==defaultModel);
        copyModels.unshift({name: defaultModel});

        return copyModels.map(item=>{
            return <option key={item.name} value={item.name}>{item.name}</option>
        });
    }, [models, defaultModel]);

    return (
        <>
            <label htmlFor='selectModel'>Model</label>
            <select id='selectModel' className='text-black col-span-2 w-full' value={value} onChange={onChange}>
                {modelElems}
            </select>
        </>
    )
}

type FileAttachmentsProps = {files: TuuidsBrowsingStoreRow[] | null, setFiles: (files: TuuidsBrowsingStoreRow[] | null)=>void};

function FileAttachments(props: FileAttachmentsProps) {

    const {files, setFiles} = props;

    const [show, setShow] = useState(false);
    const open = useCallback(()=>setShow(true), [setShow]);
    const close = useCallback(()=>setShow(false), [setShow]);

    const removeFiles = useCallback((tuuids: string[])=>{
        if(files) {
            // console.debug("Files : %O, remove %O", files, tuuids);
            setFiles(files.filter(item=>!tuuids.includes(item.tuuid)));
        }
    }, [files, setFiles]);

    const addFileCb = useCallback((newFiles: TuuidsBrowsingStoreRow[] | null)=>{
        if(newFiles && newFiles.length > 0) {
            // console.debug("Adding files ", newFiles);
            const currentFiles = files || [];
            const list = [...currentFiles, ...newFiles];
            setFiles(list);
        }
    }, [files, setFiles]);

    return (
        <>
            <button onClick={open} className='varbtn w-20 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 mb-8'>Add file</button>
            <div className='inline absolute'>
                <AttachmentThumbnailsEdit files={files} removeFiles={removeFiles} />
            </div>
            {show?
                <>
                    <ModalBrowseAction selectFiles={addFileCb} close={close} />
                    <InitializeUserStore />
                </>
            :<></>}
        </>
    )
}

function AttachmentThumbnailsView(props: {files: TuuidsBrowsingStoreRow[] | null}) {

    const {files} = props;

    const onClick = useCallback((e: MouseEvent<HTMLButtonElement | HTMLDivElement>, value: TuuidsBrowsingStoreRow | null)=>{
        
    }, []);

    const fileElems = useMemo(()=>{
        if(!files) return <></>;
        return files.map(item=>{
            return (
                <a href={`/apps/collections2/f/${item.tuuid}`} target="_blank" rel="noreferrer">
                    <ThumbnailItem key={item.tuuid} size={200} onClick={onClick} value={item} />
                </a>
            )
        })
    }, [files, onClick]);

    return <div className='inline-block sm:w-96 truncate'>{fileElems}</div>;
}

function AttachmentThumbnailsEdit(props: {files: TuuidsBrowsingStoreRow[] | null, removeFiles: (tuuids: string[])=>void}) {

    const {files, removeFiles} = props;

    const onClick = useCallback((e: MouseEvent<HTMLButtonElement | HTMLDivElement>, value: TuuidsBrowsingStoreRow | null)=>{
        if(files && value) {
            removeFiles([value.tuuid]);
        }
    }, [files, removeFiles]);

    const fileElems = useMemo(()=>{
        if(!files) return <></>;
        return files.map(item=>{
            return <ThumbnailItem key={item.tuuid} size={60} onClick={onClick} value={item} />
        })
    }, [files, onClick]);

    return <div className='inline-block w-96 truncate'>{fileElems}</div>;
}

type PrepareAttachmentsResult = {
    attachmentKeys: {[keyId: string]: string},
    attachments: FileAttachment[]
}

async function prepareAttachments(userId: string, fileAttachments: TuuidsBrowsingStoreRow[]): Promise<PrepareAttachmentsResult> {
    const attachmentKeys = {} as {[keyId: string]: string};
    const attachments = [] as FileAttachment[];

    for await (const attachment of fileAttachments) {
        const tuuid = attachment.tuuid;
        const fileToAttach = await loadTuuid(attachment.tuuid, userId);
        if(!fileToAttach) {
            console.error("Unknown tuuid: %s", tuuid);
            continue;
        }

        let keyId = fileToAttach.keyId;
        if(!keyId || !fileToAttach.secretKey) {
            console.error("Missing decryption key for %s", tuuid);
            continue;
        }

        const secretKeyBase64 = multiencoding.encodeBase64Nopad(fileToAttach.secretKey);
        attachmentKeys[keyId] = secretKeyBase64;

        const images = fileToAttach.fileData?.images;
        let fuuid = null as string | null;
        const versions = fileToAttach.fileData?.fuuids_versions;
        if(versions) fuuid = versions[0];
        const mimetype = attachment.mimetype;
        const selectedFile = {
            tuuid: attachment.tuuid,
            fuuid, 
            mimetype,
            keyId, 
            nonce: fileToAttach?.fileData?.nonce,
            format: fileToAttach?.fileData?.format,
        } as FileAttachment;

        if(mimetype === 'application/pdf') {
            // Include the pdf file itself
            attachments.push({...selectedFile});  // Copy the content, it will be modified if a preview is available
            selectedFile.fuuid = '';  // Flag to ignore this file further down
        }
        
        // Note : the image will always be included when available (e.g. PDF preview)
        if(images) {
            // Find highest resolution file
            let res = 0;
            for(const img of Object.values(images)) {
                if(img.resolution > res) {
                    res = img.resolution;
                    selectedFile.fuuid = img.hachage;
                    selectedFile.mimetype = img.mimetype;
                    if(img.nonce) selectedFile.nonce = img.nonce;
                    else if(img.header) {
                        selectedFile.header = img.header
                        selectedFile.nonce = undefined;
                    }
                    else throw new Error('File without decryption nonce/header');
                    if(img.format) selectedFile.format = img.format;
                    selectedFile.keyId = img.cle_id || selectedFile.keyId;
                }
            }
        }
        
        // Add the file if it has not already been done
        if(selectedFile.fuuid) {
            attachments.push(selectedFile);
        }
    }
    
    return {attachmentKeys, attachments};
}

type ThinkBlockProps = {value: string | null, done: boolean}

function ThinkBlock(props: ThinkBlockProps) {
    const {value, done} = props;

    const [show, setShow] = useState(false);

    if(!show) {

        if(!value) return <></>;  // Not a thinking model.

        if(value.trim() === '') {
            return <p className="px-6 pb-4 text-gray-700">No thoughts.</p>
        }
        
        return (
            <div className='px-6 pb-4'>
                <button className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center' onClick={()=>setShow(true)}>
                    {done?
                        <span>Thoughts</span>:
                        <span>Thinking ...</span>
                    }
                </button>
            </div>
        );
    }

    return (
        <div className="text-sm px-6 pb-2 font-normal text-gray-700 dark:text-white markdown mb-6 bg-slate-200"  onClick={()=>setShow(false)}>
            <button className='btn inline-block bg-slate-300 hover:bg-slate-600 active:bg-slate-500 text-center' onClick={()=>setShow(true)}>
                Hide
            </button>
            <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
        </div>
    )
}
