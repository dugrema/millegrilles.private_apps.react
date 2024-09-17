import { Link } from "react-router-dom";
import useChatStore from "./chatStore";

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

function ChatHistoryList() {
    return <p>No conversations yet.</p>;
}

export function ChatAvailable(props: {ignoreOk?: boolean}) {
    let relayAvailable = useChatStore(state=>state.relayAvailable);

    if(relayAvailable === null) return (
        <p>Checking if AI chatbot is available ...</p>
    ); 
    else if(relayAvailable === true) {
        if(props.ignoreOk === true) return <></>;
        return (<p>AI chatbot is ready.</p>);
    }

    return <p>AI chatbot is not available.</p>;
}
