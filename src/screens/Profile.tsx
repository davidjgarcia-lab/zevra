import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errText, forgetPhotoUrl, photoUrl, supabase, type Photo, type ProfileCard } from '../lib/supabase';
import { compressImage, uid } from '../lib/media';
import { Watermark } from '../lib/protect';
import { isNative } from '../lib/native';
import { INTERESTS, ls, useApp } from '../store';
import { Avatar, Icon, Sheet, Spinner, Stars, Stripes, Toggle, timeAgo, useToast } from '../ui';
import { ConfirmSheet, ReportSheet } from './Sheets';
import { FiltersSheet, useFilters } from './Connect';
import { COUNTRIES, DESIRE_GROUPS, GENDER_LIST, SEXUALITIES, countryName, flag, genderLabel } from '../lib/catalog';
import { InstallButton } from './Install';

/* ---------------- Foto con URL firmada ---------------- */
function PhotoTile({ photo, onOpen, locked }: { photo?: Photo; onOpen?: () => void; locked?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; if (photo && !locked) photoUrl(photo.path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [photo, locked]);
  return (
    <button className="photo" onClick={onOpen} aria-label={locked ? 'Foto privada bloqueada' : 'Ver foto'}>
      {locked ? <span className="lock"><Icon n="lock" /> Privada</span> : url ? <img src={url} alt="" /> : <span className="skel" style={{ position: 'absolute', inset: 0 }} />}
      {photo?.is_private && !locked && <span className="tag"><Icon n="lock" c="s" /> Privada</span>}
    </button>
  );
}

function PhotoViewer({ photo, watermark, onClose, onDelete }: { photo: Photo; watermark: string; onClose: () => void; onDelete?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { photoUrl(photo.path).then(setUrl); }, [photo.path]);
  return (
    <div className="viewer" role="dialog" aria-label="Foto">
      {url ? <img src={url} alt="" /> : <Spinner />}
      <Watermark text={watermark} />
      <div className="row" style={{ position: 'absolute', top: 'calc(10px + var(--st))', right: 10, zIndex: 8, gap: 8 }}>
        {onDelete && <button className="icon-btn" style={{ background: 'rgba(14,14,16,.6)' }} onClick={onDelete} aria-label="Eliminar foto"><Icon n="trash" /></button>}
        <button className="icon-btn" style={{ background: 'rgba(14,14,16,.6)' }} onClick={onClose} aria-label="Cerrar"><Icon n="x" /></button>
      </div>
    </div>
  );
}

function RespectCard({ card, mine }: { card: ProfileCard; mine?: boolean }) {
  const has = card.respect_count > 0;
  return (
    <div className="card" style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,196,107,.1)', color: 'var(--warn)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <b style={{ fontSize: 22, lineHeight: 1 }}>{has ? Number(card.respect_score).toFixed(1).replace('.', ',') : '—'}</b>
        <span className="tiny" style={{ opacity: 0.8 }}>de 5</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label muted" style={{ fontSize: 10 }}>Puntuación de respeto</div>
        {has ? <div className="row" style={{ gap: 6, marginTop: 4 }}><Stars value={Number(card.respect_score)} /><span className="tiny muted">{card.respect_count} valoraci{card.respect_count === 1 ? 'ón' : 'ones'}</span></div>
          : <div className="small" style={{ marginTop: 4 }}>{mine ? 'Aún sin valoraciones' : 'Todavía no tiene valoraciones'}</div>}
        <div className="tiny muted" style={{ marginTop: 4 }}>La dan, de forma anónima, las personas con las que habló 4 minutos o más.</div>
      </div>
    </div>
  );
}


