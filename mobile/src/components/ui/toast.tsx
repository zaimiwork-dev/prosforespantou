// One message at a time, with an optional action (the «Αναίρεση» after adding
// to the list). `showToast` can be called from anywhere; <ToastHost /> is
// mounted once in the root layout. The store hands out immutable snapshots:
// the React Compiler memoises reads of a mutated module variable.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Space, useType, type TypeScale } from '@/constants/theme';

export type ToastOptions = { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number };
type Toast = Readonly<ToastOptions & { id: number }>;

let current: Toast | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const publish = (next: Toast | null) => {
  current = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function showToast(opts: ToastOptions) {
  publish({ ...opts, id: ++seq });
}
export const hideToast = () => publish(null);

// Matches the tab bar height in DESIGN.md (~68) plus a gap.
const ABOVE_TABS = 68 + Space[3];

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current, () => null);
  return toast ? <ToastView key={toast.id} toast={toast} /> : null;
}

function ToastView({ toast }: { toast: Toast }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));
  const duration = toast.durationMs ?? (toast.actionLabel ? 6000 : 4000);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const timer = setTimeout(hideToast, duration);
    return () => clearTimeout(timer);
  }, [anim, duration]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: insets.bottom + ABOVE_TABS, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
      ]}>
      <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Text style={styles.message}>{toast.message}</Text>
        {toast.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              hideToast();
              toast.onAction?.();
            }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
            <Text style={styles.actionText}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const makeStyles = (T: TypeScale) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: Space[4], right: Space[4], alignItems: 'center', zIndex: 1000, elevation: 1000 },
    toast: {
      width: '100%',
      maxWidth: 560,
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.ink,
      borderRadius: Radius.md,
      paddingLeft: Space[4],
      paddingRight: Space[2],
      paddingVertical: Space[1],
      gap: Space[2],
    },
    message: { ...T.text.body, color: '#fff', flex: 1, paddingVertical: Space[2] },
    action: { minHeight: 48, minWidth: 48, paddingHorizontal: Space[3], justifyContent: 'center' },
    actionText: { ...T.text.bodyStrong, color: Colors.gold },
  });
