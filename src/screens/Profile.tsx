import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errText, forgetPhotoUrl, photoUrl, supabase, type Photo, type ProfileCard } from '../lib/supabase';
import { compressImage, MAX_VIDEO_MB, uid, videoExt } from '../lib/media';
import { useBackHandler } from '../lib/back';
import { useShotContext } from '../lib/shots';
import { isNative } from '../lib/native';
import { INTERESTS, ls, useApp } from '../store';
import { Avatar, Icon, Sheet, Spinner, Stars, Stripes, Toggle, ZLoader, timeAgo, useToast } from '../ui';
import { ConfirmSheet, ReportSheet } from './Sheets';
import { FiltersSheet, useFilters } from './Connect';
import { COUNTRIES, DESIRE_GROUPS, GENDER_LIST, SEXUALITIES, countryName, flag, genderLabel } from '../lib/catalog';
import { InstallButton } from './Install';

/* ---------------- Foto o vídeo con URL firmada ---------------- */
function PhotoTile({ photo, onOpen, locked }: { photo?: Photo; onOpen?: () => void; locked?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; setUrl(null); if (photo && !locked) photoUrl(photo.path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [photo, locked]);
  const isVideo = photo?.kind === 'video';
  return (
    <button className="photo" onClick={onOpen} aria-label={locked ? (isVideo ? 'Vídeo privado bloqueado' : 'Foto privada bloqueada') : isVideo ? 'Ver vídeo' : 'Ver foto'}>
      {locked ? <span className="lock"><Icon n={isVideo ? 'film' : 'lock'} /> {isVideo ? 'Vídeo privado' : 'Privada'}</span>
        : url ? (isVideo ? <video src={`${url}#t=0.5`} muted playsInline preload="metadata" /> : <img src={url} alt="" />)
        : <span className="skel" style={{ position: 'absolute', inset: 0 }} />}
      {isVideo && !locked && <span className="play-badge" aria-hidden="true"><Icon n="film" c="s" /></span>}
      {photo?.is_private && !locked && <span className="tag"><Icon n="lock" c="s" /> Privada</span>}
    </button>
  );
}

/** Visor de fotos y vídeos del perfil (sin marca de agua). */
function PhotoViewer({ photo, onClose, onDelete }: { photo: Photo; onClose: () => void; onDelete?: () => void }) {
  const { me } = useApp();
  useShotContext(photo.owner !== me.id ? photo.owner : null, 'photo');
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { photoUrl(photo.path).then(setUrl); }, [photo.path]);
  useBackHandler(onClose);
  return (
    <div className="viewer" role="dialog" aria-label={photo.kind === 'video' ? 'Vídeo' : 'Foto'}>
      {!url ? <Spinner /> : photo.kind === 'video'
        ? <video src={url} controls autoPlay playsInline controlsList="nodownload" disablePictureInPicture style={{ pointerEvents: 'auto' }} />
        : <img src={url} alt="" />}
      <div className="row" style={{ position: 'absolute', top: 'calc(10px + var(--st))', right: 10, zIndex: 8, gap: 8 }}>
        {onDelete && <button className="icon-btn" style={{ background: 'rgba(14,14,16,.6)' }} onClick={onDelete} aria-label="Eliminar"><Icon n="trash" /></button>}
        <button className="icon-btn" style={{ background: 'rgba(14,14,16,.6)' }} onClick={onClose} aria-label="Cerrar"><Icon n="x" /></button>
      </div>
    </div>
  );
}

/** Portada del perfil: foto elegida por la persona o, si no hay, el degradado de ZEVRA. */
function Cover({ path, seed, children }: { path?: string | null; seed: number; children?: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; setUrl(null); photoUrl(path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [path]);
  return (
    <div className="cover">
      {url ? <img src={url} alt="" /> : <Stripes seed={seed} color="#0E0E10" opacity={0.18} />}
      {children}
    </div>
  );
}

export const respectLevel = (score: number | null | undefined, count: number) => {
  if (!count || score == null) return { label: 'Sin valoraciones todavía', color: 'var(--mist)' };
  const s = Number(score);
  if (s >= 4.5) return { label: 'Muy respetuoso/a', color: 'var(--ok)' };
  if (s >= 3.5) return { label: 'Respetuoso/a', color: '#9fe3b0' };
  if (s >= 2.5) return { label: 'Mejorable', color: 'var(--warn)' };
  return { label: 'Poco respetuoso/a', color: 'var(--coral-mid)' };
};

export function RespectInfoSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="Puntuación de respeto">
      <div className="center" style={{ fontSize: 40 }}>⭐</div>
      <h2 className="h2 center" style={{ margin: '6px 0 10px' }}>¿Qué es la puntuación de respeto?</h2>
      <div className="grid small" style={{ gap: 12 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}><span className="step-n">1</span><span>Cuando hablas con alguien <b>4 minutos o más</b>, al colgar los dos podéis valorar con un toque si la otra persona fue respetuosa.</span></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><span className="step-n">2</span><span>Es <b>anónimo</b>: nadie sabe quién le ha valorado. La media aparece en el perfil.</span></div>
        <div className="row" style={{ alignItems: 'flex-start' }}><span className="step-n">3</span><span>Las personas con <b>mejor puntuación aparecen antes</b> al conectar. Las que reciben malas valoraciones se revisan.</span></div>
      </div>
      <p className="tiny muted center" style={{ margin: '14px 0' }}>Respetar un «no», no presionar y tratar bien a los demás es lo que más cuenta.</p>
      <button className="btn primary" onClick={onClose}>Entendido</button>
    </Sheet>
  );
}

