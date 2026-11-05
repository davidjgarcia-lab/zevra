import { useEffect, useMemo, useState } from 'react';
import { errText, supabase, type Mode } from '../lib/supabase';
import { COUNTRIES, DESIRE_GROUPS, GENDER_LIST, countryName, flag } from '../lib/catalog';
import { warmUp } from '../lib/rtc';
import { MODES, ls, useApp } from '../store';
import { Check, Icon, Sheet, useToast } from '../ui';
import { useStats } from './Home';

const CONSENTS: Record<Exclude<Mode, 'social'>, string[]> = {
  voice: [
    'Soy mayor de edad y quiero mantener conversaciones íntimas por voz con otras personas adultas.',
    'Nadie puede pedirme que encienda la cámara y puedo colgar en cualquier momento.',
  ],
  intimate: [
    'Soy mayor de edad y quiero ver y mostrar contenido íntimo con otras personas adultas.',
    'Puedo apagar mi cámara, difuminar su imagen o pasar a la siguiente persona en cualquier momento.',
    'Nunca grabaré ni compartiré a nadie. Sé que hacerlo es delito y supone la expulsión.',
  ],
};

export interface Filters { seeking: string[]; f_country: string | null; f_age_min: number; f_age_max: number; f_desires: string[] }
const EMPTY: Filters = { seeking: [], f_country: null, f_age_min: 18, f_age_max: 99, f_desires: [] };

export function useFilters() {
  const { me } = useApp();
  const [filters, setFilters] = useState<Filters | null>(null);
  useEffect(() => {
    supabase.from('profiles').select('seeking,f_country,f_age_min,f_age_max,f_desires').eq('id', me.id).maybeSingle()
      .then(({ data }) => setFilters({ ...EMPTY, ...(data as Partial<Filters> | null) }));
  }, [me.id]);
  return [filters, setFilters] as const;
}

