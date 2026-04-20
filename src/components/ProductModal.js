'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';

export function ProductModal({ product, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const prevPathRef = useRef(null);

  useEffect(() => {
    if (!product) return;
    setQty(1);
    prevPathRef.current = window.location.pathname + window.location.search;
    const newUrl = `/offer/${product.id}`;
    window.history.pushState({ offerModal: product.id }, '', newUrl);

    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);

    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    return () => {
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
  const displayName     = product.product?.name   || product.productName || product.product_name;
  let displayImage      = product.product?.imageUrl || product.imageUrl || product.image_url;
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

          <Link href={`/offer/${product.id}`} className="modal-link">
            Δες αναλυτικά <Icon.ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
