import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Mode, ProfileCard } from './lib/supabase';

export type Tab = 'home' | 'chats' | 'profile';
export type Route =
  | { name: 'tabs'; tab: Tab }
  | { name: 'chat'; partner: string }
  | { name: 'user'; id: string }
  | { name: 'edit' }
  | { name: 'settings' }
  | { name: 'history' };

export type CallFlow =
  | { kind: 'match'; mode: Mode }
  | { kind: 'invite-out'; mode: Mode; partner: string }
  | { kind: 'invite-in'; mode: Mode; partner: string; inviteId: string };

export interface AppCtx {
  session: Session;
  me: ProfileCard;
  refreshMe: () => Promise<void>;
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  startCall: (f: CallFlow) => void;
  unread: number;
  refreshUnread: () => void;
  requests: number;
  refreshRequests: () => void;
}
export const Ctx = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de contexto');
  return c;
}

export const MODES: Record<Mode, { n: string; name: string; title: string; desc: string; color: string; text: string; icon: string }> = {
  social: { n: '01', name: 'Social', title: 'Vídeo para conocer gente', desc: 'Conversaciones abiertas, cara a cara. Sin contenido íntimo.', color: '#C9C2BC', text: '#F6F0EB', icon: 'video' },
  voice: { n: '02', name: 'Voz', title: 'Solo voz, la mente primero', desc: 'Sin cámara. Conversaciones largas y cercanas.', color: '#7A4DFF', text: '#B9A4FF', icon: 'mic' },
  intimate: { n: '03', name: 'Íntima', title: 'Vídeo íntimo, con permiso', desc: 'Vídeo para adultos que lo desean. Puedes difuminar la imagen o apagar tu cámara cuando quieras.', color: '#FF3B6B', text: '#FF86A4', icon: 'heart' },
};

export const REPORT_REASONS = [
  'Acoso o insultos', 'Contenido sexual sin consentimiento', 'Grabación o amenaza de difusión', 'Parece menor de edad',
  'Petición de dinero o datos', 'Spam o perfil falso', 'Otro motivo',
];

export const INTERESTS = ['Música', 'Cine', 'Viajes', 'Filosofía', 'Deporte', 'Arte', 'Libros', 'Cocina', 'Tecnología', 'Bienestar', 'Humor', 'Gaming', 'Fotografía', 'Naturaleza', 'Idiomas', 'Noche'];

export const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
};
