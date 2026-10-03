import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { AppProvider } from './state.tsx';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
