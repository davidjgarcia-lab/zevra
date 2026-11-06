import { useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { REPORT_REASONS } from '../store';
import { Check, Icon, Sheet, useToast } from '../ui';

const RATE_OPTIONS: Array<[number, string, string]> = [
  [1, '😠', 'Nada'], [2, '😕', 'Poco'], [3, '😐', 'Normal'], [4, '🙂', 'Sí'], [5, '😍', '¡Mucho!'],
];

/** Valoración de respeto en un toque: se envía al pulsar una cara. */
export function RateSheet({ callId, partner, alias, onClose }: { callId: string; partner: string; alias: string; onClose: (rated: boolean) => void }) {
  const [sent, setSent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const toast = useToast();
  const rate = async (score: number) => {
    if (busy || sent) return;
    setBusy(true); setSent(score);
    const { error } = await supabase.from('ratings').insert({ call_id: callId, ratee: partner, score });
    setBusy(false);
    if (error && !/duplicate/.test(error.message)) { setSent(null); toast(errText(error), true); return; }
    setTimeout(() => onClose(true), 900);
  };
  return (
    <Sheet onClose={() => onClose(!!sent)} label="Valorar respeto">
      {sent ? (
        <div className="center fade" style={{ padding: '18px 0 8px' }}>
          <div style={{ fontSize: 46 }}>{RATE_OPTIONS[sent - 1][1]}</div>
          <h2 className="h2" style={{ margin: '8px 0 4px' }}>¡Gracias!</h2>
          <p className="small muted">Tu valoración es anónima y ayuda a que ZEVRA sea un lugar respetuoso.</p>
        </div>
      ) : (
        <>
          <div className="label center" style={{ color: 'var(--warn)' }}>⭐ Puntuación de respeto</div>
          <h2 className="h2 center" style={{ margin: '6px 0 4px' }}>¿{alias} ha sido respetuoso/a contigo?</h2>
          <p className="small muted center" style={{ marginBottom: 16 }}>Toca una cara. Es anónimo: {alias} nunca sabrá qué has elegido.</p>
          <div className="rate-faces" role="radiogroup" aria-label="Puntuación de respeto">
            {RATE_OPTIONS.map(([v, face, label]) => (
              <button key={v} role="radio" aria-checked={false} aria-label={`${v} de 5: ${label}`} onClick={() => rate(v)} disabled={busy}>
                <span className="face">{face}</span><span>{label}</span>
              </button>
            ))}
          </div>
          <button className="tiny link center" style={{ display: 'block', margin: '14px auto 4px' }} onClick={() => setWhy(!why)}>¿Para qué sirve?</button>
          {why && <p className="small muted center fade" style={{ marginBottom: 6 }}>La media aparece en el perfil de cada persona. Quien tiene mejor puntuación aparece antes al conectar, y las malas valoraciones se revisan.</p>}
          <button className="btn" style={{ marginTop: 6 }} onClick={() => onClose(false)}>Ahora no</button>
        </>
      )}
    </Sheet>
  );
}

export function ReportSheet({ userId, alias, callId, onClose, onBlocked }: { userId: string; alias: string; callId?: string; onClose: () => void; onBlocked?: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('reports').insert({ reported: userId, reason, details: details || null, call_id: callId ?? null });
      if (error) throw error;
      if (block) await blockUser(userId);
      toast(block ? `Denuncia enviada y ${alias} bloqueado` : 'Denuncia enviada. La revisaremos.');
      onClose(); if (block) onBlocked?.();
    } catch (e) { toast(errText(e), true); } finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose} label={`Denunciar a ${alias}`}>
      <div className="row" style={{ color: 'var(--coral-mid)' }}><Icon n="flag" /><h2 className="h2">Denunciar a {alias}</h2></div>
      <p className="small muted" style={{ margin: '6px 0 14px' }}>Nadie sabrá que has sido tú.</p>
      <div className="grid" style={{ gap: 8 }}>
        {REPORT_REASONS.map((r) => <Check key={r} on={reason === r} onChange={() => setReason(r)}>{r}</Check>)}
      </div>
      <label className="field" style={{ marginTop: 12 }}><span>Detalles (opcional)</span>
        <textarea className="input" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></label>
      <Check on={block} onChange={setBlock}>Bloquear también a {alias}</Check>
      <div className="grid" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={!reason || busy} onClick={send}>Enviar denuncia</button>
        <button className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Sheet>
  );
}

export async function blockUser(userId: string) {
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.from('blocks').upsert({ blocker: data.user!.id, blocked: userId });
  if (error) throw error;
}

export function ConfirmSheet({ title, text, confirm, danger, onConfirm, onClose }: { title: string; text: string; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label={title}>
      <h2 className="h2">{title}</h2>
      <p className="muted small" style={{ margin: '8px 0 18px' }}>{text}</p>
      <div className="grid">
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirm}</button>
        <button className="btn" onClick={onClose}>Cancelar</button>
      </div>
    </Sheet>
  );
}
