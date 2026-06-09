'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { getPriceComparison } from '@/actions/get-price-comparison';
import { getPriceHistory } from '@/actions/get-price-history';
import { PriceHistory } from './PriceHistory';
import { hiResImage } from '@/lib/images';

export function ProductModal({ product, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [comparison, setComparison] = useState([]);
  const [history, setHistory] = useState(null);
  const prevPathRef = useRef(null);

  useEffect(() => {
    if (!product) return;
    setQty(1);
    setComparison([]);
    setHistory(null);
    prevPathRef.current = window.location.pathname + window.location.search;
    const newUrl = `/offer/${product.id}`;
    window.history.pushState({ offerModal: product.id }, '', newUrl);

    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);

    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    // Background fetches: comparison + history. Modal renders without them;
    // sections appear when actions return. Errors swallowed — both panels
    // are nice-to-have, not critical.
    let cancelled = false;
    const productId = product.productId || product.product?.id;
    getPriceComparison(product.id)
      .then((rows) => { if (!cancelled) setComparison(rows || []); })
      .catch(() => {});
    if (productId) {
      getPriceHistory(productId, { days: 90 })
        .then((h) => { if (!cancelled) setHistory(h); })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (window.history.state?.offerModal === product.id) {
        window.history.back();
      }
    };
  }, [product?.id]);

  if (!product) return null;

  const discountedPrice = product.discountedPrice ?? product.discounted_price;
  const originalPrice   = product.originalPrice   ?? product.original_price;
  const discountPercent = product.discountPercent ?? product.discount_percent;
  // Raw offer name first: it matches this offer's price/pack ("9+3 Δώρο");
  // the canonical product.name can be a single-unit variant.
  const displayName     = product.productName || product.product_name || product.product?.name;
  let displayImage      = hiResImage(product.product?.imageUrl || product.imageUrl || product.image_url);
  if (displayImage && !displayImage.startsWith('http') && !displayImage.startsWith('/')) {
    displayImage = `/wolt_images/${displayImage.split('/').pop()}`;
  }
  const description   = product.product?.description || product.description;
  const supermarketId = product.supermarket || product.supermarket_id;
  const category      = product.category;

  const sm = SUPERMARKETS.find((s) => s.id === supermarketId) || { name: supermarketId || '', color: 'var(--ink-2)' };
  const pct = discountPercent || (originalPrice && discountedPrice
    ? Math.round((1 - discountedPrice / originalPrice) * 100)
    : null);

  const handleShare = async () => {
    const url = `${window.location.origin}/offer/${product.id}`;
    const text = `Δες αυτή την προσφορά: ${displayName} στα ${sm.name} μόνο με ${discountedPrice?.toFixed(2)}€!`;
    if (navigator.share) {
      try { await navigator.share({ title: displayName, text, url }); } catch (err) { console.error(err); }
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      alert('Ο σύνδεσμος αντιγράφηκε!');
    }
  };

  const handleAdd = () => {
    trackEvent({
      eventType: 'list_add',
      supermarket: supermarketId,
      discountId: product.id,
      category: category,
      sessionId: getSessionId(),
    }).catch(() => {});
    for (let i = 0; i < qty; i++) onAdd(product);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-actions-top">
          <button type="button" className="icon-btn" onClick={handleShare} title="Κοινοποίηση" aria-label="Κοινοποίηση">
            <Icon.Share size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Κλείσιμο">
            <Icon.X size={18} />
          </button>
        </div>

        <div className="modal-img">
          {pct > 0 && <div className="discount-badge">-{pct}%</div>}
          {displayImage ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <Image
                src={displayImage}
                alt={displayName || ''}
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                style={{ objectFit: 'contain' }}
              />
            </div>
          ) : (
            <CategoryIcon id={category} size={64} />
          )}
        </div>

        <div className="modal-body">
          <div className="modal-meta">
            <span className="chain-pill" style={{ color: sm.color }}>{sm.name}</span>
            {category && <span>· {category}</span>}
          </div>

          <h2 className="modal-title">{displayName}</h2>
          <p className="modal-desc">{description || 'Δεν υπάρχει διαθέσιμη περιγραφή.'}</p>

          <div className="modal-price-row">
            <div>
              <div className="price">{discountedPrice?.toFixed(2)}€</div>
              {originalPrice && <div className="price-old">{originalPrice.toFixed(2)}€</div>}
            </div>

            <div className="qty-stepper" aria-label="Ποσότητα">
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Μείωση">
                <Icon.Minus size={14} />
              </button>
              <span className="qty-val">{qty}</span>
              <button type="button" onClick={() => setQty(qty + 1)} aria-label="Αύξηση">
                <Icon.Plus size={14} />
              </button>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-lg modal-cta" onClick={handleAdd}>
            Προσθήκη στη λίστα
          </button>

          {comparison.length > 0 && (() => {
            const currentRow = {
              id: product.id,
              price: Number(discountedPrice),
              sm,
              isCurrent: true,
            };
            const otherRows = comparison.map((c) => {
              const cSm = SUPERMARKETS.find((s) => s.id === c.supermarket) || { name: c.store?.name || '', color: '#888' };
              return { id: c.id, price: Number(c.discountedPrice), sm: cSm, isCurrent: false };
            });
            const rows = [currentRow, ...otherRows].sort((a, b) => a.price - b.price);
            const cheapest = rows[0];
            return (
              <section style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#8b929c', marginBottom: 8 }}>
                  Σύγκριση τιμής
                </div>
                <div style={{ border: '1px solid #ececf0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  {rows.map((row) => {
                    const isCheapest = row.id === cheapest.id;
                    const diff = row.price - cheapest.price;
                    const body = (
                      <>
                        <div style={{ background: row.sm.color, color: '#fff', fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 6, minWidth: 70, textAlign: 'center', letterSpacing: '0.3px' }}>
                          {row.sm.name.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {isCheapest && (
                            <span style={{ background: '#22c55e', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 5, letterSpacing: '0.3px' }}>
                              ΦΘΗΝΟΤΕΡΑ
                            </span>
                          )}
                          {row.isCurrent && (
                            <span style={{ color: '#8b929c', fontSize: 10, fontWeight: 700 }}>Βλέπεις τώρα</span>
                          )}
                          {!isCheapest && diff > 0 && (
                            <span style={{ color: '#ff3b30', fontSize: 10, fontWeight: 700 }}>+{diff.toFixed(2)}€</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#1c1e24', letterSpacing: '-0.2px' }}>
                          {row.price.toFixed(2)}€
                        </div>
                      </>
                    );
                    const rowStyle = {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderBottom: '1px solid #f3f5f8',
                      textDecoration: 'none',
                      color: 'inherit',
                      background: row.isCurrent ? '#f6fbff' : '#fff',
                      cursor: row.isCurrent ? 'default' : 'pointer',
                    };
                    return row.isCurrent ? (
                      <div key={row.id} style={rowStyle}>{body}</div>
                    ) : (
                      <Link key={row.id} href={`/offer/${row.id}`} style={rowStyle}>{body}</Link>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          <PriceHistory history={history} compact />

          <Link href={`/offer/${product.id}`} className="modal-link">
            Δες αναλυτικά <Icon.ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
