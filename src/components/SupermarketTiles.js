'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';

export function SupermarketTiles({ counts = {} }) {
  // One horizontal strip of the chains that have offers today, most offers
  // first. The old 2-column grid stacked four rows of 210px tiles on a phone
  // (plus a dimmed «Σύντομα» row of dead tiles) — a whole screen of scrolling
  // to get past navigation. Chains with nothing live are simply not listed.
  const live = SUPERMARKETS
    .map((sm) => ({ sm, count: counts[sm.id] || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  if (live.length === 0) return null;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Ανά κατάστημα</h2>
        </div>
      </div>

      <div className="chains-strip">
        {live.map(({ sm, count }) => (
          <ChainTile key={sm.id} sm={sm} count={count} />
        ))}
      </div>
    </section>
  );
}

function ChainTile({ sm, count }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Link href={`/supermarket/${sm.id}`} className="chain-tile chain-tile--strip">
      <div className="chain-logo" style={{ background: sm.bg, color: sm.color }}>
        {!imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/logos/${sm.logo || `${sm.id}.png`}`}
            alt=""
            onError={() => setImgErr(true)}
          />
        ) : (
          <span className="chain-logo-fallback">{sm.short}</span>
        )}
      </div>
      <div className="chain-name">{sm.name}</div>
      <div className="chain-count">{count.toLocaleString("el-GR")} προσφορές</div>
    </Link>
  );
}
