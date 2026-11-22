'use client';

// «Ιστορικό τιμής» on the website (owner 2026-11-22: refined, readable,
// actually usable — and the same as the app). Every decision lives in
// lib/price-history-view.ts, shared with the app; this only draws.
//
// What a shopper reads, top to bottom:
//   1. the lead sentence — «Συνήθως 2,57 €. Σε προσφορά 6 φορές από τον
//      Σεπτέμβριο, με χαμηλότερη τιμή 1,53 €.» (plus a green pill when today's
//      price is the lowest we have seen)
//   2. the chart: the regular price as a stepped line, offers as red dots with
//      their period shaded (only when the data says when it ran), the usual
//      price as a dotted line, today's price as the large dot at the right
//   3. a reading of whatever the finger or mouse is on, the range chips, a legend
//
// The data is the per-SKU, checked timeline (lib/price-timeline via
// actions/get-price-timeline): one item's own history, never two SKUs mixed.
// When it cannot be trusted we say so instead of drawing it.
//
// Drawn in real pixels (the width is measured), so labels stay 12–13 px on a
// phone — the old chart scaled a 560-wide drawing down and its text shrank to
// ~7 px at 390 px.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice } from '@/lib/format-price';
import {
  RANGES,
  UNRELIABLE_LINE,
  chartLabel,
  domainFor,
  footnote,
  formatDay,
  headlineFor,
  offerBands,
  pickAt,
  shelfPath as buildShelfPath,
  thinLine,
  usualLineFor,
  viewKind,
  visiblePromos,
  visibleShelf,
  xOf,
  yOf,
  yScaleFor,
} from '@/lib/price-history-view';

const HEIGHT = 210;
const TOP = 16;
const BOTTOM = 30; // room for the two dates under the plot
const LEFT = 60; // price labels
const RIGHT = 14;
const INSET = 10; // air between the labels and the first point

const card = {
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
  background: 'var(--surface)',
};

function Head() {
  return (
    <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 0 8px' }}>
      Ιστορικό τιμής
    </h2>
  );
}

