import { createRoot } from 'react-dom/client';
import App, { FloatingApp } from './App.tsx';
import './index.css';

const params = new URLSearchParams(window.location.search);
const isFloating = params.get('window') === 'floating';

createRoot(document.getElementById('root')!).render(isFloating ? <FloatingApp /> : <App />);
