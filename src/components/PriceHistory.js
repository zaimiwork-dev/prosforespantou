'use client';

// Compact price-history block: sparkline + honest "actually cheap?" badge.
// Consumed by ProductModal and the offer detail page. Renders nothing when
// fewer than 3 data points (sparkline isn't meaningful with less).

const VERDICT_STYLE = {
  lowest: { bg: '#d1fae5', fg: '#065f46', label: 'Χαμηλότερη τιμή που έχουμε δει' },
  good:   { bg: '#dcfce7', fg: '#166534', label: 'Καλή τιμή' },
  fair:   { bg: '#fef9c3', fg: '#854d0e', label: 'Μέτρια τιμή' },
  meh:    { bg: '#fef3c7', fg: '#92400e', label: 'Όχι τόσο φθηνή όσο φαίνεται' },
  high:   { bg: '#fee2e2', fg: '#991b1b', label: '⚠ Πάνω από τον μέσο όρο' },
};

function buildPath(prices, w, h, pad) {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return prices.map((p, i) => {
    const x = pad + (i / Math.max(1, prices.length - 1)) * innerW;
    const y = pad + (1 - (p - min) / range) * innerH;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

export function PriceHistory({ history, compact = false }) {
  if (!history || !history.points || history.points.length < 3) return null;

  const { points, min, max, avg, current, verdict, percentAboveMin } = history;
  const prices = points.map((p) => p.price);
  const w = compact ? 200 : 260;
  const h = compact ? 50 : 64;
  const pad = 4;
  const path = buildPath(prices, w, h, pad);

  // Last point coords for the dot
  const lastIdx = prices.length - 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const range = (max - min) || 1;
  const lastX = pad + (lastIdx / Math.max(1, lastIdx)) * innerW;
  const lastY = pad + (1 - (current - min) / range) * innerH;

  const style = VERDICT_STYLE[verdict] || VERDICT_STYLE.meh;

  const firstDate = new Date(points[0].recordedAt);
  const lastDate = new Date(points[lastIdx].recordedAt);
  const daysSpan = Math.max(1, Math.round((lastDate - firstDate) / 86400000));

  return (
    <section style={{ marginTop: compact ? 14 : 18 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.6px',
        textTransform: 'uppercase',
        color: '#8b929c',
        marginBottom: 6,
      }}>
        Ιστορικό τιμής — {daysSpan} {daysSpan === 1 ? 'μέρα' : 'ημέρες'}
      </div>

      <div style={{
        border: '1px solid #ececf0',
        borderRadius: 12,
        background: '#fff',
        padding: compact ? '10px 12px' : '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flex: 'none' }}>
            <path d={path} fill="none" stroke="#009de0" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r={3.5} fill="#009de0" />
          </svg>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              display: 'inline-block',
              background: style.bg,
              color: style.fg,
              fontSize: 11,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 8,
              letterSpacing: '0.2px',
              marginBottom: 6,
            }}>
              {style.label}
            </div>
            <div style={{ fontSize: 11, color: '#6c757d', lineHeight: 1.45 }}>
              Χαμηλότερη: <strong style={{ color: '#1c1e24' }}>{min.toFixed(2)}€</strong>
              {' · '}
              Μέση: <strong style={{ color: '#1c1e24' }}>{avg?.toFixed(2)}€</strong>
              {percentAboveMin > 0 && (
                <>
                  {' · '}
                  <span style={{ color: verdict === 'high' ? '#991b1b' : '#6c757d' }}>
                    +{percentAboveMin}% από το χαμηλότερο
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
