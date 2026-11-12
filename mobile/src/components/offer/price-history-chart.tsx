// «Ιστορικό τιμής» v2 (DESIGN.md «Product page v2»). The regular (shelf) price
// is one stepped line; offers are red dots (a short segment only when the data
// says when they ended or that they still run); the price on screen is the last,
// larger dot. All decisions live in price-timeline-model.ts; this only draws.
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { PriceTimeline } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { Colors, Fonts, Radius, Space, useType, type TypeScale } from '@/constants/theme';
import {
  RANGES,
  UNRELIABLE_LINE,
  chartLabel,
  domainFor,
  factsFor,
  footnote,
  formatDay,
  pickAt,
  thinLine,
  viewKind,
  visiblePromos,
  visibleShelf,
  xOf,
  yOf,
  yScaleFor,
  type Domain,
  type Picked,
  type PromoMark,
  type Step,
  type RangeKey,
} from './price-timeline-model';

const HEIGHT = 200;
const TOP = 14;
const BOTTOM = 14;
const RIGHT = 14;
// Air between the price labels and the first point, so a dot never sits on a label.
const INSET = 14;

export function PriceHistory({ timeline, price }: { timeline?: PriceTimeline; price: number }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const kind = viewKind(timeline);
  if (!timeline || kind === 'none') return null;
  if (kind === 'thin') return <Text style={styles.line}>{thinLine(timeline)}</Text>;
  if (kind === 'unreliable') return <Text style={styles.line}>{UNRELIABLE_LINE}</Text>;
  return <Chart timeline={timeline} price={price} />;
}

