'use server';

// The app's home feed (GET /api/v1/feed): rails of offers, each defined by a
// fact about the offer. Rules and the reasoning are in lib/feed-sections.
//
// Two layers on purpose:
//   • POOLS — "the best candidates for each rail" — are the same for every
//     shopper, so they are cached for five minutes (one set of queries per
//     five minutes, however many phones open the app);
//   • ASSEMBLY — which rails, in what order, without repeating a product —
//     is per request and pure. The shopper's stores and interests arrive as
//     parameters from the device; no profile is read or written here.
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { activePublicDealWhere } from '@/lib/public-deal-filters';
import { DEPARTMENTS } from '@/lib/categories';
import { CATEGORIES } from '@/lib/constants';
import { getPersonalPool, getWeeklyEssentials } from '@/actions/get-active-deals';
import {
  balanceByChain,
  displayedSaving,
  orderDepartments,
  pickRail,
  popularIsMeaningful,
  POPULAR_MIN_PER_DEAL,
  savingRank,
  type FeedSection,
  type RailRow,
} from '@/lib/feed-sections';

// Exactly the columns toDealCard reads (lib/api/deal-card Row) — about a third
// of a full row, which keeps a cached pool far below the 2 MB entry limit.
const CARD_SELECT = {
  id: true, productId: true, supermarket: true, productName: true, category: true,
  discountedPrice: true, originalPrice: true, discountPercent: true, description: true,
  priceVerdict: true, baselinePrice: true, baselineAt: true, impliedPercent: true,
  comparisonCount: true, isCheapestInCluster: true, imageUrl: true,
  validFrom: true, validUntil: true, datesFromSource: true, updatedAt: true,
  source: true, isFeatured: true, featuredLabel: true, hotScore: true,
  product: { select: { name: true, imageUrl: true, unitInfo: true } },
} as const;
const HOT: any = [{ hotScore: 'desc' }, { validUntil: 'asc' }, { id: 'asc' }];

const RAIL = 12; // cards per rail
// Department pools: the hottest 150, then each chain's best 8 (balanceByChain).
const DEPT_FETCH = 150;
const DEPT_PER_CHAIN = 8;
const MIN_SAVING_PERCENT = 15;
const MIN_SAVING_EUROS = 0.3; // «−20 %» on a 0,40 € item is not a headline
const NEW_DAYS = 3;
const POPULAR_DAYS = 14;

type Row = RailRow & Record<string, any>;

const findCards = (now: Date, extra: Record<string, any>, orderBy: any = HOT, take = 80) =>
  prisma.discount.findMany({ where: activePublicDealWhere(now, extra), select: CARD_SELECT, orderBy, take });

// One cache entry per department, so no entry grows with the number of rails.
const getDeptPool = unstable_cache(
  async (category: string) => {
    const rows = await findCards(new Date(), { category }, HOT, DEPT_FETCH);
    return balanceByChain(rows as Row[], DEPT_PER_CHAIN);
  },
  ['feed:dept:v1'],
  { tags: ['deals:default'], revalidate: 300 },
);

const getFeedPools = unstable_cache(
  async () => {
    const now = new Date();
    const find = (extra: Record<string, any>, orderBy: any = HOT, take = 80) => findCards(now, extra, orderBy, take);

    const [published, implied, cheapest, fresh, ending, total] = await Promise.all([
      // Savings the card can actually print: a chain-published was-price …
      find({ originalPrice: { not: null }, discountPercent: { gte: MIN_SAVING_PERCENT, lte: 75 } },
        [{ discountPercent: 'desc' }, { id: 'asc' }], 150),
      // … or the guarded «κανονικά ~X €» baseline (lib/baseline-price).
      find({ originalPrice: null, baselinePrice: { not: null }, impliedPercent: { gte: MIN_SAVING_PERCENT } },
        [{ impliedPercent: 'desc' }, { id: 'asc' }], 150),
      // Cheapest of at least two OTHER chains: a claim worth a rail.
      find({ isCheapestInCluster: true, comparisonCount: { gte: 2 } }, HOT, 200),
      find({ createdAt: { gte: new Date(now.getTime() - NEW_DAYS * 86_400_000) } }, HOT, 250),
      // Only end dates the chain itself published — our ingest default (+14
      // days) is not a deadline and must not be sold as one.
      find({ datesFromSource: true, validUntil: { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) } },
        [{ validUntil: 'asc' }, { hotScore: 'desc' }, { id: 'asc' }], 60),
      prisma.discount.count({ where: activePublicDealWhere(now) }),
    ]);

    // «Δημοφιλή τώρα»: offers that several DIFFERENT shoppers clicked or added
    // to a list. Counted per session, so one person tapping ten times is one.
    const since = new Date(now.getTime() - POPULAR_DAYS * 86_400_000);
    const [{ sessions }] = await prisma.$queryRaw<{ sessions: number }[]>`
      select count(distinct "sessionId")::int as sessions from click_events
      where "eventType" in ('deal_click', 'list_add') and "sessionId" is not null and "createdAt" > ${since}`;
    let popular: Row[] = [];
    if (popularIsMeaningful(sessions)) {
      const ranked = await prisma.$queryRaw<{ id: string; n: number }[]>`
        select "discountId" as id, count(distinct "sessionId")::int as n from click_events
        where "eventType" in ('deal_click', 'list_add') and "discountId" is not null
          and "sessionId" is not null and "createdAt" > ${since}
        group by 1 having count(distinct "sessionId") >= ${POPULAR_MIN_PER_DEAL}
        order by n desc limit 80`;
      const rows = (await find({ id: { in: ranked.map((r) => r.id) } }, HOT, 80)) as Row[];
      const rank = new Map(ranked.map((r, i) => [r.id, i]));
      popular = rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }

    return {
      published, implied, ending, popular, total,
      cheapest: balanceByChain(cheapest as Row[], 12),
      fresh: balanceByChain(fresh as Row[], 15),
    };
  },
  ['feed:pools:v2'],
  { tags: ['deals:default'], revalidate: 300 },
);

