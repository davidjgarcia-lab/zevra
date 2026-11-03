import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';
import { NATIVE_REDIRECT } from '../config';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

/** Login con Google. En la web redirige; en la app Android abre el navegador del sistema y vuelve por enlace profundo. */
export async function signInWithGoogle() {
  if (!isNative) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (data?.url) await Browser.open({ url: data.url, presentationStyle: 'popover' });
}

let listening = false;
export function listenNativeAuth(onError: (msg: string) => void) {
  if (!isNative || listening) return;
  listening = true;
  CapApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    try { await Browser.close(); } catch { /* ya cerrado */ }
    const u = new URL(url.replace(/#/, '?'));
    const code = u.searchParams.get('code');
    const err = u.searchParams.get('error_description');
    if (err) { onError(err); return; }
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) onError(error.message);
    }
  });
}
