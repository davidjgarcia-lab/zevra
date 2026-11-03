import { useState } from 'react';
import { Check, Icon, Stripes } from '../ui';

const STEPS = [
  { k: 'Bienvenida', t: <>Gente real.<br />Conexiones reales.</>, d: 'Conecta por vídeo o por voz con personas adultas verificadas con DNI. Sin perfiles comprados ni bots.', ic: 'sparkles', c: 'var(--coral)' },
  { k: 'Respeto', t: <>Tu reputación<br /><span className="serif">te acompaña.</span></>, d: 'Si una conversación dura 4 minutos o más, la otra persona puede valorar si has sido respetuoso. Tu puntuación aparece en tu perfil.', ic: 'star', c: 'var(--warn)' },
  { k: 'Privacidad', t: <>Tu intimidad<br />no es el producto.</>, d: 'Fotos privadas solo para quien tú apruebes. En el chat, las fotos se destruyen a los 10 segundos y los vídeos al terminar. En la app de Android las capturas de pantalla están bloqueadas.', ic: 'eyeOff', c: 'var(--violet-soft)' },
  { k: 'Normas', t: <>Nuestras normas</>, d: '', ic: 'shield', c: 'var(--cream)' },
];
const RULES = [
  'Trata a los demás con respeto. Un «no» se respeta a la primera.',
  'Nada íntimo en la modalidad Social.',
  'Nunca grabes, captures ni compartas a nadie.',
  'Solo personas adultas. Si sospechas que alguien es menor, denúncialo.',
  'Nada de dinero, datos personales ni enlaces externos.',
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [ok, setOk] = useState(false);
  const s = STEPS[i];
  return (
    <div className="full">
      {i < 3 && <Stripes seed={60 + i} color={i === 2 ? '#7A4DFF' : '#FF3B6B'} opacity={0.12} n={8} />}
      <div className="scroll" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="pad fade" key={i} style={{ paddingTop: 'calc(24px + var(--st))', flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 'calc(24px + var(--sb))' }}>
          <div className="step-dots" aria-label={`Paso ${i + 1} de 4`}>{STEPS.map((_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}</div>
          <div style={{ marginTop: 56, color: s.c }}><Icon n={s.ic} c="l" /></div>
          <div className="label muted" style={{ marginTop: 14 }}>{s.k}</div>
          <h1 className="h1" style={{ fontSize: 32, marginTop: 6 }}>{s.t}</h1>
          {s.d ? <p className="muted" style={{ marginTop: 14, fontSize: 16 }}>{s.d}</p> : (
            <>
              <div className="grid" style={{ marginTop: 16, gap: 8 }}>
                {RULES.map((r, j) => <div key={j} className="row small" style={{ alignItems: 'flex-start' }}><span style={{ color: 'var(--coral)', fontWeight: 800, width: 18 }}>{j + 1}</span><span>{r}</span></div>)}
              </div>
              <div style={{ marginTop: 18 }}><Check on={ok} onChange={setOk}>Acepto las normas de la comunidad. Sé que incumplirlas supone la expulsión.</Check></div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <div className="grid" style={{ marginTop: 24 }}>
            <button className="btn primary" disabled={i === 3 && !ok} onClick={() => (i === 3 ? onDone() : setI(i + 1))}>{i === 3 ? 'Empezar' : 'Siguiente'}</button>
            {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Atrás</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
