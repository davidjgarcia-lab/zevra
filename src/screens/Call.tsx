import { useEffect, useRef, useState } from 'react';
import type Peer from 'peerjs';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { errText, supabase, type ProfileCard } from '../lib/supabase';
import { getLocalStream, openPeer, stopStream, type MediaConnection } from '../lib/rtc';
import { Watermark } from '../lib/protect';
import { MODES, useApp, type CallFlow } from '../store';
import { Avatar, Icon, Stars, ZMark, fmtClock, fmtDur } from '../ui';
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
  const [cam, setCam] = useState(mode === 'social');
  const [reveal, setReveal] = useState(mode !== 'intimate');
  const [secs, setSecs] = useState(0);
  const [callSecs, setCallSecs] = useState(0);
  const [rateOpen, setRateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const localV = useRef<HTMLVideoElement>(null);
  const remoteV = useRef<HTMLVideoElement>(null);
  const remoteA = useRef<HTMLAudioElement>(null);
  const R = useRef({
    peer: null as Peer | null, stream: null as MediaStream | null, mc: null as MediaConnection | null,
    callId: null as string | null, partnerId: null as string | null, inviteId: null as string | null,
    pending: new Map<string, MediaConnection>(), channels: [] as RealtimeChannel[], timers: [] as number[],
    finished: false, live: false, alive: true,
  });

  const later = (f: () => void, ms: number) => { R.current.timers.push(window.setTimeout(f, ms)); };
  const every = (f: () => void, ms: number) => { R.current.timers.push(window.setInterval(f, ms)); };
  const clearTimers = () => { R.current.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); R.current.timers = []; };
  const dropChannels = () => { R.current.channels.forEach((c) => supabase.removeChannel(c)); R.current.channels = []; };

  const teardown = () => {
    clearTimers(); dropChannels();
    try { R.current.mc?.close(); } catch { /* */ }
    try { R.current.peer?.destroy(); } catch { /* */ }
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
      if (remoteA.current) { remoteA.current.srcObject = remote; remoteA.current.play().catch(() => {}); }
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
    (async () => {
      try {
        const stream = await getLocalStream(mode);
        if (!R.current.alive) return stopStream(stream);
        R.current.stream = stream;
        if (localV.current) { localV.current.srcObject = stream; localV.current.play().catch(() => {}); }
        const peer = await openPeer();
        if (!R.current.alive) return peer.destroy();
        R.current.peer = peer;
        peer.on('call', (mc) => { const cid = (mc.metadata as { callId?: string })?.callId; if (cid) { R.current.pending.set(cid, mc); tryAnswer(); } });
        peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* */ } });

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
        fail((e as Error)?.message && !/fetch/i.test((e as Error).message) ? (e as Error).message : errText(e));
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

  useEffect(() => { R.current.stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic]);
  useEffect(() => { R.current.stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam]);

  const hangUp = () => {
    if (phase === 'live' || phase === 'connecting') finish(true);
    else onClose();
  };

  const showVideo = mode !== 'voice' && hasRemoteVideo;
  const remoteBlur = mode === 'intimate' && !reveal;

  return (
    <div className="full" style={{ background: phase === 'live' && showVideo ? '#000' : 'var(--g-night)' }}>
      <audio ref={remoteA} autoPlay playsInline />
      <video ref={remoteV} className={`remote-video ${remoteBlur ? 'blur' : ''}`} autoPlay playsInline
        style={{ display: phase === 'live' && showVideo ? 'block' : 'none' }} />
      {phase === 'live' && <Watermark text={me.alias} />}

      {(phase === 'live' && !showVideo) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div className="orb">{partner && <Avatar id={partner.id} path={partner.avatar_path} size={96} />}</div>
          <div className="h2">{partner?.alias ?? '…'}</div>
          <div className="muted small">{mode === 'voice' ? 'Solo voz' : 'Cámara apagada'}</div>
        </div>
      )}

      {phase === 'live' && remoteBlur && showVideo && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4 }}>
          <div className="card center" style={{ background: 'rgba(14,14,16,.82)', maxWidth: 280 }}>
            <Icon n="eyeOff" c="l" />
            <p className="small" style={{ margin: '8px 0 12px' }}>La imagen está desenfocada para protegerte. Muéstrala solo si quieres.</p>
            <button className="btn primary sm" style={{ width: '100%' }} onClick={() => setReveal(true)}>Mostrar imagen</button>
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'connecting') && mode !== 'voice' && (
        <div className="pip" aria-label="Tu cámara">
          <video ref={localV} muted autoPlay playsInline style={{ display: cam ? 'block' : 'none' }} />
          {!cam && <span className="muted">Tu cámara<br />está apagada</span>}
        </div>
      )}
      {!(phase === 'live' || phase === 'connecting') && <video ref={localV} muted autoPlay playsInline style={{ display: 'none' }} />}

      <div className="call-head">
        <span className="safe-btn" style={{ color: M.text }}><Icon n={M.icon} c="s" /> {M.name}{phase === 'live' && <> · {fmtClock(secs)}</>}</span>
        {(phase === 'live' || phase === 'connecting') && partner && (
          <div className="row" style={{ gap: 6 }}>
            <button className="safe-btn" onClick={() => setReportOpen(true)} aria-label="Denunciar o bloquear"><Icon n="flag" c="s" /> Denunciar</button>
          </div>
        )}
      </div>

      {phase === 'live' && partner && showVideo && (
        <div style={{ position: 'absolute', left: 16, bottom: 'calc(100px + var(--sb))', zIndex: 5 }}>
          <div className="safe-btn" style={{ height: 'auto', padding: '8px 12px', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span style={{ fontSize: 15 }}>{partner.alias}{partner.age ? `, ${partner.age}` : ''} {partner.verified && <span style={{ color: 'var(--ok)' }}>✓</span>}</span>
            {partner.respect_count > 0 && <span className="row tiny" style={{ gap: 4 }}><Stars value={Number(partner.respect_score)} /> {Number(partner.respect_score).toFixed(1)}</span>}
          </div>
        </div>
      )}
      {phase === 'live' && secs >= RATE_MIN_SECONDS - 30 && secs < RATE_MIN_SECONDS && (
        <div className="safe-btn" style={{ position: 'absolute', top: 'calc(60px + var(--st))', left: 16, zIndex: 5, fontSize: 12 }}><Icon n="star" c="s" /> En {RATE_MIN_SECONDS - secs} s podréis valoraros</div>
      )}

      {(phase === 'prep' || phase === 'searching' || phase === 'ringing' || phase === 'connecting') && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24, textAlign: 'center' }}>
          <div className="pulse" style={{ color: M.color }}>
            {partner ? <Avatar id={partner.id} path={partner.avatar_path} size={84} /> : <ZMark size={60} color={M.text} />}
          </div>
          <div>
            <div className="h2" aria-live="polite">
              {phase === 'prep' ? 'Preparando cámara y micrófono…' : phase === 'searching' ? 'Buscando a alguien…' : phase === 'ringing' ? `Llamando a ${partner?.alias ?? '…'}` : `Conectando${partner ? ` con ${partner.alias}` : '…'}`}
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              {phase === 'searching' ? 'Nadie ve nada de ti mientras buscamos.' : phase === 'ringing' ? 'Esperando a que conteste.' : mode === 'intimate' ? 'Tu cámara empieza apagada.' : ''}
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
          {partner && callSecs > 0 && callSecs < RATE_MIN_SECONDS && <p className="tiny muted">Las valoraciones de respeto solo están disponibles a partir de 4 minutos.</p>}
          {partner && <p className="notice" style={{ maxWidth: 340 }}><Icon n="chat" c="s" /><span>Ya podéis escribiros por chat cuando queráis.</span></p>}
          <div className="grid" style={{ width: '100%', marginTop: 10 }}>
            {flow.kind === 'match' && <button className="btn primary" onClick={onAgain}>Buscar a otra persona</button>}
            {partner && callSecs >= RATE_MIN_SECONDS && <button className="btn soft" onClick={() => setRateOpen(true)}><Icon n="star" c="s" /> Valorar respeto</button>}
            <button className="btn" onClick={onClose}>Volver al inicio</button>
          </div>
        </div>
      )}

      {(phase === 'live' || phase === 'connecting' || phase === 'searching' || phase === 'ringing' || phase === 'prep') && (
        <div className="controls">
          {phase !== 'searching' && phase !== 'prep' && phase !== 'ringing' && (
            <>
              <button className={`cc ${mic ? '' : 'off'}`} onClick={() => setMic(!mic)} aria-label={mic ? 'Silenciar micrófono' : 'Activar micrófono'} aria-pressed={!mic}><Icon n={mic ? 'mic' : 'micOff'} /></button>
              {mode !== 'voice' && <button className={`cc ${cam ? '' : 'off'}`} onClick={() => setCam(!cam)} aria-label={cam ? 'Apagar cámara' : 'Encender cámara'} aria-pressed={!cam}><Icon n={cam ? 'video' : 'videoOff'} /></button>}
            </>
          )}
          <button className="cc end" onClick={hangUp}><Icon n={phase === 'live' || phase === 'connecting' ? 'phoneOff' : 'x'} c="s" /> {phase === 'live' || phase === 'connecting' ? 'Colgar' : 'Cancelar'}</button>
          {phase === 'live' && flow.kind === 'match' && mode === 'social' && (
            <button className="cc" onClick={async () => { const s = await finish(true); if (s < RATE_MIN_SECONDS) onAgain(); }} aria-label="Siguiente persona"><Icon n="arrowR" /></button>
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

