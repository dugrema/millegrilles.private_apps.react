import { Outlet, Link } from "react-router-dom";

export default function AppAiChat() {
    return (
        <div>
            <p>App AI Chat</p>
            <Link to={`/apps`}>Retour</Link>
        </div>
    )
}
