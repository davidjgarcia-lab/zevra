import { useEffect, useState } from 'react';
import { APK_URL } from '../config';
import { canPromptInstall, device, isStandalone, onInstallChange, promptInstall } from '../lib/install';
import { isNative } from '../lib/native';
import { Icon, Sheet, useToast } from '../ui';
import { ls } from '../store';

/** ¿Tiene sentido ofrecer la descarga? (no dentro de la app nativa ni de la ya instalada) */
export const showInstall = () => !isNative && !isStandalone();

/** Aviso grande en el inicio: «Instala ZEVRA como una app más, igual que WhatsApp». */
export function InstallBanner() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => Date.now() - Number(ls.get('zevra-install-banner') || 0) < 3 * 864e5);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const toast = useToast();
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), []);
  if (!showInstall() || hidden) return null;
  const install = async () => {
    // Android/Chrome: un toque y aparece el aviso oficial de instalación
    if (canPrompt) { if (await promptInstall()) toast('¡Listo! Ya tienes ZEVRA en tu pantalla de inicio.'); return; }
    setOpen(true);
  };
  return (
    <div className="install-banner">
      <img src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Instala ZEVRA en tu móvil</b>
        <span>Ábrela desde tu pantalla de inicio, como WhatsApp.</span>
      </div>
      <button className="btn light sm" onClick={install}><Icon n="download" c="s" /> Instalar</button>
      <button className="icon-btn" style={{ width: 32, height: 32, marginRight: -6 }} aria-label="Ocultar aviso" onClick={() => { ls.set('zevra-install-banner', String(Date.now())); setHidden(true); }}><Icon n="x" c="s" /></button>
      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </div>
  );
}

export function InstallButton({ variant = 'icon' }: { variant?: 'icon' | 'pill' | 'row' }) {
  const [open, setOpen] = useState(false);
  if (!showInstall()) return null;
  return (
    <>
      {variant === 'icon' && <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Descargar la app"><Icon n="download" /></button>}
      {variant === 'pill' && <button className="safe-btn" onClick={() => setOpen(true)}><Icon n="download" c="s" /> Descargar la app</button>}
      {variant === 'row' && (
        <button className="card row" style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(255,59,107,.35)' }} onClick={() => setOpen(true)}>
          <Icon n="download" /><span style={{ flex: 1 }}><b>Descargar la app</b><span className="tiny muted" style={{ display: 'block' }}>Instálala en tu móvil para abrirla como una app</span></span><Icon n="chevR" c="s" />
        </button>
      )}
      {open && <InstallSheet onClose={() => setOpen(false)} />}
    </>
  );
}

const ShareIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -3, color: 'var(--coral-mid)' }} aria-hidden="true"><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>;

export function InstallSheet({ onClose }: { onClose: () => void }) {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  const toast = useToast();
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), []);
  const installWeb = async () => { if (await promptInstall()) { toast('¡Listo! ZEVRA está en tu pantalla de inicio.'); onClose(); } };
  const copy = async () => { try { await navigator.clipboard.writeText(location.origin); toast('Enlace copiado'); } catch { toast(location.origin); } };

  return (
    <Sheet onClose={onClose} label="Descargar la app">
      <div className="row" style={{ gap: 12 }}>
        <img src="/icons/icon-192.png" alt="" width={52} height={52} style={{ borderRadius: 13 }} />
        <div><h2 className="h2">Descarga ZEVRA</h2><p className="small muted">Ábrela como una app, a pantalla completa.</p></div>
      </div>

      {device.android && (
        <div className="grid" style={{ marginTop: 18 }}>
          {canPrompt ? (
            <>
              <button className="btn primary" onClick={installWeb}><Icon n="download" c="s" /> Instalar ZEVRA</button>
              <p className="tiny muted">Se añade a tu pantalla de inicio y se abre como cualquier otra app. Ocupa menos de 2 MB.</p>
            </>
          ) : (
            <ol className="grid small" style={{ listStyle: 'none', gap: 12 }}>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>1</b><span>Pulsa el menú <b>⋮</b> de Chrome (arriba a la derecha).</span></li>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>2</b><span>Elige <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>.</span></li>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>3</b><span>Confirma. ZEVRA aparecerá junto a tus otras apps.</span></li>
            </ol>
          )}
          <a className="btn soft" href={APK_URL} rel="noopener"><Icon n="shield" c="s" /> Descargar APK (bloquea capturas)</a>
          <p className="tiny muted">El APK se instala como una app nativa. Si Android lo pide, permite «instalar apps de esta fuente».</p>
        </div>
      )}

      {device.ios && (
        <div style={{ marginTop: 18 }}>
          {device.iosSafari ? (
            <ol className="grid small" style={{ listStyle: 'none', gap: 12 }}>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>1</b><span>Pulsa <b>Compartir</b> <ShareIcon /> en la barra de Safari.</span></li>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>2</b><span>Elige <b>Añadir a pantalla de inicio</b>.</span></li>
              <li className="row" style={{ alignItems: 'flex-start' }}><b style={{ color: 'var(--coral)', width: 18 }}>3</b><span>Pulsa <b>Añadir</b>. ZEVRA aparecerá con su icono.</span></li>
            </ol>
          ) : (
            <div className="notice"><Icon n="info" c="s" /><span>En iPhone solo se puede instalar desde <b>Safari</b>. Copia el enlace y ábrelo en Safari.</span></div>
          )}
          {!device.iosSafari && <button className="btn soft" style={{ marginTop: 12 }} onClick={copy}>Copiar enlace</button>}
        </div>
      )}

      {!device.android && !device.ios && (
        <div className="grid" style={{ marginTop: 18 }}>
          <p className="small">Abre este enlace en tu móvil para instalarla:</p>
          <div className="card row" style={{ justifyContent: 'space-between' }}><b className="small">{location.host}</b><button className="btn soft sm" onClick={copy}>Copiar</button></div>
          {canPrompt && <button className="btn soft" onClick={installWeb}>Instalar en este ordenador</button>}
          <a className="btn ghost" href={APK_URL} rel="noopener"><Icon n="download" c="s" /> Descargar APK de Android</a>
        </div>
      )}
      <button className="btn" style={{ marginTop: 10 }} onClick={onClose}>Ahora no</button>
    </Sheet>
  );
}
