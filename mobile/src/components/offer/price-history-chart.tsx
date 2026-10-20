// «Ιστορικό τιμής» — a small step chart of this chain's price over the last
// 90 days (the website's PriceHistory, minus the touch tooltip). A price holds
// until the next snapshot, so the line is a staircase, not a slope that would
// invent prices between two measurements.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatShortDate } from '@shared/expiry-label';
import type { PriceHistory } from '@/lib/api';
import { Colors, Radius, Space, Type } from '@/constants/theme';

const HEIGHT = 150;
const PAD_X = 8;
const PAD_Y = 12;
const LINE = '#009de0';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')}€`;

export function PriceHistoryChart({ history }: { history: PriceHistory }) {
  const [width, setWidth] = useState(0);
  const points = [...history.points].sort((a, b) => +new Date(a.recordedAt) - +new Date(b.recordedAt));
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const t0 = +new Date(points[0].recordedAt);
  const t1 = +new Date(points[points.length - 1].recordedAt);
  const tSpan = t1 - t0 || 1;
  const pSpan = hi - lo || lo * 0.1 || 1;
  const yLo = lo - pSpan * 0.1;
  const ySpan = pSpan * 1.2;

  const innerW = Math.max(width - PAD_X * 2, 1);
  const x = (t: string) => PAD_X + ((+new Date(t) - t0) / tSpan) * innerW;
  const y = (p: number) => PAD_Y + (1 - (p - yLo) / ySpan) * (HEIGHT - PAD_Y * 2);

  let d = `M ${x(points[0].recordedAt).toFixed(1)} ${y(prices[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const px = x(points[i].recordedAt).toFixed(1);
    d += ` L ${px} ${y(prices[i - 1]).toFixed(1)} L ${px} ${y(prices[i]).toFixed(1)}`;
  }

  const minIdx = prices.indexOf(lo);
  const last = points[points.length - 1];
  // The website prefers the real shelf price over an average that blends shelf
  // and promo snapshots; fall back to the average only without one.
  const usual = history.normalPrice ?? history.avg;

  return (
    <View
      style={styles.box}
      accessible
      accessibilityLabel={`Ιστορικό τιμής: χαμηλότερη ${euro(lo)}, υψηλότερη ${euro(hi)}`}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Line x1={PAD_X} x2={width - PAD_X} y1={y(hi)} y2={y(hi)} stroke={Colors.line2} strokeDasharray="3 4" />
            <Line x1={PAD_X} x2={width - PAD_X} y1={y(lo)} y2={y(lo)} stroke={Colors.good} strokeOpacity={0.5} strokeDasharray="3 4" />
            <Path d={d} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={x(points[minIdx].recordedAt)} cy={y(lo)} r={5} fill={Colors.good} stroke="#fff" strokeWidth={2} />
            <Circle cx={x(last.recordedAt)} cy={y(last.price)} r={5} fill={LINE} stroke="#fff" strokeWidth={2} />
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{formatShortDate(points[0].recordedAt)}</Text>
        <Text style={styles.axisText}>{formatShortDate(last.recordedAt)}</Text>
      </View>

      <View style={styles.stats}>
        <Stat label="Χαμηλότερη" value={euro(lo)} color={Colors.good} />
        <Stat label="Υψηλότερη" value={euro(hi)} />
        {usual != null ? <Stat label="Συνήθως" value={euro(usual)} /> : null}
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Space[3],
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: PAD_X },
  axisText: { fontSize: Type.caption, color: Colors.ink3 },
  stats: { flexDirection: 'row', marginTop: Space[3], gap: Space[2] },
  stat: { flex: 1 },
  statLabel: { fontSize: Type.caption, color: Colors.ink3 },
  statValue: { fontSize: Type.title, fontWeight: '800', color: Colors.ink },
});
