
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { bootstrapYouniverse } from './lib/youniverseBootstrap';
import { YouniverseProvider } from './components/YouniverseProvider';
import './index.css';

const youniverseBootstrap = bootstrapYouniverse(window.location.hostname);
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
