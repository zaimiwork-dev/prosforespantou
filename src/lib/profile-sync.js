// Device side of the anonymous server profile (W4a). Mounted once through
// components/ProfileSync.js.
//
// - Does nothing unless NEXT_PUBLIC_PROFILE_SYNC=1 (owner decision #7) AND the
//   visitor accepted cookies (lib/consent.js) — same gate as analytics.
// - The profile id is a random UUID in localStorage, created on the first
//   sync after consent, separate from the analytics `sid`.
// - Sends only when the snapshot changed (fingerprint kept locally), 3 s after
//   the last change, and when the page is hidden.
// - Withdrawing consent deletes the server copy and forgets the id.
'use client';

import { syncProfile, deleteProfile } from '@/actions/sync-profile';
import { hasAnalyticsConsent, onConsentChange } from '@/lib/consent';
import { loadProfile } from '@/lib/interest-profile';
import { getTextSize } from '@/lib/text-size';
import { useShoppingListStore } from '@/lib/store';
import { buildProfileSnapshot, snapshotFingerprint } from '@/lib/profile-snapshot';

export const PROFILE_ID_KEY = 'pp-profile-id';
const FINGERPRINT_KEY = 'pp-profile-fp';
const DEBOUNCE_MS = 3000;

export const profileSyncEnabled = () => process.env.NEXT_PUBLIC_PROFILE_SYNC === '1';

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function getOrCreateProfileId() {
  const ls = storage();
  if (!ls) return null;
  let id = ls.getItem(PROFILE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    ls.setItem(PROFILE_ID_KEY, id);
  }
  return id;
}

let inFlight = false;

export async function syncNow() {
  if (typeof window === 'undefined' || !profileSyncEnabled() || !hasAnalyticsConsent()) return;
  if (inFlight) return;
  const ls = storage();
  if (!ls) return;
  const snapshot = buildProfileSnapshot(useShoppingListStore.getState(), loadProfile(), getTextSize());
  const fp = snapshotFingerprint(snapshot);
  if (ls.getItem(FINGERPRINT_KEY) === fp) return;
  const profileId = getOrCreateProfileId();
  if (!profileId) return;
  inFlight = true;
  try {
    const res = await syncProfile({ profileId, ...snapshot });
    if (res?.success) ls.setItem(FINGERPRINT_KEY, fp);
  } catch {
    /* best-effort: the next change or page hide retries */
  } finally {
    inFlight = false;
  }
}

async function forgetProfile() {
  const ls = storage();
  const profileId = ls?.getItem(PROFILE_ID_KEY);
  if (!profileId) return;
  try { await deleteProfile({ profileId }); } catch { /* retried on the next withdrawal */ }
  ls.removeItem(PROFILE_ID_KEY);
  ls.removeItem(FINGERPRINT_KEY);
}

// Returns a cleanup function.
export function startProfileSync() {
  if (typeof window === 'undefined') return () => {};

  // Declared before the consent listener below, not after. With the flag OFF
  // this function returns early, so a later «Αποδοχή» used to reach schedule()
  // while `timer` had never been initialised — a temporal-dead-zone throw
  // inside the consent callback, caught in a browser check on 2026-09-17.
  // Production has the flag on, so it never fired there; turning the flag off
  // would have made every accept throw.
  let timer = null;

  // Erasure must work even with the flag off (a copy may exist from before).
  // Starting a sync, however, is only meaningful when the flag is on.
  const unsubConsent = onConsentChange((value) => {
    if (value === 'rejected') forgetProfile();
    else if (value === 'accepted' && profileSyncEnabled()) schedule();
  });

  if (!profileSyncEnabled()) return unsubConsent;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; syncNow(); }, DEBOUNCE_MS);
  }
  const flush = () => { if (timer) { clearTimeout(timer); timer = null; } syncNow(); };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };

  const unsubStore = useShoppingListStore.subscribe(schedule);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  schedule(); // first sync after load (no-op when nothing changed)

  return () => {
    if (timer) clearTimeout(timer);
    unsubStore();
    unsubConsent();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  };
}
