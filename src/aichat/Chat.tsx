import { useState, useCallback, useMemo, useEffect } from 'react';
import Markdown from 'react-markdown';
import { proxy } from 'comlink';
import { Link } from 'react-router-dom';

import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import useChatStore, { ChatMessages } from '../chatStore';

export default function Chat() {

    let workers = useWorkers();
    let messages = useChatStore(state=>state.messages);
    let appendCurrentResponse = useChatStore(state=>state.appendCurrentResponse);
    let pushAssistantResponse = useChatStore(state=>state.pushAssistantResponse);
    let pushUserQuery = useChatStore(state=>state.pushUserQuery);
    let clearConversation = useChatStore(state=>state.clear);

    let certificatsChiffrage = useConnectionStore(state=>state.chiffrage);

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
            }
            setWaiting(false);
            return;
        }

        let content = message.content;
        appendCurrentResponse(content);
        let done = event.done;
        if(done) {
            setWaiting(false);
            pushAssistantResponse();
        }
    }), [appendCurrentResponse, setWaiting]);

    let submitHandler = useCallback(() => {
        if(!workers) throw new Error('workers not initialized');

        let messagesAvecQuery = [...messages, {'role': 'user', 'content': chatInput}];
        pushUserQuery(chatInput);
        setChatInput('');  // Reset input
        
        // let command = {model: 'llama3.1', messages, stream: false};
        let command = {model: 'llama3.1:8b-instruct-q5_0', messages: messagesAvecQuery, stream: false};
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
    }, [workers, messages, chatInput, setChatInput, chatCallback, setWaiting, certificatsChiffrage, pushUserQuery]);

    let clearHandler = useCallback(clearConversation, [clearConversation]);

    return (
        <div>
            <p>Chat</p>

            <ViewHistory />

            <textarea disabled={waiting} cols={60} rows={4} value={chatInput} onChange={chatInputOnChange} className='text-black' />
            <div>
                <button disabled={waiting} 
                    className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500' onClick={submitHandler}>
                        Submit
                </button>
                <button disabled={waiting} 
                    className='btn bg-slate-700 hover:bg-slate-600 active:bg-slate-500' onClick={clearHandler}>
                        Clear
                </button>
                <Link to='/apps' className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Done</Link>
            </div>

        </div>
    )
}

function ViewHistory() {
 
    let messages = useChatStore(state=>state.messages);
    let currentResponse = useChatStore(state=>state.currentResponse);

    return (
        <div className='text-left'>
            {messages.map((item, idx)=>(<MessageRow key={''+idx} value={item} />))}
            {currentResponse?
                <div className='mt-2'>
                    <div>assistant</div>
                    <Markdown>{currentResponse}</Markdown>
                </div>
                :''
            }
        </div>
    )
}

type MessageRowProps = {value: ChatMessages};

function MessageRow(props: MessageRowProps) {
    return (
        <div className='mb-2'>
            <div>{props.value.role}</div>
            <div><Markdown>{props.value.content}</Markdown></div>
        </div>
    )
}
