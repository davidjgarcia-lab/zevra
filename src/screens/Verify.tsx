import { useRef, useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { readDniBack, sha256 } from '../lib/ocr';
import { ageOn, parseTD1, type MrzResult } from '../lib/mrz';
import { Icon, ZMark, useToast } from '../ui';

type Step = 'intro' | 'reading' | 'result' | 'manual' | 'done';
const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'Permanente');

export function Verify({ onVerified, onLogout }: { onVerified: () => void; onLogout: () => void }) {
  const [step, setStep] = useState<Step>('intro');
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState('');
  const [res, setRes] = useState<MrzResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState(['', '', '']);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setRes(null); setStep('reading'); setPct(0);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    try {
      const r = await readDniBack(f, (p, l) => { setPct(p); setLabel(l); });
      if (!r) { setErr('No hemos podido leer los códigos del reverso. Haz otra foto con buena luz, sin reflejos y con el DNI ocupando toda la imagen.'); setStep('intro'); return; }
      setRes(r); setStep('result');
    } catch (e) {
      setErr('No se pudo procesar la imagen. ' + errText(e)); setStep('intro');
    }
  };

  const manual = () => {
    const r = parseTD1(lines as [string, string, string]);
    if (!r) return setErr('Los códigos no son válidos. Revisa que has copiado las 3 líneas exactamente, incluidos los símbolos <.');
    setErr(''); setRes(r); setStep('result');
  };

  const confirm = async () => {
    if (!res) return;
    const age = ageOn(res.birthdate);
    if (age < 18) { setErr('Según tu DNI eres menor de 18 años. ZEVRA es solo para personas adultas.'); return; }
    if (res.expiry && res.expiry < new Date().toISOString().slice(0, 10)) { setErr('Tu DNI está caducado. Usa un documento en vigor.'); return; }
    setBusy(true); setErr('');
    try {
      const docHash = await sha256(`zevra-dni:${res.issuer}:${res.dniNumber ?? res.docNumber}`);
      const { error } = await supabase.rpc('verify_age', { p_birthdate: res.birthdate, p_expiry: res.expiry, p_doc_hash: docHash });
      if (error) throw error;
      setStep('done');
    } catch (e) { setErr(errText(e)); toast(errText(e), true); } finally { setBusy(false); }
  };

  return (
    <div className="scroll"><div className="pad fade" style={{ paddingTop: 'calc(24px + var(--st))', paddingBottom: 30 }}>
      <div className="between">
        <div className="row" style={{ color: 'var(--violet-soft)' }}><Icon n="shieldCheck" c="l" /><span className="label">Verificación de edad</span></div>
        {step !== 'done' && <button className="tiny muted" onClick={onLogout}>Salir</button>}
      </div>

      {step === 'intro' && (
        <>
          <h1 className="h1" style={{ marginTop: 14 }}>Confirma tu edad con tu DNI</h1>
          <p className="muted" style={{ margin: '10px 0 18px' }}>Haz una foto al <b style={{ color: 'var(--cream)' }}>reverso</b> de tu DNI. Leemos la fecha de nacimiento de los códigos de la parte de abajo y comprobamos que son auténticos.</p>
          <div className="card" style={{ display: 'grid', gap: 12 }}>
            <div className="row small"><Icon n="lock" c="s" /><span>La foto se procesa <b>en tu móvil</b>. No se sube ni se guarda en ningún sitio.</span></div>
            <div className="row small"><Icon n="eyeOff" c="s" /><span>Solo guardamos que eres mayor de 18 y una huella cifrada del nº de DNI para evitar cuentas duplicadas.</span></div>
            <div className="row small"><Icon n="info" c="s" /><span>Tu fecha de nacimiento nunca se muestra. Los demás solo ven tu edad.</span></div>
          </div>
          <DniGuide />
          {err && <p className="notice coral" style={{ marginTop: 14 }}><Icon n="info" c="s" /><span>{err}</span></p>}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="grid" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={() => camRef.current?.click()}><Icon n="camera" c="s" /> Hacer foto al reverso del DNI</button>
            <button className="btn soft" onClick={() => fileRef.current?.click()}><Icon n="image" c="s" /> Elegir una foto de la galería</button>
            <button className="btn sm" style={{ margin: '4px auto 0', color: 'var(--mist)' }} onClick={() => { setErr(''); setStep('manual'); }}>¿No funciona la cámara? Escribir los códigos</button>
          </div>
        </>
      )}

      {step === 'reading' && (
        <div className="center" style={{ paddingTop: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          {preview && <img src={preview} alt="" style={{ width: '80%', maxHeight: 200, objectFit: 'contain', borderRadius: 14, opacity: 0.7 }} />}
          <div className="pulse" style={{ color: 'var(--violet)', width: 110, height: 110 }}><ZMark size={50} color="var(--violet-soft)" /></div>
          <div className="h2" aria-live="polite">{label || 'Leyendo tu DNI…'}</div>
          <div style={{ width: '70%', height: 6, borderRadius: 3, background: 'var(--graphite)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--coral)', transition: 'width .3s' }} />
          </div>
          <p className="muted small">La primera vez tarda un poco más: descargamos el lector.</p>
        </div>
      )}

      {step === 'manual' && (
        <>
          <h1 className="h2" style={{ marginTop: 14 }}>Escribe los códigos del reverso</h1>
          <p className="muted small" style={{ margin: '8px 0 16px' }}>Son las 3 líneas de letras, números y símbolos {'<'} de la parte inferior del reverso. Cópialas tal cual.</p>
          {[0, 1, 2].map((i) => (
            <label className="field" key={i}><span>Línea {i + 1}</span>
              <input className="input" style={{ fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.06em', textTransform: 'uppercase' }} maxLength={36}
                value={lines[i]} onChange={(e) => setLines(lines.map((l, j) => (j === i ? e.target.value.toUpperCase() : l)))}
                placeholder={['IDESPBAA000589599999999R<<<<<<', '9005145F3101012ESP<<<<<<<<<<<5', 'APELLIDO<APELLIDO<<NOMBRE<<<<<'][i]} autoCapitalize="characters" autoCorrect="off" spellCheck={false} /></label>
          ))}
          {err && <p className="err">{err}</p>}
          <div className="grid">
            <button className="btn primary" onClick={manual}>Comprobar</button>
            <button className="btn" onClick={() => { setErr(''); setStep('intro'); }}>Volver</button>
          </div>
        </>
      )}

      {step === 'result' && res && (
        <>
          <h1 className="h2" style={{ marginTop: 14 }}>¿Son correctos estos datos?</h1>
          <p className="muted small" style={{ margin: '6px 0 16px' }}>Leídos de tu DNI y comprobados con sus dígitos de control.</p>
          <div className="card" style={{ padding: '4px 16px' }}>
            {[
              ['Nombre', `${res.givenNames} ${res.surname}`.trim() || '—'],
              ['Fecha de nacimiento', fmt(res.birthdate)],
              ['Edad', `${ageOn(res.birthdate)} años`],
              ['Válido hasta', fmt(res.expiry)],
              ['Documento', res.dniNumber ? `DNI ···${res.dniNumber.slice(-4)}` : `Nº ···${res.docNumber.slice(-4)}`],
            ].map(([k, v]) => <div key={k} className="list-row between"><span className="muted small">{k}</span><b className="small" style={{ textAlign: 'right' }}>{v}</b></div>)}
          </div>
          {err && <p className="notice coral" style={{ marginTop: 14 }}><Icon n="info" c="s" /><span>{err}</span></p>}
          <div className="grid" style={{ marginTop: 18 }}>
            <button className="btn primary" onClick={confirm} disabled={busy}>{busy ? 'Verificando…' : 'Sí, verificar mi edad'}</button>
            <button className="btn" onClick={() => { setErr(''); setStep('intro'); }}>Repetir</button>
          </div>
          <p className="tiny muted center" style={{ marginTop: 12 }}>Tu nombre no se guarda. Usar el DNI de otra persona supone la expulsión permanente.</p>
        </>
      )}

      {step === 'done' && (
        <div className="center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 70, gap: 14 }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(107,227,166,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)' }}><Icon n="badgeCheck" c="l" /></div>
          <div className="h2" aria-live="polite">Edad verificada</div>
          <p className="muted small" style={{ maxWidth: 280 }}>Hemos guardado solo el resultado. Ya puedes continuar.</p>
          <button className="btn primary" style={{ marginTop: 20 }} onClick={onVerified}>Continuar</button>
        </div>
      )}
    </div></div>
  );
}

function DniGuide() {
  return (
    <div className="card" style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
      <svg viewBox="0 0 120 76" width="120" height="76" aria-hidden="true" style={{ flex: 'none' }}>
        <rect x="1" y="1" width="118" height="74" rx="8" fill="#1b1b1f" stroke="#3A3A40" />
        <rect x="10" y="10" width="50" height="6" rx="3" fill="#3A3A40" /><rect x="10" y="22" width="34" height="6" rx="3" fill="#3A3A40" />
        <rect x="6" y="46" width="108" height="24" rx="4" fill="none" stroke="#FF3B6B" strokeDasharray="4 3" />
        {[51, 58, 65].map((y) => <text key={y} x="10" y={y} fontSize="6.5" fill="#FF86A4" fontFamily="monospace">{'IDESP<<<5<<<<<<<<<<<<<<<'.slice(0, 22)}</text>)}
      </svg>
      <span className="small">Encuadra bien la <b>parte de abajo del reverso</b>, la que tiene 3 líneas con símbolos {'<<<'}.</span>
    </div>
  );
}
