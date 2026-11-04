// Instalación de la app en el móvil: APK en Android, «Añadir a pantalla de inicio» en iPhone.
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}
export const onInstallChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const canPromptInstall = () => !!deferred;
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; notify();
  return outcome === 'accepted';
}

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const device = {
  ios: /iPhone|iPad|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /Android/.test(ua),
  iosSafari: /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua),
};
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
