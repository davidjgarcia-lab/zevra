import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Mode, ProfileCard } from './lib/supabase';

export type Tab = 'home' | 'connect' | 'showroom' | 'chats' | 'profile';
export type Route =
  | { name: 'tabs'; tab: Tab }
  | { name: 'chat'; partner: string }
  | { name: 'user'; id: string }
  | { name: 'edit' }
  | { name: 'settings' }
  | { name: 'history' }
  | { name: 'shop' }
  | { name: 'live'; id: string }
  | { name: 'broadcast' };

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

export const MODES: Record<Mode, { n: string; name: string; title: string; desc: string; color: string; text: string; icon: string; tags: string[] }> = {
  social: { n: '01', name: 'Conocer gente', title: 'Conocer gente', desc: 'Charla cara a cara con alguien nuevo. Sin desnudos ni conductas sexuales: aquí se viene a conocer gente.', color: '#C9C2BC', text: '#F6F0EB', icon: 'users', tags: ['Vídeo', 'Social'] },
  voice: { n: '02', name: 'Sexting por voz', title: 'Sexting por voz', desc: 'Solo voz, sin imagen ni vídeo. Una conversación íntima entre adultos que han elegido estar aquí.', color: '#7A4DFF', text: '#B9A4FF', icon: 'wave', tags: ['Solo audio', '+18 íntimo'] },
  intimate: { n: '03', name: 'Explorar en vídeo', title: 'Explorar en vídeo', desc: 'Videollamadas íntimas entre adultos que han aceptado participar. Tú decides cuándo te ven y puedes salir al instante.', color: '#FF3B6B', text: '#FF86A4', icon: 'video', tags: ['Vídeo', '+18 íntimo'] },
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
