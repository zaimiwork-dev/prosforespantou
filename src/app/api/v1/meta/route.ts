// GET /api/v1/meta — the lists the app builds its filters and chain screens
// from: chains (with logo and leaflet link), departments, and live counts.
// The app keeps no copy of these, so adding a chain on the server reaches
// installed apps without an update.
import * as Sentry from '@sentry/nextjs';
import { SUPERMARKETS, CATEGORIES } from '@/lib/constants';
import { getDealCounts } from '@/actions/get-deal-counts';
import { SITE_ORIGIN } from '@/lib/api/deal-card';
import { ok, fail } from '@/lib/api/respond';

export async function GET() {
  try {
    const counts = await getDealCounts();
    return ok({
      chains: SUPERMARKETS.map((s) => ({
        id: s.id,
        name: s.name,
        short: s.short,
        color: s.color,
        bg: s.bg,
        logoUrl: s.logo ? `${SITE_ORIGIN}/logos/${s.logo}` : null,
        leafletUrl: s.leafletUrl ?? null,
        offers: counts.bySupermarket[s.id] ?? 0,
      })),
      categories: CATEGORIES.filter((c) => c.id !== 'all').map((c) => ({
        id: c.id,
        label: c.label,
        full: c.full ?? c.id,
        offers: counts.byCategory[c.id] ?? 0,
      })),
      total: counts.total,
    });
  } catch (error) {
    Sentry.captureException(error);
    return fail(500, 'meta unavailable');
  }
}