function RespectCard({ card, mine }: { card: ProfileCard; mine?: boolean }) {
  const [info, setInfo] = useState(false);
  const has = card.respect_count > 0;
  const lv = respectLevel(card.respect_score, card.respect_count);
  return (
    <section className="pblock respect-block">
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="pblock-title"><span className="pblock-ic" style={{ background: 'rgba(255,196,107,.15)', color: 'var(--warn)' }}><Icon n="star" c="s" /></span>Puntuación de respeto</span>
        <button className="tiny link" onClick={() => setInfo(true)}>¿Qué es?</button>
      </div>
      <div className="row" style={{ gap: 14 }}>
        <div className="respect-score"><b>{has ? Number(card.respect_score).toFixed(1).replace('.', ',') : '—'}</b><span>de 5</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: lv.color }}>{lv.label}</div>
          {has && <div className="row" style={{ gap: 6, marginTop: 4 }}><Stars value={Number(card.respect_score)} /><span className="tiny muted">{card.respect_count} valoraci{card.respect_count === 1 ? 'ón' : 'ones'}</span></div>}
          <div className="tiny muted" style={{ marginTop: 4 }}>{mine ? 'Te valoran, de forma anónima, las personas con las que hablas 4 minutos o más.' : 'Valoraciones anónimas tras llamadas de 4 minutos o más.'}</div>
        </div>
      </div>
      {info && <RespectInfoSheet onClose={() => setInfo(false)} />}
    </section>
  );
}

const BLOCK_STYLE: Record<string, [string, string, string]> = {
  'Biografía': ['edit', 'rgba(185,164,255,.15)', 'var(--violet-soft)'],
  'Sobre mí': ['edit', 'rgba(185,164,255,.15)', 'var(--violet-soft)'],
  'Identidad': ['user', 'rgba(110,150,255,.15)', '#b9cdff'],
  'Gustos e intereses': ['sparkles', 'rgba(255,196,107,.15)', 'var(--warn)'],
  'Deseos': ['heart', 'rgba(255,59,107,.15)', 'var(--coral-mid)'],
  'Fotos y vídeos': ['image', 'rgba(107,227,166,.12)', 'var(--ok)'],
  'Privacidad': ['shield', 'rgba(185,164,255,.15)', 'var(--violet-soft)'],
  'A quién quiero conocer': ['users', 'rgba(110,150,255,.15)', '#b9cdff'],
  'País': ['globe', 'rgba(107,227,166,.12)', 'var(--ok)'],
  'Edad': ['clock', 'rgba(255,196,107,.15)', 'var(--warn)'],
  'Deseos que busco': ['heart', 'rgba(255,59,107,.15)', 'var(--coral-mid)'],
};
function ProfileBlock({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  const st = BLOCK_STYLE[title.split(' · ')[0]] ?? ['info', 'rgba(246,240,235,.08)', 'var(--cream)'];
  return (
    <section className="pblock">
      <div className="between" style={{ marginBottom: 12 }}>
        <span className="pblock-title"><span className="pblock-ic" style={{ background: st[1], color: st[2] }}><Icon n={st[0]} c="s" /></span>{title}</span>
        {onEdit && <button className="tiny link" onClick={onEdit}>Editar</button>}
      </div>
      {children}
    </section>
  );
}
function InfoRow({ k, v }: { k: string; v: string }) {
  return <div className="list-row between" style={{ minHeight: 44, padding: '8px 0' }}><span className="small muted">{k}</span><b className="small" style={{ textAlign: 'right' }}>{v}</b></div>;
}

/** Preferencias de búsqueda (las mismas que los filtros de Conectar). */
function PrefsSection() {
  const [filters, setFilters] = useFilters();
  const [sheet, setSheet] = useState<null | 'desires' | 'country' | 'age' | 'genders'>(null);
  if (!filters) return <div className="skel" style={{ height: 200 }} />;
  const g = filters.seeking.map((k) => genderLabel(k)).filter(Boolean);
  return (
    <>
      <ProfileBlock title="A quién quiero conocer" onEdit={() => setSheet('genders')}>
        {g.length ? <div className="chips">{g.map((x) => <span key={x} className="chip">{x}</span>)}</div> : <p className="small">Todo el mundo</p>}
      </ProfileBlock>
      <ProfileBlock title="País" onEdit={() => setSheet('country')}>
        <p className="small">{filters.f_country ? `${flag(filters.f_country)} ${countryName(filters.f_country)}` : '🌍 Todo el mundo'}</p>
      </ProfileBlock>
      <ProfileBlock title="Edad" onEdit={() => setSheet('age')}>
        <p className="small">De {filters.f_age_min} a {filters.f_age_max === 99 ? '99+' : filters.f_age_max} años</p>
      </ProfileBlock>
      <ProfileBlock title="Deseos que busco" onEdit={() => setSheet('desires')}>
        {filters.f_desires.length ? <div className="chips">{filters.f_desires.map((x) => <span key={x} className="chip on">{x}</span>)}</div> : <p className="small">Sin filtro de deseos</p>}
      </ProfileBlock>
      <p className="tiny muted">Estas preferencias se usan al conectar: solo te emparejamos con personas que encajan con las tuyas y tú con las suyas.</p>
      {sheet && <FiltersSheet initial={filters} tab={sheet} onClose={() => setSheet(null)} onSaved={(f) => { setFilters(f); setSheet(null); }} />}
    </>
  );
}

function PrivacySection() {
  const { me, refreshMe } = useApp();
  const toast = useToast();
  const set = async (patch: Record<string, unknown>, msg: string) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', me.id);
    if (error) return toast(errText(error), true);
    await refreshMe(); toast(msg);
  };
  return (
    <>
      <ProfileBlock title="Privacidad">
        <div className="list-row between"><span><b className="small">Aparecer en el Showroom</b><span className="tiny muted" style={{ display: 'block' }}>Tu perfil se muestra en el escaparate y puedes emitir en directo</span></span>
          <Toggle on={!!me.showroom} onChange={(v) => set({ showroom: v }, v ? 'Ya apareces en el Showroom' : 'Ya no apareces en el Showroom')} label="Aparecer en el Showroom" /></div>
        <div className="list-row between"><span className="small">Fecha de nacimiento y DNI</span><span className="tiny" style={{ color: 'var(--ok)' }}>Nunca se muestran</span></div>
        <div className="list-row between"><span className="small">Fotos privadas</span><span className="tiny muted">Solo con tu permiso</span></div>
      </ProfileBlock>
      <p className="tiny muted">En la app de Android las capturas de pantalla están bloqueadas.</p>
    </>
  );
}