function ProfileBlock({ title, onEdit, children }: { title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <section className="pblock">
      <div className="between" style={{ marginBottom: 10 }}><span className="label muted" style={{ fontSize: 10.5 }}>{title}</span>{onEdit && <button className="tiny link" onClick={onEdit}>Editar</button>}</div>
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
    setBusy(true);
    try {
      const blob = await compressImage(file);
      const path = `${myId}/${priv ? 'private' : 'public'}/${uid()}.jpg`;
      const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('photos').insert({ path, is_private: priv });
      if (error) throw error;
      toast(priv ? 'Foto privada añadida' : 'Foto pública añadida');
      load();
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
      <div style={{ height: 110, position: 'relative', background: 'var(--g-coral)', overflow: 'hidden' }}><Stripes seed={91} color="#0E0E10" opacity={0.18} /></div>
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
            <p className="tiny muted" style={{ marginBottom: 10 }}>{tab === 'public' ? 'Las ve cualquier persona verificada que visite tu perfil.' : 'Solo las ve quien tú apruebes. Los demás ven un candado y pueden pedirte acceso.'}</p>
            <div className="photo-grid">
              <button className="photo" style={{ border: '1.5px dashed var(--smoke)', flexDirection: 'column', gap: 4, color: 'var(--mist)', fontSize: 11, fontWeight: 800 }}
                onClick={() => (tab === 'public' ? pubIn : privIn).current?.click()} disabled={busy} aria-label={`Añadir foto ${tab === 'public' ? 'pública' : 'privada'}`}>
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
      <input ref={pubIn} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0], false); e.target.value = ''; }} />
      <input ref={privIn} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0], true); e.target.value = ''; }} />
      <input ref={avIn} type="file" accept="image/*" hidden onChange={(e) => { setAvatar(e.target.files?.[0]); e.target.value = ''; }} />
      {view && <PhotoViewer photo={view} watermark={me.alias} onClose={() => setView(null)} onDelete={() => setDel(view)} />}
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
  const [access, setAccess] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<Photo | null>(null);
  const [report, setReport] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: ph }, { data: a }, { data: conn }] = await Promise.all([
      supabase.from('profile_cards').select('*').eq('id', id).maybeSingle(),
      supabase.from('photos').select('*').eq('owner', id).order('created_at', { ascending: false }),
      supabase.from('photo_access').select('status').eq('owner', id).eq('viewer', myId).maybeSingle(),
      supabase.rpc('have_connected', { a: myId, b: id }),
    ]);
    setCard(c as ProfileCard); setPhotos((ph as Photo[]) ?? []); setAccess(own ? 'approved' : (a?.status ?? null)); setConnected(!!conn);
  }, [id, myId, own]);
  useEffect(() => { load(); }, [load]);

  const request = async () => {
    const { error } = await supabase.from('photo_access').insert({ owner: id, viewer: myId });
    if (error) return toast(errText(error), true);
    setAccess('pending'); toast(`Solicitud enviada a ${card?.alias}`);
  };
  const cancel = async () => {
    await supabase.from('photo_access').delete().eq('owner', id).eq('viewer', myId);
    setAccess(null);
  };

  if (!card) return (<><header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button></header><div className="center" style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div></>);
  const pub = photos.filter((p) => !p.is_private), priv = photos.filter((p) => p.is_private);
  const canSee = access === 'approved';

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button>
        <div className="title">{own ? 'Así te ven los demás' : card.alias}</div>
        {!own && <button className="icon-btn" onClick={() => setReport(true)} aria-label="Denunciar o bloquear"><Icon n="flag" c="s" /></button>}
      </header>
      <main className="scroll"><div className="pad fade" style={{ paddingBottom: 30 }}>
        <div className="row" style={{ gap: 14, marginTop: 6 }}>
          <span style={{ position: 'relative', display: 'inline-flex' }}><Avatar id={card.id} path={card.avatar_path} size={88} />{card.online && <span className="online-dot big" title="En línea" />}</span>
          <div style={{ minWidth: 0 }}>
            <h1 className="h2">{card.alias}{card.age ? `, ${card.age}` : ''}</h1>
            {card.country && <div className="small" style={{ marginTop: 2 }}>{flag(card.country)} {countryName(card.country)}</div>}
            <div className="tiny muted" style={{ marginTop: 2 }}>{card.online ? <span style={{ color: 'var(--ok)', fontWeight: 800 }}>● En línea</span> : `${card.connections} conexiones`}</div>
          </div>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {card.verified && <span className="badge-pill ok"><Icon n="badgeCheck" c="s" /> Edad verificada</span>}
          {card.verified && <span className="badge-pill blue"><Icon n="shieldCheck" c="s" /> Perfil verificado</span>}
          {card.showroom && <span className="badge-pill coral"><Icon n="sparkles" c="s" /> Showroom</span>}
        </div>
        <div className="stats3">
          <div><b>{card.connections}</b><span>Conexiones</span></div>
          <div><b>{card.likes_received ?? 0}</b><span>Me gusta</span></div>
          <div><b>{card.respect_count ? Number(card.respect_score).toFixed(1).replace('.', ',') : '—'}</b><span>Respeto</span></div>
        </div>
        {card.bio && <ProfileBlock title="Sobre mí"><p className="small">{card.bio}</p></ProfileBlock>}
        {(card.gender || card.sexuality || card.pronouns) && (
          <ProfileBlock title="Identidad">
            {card.gender && <InfoRow k="Se identifica como" v={genderLabel(card.gender)} />}
            {card.sexuality && <InfoRow k="Orientación" v={card.sexuality} />}
            {card.pronouns && <InfoRow k="Pronombres" v={card.pronouns} />}
          </ProfileBlock>
        )}
        {card.interests.length > 0 && (
          <ProfileBlock title="Gustos e intereses">
            <div className="chips">{card.interests.map((x) => <span key={x} className={`chip ${!own && me.interests.includes(x) ? 'on' : ''}`}>{x}</span>)}</div>
          </ProfileBlock>
        )}
        {card.desires && card.desires.length > 0 && (
          <ProfileBlock title={!own && (me.desires ?? []).some((d) => card.desires!.includes(d)) ? 'Deseos · tenéis cosas en común' : 'Deseos'}>
            <div className="chips">{card.desires.map((x) => <span key={x} className={`chip ${!own && (me.desires ?? []).includes(x) ? 'on' : ''}`}>{x}</span>)}</div>
          </ProfileBlock>
        )}
        <RespectCard card={card} />
        {!own && connected && (
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn primary" onClick={() => go({ name: 'chat', partner: id })}><Icon n="chat" c="s" /> Chat</button>
          </div>
        )}

        <div className="section-title"><span className="h3">Fotos públicas</span><span className="tiny muted">{pub.length}</span></div>
        {pub.length === 0 ? <div className="card small muted center">Sin fotos públicas.</div> : <div className="photo-grid">{pub.map((p) => <PhotoTile key={p.id} photo={p} onOpen={() => setView(p)} />)}</div>}

        <div className="section-title"><span className="h3">Fotos privadas</span><span className="tiny muted">{priv.length}</span></div>
        {priv.length === 0 ? <div className="card small muted center">Sin fotos privadas.</div> : (
          <>
            <div className="photo-grid">{priv.map((p) => <PhotoTile key={p.id} photo={p} locked={!canSee} onOpen={() => canSee && setView(p)} />)}</div>
            {!own && (
              <div style={{ marginTop: 12 }}>
                {access === null && <button className="btn secondary" onClick={request}><Icon n="unlock" c="s" /> Pedir ver sus fotos privadas</button>}
                {access === 'pending' && <div className="notice"><Icon n="clock" c="s" /><span style={{ flex: 1 }}>Solicitud enviada. {card.alias} decidirá si te da acceso.</span><button className="tiny link" onClick={cancel}>Cancelar</button></div>}
                {access === 'denied' && <div className="notice coral"><Icon n="lock" c="s" /><span>{card.alias} ha preferido no compartir sus fotos privadas.</span></div>}
                {access === 'approved' && <div className="notice ok"><Icon n="unlock" c="s" /><span>{card.alias} te ha dado acceso a sus fotos privadas.</span></div>}
              </div>
            )}
          </>
        )}
      </div></main>
      {view && <PhotoViewer photo={view} watermark={me.alias} onClose={() => setView(null)} />}
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
