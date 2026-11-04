import { useCallback, useEffect, useState } from 'react';
import { errText, GENDERS, supabase, type CallRow, type Gender, type Mode } from '../lib/supabase';
import { MODES, ls, useApp } from '../store';
import { warmUp } from '../lib/rtc';
import { InstallBanner } from './Install';
import { Avatar, Check, Icon, Sheet, fmtDur, timeAgo, useToast } from '../ui';
import { RateSheet } from './Sheets';

export function useMyCalls(limit = 30) {
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_calls', { p_limit: limit });
    setCalls((data as CallRow[]) ?? []);
  }, [limit]);
  useEffect(() => { load(); }, [load]);
  return { calls, reload: load };
}

const CONSENTS: Record<Exclude<Mode, 'social'>, string[]> = {
  voice: ['Entiendo que nadie puede pedirme que encienda la cámara.', 'Puedo colgar en cualquier momento sin dar explicaciones.'],
  intimate: [
    'Soy mayor de edad y quiero ver y mostrar contenido íntimo con otras personas adultas.',
    'Puedo apagar mi cámara, difuminar su imagen o pasar a la siguiente persona en cualquier momento.',
    'Nunca grabaré ni compartiré a nadie. Sé que hacerlo es delito y supone la expulsión.',
  ],
};

/** Personas conectadas ahora mismo (como el contador de OmeTV), con presencia en tiempo real. */
function useOnline(myId: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const ch = supabase.channel('zevra-online', { config: { presence: { key: myId } } });
    ch.on('presence', { event: 'sync' }, () => setN(Object.keys(ch.presenceState()).length))
      .subscribe((st) => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }); });
    return () => { supabase.removeChannel(ch); };
  }, [myId]);
  return n;
}

function Preferences() {
  const { me, refreshMe } = useApp();
  const toast = useToast();
  const [gender, setGender] = useState<Gender | null>(me.gender ?? null);
  const [seeking, setSeeking] = useState<Gender[]>(me.seeking ?? []);
  const save = async (g: Gender | null, s: Gender[]) => {
    setGender(g); setSeeking(s);
    const { error } = await supabase.from('profiles').update({ gender: g, seeking: s }).eq('id', me.id);
    if (error) toast(errText(error), true); else refreshMe();
  };
  const toggle = (g: Gender) => save(gender, seeking.includes(g) ? seeking.filter((x) => x !== g) : [...seeking, g]);
  return (
    <>
      <div className="section-title"><span className="h3">Quiero conocer a</span><span className="tiny muted">{seeking.length ? 'Filtro activo' : 'Todo el mundo'}</span></div>
      <div className="chips">
        <button className={`chip ${seeking.length === 0 ? 'on' : ''}`} aria-pressed={seeking.length === 0} onClick={() => save(gender, [])}>Todos</button>
        {GENDERS.map(([k, , plural]) => <button key={k} className={`chip ${seeking.includes(k) ? 'on' : ''}`} aria-pressed={seeking.includes(k)} onClick={() => toggle(k)}>{plural}</button>)}
      </div>
      {!gender && (
        <div className="notice" style={{ marginTop: 10, flexDirection: 'column', gap: 8 }}>
          <span><b>¿Cómo te identificas?</b> Lo usamos para respetar los filtros de los demás.</span>
          <div className="chips">{GENDERS.map(([k, label]) => <button key={k} className="chip" onClick={() => save(k, seeking)}>{label}</button>)}</div>
        </div>
      )}
    </>
  );
}

