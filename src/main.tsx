import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'glisse/styles.css';
import './styles.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
