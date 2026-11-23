// «Ειδοποίησέ με» on the phone (owner 2026-11-23: alerts on any product, when
// it goes on offer anywhere, gets cheaper, or reaches the person's price).
// No login: the phone registers once (POST /api/v1/devices) and keeps the
// returned id on the device — it is the key to its own watches. Notification
// permission is asked only when the person first taps «Ειδοποίησέ με», never
// at start-up. The server decides and sends (src/scripts/fire-product-watches.mjs).
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { api, type WatchRequest, type WatchView } from './api';

const DEVICE_KEY = 'prosfores-pantou:device:v1';
export const ALERT_CHANNEL = 'alerts';

let deviceId: string | null = null;
let devicePromise: Promise<string> | null = null;

/** The phone's id on the server, registering it on first use. */
export function ensureDevice(): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);
  devicePromise ??= (async () => {
    const saved = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
    if (saved) return (deviceId = saved);
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const { deviceId: id } = await api.registerDevice(platform);
    await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
    return (deviceId = id);
  })().finally(() => { devicePromise = null; });
  return devicePromise;
}

export type NotificationState = 'on' | 'denied' | 'unavailable';

/**
 * Ask for notification permission and hand the push token to the server.
 * 'unavailable' = this phone/build cannot receive pushes (web preview, an
 * emulator without Google services, or a build before push was configured);
 * the watch still exists and the website/email side still works.
 */
export async function enableNotifications(): Promise<NotificationState> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
        name: 'Ειδοποιήσεις τιμών',
        importance: AndroidImportance.DEFAULT,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.setPushToken(await ensureDevice(), token.data);
    return 'on';
  } catch {
    return 'unavailable';
  }
}

// ── Watches: a small module-level store the screens subscribe to ─────────────
let watches: WatchView[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export async function refreshWatches(): Promise<void> {
  const saved = deviceId ?? (await AsyncStorage.getItem(DEVICE_KEY).catch(() => null));
  if (!saved) {
    // Never watched anything: nothing to ask the server.
    loaded = true;
    emit();
    return;
  }
  deviceId = saved;
  try {
    watches = (await api.watches(saved)).watches;
  } finally {
    loaded = true;
    emit();
  }
}

export async function saveWatch(req: WatchRequest): Promise<WatchView> {
  const id = await ensureDevice();
  const { watch } = await api.watch(id, req);
  watches = [watch, ...watches.filter((w) => w.id !== watch.id)];
  emit();
  return watch;
}

export async function removeWatch(watchId: string): Promise<void> {
  const id = await ensureDevice();
  await api.unwatch(id, watchId);
  watches = watches.filter((w) => w.id !== watchId);
  emit();
}

export function useWatches() {
  const list = useSyncExternalStore(subscribe, () => watches, () => watches);
  const isLoaded = useSyncExternalStore(subscribe, () => loaded, () => loaded);
  return { watches: list, loaded: isLoaded };
}

/** The watch on this store item, if any (the offer page shows «Σε παρακολουθείς»). */
export const findWatch = (list: WatchView[], chain: string | null, code: string | null) =>
  list.find((w) => w.chain === chain && w.code === code) ?? null;
