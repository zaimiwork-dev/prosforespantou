'use client';

import { useState } from 'react';
import { DealGrid } from './DealGrid';
import { groupSupermarketDealsByAisle } from '@/lib/supermarket-aisles';

const PREVIEW_SIZE = 6;

export function SupermarketAisles({ deals, onAdd, onSelect }) {
  const [expanded, setExpanded] = useState({});
  const aisles = groupSupermarketDealsByAisle(deals);

  return (
    <div className="supermarket-aisles">
      {aisles.map((aisle) => {
        const isExpanded = expanded[aisle.key] === true;
        const visible = isExpanded ? aisle.deals : aisle.deals.slice(0, PREVIEW_SIZE);
        const remaining = aisle.deals.length - visible.length;

        return (
          <section className="supermarket-aisle" key={aisle.key}>
            <div className="supermarket-aisle-head">
              <div className="supermarket-aisle-title">
                <span aria-hidden="true">{aisle.emoji}</span>
                <h3>{aisle.label}</h3>
              </div>
              <span>{aisle.deals.length.toLocaleString('el-GR')} εμφανίζονται</span>
            </div>

            <DealGrid
              deals={visible}
              loading={false}
              loadingMore={false}
              onAdd={onAdd}
              onSelect={onSelect}
              showCompletionMessage={false}
            />

            {remaining > 0 && (
              <button
                type="button"
                className="supermarket-aisle-more"
                onClick={() => setExpanded((current) => ({ ...current, [aisle.key]: true }))}
              >
                Εμφάνιση ακόμη {remaining.toLocaleString('el-GR')}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
