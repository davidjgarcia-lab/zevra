// Deslizar hacia abajo desde arriba del todo para actualizar (en cualquier pestaña).
import { useEffect, useRef, useState } from 'react';
import { ZLoader } from '../ui';

const THRESHOLD = 72;

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<void> | void }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = useRef<{ y: number; el: HTMLElement | null; active: boolean }>({ y: 0, el: null, active: false });
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const start = (e: TouchEvent) => {
      if (busyRef.current || e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      // No en llamadas, directos, visores ni hojas abiertas
      if (t.closest('.full, .viewer, .sheet, .scrim, input, textarea, .call-stage')) return;
      const el = t.closest('.scroll, .mode-list') as HTMLElement | null;
      if (!el || el.scrollTop > 0) return;
      st.current = { y: e.touches[0].clientY, el, active: true };
    };
    const move = (e: TouchEvent) => {
      const s = st.current;
      if (!s.active || !s.el) return;
      const dy = e.touches[0].clientY - s.y;
      if (dy <= 0 || s.el.scrollTop > 0) { if (pullRef.current) setP(0); return; }
      setP(Math.min(120, dy * 0.5));
    };
    const end = async () => {
      const s = st.current; s.active = false;
      const p = pullRef.current;
      if (p >= THRESHOLD * 0.75 && !busyRef.current) {
        busyRef.current = true; setBusy(true); setP(56);
        try { await cb.current(); } finally {
          setTimeout(() => { busyRef.current = false; setBusy(false); setP(0); }, 500);
        }
      } else setP(0);
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, []);

  const pullRef = useRef(0);
  const setP = (v: number) => { pullRef.current = v; setPull(v); };

  if (!pull && !busy) return null;
  const ready = pull >= THRESHOLD * 0.75;
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${pull - 44}px)`, opacity: Math.min(1, pull / 40) }} aria-live="polite">
      {busy ? <ZLoader size={28} label="Actualizando" /> : <span className="ptr-arrow" style={{ transform: `rotate(${ready ? 180 : 0}deg)` }}>↓</span>}
      <span>{busy ? 'Actualizando…' : ready ? 'Suelta para actualizar' : 'Desliza para actualizar'}</span>
    </div>
  );
}
