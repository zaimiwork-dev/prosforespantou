// Grey placeholders shown while offers load. They pulse softly (native-driven
// opacity, no reanimated) and stand still when the OS asks for reduced motion.
// DealCardSkeleton mirrors DealCardView's box model so nothing jumps when the
// real cards arrive.
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Radius, Space, useType, type TypeScale } from '@/constants/theme';

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function Skeleton({ width, height, radius = Radius.sm, style }: { width?: DimensionValue; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduce) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: Colors.bgSoft, opacity: pulse }, style]}
    />
  );
}

// Same outer size as DealCardView at the same `width`: bordered card, photo
// square inside 12 dp padding, then chain line, two title lines, tag line, price.
export function DealCardSkeleton({ width }: { width?: number }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <View style={[styles.card, width ? { width } : null]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.imageWrap}>
        <Skeleton height={0} style={styles.image} radius={Radius.md} />
      </View>
      <View style={styles.text}>
        <Skeleton width="55%" height={T.text.caption.lineHeight - 4} />
        <Skeleton width="95%" height={T.text.title.lineHeight - 6} />
        <Skeleton width="70%" height={T.text.title.lineHeight - 6} />
        <Skeleton width="60%" height={T.text.caption.lineHeight} radius={Radius.pill} />
        <Skeleton width="45%" height={T.text.price.lineHeight - 4} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function RailSkeleton({ cardWidth = 163 }: { cardWidth?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Φόρτωση προσφορών" style={{ gap: Space[3] }}>
      <Skeleton width={200} height={26} style={{ marginHorizontal: Space[4] }} />
      <View style={{ flexDirection: 'row', gap: Space[3], paddingHorizontal: Space[4], overflow: 'hidden' }}>
        {[0, 1, 2].map((i) => (
          <DealCardSkeleton key={i} width={cardWidth} />
        ))}
      </View>
    </View>
  );
}

// Two equal columns like the offers grid; `rows` rows of cards.
export function GridSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Φόρτωση προσφορών" style={{ gap: Space[3], paddingHorizontal: Space[4] }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: Space[3] }}>
          <View style={{ flex: 1 }}>
            <DealCardSkeleton />
          </View>
          <View style={{ flex: 1 }}>
            <DealCardSkeleton />
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    card: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.line,
      overflow: 'hidden',
      paddingBottom: Space[3],
    },
    imageWrap: { backgroundColor: Colors.surface2, padding: Space[3] },
    image: { width: '100%', aspectRatio: 1, height: undefined },
    text: { paddingHorizontal: Space[3], paddingTop: Space[2], gap: 4, minHeight: T.text.title.lineHeight * 2 },
  });
