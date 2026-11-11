// Thin wrappers over expo-haptics: a light tick on taps that change something,
// a firmer one when a task completes. Never throws and does nothing on web
// (there is no vibration motor to drive and the call would reject).
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  try {
    fn().catch(() => {});
  } catch {
    /* haptics must never break a tap */
  }
};

export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
