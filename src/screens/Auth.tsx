import { useState, type FormEvent } from 'react';
import { errText, supabase } from '../lib/supabase';
import { signInWithGoogle, isNative } from '../lib/native';
import { Check, GoogleLogo, Icon, Stripes, ZMark, useToast } from '../ui';

type View = 'splash' | 'login' | 'register' | 'forgot' | 'sent';

export function Auth() {
  const [view, setView] = useState<View>('splash');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [alias, setAlias] = useState('');
  const [adult, setAdult] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [sentMsg, setSentMsg] = useState('');
  const toast = useToast();

  const google = async () => {
    setErr(''); setBusy(true);
    try { await signInWithGoogle(); } catch (e) { setErr(errText(e)); } finally { if (isNative) setBusy(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (view === 'register') {
      if (alias.trim().length < 2) return setErr('El alias debe tener al menos 2 caracteres.');
      if (pass.length < 8) return setErr('La contraseña debe tener al menos 8 caracteres.');
      if (!adult) return setErr('Debes confirmar que eres mayor de 18 años.');
    }
    setBusy(true);
    try {
      if (view === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else if (view === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email, password: pass,
          options: { data: { alias: alias.trim() }, emailRedirectTo: isNative ? undefined : window.location.origin },
        });
        if (error) throw error;
        if (!data.session) { setSentMsg(`Te hemos enviado un enlace a ${email}. Ábrelo para activar tu cuenta.`); setView('sent'); }
      } else if (view === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setSentMsg(`Si existe una cuenta con ${email}, recibirás un enlace para crear una contraseña nueva.`); setView('sent');
      }
    } catch (e2) { setErr(errText(e2)); toast(errText(e2), true); } finally { setBusy(false); }
  };

  if (view === 'splash') {
    return (
      <div className="full" style={{ background: 'var(--g-night)' }}>
        <Stripes seed={33} color="#FF3B6B" opacity={0.16} />
        <div className="glow" style={{ width: 300, height: 300, right: -120, top: -60, background: '#FF3B6B', opacity: 0.25 }} />
        <div className="fade" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, paddingBottom: 140 }}>
          <ZMark size={92} color="var(--cream)" />
          <div style={{ fontWeight: 800, letterSpacing: '.06em', fontSize: 40, lineHeight: 1 }}>ZEVRA</div>
          <div className="label" style={{ opacity: 0.75, fontSize: 10.5 }}>Gente real. Conexiones reales.</div>
        </div>
        <div style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(32px + var(--sb))', display: 'grid', gap: 10 }}>
          <button className="btn light" onClick={google} disabled={busy}><GoogleLogo /> Continuar con Google</button>
          <button className="btn primary" onClick={() => setView('register')}>Crear cuenta con email</button>
          <button className="btn ghost" onClick={() => setView('login')}>Ya tengo cuenta</button>
          {err && <p className="err center" style={{ margin: 0 }}>{err}</p>}
          <p className="tiny muted center" style={{ marginTop: 6 }}>Solo mayores de 18 años · Verificación con DNI obligatoria</p>
        </div>
      </div>
    );
  }

  if (view === 'sent') {
    return (
      <div className="scroll"><div className="pad fade center" style={{ paddingTop: 'calc(90px + var(--st))' }}>
        <div style={{ color: 'var(--violet-soft)', display: 'flex', justifyContent: 'center' }}><Icon n="mail" c="l" /></div>
        <h1 className="h2" style={{ margin: '16px 0 8px' }}>Revisa tu correo</h1>
        <p className="muted">{sentMsg}</p>
        <button className="btn ghost" style={{ marginTop: 28 }} onClick={() => setView('login')}>Volver a iniciar sesión</button>
      </div></div>
    );
  }

  const reg = view === 'register';
  return (
    <div className="scroll"><div className="pad fade" style={{ paddingTop: 'calc(16px + var(--st))', paddingBottom: 30 }}>
      <button className="icon-btn" style={{ marginLeft: -12 }} onClick={() => { setErr(''); setView(view === 'forgot' ? 'login' : 'splash'); }} aria-label="Volver"><Icon n="arrowL" /></button>
      <div style={{ margin: '14px 0 6px' }}><ZMark size={36} color="var(--coral)" /></div>
      {view === 'forgot' ? (
        <>
          <h1 className="h1">Recupera tu acceso</h1>
          <p className="muted" style={{ margin: '8px 0 24px' }}>Te enviaremos un enlace para crear una contraseña nueva.</p>
        </>
      ) : (
        <>
          <h1 className="h1">{reg ? <>Empieza a <span className="serif">ser tú</span></> : 'Hola de nuevo'}</h1>
          <p className="muted" style={{ margin: '8px 0 20px' }}>{reg ? 'Tu alias es lo único que verán los demás.' : 'Entra para seguir conectando.'}</p>
          <button className="btn light" type="button" onClick={google} disabled={busy}><GoogleLogo /> Continuar con Google</button>
          <div className="row tiny muted" style={{ margin: '18px 0' }}><span style={{ flex: 1, height: 1, background: 'var(--smoke)' }} />o con tu email<span style={{ flex: 1, height: 1, background: 'var(--smoke)' }} /></div>
          <div className="tabs" role="tablist" style={{ marginBottom: 18 }}>
            <button role="tab" aria-selected={!reg} className={!reg ? 'on' : ''} onClick={() => { setErr(''); setView('login'); }}>Iniciar sesión</button>
            <button role="tab" aria-selected={reg} className={reg ? 'on' : ''} onClick={() => { setErr(''); setView('register'); }}>Crear cuenta</button>
          </div>
        </>
      )}
      <form onSubmit={submit} noValidate>
        {reg && (
          <label className="field"><span>Alias público</span>
            <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={20} autoComplete="nickname" required /></label>
        )}
        <label className="field"><span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" autoComplete="email" required /></label>
        {view !== 'forgot' && (
          <label className="field"><span>Contraseña{reg ? ' · mínimo 8 caracteres' : ''}</span>
            <span className="row input" style={{ padding: '0 4px 0 14px', gap: 4 }}>
              <input style={{ flex: 1, background: 'none', border: 0, outline: 'none', height: '100%' }} type={showPass ? 'text' : 'password'}
                value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={reg ? 'new-password' : 'current-password'} required minLength={8} />
              <button type="button" className="icon-btn" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}><Icon n={showPass ? 'eyeOff' : 'eye'} c="s" /></button>
            </span></label>
        )}
        {reg && <div style={{ marginBottom: 14 }}><Check on={adult} onChange={setAdult}>Tengo 18 años o más y acepto las Condiciones y la Política de privacidad. Verificaré mi edad con mi DNI.</Check></div>}
        {view === 'login' && <button type="button" className="tiny link" style={{ margin: '-4px 0 16px' }} onClick={() => { setErr(''); setView('forgot'); }}>¿Has olvidado tu contraseña?</button>}
        {err && <p className="err">{err}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Un momento…' : view === 'login' ? 'Entrar' : view === 'register' ? 'Crear cuenta' : 'Enviar enlace'}</button>
      </form>
    </div></div>
  );
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pass.length < 8) return setErr('Mínimo 8 caracteres.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (error) return setErr(errText(error));
    toast('Contraseña actualizada'); onDone();
  };
  return (
    <div className="scroll"><form className="pad fade" style={{ paddingTop: 'calc(60px + var(--st))' }} onSubmit={submit}>
      <h1 className="h1">Crea una contraseña nueva</h1>
      <p className="muted" style={{ margin: '8px 0 22px' }}>Usa al menos 8 caracteres.</p>
      <label className="field"><span>Nueva contraseña</span><input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn primary" disabled={busy}>Guardar contraseña</button>
    </form></div>
  );
}
