import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

export const supabase: SupabaseClient = createClient(
  CONFIGURED ? SUPABASE_URL : 'https://placeholder.supabase.co',
  CONFIGURED ? SUPABASE_ANON_KEY : 'placeholder-key-placeholder-key',
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export type Mode = 'social' | 'voice' | 'intimate';

export interface ProfileCard {
  id: string; alias: string; bio: string; pronouns: string; interests: string[]; avatar_path: string | null;
  verified: boolean; age: number | null; respect_score: number | null; respect_count: number; connections: number;
  gender?: Gender | null; seeking?: Gender[];
  country?: string | null; sexuality?: string | null; desires?: string[]; showroom?: boolean;
  online?: boolean; likes_received?: number; created_at?: string;
}
export type Gender = string;
export const GENDERS: Array<[Gender, string, string]> = [['mujer', 'Mujer', 'Mujeres'], ['hombre', 'Hombre', 'Hombres'], ['no_binario', 'No binario', 'No binarias']];
export interface Photo { id: string; owner: string; path: string; is_private: boolean; created_at: string }
export interface Message {
  id: string; sender: string; recipient: string; kind: 'text' | 'image' | 'video'; body: string | null;
  media_path: string | null; created_at: string; read_at: string | null; viewed_at: string | null;
}
export interface Conversation {
  partner: string; alias: string; avatar_path: string | null; last_kind: string | null; last_body: string | null;
  last_at: string; last_from_me: boolean | null; unread: number; last_call_at: string;
}
export interface CallRow {
  call_id: string; partner: string; alias: string; avatar_path: string | null; mode: Mode;
  started_at: string; seconds: number; can_rate: boolean;
}

const ERRORS: Record<string, string> = {
  underage: 'Tienes que ser mayor de 18 años para usar ZEVRA.',
  document_expired: 'Tu DNI está caducado. Usa un documento en vigor.',
  document_in_use: 'Este DNI ya está asociado a otra cuenta.',
  invalid_document: 'No hemos podido validar el documento. Inténtalo de nuevo.',
  age_not_verified: 'Antes de conectar necesitas verificar tu edad.',
  not_connected: 'Solo puedes llamar a personas con las que ya has conectado.',
  blocked: 'No puedes contactar con esta persona.',
  invite_expired: 'La llamada ya no está disponible.',
  media_already_viewed: 'Este contenido ya se ha visto y se ha eliminado.',
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Confirma tu email con el enlace que te hemos enviado.',
  'User already registered': 'Ya existe una cuenta con este email. Inicia sesión.',
};
export function errText(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (/row-level security|violates/.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  return 'Algo ha fallado. Inténtalo de nuevo en unos segundos.';
}

// URLs firmadas de fotos con caché en memoria
const urlCache = new Map<string, { url: string; exp: number }>();
export async function photoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from('photos').createSignedUrl(path, 3600);
  if (error || !data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3000_000 });
  return data.signedUrl;
}
export function forgetPhotoUrl(path: string) { urlCache.delete(path); }