export function Home() {
  const { me, startCall, go } = useApp();
  const online = useOnline(me.id);
  const [mode, setMode] = useState<Mode | null>(null);
  const [consentFor, setConsentFor] = useState<Exclude<Mode, 'social'> | null>(null);
  const [checks, setChecks] = useState<boolean[]>([]);
  const [rate, setRate] = useState<CallRow | null>(null);
  const { calls, reload } = useMyCalls(10);
  const pending = (calls ?? []).filter((c) => c.can_rate);
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Buenas noches' : hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches';

  const start = () => {
    if (!mode) return;
    if (mode !== 'social' && ls.get(`zevra-consent-${me.id}-${mode}`) !== '1') { setChecks(CONSENTS[mode].map(() => false)); setConsentFor(mode); return; }
    startCall({ kind: 'match', mode });
  };

  return (
    <div className="pad fade" style={{ paddingBottom: 24 }}>
      <div className="between" style={{ marginTop: 8 }}>
        <div className="label muted">{hello}, {me.alias}</div>
        {online > 0 && <span className="tiny" style={{ color: 'var(--ok)', fontWeight: 800 }}>● {online} {online === 1 ? 'persona conectada' : 'personas conectadas'}</span>}
      </div>
      <InstallBanner />
      <h1 className="h1" style={{ margin: '6px 0 16px' }}>¿Cómo te apetece <span className="serif">conectar</span> hoy?</h1>

      {pending.length > 0 && (
        <button className="notice" style={{ width: '100%', marginBottom: 14 }} onClick={() => setRate(pending[0])}>
          <Icon n="star" c="s" /><span><b>Valora a {pending[0].alias}</b> · ¿fue una persona respetuosa?{pending.length > 1 ? ` (+${pending.length - 1})` : ''}</span>
        </button>
      )}

      <div role="radiogroup" aria-label="Modalidad" className="grid">
        {(Object.keys(MODES) as Mode[]).map((id) => {
          const m = MODES[id], sel = mode === id;
          return (
            <button key={id} className={`mode ${sel ? 'sel' : ''}`} role="radio" aria-checked={sel} onClick={() => { setMode(id); warmUp(); }}
              style={{ borderColor: sel ? m.color : 'transparent', color: m.text, background: id === 'intimate' && sel ? 'linear-gradient(135deg,rgba(255,59,107,.16),rgba(122,77,255,.1)),var(--graphite)' : undefined }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="ic" style={{ background: `${m.color}22`, color: m.text }}><Icon n={m.icon} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="label" style={{ fontSize: 10.5 }}>{m.n} · {m.name}{id !== 'social' && <span style={{ opacity: 0.8 }}> · consentimiento</span>}</div>
                  <div className="h3" style={{ color: 'var(--cream)', marginTop: 2 }}>{m.title}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>{m.desc}</div>
                </div>
                <span className="radio" />
              </div>
            </button>
          );
        })}
      </div>
      <button className="btn primary" style={{ marginTop: 16 }} disabled={!mode} onClick={start}>
        {mode ? <>Empezar en {MODES[mode].name} <Icon n="arrowR" c="s" /></> : 'Elige una modalidad'}
      </button>
      <div className="row small muted" style={{ justifyContent: 'center', marginTop: 10, gap: 6 }}><Icon n="shield" c="s" /> Denunciar y bloquear, siempre a mano en la llamada</div>

      <Preferences />

      <div className="section-title"><span className="h3">Recientes</span><button className="tiny link" onClick={() => go({ name: 'history' })}>Ver historial</button></div>
      {calls === null ? <div className="skel" style={{ height: 140 }} /> : calls.length === 0 ? (
        <div className="card small muted center">Aquí aparecerán las personas con las que conectes.</div>
      ) : (
        <div className="card" style={{ padding: '4px 12px' }}>
          {calls.slice(0, 4).map((c) => <CallItem key={c.call_id} c={c} onRate={() => setRate(c)} />)}
        </div>
      )}

      {consentFor && (
        <Sheet onClose={() => setConsentFor(null)} label="Consentimiento">
          <div className="label" style={{ color: MODES[consentFor].text }}>{MODES[consentFor].n} · {MODES[consentFor].name}</div>
          <h2 className="h2" style={{ margin: '6px 0 14px' }}>Antes de empezar, confirma que…</h2>
          <div className="grid" style={{ gap: 8 }}>
            {CONSENTS[consentFor].map((t, i) => <Check key={i} on={checks[i]} onChange={(v) => setChecks(checks.map((c, j) => (j === i ? v : c)))}>{t}</Check>)}
          </div>
          <p className="tiny muted" style={{ margin: '10px 0 14px' }}>Puedes retirar este consentimiento en Ajustes.</p>
          <button className="btn primary" disabled={!checks.every(Boolean)} onClick={() => {
            ls.set(`zevra-consent-${me.id}-${consentFor}`, '1'); const m = consentFor; setConsentFor(null); startCall({ kind: 'match', mode: m });
          }}>Doy mi consentimiento</button>
        </Sheet>
      )}
      {rate && <RateSheet callId={rate.call_id} partner={rate.partner} alias={rate.alias} onClose={() => { setRate(null); reload(); }} />}
    </div>
  );
}

export function CallItem({ c, onRate }: { c: CallRow; onRate: () => void }) {
  const { go } = useApp();
  const m = MODES[c.mode];
  return (
    <div className="list-row">
      <button className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => go({ name: 'user', id: c.partner })}>
        <Avatar id={c.partner} path={c.avatar_path} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>{c.alias}</div>
          <div className="tiny muted"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: m.color }} /> {m.name} · {fmtDur(c.seconds)} · {timeAgo(c.started_at)}</div>
        </div>
      </button>
      {c.can_rate ? <button className="btn soft sm" onClick={onRate}><Icon n="star" c="s" /> Valorar</button>
        : <button className="icon-btn" aria-label={`Chat con ${c.alias}`} onClick={() => go({ name: 'chat', partner: c.partner })}><Icon n="chat" c="s" /></button>}
    </div>
  );
}

export function History() {
  const { back } = useApp();
  const { calls, reload } = useMyCalls(100);
  const [rate, setRate] = useState<CallRow | null>(null);
  return (
    <>
      <header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button><div className="title">Historial</div></header>
      <main className="scroll"><div className="pad fade" style={{ paddingBottom: 24 }}>
        <p className="small muted" style={{ margin: '4px 0 12px' }}>Puedes valorar el respeto de quien habló contigo 4 minutos o más, durante los 7 días siguientes.</p>
        {calls === null ? <div className="skel" style={{ height: 200 }} /> : calls.length === 0 ? <div className="card small muted center">Todavía no has conectado con nadie.</div> : (
          <div className="card" style={{ padding: '4px 12px' }}>{calls.map((c) => <CallItem key={c.call_id} c={c} onRate={() => setRate(c)} />)}</div>
        )}
      </div></main>
      {rate && <RateSheet callId={rate.call_id} partner={rate.partner} alias={rate.alias} onClose={() => { setRate(null); reload(); }} />}
    </>
  );
}
