import { useState, useCallback, useMemo, useEffect, useRef, ChangeEvent, KeyboardEvent } from 'react';
import Markdown from 'react-markdown';
import { proxy } from 'comlink';
import { Link, useNavigate, useParams } from 'react-router-dom';

import useWorkers from '../workers/workers';
import useChatStore, { ChatMessage as StoreChatMessage } from './chatStore';

import Footer from '../Footer';
import useConnectionStore from '../connectionStore';
import { ChatAvailable } from './ChatSummaryHistory';
import { ChatMessage, getConversationMessages, saveConversation, saveMessages } from './aichatStoreIdb';
import { MessageResponse, SubscriptionMessage } from 'millegrilles.reactdeps.typescript';
import { messageStruct } from 'millegrilles.cryptography';

export default function Chat() {

    let workers = useWorkers();
    let navigate = useNavigate();

    let relayAvailable = useChatStore(state=>state.relayAvailable);
    let conversationId = useChatStore(state=>state.conversationId);
    let setConversationId = useChatStore(state=>state.setConversationId);
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useChatStore(state=>state.userId);
    let currentResponse = useChatStore(state=>state.currentResponse);
    let currentUserCommand = useChatStore(state=>state.currentUserCommand);
    let setCurrentUserCommand = useChatStore(state=>state.setCurrentUserCommand);
    let setStoreMessages = useChatStore(state=>state.setMessages);

    let {conversationId: paramConversationId} = useParams();

    // Initialize conversationId
    useEffect(()=>{
        if(userId && paramConversationId) {
            setConversationId(paramConversationId);

            // Load the existing conversation messages
            getConversationMessages(userId, paramConversationId)
                .then(chatMessages=>{
                    // @ts-ignore
                    let storeMessageList: StoreChatMessage[] = chatMessages.filter(item=>item.role && item.content)
                    storeMessageList.sort(sortMessagesByDate);
                    setStoreMessages(storeMessageList);
                    // Force one last screen scroll
                    setTimeout(()=>setLastUpdate(new Date().getTime()), 250);
                })
                .catch(err=>console.error("Error loading messages from IDB", err));
        }
        else setConversationId(null);
    }, [userId, setConversationId, paramConversationId, setStoreMessages])

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
                console.error("Erreur processing response, ", event.err);
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
            setWaiting(false);
            pushAssistantResponse(message_id);
            // Force one last screen update
            setTimeout(()=>setLastUpdate(new Date().getTime()), 250);
        }
    }), [appendCurrentResponse, setWaiting, pushAssistantResponse, setLastUpdate]);

    let userMessageCallback = useMemo(()=>proxy(async (event: messageStruct.MilleGrillesMessage)=>{
        setCurrentUserCommand(event);
    }), [setCurrentUserCommand]);

    let submitHandler = useCallback(() => {
        if(!chatInput.trim()) return;  // No message, nothing to do
        if(!workers) throw new Error('workers not initialized');

        let messagesAvecQuery = [...messages, {'message_id': 'current', 'role': 'user', 'content': chatInput}];
        pushUserQuery(chatInput);
        setChatInput('');  // Reset input
        
        let command = {model: 'llama3.1:8b-instruct-q5_0', messages: messagesAvecQuery};
        setWaiting(true);
        Promise.resolve().then(async () => {
                if(!workers) throw new Error("Workers not initialized");
                let ok = await workers.connection.sendChatMessage(
                    command, 
                    // @ts-ignore
                    chatCallback, 
                    userMessageCallback
                );
                if(!ok) console.error("Error sending chat message");
            })
            .catch(err=>console.error("Error sending message ", err))
            .finally(()=>setWaiting(false))
    }, [workers, messages, chatInput, setChatInput, chatCallback, setWaiting, pushUserQuery, userMessageCallback]);

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
        if(!userId || waiting || !currentUserCommand || currentResponse) return;
        if(!messages || messages.length === 0) return;
        let currentUserMessageId = currentUserCommand.id;
        if(!currentUserMessageId) return;
        let effectiveConversationId = conversationId || currentUserMessageId;

        setCurrentUserCommand(null);  // Prevent loop
        setConversationId(effectiveConversationId);

        if(!conversationId) {
            // This is a new conversation
            saveConversationToIdb(userId, effectiveConversationId, messages)
                .catch(err=>console.error("Error saving conversation to IDB", err));
        } else {
            saveMessagesToIdb(userId, conversationId, messages)
                .catch(err=>console.error("Error saving messages to IDB", err));
        }
    }, [waiting, userId, conversationId, currentUserCommand, messages, currentResponse, setConversationId, setCurrentUserCommand])

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
async function saveConversationToIdb(userId: string, conversationId: string, messages: StoreChatMessage[]) {
    // Prepare messages
    let messagesIdb = messages.map(item=>({user_id: userId, conversation_id: conversationId, decrypted: true, ...item} as ChatMessage));
    await saveConversation(messagesIdb);
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
