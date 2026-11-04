// On-device settings (no login). One module-level store, read from
// AsyncStorage once at startup and written through on every change, exposed
// with useSyncExternalStore so any component can subscribe to a slice.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TextSize = 'normal' | 'large';
export type Consent = 'accepted' | 'rejected' | null;

export type Settings = {
  textSize: TextSize;
  // Chain ids (from useChains()) the shopper shops at.
  myChains: string[];
  onboarded: boolean;
  consent: Consent;
};

const KEY = 'settings.v1';
const DEFAULTS: Settings = { textSize: 'normal', myChains: [], onboarded: false, consent: null };

let state: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// Storage can be missing or blocked (private window on web): the app must
// still run, it just forgets the choices.
async function load() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Settings>;
      state = {
        textSize: p.textSize === 'large' ? 'large' : 'normal',
        myChains: Array.isArray(p.myChains) ? p.myChains.filter((c) => typeof c === 'string') : [],
        onboarded: p.onboarded === true,
        consent: p.consent === 'accepted' || p.consent === 'rejected' ? p.consent : null,
      };
    }
  } catch {
    /* keep defaults */
  }
  loaded = true;
  emit();
}
load();

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

export const getSettings = () => state;

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => state, () => DEFAULTS);
}

// False until storage has been read, so the root layout does not flash the
// onboarding at someone who already finished it.
export function useSettingsLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => loaded, () => false);
}
