import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { resolveDemoRuntime } from './lib/runtime.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Application root element is missing.');
}

const runtime = resolveDemoRuntime(import.meta.env);

createRoot(rootElement).render(
  <StrictMode>
    <App client={runtime.client} fixtureMode={runtime.fixtureMode} />
  </StrictMode>,
);
