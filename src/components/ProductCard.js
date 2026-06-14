'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const CHAIN_ALIASES = {
  ab: ['ab', 'αβ'],
};

function cleanMeta(value) {
  const text = String(value || '').trim();
  return text && text !== '-' && text !== '—' ? text : null;
}

function isDifferentChainBrand(brand, supermarketId) {
  if (!brand || !supermarketId) return false;
  const b = normalize(brand);
  return SUPERMARKETS.some((s) => {
    if (s.id === supermarketId) return false;
    return [s.id, s.name, s.short, s.heroLabel, `${s.heroLabel || ''} ${s.heroSub || ''}`, ...(CHAIN_ALIASES[s.id] || [])]
      .filter(Boolean)
      .some((label) => normalize(label) === b);
  });
}

// Catalog card: a Product from the full catalog, with its current promoted
// offer when one exists. Offer cards open the same quick-view sheet used by the
// homepage/deals pages; non-offer products remain quiet info tiles.
export function ProductCard({ p, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const offer = p.offer;
  const displayName = offer?.productName || p.name;
  const supermarketId = offer?.supermarket || p.supermarket;
  const sm = supermarketId ? (SUPERMARKETS.find((s) => s.id === supermarketId) || { name: supermarketId, color: 'var(--ink-2)' }) : null;
  const brand = cleanMeta(p.brand);
  const unitInfo = cleanMeta(p.unitInfo);
  const visibleBrand = isDifferentChainBrand(brand, supermarketId) ? null : brand;
  const visibleUnitInfo = isDifferentChainBrand(unitInfo, supermarketId) ? null : unitInfo;
  const pct = offer && offer.originalPrice && offer.discountedPrice
    ? Math.round((1 - offer.discountedPrice / offer.originalPrice) * 100)
    : null;
  const showMono = offer && !pct && (offer.offerType === 'mono' || !offer.originalPrice);

  const imageCandidates = Array.from(new Set([offer?.imageUrl, p.imageUrl].filter(Boolean)));
  let displayImage = imageCandidates[imgIndex];
  if (displayImage && !displayImage.startsWith('http') && !displayImage.startsWith('/')) {
    displayImage = `/wolt_images/${displayImage.split('/').pop()}`;
  }

  const img = displayImage && !imgFailed ? (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Image
        src={displayImage}
        alt={displayName || ''}
        fill
        sizes="(max-width: 768px) 180px, 220px"
        style={{ objectFit: 'contain' }}
        onError={() => {
          if (imgIndex < imageCandidates.length - 1) {
            setImgIndex((i) => i + 1);
          } else {
            setImgFailed(true);
          }
        }}
        unoptimized={displayImage.includes('www.ab.gr')}
      />
    </div>
  ) : (
    <div className="catalog-img-empty" aria-hidden="true" />
  );

  const body = (
    <>
      <div className="card-img">
        <div className="card-top-strip">
          {pct > 0 ? (
            <div className="discount-badge">-{pct}%</div>
          ) : showMono ? (
            <div className="discount-badge" style={{ backgroundColor: 'var(--red-6)', fontSize: '0.65rem', padding: '3px 6px', letterSpacing: '0.5px' }}>
              {offer.description && offer.description.length <= 24 ? offer.description.toUpperCase() : 'ΜΟΝΟ'}
            </div>
          ) : null}
          {sm && (
            <div className="card-top-right">
              <div className="chain-pill" style={{ color: sm.color }}>{sm.name}</div>
            </div>
          )}
        </div>
        {img}
      </div>

      <div className="card-body">
        <h3 className="card-title" title={displayName}>{displayName}</h3>
        {(visibleBrand || visibleUnitInfo) && (
          <div style={{ fontSize: 11, color: 'var(--ink-3, #888)', marginBottom: 6 }}>
            {[visibleBrand, visibleUnitInfo].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="card-price-row">
          {offer ? (
            <div className={offer.originalPrice ? 'has-discount' : undefined}>
              <div className="price">{offer.discountedPrice?.toFixed(2)}€</div>
              {offer.originalPrice && <div className="price-old">{offer.originalPrice.toFixed(2)}€</div>}
            </div>
          ) : (
            <div className="catalog-card-muted">Κατάλογος</div>
          )}
        </div>
      </div>
    </>
  );

  if (!offer) {
    return <div className="card" aria-disabled="true">{body}</div>;
  }

  if (!onSelect) {
    return (
      <Link href={`/offer/${offer.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" className="card catalog-card-button" onClick={() => onSelect(offer)}>
      {body}
    </button>
  );
}
