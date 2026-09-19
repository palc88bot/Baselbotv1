import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

try {
  const diag = document.getElementById('raw-diagnostic-log');
  if (diag) {
    diag.style.color = '#10b981';
    diag.textContent = '🚀 [DIAGNOSTICS] React main.tsx executing... Compiling React DOM root tree now...';
  }
} catch (e) {
  console.error(e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
