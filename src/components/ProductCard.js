'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { SUPERMARKETS } from '@/lib/constants';
import { displayCategoryForProduct } from '@/lib/display-category';

// Catalog card: a Product from the full catalog, with its current promoted
// offer when one exists. Offer cards open the same quick-view sheet used by the
// homepage/deals pages; non-offer products remain quiet info tiles.
export function ProductCard({ p, onSelect }) {
  const [imgFailed, setImgFailed] = useState(false);
  const offer = p.offer;
  const displayName = offer?.productName || p.name;
  const category = displayCategoryForProduct(displayName, offer?.category || 'Άλλο');
  const sm = offer ? (SUPERMARKETS.find((s) => s.id === offer.supermarket) || { name: offer.supermarket, color: 'var(--ink-2)' }) : null;
  const pct = offer && offer.originalPrice && offer.discountedPrice
    ? Math.round((1 - offer.discountedPrice / offer.originalPrice) * 100)
    : null;
  const showMono = offer && !pct && (offer.offerType === 'mono' || !offer.originalPrice);

  let displayImage = offer?.imageUrl || p.imageUrl;
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
        onError={() => setImgFailed(true)}
        unoptimized={displayImage.includes('www.ab.gr')}
      />
    </div>
  ) : (
    <div className="card-img-placeholder">
      <CategoryIcon id={category} size={48} />
    </div>
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
        {(p.brand || p.unitInfo) && (
          <div style={{ fontSize: 11, color: 'var(--ink-3, #888)', marginBottom: 6 }}>
            {[p.brand, p.unitInfo].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="card-price-row">
          {offer ? (
            <div className={offer.originalPrice ? 'has-discount' : undefined}>
              <div className="price">{offer.discountedPrice?.toFixed(2)}€</div>
              {offer.originalPrice && <div className="price-old">{offer.originalPrice.toFixed(2)}€</div>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-3, #999)' }}>Όχι σε προσφορά τώρα</div>
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
