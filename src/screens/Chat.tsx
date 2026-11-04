import { useCallback, useEffect, useRef, useState } from 'react';
import { errText, supabase, type Conversation, type Message, type ProfileCard } from '../lib/supabase';
import { compressImage, MAX_VIDEO_MB, uid, videoExt } from '../lib/media';
import { Watermark } from '../lib/protect';
import { ls, useApp } from '../store';
import { Avatar, Icon, Sheet, Spinner, timeAgo, useToast } from '../ui';
import { EPHEMERAL_PHOTO_SECONDS } from '../config';
import { ReportSheet } from './Sheets';
import { warmUp } from '../lib/rtc';

/* ===================== Lista de conversaciones ===================== */
export function Chats() {
  const { go, session, refreshUnread } = useApp();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_conversations');
    setItems((data as Conversation[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel(`convs-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${session.user.id}` }, () => { load(); refreshUnread(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, session.user.id, refreshUnread]);

  const preview = (c: Conversation) => {
    if (!c.last_kind) return 'Habéis conectado · escribe el primer mensaje';
    const who = c.last_from_me ? 'Tú: ' : '';
    if (c.last_kind === 'image') return `${who}📷 Foto efímera`;
    if (c.last_kind === 'video') return `${who}🎬 Vídeo efímero`;
    return who + (c.last_body ?? '');
  };

  return (
    <div className="pad fade" style={{ paddingBottom: 24 }}>
      <h1 className="h1" style={{ margin: '8px 0 6px' }}>Chat</h1>
      <p className="small muted" style={{ marginBottom: 14 }}>Solo con personas con las que ya has conectado.</p>
      {items === null ? <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 64 }} />)}</div>
        : items.length === 0 ? (
          <div className="card center" style={{ padding: '36px 20px' }}>
            <Icon n="chat" c="l" />
            <div className="h3" style={{ marginTop: 10 }}>Aún no hay conversaciones</div>
            <p className="small muted" style={{ marginTop: 6 }}>Cuando conectes con alguien por vídeo o voz, podréis escribiros aquí.</p>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => go({ name: 'tabs', tab: 'home' })}>Empezar a conectar</button>
          </div>
        ) : (
          <div className="card" style={{ padding: '4px 12px' }}>
            {items.map((c) => (
              <button key={c.partner} className="list-row" onClick={() => go({ name: 'chat', partner: c.partner })}>
                <Avatar id={c.partner} path={c.avatar_path} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="between"><b>{c.alias}</b><span className="tiny muted">{timeAgo(c.last_at)}</span></div>
                  <div className="small" style={{ color: c.unread ? 'var(--cream)' : 'var(--mist)', fontWeight: c.unread ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview(c)}</div>
                </div>
                {c.unread > 0 && <span className="badge" style={{ position: 'static' }}>{c.unread}</span>}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

/* ===================== Conversación ===================== */
export function ChatRoom({ partnerId }: { partnerId: string }) {
  const { session, me, back, go, startCall, refreshUnread } = useApp();
  const myId = session.user.id;
  const toast = useToast();
  const [partner, setPartner] = useState<ProfileCard | null>(null);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [attach, setAttach] = useState(false);
  const [report, setReport] = useState(false);
  const [viewer, setViewer] = useState<{ kind: 'image' | 'video'; url: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const photoIn = useRef<HTMLInputElement>(null);
  const camIn = useRef<HTMLInputElement>(null);
  const videoIn = useRef<HTMLInputElement>(null);
  const recIn = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('messages').select('*')
      .or(`and(sender.eq.${myId},recipient.eq.${partnerId}),and(sender.eq.${partnerId},recipient.eq.${myId})`)
      .order('created_at', { ascending: false }).limit(200);
    setMsgs(((data as Message[]) ?? []).reverse());
    await supabase.rpc('mark_read', { p_partner: partnerId });
    refreshUnread();
  }, [myId, partnerId, refreshUnread]);

  useEffect(() => {
    supabase.from('profile_cards').select('*').eq('id', partnerId).maybeSingle().then(({ data }) => setPartner(data as ProfileCard));
    const warm = window.setTimeout(warmUp, 1500);
    load();
    const upsert = (m: Message) => setMsgs((xs) => {
      if (!xs) return [m];
      const i = xs.findIndex((x) => x.id === m.id);
      if (i >= 0) { const c = xs.slice(); c[i] = m; return c; }
      return [...xs, m];
    });
    const ch = supabase.channel(`room-${myId}-${partnerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${myId}` }, (p) => {
        const m = p.new as Message; if (m.sender !== partnerId) return;
        upsert(m); supabase.rpc('mark_read', { p_partner: partnerId }).then(() => refreshUnread());
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender=eq.${myId}` }, (p) => {
        const m = p.new as Message; if (m.recipient === partnerId) upsert(m);
      })
      .subscribe();
    return () => { clearTimeout(warm); supabase.removeChannel(ch); };
  }, [load, myId, partnerId, refreshUnread]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  const sendText = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    const { data, error } = await supabase.from('messages').insert({ recipient: partnerId, kind: 'text', body }).select().single();
    if (error) { toast(errText(error), true); setText(body); return; }
    setMsgs((xs) => [...(xs ?? []), data as Message]);
  };

  const sendMedia = async (file: File | undefined, kind: 'image' | 'video') => {
    setAttach(false);
    if (!file) return;
    if (kind === 'video' && file.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`El vídeo supera ${MAX_VIDEO_MB} MB. Grábalo más corto.`, true); return; }
    setSending(kind === 'image' ? 'Enviando foto…' : 'Enviando vídeo…');
    try {
      const blob = kind === 'image' ? await compressImage(file) : file;
      const ext = kind === 'image' ? 'jpg' : videoExt(file.type);
      const path = `${myId}/${uid()}.${ext}`;
      const up = await supabase.storage.from('chat-media').upload(path, blob, { contentType: kind === 'image' ? 'image/jpeg' : (file.type || 'video/mp4'), upsert: false });
      if (up.error) throw up.error;
      const { data, error } = await supabase.from('messages').insert({ recipient: partnerId, kind, media_path: path }).select().single();
      if (error) { await supabase.storage.from('chat-media').remove([path]); throw error; }
      setMsgs((xs) => [...(xs ?? []), data as Message]);
      toast(kind === 'image' ? `Foto enviada · se destruye ${EPHEMERAL_PHOTO_SECONDS} s después de abrirla` : 'Vídeo enviado · se elimina al terminar de verlo');
    } catch (e) { toast(errText(e), true); } finally { setSending(null); }
  };

  const openMedia = async (m: Message) => {
    if (opening) return;
    setOpening(m.id);
    try {
      const { data: path, error } = await supabase.rpc('open_media', { p_message: m.id });
      if (error) throw error;
      const dl = await supabase.storage.from('chat-media').download(path as string);
      if (dl.error || !dl.data) throw dl.error ?? new Error('download');
      await supabase.storage.from('chat-media').remove([path as string]); // borrado del servidor al abrir
      setMsgs((xs) => (xs ?? []).map((x) => (x.id === m.id ? { ...x, viewed_at: new Date().toISOString() } : x)));
      setViewer({ kind: m.kind as 'image' | 'video', url: URL.createObjectURL(dl.data) });
    } catch (e) { toast(errText(e), true); load(); } finally { setOpening(null); }
  };

  const closeViewer = () => { if (viewer) URL.revokeObjectURL(viewer.url); setViewer(null); };

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button>
        <button className="row title" style={{ gap: 10, textAlign: 'left' }} onClick={() => go({ name: 'user', id: partnerId })}>
          <Avatar id={partnerId} path={partner?.avatar_path} size={34} />
          <span style={{ minWidth: 0 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{partner?.alias ?? '…'}</span>
            {partner && partner.respect_count > 0 && <span className="tiny muted" style={{ fontWeight: 600 }}>★ {Number(partner.respect_score).toFixed(1)} respeto</span>}</span>
        </button>
        <button className="icon-btn" aria-label="Llamada de voz" onClick={() => startCall({ kind: 'invite-out', mode: 'voice', partner: partnerId })}><Icon n="phone" c="s" /></button>
        <button className="icon-btn" aria-label="Videollamada" onClick={() => startCall({ kind: 'invite-out', mode: 'social', partner: partnerId })}><Icon n="video" c="s" /></button>
        <button className="icon-btn" aria-label="Más opciones" onClick={() => setMenu(true)}><Icon n="more" /></button>
      </header>

      <main className="scroll" style={{ position: 'relative' }}>
        <div className="bubbles">
          <p className="tiny muted center" style={{ margin: '4px 20px 10px' }}>
            <Icon n="flame" c="s" /> Las fotos se destruyen {EPHEMERAL_PHOTO_SECONDS} s después de abrirlas y los vídeos al terminar. Solo se pueden ver una vez.
          </p>
          {msgs === null && <div className="center" style={{ padding: 30, display: 'flex', justifyContent: 'center' }}><Spinner /></div>}
          {msgs?.length === 0 && <p className="small muted center" style={{ padding: 30 }}>Saluda a {partner?.alias ?? 'tu contacto'} 👋</p>}
          {msgs?.map((m, i) => {
            const mine = m.sender === myId;
            const showMeta = i === msgs.length - 1 || msgs[i + 1].sender !== m.sender || new Date(msgs[i + 1].created_at).getTime() - new Date(m.created_at).getTime() > 600000;
            if (m.kind === 'text') return (
              <div key={m.id} style={{ display: 'contents' }}>
                <div className={`bubble ${mine ? 'me' : 'them'}`}>{m.body}</div>
                {showMeta && <div className={`meta ${mine ? 'me' : ''}`}>{timeAgo(m.created_at)}{mine && m.read_at ? ' · Leído' : ''}</div>}
              </div>
            );
            const label = m.kind === 'image' ? 'Foto' : 'Vídeo';
            const used = !!m.viewed_at;
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {mine ? (
                  <div className={`bubble me media ${used ? 'used' : ''}`}><Icon n={m.kind === 'image' ? 'image' : 'film'} c="s" />{label} efímer{m.kind === 'image' ? 'a' : 'o'} · {used ? 'vist' + (m.kind === 'image' ? 'a' : 'o') + ' y eliminad' + (m.kind === 'image' ? 'a' : 'o') : 'sin abrir'}</div>
                ) : used ? (
                  <div className="bubble them media used"><Icon n="flame" c="s" />{label} vist{m.kind === 'image' ? 'a' : 'o'} · eliminad{m.kind === 'image' ? 'a' : 'o'}</div>
                ) : (
                  <button className="bubble them media" style={{ border: '1.5px solid var(--coral)', color: 'var(--coral-mid)' }} onClick={() => openMedia(m)} disabled={!!opening}>
                    {opening === m.id ? <Spinner /> : <Icon n={m.kind === 'image' ? 'image' : 'film'} c="s" />}
                    Toca para ver {m.kind === 'image' ? `la foto · ${EPHEMERAL_PHOTO_SECONDS} s` : 'el vídeo · una vez'}
                  </button>
                )}
                {showMeta && <div className={`meta ${mine ? 'me' : ''}`}>{timeAgo(m.created_at)}</div>}
              </div>
            );
          })}
          {sending && <div className="bubble me media used"><Spinner /> {sending}</div>}
          <div ref={endRef} />
        </div>
      </main>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); sendText(); }}>
        <button type="button" className="icon-btn" aria-label="Enviar foto o vídeo efímero" onClick={() => setAttach(true)} disabled={!!sending}><Icon n="plus" /></button>
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje" aria-label="Mensaje" maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendText(); } }} />
        <button className="icon-btn" style={{ background: text.trim() ? 'var(--coral)' : 'var(--graphite)', color: text.trim() ? 'var(--ink)' : 'var(--mist)' }} aria-label="Enviar" disabled={!text.trim()}><Icon n="send" c="s" /></button>
      </form>

      <input ref={photoIn} type="file" accept="image/*" hidden onChange={(e) => { sendMedia(e.target.files?.[0], 'image'); e.target.value = ''; }} />
      <input ref={camIn} type="file" accept="image/*" capture="user" hidden onChange={(e) => { sendMedia(e.target.files?.[0], 'image'); e.target.value = ''; }} />
      <input ref={videoIn} type="file" accept="video/*" hidden onChange={(e) => { sendMedia(e.target.files?.[0], 'video'); e.target.value = ''; }} />
      <input ref={recIn} type="file" accept="video/*" capture="user" hidden onChange={(e) => { sendMedia(e.target.files?.[0], 'video'); e.target.value = ''; }} />

      {attach && (
        <Sheet onClose={() => setAttach(false)} label="Enviar contenido efímero">
          <h2 className="h2">Enviar contenido efímero</h2>
          <p className="small muted" style={{ margin: '6px 0 14px' }}>Se puede ver una sola vez. Las fotos desaparecen a los {EPHEMERAL_PHOTO_SECONDS} segundos y los vídeos al terminar. Después se borran del servidor.</p>
          <div className="grid">
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => camIn.current?.click()}><Icon n="camera" c="s" /> Hacer foto</button>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => photoIn.current?.click()}><Icon n="image" c="s" /> Elegir foto</button>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => recIn.current?.click()}><Icon n="video" c="s" /> Grabar vídeo</button>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => videoIn.current?.click()}><Icon n="film" c="s" /> Elegir vídeo (máx. {MAX_VIDEO_MB} MB)</button>
          </div>
        </Sheet>
      )}

      {menu && partner && (
        <Sheet onClose={() => setMenu(false)} label="Opciones">
          <div className="grid">
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); go({ name: 'user', id: partnerId }); }}><Icon n="user" c="s" /> Ver perfil</button>
            <button className="btn soft" style={{ justifyContent: 'flex-start' }} onClick={() => {
              setMenu(false);
              if (ls.get(`zevra-consent-${me.id}-intimate`) !== '1') { toast('Primero da tu consentimiento para la modalidad Íntima desde Inicio.', true); return; }
              startCall({ kind: 'invite-out', mode: 'intimate', partner: partnerId });
            }}><Icon n="heart" c="s" /> Llamada íntima (con consentimiento)</button>
            <button className="btn danger" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); setReport(true); }}><Icon n="flag" c="s" /> Denunciar o bloquear</button>
          </div>
        </Sheet>
      )}
      {report && partner && <ReportSheet userId={partnerId} alias={partner.alias} onClose={() => setReport(false)} onBlocked={back} />}
      {viewer && <EphemeralViewer kind={viewer.kind} url={viewer.url} watermark={me.alias} onClose={closeViewer} />}
    </>
  );
}

/* ===================== Visor efímero ===================== */
function EphemeralViewer({ kind, url, watermark, onClose }: { kind: 'image' | 'video'; url: string; watermark: string; onClose: () => void }) {
  const [left, setLeft] = useState(EPHEMERAL_PHOTO_SECONDS);
  const [progress, setProgress] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  const closed = useRef(false);
  const close = useCallback(() => { if (!closed.current) { closed.current = true; onClose(); } }, [onClose]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') close(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', close);
    let t: number | undefined;
    if (kind === 'image') {
      const start = Date.now();
      t = window.setInterval(() => {
        const el = (Date.now() - start) / 1000;
        setLeft(Math.max(0, Math.ceil(EPHEMERAL_PHOTO_SECONDS - el)));
        setProgress(Math.min(1, el / EPHEMERAL_PHOTO_SECONDS));
        if (el >= EPHEMERAL_PHOTO_SECONDS) close();
      }, 100);
    } else {
      vref.current?.play().catch(() => setNeedsTap(true));
    }
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', close); if (t) clearInterval(t); };
  }, [kind, close]);

  return (
    <div className="viewer" role="dialog" aria-label={kind === 'image' ? 'Foto efímera' : 'Vídeo efímero'}>
      <div className="bar" style={{ width: `${progress * 100}%` }} />
      {kind === 'image' ? (
        <>
          <img src={url} alt="Foto efímera" />
          <div className="countdown"><Icon n="flame" c="s" /> {left} s</div>
        </>
      ) : (
        <>
          <video ref={vref} src={url} playsInline autoPlay controls={false} disablePictureInPicture controlsList="nodownload noplaybackrate nofullscreen"
            onEnded={close} onError={close}
            onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }} />
          <div className="countdown"><Icon n="flame" c="s" /> Se elimina al terminar</div>
          {needsTap && <button className="btn primary sm" style={{ position: 'absolute', zIndex: 8 }} onClick={() => { vref.current?.play(); setNeedsTap(false); }}>Reproducir</button>}
        </>
      )}
      <Watermark text={watermark} />
      <button className="icon-btn" style={{ position: 'absolute', top: 'calc(10px + var(--st))', right: 10, zIndex: 8, background: 'rgba(14,14,16,.6)' }} onClick={close} aria-label="Cerrar"><Icon n="x" /></button>
    </div>
  );
}
