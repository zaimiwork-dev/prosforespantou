// Anonymous usage statistics, mirroring the website's track-event schema
// (src/actions/track-event.ts). Nothing is sent unless the shopper accepted;
// failures are swallowed — analytics must never break or slow the app.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './api';
import { getSettings, updateSettings } from './settings';

export type EventType =
  | 'deal_click' | 'leaflet_click' | 'list_add' | 'list_remove'
  | 'page_view' | 'search' | 'filter' | 'store_select'
  | 'favorite' | 'unfavorite' | 'outbound_click' | 'consent_choice';

export type EventFields = {
  supermarket?: string;
  discountId?: string;
  leafletId?: string;
  category?: string;
  position?: number;
  page?: string;
  query?: string;
  resultCount?: number;
  context?: 'mine' | 'other';
};

const SID_KEY = 'analytics.sid';
let sid: string | null = null;

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// Random per-install id, created only once the shopper accepted.
export async function sessionId(): Promise<string | null> {
  if (sid) return sid;
  try {
    let v = await AsyncStorage.getItem(SID_KEY);
    if (!v) {
      v = uuid();
      await AsyncStorage.setItem(SID_KEY, v);
    }
    sid = v;
    return v;
  } catch {
    return null;
  }
}

function forgetSession() {
  sid = null;
  AsyncStorage.removeItem(SID_KEY).catch(() => {});
}

export function track(eventType: EventType, fields: EventFields = {}) {
  if (getSettings().consent !== 'accepted') return;
  void send(eventType, fields);
}

async function send(eventType: EventType, fields: EventFields) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const id = await sessionId();
    // Consent may have been withdrawn while the id was being read.
    if (getSettings().consent !== 'accepted') return;
    await fetch(`${API_BASE}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, ...fields, ...(id ? { sessionId: id } : {}), platform: 'android' }),
      signal: ctrl.signal,
    });
  } catch {
    /* fire-and-forget */
  } finally {
    clearTimeout(timer);
  }
}

// The shopper's answer, from onboarding or Ρυθμίσεις. Accepting stores the
// choice and sends the event; rejecting stores it, sends nothing and deletes
// the install id.
export function setConsentChoice(value: 'accepted' | 'rejected', page: string) {
  updateSettings({ consent: value });
  if (value === 'accepted') track('consent_choice', { page, query: value });
  else forgetSession();
}
