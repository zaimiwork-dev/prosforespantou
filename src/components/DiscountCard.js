'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';

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

  const displayName = d.product?.name || d.productName || d.product_name;
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

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(d)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(d); }}
    >
      <div className="card-img">
        {pct > 0 && <div className="discount-badge">-{pct}%</div>}
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

        <div className="card-price-row">
          <div>
            <div className="price">{discountedPrice?.toFixed(2)}€</div>
            {originalPrice && <div className="price-old">{originalPrice.toFixed(2)}€</div>}
          </div>
          <button
            type="button"
            className={`add-btn${inCart ? " added" : ""}`}
            onClick={(e) => { e.stopPropagation(); onAdd(d); }}
            aria-label={inCart ? "Στη λίστα" : "Προσθήκη στη λίστα"}
          >
            {inCart ? <Icon.Check size={16} /> : <Icon.Plus size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
