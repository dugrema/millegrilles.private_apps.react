import { Link } from "react-router-dom";
import useChatStore from "./chatStore";
import { Conversation, deleteConversation, getConversations } from "./aichatStoreIdb";
import { Fragment, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Formatters } from "millegrilles.reactdeps.typescript";

function ChatSummaryHistory() {

    return (
        <>
            <section>
                <h2 className='font-bold pt-2 pb-3'>New conversation</h2>
                <ChatAvailable />
                <Link to='/apps/aichat/newConversation'
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Start
                </Link>
            </section>

            <section>
                <h2 className='font-bold pt-4 pb-3'>Conversation history</h2>
                <ChatHistoryList />
            </section>
        </>
    );
}

export default ChatSummaryHistory;

export function ChatAvailable(props: {ignoreOk?: boolean, naClassname?: string}) {
    let relayAvailable = useChatStore(state=>state.relayAvailable);

    if(relayAvailable === null) return (
        <p>Checking if AI chatbot is available ...</p>
    ); 
    else if(relayAvailable === true) {
        if(props.ignoreOk === true) return <></>;
        return (<p>AI chatbot is ready.</p>);
    }

    return <p className={props.naClassname}>AI chatbot is not available.</p>;
}

function ChatHistoryList() {

    let userId = useChatStore(state=>state.userId);
    let lastConversationsUpdate = useChatStore(state=>state.lastConversationsUpdate);

    let [conversations, setConversations] = useState(null as null | Conversation[]);

    let deleteConversationHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = e.currentTarget.value;
        if(userId && value) {
            deleteConversation(userId, value)
                .then(()=>{
                    // Update screen
                    let updatedConversations = conversations?.filter(item=>item.conversation_id !== value) || [];
                    setConversations(updatedConversations);
                })
                .catch(err=>console.error("Error deleting conversation from IDB", err));
        }
    }, [userId, conversations, setConversations]);

    useEffect(()=>{
        if(!userId || !lastConversationsUpdate) return;
        getConversations(userId)
            .then(list=>{
                setConversations(list);
            })
            .catch(err=>console.error("Error loading conversations list", err));
    }, [userId, lastConversationsUpdate]);

    let conversationsElems = useMemo(()=>{
        if(!conversations) return null;

        let sortedConversations = [...conversations];
        sortedConversations.sort((a: Conversation, b: Conversation)=>{
            return a.conversation_date - b.conversation_date;
        })
        sortedConversations = sortedConversations.reverse();

        return sortedConversations.map(item=>{
            let label = item.subject || item.initial_query || item.cle_id;

            return (
                <Fragment key={item.conversation_id}>
                    <div className='col-span-2 sm:col-span-1'>
                        <button value={item.conversation_id} onClick={deleteConversationHandler}
                            className='varbtn w-10 pt-2 pb-2 pl-2 pr-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                                <i className='fa fa-remove' />
                        </button>
                    </div>
                    <Link to={`/apps/aichat/conversation/${item.conversation_id}`} className='underline text-left col-span-7 sm:col-span-8'>
                        {label}
                    </Link>
                    <div className='col-span-3'>
                        <Formatters.FormatterDate value={item.conversation_date} />
                    </div>
                </Fragment>
            );
        })
    }, [conversations, deleteConversationHandler]);

    if(conversations === null) return <p>Loading...</p>;
    if(!conversationsElems) return <p>No conversations yet.</p>;

    return (
        <div className='grid grid-cols-12'>
            {conversationsElems}
        </div>
    );
}