function Chart({ timeline, price }: { timeline: PriceTimeline; price: number }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const [range, setRange] = useState<RangeKey>('ALL');
  const [width, setWidth] = useState(0);
  const [touch, setTouch] = useState<Picked | null>(null);
  // Fixed per mount: the chart is a snapshot of «now», not a ticking clock.
  const [now] = useState(() => Date.now());

  const left = Math.round(T.caption * 5.2);
  const plotW = Math.max(width - left - INSET - RIGHT, 1);
  const plotH = HEIGHT - TOP - BOTTOM;

  const m = useMemo(() => {
    const d = domainFor(timeline, range, now);
    const shelf = visibleShelf(timeline, d);
    const promos = visiblePromos(timeline, d);
    const y = yScaleFor([...shelf.map((s) => s.price), ...promos.map((p) => p.price), price]);
    return { d, shelf, promos, y };
  }, [timeline, range, now, price]);

  const px = (t: number) => xOf(t, m.d, left + INSET, plotW);
  const py = (p: number) => yOf(p, m.y, TOP, plotH);

  const pan = useDragPick(m.d, m.shelf, m.promos, left + INSET, plotW, setTouch);

  // Shelf as one stepped line: horizontal at each price, vertical at the change.
  let shelfPath = '';
  for (let i = 0; i < m.shelf.length; i++) {
    const s = m.shelf[i];
    const x0 = px(s.from).toFixed(1);
    const x1 = px(s.to).toFixed(1);
    const y = py(s.price).toFixed(1);
    shelfPath += i === 0 ? `M ${x0} ${y} L ${x1} ${y}` : ` L ${x0} ${y} L ${x1} ${y}`;
  }

  const facts = factsFor(timeline, formatPrice, now);
  const note = footnote(timeline, now);
  const nowX = px(m.d.t1);
  const nowY = py(price);

  return (
    <View>
      <View style={styles.readout} accessibilityLiveRegion="polite">
        {touch ? (
          <Text style={styles.readoutText}>
            <Text style={styles.readoutStrong}>{formatPrice(touch.price)}</Text>
            {`  ${formatDay(touch.at, now)} · ${touch.kind === 'promo' ? 'Προσφορά' : 'Κανονική τιμή'}`}
          </Text>
        ) : (
          <Text style={styles.hint}>Πάτησε και σύρε στο γράφημα</Text>
        )}
      </View>

      <View
        style={styles.chart}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={chartLabel(timeline, formatPrice, now)}
        {...pan.panHandlers}>
        {width > 0 ? (
          <>
            <Svg width={width} height={HEIGHT} pointerEvents="none">
              {m.y.ticks.map((tick) => (
                <Line key={tick} x1={left} x2={left + INSET + plotW} y1={py(tick)} y2={py(tick)} stroke={Colors.line} strokeWidth={1} />
              ))}
              {shelfPath ? <Path d={shelfPath} stroke={Colors.ink} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="butt" /> : null}
              {m.promos.map((p, i) =>
                p.until != null && p.until > p.at ? (
                  <Line key={`s${i}`} x1={px(p.at)} x2={px(p.until)} y1={py(p.price)} y2={py(p.price)} stroke={Colors.accent} strokeWidth={4} strokeLinecap="round" />
                ) : null,
              )}
              {m.promos.map((p, i) => (
                <Circle key={`p${i}`} cx={px(p.at)} cy={py(p.price)} r={4.5} fill={Colors.accent} />
              ))}
              {touch ? (
                <>
                  <Line x1={px(touch.at)} x2={px(touch.at)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={Colors.ink3} strokeWidth={1} strokeDasharray="3 3" />
                  <Circle cx={px(touch.at)} cy={py(touch.price)} r={7} fill={Colors.surface} stroke={touch.kind === 'promo' ? Colors.accent : Colors.ink} strokeWidth={3} />
                </>
              ) : null}
              <Circle cx={nowX} cy={nowY} r={8} fill={Colors.accent} stroke={Colors.surface} strokeWidth={2} />
            </Svg>
            {m.y.ticks.map((tick) => (
              <Text key={tick} style={[styles.tick, { top: py(tick) - T.caption - 2, width: left - 6 }]} pointerEvents="none">
                {formatPrice(tick)}
              </Text>
            ))}
          </>
        ) : null}
      </View>

      <View style={styles.legend}>
        {m.shelf.length > 0 ? <LegendDot color={Colors.ink} label="Κανονική τιμή" line /> : null}
        <LegendDot color={Colors.accent} label="Προσφορά" />
      </View>

      <View style={styles.chips}>
        {RANGES.map((r) => {
          const on = r.key === range;
          return (
            <Pressable
              key={r.key}
              onPress={() => {
                setRange(r.key);
                setTouch(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={r.a11y}
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {facts.length > 0 ? (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.id} style={f.good ? styles.pill : undefined}>
              <Text style={[styles.fact, f.good && styles.pillText]}>{f.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {note ? <Text style={styles.foot}>{note}</Text> : null}
    </View>
  );
}

// Press-and-drag over the plot. The responder is rebuilt when the scales change
// (range, width) so it never reads stale ones.
function useDragPick(d: Domain, shelf: Step[], promos: PromoMark[], left: number, plotW: number, setTouch: (p: Picked | null) => void) {
  return useMemo(() => {
    const at = (x: number) => {
      const t = d.t0 + ((x - left) / plotW) * (d.t1 - d.t0);
      const clamped = Math.min(Math.max(t, d.t0), d.t1);
      // A finger is about 24 px wide, expressed in time.
      setTouch(pickAt(clamped, shelf, promos, (24 / plotW) * (d.t1 - d.t0)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => at(e.nativeEvent.locationX),
      onPanResponderMove: (e) => at(e.nativeEvent.locationX),
      onPanResponderRelease: () => setTouch(null),
      onPanResponderTerminate: () => setTouch(null),
    });
  }, [d, shelf, promos, left, plotW, setTouch]);
}

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={styles.legendItem}>
      <View style={line ? { width: 18, height: 3, backgroundColor: color } : { width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    line: { ...T.text.body, color: Colors.ink2 },
    readout: { minHeight: 44, justifyContent: 'center' },
    readoutText: { ...T.text.body, color: Colors.ink },
    readoutStrong: { fontFamily: Fonts.sans900, color: Colors.ink },
    hint: { ...T.text.caption, color: Colors.ink3Text },
    chart: { height: HEIGHT, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, overflow: 'hidden' },
    tick: { position: 'absolute', left: 4, ...T.text.caption, color: Colors.ink3Text, textAlign: 'right' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space[4], marginTop: Space[2] },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: Space[2] },
    legendText: { ...T.text.caption, color: Colors.ink2 },
    chips: { flexDirection: 'row', gap: Space[2], marginTop: Space[3] },
    chip: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.pill,
      borderWidth: 1,
      borderColor: Colors.line2,
      backgroundColor: Colors.surface,
    },
    chipOn: { backgroundColor: Colors.brand, borderColor: Colors.brand },
    chipText: { ...T.text.bodyStrong, color: Colors.ink },
    chipTextOn: { color: '#fff' },
    facts: { marginTop: Space[4], gap: Space[2], alignItems: 'flex-start' },
    fact: { ...T.text.body, color: Colors.ink },
    pill: { backgroundColor: '#E3F2E7', borderRadius: Radius.pill, paddingHorizontal: Space[3], paddingVertical: Space[1] },
    pillText: { fontFamily: Fonts.sans700, color: Colors.good },
    foot: { ...T.text.caption, color: Colors.ink3Text, marginTop: Space[3] },
  });
