// Android crashed the moment onboarding ended (found on the emulator,
// 2026-11-13): the tab bar's Material icons need `expo-symbols`, which
// expo-router loads through an optional try/require. The package had been
// removed as "unused" — no import of it exists in our code — and tsc, eslint
// and `expo export` all stayed green. Only a device noticed. This is the check
// that would have.
import { describe, expect, it } from 'vitest';
import tabs from './app-tabs.tsx?raw';
import pkg from '../../package.json';
import appConfig from '../../app.json';

describe('tab bar dependencies', () => {
  it('keeps expo-symbols installed while the tabs use Material (md) icons', () => {
    const usesMaterialIcons = /\bmd=/.test(tabs);
    expect(usesMaterialIcons).toBe(true); // if the icons change, revisit this test instead of deleting it
    expect(Object.keys(pkg.dependencies)).toContain('expo-symbols');
  });

  // Same trap as expo-symbols: without expo-system-ui, Expo only warns at build
  // time and Android keeps reporting «light», so dark mode silently never shows.
  it('keeps expo-system-ui installed while the app follows the phone’s light/dark setting', () => {
    expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
    expect(Object.keys(pkg.dependencies)).toContain('expo-system-ui');
  });

  it('draws no badge element for an empty list (a Badge with text ignores `hidden` on Android)', () => {
    expect(tabs).not.toMatch(/Trigger\.Badge\s+hidden=/);
  });
});
