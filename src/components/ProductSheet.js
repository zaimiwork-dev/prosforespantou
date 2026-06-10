'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sheet } from './Sheet';
import { OfferDetails } from './OfferDetails';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { getPriceComparison } from '@/actions/get-price-comparison';
import { getPriceHistory } from '@/actions/get-price-history';

// Bottom-sheet quick view of an offer. All content comes from OfferDetails —
// the same component the /offer/[id] page renders — so the two surfaces can't
// drift.
//
// Split in two on purpose:
// - ProductSheet (always mounted) owns the shareable URL: pushState to
//   /offer/[id] so back-button closes and the link is copy-able. It must stay
//   mounted across opens — if this effect lived in a keyed/remounting child,
//   StrictMode's mount→cleanup→mount cycle would run history.back() against
//   the fresh pushState and the async popstate would close the sheet on open.
// - ProductSheetInner (keyed per offer) owns comparison/history fetch state,
//   which starts fresh per offer via the key instead of setState resets.
export function ProductSheet({ product, onClose, onAdd }) {
  useEffect(() => {
    if (!product) return;
    window.history.pushState({ offerSheet: product.id }, '', `/offer/${product.id}`);
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.offerSheet === product.id) {
        window.history.back();
      }
    };
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null;
  return <ProductSheetInner key={product.id} product={product} onClose={onClose} onAdd={onAdd} />;
}

function ProductSheetInner({ product, onClose, onAdd }) {
  const [comparison, setComparison] = useState([]);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const productId = product.productId || product.product?.id;
    getPriceComparison(product.id)
      .then((rows) => { if (!cancelled) setComparison(rows || []); })
      .catch(() => {});
    if (productId) {
      // Judge the verdict against THIS offer's price, not the last snapshot.
      const offerPrice = Number(product.discountedPrice ?? product.discounted_price);
      getPriceHistory(productId, { days: 90, currentPrice: Number.isFinite(offerPrice) ? offerPrice : null })
        .then((h) => { if (!cancelled) setHistory(h); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sm = SUPERMARKETS.find((s) => s.id === (product.supermarket || product.supermarket_id));
  const displayName = product.productName || product.product_name || product.product?.name;

  const handleShare = async () => {
    const url = `${window.location.origin}/offer/${product.id}`;
    const price = Number(product.discountedPrice ?? product.discounted_price);
    const text = `Δες αυτή την προσφορά: ${displayName} στα ${sm?.name || ''} μόνο με ${price.toFixed(2)}€!`;
    if (navigator.share) {
      // Unlike the shopping-list share (text-only by design), an offer share
      // needs the deep link — the recipient should land on the offer page.
      try { await navigator.share({ title: displayName, text, url }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      alert('Ο σύνδεσμος αντιγράφηκε!');
    }
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={sm?.name || 'Προσφορά'}
      actions={
        <button type="button" className="sheet-close" onClick={handleShare} title="Κοινοποίηση" aria-label="Κοινοποίηση">
          <Icon.Share size={15} />
        </button>
      }
    >
      <OfferDetails offer={product} comparison={comparison} history={history} onAdd={onAdd} compact />
      <Link href={`/offer/${product.id}`} className="modal-link" onClick={(e) => {
        // Full navigation, not the pushState'd URL — let Next render the page.
        e.preventDefault();
        trackEvent({ eventType: 'deal_click', supermarket: product.supermarket, discountId: product.id, sessionId: getSessionId() }).catch(() => {});
        window.location.href = `/offer/${product.id}`;
      }}>
        Δες αναλυτικά <Icon.ArrowRight size={12} />
      </Link>
    </Sheet>
  );
}