export function PriceHistory({ timeline, price, compact = false }) {
  const kind = viewKind(timeline);
  if (kind === 'none') return null;
  return (
    <section style={{ marginTop: compact ? 16 : 22 }}>
      <Head />
      {kind === 'chart' ? (
        <Chart timeline={timeline} price={price} />
      ) : (
        <p style={{ ...card, margin: 0, padding: '12px 14px', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {kind === 'thin' ? thinLine(timeline) : UNRELIABLE_LINE}
        </p>
      )}
    </section>
  );
}

function Chart({ timeline, price }) {
  const [range, setRange] = useState('ALL');
  const [width, setWidth] = useState(0);
  const [touch, setTouch] = useState(null);
  // Fixed per mount: the chart is a snapshot of «now», not a ticking clock.
  const [now] = useState(() => Date.now());
  const boxRef = useRef(null);
  const pickedBy = useRef(null); // 'mouse' | 'touch' | 'pen' — who made the reading

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : timeline.stats.currentPrice;
  const usual = usualLineFor(timeline);

  const m = useMemo(() => {
    const d = domainFor(timeline, range, now);
    const shelf = visibleShelf(timeline, d);
    const promos = visiblePromos(timeline, d);
    const bands = offerBands(promos);
    const y = yScaleFor([...shelf.map((s) => s.price), ...promos.map((p) => p.price), ...(shown != null ? [shown] : []), ...(usual != null ? [usual] : [])]);
    return { d, shelf, promos, bands, y };
  }, [timeline, range, now, shown, usual]);

  const plotLeft = LEFT + INSET;
  const plotW = Math.max(width - plotLeft - RIGHT, 1);
  const plotH = HEIGHT - TOP - BOTTOM;
  const px = (t) => xOf(t, m.d, plotLeft, plotW);
  const py = (p) => yOf(p, m.y, TOP, plotH);

  const shelfPath = buildShelfPath(m.shelf, px, py);

  const pick = (clientX) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = m.d.t0 + ((clientX - rect.left - plotLeft) / plotW) * (m.d.t1 - m.d.t0);
    const clamped = Math.min(Math.max(t, m.d.t0), m.d.t1);
    // A finger is about 24 px wide, expressed in time.
    setTouch(pickAt(clamped, m.shelf, m.promos, (24 / plotW) * (m.d.t1 - m.d.t0)));
  };

  const headline = headlineFor(timeline, formatPrice, now);
  const note = footnote(timeline, now);

  return (
    <div style={{ ...card, padding: '14px 14px 12px' }}>
      {headline.pill && (
        <div style={{ display: 'inline-block', background: '#d1fae5', color: '#065f46', fontSize: 13, fontWeight: 800, padding: '5px 12px', borderRadius: 999, marginBottom: 8 }}>
          {headline.pill}
        </div>
      )}
      {headline.sentence && (
        <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.5, color: 'var(--ink)', fontWeight: 500 }}>{headline.sentence}</p>
      )}

      <div aria-live="polite" style={{ minHeight: 24, fontSize: 14, color: touch ? 'var(--ink)' : 'var(--ink-3)', marginBottom: 6 }}>
        {touch ? (
          <>
            <strong style={{ fontWeight: 800 }}>{formatPrice(touch.price)}</strong>
            {` · ${formatDay(touch.at, now)} · ${touch.kind === 'promo' ? 'Προσφορά' : 'Κανονική τιμή'}`}
          </>
        ) : (
          'Άγγιξε ή σύρε στο διάγραμμα για τιμή και ημερομηνία'
        )}
      </div>

      <div
        ref={boxRef}
        role="img"
        aria-label={chartLabel(timeline, formatPrice, now)}
        style={{ position: 'relative', height: HEIGHT, touchAction: 'pan-y', cursor: 'crosshair', userSelect: 'none' }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId);
          pickedBy.current = e.pointerType;
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons) {
            pickedBy.current = e.pointerType;
            pick(e.clientX);
          }
        }}
        onPointerLeave={(e) => {
          // A tap leaves its reading on screen. Browsers follow a touch with
          // emulated «mouse left» events, so only a reading the MOUSE made
          // (hovering) is cleared when the mouse leaves.
          if (e.pointerType === 'mouse' && pickedBy.current === 'mouse') setTouch(null);
        }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
            {m.y.ticks.map((tick) => (
              <g key={tick}>
                <line x1={LEFT} x2={plotLeft + plotW} y1={py(tick)} y2={py(tick)} stroke="var(--line)" strokeWidth="1" />
                <text x={LEFT - 6} y={py(tick) + 4} textAnchor="end" fontSize="12" fill="var(--ink-3)">{formatPrice(tick)}</text>
              </g>
            ))}

            {m.bands.map((b, i) => (
              <rect key={`b${i}`} x={px(b.from)} y={TOP} width={Math.max(px(b.to) - px(b.from), 2)} height={plotH} fill="var(--accent)" fillOpacity="0.1" />
            ))}

            {/* The dotted usual price. Named in the legend, not on the line: a
                label at its end sat on top of the price line whenever today's
                shelf price is the usual one. */}
            {usual != null && (
              <line x1={plotLeft} x2={plotLeft + plotW} y1={py(usual)} y2={py(usual)} stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5 5" />
            )}

            {shelfPath && <path d={shelfPath} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />}

            {m.promos.map((p, i) => (p.until != null && p.until > p.at ? (
              <line key={`s${i}`} x1={px(p.at)} x2={px(p.until)} y1={py(p.price)} y2={py(p.price)} stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
            ) : null))}
            {m.promos.map((p, i) => (
              <circle key={`p${i}`} cx={px(p.at)} cy={py(p.price)} r="4.5" fill="var(--accent)" />
            ))}

            {touch && (
              <g>
                <line x1={px(touch.at)} x2={px(touch.at)} y1={TOP} y2={TOP + plotH} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={px(touch.at)} cy={py(touch.price)} r="7" fill="var(--surface)" stroke={touch.kind === 'promo' ? 'var(--accent)' : 'var(--ink)'} strokeWidth="3" />
              </g>
            )}

            {shown != null && <circle cx={px(m.d.t1)} cy={py(shown)} r="8" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />}

            <text x={plotLeft} y={HEIGHT - 8} fontSize="12" fill="var(--ink-3)">{formatDay(m.d.t0, now)}</text>
            <text x={plotLeft + plotW} y={HEIGHT - 8} textAnchor="end" fontSize="12" fill="var(--ink-3)">Σήμερα</text>
          </svg>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8, fontSize: 13, color: 'var(--ink-2)' }}>
        {m.shelf.length > 0 && <Legend swatch={<span style={{ width: 18, height: 3, background: 'var(--ink)', borderRadius: 2 }} />} label="Κανονική τιμή" />}
        <Legend swatch={<span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--accent)' }} />} label="Προσφορά" />
        {usual != null && <Legend swatch={<span style={{ width: 18, borderTop: '2px dashed var(--ink-3)' }} />} label={`Συνήθως ${formatPrice(usual)}`} />}
      </div>

      <div role="group" aria-label="Διάστημα" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {RANGES.map((r) => {
          const on = r.key === range;
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              aria-label={r.a11y}
              onClick={() => { setRange(r.key); setTouch(null); }}
              style={{
                flex: 1, minHeight: 44, borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--brand)' : 'var(--line-2)'}`,
                background: on ? 'var(--brand)' : 'var(--surface)',
                color: on ? '#fff' : 'var(--ink)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {note && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{note}</p>}
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      {label}
    </span>
  );
}
