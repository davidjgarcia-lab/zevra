import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../store';
import { Icon, Spinner, useToast } from '../ui';

interface Offer {
  id: string; brand: string; title: string; description: string; discount: string; code: string | null;
  url: string | null; category: string; logo_url: string | null; expires_at: string | null;
}

export function Shop() {
  const { back } = useApp();
  const toast = useToast();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [cat, setCat] = useState('Todo');

  useEffect(() => {
    supabase.from('shop_offers').select('*').order('sort').order('created_at', { ascending: false })
      .then(({ data }) => setOffers((data as Offer[]) ?? []));
  }, []);

  const cats = ['Todo', ...Array.from(new Set((offers ?? []).map((o) => o.category)))];
  const list = (offers ?? []).filter((o) => cat === 'Todo' || o.category === cat);
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast(`Código ${code} copiado`); } catch { toast(`Tu código: ${code}`); }
  };

  return (
    <>
      <header className="topbar"><button className="icon-btn" style={{ marginLeft: -8 }} onClick={back} aria-label="Volver"><Icon n="arrowL" /></button><div className="title">Tienda</div></header>
      <main className="scroll"><div className="pad fade" style={{ paddingBottom: 30 }}>
        <div className="shop-hero">
          <span className="shop-ic"><Icon n="bag" /></span>
          <div><b>Bienestar íntimo</b><span>Códigos de descuento exclusivos de marcas colaboradoras para la comunidad ZEVRA.</span></div>
        </div>

        {offers === null ? <div className="center" style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          : offers.length === 0 ? (
            <div className="card center" style={{ padding: '36px 20px', marginTop: 14 }}>
              <Icon n="bag" c="l" />
              <div className="h3" style={{ marginTop: 10 }}>Muy pronto</div>
              <p className="small muted" style={{ marginTop: 6 }}>Estamos cerrando acuerdos con marcas de bienestar íntimo. Aquí aparecerán sus códigos de descuento.</p>
            </div>
          ) : (
            <>
              {cats.length > 2 && <div className="chips" style={{ margin: '14px 0 4px' }}>{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>}
              <div className="grid" style={{ marginTop: 12 }}>
                {list.map((o) => (
                  <article key={o.id} className="offer">
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <span className="offer-logo">{o.logo_url ? <img src={o.logo_url} alt="" /> : o.brand.slice(0, 1)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tiny muted" style={{ fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>{o.brand} · {o.category}</div>
                        <div className="h3" style={{ marginTop: 2 }}>{o.title}</div>
                        {o.description && <p className="small muted" style={{ marginTop: 4 }}>{o.description}</p>}
                      </div>
                      {o.discount && <span className="offer-badge">{o.discount}</span>}
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      {o.code && <button className="offer-code" onClick={() => copy(o.code!)} aria-label={`Copiar código ${o.code}`}><span>{o.code}</span><Icon n="copy" c="s" /></button>}
                      {o.url && <a className="btn primary sm" style={{ flex: o.code ? 'none' : 1 }} href={o.url} target="_blank" rel="noopener sponsored">Ir a la tienda <Icon n="external" c="s" /></a>}
                    </div>
                    {o.expires_at && <p className="tiny muted" style={{ marginTop: 8 }}>Válido hasta el {new Date(o.expires_at).toLocaleDateString('es-ES')}</p>}
                  </article>
                ))}
              </div>
            </>
          )}
        <p className="tiny muted center" style={{ marginTop: 18 }}>ZEVRA puede recibir una comisión por las compras con estos códigos. No compartimos tus datos con las marcas.</p>
      </div></main>
    </>
  );
}
