'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';

export function SupermarketTiles({ counts = {} }) {
  // Split into live chains (have offers) vs upcoming (Σύντομα). We sort live
  // by offer count desc so the chains with the most to show lead. Upcoming
  // chains render in a dimmed second row so the homepage doesn't look 60%
  // empty before all 10 chains are live.
  const live = SUPERMARKETS
    .map((sm) => ({ sm, count: counts[sm.id] || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
  const upcoming = SUPERMARKETS
    .map((sm) => ({ sm, count: counts[sm.id] || 0 }))
    .filter((x) => x.count === 0);

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Περιήγηση ανά κατάστημα</h2>
        </div>
      </div>

      <div className="chains-row">
        {live.map(({ sm, count }) => (
          <ChainTile key={sm.id} sm={sm} count={count} />
        ))}
      </div>

      {upcoming.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-2)', marginBottom: 10 }}>
            Σύντομα κοντά μας
          </div>
          <div className="chains-row" style={{ opacity: 0.55 }}>
            {upcoming.map(({ sm, count }) => (
              <ChainTile key={sm.id} sm={sm} count={count} upcoming />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ChainTile({ sm, count, upcoming = false }) {
  const [imgErr, setImgErr] = useState(false);
  const inner = (
    <>
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
      <div className="chain-count">
        {count > 0 ? `${count.toLocaleString("el-GR")} προσφορές` : "Σύντομα"}
      </div>
    </>
  );
  // Upcoming chains aren't browsable yet — render as a dead tile, not a link.
  if (upcoming) {
    return <div className="chain-tile" style={{ cursor: 'default' }}>{inner}</div>;
  }
  return <Link href={`/supermarket/${sm.id}`} className="chain-tile">{inner}</Link>;
}
