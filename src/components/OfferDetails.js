'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { PriceHistory } from './PriceHistory';
import { PriceComparison } from './PriceComparison';
import { SUPERMARKETS } from '@/lib/constants';
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { hiResImage } from '@/lib/images';
import { parsePack, perUnitPrice, unitPrice } from '@/lib/pack-info';
import { useShoppingListStore, favoriteKeyFor } from '@/lib/store';
import { recordInterest, WEIGHT } from '@/lib/interest-profile';
import { displayCategoryForProduct } from '@/lib/display-category';

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function daysLeft(dateStr, nowMs) {
  if (!dateStr) return null;
  const today = new Date(nowMs); today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

// A small linked tile in the "Παρόμοιες προσφορές" strip. Plain <img> on
// purpose: these are tiny, and skipping the optimizer avoids the
// datacenter-blocked chain CDNs entirely.
function SimilarCard({ d }) {
  const [imgFailed, setImgFailed] = useState(false);
  const sm = SUPERMARKETS.find((s) => s.id === d.supermarket);
  return (
    <a className="similar-card" href={`/offer/${d.id}`}>
      <div className="similar-img">
        {d.imageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
        ) : (
          <CategoryIcon id={d.category} size={32} />
        )}
      </div>
      <div className="similar-name">{d.productName}</div>
      <div className="similar-foot">
        <span className="similar-price">{Number(d.discountedPrice).toFixed(2)}€</span>
        {sm && <span className="similar-chain" style={{ color: sm.color }}>{sm.short}</span>}
      </div>
    </a>
  );
}

