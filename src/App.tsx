import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CONFIGURED } from './config';
import { supabase, type Mode, type ProfileCard } from './lib/supabase';
import { listenNativeAuth } from './lib/native';
import { ShieldOverlay, useScreenShield } from './lib/protect';
import { Ctx, ls, type AppCtx, type CallFlow, type Route, type Tab } from './store';
import { Icon, Logo, Spinner, ToastProvider, useToast } from './ui';
import { Auth, NewPassword } from './screens/Auth';
import { Verify } from './screens/Verify';
import { Onboarding } from './screens/Onboarding';
import { History, Home } from './screens/Home';
import { Call, IncomingCall } from './screens/Call';
import { ChatRoom, Chats } from './screens/Chat';
import { EditProfile, MyProfile, Settings, UserProfile } from './screens/Profile';

export default function App() {
  return <ToastProvider><Root /></ToastProvider>;
}

function Root() {
  const hidden = useScreenShield();
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<ProfileCard | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (!CONFIGURED) return;
    listenNativeAuth((m) => toast(m, true));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [toast]);

  const refreshMe = useCallback(async () => {
    if (!session) { setMe(null); return; }
    const { data } = await supabase.from('profile_cards').select('*').eq('id', session.user.id).maybeSingle();
    setMe((data as ProfileCard) ?? null);
  }, [session]);
  useEffect(() => {
    if (session) { setOnboarded(ls.get(`zevra-onb-${session.user.id}`) === '1'); refreshMe(); } else setMe(null);
  }, [session, refreshMe]);

  let body: JSX.Element;
  if (!CONFIGURED) body = <NotConfigured />;
  else if (session === undefined || (session && !me)) body = <Loading />;
  else if (recovery && session) body = <NewPassword onDone={() => setRecovery(false)} />;
  else if (!session) body = <Auth />;
  else if (!me!.verified) body = <Verify onVerified={refreshMe} onLogout={() => supabase.auth.signOut()} />;
  else if (!onboarded) body = <Onboarding onDone={() => { ls.set(`zevra-onb-${session.user.id}`, '1'); setOnboarded(true); }} />;
  else body = <Main session={session} me={me!} refreshMe={refreshMe} />;

  return (
    <div className="app">
      {body}
      {hidden && <ShieldOverlay />}
    </div>
  );
}

function Loading() {
  return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', justifyContent: 'center' }}><Logo s={26} /><Spinner /></div>;
}

function NotConfigured() {
  return (
    <div className="scroll"><div className="pad" style={{ paddingTop: 'calc(60px + var(--st))' }}>
      <Logo s={24} />
      <h1 className="h2" style={{ margin: '24px 0 10px' }}>Falta conectar el servidor</h1>
      <p className="muted small">Esta copia de ZEVRA aún no tiene configurado su proyecto de Supabase. Añade <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en las variables de entorno de Netlify y vuelve a publicar. Los pasos están en el README.</p>
    </div></div>
  );
}

interface Invite { id: string; caller: string; mode: Mode; partner: ProfileCard | null }

