import { useCallback, useEffect, useRef, useState } from 'react';
import type Peer from 'peerjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { errText, supabase, type ProfileCard } from '../lib/supabase';
import { getLocalStream, openPeer, playRemoteAudio, stopRemoteAudio, stopStream, type MediaConnection } from '../lib/rtc';
import { countryName, flag } from '../lib/catalog';
import { ls, useApp } from '../store';
import { Avatar, Check, Icon, Sheet, Spinner, Stars, Toggle, timeAgo, useToast } from '../ui';
import { ShopCard } from './Home';
import { ReportSheet } from './Sheets';

/** Espectadores simultáneos por directo (cada uno es una conexión directa con quien emite). */
export const MAX_VIEWERS = 8;

interface Live { id: string; host: string; title: string; intimate: boolean; started_at: string; heartbeat_at: string }

/* ===================== Lista del Showroom ===================== */
export function Showroom() {
  const { me, go, refreshMe } = useApp();
  const toast = useToast();
  const [lives, setLives] = useState<Array<Live & { card?: ProfileCard }> | null>(null);
  const [people, setPeople] = useState<ProfileCard[]>([]);
  const [setup, setSetup] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 60000).toISOString();
    const { data } = await supabase.from('lives').select('id,host,title,intimate,started_at,heartbeat_at').is('ended_at', null).gte('heartbeat_at', since).order('started_at', { ascending: false });
    const rows = (data as Live[]) ?? [];
    const ids = Array.from(new Set(rows.map((r) => r.host)));
    const { data: cards } = ids.length ? await supabase.from('profile_cards').select('*').in('id', ids) : { data: [] };
    const map = new Map(((cards as ProfileCard[]) ?? []).map((c) => [c.id, c]));
    setLives(rows.map((r) => ({ ...r, card: map.get(r.host) })));
    const { data: sp } = await supabase.from('profile_cards').select('*').eq('showroom', true).neq('id', me.id).order('online', { ascending: false }).limit(30);
    setPeople((sp as ProfileCard[]) ?? []);
  }, [me.id]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`lives-${me.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'lives' }, () => load()).subscribe();
    const t = setInterval(load, 20000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load, me.id]);

  const enable = async () => {
    const { error } = await supabase.from('profiles').update({ showroom: true }).eq('id', me.id);
    if (error) return toast(errText(error), true);
    await refreshMe(); setSetup(false); go({ name: 'broadcast' });
  };

  return (
    <div className="pad fade" style={{ paddingBottom: 24 }}>
      <h1 className="h1" style={{ margin: '6px 0 4px' }}>Showroom</h1>
      <p className="small muted" style={{ marginBottom: 14 }}>Personas que han elegido mostrarse en directo. Entra a verlas, escríbeles o proponles una videollamada.</p>

      <button className="live-cta" onClick={() => (me.showroom ? go({ name: 'broadcast' }) : setSetup(true))}>
        <span className="live-cta-ic"><Icon n="broadcast" /></span>
        <span style={{ flex: 1, textAlign: 'left' }}><b>Emitir en directo</b><span>Muéstrate en el escaparate · hasta {MAX_VIEWERS} espectadores a la vez</span></span>
        <Icon n="arrowR" />
      </button>

      <ShopCard compact />

      <div className="section-title"><span className="h3"><span className="live-dot" /> En directo ahora</span><span className="tiny muted">{lives?.length ?? 0}</span></div>
      {lives === null ? <div className="skel" style={{ height: 160 }} /> : lives.length === 0 ? (
        <div className="card small muted center" style={{ padding: '26px 16px' }}>Ahora mismo nadie está emitiendo. ¡Sé la primera persona!</div>
      ) : (
        <div className="live-grid">
          {lives.map((l) => (
            <button key={l.id} className="live-tile" onClick={() => go({ name: 'live', id: l.id })}>
              <div className="live-thumb"><Avatar id={l.host} path={l.card?.avatar_path} size={260} />{l.intimate && <span className="tag2 adult live-adult">+18</span>}<span className="live-badge">EN DIRECTO</span></div>
              <div className="live-meta">
                <b>{l.card?.alias ?? '…'}{l.card?.age ? `, ${l.card.age}` : ''} {l.card?.country && <span title={countryName(l.card.country)}>{flag(l.card.country)}</span>}</b>
                <span>{l.title || 'Sin título'} · {timeAgo(l.started_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="section-title"><span className="h3">En el escaparate</span><span className="tiny muted">{people.length}</span></div>
      {people.length === 0 ? <div className="card small muted center">Aún no hay perfiles en el escaparate.</div> : (
        <div className="people-grid">
          {people.map((p) => (
            <button key={p.id} className="person" onClick={() => go({ name: 'user', id: p.id })}>
              <span style={{ position: 'relative', display: 'inline-flex' }}><Avatar id={p.id} path={p.avatar_path} size={64} />{p.online && <span className="online-dot" />}</span>
              <b>{p.alias}</b>
              <span className="tiny muted">{p.age ? `${p.age} · ` : ''}{p.country ? flag(p.country) : ''}</span>
            </button>
          ))}
        </div>
      )}

      {setup && (
        <Sheet onClose={() => setSetup(false)} label="Aparecer en el Showroom">
          <h2 className="h2">Aparecer en el Showroom</h2>
          <p className="small muted" style={{ margin: '8px 0 14px' }}>Tu perfil aparecerá en el escaparate y podrás emitir en directo para varias personas a la vez. Cualquiera que vea tu directo podrá escribirte o proponerte una videollamada. Puedes desactivarlo cuando quieras en tu perfil.</p>
          <button className="btn primary" onClick={enable}>Activar y emitir</button>
        </Sheet>
      )}
    </div>
  );
}

/* ===================== Emitir en directo ===================== */
export function Broadcast() {
  const { me, back, go, startCall } = useApp();
  const toast = useToast();
  const [stage, setStage] = useState<'setup' | 'live' | 'ended'>('setup');
  const [title, setTitle] = useState('');
  const [intimate, setIntimate] = useState(false);
  const [agree, setAgree] = useState(false);
  const [viewers, setViewers] = useState<Array<{ id: string; alias: string }>>([]);
  const [chat, setChat] = useState<Array<{ id: string; from: string; alias: string; text: string }>>([]);
  const [text, setText] = useState('');
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [secs, setSecs] = useState(0);
  const [pick, setPick] = useState<{ id: string; alias: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const R = useRef({ stream: null as MediaStream | null, peer: null as Peer | null, live: null as string | null, ch: null as RealtimeChannel | null,
    conns: new Map<string, MediaConnection>(), timers: [] as number[], onCall: null as ((mc: MediaConnection) => void) | null });

  useEffect(() => {
    let alive = true;
    getLocalStream('social').then((s) => {
      if (!alive) return stopStream(s);
      R.current.stream = s;
      if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
    }).catch((e) => toast((e as Error).message, true));
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { R.current.stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic]);
  useEffect(() => { R.current.stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam]);

  const stop = () => {
    const r = R.current;
    r.timers.forEach((t) => clearInterval(t)); r.timers = [];
    r.conns.forEach((c) => { try { c.close(); } catch { /* */ } }); r.conns.clear();
    if (r.peer && r.onCall) r.peer.off('call', r.onCall);
    if (r.ch) { supabase.removeChannel(r.ch); r.ch = null; }
    if (r.live) { supabase.rpc('end_live', { p_live: r.live }).then(() => {}); r.live = null; }
    stopStream(r.stream); r.stream = null;
  };

  const goLive = async () => {
    if (!R.current.stream) return toast('Activa la cámara para emitir', true);
    try {
      const peer = await openPeer();
      R.current.peer = peer;
      const { data, error } = await supabase.rpc('start_live', { p_title: title.trim(), p_peer_id: peer.id, p_intimate: intimate });
      if (error) throw error;
      const liveId = data as string;
      R.current.live = liveId;
      const onCall = (mc: MediaConnection) => {
        const md = mc.metadata as { live?: string; viewer?: string } | undefined;
        if (md?.live !== liveId) return;
        if (R.current.conns.size >= MAX_VIEWERS) { try { mc.close(); } catch { /* */ } return; }
        mc.answer(R.current.stream!);
        const key = md.viewer || mc.connectionId;
        R.current.conns.get(key)?.close();
        R.current.conns.set(key, mc);
        mc.on('close', () => { if (R.current.conns.get(key) === mc) R.current.conns.delete(key); });
      };
      R.current.onCall = onCall;
      peer.on('call', onCall);
      const ch = supabase.channel(`live-${liveId}`, { config: { presence: { key: me.id }, broadcast: { self: true } } })
        .on('presence', { event: 'sync' }, () => {
          const st = ch.presenceState() as Record<string, Array<{ alias: string; role: string }>>;
          setViewers(Object.entries(st).filter(([, v]) => v[0]?.role === 'viewer').map(([id, v]) => ({ id, alias: v[0].alias })));
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => setChat((c) => [...c.slice(-40), payload as never]))
        .subscribe((s) => { if (s === 'SUBSCRIBED') ch.track({ alias: me.alias, role: 'host' }); });
      R.current.ch = ch;
      R.current.timers.push(window.setInterval(() => supabase.rpc('live_heartbeat', { p_live: liveId, p_peer_id: peer.id }), 20000));
      R.current.timers.push(window.setInterval(() => setSecs((x) => x + 1), 1000));
      setStage('live');
    } catch (e) { toast(errText(e), true); }
  };

  const say = () => {
    const t = text.trim(); if (!t || !R.current.ch) return;
    setText('');
    R.current.ch.send({ type: 'broadcast', event: 'chat', payload: { id: `${Date.now()}`, from: me.id, alias: me.alias, text: t.slice(0, 300) } });
  };

  const end = () => { stop(); setStage('ended'); };
  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="full call-stage" style={{ background: '#000' }}>
      <video ref={video} className="main-video" autoPlay playsInline muted style={{ objectFit: 'cover', transform: 'scaleX(-1)', display: cam ? 'block' : 'none' }} />
      {!cam && <div className="center" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}><Icon n="videoOff" c="l" /><span className="muted">Cámara apagada</span></div>}

      <div className="call-head">
        {stage === 'live' ? <span className="safe-btn" style={{ background: 'var(--coral)', color: 'var(--ink)' }}><span className="live-dot" style={{ background: 'var(--ink)' }} /> EN DIRECTO · {mm}</span>
          : <button className="safe-btn" onClick={back}><Icon n="arrowL" c="s" /> Volver</button>}
        {stage === 'live' && <span className="safe-btn"><Icon n="eye" c="s" /> {viewers.length}/{MAX_VIEWERS}</span>}
      </div>

      {stage === 'setup' && (
        <div className="live-setup">
          <h2 className="h2">Emitir en directo</h2>
          <label className="field" style={{ marginTop: 10 }}><span>Título (opcional)</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Charla tranquila, ¿te apuntas?" /></label>
          <div className="between" style={{ margin: '4px 0 12px' }}><span className="small"><b>Contenido +18</b><span className="tiny muted" style={{ display: 'block' }}>Solo entrará quien haya dado su consentimiento</span></span><Toggle on={intimate} onChange={setIntimate} label="Contenido +18" /></div>
          <Check on={agree} onChange={setAgree}>Entiendo que mi directo puede verlo cualquier persona verificada y que está prohibido grabarlo o difundirlo.</Check>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={!agree} onClick={goLive}><Icon n="broadcast" c="s" /> Empezar directo</button>
        </div>
      )}

      {stage === 'live' && (
        <>
          <div className="call-chat" style={{ right: 14 }}>
            <div className="call-chat-list">
              {chat.slice(-8).map((m) => (
                <button key={m.id} className={`call-chat-msg ${m.from === me.id ? 'me' : ''}`} onClick={() => m.from !== me.id && setPick({ id: m.from, alias: m.alias })}>
                  <b>{m.alias}:</b> {m.text}
                </button>
              ))}
            </div>
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); say(); }}>
              <input className="input" style={{ height: 42, background: 'rgba(14,14,16,.8)' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe a tu público…" maxLength={300} />
              <button className="cc sm" style={{ background: 'var(--coral)', color: 'var(--ink)' }} aria-label="Enviar" disabled={!text.trim()}><Icon n="send" c="s" /></button>
            </form>
          </div>
          {viewers.length > 0 && (
            <div className="viewer-strip">
              {viewers.map((v) => <button key={v.id} className="chip" onClick={() => setPick(v)}>{v.alias}</button>)}
            </div>
          )}
          <div className="controls">
            <button className={`cc ${mic ? '' : 'off'}`} onClick={() => setMic(!mic)} aria-label={mic ? 'Silenciar' : 'Activar micrófono'}><Icon n={mic ? 'mic' : 'micOff'} /></button>
            <button className={`cc ${cam ? '' : 'off'}`} onClick={() => setCam(!cam)} aria-label={cam ? 'Apagar cámara' : 'Encender cámara'}><Icon n={cam ? 'video' : 'videoOff'} /></button>
            <button className="cc end" onClick={end}><Icon n="x" c="s" /> Terminar</button>
          </div>
        </>
      )}

      {stage === 'ended' && (
        <div className="pad" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', background: 'var(--g-night)' }}>
          <Icon n="broadcast" c="l" />
          <div className="h2">Directo terminado</div>
          <p className="muted small">Duración: {mm}. Las personas que te han visto pueden escribirte.</p>
          <button className="btn primary" onClick={() => go({ name: 'tabs', tab: 'chats' })}>Ver mensajes</button>
          <button className="btn" onClick={back}>Volver al Showroom</button>
        </div>
      )}

      {pick && (
        <Sheet onClose={() => setPick(null)} label={pick.alias}>
          <h2 className="h2">{pick.alias}</h2>
          <div className="grid" style={{ marginTop: 14 }}>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => { setPick(null); go({ name: 'user', id: pick.id }); }}><Icon n="user" c="s" /> Ver perfil</button>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => { const p = pick; setPick(null); end(); startCall({ kind: 'invite-out', mode: 'social', partner: p.id }); }}><Icon n="video" c="s" /> Terminar el directo y videollamar en privado</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ===================== Ver un directo ===================== */
function dummyStream(): MediaStream {
  // Quien mira no envía imagen ni sonido: una pista vacía basta para recibir el directo
  const c = document.createElement('canvas'); c.width = 2; c.height = 2;
  const g = c.getContext('2d'); if (g) { g.fillStyle = '#000'; g.fillRect(0, 0, 2, 2); }
  const s = (c as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream?.(1) ?? new MediaStream();
  try {
    const ac = new AudioContext(); const dst = ac.createMediaStreamDestination(); dst.stream.getAudioTracks().forEach((t) => s.addTrack(t));
  } catch { /* sin audio */ }
  return s;
}

export function WatchLive({ id }: { id: string }) {
  const { me, back, go, startCall } = useApp();
  const toast = useToast();
  const [live, setLive] = useState<Live | null>(null);
  const [host, setHost] = useState<ProfileCard | null>(null);
  const [state, setState] = useState<'loading' | 'consent' | 'connecting' | 'live' | 'ended' | 'full' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [viewers, setViewers] = useState(0);
  const [chat, setChat] = useState<Array<{ id: string; from: string; alias: string; text: string }>>([]);
  const [text, setText] = useState('');
  const [liked, setLiked] = useState(false);
  const [report, setReport] = useState(false);
  const [checks, setChecks] = useState([false, false]);
  const video = useRef<HTMLVideoElement>(null);
  const R = useRef({ mc: null as MediaConnection | null, ch: null as RealtimeChannel | null, dummy: null as MediaStream | null });

  const cleanup = () => {
    try { R.current.mc?.close(); } catch { /* */ }
    if (R.current.ch) { supabase.removeChannel(R.current.ch); R.current.ch = null; }
    stopStream(R.current.dummy); stopRemoteAudio();
  };

  const connect = async (l: Live) => {
    setState('connecting');
    try {
      const { data, error } = await supabase.rpc('join_live', { p_live: l.id });
      if (error) throw error;
      const j = data as { peer_id: string; host: string };
      const ch = supabase.channel(`live-${l.id}`, { config: { presence: { key: me.id }, broadcast: { self: true } } })
        .on('presence', { event: 'sync' }, () => {
          const st = ch.presenceState() as Record<string, Array<{ role: string }>>;
          setViewers(Object.values(st).filter((v) => v[0]?.role === 'viewer').length);
        })
        .on('broadcast', { event: 'chat' }, ({ payload }) => setChat((c) => [...c.slice(-40), payload as never]));
      R.current.ch = ch;
      // Esperar al tiempo real como mucho 4 s: si tarda, se entra igualmente (el aforo lo controla también quien emite)
      const subscribed = await new Promise<boolean>((res) => {
        const t = setTimeout(() => res(false), 4000);
        ch.subscribe((s) => { if (s === 'SUBSCRIBED') { clearTimeout(t); res(true); } });
      });
      if (subscribed) {
        await new Promise((r) => setTimeout(r, 400)); // dar tiempo a recibir quién está dentro
        const st = ch.presenceState() as Record<string, Array<{ role: string }>>;
        if (Object.values(st).filter((v) => v[0]?.role === 'viewer').length >= MAX_VIEWERS) { setState('full'); return; }
        ch.track({ alias: me.alias, role: 'viewer' });
      }
      const peer = await openPeer();
      R.current.dummy = dummyStream();
      const mc = peer.call(j.peer_id, R.current.dummy, { metadata: { live: l.id, viewer: me.id } });
      if (!mc) throw new Error('No se pudo conectar con el directo.');
      R.current.mc = mc;
      mc.on('stream', (s: MediaStream) => {
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        playRemoteAudio(s);
        setState('live');
      });
      mc.on('close', () => setState('ended'));
      setTimeout(() => setState((x) => (x === 'connecting' ? 'error' : x)), 25000);
      setErr('No se pudo conectar con el directo. Puede que se haya llenado o que haya terminado.');
    } catch (e) {
      const m = (e as Error)?.message || '';
      if (/live_ended/.test(m)) setState('ended'); else { setErr(errText(e)); setState('error'); }
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('lives').select('id,host,title,intimate,started_at,heartbeat_at').eq('id', id).maybeSingle();
      if (!data) { setState('ended'); return; }
      const l = data as Live; setLive(l);
      supabase.from('profile_cards').select('*').eq('id', l.host).maybeSingle().then(({ data: c }) => setHost(c as ProfileCard));
      if (l.intimate && ls.get(`zevra-consent-${me.id}-intimate`) !== '1') { setState('consent'); return; }
      connect(l);
    })();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const say = () => {
    const t = text.trim(); if (!t || !R.current.ch) return;
    setText('');
    R.current.ch.send({ type: 'broadcast', event: 'chat', payload: { id: `${Date.now()}`, from: me.id, alias: me.alias, text: t.slice(0, 300) } });
  };
  const like = async () => {
    if (!host || liked) return; setLiked(true);
    const { data, error } = await supabase.rpc('like_user', { p_user: host.id });
    if (error) { setLiked(false); return toast(errText(error), true); }
    toast(data ? `¡Os gustáis con ${host.alias}! 💘` : `Le has dado me gusta a ${host.alias}`);
  };
  const leave = () => { cleanup(); back(); };

  return (
    <div className="full call-stage" style={{ background: '#000' }}>
      <video ref={video} className="main-video reveal" autoPlay playsInline muted style={{ objectFit: 'contain', display: state === 'live' ? 'block' : 'none' }} />
      {state !== 'live' && host && <div className="connect-bg" aria-hidden="true"><Avatar id={host.id} path={host.avatar_path} size={720} /></div>}

      <div className="call-head">
        <button className="safe-btn" onClick={leave}><Icon n="arrowL" c="s" /> Salir</button>
        <div className="row" style={{ gap: 6 }}>
          {state === 'live' && <span className="safe-btn"><span className="live-dot" /> {viewers}</span>}
          {host && <button className="safe-btn" onClick={() => setReport(true)} aria-label="Denunciar"><Icon n="flag" c="s" /></button>}
        </div>
      </div>

      {host && (
        <div className="partner-tag" style={{ bottom: 'auto', top: 'calc(64px + var(--st))' }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{host.alias}{host.age ? `, ${host.age}` : ''} {host.country && <span title={countryName(host.country)}>{flag(host.country)}</span>} {host.verified && <span style={{ color: 'var(--ok)' }}>✓</span>}</span>
          {live?.title && <span className="tiny">{live.title}</span>}
          {host.respect_count > 0 && <span className="row tiny" style={{ gap: 4 }}><Stars value={Number(host.respect_score)} /> {Number(host.respect_score).toFixed(1)}</span>}
        </div>
      )}

      {(state === 'loading' || state === 'connecting') && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}><Spinner /><span className="small">Entrando al directo…</span></div>}
      {['ended', 'full', 'error'].includes(state) && (
        <div className="pad" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          <Icon n={state === 'full' ? 'users' : 'broadcast'} c="l" />
          <div className="h2">{state === 'ended' ? 'El directo ha terminado' : state === 'full' ? 'Directo completo' : 'No se pudo conectar'}</div>
          <p className="small muted">{state === 'full' ? `Ya hay ${MAX_VIEWERS} personas viéndolo. Prueba en un rato.` : state === 'error' ? err : 'Puedes escribir a esta persona o proponerle una videollamada.'}</p>
          {host && state !== 'full' && <button className="btn primary" onClick={() => go({ name: 'chat', partner: host.id })}><Icon n="chat" c="s" /> Escribir a {host.alias}</button>}
          <button className="btn" onClick={leave}>Volver</button>
        </div>
      )}

      {state === 'live' && (
        <>
          <div className="call-chat">
            <div className="call-chat-list">{chat.slice(-8).map((m) => <div key={m.id} className={`call-chat-msg ${m.from === me.id ? 'me' : ''}`}><b>{m.alias}:</b> {m.text}</div>)}</div>
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); say(); }}>
              <input className="input" style={{ height: 42, background: 'rgba(14,14,16,.8)' }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Comenta en el directo…" maxLength={300} />
              <button className="cc sm" style={{ background: 'var(--coral)', color: 'var(--ink)' }} aria-label="Enviar" disabled={!text.trim()}><Icon n="send" c="s" /></button>
            </form>
          </div>
          <div className="side-tools" style={{ top: 'auto', bottom: 'calc(110px + var(--sb))' }}>
            <button className={`cc sm ${liked ? 'liked' : ''}`} onClick={like} aria-label="Me gusta"><Icon n="heart" c="s" /></button>
            {host && <button className="cc sm" onClick={() => { cleanup(); go({ name: 'chat', partner: host.id }); }} aria-label="Escribir en privado"><Icon n="chat" c="s" /></button>}
            {host && <button className="cc sm" onClick={() => { cleanup(); startCall({ kind: 'invite-out', mode: 'social', partner: host.id }); }} aria-label="Proponer videollamada privada"><Icon n="video" c="s" /></button>}
          </div>
        </>
      )}

      {state === 'consent' && live && (
        <Sheet onClose={leave} label="Directo +18">
          <h2 className="h2">Directo +18</h2>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>Este directo puede contener contenido íntimo entre personas adultas.</p>
          <div className="grid" style={{ gap: 8 }}>
            <Check on={checks[0]} onChange={(v) => setChecks([v, checks[1]])}>Soy mayor de edad y quiero ver contenido íntimo de otras personas adultas.</Check>
            <Check on={checks[1]} onChange={(v) => setChecks([checks[0], v])}>Nunca grabaré ni compartiré a nadie. Sé que hacerlo es delito y supone la expulsión.</Check>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} disabled={!checks.every(Boolean)} onClick={() => { ls.set(`zevra-consent-${me.id}-intimate`, '1'); connect(live); }}>Entrar al directo</button>
        </Sheet>
      )}
      {report && host && <ReportSheet userId={host.id} alias={host.alias} onClose={() => setReport(false)} onBlocked={leave} />}
    </div>
  );
}
