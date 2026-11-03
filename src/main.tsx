import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as CapApp } from '@capacitor/app';
import App from './App';
import { isNative } from './lib/native';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if (isNative) {
  // Botón «atrás» de Android: navegar dentro de la app en vez de cerrarla
  CapApp.addListener('backButton', ({ canGoBack }) => {
    window.dispatchEvent(new Event('zevra-back'));
    if (!canGoBack) { /* la app decide; no salir de golpe */ }
  });
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
