'use client';

// Price-history block: honest, readable, touchable.
// - Step line (prices HOLD between snapshots — diagonal interpolation would
//   invent prices we never saw).
// - Date axis (first → last), €-labels for the low/high bounds.
// - The lowest point is always marked; hovering/tapping anywhere shows the
//   nearest snapshot's date + price.
// - Fewer than 3 points: show a "tracking started" note instead of nothing,
//   so the section reads as functional from day one.
//
// Product decision: only GOOD-deal verdicts get a badge — we highlight real
// lows, stay silent on mediocre prices, and never show a fake-positive.

import { useState } from 'react';
import { isPositiveVerdict } from '@/lib/price-verdict';
import { formatShortDate } from '@/lib/expiry-label';

const VERDICT_STYLE = {
  lowest: { bg: '#d1fae5', fg: '#065f46', label: '🔥 Χαμηλότερη τιμή που έχουμε δει' },
  good:   { bg: '#dcfce7', fg: '#166534', label: '✅ Καλή τιμή' },
};

// Internal drawing space; the svg scales to its container.
const W = 560;
const H = 150;
const PAD_X = 34;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

export function PriceHistory({ history, compact = false }) {
  const [active, setActive] = useState(null);

  if (!history || !history.points || history.points.length === 0) return null;

  const { points, min, avg, verdict, percentAboveMin } = history;

  const style = VERDICT_STYLE[verdict];
  const showBadge = isPositiveVerdict(verdict) && style;

  const head = (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: '0.6px',
      textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6,
    }}>
      Ιστορικό τιμής
    </div>
  );

  // Tracking just started — say so instead of rendering nothing.
  if (points.length < 3) {
    return (
      <section style={{ marginTop: compact ? 14 : 18 }}>
        {head}
        <div style={{
          border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
          background: 'var(--surface)', padding: '12px 14px',
          fontSize: 12, color: 'var(--ink-3)', fontWeight: 500,
        }}>
          Παρακολουθούμε την τιμή από τις {formatShortDate(points[0].recordedAt)} —
          το διάγραμμα χτίζεται όσο μαζεύουμε μετρήσεις.
        </div>
      </section>
    );
  }

  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = (hi - lo) || lo * 0.1 || 1;
  const yLo = lo - span * 0.08;
  const ySpan = span * 1.16;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const x = (i) => PAD_X + (i / (points.length - 1)) * innerW;
  const y = (price) => PAD_TOP + (1 - (price - yLo) / ySpan) * innerH;

  // Step path: hold each price until the next snapshot.
  let d = `M ${x(0).toFixed(1)} ${y(prices[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${x(i).toFixed(1)} ${y(prices[i - 1]).toFixed(1)} L ${x(i).toFixed(1)} ${y(prices[i]).toFixed(1)}`;
  }
  const area = `${d} L ${x(points.length - 1).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} L ${x(0).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`;

  const minIdx = prices.indexOf(lo);
  const lastIdx = points.length - 1;

  const pickNearest = (clientX, target) => {
    const rect = target.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width; // 0..1 across the svg
    const px = fx * W;
    const idx = Math.round(((px - PAD_X) / innerW) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, idx)));
  };

  // Tooltip for the active (or min, as the resting state) point.
  const tipIdx = active ?? minIdx;
  const tipIsMin = tipIdx === minIdx;
  const tipX = x(tipIdx);
  const tipPrice = prices[tipIdx];
  const tipLabel = `${tipPrice.toFixed(2)}€ · ${formatShortDate(points[tipIdx].recordedAt)}${tipIsMin ? ' · χαμηλότερη' : ''}`;
  const tipW = tipLabel.length * 6.4 + 14;
  const tipBoxX = Math.max(2, Math.min(W - tipW - 2, tipX - tipW / 2));

  return (
    <section style={{ marginTop: compact ? 14 : 18 }}>
      {head}

      <div style={{
        border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
        background: 'var(--surface)', padding: compact ? '10px 12px' : '12px 14px',
      }}>
        {showBadge && (
          <div style={{
            display: 'inline-block', background: style.bg, color: style.fg,
            fontSize: 11, fontWeight: 800, padding: '4px 10px',
            borderRadius: 8, letterSpacing: '0.2px', marginBottom: 8,
          }}>
            {style.label}
          </div>
        )}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y', cursor: 'crosshair' }}
          onPointerMove={(e) => pickNearest(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pickNearest(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={`Ιστορικό τιμής: χαμηλότερη ${lo.toFixed(2)} ευρώ, υψηλότερη ${hi.toFixed(2)} ευρώ`}
        >
          {/* low/high guide lines + € labels */}
          <line x1={PAD_X} x2={W - PAD_X} y1={y(hi)} y2={y(hi)} stroke="var(--line)" strokeDasharray="3 4" />
          <line x1={PAD_X} x2={W - PAD_X} y1={y(lo)} y2={y(lo)} stroke="#10b981" strokeOpacity="0.45" strokeDasharray="3 4" />
          <text x={PAD_X - 5} y={y(hi) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-3)">{hi.toFixed(2)}€</text>
          <text x={PAD_X - 5} y={y(lo) + 3.5} textAnchor="end" fontSize="10" fill="#059669">{lo.toFixed(2)}€</text>

          <path d={area} fill="#009de0" fillOpacity="0.07" />
          <path d={d} fill="none" stroke="#009de0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* snapshot dots (skip when dense) */}
          {points.length <= 40 && points.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(prices[i])} r="2.4" fill="#009de0" fillOpacity={i === tipIdx ? 0 : 0.5} />
          ))}

          {/* the low + the latest snapshot, always visible */}
          <circle cx={x(minIdx)} cy={y(lo)} r="4" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
          <circle cx={x(lastIdx)} cy={y(prices[lastIdx])} r="4" fill="#009de0" stroke="#fff" strokeWidth="1.5" />

          {/* active point + tooltip */}
          <line x1={tipX} x2={tipX} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="var(--ink-3)" strokeOpacity="0.25" />
          <circle cx={tipX} cy={y(tipPrice)} r="4.5" fill={tipIsMin ? '#10b981' : '#009de0'} stroke="#fff" strokeWidth="1.5" />
          <g>
            <rect x={tipBoxX} y={0} width={tipW} height={17} rx="5" fill="#1c1e24" fillOpacity="0.88" />
            <text x={tipBoxX + tipW / 2} y={12} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">
              {tipLabel}
            </text>
          </g>

          {/* date axis */}
          <text x={PAD_X} y={H - 8} fontSize="10" fill="var(--ink-3)">{formatShortDate(points[0].recordedAt)}</text>
          <text x={W - PAD_X} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ink-3)">{formatShortDate(points[lastIdx].recordedAt)}</text>
        </svg>

        <div style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.45, marginTop: 6 }}>
          Χαμηλότερη: <strong style={{ color: 'var(--ink)' }}>{lo.toFixed(2)}€</strong>
          {' · '}
          Μέση: <strong style={{ color: 'var(--ink)' }}>{avg?.toFixed(2) ?? min?.toFixed(2)}€</strong>
          {percentAboveMin > 0 && (
            <>
              {' · '}
              <span>+{percentAboveMin}% από το χαμηλότερο</span>
            </>
          )}
          <span style={{ float: 'right', opacity: 0.8 }}>άγγιξε το διάγραμμα για τιμή/ημερομηνία</span>
        </div>
      </div>
    </section>
  );
}