const deptTitle = (id: string) => {
  const c = CATEGORIES.find((x) => x.id === id) as { id: string; label: string; full?: string } | undefined;
  return c?.full ?? id;
};

export async function getFeed(input: { chains?: string[]; interests?: string[] } = {}) {
  return await Sentry.withServerActionInstrumentation('getFeed', { recordResponse: false }, async () => {
    try {
      const chains = [...new Set(input.chains ?? [])].slice(0, 10);
      const [pools, essentials, mine] = await Promise.all([
        getFeedPools(),
        getWeeklyEssentials(),
        chains.length > 0 ? getPersonalPool([], chains, 60) : Promise.resolve({ deals: [] as Row[] }),
      ]);
      // Department pools a few at a time: the pooler behind DATABASE_URL is
      // small, and after the first request these are cache reads.
      const byDept: Record<string, Row[]> = {};
      const deptIds = DEPARTMENTS.filter((d) => d !== 'Άλλο');
      for (let i = 0; i < deptIds.length; i += 4) {
        const chunk = deptIds.slice(i, i + 4);
        const rows = await Promise.all(chunk.map((d) => getDeptPool(d)));
        chunk.forEach((d, j) => { byDept[d] = rows[j] as Row[]; });
      }

      const seen = new Set<string>();
      const sections: FeedSection<Row>[] = [];
      const add = (s: Omit<FeedSection<Row>, 'rows'>, rows: Row[]) => {
        if (rows.length > 0) sections.push({ ...s, rows });
      };

      // 1. Staples at their cheapest per kilo/litre — already one per staple.
      const ess = (essentials as Row[]).slice(0, 14);
      for (const d of ess) { seen.add(d.id); if (d.productId) seen.add(`p:${d.productId}`); }
      add({ id: 'essentials', title: 'Τα βασικά της εβδομάδας', subtitle: 'Η φθηνότερη προσφορά, ανά κιλό ή λίτρο', seeAll: null }, ess);

      // 2. The shopper's own stores, shared evenly between them.
      if (chains.length > 0) {
        add(
          { id: 'mine', title: 'Από τα καταστήματά σου', subtitle: null, seeAll: { chain: chains.join(',') } },
          pickRail(mine.deals as Row[], { limit: RAIL, seen, perChain: Math.max(2, Math.ceil(RAIL / chains.length)) }),
        );
      }

      // 3. Only with real traffic (lib/feed-sections) — absent otherwise.
      add(
        { id: 'popular', title: 'Δημοφιλή τώρα', subtitle: 'Τα κοιτούν περισσότερο αυτές τις μέρες', seeAll: null },
        pickRail(pools.popular as Row[], { limit: RAIL, seen }),
      );

      // 4. Biggest savings the card itself prints.
      const drops = [...(pools.published as Row[]), ...(pools.implied as Row[])]
        .map((row) => ({ row, saving: displayedSaving(row as never) }))
        .filter((x) => x.saving && x.saving.percent >= MIN_SAVING_PERCENT && x.saving.euros >= MIN_SAVING_EUROS)
        .sort((a, b) =>
          savingRank(b.saving!.percent, b.row.category) - savingRank(a.saving!.percent, a.row.category)
          || a.row.id.localeCompare(b.row.id))
        .map((x) => x.row);
      add(
        { id: 'drops', title: 'Μεγάλες εκπτώσεις', subtitle: 'Με τη μεγαλύτερη μείωση τιμής', seeAll: { sort: 'discount' } },
        pickRail(drops, { limit: RAIL, seen }),
      );

      const depts = orderDepartments(input.interests);
      const deptRail = (id: string, personal: boolean) =>
        add(
          { id: `dept:${id}`, title: deptTitle(id), subtitle: personal ? 'Επειδή τα κοιτάς συχνά' : null, seeAll: { category: id } },
          pickRail(byDept[id] ?? [], { limit: 10, seen }),
        );

      // 5. Departments this shopper keeps coming back to (at most three up here).
      const personal = depts.filter((d) => d.personal).slice(0, 3);
      for (const d of personal) deptRail(d.id, true);

      add(
        { id: 'cheapest', title: 'Φθηνότερα από αλλού', subtitle: 'Το ίδιο προϊόν κοστίζει περισσότερο στα άλλα καταστήματα', seeAll: null },
        pickRail(pools.cheapest as Row[], { limit: RAIL, seen }),
      );
      add(
        { id: 'new', title: 'Νέες προσφορές', subtitle: `Μπήκαν τις τελευταίες ${NEW_DAYS} μέρες`, seeAll: { sort: 'newest' } },
        pickRail(pools.fresh as Row[], { limit: RAIL, seen }),
      );
      add(
        { id: 'ending', title: 'Τελειώνουν σύντομα', subtitle: 'Πρόλαβε πριν λήξουν', seeAll: { sort: 'expiring' } },
        pickRail(pools.ending as Row[], { limit: RAIL, seen, perFamily: 2 }),
      );

      // 6. Every other department, in the weekly shop's order: the aisle walk.
      for (const d of depts) if (!personal.includes(d)) deptRail(d.id, false);

      return { total: pools.total as number, sections };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Error building feed:', error);
      return { total: 0, sections: [] as FeedSection<Row>[] };
    }
  });
}