/* ===================== Mi perfil ===================== */
export function MyProfile() {
  const { me, session, go, refreshMe, refreshRequests } = useApp();
  const myId = session.user.id;
  const toast = useToast();
  const [tab, setTab] = useState<'public' | 'private' | 'requests'>('public');
  const [section, setSection] = useState<'about' | 'identity' | 'prefs' | 'photos' | 'privacy'>('about');
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [reqs, setReqs] = useState<Array<{ viewer: string; status: string; created_at: string; alias?: string; avatar_path?: string | null }>>([]);
  const [view, setView] = useState<Photo | null>(null);
  const [del, setDel] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const pubIn = useRef<HTMLInputElement>(null);
  const privIn = useRef<HTMLInputElement>(null);
  const avIn = useRef<HTMLInputElement>(null);
  const coverIn = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('photos').select('*').eq('owner', myId).order('created_at', { ascending: false });
    setPhotos((data as Photo[]) ?? []);
    const { data: r } = await supabase.from('photo_access').select('viewer,status,created_at').eq('owner', myId).order('created_at', { ascending: false });
    const rows = (r ?? []) as Array<{ viewer: string; status: string; created_at: string }>;
    if (rows.length) {
      const { data: ps } = await supabase.from('profiles').select('id,alias,avatar_path').in('id', rows.map((x) => x.viewer));
      const map = new Map((ps ?? []).map((p) => [p.id, p]));
      setReqs(rows.map((x) => ({ ...x, alias: map.get(x.viewer)?.alias, avatar_path: map.get(x.viewer)?.avatar_path })));
    } else setReqs([]);
    refreshRequests();
  }, [myId, refreshRequests]);
  useEffect(() => { load(); }, [load]);

  const upload = async (file: File | undefined, priv: boolean) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) { toast(`El vídeo supera ${MAX_VIDEO_MB} MB. Recórtalo o grábalo más corto.`, true); return; }
    setBusy(true);
    try {
      const blob = isVideo ? file : await compressImage(file);
      const ext = isVideo ? videoExt(file.type) : 'jpg';
      const path = `${myId}/${priv ? 'private' : 'public'}/${uid()}.${ext}`;
      const up = await supabase.storage.from('photos').upload(path, blob, { contentType: isVideo ? (file.type || 'video/mp4') : 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('photos').insert({ path, is_private: priv, kind: isVideo ? 'video' : 'image' });
      if (error) { await supabase.storage.from('photos').remove([path]); throw error; }
      toast(isVideo ? (priv ? 'Vídeo privado añadido' : 'Vídeo público añadido') : (priv ? 'Foto privada añadida' : 'Foto pública añadida'));
      load();
    } catch (e) { toast(errText(e), true); } finally { setBusy(false); }
  };

  const setCover = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, 1400);
      const path = `${myId}/cover/${uid()}.jpg`;
      const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const old = me.cover_path;
      const { error } = await supabase.from('profiles').update({ cover_path: path }).eq('id', myId);
      if (error) throw error;
      if (old) { await supabase.storage.from('photos').remove([old]); forgetPhotoUrl(old); }
      await refreshMe(); toast('Portada actualizada');
    } catch (e) { toast(errText(e), true); } finally { setBusy(false); }
  };

  const setAvatar = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, 800);
      const path = `${myId}/avatar/${uid()}.jpg`;
      const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const old = me.avatar_path;
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', myId);
      if (error) throw error;
      if (old) { await supabase.storage.from('photos').remove([old]); forgetPhotoUrl(old); }
      await refreshMe(); toast('Foto de perfil actualizada');
    } catch (e) { toast(errText(e), true); } finally { setBusy(false); }
  };

  const removePhoto = async (p: Photo) => {
    const { error } = await supabase.from('photos').delete().eq('id', p.id);
    if (error) return toast(errText(error), true);
    await supabase.storage.from('photos').remove([p.path]); forgetPhotoUrl(p.path);
    setView(null); toast('Foto eliminada'); load();
  };

  const decide = async (viewer: string, status: 'approved' | 'denied' | 'revoke') => {
    const q = status === 'revoke'
      ? supabase.from('photo_access').delete().eq('owner', myId).eq('viewer', viewer)
      : supabase.from('photo_access').update({ status, decided_at: new Date().toISOString() }).eq('owner', myId).eq('viewer', viewer);
    const { error } = await q;
    if (error) return toast(errText(error), true);
    toast(status === 'approved' ? 'Acceso concedido' : status === 'denied' ? 'Solicitud rechazada' : 'Acceso retirado');
    load();
  };

  const list = (photos ?? []).filter((p) => p.is_private === (tab === 'private'));
  const pending = reqs.filter((r) => r.status === 'pending');

  return (
    <div className="fade" style={{ paddingBottom: 24 }}>
      <Cover path={me.cover_path} seed={91}>
        <button className="cover-edit" onClick={() => coverIn.current?.click()} aria-label="Cambiar foto de portada"><Icon n="camera" c="s" /> Portada</button>
      </Cover>
      <div className="pad" style={{ marginTop: -44, position: 'relative' }}>
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <button style={{ border: '4px solid var(--ink)', borderRadius: '50%', display: 'inline-flex', position: 'relative' }} onClick={() => avIn.current?.click()} aria-label="Cambiar foto de perfil">
            <Avatar id={myId} path={me.avatar_path} size={88} />
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: 'var(--coral)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="camera" c="s" /></span>
          </button>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn soft sm" onClick={() => go({ name: 'edit' })}><Icon n="edit" c="s" /> Editar</button>
            <button className="icon-btn" style={{ background: 'var(--graphite)' }} onClick={() => go({ name: 'settings' })} aria-label="Ajustes"><Icon n="settings" c="s" /></button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          <h1 className="h1" style={{ fontSize: 26 }}>{me.alias}{me.age ? `, ${me.age}` : ''}</h1>
          {me.country && <span className="small" title={countryName(me.country)}>{flag(me.country)} {countryName(me.country)}</span>}
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {me.verified && <span className="badge-pill ok"><Icon n="badgeCheck" c="s" /> Edad verificada</span>}
          {me.verified && <span className="badge-pill blue"><Icon n="shieldCheck" c="s" /> Perfil verificado</span>}
          {me.showroom && <span className="badge-pill coral"><Icon n="sparkles" c="s" /> En el Showroom</span>}
          {me.created_at && <span className="badge-pill"><Icon n="clock" c="s" /> Desde {new Date(me.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>}
        </div>

        <div className="stats3">
          <div><b>{me.connections}</b><span>Conexiones</span></div>
          <div><b>{me.likes_received ?? 0}</b><span>Me gusta</span></div>
          <div><b>{me.respect_count ? Number(me.respect_score).toFixed(1).replace('.', ',') : '—'}</b><span>Respeto</span></div>
        </div>

        <div className="seg-tabs" role="tablist">
          {([['about', 'Sobre mí'], ['identity', 'Identidad'], ['prefs', 'Preferencias'], ['photos', `Fotos${pending.length ? ` · ${pending.length}` : ''}`], ['privacy', 'Privacidad']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={section === k} className={section === k ? 'on' : ''} onClick={() => setSection(k)}>{l}</button>
          ))}
        </div>

        {section === 'about' && (
          <>
            <ProfileBlock title="Biografía" onEdit={() => go({ name: 'edit' })}>
              {me.bio ? <p className="small">{me.bio}</p> : <p className="small muted">Aún no has escrito nada. Es opcional: tú decides qué compartes.</p>}
            </ProfileBlock>
            <ProfileBlock title="Gustos e intereses" onEdit={() => go({ name: 'edit' })}>
              {me.interests.length ? <div className="chips">{me.interests.map((x) => <span key={x} className="chip">{x}</span>)}</div> : <p className="small muted">Añade tus intereses para encontrar afinidades.</p>}
            </ProfileBlock>
            <ProfileBlock title="Deseos" onEdit={() => go({ name: 'edit' })}>
              {me.desires?.length ? <div className="chips">{me.desires.map((x) => <span key={x} className="chip on">{x}</span>)}</div> : <p className="small muted">Cuenta qué buscas: amistad, citas, juego de rol, poliamor…</p>}
            </ProfileBlock>
            <RespectCard card={me} mine />
          </>
        )}

        {section === 'identity' && (
          <ProfileBlock title="Identidad" onEdit={() => go({ name: 'edit' })}>
            <InfoRow k="Me identifico como" v={genderLabel(me.gender) || '—'} />
            <InfoRow k="Orientación" v={me.sexuality || '—'} />
            <InfoRow k="Pronombres" v={me.pronouns || '—'} />
            <InfoRow k="País" v={me.country ? `${flag(me.country)} ${countryName(me.country)}` : '—'} />
            <InfoRow k="Edad" v={me.age ? `${me.age} años · verificada con DNI` : '—'} />
          </ProfileBlock>
        )}

        {section === 'prefs' && <PrefsSection />}

        {section === 'privacy' && <PrivacySection />}

        {section === 'photos' && (
          <>
        <div className="tabs" role="tablist" style={{ margin: '4px 0 12px' }}>
          <button role="tab" aria-selected={tab === 'public'} className={tab === 'public' ? 'on' : ''} onClick={() => setTab('public')}>Públicas</button>
          <button role="tab" aria-selected={tab === 'private'} className={tab === 'private' ? 'on' : ''} onClick={() => setTab('private')}>Privadas</button>
          <button role="tab" aria-selected={tab === 'requests'} className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Solicitudes{pending.length ? ` (${pending.length})` : ''}</button>
        </div>

        {tab !== 'requests' ? (
          <>
            <p className="tiny muted" style={{ marginBottom: 10 }}>{tab === 'public' ? 'Fotos y vídeos que ve cualquier persona verificada que visite tu perfil.' : 'Solo los ve quien tú apruebes, durante 12 horas. Los demás ven un candado y pueden pedirte acceso.'}</p>
            <div className="photo-grid">
              <button className="photo" style={{ border: '1.5px dashed var(--smoke)', flexDirection: 'column', gap: 4, color: 'var(--mist)', fontSize: 11, fontWeight: 800 }}
                onClick={() => (tab === 'public' ? pubIn : privIn).current?.click()} disabled={busy} aria-label={`Añadir foto o vídeo ${tab === 'public' ? 'público' : 'privado'}`}>
                {busy ? <Spinner /> : <><Icon n="plus" /> Añadir</>}
              </button>
              {photos === null ? [0, 1].map((i) => <div key={i} className="photo skel" />) : list.map((p) => <PhotoTile key={p.id} photo={p} onOpen={() => setView(p)} />)}
            </div>
          </>
        ) : (
          <>
            <p className="tiny muted" style={{ marginBottom: 10 }}>Personas que quieren ver tus fotos privadas. Tú decides, y puedes retirar el acceso cuando quieras.</p>
            {reqs.length === 0 ? <div className="card small muted center">No tienes solicitudes.</div> : (
              <div className="card" style={{ padding: '4px 12px' }}>
                {reqs.map((r) => (
                  <div key={r.viewer} className="list-row">
                    <button className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => go({ name: 'user', id: r.viewer })}>
                      <Avatar id={r.viewer} path={r.avatar_path} size={40} />
                      <div style={{ minWidth: 0 }}><b>{r.alias ?? 'Usuario'}</b>
                        <div className="tiny muted">{r.status === 'pending' ? `Pide acceso · ${timeAgo(r.created_at)}` : r.status === 'approved' ? 'Puede ver tus privadas' : 'Rechazada'}</div></div>
                    </button>
                    {r.status === 'pending' ? (
                      <div className="row" style={{ gap: 6 }}>
                        <button className="icon-btn" style={{ background: 'var(--graphite)' }} onClick={() => decide(r.viewer, 'denied')} aria-label={`Rechazar a ${r.alias}`}><Icon n="x" c="s" /></button>
                        <button className="icon-btn" style={{ background: 'var(--coral)', color: 'var(--ink)' }} onClick={() => decide(r.viewer, 'approved')} aria-label={`Aprobar a ${r.alias}`}><Icon n="check" c="s" /></button>
                      </div>
                    ) : <button className="btn soft sm" onClick={() => decide(r.viewer, 'revoke')}>{r.status === 'approved' ? 'Retirar' : 'Borrar'}</button>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
          </>
        )}
        <button className="btn ghost" style={{ marginTop: 18 }} onClick={() => go({ name: 'user', id: myId })}><Icon n="eye" c="s" /> Ver mi perfil como lo ven los demás</button>
      </div>
      <input ref={pubIn} type="file" accept="image/*,video/*" hidden onChange={(e) => { upload(e.target.files?.[0], false); e.target.value = ''; }} />
      <input ref={privIn} type="file" accept="image/*,video/*" hidden onChange={(e) => { upload(e.target.files?.[0], true); e.target.value = ''; }} />
      <input ref={avIn} type="file" accept="image/*" hidden onChange={(e) => { setAvatar(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={coverIn} type="file" accept="image/*" hidden onChange={(e) => { setCover(e.target.files?.[0]); e.target.value = ''; }} />
      {view && <PhotoViewer photo={view} onClose={() => setView(null)} onDelete={() => setDel(view)} />}
      {del && <ConfirmSheet title="¿Eliminar esta foto?" text="Se borrará para siempre." confirm="Eliminar" danger onConfirm={() => removePhoto(del)} onClose={() => setDel(null)} />}
    </div>
  );
}

/* ===================== Perfil de otra persona ===================== */
export function UserProfile({ id }: { id: string }) {
  const { me, session, back, go } = useApp();
  const myId = session.user.id;
  const own = id === myId;
  const toast = useToast();
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [access, setAccess] = useState<{ status: string; decided_at: string | null } | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<Photo | null>(null);
  const [report, setReport] = useState(false);
  const [mediaTab, setMediaTab] = useState<'public' | 'private'>('public');
  useShotContext(own ? null : id, 'profile');
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const [{ data: c }, { data: ph }, { data: a }, { data: conn }] = await Promise.all([
      supabase.from('profile_cards').select('*').eq('id', id).maybeSingle(),
      supabase.from('photos').select('*').eq('owner', id).order('created_at', { ascending: false }),
      supabase.from('photo_access').select('status,decided_at').eq('owner', id).eq('viewer', myId).maybeSingle(),
      supabase.rpc('have_connected', { a: myId, b: id }),
    ]);
    setCard(c as ProfileCard); setPhotos((ph as Photo[]) ?? []); setConnected(!!conn);
    setAccess(own ? { status: 'approved', decided_at: new Date().toISOString() } : (a as { status: string; decided_at: string | null } | null));
  }, [id, myId, own]);
  useEffect(() => { load(); }, [load]);

  // En cuanto la otra persona aprueba o retira el permiso, se actualiza al momento (antes había que esperar)
  useEffect(() => {
    if (own) return;
    const ch = supabase.channel(`access-${myId}-${id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_access', filter: `viewer=eq.${myId}` }, (p) => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { owner?: string };
        if (row?.owner !== id) return;
        photos.filter((x) => x.is_private).forEach((x) => forgetPhotoUrl(x.path));
        load();
        if ((p.new as { status?: string })?.status === 'approved') toast('¡Ya puedes ver sus fotos y vídeos privados!');
      })
      .subscribe();
    const t = setInterval(() => tick((x) => x + 1), 60000); // refrescar el tiempo restante
    return () => { supabase.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, myId, own, load]);

  const request = async () => {
    // Si había un permiso caducado o rechazado, se sustituye por una solicitud nueva
    if (access) await supabase.from('photo_access').delete().eq('owner', id).eq('viewer', myId);
    const { error } = await supabase.from('photo_access').insert({ owner: id, viewer: myId });
    if (error) return toast(errText(error), true);
    setAccess({ status: 'pending', decided_at: null }); toast(`Solicitud enviada a ${card?.alias}`);
  };
  const cancel = async () => {
    await supabase.from('photo_access').delete().eq('owner', id).eq('viewer', myId);
    setAccess(null);
  };

  if (!card) return (<><header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button></header><div className="center" style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><ZLoader /></div></>);
  const pub = photos.filter((p) => !p.is_private), priv = photos.filter((p) => p.is_private);
  const expiresAt = access?.status === 'approved' && access.decided_at ? new Date(access.decided_at).getTime() + 12 * 3600e3 : 0;
  const canSee = own || (access?.status === 'approved' && expiresAt > Date.now());
  const expired = !own && access?.status === 'approved' && expiresAt <= Date.now();
  const left = Math.max(0, expiresAt - Date.now());
  const leftTxt = left > 3600e3 ? `${Math.floor(left / 3600e3)} h ${Math.floor((left % 3600e3) / 60000)} min` : `${Math.ceil(left / 60000)} min`;
  const list = mediaTab === 'public' ? pub : priv;
  const commonDesires = !own && (me.desires ?? []).some((d) => (card.desires ?? []).includes(d));

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button>
        <div className="title">{own ? 'Así te ven los demás' : card.alias}</div>
        {!own && <button className="icon-btn" onClick={() => setReport(true)} aria-label="Denunciar o bloquear"><Icon n="flag" c="s" /></button>}
      </header>
      <main className="scroll"><div className="fade" style={{ paddingBottom: 30 }}>
        <Cover path={card.cover_path} seed={id.charCodeAt(0) + 7} />
        <div className="pad" style={{ marginTop: -46, position: 'relative' }}>
          <div className="between" style={{ alignItems: 'flex-end' }}>
            <span className="avatar-ring"><Avatar id={card.id} path={card.avatar_path} size={92} />{card.online && <span className="online-dot big" title="En línea" />}</span>
            {!own && connected && <button className="btn primary sm" onClick={() => go({ name: 'chat', partner: id })}><Icon n="chat" c="s" /> Mensaje</button>}
          </div>
          <h1 className="h1" style={{ fontSize: 26, marginTop: 10 }}>{card.alias}{card.age ? `, ${card.age}` : ''}</h1>
          <div className="row small" style={{ gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
            {card.country && <span>{flag(card.country)} {countryName(card.country)}</span>}
            {card.online ? <span style={{ color: 'var(--ok)', fontWeight: 800 }}>● En línea</span> : null}
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {card.verified && <span className="badge-pill ok"><Icon n="badgeCheck" c="s" /> Edad verificada</span>}
            {card.verified && <span className="badge-pill blue"><Icon n="shieldCheck" c="s" /> Perfil verificado</span>}
            {card.showroom && <span className="badge-pill coral"><Icon n="sparkles" c="s" /> Showroom</span>}
          </div>
          <div className="stats3">
            <div><b>{card.connections}</b><span>Conexiones</span></div>
            <div><b>{card.likes_received ?? 0}</b><span>Me gusta</span></div>
            <div><b style={{ color: respectLevel(card.respect_score, card.respect_count).color }}>{card.respect_count ? Number(card.respect_score).toFixed(1).replace('.', ',') : '—'}</b><span>Respeto</span></div>
          </div>

          <div className="pstack">
            {card.bio && <ProfileBlock title="Sobre mí"><p className="small">{card.bio}</p></ProfileBlock>}

            {(card.gender || card.sexuality || card.pronouns) && (
              <ProfileBlock title="Identidad">
                {card.gender && <InfoRow k="Se identifica como" v={genderLabel(card.gender)} />}
                {card.sexuality && <InfoRow k="Orientación" v={card.sexuality} />}
                {card.pronouns && <InfoRow k="Pronombres" v={card.pronouns} />}
              </ProfileBlock>
            )}

            <ProfileBlock title="Fotos y vídeos">
              <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
                <button role="tab" aria-selected={mediaTab === 'public'} className={mediaTab === 'public' ? 'on' : ''} onClick={() => setMediaTab('public')}>Públicos · {pub.length}</button>
                <button role="tab" aria-selected={mediaTab === 'private'} className={mediaTab === 'private' ? 'on' : ''} onClick={() => setMediaTab('private')}><Icon n="lock" c="s" /> Privados · {priv.length}</button>
              </div>
              {list.length === 0 ? <p className="small muted center" style={{ padding: '14px 0' }}>{mediaTab === 'public' ? 'Sin fotos ni vídeos públicos.' : 'Sin fotos ni vídeos privados.'}</p>
                : <div className="photo-grid">{list.map((p) => <PhotoTile key={p.id} photo={p} locked={p.is_private && !canSee} onOpen={() => (!p.is_private || canSee) && setView(p)} />)}</div>}
              {mediaTab === 'private' && priv.length > 0 && !own && (
                <div style={{ marginTop: 12 }}>
                  {(access === null || expired) && <button className="btn secondary" onClick={request}><Icon n="unlock" c="s" /> {expired ? 'Tu acceso caducó · pedir de nuevo' : 'Pedir ver sus fotos y vídeos privados'}</button>}
                  {access?.status === 'pending' && <div className="notice"><Icon n="clock" c="s" /><span style={{ flex: 1 }}>Solicitud enviada. Te avisaremos en cuanto {card.alias} decida.</span><button className="tiny link" onClick={cancel}>Cancelar</button></div>}
                  {access?.status === 'denied' && <div className="notice coral"><Icon n="lock" c="s" /><span>{card.alias} ha preferido no compartirlos.</span></div>}
                  {canSee && <div className="notice ok"><Icon n="unlock" c="s" /><span>Puedes verlos durante <b>{leftTxt}</b> más.</span></div>}
                </div>
              )}
            </ProfileBlock>

            {card.interests.length > 0 && (
              <ProfileBlock title="Gustos e intereses">
                <div className="chips">{card.interests.map((x) => <span key={x} className={`chip ${!own && me.interests.includes(x) ? 'on' : ''}`}>{x}</span>)}</div>
              </ProfileBlock>
            )}
            {card.desires && card.desires.length > 0 && (
              <ProfileBlock title={commonDesires ? 'Deseos · tenéis cosas en común' : 'Deseos'}>
                <div className="chips">{card.desires.map((x) => <span key={x} className={`chip ${!own && (me.desires ?? []).includes(x) ? 'on' : ''}`}>{x}</span>)}</div>
              </ProfileBlock>
            )}
            <RespectCard card={card} />
          </div>
        </div>
      </div></main>
      {view && <PhotoViewer photo={view} onClose={() => setView(null)} />}
      {report && <ReportSheet userId={id} alias={card.alias} onClose={() => setReport(false)} onBlocked={back} />}
    </>
  );
}

/* ===================== Editar perfil ===================== */
export function EditProfile() {
  const { me, back, refreshMe, session } = useApp();
  const toast = useToast();
  const [alias, setAlias] = useState(me.alias);
  const [bio, setBio] = useState(me.bio);
  const [pronouns, setPronouns] = useState(me.pronouns);
  const [gender, setGender] = useState<string>(me.gender ?? '');
  const [sexuality, setSexuality] = useState<string>(me.sexuality ?? '');
  const [country, setCountry] = useState<string>(me.country ?? '');
  const [interests, setInterests] = useState<string[]>(me.interests);
  const [desires, setDesires] = useState<string[]>(me.desires ?? []);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (arr: string[], v: string, max: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].slice(0, max));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (alias.trim().length < 2) return setErr('El alias debe tener al menos 2 caracteres.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      alias: alias.trim(), bio: bio.trim(), pronouns, interests, gender: gender || null,
      sexuality: sexuality || null, country: country || null, desires,
    }).eq('id', session.user.id);
    setBusy(false);
    if (error) return setErr(errText(error));
    await refreshMe(); toast('Perfil guardado'); back();
  };
  return (
    <>
      <header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button><div className="title">Editar perfil</div></header>
      <main className="scroll"><form className="pad fade" onSubmit={save} style={{ paddingBottom: 30 }}>
        <div className="label muted" style={{ margin: '4px 0 10px' }}>Sobre mí</div>
        <label className="field"><span>Alias</span><input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={20} /></label>
        <label className="field"><span>Biografía · {bio.length}/160</span><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="Cuéntales algo de ti" /></label>
        <div className="field"><span>Gustos e intereses (hasta 8)</span>
          <div className="chips">{INTERESTS.map((x) => <button type="button" key={x} className={`chip ${interests.includes(x) ? 'on' : ''}`} aria-pressed={interests.includes(x)} onClick={() => setInterests(toggle(interests, x, 8))}>{x}</button>)}</div></div>

        <div className="label muted" style={{ margin: '20px 0 10px' }}>Identidad</div>
        <label className="field"><span>Me identifico como</span>
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Prefiero no decirlo</option>
            {GENDER_LIST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="field"><span>Orientación</span>
          <select className="input" value={sexuality} onChange={(e) => setSexuality(e.target.value)}>
            <option value="">Prefiero no decirlo</option>
            {SEXUALITIES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select></label>
        <label className="field"><span>Pronombres</span>
          <select className="input" value={pronouns} onChange={(e) => setPronouns(e.target.value)}>
            {['', 'ella', 'él', 'elle', 'ella/elle', 'él/elle'].map((p) => <option key={p} value={p}>{p || 'Prefiero no decirlo'}</option>)}
          </select></label>
        <label className="field"><span>País</span>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Sin indicar</option>
            {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{flag(c)} {n}</option>)}
          </select></label>

        <div className="label muted" style={{ margin: '20px 0 4px' }}>Deseos (hasta 12)</div>
        <p className="tiny muted" style={{ marginBottom: 6 }}>Se muestran en tu perfil y sirven para que los filtros de los demás te encuentren.</p>
        {DESIRE_GROUPS.map((g) => (
          <div key={g.title} style={{ marginTop: 12 }}>
            <div className="small" style={{ fontWeight: 800, marginBottom: 8 }}>{g.title}</div>
            <div className="chips">{g.items.map((d) => <button type="button" key={d} className={`chip ${desires.includes(d) ? 'on' : ''}`} aria-pressed={desires.includes(d)} onClick={() => setDesires(toggle(desires, d, 12))}>{d}</button>)}</div>
          </div>
        ))}
        {err && <p className="err" style={{ marginTop: 14 }}>{err}</p>}
        <button className="btn primary" style={{ marginTop: 20, position: 'sticky', bottom: 10 }} disabled={busy}>Guardar cambios</button>
      </form></main>
    </>
  );
}

/* ===================== Ajustes ===================== */
export function Settings() {
  const { back, session, me } = useApp();
  const toast = useToast();
  const [blocked, setBlocked] = useState<Array<{ blocked: string; alias?: string }>>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [consent, setConsent] = useState({ voice: ls.get(`zevra-consent-${me.id}-voice`) === '1', intimate: ls.get(`zevra-consent-${me.id}-intimate`) === '1' });
  const [info, setInfo] = useState(false);

  const loadBlocks = useCallback(async () => {
    const { data } = await supabase.from('blocks').select('blocked').eq('blocker', session.user.id);
    const rows = (data ?? []) as Array<{ blocked: string }>;
    if (!rows.length) return setBlocked([]);
    const { data: ps } = await supabase.from('profiles').select('id,alias').in('id', rows.map((r) => r.blocked));
    const m = new Map((ps ?? []).map((p) => [p.id, p.alias]));
    setBlocked(rows.map((r) => ({ ...r, alias: m.get(r.blocked) })));
  }, [session.user.id]);
  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const unblock = async (id: string) => { await supabase.from('blocks').delete().eq('blocker', session.user.id).eq('blocked', id); toast('Desbloqueado'); loadBlocks(); };
  const setC = (k: 'voice' | 'intimate', v: boolean) => { ls.set(`zevra-consent-${me.id}-${k}`, v ? '1' : '0'); setConsent({ ...consent, [k]: v }); if (!v) toast('Consentimiento retirado'); };
  const deleteAccount = async () => {
    // Borrar primero sus archivos (fotos, avatar y medios de chat sin abrir)
    try {
      const uid = session.user.id;
      const paths: string[] = [];
      for (const sub of ['public', 'private', 'avatar']) {
        const { data } = await supabase.storage.from('photos').list(`${uid}/${sub}`, { limit: 1000 });
        (data ?? []).forEach((f) => paths.push(`${uid}/${sub}/${f.name}`));
      }
      if (paths.length) await supabase.storage.from('photos').remove(paths);
      const { data: chat } = await supabase.storage.from('chat-media').list(uid, { limit: 1000 });
      if (chat?.length) await supabase.storage.from('chat-media').remove(chat.map((f) => `${uid}/${f.name}`));
    } catch { /* si falla, se borra igualmente la cuenta */ }
    const { error } = await supabase.rpc('delete_my_account');
    if (error) return toast(errText(error), true);
    await supabase.auth.signOut(); toast('Tu cuenta se ha eliminado');
  };

  return (
    <>
      <header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button><div className="title">Ajustes</div></header>
      <main className="scroll"><div className="pad fade" style={{ paddingBottom: 30 }}>
        <div style={{ margin: '8px 0 16px' }}><InstallButton variant="row" /></div>
        <div className="label muted" style={{ margin: '8px 0' }}>Cuenta</div>
        <div className="card" style={{ padding: '4px 14px' }}>
          <div className="list-row between"><span>Email</span><span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user.email}</span></div>
          <div className="list-row between"><span>Acceso con</span><span className="small muted">{session.user.app_metadata?.provider === 'google' ? 'Google' : 'Email y contraseña'}</span></div>
          <div className="list-row between"><span>Edad</span><span className="small" style={{ color: 'var(--ok)' }}>Verificada con DNI</span></div>
        </div>

        <div className="label muted" style={{ margin: '20px 0 8px' }}>Consentimientos</div>
        <div className="card" style={{ padding: '4px 14px' }}>
          <div className="list-row between"><span>Modalidad Voz</span><Toggle on={consent.voice} onChange={(v) => setC('voice', v)} label="Consentimiento Voz" /></div>
          <div className="list-row between"><span>Modalidad Íntima</span><Toggle on={consent.intimate} onChange={(v) => setC('intimate', v)} label="Consentimiento Íntima" /></div>
        </div>

        <div className="label muted" style={{ margin: '20px 0 8px' }}>Privacidad</div>
        <button className="card row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setInfo(true)}>
          <Icon n="shield" /><span style={{ flex: 1 }}><b>Protección contra capturas</b><span className="tiny muted" style={{ display: 'block' }}>{isNative ? 'Activada: capturas y grabaciones bloqueadas' : 'Parcial en el navegador · total en la app de Android'}</span></span><Icon n="chevR" c="s" />
        </button>

        <div className="label muted" style={{ margin: '20px 0 8px' }}>Personas bloqueadas</div>
        {blocked.length === 0 ? <div className="card small muted">No has bloqueado a nadie.</div> : (
          <div className="card" style={{ padding: '4px 14px' }}>{blocked.map((b) => (
            <div key={b.blocked} className="list-row between"><span>{b.alias ?? 'Usuario'}</span><button className="btn soft sm" onClick={() => unblock(b.blocked)}>Desbloquear</button></div>
          ))}</div>
        )}

        <div className="grid" style={{ marginTop: 24 }}>
          <button className="btn soft" onClick={() => supabase.auth.signOut()}><Icon n="logout" c="s" /> Cerrar sesión</button>
          <button className="btn danger" onClick={() => setConfirmDel(true)}><Icon n="trash" c="s" /> Eliminar mi cuenta</button>
        </div>
        <p className="tiny muted center" style={{ marginTop: 16 }}><a className="link" href="/condiciones" target="_blank" rel="noopener">Condiciones</a> · <a className="link" href="/privacidad" target="_blank" rel="noopener">Privacidad</a><br />ZEVRA 1.0 · Solo para mayores de 18 años</p>
      </div></main>
      {confirmDel && <ConfirmSheet title="¿Eliminar tu cuenta?" text="Se borrarán tu perfil, tus fotos, tus mensajes y tus valoraciones. No se puede deshacer." confirm="Eliminar definitivamente" danger onConfirm={deleteAccount} onClose={() => setConfirmDel(false)} />}
      {info && (
        <Sheet onClose={() => setInfo(false)} label="Protección contra capturas">
          <h2 className="h2">Protección contra capturas</h2>
          <div className="grid small" style={{ marginTop: 12, gap: 12 }}>
            <div className="row" style={{ alignItems: 'flex-start' }}><Icon n="check" c="s" /><span><b>App de Android:</b> las capturas y grabaciones de pantalla salen en negro en toda la app.</span></div>
            <div className="row" style={{ alignItems: 'flex-start' }}><Icon n="info" c="s" /><span><b>iPhone y navegador:</b> el sistema no permite bloquearlas. ZEVRA oculta el contenido al salir de la app, pone una marca de agua con el alias de quien mira y borra fotos y vídeos efímeros tras verlos.</span></div>
            <div className="row" style={{ alignItems: 'flex-start' }}><Icon n="flag" c="s" /><span>Capturar o difundir a alguien supone la expulsión y puede ser delito. Denúncialo si ocurre.</span></div>
          </div>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={() => setInfo(false)}>Entendido</button>
        </Sheet>
      )}
    </>
  );
}
