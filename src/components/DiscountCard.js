'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { CategoryIcon } from './CategoryIcon';
import { Icon } from './Icons';
import { SUPERMARKETS } from '@/lib/constants';
import { track } from '@/lib/track';
import { observeImpression } from '@/lib/impressions';
import { useShoppingListStore } from '@/lib/store';
import { surfaceFromPath } from '@/lib/impression-queue';
import { isPositiveVerdict } from '@/lib/price-verdict';
import { displayCategoryForProduct } from '@/lib/display-category';
import { expiryInfo } from '@/lib/expiry-label';
import { splitNameAndSize, unitPrice } from '@/lib/pack-info';
import { baselineForCard } from '@/lib/baseline-price';

// Honest "good deal" labels — only positive verdicts ever reach the card
// (lib/price-verdict.ts gates on >=3 points + real price spread).
const VERDICT_LABEL = { lowest: 'Χαμηλότερη τιμή', good: 'Καλή τιμή' };
const VERDICT_ICON = { lowest: Icon.Fire, good: Icon.Check };

// `list` names the surface the card sits in ("home:essentials", "deals" …;
// defaults to the route) and `position` its slot — both ride on impressions,
// clicks and list adds so click-through can be read per rail and per slot.
export function DiscountCard({ d, onAdd, onSelect, inCart = false, list, position }) {
  const [imgFailed, setImgFailed] = useState(false);
  const cardRef = useRef(null);
  // Snapshot the clock once per mount: expiry labels don't need sub-mount
  // freshness, and an impure Date.now() in render defeats memoization.
  const [nowMs] = useState(() => Date.now());

  const discountedPrice = d.discountedPrice ?? d.discounted_price;
  const originalPrice   = d.originalPrice   ?? d.original_price;
  const validUntil      = d.validUntil      ?? d.valid_until;
  const validFrom       = d.validFrom       ?? d.valid_from;
  const discountPercent = d.discountPercent ?? d.discount_percent;
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
  const category = displayCategoryForProduct(displayName, d.category);
  // Pack size on its own line (the 2-line clamp used to eat it) and the
  // shelf-label unit price a Greek shopper actually compares (€/κιλό, €/λίτρο).
  const nameParts = splitNameAndSize(displayName);
  const unit = unitPrice(displayName, discountedPrice)
    || (d.product?.unitInfo ? unitPrice(`${displayName} ${d.product.unitInfo}`, discountedPrice) : null);
  // Offer's OWN image first, for the same reason: it comes from the chain
  // currently selling the deal, so it's alive and shows the right pack. The
  // catalog product's image is whichever chain's CDN we saw FIRST — masoutis
  // promo images rotate away and wolt-era links die, so when the 06-12 scrape
  // matched 4k mymarket rows to products, product-first display made
  // thousands of live images "disappear" overnight.
  let displayImage = d.imageUrl || d.image_url || d.product?.imageUrl;
  if (displayImage && !displayImage.startsWith('http') && !displayImage.startsWith('/')) {
    displayImage = `/wolt_images/${displayImage.split('/').pop()}`;
  }

  // Honest dates: "Έως/Λήγει" vocabulary only when the chain published the
  // window (datesFromSource); otherwise "Ελέγχθηκε DD/MM" from updatedAt
  // (bumped by every scrape run that still sees the offer live).
  const exp = expiryInfo({
    validFrom,
    validUntil,
    updatedAt: d.updatedAt ?? d.updated_at,
    datesFromSource: d.datesFromSource ?? d.dates_from_source,
  }, nowMs);

  const showVerdict = isPositiveVerdict(d.priceVerdict);
  const VerdictIcon = VERDICT_ICON[d.priceVerdict];

  // Precomputed count of OTHER chains the comparison sheet renders rows for
  // (recompute-comparison-counts.mjs). +1 = total stores with a price shown,
  // which is what the shopper cares about. 0/undefined → no chip.
  const compareChains = (d.comparisonCount ?? d.comparison_count ?? 0) + 1;
  const showCompare = compareChains >= 2;

  // «κανονικά ~Y€» for ΜΟΝΟ offers at least 10% under the same chain's shelf
  // price (lib/baseline-price, owner decision #2). Deliberately a grey note,
  // not a struck-through price: the chain never published this number, we
  // derived it from that chain's own catalogue.
  const baseline = baselineForCard(d);
  const baselineTitle = baseline
    ? `Η τιμή που χρεώνει συνήθως το ίδιο κατάστημα για το ίδιο προϊόν${baseline.checkedAt ? `, όπως την είδαμε στις ${baseline.checkedAt.toLocaleDateString('el-GR')}` : ''}. Δική μας εκτίμηση από τον κατάλογο του καταστήματος, όχι προσφορά που ανακοίνωσε η αλυσίδα.`
    : undefined;

  const page = () => list || surfaceFromPath(typeof window !== 'undefined' ? window.location.pathname : '/');

  // Is this card's chain one the shopper ticked? Sent with the impression and
  // the tap as a one-word label about the SLOT, never about the person — with
  // anonymous events carrying no identifier it is the only way to answer
  // whether the preferred-store boost (rows 24 and 32) earns its place. Absent
  // entirely when the shopper has ticked nothing, because then there is no
  // question to answer.
  const preferredStores = useShoppingListStore((s) => s.preferredStores);
  const slotContext =
    !preferredStores?.length || !supermarketId
      ? undefined
      : preferredStores.includes(supermarketId) ? 'mine' : 'other';

  useEffect(() => {
    return observeImpression(cardRef.current, {
      discountId: d.id,
      supermarket: supermarketId || undefined,
      page: list || surfaceFromPath(window.location.pathname),
      position,
      context: slotContext,
    });
  }, [d.id, supermarketId, list, position, slotContext]);

  return (
    <div
      ref={cardRef}
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => {
        track({
          eventType: 'deal_click',
          supermarket: supermarketId,
          discountId: d.id,
          category: category,
          page: page(),
          position,
          context: slotContext,
        });
        onSelect(d);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(d); }}
    >
      <div className="card-img">
        {/* One flex strip instead of absolute corners — long chain names
            ("AB Vassilopoulos") used to slide over the discount badge on
            narrow cards. The pill now shrinks/ellipsizes instead. */}
        <div className="card-top-strip">
          {pct > 0 ? (
            <div className="discount-badge">-{pct}%</div>
          ) : !originalPrice ? (
            // Prefer the chain's printed sticker text ("-25%", "1+1", "ΧΑΜΗΛΗ
            // ΤΙΜΗ") over a generic ΜΟΝΟ when we have it — way more honest.
            d.description && d.description.length <= 24 ? (
              <div className="discount-badge" style={{ backgroundColor: 'var(--accent)', fontSize: '0.65rem', padding: '3px 6px', letterSpacing: '0.5px' }}>{d.description.toUpperCase()}</div>
            ) : (
              <div className="discount-badge" style={{ backgroundColor: 'var(--accent)', fontSize: '0.65rem', padding: '3px 6px', letterSpacing: '0.5px' }}>ΜΟΝΟ</div>
            )
          ) : null}
          <div className="card-top-right">
            {isFeatured && (
              <div style={{
                background: sm.color,
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                whiteSpace: 'nowrap',
              }}>
                {featuredLabel}
              </div>
            )}
            <div className="chain-pill" style={{ color: sm.color }}>{sm.name}</div>
          </div>
        </div>

        {displayImage && !imgFailed ? (
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Image
              src={displayImage}
              alt={displayName || ""}
              fill
              sizes="(max-width: 768px) 180px, 220px"
              style={{ objectFit: "contain" }}
              onError={() => setImgFailed(true)}
              // AB's host 403s datacenter IPs (the Vercel-side optimizer), but
              // lets real browsers through — skip the optimizer for that host
              // so the user's own browser fetches it. onError still covers a no.
              unoptimized={displayImage.includes('www.ab.gr')}
            />
          </div>
        ) : (
          <div className="card-img-placeholder">
            <CategoryIcon id={category} size={48} />
          </div>
        )}

        {exp.chip ? (
          <div className={`expiry-chip${exp.urgent ? " soon" : ""}`}>
            <Icon.Clock size={11} />
            <span>{exp.chip}</span>
          </div>
        ) : null}
      </div>

      <div className="card-body">
        {/* «Τα βασικά της εβδομάδας» names the staple the card answers for —
            the product title alone («GMUNDNER MILCH …») doesn't say «Γάλα». */}
        {d.essential?.label && <div className="card-eyebrow">{d.essential.label}</div>}
        <h3 className="card-title" title={displayName}>{nameParts.title}</h3>
        {nameParts.size && <div className="card-size">{nameParts.size}</div>}

        {/* Source tags only when a product is genuinely in BOTH the weekly
            web offers and the leaflet — on every card the tag was noise. */}
        {sources.length >= 2 && (
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

        {(showVerdict || showCompare) && (
          <div className="pill-row">
            {showVerdict && (
              <div className="verdict-pill">
                {VerdictIcon && <VerdictIcon size={12} />}
                <span>{VERDICT_LABEL[d.priceVerdict]}</span>
              </div>
            )}
            {showCompare && (
              <div className="compare-pill">
                <Icon.Store size={12} />
                <span>Τιμές σε {compareChains} καταστήματα</span>
              </div>
            )}
          </div>
        )}

        <div className="card-price-row">
          <div className={originalPrice ? "has-discount" : undefined}>
            <div className="price">{discountedPrice?.toFixed(2)}€</div>
            {originalPrice && <div className="price-old">{originalPrice.toFixed(2)}€</div>}
            {unit && <div className="price-unit">{unit.value.toFixed(2)}€/{unit.per}</div>}
            {baseline && (
              <div className="price-baseline" title={baselineTitle}>
                κανονικά ~{baseline.price.toFixed(2)}€
              </div>
            )}
          </div>
          <button
            type="button"
            className={`add-btn${inCart ? " added" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              track({
                eventType: 'list_add',
                supermarket: supermarketId,
                discountId: d.id,
                category: category,
                page: page(),
                position,
              });
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
