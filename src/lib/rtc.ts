import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import type { Mode } from './supabase';

const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // TURN gratuito de Open Relay (mejora la conexión entre redes móviles). Sustitúyelo por uno propio en producción.
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

function createPeer(): Promise<Peer> {
  return import('peerjs').then(({ default: PeerCtor }) => new Promise<Peer>((resolve, reject) => {
    // Servidor de señalización: PeerJS público por defecto, o uno propio con VITE_PEERJS_HOST
    const host = import.meta.env.VITE_PEERJS_HOST as string | undefined;
    const opts = host ? { host, port: Number(import.meta.env.VITE_PEERJS_PORT || 443), path: (import.meta.env.VITE_PEERJS_PATH as string) || '/', secure: import.meta.env.VITE_PEERJS_SECURE !== 'false' } : {};
    const p = new PeerCtor({ ...opts, config: { iceServers: host ? [] : ICE }, debug: 0 });
    const t = setTimeout(() => { p.destroy(); reject(new Error('No se pudo conectar con el servicio de llamadas.')); }, 15000);
    p.on('open', () => { clearTimeout(t); resolve(p); });
    p.on('error', (e) => { clearTimeout(t); if (!p.open) reject(e); });
    p.on('disconnected', () => { if (!p.destroyed) { try { p.reconnect(); } catch { /* */ } } });
  }));
}

// Conexión con el servidor de señalización reutilizable entre llamadas: evita esperar 1-3 s cada vez.
let cached: Promise<Peer> | null = null;
export async function openPeer(): Promise<Peer> {
  if (cached) {
    try {
      const p = await cached;
      if (!p.destroyed && p.open) return p;
    } catch { /* se crea otro */ }
  }
  cached = createPeer();
  cached.catch(() => { cached = null; });
  return cached;
}

/** Precarga la librería y abre la conexión en segundo plano (al elegir modalidad o entrar en un chat). */
export function warmUp() { openPeer().catch(() => {}); }

export function closePeer() {
  cached?.then((p) => p.destroy()).catch(() => {});
  cached = null;
}

export async function getLocalStream(mode: Mode): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Para usar cámara y micrófono abre ZEVRA desde su enlace https o desde la app.');
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      // 720p: imagen completa del sensor (las resoluciones bajas recortan y parecen con zoom en muchos móviles)
      video: mode === 'voice' ? false : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    });
    return s;
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError') throw new Error('Necesitamos permiso de cámara y micrófono. Actívalo en los ajustes del navegador o del móvil.');
    if (name === 'NotFoundError') throw new Error('No encontramos cámara o micrófono en este dispositivo.');
    throw e;
  }
}

export function stopStream(s: MediaStream | null) { s?.getTracks().forEach((t) => t.stop()); }
export type { MediaConnection };