export function Connect() {
  const { me, startCall } = useApp();
  const stats = useStats();
  const [mode, setMode] = useState<Mode | null>(null);
  const [consentFor, setConsentFor] = useState<Exclude<Mode, 'social'> | null>(null);
  const [checks, setChecks] = useState<boolean[]>([]);
  const [filters, setFilters] = useFilters();
  const [sheet, setSheet] = useState<null | 'desires' | 'country' | 'age' | 'genders'>(null);

  const start = () => {
    if (!mode) return;
    if (mode !== 'social' && ls.get(`zevra-consent-${me.id}-${mode}`) !== '1') { setChecks(CONSENTS[mode].map(() => false)); setConsentFor(mode); return; }
    startCall({ kind: 'match', mode });
  };

  const f = filters ?? EMPTY;
  const chips: Array<[typeof sheet, string, boolean]> = [
    ['desires', f.f_desires.length ? `Deseos · ${f.f_desires.length}` : 'Deseos', f.f_desires.length > 0],
    ['country', f.f_country ? `${flag(f.f_country)} ${countryName(f.f_country)}` : '🌍 Todo el mundo', !!f.f_country],
    ['age', `Edad ${f.f_age_min}–${f.f_age_max}`, f.f_age_min > 18 || f.f_age_max < 99],
    ['genders', f.seeking.length ? `${f.seeking.length} géneros` : 'Todos los géneros', f.seeking.length > 0],
  ];

  return (
    <div className="connect">
      <div className="filter-bar" role="toolbar" aria-label="Filtros de búsqueda">
        <span className="filter-ic"><Icon n="filter" c="s" /></span>
        {chips.map(([k, label, on]) => (
          <button key={k} className={`filter-chip ${on ? 'on' : ''}`} onClick={() => setSheet(k)}>{label} <span aria-hidden="true">▾</span></button>
        ))}
      </div>

      <div className="mode-list" role="radiogroup" aria-label="Modalidad">
        {(Object.keys(MODES) as Mode[]).map((id) => {
          const m = MODES[id], sel = mode === id;
          return (
            <button key={id} className={`mode2 ${sel ? 'sel' : ''} m-${id}`} role="radio" aria-checked={sel}
              onClick={() => { setMode(id); warmUp(); }} style={{ borderColor: sel ? m.color : undefined }}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <span className="mode2-ic" style={{ background: id === 'social' ? 'var(--cream)' : m.color, color: id === 'social' ? 'var(--ink)' : '#fff' }}><Icon n={m.icon} /></span>
                <span className="row" style={{ gap: 8 }}>
                  <span className="count-pill"><span className="live-dot" /> {stats ? (stats[id] ?? 0).toLocaleString('es-ES') : '—'} hoy</span>
                  <span className="tiny muted" style={{ fontWeight: 800 }}>{m.n}</span>
                  <span className="radio2" style={{ borderColor: sel ? m.color : undefined }}>{sel && <i style={{ background: m.color }} />}</span>
                </span>
              </div>
              <div className="mode2-title">{m.title}</div>
              <div className="mode2-desc">{m.desc}</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {m.tags.map((t) => <span key={t} className={`tag2 ${t.includes('+18') ? 'adult' : ''}`}>{t}</span>)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="connect-cta">
        <button className="btn primary" disabled={!mode} onClick={start}>
          {mode ? <>Empezar · {MODES[mode].title} <Icon n="arrowR" c="s" /></> : <>Elige una modalidad <Icon n="arrowR" c="s" /></>}
        </button>
      </div>

      {sheet && filters && <FiltersSheet initial={filters} tab={sheet} onClose={() => setSheet(null)} onSaved={(nf) => { setFilters(nf); setSheet(null); }} />}

      {consentFor && (
        <Sheet onClose={() => setConsentFor(null)} label="Consentimiento">
          <div className="label" style={{ color: MODES[consentFor].text }}>{MODES[consentFor].n} · {MODES[consentFor].title}</div>
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
    </div>
  );
}

/** Filtros de búsqueda al estilo Feeld: deseos, país, edad y géneros. Se guardan en tu perfil. */
export function FiltersSheet({ initial, tab: tab0, onClose, onSaved }: { initial: Filters; tab: 'desires' | 'country' | 'age' | 'genders'; onClose: () => void; onSaved: (f: Filters) => void }) {
  const { me } = useApp();
  const toast = useToast();
  const [tab, setTab] = useState(tab0);
  const [f, setF] = useState<Filters>(initial);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const countries = useMemo(() => COUNTRIES.filter(([c, n]) => !q || n.toLowerCase().includes(q.toLowerCase()) || c === q.toUpperCase()), [q]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      seeking: f.seeking, f_country: f.f_country, f_age_min: f.f_age_min, f_age_max: Math.max(f.f_age_min, f.f_age_max), f_desires: f.f_desires,
    }).eq('id', me.id);
    setBusy(false);
    if (error) return toast(errText(error), true);
    toast('Filtros guardados'); onSaved(f);
  };

  return (
    <Sheet onClose={onClose} label="Filtros">
      <div className="seg" role="tablist">
        {([['desires', 'Deseos'], ['country', 'País'], ['age', 'Edad'], ['genders', 'Géneros']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="filter-body">
        {tab === 'desires' && (
          <>
            <p className="small muted" style={{ marginBottom: 6 }}>Conecta solo con personas que compartan al menos uno de estos deseos. Sin marcar, con todo el mundo.</p>
            {DESIRE_GROUPS.map((g) => (
              <div key={g.title} style={{ marginTop: 14 }}>
                <div className="h3" style={{ marginBottom: 8 }}>{g.title}</div>
                <div className="chips">{g.items.map((d) => (
                  <button key={d} className={`chip big ${f.f_desires.includes(d) ? 'on' : ''}`} aria-pressed={f.f_desires.includes(d)} onClick={() => setF({ ...f, f_desires: toggle(f.f_desires, d) })}>{d}</button>
                ))}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'country' && (
          <>
            <button className={`list-pick ${!f.f_country ? 'on' : ''}`} onClick={() => setF({ ...f, f_country: null })}><span>🌍 Todo el mundo</span>{!f.f_country && <Icon n="check" c="s" />}</button>
            {me.country && <button className={`list-pick ${f.f_country === me.country ? 'on' : ''}`} onClick={() => setF({ ...f, f_country: me.country! })}><span>{flag(me.country)} Solo {countryName(me.country)} (tu país)</span>{f.f_country === me.country && <Icon n="check" c="s" />}</button>}
            <input className="input" style={{ margin: '10px 0' }} placeholder="Buscar país" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar país" />
            <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
              {countries.map(([c, n]) => (
                <button key={c} className={`list-pick ${f.f_country === c ? 'on' : ''}`} onClick={() => setF({ ...f, f_country: c })}><span>{flag(c)} {n}</span>{f.f_country === c && <Icon n="check" c="s" />}</button>
              ))}
            </div>
          </>
        )}

        {tab === 'age' && (
          <div style={{ padding: '10px 4px' }}>
            <div className="h2 center" style={{ margin: '6px 0 18px' }}>{f.f_age_min} – {f.f_age_max === 99 ? '99+' : f.f_age_max} años</div>
            <label className="field"><span>Edad mínima: {f.f_age_min}</span>
              <input type="range" min={18} max={99} value={f.f_age_min} onChange={(e) => { const v = +e.target.value; setF({ ...f, f_age_min: v, f_age_max: Math.max(v, f.f_age_max) }); }} className="range" /></label>
            <label className="field"><span>Edad máxima: {f.f_age_max === 99 ? '99+' : f.f_age_max}</span>
              <input type="range" min={18} max={99} value={f.f_age_max} onChange={(e) => { const v = +e.target.value; setF({ ...f, f_age_max: v, f_age_min: Math.min(v, f.f_age_min) }); }} className="range" /></label>
            <p className="tiny muted">Las edades están verificadas con DNI.</p>
          </div>
        )}

        {tab === 'genders' && (
          <>
            <p className="small muted" style={{ marginBottom: 8 }}>¿A quién quieres conocer? Sin marcar, a todo el mundo.</p>
            {GENDER_LIST.map(([k, l]) => (
              <button key={k} className="list-pick" role="checkbox" aria-checked={f.seeking.includes(k)} onClick={() => setF({ ...f, seeking: toggle(f.seeking, k) })}>
                <span>{l}</span><span className={`cbox ${f.seeking.includes(k) ? 'on' : ''}`}>{f.seeking.includes(k) && <Icon n="check" c="s" />}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="sheet-actions">
        <button className="btn" onClick={() => setF(EMPTY)}>Restablecer</button>
        <button className="btn primary" onClick={save} disabled={busy}>Guardar</button>
      </div>
    </Sheet>
  );
}
