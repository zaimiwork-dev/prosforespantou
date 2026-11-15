// Android crashed the moment onboarding ended (found on the emulator,
// 2026-11-13): the tab bar's Material icons need `expo-symbols`, which
// expo-router loads through an optional try/require. The package had been
// removed as "unused" — no import of it exists in our code — and tsc, eslint
// and `expo export` all stayed green. Only a device noticed. This is the check
// that would have.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('tab bar dependencies', () => {
  it('keeps expo-symbols installed while the tabs use Material (md) icons', () => {
    const tabs = read('./app-tabs.tsx');
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> };
    const usesMaterialIcons = /\bmd=/.test(tabs);
    expect(usesMaterialIcons).toBe(true); // if the icons change, revisit this test instead of deleting it
    expect(Object.keys(pkg.dependencies)).toContain('expo-symbols');
  });

  it('draws no badge element for an empty list (a Badge with text ignores `hidden` on Android)', () => {
    const tabs = read('./app-tabs.tsx');
    expect(tabs).not.toMatch(/Trigger\.Badge\s+hidden=/);
  });
});
