import { Link } from "react-router-dom";
import useChatStore from "./chatStore";
import { Conversation, deleteConversation, getConversations } from "./aichatStoreIdb";
import { Fragment, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Formatters } from "millegrilles.reactdeps.typescript";
import useWorkers from "../workers/workers";
import ActionButton from "../resources/ActionButton";

function ChatSummaryHistory() {

    const isAdmin = useChatStore(state=>state.isAdmin);


    return (
        <>
            <section>
                <ChatAvailable naClassname='font-bold text-red-500' />
                <Link to='/apps/aichat/newConversation'
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Start
                </Link>
                {isAdmin?
                    <Link to='/apps/aichat/configuration'
                        className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>
                            Configure
                    </Link>
                :
                    <></>
                }
            </section>

            <section>
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

    let workers = useWorkers();
    let userId = useChatStore(state=>state.userId);
    let lastConversationsUpdate = useChatStore(state=>state.lastConversationsUpdate);

    let [conversations, setConversations] = useState(null as null | Conversation[]);

    let deleteConversationHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>)=>{
        let conversationId = e.currentTarget.value;
        if(workers && userId && conversationId) {
            Promise.resolve().then(async ()=>{
                if(!workers) throw new Error("Workers not initialized");
                if(!userId) throw new Error("Userid null");
                let response = await workers.connection.deleteChatConversation(conversationId);
                if(!response.ok) {
                    throw new Error("Error delting conversation " + response.err);
                }
                await deleteConversation(userId, conversationId);
                // Update screen
                let updatedConversations = conversations?.filter(item=>item.conversation_id !== conversationId) || [];
                setConversations(updatedConversations);
            })
            .catch(err=>console.error("Error deleting conversation from IDB", err));
        }
    }, [workers, userId, conversations, setConversations]);

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

        let dateLimit = new Date();
        const currentTime = new Date();

        const items = [] as JSX.Element[];
        for(const conversation of sortedConversations) {
            if(conversation.conversation_date && new Date(conversation.conversation_date * 1000) < dateLimit) {
                // Inject divider
                const param = determineTimeLabel(currentTime, conversation.conversation_date);
                dateLimit = param[1];
                let label = param[0];
                if(label) {
                    items.push(<div key={label} className='col-span-12 bg-violet-800/25 px-2 mt-2 mb-1'>{label}</div>)
                } else {
                    items.push(<div key={''+dateLimit} className='col-span-12 bg-violet-800/25 px-2 mt-2 mb-1'>
                        <Formatters.FormatterDate value={dateLimit.getTime()/1000} format="yyyy-MM-DD"/>
                    </div>)
                }
            }

            const label = conversation.subject || conversation.initial_query || conversation.cle_id;
            items.push(
                <Fragment key={conversation.conversation_id}>
                    <div className='col-span-2 sm:col-span-1'>
                        <ActionButton value={conversation.conversation_id} onClick={deleteConversationHandler} confirm={true}
                            className='varbtn w-10 pt-2 pb-2 pl-2 pr-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                                <i className='fa fa-remove' />
                        </ActionButton>
                    </div>
                    <div className='col-span-2 sm:col-span-1'>
                        <Formatters.FormatterDate value={conversation.conversation_date} format="HH:mm" />
                    </div>
                    <Link to={`/apps/aichat/conversation/${conversation.conversation_id}`} 
                        className='underline text-left col-span-8 sm:col-span-10 text-ellipsis line-clamp-2'>
                        {label}
                    </Link>
                </Fragment>                
            );
        }

        return items;
    }, [conversations, deleteConversationHandler]);

    if(conversations === null) return <p>Loading...</p>;
    if(!conversationsElems) return <p>No conversations yet.</p>;

    return (
        <div className='grid grid-cols-12 gap-y-1'>
            {conversationsElems}
        </div>
    );
}

function determineTimeLabel(now: Date, reference: number): [string | null, Date] {
    const refDate = new Date(reference * 1000);
    const nowLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // console.debug("Ref %O, refdate: %O, nowLimit: %O", reference, refDate, nowLimit);
    if(refDate > nowLimit) return ['Today', nowLimit];

    const yesterdayLimit = new Date(nowLimit.getTime() - 86_400_000);
    if(refDate > yesterdayLimit) return ['Yesterday', yesterdayLimit];
    
    const dateLimit = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    return [null, dateLimit];
}
