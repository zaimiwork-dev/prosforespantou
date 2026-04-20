'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';

export function SupermarketTiles({ counts = {} }) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Περιήγηση ανά σούπερ μάρκετ</h2>
        </div>
      </div>

      <div className="chains-row">
        {SUPERMARKETS.map((sm) => (
          <ChainTile key={sm.id} sm={sm} count={counts[sm.id] || 0} />
        ))}
      </div>
    </section>
  );
}

function ChainTile({ sm, count }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Link href={`/supermarket/${sm.id}`} className="chain-tile">
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
    </Link>
  );
}
