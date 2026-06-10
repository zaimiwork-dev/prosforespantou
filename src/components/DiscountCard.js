'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';
import { isPositiveVerdict } from '@/lib/price-verdict';

// Honest "good deal" labels — only positive verdicts ever reach the card
// (lib/price-verdict.ts gates on >=3 points + real price spread).
const VERDICT_LABEL = { lowest: '🔥 Χαμηλότερη τιμή', good: '✅ Καλή τιμή' };

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

function formatShortDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DiscountCard({ d, onAdd, onSelect, inCart = false }) {
  const [imgFailed, setImgFailed] = useState(false);

  const discountedPrice = d.discountedPrice ?? d.discounted_price;
  const originalPrice   = d.originalPrice   ?? d.original_price;
  const validUntil      = d.validUntil      ?? d.valid_until;
  const validFrom       = d.validFrom       ?? d.valid_from;
  const discountPercent = d.discountPercent ?? d.discount_percent;
  const category        = d.category;
  const supermarketId   = d.supermarket || d.supermarket_id;

  const sm = SUPERMARKETS.find((s) => s.id === supermarketId) || { name: supermarketId, color: "var(--ink-2)", short: "??" };
  const pct = discountPercent || (originalPrice && discountedPrice
    ? Math.round((1 - discountedPrice / originalPrice) * 100)
    : null);

  const isFeatured = d.isFeatured;
  const featuredLabel = d.featuredLabel ?? 'Χορηγούμενο';

  // Sources are attached by lib/group-deals.js when the same product has
  // active rows in multiple pipelines (web + leaflet). Falls back to the
  // single-row source when the helper hasn't been run.
  // We only chip the user-facing sources — 'wolt' is an internal
  // collection-method label (rows scraped from Wolt's strikethrough pricing)
  // and shouldn't leak into the UI as a tag.
  const USER_FACING_SOURCES = new Set(['web', 'leaflet', 'manual']);
  const rawSources = d.sources && d.sources.length > 0 ? d.sources : (d.source ? [d.source] : []);
  const sources = rawSources.filter((s) => USER_FACING_SOURCES.has(s));
  const sourceLabel = (s) => (s === 'web' ? 'Εβδομαδιαία' : s === 'leaflet' ? 'Φυλλάδιο' : s === 'manual' ? 'Manual' : s);

  // Raw offer name first: it matches this offer's price/pack ("9+3 Δώρο");
  // the canonical product.name can be a single-unit variant.
  const displayName = d.productName || d.product_name || d.product?.name;
  let displayImage = d.product?.imageUrl || d.imageUrl || d.image_url;
  if (displayImage && !displayImage.startsWith('http') && !displayImage.startsWith('/')) {
    displayImage = `/wolt_images/${displayImage.split('/').pop()}`;
  }

  const dLeft = daysLeft(validUntil);
  const urgent = dLeft !== null && dLeft >= 0 && dLeft <= 2;
  const expiryLabel = urgent
    ? (dLeft === 0 ? "Λήγει σήμερα" : dLeft === 1 ? "Λήγει αύριο" : `Λήγει σε ${dLeft} μέρες`)
    : validUntil ? `Έως ${formatShortDate(validUntil)}` : null;

  const startsLabel = validFrom && new Date(validFrom).getTime() > Date.now()
    ? `Ξεκινά ${formatShortDate(validFrom)}`
    : null;

  const showVerdict = isPositiveVerdict(d.priceVerdict);

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => {
        trackEvent({
          eventType: 'deal_click',
          supermarket: supermarketId,
          discountId: d.id,
          category: category,
          sessionId: getSessionId(),
        }).catch(() => {});
        onSelect(d);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(d); }}
    >
      <div className="card-img">
        {isFeatured && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: sm.color,
            color: '#fff',
            fontSize: 9,
            fontWeight: 800,
            padding: '2px 6px',
            borderRadius: 4,
            zIndex: 2,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            {featuredLabel}
          </div>
        )}
        
        {pct > 0 ? (
          <div className="discount-badge">-{pct}%</div>
        ) : !originalPrice ? (
          // Prefer the chain's printed sticker text ("-25%", "1+1", "ΧΑΜΗΛΗ
          // ΤΙΜΗ") over a generic ΜΟΝΟ when we have it — way more honest.
          d.description && d.description.length <= 24 ? (
            <div className="discount-badge" style={{ backgroundColor: 'var(--red-6)', fontSize: '0.65rem', padding: '3px 6px', letterSpacing: '0.5px' }}>{d.description.toUpperCase()}</div>
          ) : (
            <div className="discount-badge" style={{ backgroundColor: 'var(--red-6)', fontSize: '0.65rem', padding: '3px 6px', letterSpacing: '0.5px' }}>ΜΟΝΟ</div>
          )
        ) : null}
        
        <div className="chain-pill" style={{ color: sm.color }}>{sm.name}</div>

        {displayImage && !imgFailed ? (
          <div style={{ position: "relative", width: "92%", height: "92%" }}>
            <Image
              src={displayImage}
              alt={displayName || ""}
              fill
              sizes="(max-width: 768px) 180px, 220px"
              style={{ objectFit: "contain" }}
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <div className="card-img-placeholder">
            <CategoryIcon id={category} size={48} />
          </div>
        )}

        {startsLabel ? (
          <div className="expiry-chip">
            <Icon.Clock size={11} />
            <span>{startsLabel}</span>
          </div>
        ) : expiryLabel ? (
          <div className={`expiry-chip${urgent ? " soon" : ""}`}>
            <Icon.Clock size={11} />
            <span>{expiryLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="card-body">
        <h3 className="card-title" title={displayName}>{displayName}</h3>

        {sources.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {sources.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: s === 'leaflet' ? '#fef3c7' : s === 'web' ? '#dbeafe' : '#e5e7eb',
                  color: s === 'leaflet' ? '#92400e' : s === 'web' ? '#1e40af' : '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                }}
              >
                {sourceLabel(s)}
              </span>
            ))}
          </div>
        )}

        {showVerdict && (
          <div className="verdict-pill">{VERDICT_LABEL[d.priceVerdict]}</div>
        )}

        <div className="card-price-row">
          <div className={originalPrice ? "has-discount" : undefined}>
            <div className="price">{discountedPrice?.toFixed(2)}€</div>
            {originalPrice && <div className="price-old">{originalPrice.toFixed(2)}€</div>}
          </div>
          <button
            type="button"
            className={`add-btn${inCart ? " added" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              trackEvent({
                eventType: 'list_add',
                supermarket: supermarketId,
                discountId: d.id,
                category: category,
                sessionId: getSessionId(),
              }).catch(() => {});
              onAdd(d);
            }}
            aria-label={inCart ? "Στη λίστα" : "Προσθήκη στη λίστα"}
          >
            {inCart ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