function Main({ session, me, refreshMe }: { session: Session; me: ProfileCard; refreshMe: () => Promise<void> }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'tabs', tab: 'home' }]);
  const [call, setCall] = useState<{ flow: CallFlow; key: number } | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const myId = session.user.id;
  const route = stack[stack.length - 1];

  const go = useCallback((r: Route) => setStack((s) => (r.name === 'tabs' ? [r] : [...s, r])), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const refreshUnread = useCallback(async () => {
    const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient', myId).is('read_at', null);
    setUnread(count ?? 0);
  }, [myId]);
  const refreshRequests = useCallback(async () => {
    const { count } = await supabase.from('photo_access').select('viewer', { count: 'exact', head: true }).eq('owner', myId).eq('status', 'pending');
    setRequests(count ?? 0);
  }, [myId]);

  useEffect(() => {
    refreshUnread(); refreshRequests();
    const ch = supabase.channel(`inbox-${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${myId}` }, () => refreshUnread())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_access', filter: `owner=eq.${myId}` }, () => refreshRequests())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_invites', filter: `callee=eq.${myId}` }, async (p) => {
        const row = p.new as { id: string; caller: string; mode: Mode; status: string };
        if (row.status !== 'ringing') return;
        const { data } = await supabase.from('profile_cards').select('*').eq('id', row.caller).maybeSingle();
        setInvite({ id: row.id, caller: row.caller, mode: row.mode, partner: data as ProfileCard });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `callee=eq.${myId}` }, (p) => {
        const row = p.new as { id: string; status: string };
        if (row.status === 'cancelled') setInvite((i) => (i?.id === row.id ? null : i));
      })
      .subscribe();
    // Android: volver atrás con el botón del sistema
    const onPop = () => back();
    window.addEventListener('zevra-back', onPop);
    return () => { supabase.removeChannel(ch); window.removeEventListener('zevra-back', onPop); };
  }, [myId, refreshUnread, refreshRequests, back]);

  // Caducar el aviso de llamada si nadie contesta
  useEffect(() => { if (!invite) return; const t = setTimeout(() => setInvite(null), 60000); return () => clearTimeout(t); }, [invite]);

  const startCall = useCallback((flow: CallFlow) => setCall({ flow, key: Date.now() }), []);

  const ctx: AppCtx = useMemo(() => ({ session, me, refreshMe, route, go, back, startCall, unread, refreshUnread, requests, refreshRequests }),
    [session, me, refreshMe, route, go, back, startCall, unread, refreshUnread, requests, refreshRequests]);

  const tab: Tab = route.name === 'tabs' ? route.tab : 'home';
  let screen: JSX.Element;
  switch (route.name) {
    case 'chat': screen = <ChatRoom key={route.partner} partnerId={route.partner} />; break;
    case 'user': screen = <UserProfile key={route.id} id={route.id} />; break;
    case 'edit': screen = <EditProfile />; break;
    case 'settings': screen = <Settings />; break;
    case 'history': screen = <History />; break;
    default: screen = (
      <>
        {tab !== 'profile' && <header className="topbar"><div className="title"><Logo /></div>
          <button className="icon-btn" onClick={() => go({ name: 'tabs', tab: 'profile' })} aria-label={`Solicitudes de fotos${requests ? `, ${requests} pendientes` : ''}`}><Icon n="bell" />{requests > 0 && <span className="badge">{requests}</span>}</button>
          <button className="icon-btn" onClick={() => go({ name: 'settings' })} aria-label="Ajustes"><Icon n="settings" /></button></header>}
        <main className="scroll">{tab === 'home' ? <Home /> : tab === 'chats' ? <Chats /> : <MyProfile />}</main>
        <nav className="nav" aria-label="Navegación principal">
          {([['home', 'home', 'Inicio', 0], ['chats', 'chat', 'Chat', unread], ['profile', 'user', 'Perfil', requests]] as const).map(([k, i, l, b]) => (
            <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go({ name: 'tabs', tab: k })}>
              <Icon n={i} /><span>{l}</span>{b > 0 && <span className="badge">{b}</span>}
            </button>
          ))}
        </nav>
      </>
    );
  }

  return (
    <Ctx.Provider value={ctx}>
      {screen}
      {call && <Call key={call.key} flow={call.flow} onClose={() => { setCall(null); refreshMe(); }} onAgain={() => setCall({ flow: call.flow.kind === 'invite-in' ? { kind: 'match', mode: call.flow.mode } : call.flow, key: Date.now() })} />}
      {invite && !call && (
        <IncomingCall inviteId={invite.id} partner={invite.partner} mode={invite.mode}
          onDecline={() => { supabase.rpc('answer_invite', { p_invite: invite.id, p_accept: false }).then(() => {}); setInvite(null); }}
          onAccept={() => { const i = invite; setInvite(null); startCall({ kind: 'invite-in', mode: i.mode, partner: i.caller, inviteId: i.id }); }} />
      )}
    </Ctx.Provider>
  );
}
