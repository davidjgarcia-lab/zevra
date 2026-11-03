import type Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';
import type { Mode } from './supabase';

const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // TURN gratuito de Open Relay (mejora la conexión entre redes móviles). Sustitúyelo por uno propio en producción.
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];

export async function openPeer(): Promise<Peer> {
  const { default: PeerCtor } = await import('peerjs');
  return new Promise((resolve, reject) => {
    const p = new PeerCtor({ config: { iceServers: ICE }, debug: 0 });
    const t = setTimeout(() => { p.destroy(); reject(new Error('No se pudo conectar con el servicio de llamadas.')); }, 15000);
    p.on('open', () => { clearTimeout(t); resolve(p); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

export async function getLocalStream(mode: Mode): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Para usar cámara y micrófono abre ZEVRA desde su enlace https o desde la app.');
  }
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: mode === 'voice' ? false : { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
    });
    if (mode === 'intimate') s.getVideoTracks().forEach((t) => (t.enabled = false)); // cámara apagada al empezar
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
