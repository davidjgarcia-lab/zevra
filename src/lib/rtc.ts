import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import { supabase, type Mode } from './supabase';

const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

/**
 * Servidores ICE. Con datos móviles (4G/5G) los dos móviles casi nunca pueden verse directamente:
 * hace falta un servidor TURN que haga de puente. Las credenciales las genera Supabase
 * (función get_ice_servers, con Cloudflare TURN) y se guardan aquí unas horas.
 */
let iceCache: { at: number; servers: RTCIceServer[] } | null = null;
export async function getIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < 6 * 3600e3) return iceCache.servers;
  try {
    const { data, error } = await supabase.rpc('get_ice_servers');
    const extra = !error && Array.isArray(data) ? (data as RTCIceServer[]) : [];
    const servers = [...STUN, ...extra];
    iceCache = { at: Date.now(), servers };
    return servers;
  } catch {
    return STUN;
  }
}
export const hasTurn = () => !!iceCache?.servers.some((s) => [s.urls].flat().some((u) => String(u).startsWith('turn')));

function createPeer(): Promise<Peer> {
  return Promise.all([import('peerjs'), getIceServers()]).then(([{ default: PeerCtor }, ice]) => new Promise<Peer>((resolve, reject) => {
    // Servidor de señalización: PeerJS público por defecto, o uno propio con VITE_PEERJS_HOST
    const host = import.meta.env.VITE_PEERJS_HOST as string | undefined;
    const opts = host ? { host, port: Number(import.meta.env.VITE_PEERJS_PORT || 443), path: (import.meta.env.VITE_PEERJS_PATH as string) || '/', secure: import.meta.env.VITE_PEERJS_SECURE !== 'false' } : {};
    const p = new PeerCtor({ ...opts, config: { iceServers: host ? [] : ice, iceCandidatePoolSize: 4 }, debug: 0 });
    createdAt = Date.now();
    const t = setTimeout(() => { p.destroy(); reject(new Error('No se pudo conectar con el servicio de llamadas.')); }, 15000);
    p.on('open', () => { clearTimeout(t); resolve(p); });
    p.on('error', (e) => { clearTimeout(t); if (!p.open) reject(e); });
    p.on('disconnected', () => { if (!p.destroyed) { try { p.reconnect(); } catch { /* */ } } });
  }));
}

// Conexión con el servidor de señalización reutilizable entre llamadas: evita esperar 1-3 s cada vez.
let cached: Promise<Peer> | null = null;
let createdAt = 0;
export async function openPeer(): Promise<Peer> {
  if (cached) {
    try {
      const p = await cached;
      // Se renueva cada 6 h para que las credenciales TURN no caduquen en mitad de una llamada
      if (!p.destroyed && p.open && Date.now() - createdAt < 6 * 3600e3) return p;
      if (!p.destroyed) p.destroy();
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

/* ---------- Audio de la otra persona ----------
   Un único <audio> que se «desbloquea» con el primer toque del usuario en la app. Así, cuando llega la
   llamada, el sonido suena solo (iPhone y algunos Android bloquean el audio que no sigue a un toque). */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let audioEl: HTMLAudioElement | null = null;
export function remoteAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', '');
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }
  return audioEl;
}
let unlocked = false;
export function initAudioUnlock() {
  const unlock = () => {
    if (unlocked) return;
    const a = remoteAudio();
    if (a.srcObject) { a.play().then(() => { unlocked = true; }).catch(() => {}); return; }
    a.src = SILENCE;
    a.play().then(() => { unlocked = true; a.pause(); a.removeAttribute('src'); a.load(); }).catch(() => {});
  };
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { capture: true, passive: true }));
}
/** Reproduce el audio remoto; si el navegador lo bloquea, lo reintenta en el siguiente toque, sin botones. */
export function playRemoteAudio(stream: MediaStream) {
  const a = remoteAudio();
  a.srcObject = stream;
  a.muted = false;
  a.play().catch(() => {
    const retry = () => { a.play().catch(() => {}); document.removeEventListener('pointerdown', retry, true); };
    document.addEventListener('pointerdown', retry, true);
  });
}
export function stopRemoteAudio() { const a = audioEl; if (a) { a.pause(); a.srcObject = null; } }
