import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Painel } from './Painel';
import '../styles.css';
import './presidente.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Painel />
  </StrictMode>,
);
