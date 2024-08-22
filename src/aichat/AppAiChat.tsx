import HeaderMenu from '../Menu';
import Chat from './Chat';

export default function AppAiChat() {
    return (
        <div className='pl-2 pr-2'>
            <HeaderMenu title='AI Chat' backLink={true} />
            <main>
                <Chat />
            </main>
        </div>
    )
}
