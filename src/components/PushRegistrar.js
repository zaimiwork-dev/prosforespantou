'use client';

import { useEffect } from 'react';
import { registerPushToken } from '@/actions/register-push-token';

// Registers the device for push notifications — but ONLY inside the Capacitor
// native shell (the runtime injects window.Capacitor). On the web this returns
// immediately and never even loads the Capacitor packages, so there's zero
// overhead for browser visitors. Renders nothing; mounted once in the layout.
//
// Inert until: (a) the user is logged in (registerPushToken needs a session —
// PushToken.userId is required) and (b) FCM (Android) / APNs (iOS) are wired in
// the native project. Both are documented follow-ups; this is the client half.
export function PushRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.Capacitor) return; // web → no-op
    let cleanup = () => {};

    (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const platform = Capacitor.getPlatform(); // 'ios' | 'android'

      let granted = (await PushNotifications.checkPermissions()).receive === 'granted';
      if (!granted) {
        granted = (await PushNotifications.requestPermissions()).receive === 'granted';
      }
      if (!granted) return;

      await PushNotifications.register();
      const reg = await PushNotifications.addListener('registration', (token) => {
        registerPushToken({ token: token.value, platform }).catch(() => {});
      });
      const err = await PushNotifications.addListener('registrationError', () => {});
      cleanup = () => { reg.remove?.(); err.remove?.(); };
    })().catch(() => {});

    return () => cleanup();
  }, []);

  return null;
}
