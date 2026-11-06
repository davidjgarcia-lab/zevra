// Botón «atrás» del móvil (app instalada, navegador y Android):
// cada pantalla, hoja o visor abierto se apunta en una pila. Mientras haya algo abierto se mantiene
// una entrada «guardia» en el historial; al pulsar atrás se cierra lo último abierto en lugar de salir.
import { useEffect, useRef } from 'react';

interface Entry { id: number; fn: () => void }
const stack: Entry[] = [];
let seq = 0;
let skip = 0;
let guard = false;

function ensureGuard() {
  if (guard) return;
  try { history.pushState({ zevra: true }, ''); guard = true; } catch { /* */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    guard = false;
    if (skip > 0) { skip--; if (stack.length) ensureGuard(); return; }
    const e = stack.pop();
    e?.fn();
    if (stack.length) ensureGuard();
  });
}

/** Registra un paso «atrás» y devuelve su identificador. */
export function pushBackId(fn: () => void): number {
  const id = ++seq;
  stack.push({ id, fn });
  ensureGuard();
  return id;
}

/** Quita pasos cerrados desde la propia app (sin ejecutar sus acciones). */
export function releaseMany(ids: number[]) {
  for (const id of ids) { const i = stack.findIndex((x) => x.id === id); if (i >= 0) stack.splice(i, 1); }
  if (!stack.length && guard) {
    guard = false; skip++;
    try { history.back(); } catch { skip--; }
  }
}
export const releaseBack = (id: number) => releaseMany([id]);

/** Registra un paso «atrás». Devuelve la función para quitarlo cuando se cierra desde la propia app. */
export function pushBack(fn: () => void): () => void {
  const id = pushBackId(fn);
  return () => releaseBack(id);
}

export const hasBackSteps = () => stack.length > 0;
/** Cierra lo último abierto (botón atrás de Android en la app nativa). Devuelve false si no había nada. */
export function goBackStep(): boolean {
  if (!stack.length) return false;
  const e = stack.pop();
  e?.fn();
  if (!stack.length && guard) { guard = false; skip++; try { history.back(); } catch { skip--; } }
  return true;
}

/** Mientras el componente está montado, el botón atrás ejecuta `onBack`. */
export function useBackHandler(onBack: () => void, enabled = true) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    let fired = false;
    const release = pushBack(() => { fired = true; ref.current(); });
    return () => { if (!fired) release(); };
  }, [enabled]);
}
