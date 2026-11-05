import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as CapApp } from '@capacitor/app';
import App from './App';
import { isNative } from './lib/native';
import { initInstallCapture } from './lib/install';
import { initAudioUnlock } from './lib/rtc';

initAudioUnlock();

if (!isNative) initInstallCapture();
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Netlify inyecta a veces una barra/botón flotante (Netlify Drawer / Toolbar) que tapa los botones
// de la app. La quitamos en cuanto aparece.
function hideNetlifyOverlays() {
  const isOverlay = (el: Element) => {
    if (el.closest('#root')) return false;
    const tag = el.tagName.toLowerCase();
    const id = (el.id || '').toLowerCase();
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    const src = (el.getAttribute('src') || '').toLowerCase();
    return tag.includes('netlify') || id.includes('netlify') || cls.includes('netlify') ||
      (tag === 'iframe' && /netlify/.test(src));
  };
  const sweep = () => document.querySelectorAll('body > *').forEach((el) => { if (isOverlay(el)) el.remove(); });
  sweep();
  new MutationObserver(sweep).observe(document.body, { childList: true });
}
if (!isNative) hideNetlifyOverlays();

if (isNative) {
  // Botón «atrás» de Android: navegar dentro de la app en vez de cerrarla
  CapApp.addListener('backButton', ({ canGoBack }) => {
    window.dispatchEvent(new Event('zevra-back'));
    if (!canGoBack) { /* la app decide; no salir de golpe */ }
  });
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
