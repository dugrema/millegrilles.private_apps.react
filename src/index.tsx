import React from 'react';
import ReactDOM from 'react-dom/client';
import Loading from './Loading';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import ErrorBoundary from './ErrorBoundary';

// Global imports
import './index.css';
import '@solana/webcrypto-ed25519-polyfill';

const App = React.lazy(()=>import('./App'));

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);
root.render(
    <React.StrictMode>
        <React.Suspense fallback={<Loading />}>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.Suspense>
    </React.StrictMode>
);

// Use Vite's import.meta.env.DEV instead of the global variable from index.html
if (import.meta.env.DEV) {
    serviceWorkerRegistration.unregister();
} else {
    // Assume production
    serviceWorkerRegistration.register();
}
