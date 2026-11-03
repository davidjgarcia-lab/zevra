import { useCallback, useEffect, useState } from 'react';
import { supabase, type CallRow, type Mode } from '../lib/supabase';
import { MODES, ls, useApp } from '../store';
import { Avatar, Check, Icon, Sheet, fmtDur, timeAgo } from '../ui';
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
    'Mi cámara empieza apagada y la imagen de la otra persona llega desenfocada hasta que yo decida.',
    'Nunca grabaré ni compartiré a nadie. Sé que hacerlo es delito y supone la expulsión.',
  ],
};

export function Home() {
  const { me, startCall, go } = useApp();
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
      <div className="label muted" style={{ marginTop: 8 }}>{hello}, {me.alias}</div>
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
            <button key={id} className={`mode ${sel ? 'sel' : ''}`} role="radio" aria-checked={sel} onClick={() => setMode(id)}
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
