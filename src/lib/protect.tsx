// Medidas contra capturas de pantalla.
// · App Android (APK): bloqueo real con FLAG_SECURE (ver MainActivity.java): capturas y grabaciones salen en negro.
// · Web / iPhone: los navegadores no permiten bloquear capturas. Aquí se aplica lo máximo posible:
//   pantalla de privacidad al salir de la app (también en el selector de apps), marca de agua con el alias de
//   quien mira, sin menú contextual, sin arrastrar ni guardar imágenes, y medios efímeros que se borran.
import { useEffect, useState } from 'react';
import { ZMark } from '../ui';

export function useScreenShield() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    const onFocus = () => setHidden(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key))) {
        setHidden(true);
        try { navigator.clipboard?.writeText(''); } catch { /* sin permiso */ }
        setTimeout(() => setHidden(false), 1500);
      }
    };
    const noMenu = (e: Event) => { const t = e.target as HTMLElement; if (!t.closest('input,textarea')) e.preventDefault(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', noMenu);
    document.addEventListener('dragstart', noMenu);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', noMenu);
      document.removeEventListener('dragstart', noMenu);
    };
  }, []);
  return hidden;
}

export function ShieldOverlay() {
  return (
    <div className="shield" aria-hidden="true">
      <ZMark size={56} color="var(--coral)" />
      <span>Contenido protegido</span>
    </div>
  );
}

/** Marca de agua con el alias de quien está mirando: disuade de capturar y difundir. */
export function Watermark({ text }: { text: string }) {
  const items = Array.from({ length: 36 });
  return (
    <div className="watermark" aria-hidden="true">
      {items.map((_, i) => <span key={i}>{text} · ZEVRA</span>)}
    </div>
  );
}
