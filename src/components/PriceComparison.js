'use client';

import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';
import { formatShortDate } from '@/lib/expiry-label';

// Cross-chain price table for one product — THE differentiator, so it renders
// identically everywhere (offer page + product sheet). The row being viewed is
// inert; every other OFFER row deep-links to that chain's offer. SHELF rows
// («Κανονική τιμή» — chains with no active offer, price from the latest normal
// shelf snapshot) are inert too: there is no offer page behind them. ΦΘΗΝΟΤΕΡΑ
// goes to the absolute cheapest row, shelf or offer — "where do I pay least"
// stays honest; the tag disambiguates when a plain shelf price beats the deal.
export function PriceComparison({ offer, comparison, compact = false }) {
  if (!comparison || comparison.length === 0) return null;

  const sm = SUPERMARKETS.find((s) => s.id === offer.supermarket)
    || { name: offer.store?.name || '', color: 'var(--ink-2)' };

  const rows = [
    { id: offer.id, price: Number(offer.discountedPrice), sm, isCurrent: true, isShelf: false },
    ...comparison.map((c) => {
      const chain = SUPERMARKETS.find((s) => s.id === c.supermarket)
        || { name: c.store?.name || c.supermarket || '', color: '#888' };
      return c.rowType === 'shelf'
        ? { id: c.id, price: Number(c.price), sm: chain, isCurrent: false, isShelf: true, asOf: c.recordedAt }
        : { id: c.id, price: Number(c.discountedPrice), sm: chain, isCurrent: false, isShelf: false };
    }),
  ].sort((a, b) => a.price - b.price);
  const cheapest = rows[0];
  const otherCount = rows.length - 1;

  return (
    <section style={{ marginTop: compact ? 18 : 28 }}>
      <div className="pc-head">
        <h2>Σύγκριση τιμής</h2>
        <span>{otherCount} ακόμη {otherCount === 1 ? 'κατάστημα' : 'καταστήματα'}</span>
      </div>

      <div className="pc-table">
        {rows.map((row) => {
          const isCheapest = row.id === cheapest.id;
          const diff = row.price - cheapest.price;
          const body = (
            <>
              <div className="pc-chain" style={{ background: row.sm.color }}>
                {row.sm.name.toUpperCase()}
              </div>
              <div className="pc-tags">
                {isCheapest && <span className="pc-best">ΦΘΗΝΟΤΕΡΑ</span>}
                {row.isCurrent && <span className="pc-current">Βλέπεις τώρα</span>}
                {row.isShelf && (
                  <span className="pc-normal">
                    Κανονική τιμή{row.asOf ? ` · ${formatShortDate(row.asOf)}` : ''}
                  </span>
                )}
                {!isCheapest && diff > 0 && <span className="pc-diff">+{diff.toFixed(2)}€</span>}
              </div>
              <div className="pc-price">{row.price.toFixed(2)}€</div>
            </>
          );
          return row.isCurrent ? (
            <div key={row.id} className="pc-row is-current">{body}</div>
          ) : row.isShelf ? (
            <div key={row.id} className="pc-row is-shelf">{body}</div>
          ) : (
            <Link key={row.id} href={`/offer/${row.id}`} className="pc-row">{body}</Link>
          );
        })}
      </div>
    </section>
  );
}
