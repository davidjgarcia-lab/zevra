import { useCallback, useEffect, useState } from 'react';
import { supabase, type CallRow } from '../lib/supabase';
import { FACTS } from '../lib/facts';
import { MODES, useApp } from '../store';
import { InstallBanner } from './Install';
import { Avatar, Icon, fmtDur, timeAgo } from '../ui';
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

export interface Stats { online_12h: number; online_now: number; social: number; voice: number; intimate: number; lives: number }
/** Personas conectadas (datos reales de la base de datos), se refresca cada minuto. */
export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => supabase.rpc('stats_12h').then(({ data }) => {
      const d = data as Partial<Stats> | null;
      if (on && d && typeof d.online_12h === 'number') {
        setStats({ online_12h: d.online_12h, online_now: d.online_now ?? 0, social: d.social ?? 0, voice: d.voice ?? 0, intimate: d.intimate ?? 0, lives: d.lives ?? 0 });
      }
    }, () => {});
    load(); const t = setInterval(load, 60000);
    return () => { on = false; clearInterval(t); };
  }, []);
  return stats;
}
const fmtN = (n: number | undefined) => (n ?? 0).toLocaleString('es-ES');

function FactCard() {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [anim, setAnim] = useState(0);
  const f = FACTS[i];
  const nextFact = () => { setI((x) => (x + 1 + Math.floor(Math.random() * (FACTS.length - 1))) % FACTS.length); setAnim(Date.now()); };
  return (
    <div className="fact-card">
      <div className="between">
        <span className="fact-pill"><Icon n="bulb" c="s" /> ¿Sabías que…?</span>
        <button className="icon-btn" onClick={nextFact} aria-label="Otro dato curioso"><Icon n="refresh" c="s" /></button>
      </div>
      <div key={anim} className="fade">
        <h2 className="h2" style={{ margin: '10px 0 6px' }}>{f.title}</h2>
        <p className="small" style={{ color: 'rgba(246,240,235,.86)' }}>{f.text}</p>
        <p className="tiny" style={{ marginTop: 10, color: 'rgba(246,240,235,.6)' }}>
          Fuente: {f.url ? <a className="link" style={{ color: 'inherit', textDecoration: 'underline' }} href={f.url} target="_blank" rel="noopener">{f.source} ↗</a> : f.source}
        </p>
      </div>
    </div>
  );
}

export function ShopCard({ compact }: { compact?: boolean }) {
  const { go } = useApp();
  return (
    <button className={`shop-card ${compact ? 'compact' : ''}`} onClick={() => go({ name: 'shop' })}>
      <span className="shop-ic"><Icon n="bag" /></span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <b>Tienda</b>
        <span>Bienestar íntimo con códigos exclusivos para ZEVRA</span>
      </span>
      <Icon n="arrowR" />
    </button>
  );
}

export function Home() {
  const { me, go } = useApp();
  const stats = useStats();
  const [rate, setRate] = useState<CallRow | null>(null);
  const { calls, reload } = useMyCalls(10);
  const pending = (calls ?? []).filter((c) => c.can_rate);

  return (
    <div className="pad fade" style={{ paddingBottom: 24 }}>
      <div className="small muted" style={{ marginTop: 4 }}>Hola, <b style={{ color: 'var(--cream)' }}>{me.alias}</b></div>
      <h1 className="h1" style={{ margin: '4px 0 14px' }}>Gente real. <span style={{ color: 'var(--coral)' }}>Conexiones reales.</span></h1>
      <InstallBanner />

      {pending.length > 0 && (
        <button className="notice" style={{ width: '100%', margin: '10px 0' }} onClick={() => setRate(pending[0])}>
          <Icon n="star" c="s" /><span><b>Valora a {pending[0].alias}</b> · ¿fue una persona respetuosa?{pending.length > 1 ? ` (+${pending.length - 1})` : ''}</span>
        </button>
      )}

      <FactCard />

      <div className="stats-card">
        <div className="label" style={{ color: 'var(--coral-mid)', fontSize: 10.5 }}><span className="live-dot" /> En las últimas 12 horas</div>
        <div className="stats-big">{stats ? fmtN(stats.online_12h) : '—'}</div>
        <div className="small muted">{stats && stats.online_12h === 1 ? 'persona se ha conectado a ZEVRA' : 'personas se han conectado a ZEVRA'}{stats && stats.online_now > 0 ? ` · ${fmtN(stats.online_now)} ahora` : ''}</div>
        <div className="stats-grid">
          {(['social', 'voice', 'intimate'] as const).map((m) => (
            <button key={m} className="stats-cell" onClick={() => go({ name: 'tabs', tab: 'connect' })}>
              <Icon n={MODES[m].icon} c="s" />
              <b>{stats ? fmtN(stats[m]) : '—'}</b>
              <span>{MODES[m].title}</span>
            </button>
          ))}
        </div>
        <button className="btn primary" style={{ marginTop: 14 }} onClick={() => go({ name: 'tabs', tab: 'connect' })}><Icon n="shuffle" c="s" /> Conectar ahora</button>
      </div>

      <ShopCard />

      <div className="section-title"><span className="h3">Recientes</span><button className="tiny link" onClick={() => go({ name: 'history' })}>Ver historial</button></div>
      {calls === null ? <div className="skel" style={{ height: 140 }} /> : calls.length === 0 ? (
        <div className="card small muted center">Aquí aparecerán las personas con las que conectes.</div>
      ) : (
        <div className="card" style={{ padding: '4px 12px' }}>
          {calls.slice(0, 4).map((c) => <CallItem key={c.call_id} c={c} onRate={() => setRate(c)} />)}
        </div>
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