// The single source of truth for what an offer looks like opened up. Rendered
// by BOTH the bottom sheet (ProductSheet) and the /offer/[id] page — the two
// used to be parallel implementations and drifted (the sheet lost the validity
// dates and the verdict). Keep every section here so they can't diverge again.
export function OfferDetails({ offer, comparison = [], history = null, similar = [], onAdd, compact = false }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  // Some chain CDNs (AB) 403 every off-site fetch — fall back to the category
  // icon instead of a blank void, same as the cards do.
  const [imgFailed, setImgFailed] = useState(false);
  // One clock snapshot per mount — date labels don't need live ticking, and an
  // impure Date.now() during render defeats memoization.
  const [nowMs] = useState(() => Date.now());
  const favorites = useShoppingListStore((s) => s.favorites);
  const toggleFavorite = useShoppingListStore((s) => s.toggleFavorite);
  const isFavorite = favorites.some((f) => f.key === favoriteKeyFor(offer));

  const discountedPrice = Number(offer.discountedPrice ?? offer.discounted_price);
  const originalPrice = offer.originalPrice ?? offer.original_price
    ? Number(offer.originalPrice ?? offer.original_price) : null;
  const discountPercent = offer.discountPercent ?? offer.discount_percent;
  // Raw offer name first: it matches this offer's price/pack ("9+3 Δώρο");
  // the canonical product.name can be a single-unit variant.
  const displayName = offer.productName || offer.product_name || offer.product?.name;
  const description = offer.product?.description || offer.description;
  const supermarketId = offer.supermarket || offer.supermarket_id;
  const category = displayCategoryForProduct(displayName, offer.category);

  // Offer-own image first — see DiscountCard: the catalog product's image can
  // be another chain's rotated/dead URL; the offer's own is always current.
  let displayImage = hiResImage(offer.imageUrl || offer.image_url || offer.product?.imageUrl);
  if (displayImage && !displayImage.startsWith('http') && !displayImage.startsWith('/')) {
    displayImage = `/wolt_images/${displayImage.split('/').pop()}`;
  }

  const sm = SUPERMARKETS.find((s) => s.id === supermarketId)
    || { name: supermarketId || '', color: 'var(--ink-2)' };
  const pct = discountPercent || (originalPrice && discountedPrice
    ? Math.round((1 - discountedPrice / originalPrice) * 100)
    : null);

  const dLeft = daysLeft(offer.validUntil, nowMs);
  const expiryUrgent = dLeft !== null && dLeft >= 0 && dLeft <= 2;
  const expiryLabel = dLeft === null ? '—'
    : dLeft < 0 ? 'Έχει λήξει'
    : dLeft === 0 ? 'Τελειώνει σήμερα'
    : dLeft === 1 ? 'Τελειώνει αύριο'
    : dLeft <= 2 ? `Τελειώνει σε ${dLeft} μέρες`
    : `Σε ${dLeft} ημέρες`;
  const validFromFull = formatDate(offer.validFrom ?? offer.valid_from);
  const validUntilFull = formatDate(offer.validUntil ?? offer.valid_until);
  const notStartedYet = offer.validFrom ? new Date(offer.validFrom).getTime() > nowMs : false;

  const handleAdd = () => {
    trackEvent({
      eventType: 'list_add',
      supermarket: supermarketId,
      discountId: offer.id,
      category,
      sessionId: getSessionId(),
    }).catch(() => {});
    recordInterest({ category, productName: displayName }, WEIGHT.listAdd);
    for (let i = 0; i < qty; i++) onAdd(offer);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className={`offer-details${compact ? ' compact' : ''}`}>
      <div className={`od-img${displayImage && !imgFailed ? '' : ' no-photo'}`}>
        {/* Same offer-type clarity as the card: a real −X% when the chain
            published a reference price, else the chain's own sticker text
            ("ΧΑΜΗΛΗ ΤΙΜΗ", "1+1") or a generic ΜΟΝΟ for hidden-reference promos.
            We deliberately do NOT show a computed "κανονική τιμή". */}
        {pct > 0 ? (
          <div className="discount-badge">-{pct}%</div>
        ) : !originalPrice ? (
          <div className="discount-badge" style={{ backgroundColor: 'var(--red-6)', fontSize: '0.7rem', padding: '4px 8px', letterSpacing: '0.5px' }}>
            {offer.description && offer.description.length <= 24 ? offer.description.toUpperCase() : 'ΜΟΝΟ'}
          </div>
        ) : null}
        <div className="chain-pill" style={{ color: sm.color }}>{sm.name}</div>
        {displayImage && !imgFailed ? (
          <div className="od-photo-frame">
            <Image
              src={displayImage}
              alt={displayName || ''}
              fill
              sizes={compact ? '(max-width: 640px) 100vw, 640px' : '(max-width: 820px) 100vw, 820px'}
              style={{ objectFit: 'contain' }}
              onError={() => setImgFailed(true)}
              // See DiscountCard: AB 403s the optimizer's IPs, not browsers.
              unoptimized={displayImage.includes('www.ab.gr')}
            />
          </div>
        ) : (
          <CategoryIcon id={category} size={64} />
        )}
      </div>

      <div className="od-body">
        {category && <div className="od-category">{category}</div>}
        <h2 className="od-title">{displayName}</h2>
        {description && <p className="od-desc">{description}</p>}

        <div className="od-price-row">
          <div>
            <div className="od-price-label">Τιμή προσφοράς</div>
            <div className="od-price">{discountedPrice.toFixed(2)}€</div>
          </div>
          {originalPrice && (
            <div>
              <div className="od-price-label">Αρχική</div>
              <div className="od-price-old">{originalPrice.toFixed(2)}€</div>
            </div>
          )}
        </div>

        {/* Honesty block: what the price actually buys. Multipack count ("9+3
            Δώρο" = 12 cans — the photo shows one) plus the shelf-label unit
            price (€/κιλό, €/λίτρο, €/μεζούρα) that makes pack sizes and
            shrinkflation comparable across chains. */}
        {(() => {
          const pack = parsePack(displayName);
          const perPiece = pack ? perUnitPrice(discountedPrice, pack.units) : null;
          const unit = unitPrice(displayName, discountedPrice);
          if (!perPiece && !unit) return null;
          const parts = [];
          if (perPiece) parts.push(`Η τιμή αφορά ${pack.units} τεμάχια — περίπου ${perPiece}€/τεμ.`);
          if (unit && unit.per !== 'τεμ.') parts.push(`≈ ${unit.value.toFixed(2)}€/${unit.per}`);
          else if (unit && !perPiece) parts.push(`≈ ${unit.value.toFixed(2)}€/τεμ.`);
          return <div className="od-pack">📦 {parts.join(' · ')}</div>;
        })()}

        {notStartedYet && validFromFull && (
          <div className="od-upcoming">Η προσφορά ξεκινά στις {validFromFull}</div>
        )}

        <div className="od-dates">
          <div className="od-date-box">
            <div className="od-date-label">Έναρξη</div>
            <div className="od-date-val">{validFromFull || '—'}</div>
          </div>
          <div className="od-date-box">
            <div className="od-date-label">Λήξη</div>
            <div className={`od-date-val${expiryUrgent ? ' urgent' : ''}`}>{expiryLabel}</div>
            {validUntilFull && <div className="od-date-sub">έως {validUntilFull}</div>}
          </div>
        </div>

        <div className="od-cta-row">
          <button
            type="button"
            className={`od-fav${isFavorite ? ' active' : ''}`}
            onClick={() => {
              if (!isFavorite) recordInterest({ category, productName: displayName }, WEIGHT.favorite);
              toggleFavorite(offer);
            }}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Αφαίρεση από τα αγαπημένα' : 'Προσθήκη στα αγαπημένα'}
            title={isFavorite ? 'Στα αγαπημένα — θα το βλέπεις στην αρχική όταν είναι σε προσφορά' : 'Παρακολούθησε αυτό το προϊόν'}
          >
            <Icon.Star size={18} filled={isFavorite} />
          </button>
          <div className="qty-stepper" aria-label="Ποσότητα">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Μείωση">
              <Icon.Minus size={14} />
            </button>
            <span className="qty-val">{qty}</span>
            <button type="button" onClick={() => setQty(qty + 1)} aria-label="Αύξηση">
              <Icon.Plus size={14} />
            </button>
          </div>
          <button
            type="button"
            className={`btn btn-lg od-add${added ? ' added' : ''}`}
            onClick={handleAdd}
            disabled={added}
          >
            {added ? '✓ Προστέθηκε' : 'Προσθήκη στη λίστα'}
          </button>
        </div>

        <PriceComparison offer={offer} comparison={comparison} compact={compact} />
        <PriceHistory history={history} compact={compact} />

        {similar.length > 0 && (
          <section style={{ marginTop: compact ? 14 : 18 }}>
            <div className="similar-title">Παρόμοιες προσφορές</div>
            <div className="similar-strip">
              {similar.map((d) => <SimilarCard key={d.id} d={d} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
