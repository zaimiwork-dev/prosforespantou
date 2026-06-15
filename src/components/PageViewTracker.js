'use client';
// Fires a consent-gated `page_view` on every route change. Mounted once in the
// root layout. No-op until the visitor opts in (track() enforces the gate), so it
// adds zero tracking for non-consenting users. The route path rides in `category`
// (the free-form context label — see the trackEvent server action).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/track';

export function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    // Strip ids out of the path so analytics groups by template, not by every
    // offer/store id (keeps the label low-cardinality and under 120 chars).
    const route = pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0, 120);
    track({ eventType: 'page_view', category: route });
  }, [pathname]);
  return null;
}
