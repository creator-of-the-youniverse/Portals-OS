
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { bootstrapYouniverse } from './lib/youniverseBootstrap';
import { YouniverseProvider } from './components/YouniverseProvider';
import './index.css';

const youniverseBootstrap = bootstrapYouniverse(window.location.hostname, window.location.search);
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <YouniverseProvider bootstrap={youniverseBootstrap}>
      <App />
      </YouniverseProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register sovereign offline service worker for PWA support
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Sovereign Service Worker active:', registration.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  });
}

