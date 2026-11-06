// Avisos de captura de pantalla (app de Android 14+, que además las bloquea).
// Cada pantalla con contenido de otra persona indica de quién es; si se detecta un intento de captura,
// se registra un aviso que le llega a esa persona en tiempo real.
import { useEffect } from 'react';
import { supabase } from './supabase';

type Ctx = { owner: string; context: 'profile' | 'photo' | 'chat' | 'call' | 'live' };
const ctxStack: Ctx[] = [];
let lastSent = 0;

export function initShotReporter() {
  window.addEventListener('zevra-screenshot', () => {
    const c = ctxStack[ctxStack.length - 1];
    if (!c || Date.now() - lastSent < 3000) return;
    lastSent = Date.now();
    supabase.from('screenshot_alerts').insert({ owner: c.owner, context: c.context }).then(() => {});
  });
}

/** Mientras el componente está montado, un intento de captura se notifica a `owner`. */
export function useShotContext(owner: string | null | undefined, context: Ctx['context']) {
  useEffect(() => {
    if (!owner) return;
    const c = { owner, context };
    ctxStack.push(c);
    return () => { const i = ctxStack.lastIndexOf(c); if (i >= 0) ctxStack.splice(i, 1); };
  }, [owner, context]);
}

export const SHOT_TEXT: Record<Ctx['context'], string> = {
  profile: 'tu perfil', photo: 'tus fotos o vídeos', chat: 'vuestro chat', call: 'la videollamada', live: 'tu directo',
};
