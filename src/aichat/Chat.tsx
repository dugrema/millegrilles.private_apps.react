import { useState, useCallback, useMemo, useEffect } from 'react';
import { proxy } from 'comlink';
import { Link } from 'react-router-dom';

import { certificates } from 'millegrilles.cryptography';

import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';

export default function Chat() {

    let workers = useWorkers();

    let certificatsChiffrage = useConnectionStore(state=>state.chiffrage);

    let [chatInput, setChatInput] = useState('');
    let [chatId, setChatId] = useState('');
    let [response, setResponse] = useState('');
    let [waiting, setWaiting] = useState(false);

    let chatInputOnChange = useCallback((e: any) => {
        let value = e.currentTarget.value;
        setChatInput(value);
    }, [setChatInput]);

    let chatCallback = useMemo(() => proxy(async (event: any) => {
        console.debug("Callback response ", event);
        let message = event.message
        if(!message.evenement) message = message.message
        let action = message.evenement;
        console.debug("Callback action ", action);
        if(['termine', 'annule', 'resultat'].includes(action)) {
            setChatId('');  // Stop listening
            setWaiting(false);
        }
        if(action === 'resultat') {
            let responseMessage = event.message.message.content;
            setResponse(responseMessage);
        }
    }), [setChatId, setResponse, setWaiting]);

    // Cleanup
    useEffect(()=>{
        if(!chatId) return;
        return () => {
            console.debug("Unset listener for chatId %s", chatId);
            workers?.connection.unsubscribe('aichatChatListener', chatCallback, {chatId})
                .catch(err=>console.error("Error unsubscribing to chat listeners", err));
        }
    }, [workers, chatId, chatCallback])

    let submitHandler = useCallback(() => {
        if(!workers) throw new Error('workers not initialized');

        let messages = [{'role': 'user', 'content': chatInput}];
        let command = {model: 'llama3.1', messages, stream: false};
        console.debug("Submit ", chatInput);
        setWaiting(true);
        workers.connection.sendChatMessage(command, chatCallback)
            .then((response: any)=>{
                console.debug("sendChatMessage Response ", response)
                if(response.ok && response.partition) {
                    setChatId(response.partition);  // For cleanup
                }
                
                // Waiting
                setResponse('')
            })
            .catch(err=>{
                console.error("Error ", err);
                setWaiting(false);
            })
    }, [workers, chatInput, setChatId, chatCallback, setResponse, setWaiting, certificatsChiffrage]);

    return (
        <div>
            <p>Chat</p>

            <textarea disabled={waiting} cols={60} rows={10} value={chatInput} onChange={chatInputOnChange} className='text-black' />
            <div>
                <button disabled={waiting} 
                    className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500' onClick={submitHandler}>
                        Submit
                </button>
                <Link to='/apps' className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Done</Link>
            </div>

            {waiting?
                <p>Processing ...</p>
            :<span></span>}

            {response?
                <p>{response}</p>
            :<span></span>}
        </div>
    )
}
