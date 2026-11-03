import { useState } from 'react';
import { errText, supabase } from '../lib/supabase';
import { REPORT_REASONS } from '../store';
import { Check, Icon, Sheet, useToast } from '../ui';

export function RateSheet({ callId, partner, alias, onClose }: { callId: string; partner: string; alias: string; onClose: (rated: boolean) => void }) {
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async () => {
    setBusy(true);
    const { error } = await supabase.from('ratings').insert({ call_id: callId, ratee: partner, score });
    setBusy(false);
    if (error && !/duplicate/.test(error.message)) { toast(errText(error), true); return; }
    toast('Gracias. Tu valoración es anónima.'); onClose(true);
  };
  const words = ['', 'Nada respetuosa', 'Poco respetuosa', 'Correcta', 'Respetuosa', 'Muy respetuosa'];
  return (
    <Sheet onClose={() => onClose(false)} label="Valorar respeto">
      <div className="label muted center">Puntuación de respeto</div>
      <h2 className="h2 center" style={{ margin: '6px 0 4px' }}>¿Ha sido {alias} una persona respetuosa?</h2>
      <p className="small muted center" style={{ marginBottom: 18 }}>Es anónimo. Solo se puede valorar tras hablar 4 minutos o más.</p>
      <div className="rate-stars" role="radiogroup" aria-label="Puntuación de 1 a 5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} role="radio" aria-checked={score === i} aria-label={`${i} — ${words[i]}`} className={i <= score ? 'on' : ''} onClick={() => setScore(i)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.5 2.3a.5.5 0 0 1 1 0l2.3 4.7a2 2 0 0 0 1.6 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.9l.9 5.2a.5.5 0 0 1-.8.6l-4.6-2.5a2 2 0 0 0-2 0L5.3 21.2a.5.5 0 0 1-.8-.6l.9-5.2a2 2 0 0 0-.6-1.9L1 9.8a.5.5 0 0 1 .3-.9l5.2-.8A2 2 0 0 0 8 7z" /></svg>
          </button>
        ))}
      </div>
      <p className="center small" style={{ minHeight: 22, marginTop: 10, fontWeight: 700 }}>{words[score]}</p>
      <div className="grid" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={!score || busy} onClick={send}>Enviar valoración</button>
        <button className="btn" onClick={() => onClose(false)}>Ahora no</button>
      </div>
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
