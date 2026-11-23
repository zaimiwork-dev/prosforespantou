// What tapping a «Ειδοποίησέ με» notification opens: the offer it is about,
// else a search for the product (the cheapest price was a regular one, which
// has no page of its own). Sent by src/scripts/fire-product-watches.mjs with
// data {offerId, chain, code, watchId}. Also shows alerts that arrive while
// the app is open (Android hides them by default).
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function NativeNotificationRouter() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = (last.notification.request.content.data ?? {}) as { offerId?: string | null };
    const title = last.notification.request.content.title ?? '';
    if (data.offerId) router.push(`/offer/${data.offerId}`);
    else {
      // «Σε προσφορά: Lacta 85g» → search «Lacta 85g».
      const q = title.includes(': ') ? title.slice(title.indexOf(': ') + 2) : title;
      if (q) router.push({ pathname: '/search', params: { q, t: String(Date.now()) } });
    }
  }, [last]);
  return null;
}

// The web preview has no notifications: render nothing there (and call no hook).
export const NotificationRouter = Platform.OS === 'web' ? () => null : NativeNotificationRouter;
