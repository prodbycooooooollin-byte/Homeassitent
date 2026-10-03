import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/unbounded';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
