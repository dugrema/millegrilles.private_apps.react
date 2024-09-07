import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { proxy } from 'comlink';
import { Link } from 'react-router-dom';

import useWorkers from '../workers/workers';
import useChatStore, { ChatMessages } from './chatStore';

import Footer from '../Footer';

export default function Chat() {

    let workers = useWorkers();
    let messages = useChatStore(state=>state.messages);
    let appendCurrentResponse = useChatStore(state=>state.appendCurrentResponse);
    let pushAssistantResponse = useChatStore(state=>state.pushAssistantResponse);
    let pushUserQuery = useChatStore(state=>state.pushUserQuery);
    let clearConversation = useChatStore(state=>state.clear);

    // let certificatsChiffrage = useConnectionStore(state=>state.chiffrage);

    let [chatInput, setChatInput] = useState('');
    let [waiting, setWaiting] = useState(false);

    let chatInputOnChange = useCallback((e: any) => {
        let value = e.currentTarget.value;
        setChatInput(value);
    }, [setChatInput]);

    let chatCallback = useMemo(() => proxy(async (event: any) => {
        // console.debug("Chat Event callback ", event);
        let message = event.message;
        if(!message) { // Status message
            if(!event.ok) {
                console.error("Erreur processing response, ", event.err);
                setWaiting(false);
            }
            return;
        }

        let content = message.content;
        appendCurrentResponse(content);
        let done = event.done;
        if(done) {
            setWaiting(false);
            pushAssistantResponse();
        }
    }), [appendCurrentResponse, setWaiting, pushAssistantResponse]);

    let submitHandler = useCallback(() => {
        if(!workers) throw new Error('workers not initialized');

        let messagesAvecQuery = [...messages, {'role': 'user', 'content': chatInput}];
        pushUserQuery(chatInput);
        setChatInput('');  // Reset input
        
        let command = {model: 'llama3.1:8b-instruct-q5_0', messages: messagesAvecQuery};
        setWaiting(true);
        Promise.resolve().then(async () => {
                if(!workers) throw new Error("Workers not initialized");
                await workers.connection.sendChatMessage(command, chatCallback);
                setWaiting(false);
            })
            .catch(err=>{
                console.error("Error ", err);
                setWaiting(false);
            })
    }, [workers, messages, chatInput, setChatInput, chatCallback, setWaiting, pushUserQuery]);

    let clearHandler = useCallback(()=>{
        clearConversation();
        setChatInput('');
    }, [clearConversation, setChatInput]);

    return (
        <>
            <section className='fixed top-8 bottom-40 overflow-y-auto pl-4 pr-4 w-full'>
                <h1>Chat history</h1>
                <ViewHistory />
            </section>
            
            <div className='fixed bottom-0 w-full pl-2 pr-6 pb-12 text-center'>
                <textarea value={chatInput} onChange={chatInputOnChange} 
                    placeholder='Entrez votre question ou commentaire ici. Exemple : Donne-moi une liste de films sortis en 1980.'
                    className='text-black w-full rounded-md' />
                <button disabled={waiting} 
                    className='varbtn w-24 bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500' onClick={submitHandler}>
                        Submit
                </button>
                <button disabled={waiting} 
                    className='varbtn w-24 bg-slate-700 hover:bg-slate-600 active:bg-slate-500' onClick={clearHandler}>
                        Clear
                </button>
                <Link to='/apps' className='varbtn w-24 inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>Back</Link>
            </div>

            <Footer />
        </>
    )
}

function ViewHistory() {
 
    let messages = useChatStore(state=>state.messages);
    let currentResponse = useChatStore(state=>state.currentResponse);

    let refBottom = useRef(null);

    useEffect(()=>{
        if(!refBottom || !currentResponse || !messages) return;
        // @ts-ignore
        refBottom.current?.scrollIntoView({behavior: 'smooth'});
    }, [refBottom, currentResponse, messages]);

    return (
        <div className='text-left w-full pr-4'>
            {messages.map((item, idx)=>(<ChatBubble key={''+idx} value={item} />))}
            {currentResponse?
                <ChatBubble value={{role: 'assistant', content: currentResponse}} />
                :''
            }
            <div ref={refBottom}></div>
        </div>
    )
}

type MessageRowProps = {value: ChatMessages};

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
