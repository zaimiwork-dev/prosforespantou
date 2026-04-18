'use client';

import Link from 'next/link';
import { SUPERMARKETS } from '@/lib/constants';

export function SupermarketTiles({ counts = {} }) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Περιήγηση ανά σούπερ μάρκετ</h2>
          <div className="sub">Φίλτραρε προσφορές από την αλυσίδα που προτιμάς</div>
        </div>
      </div>

      <div className="chains-row">
        {SUPERMARKETS.map((sm) => {
          const count = counts[sm.id] || 0;
          return (
            <Link key={sm.id} href={`/supermarket/${sm.id}`} className="chain-tile">
              <div
                className="chain-logo"
                style={{ background: sm.bg, color: sm.color }}
              >
                {sm.short}
              </div>
              <div className="chain-name">{sm.name}</div>
              <div className="chain-count">
                {count > 0 ? `${count.toLocaleString("el-GR")} προσφορές` : "Σύντομα"}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
