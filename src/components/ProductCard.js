'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import { SUPERMARKETS } from '@/lib/constants';

// Catalog card: a Product from the full catalog, with its cheapest CURRENT offer
// when one exists. Deliberately price-silent for non-offer items: the catalog is
// browsable, but only true active offers get price treatment.
export function ProductCard({ p }) {
  const [imgFailed, setImgFailed] = useState(false);
  const offer = p.offer;
  const category = offer?.category || 'Άλλο';
  const sm = offer ? (SUPERMARKETS.find((s) => s.id === offer.supermarket) || { name: offer.supermarket, color: 'var(--ink-2)' }) : null;
  const pct = offer && offer.originalPrice && offer.discountedPrice
    ? Math.round((1 - offer.discountedPrice / offer.originalPrice) * 100)
    : null;
  const showMono = offer && !pct && (offer.offerType === 'mono' || !offer.originalPrice);

  const img = p.imageUrl && !imgFailed ? (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Image
        src={p.imageUrl}
        alt={p.name || ''}
        fill
        sizes="(max-width: 768px) 180px, 220px"
        style={{ objectFit: 'contain' }}
        onError={() => setImgFailed(true)}
        unoptimized={p.imageUrl.includes('www.ab.gr')}
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
        <h3 className="card-title" title={p.name}>{p.name}</h3>
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

  // On offer → tappable, deep-links to the offer page. Otherwise an info tile.
  return offer ? (
    <Link href={`/offer/${offer.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    <div className="card" aria-disabled="true">{body}</div>
  );
}
