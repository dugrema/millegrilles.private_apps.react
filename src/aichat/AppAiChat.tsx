import { Outlet, Link } from "react-router-dom";

import Chat from './Chat';

export default function AppAiChat() {
    return (
        <>
            <header>
                <h1>App AI Chat</h1>
            </header>
            <Chat />
        </>
    )
}
