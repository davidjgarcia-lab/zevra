import { useEffect, useRef, useState } from 'react';
import type Peer from 'peerjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { errText, supabase, type ProfileCard } from '../lib/supabase';
import { getLocalStream, openPeer, stopStream, type MediaConnection } from '../lib/rtc';
import { MODES, ls, useApp, type CallFlow } from '../store';
import { Avatar, Icon, Stars, ZMark, fmtClock, fmtDur, useToast } from '../ui';
import { RATE_MIN_SECONDS } from '../config';
import { RateSheet, ReportSheet } from './Sheets';

type Phase = 'prep' | 'searching' | 'ringing' | 'connecting' | 'live' | 'ended' | 'error';

export function Call({ flow, onClose, onAgain }: { flow: CallFlow; onClose: () => void; onAgain: () => void }) {
  const { me, session } = useApp();
  const myId = session.user.id;
  const mode = flow.mode;
  const M = MODES[mode];
  const [phase, setPhase] = useState<Phase>('prep');
  const [error, setError] = useState('');
  const [endNote, setEndNote] = useState('');
  const [partner, setPartner] = useState<ProfileCard | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true); // cámara encendida desde el principio, como en OmeTV
  const [fit, setFit] = useState<'contain' | 'cover'>('contain'); // imagen completa, sin zoom
  const [swapped, setSwapped] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [hideRemote, setHideRemote] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<Array<{ id: string; mine: boolean; body: string }>>([]);
  const [chatText, setChatText] = useState('');
  const [liked, setLiked] = useState(false);
  const likedRef = useRef(false);
  const [matched, setMatched] = useState(false);
  const [heartFx, setHeartFx] = useState(0);
  const [autoNext, setAutoNext] = useState(ls.get('zevra-autonext') !== '0');
  const toast = useToast();
  const [secs, setSecs] = useState(0);
  const [callSecs, setCallSecs] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  const localV = useRef<HTMLVideoElement>(null);
  const remoteV = useRef<HTMLVideoElement>(null);
  const remoteA = useRef<HTMLAudioElement>(null);
  const R = useRef({
    peer: null as Peer | null, stream: null as MediaStream | null, mc: null as MediaConnection | null,
    callId: null as string | null, partnerId: null as string | null, inviteId: null as string | null,
    pending: new Map<string, MediaConnection>(), channels: [] as RealtimeChannel[], timers: [] as number[],
    finished: false, live: false, alive: true, run: 0,
    onCall: null as ((mc: MediaConnection) => void) | null,
  });

  const later = (f: () => void, ms: number) => { R.current.timers.push(window.setTimeout(f, ms)); };
  const every = (f: () => void, ms: number) => { R.current.timers.push(window.setInterval(f, ms)); };
  const clearTimers = () => { R.current.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); R.current.timers = []; };
  const dropChannels = () => { R.current.channels.forEach((c) => supabase.removeChannel(c)); R.current.channels = []; };

  const teardown = () => {
    clearTimers(); dropChannels();
    try { R.current.mc?.close(); } catch { /* */ }
    if (R.current.peer && R.current.onCall) R.current.peer.off('call', R.current.onCall);
    R.current.onCall = null;
    stopStream(R.current.stream);
    R.current.mc = null; R.current.peer = null; R.current.stream = null;
  };

  const fail = (msg: string) => {
    if (!R.current.alive) return;
    if (R.current.callId) supabase.rpc('end_call', { p_call: R.current.callId }).then(() => {});
    supabase.rpc('leave_queue').then(() => {});
    teardown(); setError(msg); setPhase('error');
  };

  const finish = async (byMe: boolean): Promise<number> => {
    if (R.current.finished) return 0;
    R.current.finished = true;
    const id = R.current.callId;
    teardown();
    let seconds = 0;
    if (id) {
      const { data } = await supabase.rpc('end_call', { p_call: id });
      seconds = (data as { seconds?: number })?.seconds ?? 0;
    }
    if (!R.current.alive) return seconds;
    setCallSecs(seconds);
    setEndNote(byMe ? 'Has terminado la llamada.' : 'La otra persona ha terminado la llamada.');
    setPhase('ended');
    if (seconds >= RATE_MIN_SECONDS && R.current.partnerId) setRateOpen(true);
    return seconds;
  };

  const attach = (mc: MediaConnection) => {
    R.current.mc = mc;
    setPhase('connecting');
    mc.on('stream', (remote: MediaStream) => {
      // El sonido sale solo por <audio>; el <video> va silenciado (antes sonaba dos veces y causaba eco)
      if (remoteA.current) { remoteA.current.srcObject = remote; remoteA.current.play().catch(() => setNeedsTap(true)); }
      if (remoteV.current) { remoteV.current.srcObject = remote; remoteV.current.play().catch(() => {}); }
      setHasRemoteVideo(remote.getVideoTracks().length > 0);
      if (!R.current.live) { R.current.live = true; setPhase('live'); every(() => setSecs((s) => s + 1), 1000); }
    });
    mc.on('close', () => finish(false));
    mc.on('error', () => (R.current.live ? finish(false) : fail('Se perdió la conexión con la otra persona.')));
    later(() => { if (!R.current.live && !R.current.finished) fail('No se pudo conectar con la otra persona. Puede ser su red: inténtalo de nuevo.'); }, 30000);
  };

  const watchEnd = (callId: string) => {
    const ch = supabase.channel(`call-end-${callId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
        (p) => { if ((p.new as { ended_at?: string }).ended_at) finish(false); })
      .subscribe();
    R.current.channels.push(ch);
  };

  /** Lado que recibe: contesta solo la llamada que corresponde a la sala emparejada. */
  const tryAnswer = () => {
    const id = R.current.callId;
    if (!id || R.current.mc) return;
    const mc = R.current.pending.get(id);
    if (!mc) return;
    R.current.pending.delete(id);
    mc.answer(R.current.stream!);
    attach(mc);
  };

  const matchedAsWaiter = (callId: string, partnerId: string) => {
    if (R.current.callId) return;
    R.current.callId = callId; R.current.partnerId = partnerId;
    loadPartner(partnerId); watchEnd(callId); setPhase('connecting');
    tryAnswer();
    later(() => { if (!R.current.mc && !R.current.finished) fail('La otra persona no llegó a conectarse.'); }, 25000);
  };

  const connectTo = (peerId: string, callId: string, partnerId: string) => {
    R.current.callId = callId; R.current.partnerId = partnerId;
    loadPartner(partnerId); watchEnd(callId);
    const mc = R.current.peer!.call(peerId, R.current.stream!, { metadata: { callId } });
    if (!mc) return fail('No se pudo iniciar la llamada.');
    attach(mc);
  };

  const loadPartner = async (id: string) => {
    const { data } = await supabase.from('profile_cards').select('*').eq('id', id).maybeSingle();
    if (R.current.alive && data) setPartner(data as ProfileCard);
  };

  const search = async () => {
    setPhase('searching');
    const since = new Date(Date.now() - 5000).toISOString();
    const tryMatch = async () => {
      if (R.current.callId || R.current.finished) return;
      const { data, error: e } = await supabase.rpc('find_match', { p_mode: mode, p_peer_id: R.current.peer!.id });
      if (e) return fail(errText(e));
      const d = data as { call_id: string; peer_id: string; partner_id: string } | null;
      if (d && !R.current.callId) { dropChannels(); connectTo(d.peer_id, d.call_id, d.partner_id); }
    };
    const ch = supabase.channel(`match-${myId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `user_a=eq.${myId}` },
        (p) => { const c = p.new as { id: string; user_b: string }; matchedAsWaiter(c.id, c.user_b); })
      .subscribe();
    R.current.channels.push(ch);
    await tryMatch();
    // Respaldo por si el tiempo real tarda: consultar cada 3 s y volver a buscar cada 45 s
    every(async () => {
      if (R.current.callId) return;
      const { data } = await supabase.from('calls').select('id,user_b').eq('user_a', myId).gte('started_at', since).is('ended_at', null)
        .order('started_at', { ascending: false }).limit(1);
      if (data?.[0]) matchedAsWaiter(data[0].id, data[0].user_b);
    }, 3000);
    every(tryMatch, 45000);
  };

  useEffect(() => {
    R.current.alive = true;
    const run = ++R.current.run;
    const stale = () => run !== R.current.run || !R.current.alive;
    (async () => {
      try {
        // Cámara y conexión de señalización en paralelo
        const peerP = openPeer();
        peerP.catch(() => {}); // el error se gestiona más abajo
        const stream = await getLocalStream(mode);
        if (stale()) return stopStream(stream);
        R.current.stream = stream;
        attachLocal();
        const peer = await peerP;
        if (stale()) return;
        R.current.peer = peer;
        const onCall = (mc: MediaConnection) => { const cid = (mc.metadata as { callId?: string })?.callId; if (cid) { R.current.pending.set(cid, mc); tryAnswer(); } };
        R.current.onCall = onCall;
        peer.on('call', onCall);

        if (flow.kind === 'match') await search();
        else if (flow.kind === 'invite-out') {
          setPhase('ringing'); loadPartner(flow.partner);
          const { data, error: e } = await supabase.rpc('invite_call', { p_callee: flow.partner, p_mode: mode, p_peer_id: peer.id });
          if (e) return fail(errText(e));
          R.current.inviteId = data as string;
          const onUpdate = (row: { status: string; call_id: string | null }) => {
            if (row.status === 'accepted' && row.call_id) matchedAsWaiter(row.call_id, flow.partner);
            else if (row.status === 'declined') { teardown(); setEndNote('No puede atenderte ahora.'); setPhase('ended'); }
          };
          const ch = supabase.channel(`invite-${data}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'call_invites', filter: `id=eq.${data}` }, (p) => onUpdate(p.new as never))
            .subscribe();
          R.current.channels.push(ch);
          every(async () => {
            if (R.current.callId) return;
            const { data: row } = await supabase.from('call_invites').select('status,call_id').eq('id', data as string).maybeSingle();
            if (row) onUpdate(row);
          }, 3000);
          later(() => {
            if (!R.current.callId && !R.current.finished) {
              supabase.rpc('cancel_invite', { p_invite: data }).then(() => {});
              teardown(); setEndNote('No ha contestado.'); setPhase('ended');
            }
          }, 60000);
        } else {
          setPhase('connecting');
          const { data, error: e } = await supabase.rpc('answer_invite', { p_invite: flow.inviteId, p_accept: true, p_peer_id: peer.id });
          if (e) return fail(errText(e));
          const d = data as { call_id: string; peer_id: string; partner_id: string };
          connectTo(d.peer_id, d.call_id, d.partner_id);
        }
      } catch (e) {
        const err = e as Error & { type?: string };
        if (err?.type && ['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'].includes(err.type)) {
          fail('No se pudo conectar con el servicio de llamadas. Revisa tu conexión a internet e inténtalo de nuevo.');
        } else if (err?.type === 'browser-incompatible') {
          fail('Este navegador no permite videollamadas. Usa Chrome o Safari actualizados, o la app de Android.');
        } else {
          fail(err?.message && /permiso|cámara|micrófono|https|servicio/i.test(err.message) ? err.message : errText(e));
        }
      }
    })();
    return () => {
      R.current.alive = false;
      if (!R.current.finished) {
        if (R.current.callId) supabase.rpc('end_call', { p_call: R.current.callId }).then(() => {});
        else if (R.current.inviteId) supabase.rpc('cancel_invite', { p_invite: R.current.inviteId }).then(() => {});
        supabase.rpc('leave_queue').then(() => {});
      }
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachLocal = () => {
    const v = localV.current, st = R.current.stream;
    if (v && st && v.srcObject !== st) { v.srcObject = st; v.play().catch(() => {}); }
  };
  // El vídeo propio se vuelve a enganchar al cambiar de fase (antes quedaba en negro al conectar)
  useEffect(attachLocal, [phase, cam]);
  useEffect(() => { R.current.stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic]);
  useEffect(() => { R.current.stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam]);

  const canNext = flow.kind === 'match';
  const next = async () => {
    const secsDone = await finish(true);
    if (secsDone < RATE_MIN_SECONDS) onAgain();
  };
  const hangUp = () => {
    if (phase === 'live' || phase === 'connecting') finish(true);
    else onClose();
  };

  /** Cambiar entre cámara frontal y trasera (en iPhone hay que soltar la anterior primero). */
  const flip = async () => {
    const st = R.current.stream; if (!st) return;
    const nextFacing = facing === 'user' ? 'environment' : 'user';
    const old = st.getVideoTracks()[0];
    try {
      old?.stop();
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const nt = ns.getVideoTracks()[0];
      const sender = R.current.mc?.peerConnection?.getSenders().find((x) => x.track?.kind === 'video' || (!x.track && x.dtmf === null));
      await sender?.replaceTrack(nt);
      if (old) st.removeTrack(old);
      st.addTrack(nt); nt.enabled = cam;
      if (localV.current) { localV.current.srcObject = null; localV.current.srcObject = st; localV.current.play().catch(() => {}); }
      setFacing(nextFacing);
    } catch { toast('No se pudo cambiar de cámara', true); }
  };

  const sendChat = async () => {
    const body = chatText.trim(); const pid = R.current.partnerId;
    if (!body || !pid) return;
    setChatText('');
    setChatMsgs((m) => [...m.slice(-30), { id: `l${Date.now()}`, mine: true, body }]);
    const { error: e } = await supabase.from('messages').insert({ recipient: pid, kind: 'text', body });
    if (e) toast(errText(e), true);
  };

  const like = async () => {
    const pid = R.current.partnerId; if (!pid || liked) return;
    setLiked(true);
    const { data, error: e } = await supabase.rpc('like_user', { p_user: pid });
    if (e) { setLiked(false); toast(errText(e), true); return; }
    if (data) { setMatched(true); toast(`¡Os gustáis! Ya tienes a ${partner?.alias ?? 'esta persona'} en tus chats 💘`); }
    else toast('Le has dado me gusta. Si es mutuo, os avisaremos.');
  };

  // Chat y «me gusta» en tiempo real mientras dura la llamada
  useEffect(() => {
    const pid = partner?.id; if (!pid || phase !== 'live') return;
    const ch = supabase.channel(`incall-${myId}-${pid}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${myId}` }, (p) => {
        const m = p.new as { id: string; sender: string; kind: string; body: string | null };
        if (m.sender === pid && m.kind === 'text' && m.body) { setChatMsgs((xs) => [...xs.slice(-30), { id: m.id, mine: false, body: m.body! }]); setChatOpen(true); }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes', filter: `likee=eq.${myId}` }, (p) => {
        const l = p.new as { liker: string };
        if (l.liker !== pid) return;
        setHeartFx(Date.now());
        if (likedRef.current) { setMatched(true); toast(`¡Os gustáis! 💘`); } else toast(`A ${partner?.alias ?? 'esta persona'} le gustas ❤️`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner?.id, phase]);
  useEffect(() => { likedRef.current = liked; }, [liked]);

  // Si la otra persona se va, buscar a la siguiente automáticamente (como OmeTV)
  useEffect(() => {
    if (phase !== 'ended' || !canNext || !autoNext || rateOpen || callSecs >= RATE_MIN_SECONDS || !endNote.startsWith('La otra')) return;
    const t = setTimeout(onAgain, 1800);
    return () => clearTimeout(t);
  }, [phase, canNext, autoNext, rateOpen, callSecs, endNote, onAgain]);

  const showVideo = mode !== 'voice' && hasRemoteVideo;
  const inCall = phase === 'live' || phase === 'connecting';
  const showLocal = mode !== 'voice' && phase !== 'ended' && phase !== 'error' && phase !== 'prep';
  const mainIsLocal = swapped && phase === 'live' && showVideo;
  const common = partner ? partner.interests.filter((x) => me.interests.includes(x)) : [];
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="full" style={{ background: phase === 'live' && showVideo ? '#000' : 'var(--g-night)' }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t0 = touch.current; touch.current = null;
        if (!t0 || phase !== 'live' || !canNext || chatOpen) return;
        const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
        if (dx < -90 && Math.abs(dy) < 60) next(); // deslizar a la izquierda = siguiente
      }}>
      <audio ref={remoteA} autoPlay playsInline />
      <video ref={remoteV} autoPlay playsInline muted
        className={`${mainIsLocal ? 'pip-video' : 'main-video'} ${hideRemote ? 'blur' : ''}`}
        style={{ display: phase === 'live' && showVideo ? 'block' : 'none', objectFit: mainIsLocal ? 'cover' : fit }}
        onClick={() => mainIsLocal && setSwapped(false)} />
      <video ref={localV} autoPlay playsInline muted
        className={mainIsLocal ? 'main-video' : 'pip-video'}
        style={{ display: showLocal && cam ? 'block' : 'none', objectFit: mainIsLocal ? fit : 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
        onClick={() => phase === 'live' && showVideo && setSwapped(!swapped)} />
      {showLocal && !cam && <div className="pip-video pip-off"><Icon n="videoOff" c="s" /><span>Cámara apagada</span></div>}

      {phase === 'live' && needsTap && (
        <button className="btn primary sm" style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translateX(-50%)', zIndex: 9 }}
          onClick={() => { remoteA.current?.play().then(() => setNeedsTap(false)).catch(() => {}); remoteV.current?.play().catch(() => {}); }}>
          <Icon n="mic" c="s" /> Toca para activar el sonido
        </button>
      )}
      {heartFx > 0 && <div key={heartFx} className="heart-fx" aria-hidden="true">❤️</div>}

      {(phase === 'live' && !showVideo) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div className="orb">{partner && <Avatar id={partner.id} path={partner.avatar_path} size={96} />}</div>
          <div className="h2">{partner?.alias ?? '…'}</div>
          <div className="muted small">{mode === 'voice' ? 'Solo voz' : 'Su cámara está apagada'}</div>
        </div>
      )}

      <div className="call-head">
        <span className="safe-btn" style={{ color: M.text }}><Icon n={M.icon} c="s" /> {M.name}{phase === 'live' && <> · {fmtClock(secs)}</>}</span>
        {inCall && partner && <button className="safe-btn" onClick={() => setReportOpen(true)} aria-label="Denunciar o bloquear"><Icon n="flag" c="s" /> Denunciar</button>}
      </div>

      {/* Herramientas laterales (estilo OmeTV) */}
      {phase === 'live' && (
        <div className="side-tools">
          {mode !== 'voice' && <button className="cc sm" onClick={flip} aria-label="Cambiar de cámara"><Icon n="refresh" c="s" /></button>}
          {showVideo && <button className="cc sm" onClick={() => setFit(fit === 'contain' ? 'cover' : 'contain')} aria-label={fit === 'contain' ? 'Llenar la pantalla' : 'Ver imagen completa'}><Icon n={fit === 'contain' ? 'maximize' : 'minimize'} c="s" /></button>}
          {showVideo && <button className={`cc sm ${hideRemote ? 'off' : ''}`} onClick={() => setHideRemote(!hideRemote)} aria-label={hideRemote ? 'Mostrar su imagen' : 'Difuminar su imagen'}><Icon n={hideRemote ? 'eye' : 'eyeOff'} c="s" /></button>}
          <button className={`cc sm ${chatOpen ? 'off' : ''}`} onClick={() => setChatOpen(!chatOpen)} aria-label="Chat"><Icon n="chat" c="s" /></button>
          <button className={`cc sm ${liked ? 'liked' : ''}`} onClick={like} aria-label="Me gusta" aria-pressed={liked}><Icon n="heart" c="s" /></button>
        </div>
      )}

      {phase === 'live' && partner && (
        <div className="partner-tag">
          <span style={{ fontSize: 15, fontWeight: 800 }}>{partner.alias}{partner.age ? `, ${partner.age}` : ''} {partner.verified && <span style={{ color: 'var(--ok)' }}>✓</span>}{matched && ' 💘'}</span>
          {partner.respect_count > 0 && <span className="row tiny" style={{ gap: 4 }}><Stars value={Number(partner.respect_score)} /> {Number(partner.respect_score).toFixed(1)}</span>}
          {common.length > 0 && <span className="tiny" style={{ color: 'var(--coral-mid)' }}>En común: {common.slice(0, 3).join(', ')}</span>}
        </div>
      )}
      {phase === 'live' && secs >= RATE_MIN_SECONDS - 30 && secs < RATE_MIN_SECONDS && (
        <div className="safe-btn" style={{ position: 'absolute', top: 'calc(60px + var(--st))', left: 16, zIndex: 5, fontSize: 12 }}><Icon n="star" c="s" /> En {RATE_MIN_SECONDS - secs} s podréis valoraros</div>
      )}

      {phase === 'live' && (chatOpen || chatMsgs.length > 0) && (
        <div className="call-chat">
          <div className="call-chat-list">
            {chatMsgs.slice(chatOpen ? -8 : -2).map((m) => <div key={m.id} className={`call-chat-msg ${m.mine ? 'me' : ''}`}>{m.body}</div>)}
          </div>
          {chatOpen && (
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
              <input className="input" style={{ height: 42, background: 'rgba(14,14,16,.8)' }} value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Escribe algo…" aria-label="Mensaje" maxLength={500} autoFocus />
              <button className="cc sm" style={{ background: 'var(--coral)', color: 'var(--ink)' }} aria-label="Enviar" disabled={!chatText.trim()}><Icon n="send" c="s" /></button>
            </form>
          )}
        </div>
      )}

      {(phase === 'prep' || phase === 'searching' || phase === 'ringing' || phase === 'connecting') && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24, textAlign: 'center', pointerEvents: 'none' }}>
          <div className="pulse" style={{ color: M.color }}>
            {partner ? <Avatar id={partner.id} path={partner.avatar_path} size={84} /> : <ZMark size={60} color={M.text} />}
          </div>
          <div>
            <div className="h2" aria-live="polite">
              {phase === 'prep' ? 'Preparando cámara y micrófono…' : phase === 'searching' ? 'Buscando a alguien…' : phase === 'ringing' ? `Llamando a ${partner?.alias ?? '…'}` : `Conectando${partner ? ` con ${partner.alias}` : '…'}`}
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              {phase === 'searching' ? 'Solo tú ves tu cámara mientras buscamos.' : phase === 'ringing' ? 'Esperando a que conteste.' : ''}
            </p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="pad" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          <Icon n="info" c="l" />
          <div className="h2">No se ha podido conectar</div>
          <p className="muted small" style={{ maxWidth: 320 }}>{error}</p>
          <div className="grid" style={{ width: '100%', marginTop: 10 }}>
            <button className="btn primary" onClick={onAgain}>Intentar de nuevo</button>
            <button className="btn" onClick={onClose}>Volver</button>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="pad" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          {partner && <Avatar id={partner.id} path={partner.avatar_path} size={84} />}
          <div className="h2">{partner ? `Llamada con ${partner.alias}` : 'Llamada terminada'}</div>
          <p className="muted small">{endNote}{callSecs > 0 && ` Duración: ${fmtDur(callSecs)}.`}</p>
          {canNext && autoNext && callSecs < RATE_MIN_SECONDS && endNote.startsWith('La otra') && <p className="small" style={{ color: 'var(--coral-mid)', fontWeight: 700 }}>Buscando a la siguiente persona…</p>}
          {partner && callSecs > 0 && callSecs < RATE_MIN_SECONDS && <p className="tiny muted">Las valoraciones de respeto solo están disponibles a partir de 4 minutos.</p>}
          {partner && <p className="notice" style={{ maxWidth: 340 }}><Icon n="chat" c="s" /><span>Ya podéis escribiros por chat cuando queráis.</span></p>}
          <div className="grid" style={{ width: '100%', marginTop: 10 }}>
            {canNext && <button className="btn primary" onClick={onAgain}>Buscar a otra persona</button>}
            {partner && !liked && <button className="btn soft" onClick={like}><Icon n="heart" c="s" /> Me gusta</button>}
            {partner && callSecs >= RATE_MIN_SECONDS && <button className="btn soft" onClick={() => setRateOpen(true)}><Icon n="star" c="s" /> Valorar respeto</button>}
            {canNext && (
              <label className="row small muted" style={{ justifyContent: 'center', gap: 10 }}>
                <span>Siguiente automático</span>
                <button type="button" className="toggle" role="switch" aria-checked={autoNext} onClick={() => { ls.set('zevra-autonext', autoNext ? '0' : '1'); setAutoNext(!autoNext); }} aria-label="Siguiente automático" />
              </label>
            )}
            <button className="btn" onClick={onClose}>Volver al inicio</button>
          </div>
        </div>
      )}

      {(inCall || phase === 'searching' || phase === 'ringing' || phase === 'prep') && (
        <div className="controls">
          {phase !== 'prep' && phase !== 'ringing' && (
            <>
              <button className={`cc ${mic ? '' : 'off'}`} onClick={() => setMic(!mic)} aria-label={mic ? 'Silenciar micrófono' : 'Activar micrófono'} aria-pressed={!mic}><Icon n={mic ? 'mic' : 'micOff'} /></button>
              {mode !== 'voice' && <button className={`cc ${cam ? '' : 'off'}`} onClick={() => setCam(!cam)} aria-label={cam ? 'Apagar cámara' : 'Encender cámara'} aria-pressed={!cam}><Icon n={cam ? 'video' : 'videoOff'} /></button>}
            </>
          )}
          <button className="cc end" onClick={hangUp}><Icon n={inCall ? 'phoneOff' : 'x'} c="s" /> {inCall ? 'Colgar' : 'Salir'}</button>
          {phase === 'live' && canNext && (
            <button className="cc next" onClick={next} aria-label="Siguiente persona"><Icon n="arrowR" /><span className="sr">Siguiente</span></button>
          )}
        </div>
      )}

      {rateOpen && partner && R.current.callId && <RateSheet callId={R.current.callId} partner={partner.id} alias={partner.alias} onClose={() => setRateOpen(false)} />}
      {reportOpen && partner && (
        <ReportSheet userId={partner.id} alias={partner.alias} callId={R.current.callId ?? undefined} onClose={() => setReportOpen(false)}
          onBlocked={() => finish(true)} />
      )}
    </div>
  );
}

/** Aviso de llamada entrante de alguien con quien ya conectaste. */
export function IncomingCall({ inviteId, partner, mode, onAccept, onDecline }: { inviteId: string; partner: ProfileCard | null; mode: CallFlow['mode']; onAccept: () => void; onDecline: () => void }) {
  const M = MODES[mode];
  return (
    <div className="full" style={{ background: 'var(--g-night)', zIndex: 80 }} role="alertdialog" aria-label="Llamada entrante" data-invite={inviteId}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <div className="pulse" style={{ color: M.color }}>{partner && <Avatar id={partner.id} path={partner.avatar_path} size={96} />}</div>
        <div className="label" style={{ color: M.text }}>{M.name} · llamada entrante</div>
        <div className="h1">{partner?.alias ?? 'Alguien'}</div>
        {partner && partner.respect_count > 0 && <div className="row small" style={{ gap: 6 }}><Stars value={Number(partner.respect_score)} /> {Number(partner.respect_score).toFixed(1)} de respeto</div>}
      </div>
      <div className="controls" style={{ gap: 40 }}>
        <button className="cc" style={{ width: 68, height: 68, background: 'var(--coral)', color: 'var(--ink)' }} onClick={onDecline} aria-label="Rechazar"><Icon n="phoneOff" /></button>
        <button className="cc" style={{ width: 68, height: 68, background: 'var(--ok)', color: 'var(--ink)' }} onClick={onAccept} aria-label="Contestar"><Icon n="phone" /></button>
      </div>
    </div>
  );
}

