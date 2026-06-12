# Prosfores Pantou — Phases

Forward-looking roadmap. Each phase has a clear "why", concrete deliverables, and an exit criterion. Don't start phase N+1 until N's exit criterion passes. Pair this with [CONTEXT.md](CONTEXT.md) for the current state.

> **Re-prioritization 2026-05-01.** End form is a native mobile app (iOS + Android Play/App Store) for an elderly + 30–40+ Greek audience. After this discussion, mobile-responsive work (was Phase 7) is bumped ahead of price-history UI (was Phase 6). Email delivery (Phase 3) stays next because newsletter + alerts both depend on it. New phases added below for item-watchlist alerts and a logged-in savings tracker, both flowing from owner's stated end-form. See [CONTEXT.md §0 "Product vision"](CONTEXT.md#0-product-vision-recorded-2026-05-01-directly-from-owner) for the canonical statement of what we're building and why.

Phases 0–4 are **done**; 5 onward is the work ahead.

---

## Phase 0 — Foundation (DONE)

Schema, Prisma 7 driver-adapter client, Sentry wrapping, Zod at boundaries, admin auth (`requireAdmin()`), plain-CSS design system, Zustand shopping list. Homepage + supermarket + search + offer + deals routes live.

**Exit:** `npm run build` green; homepage renders real data end-to-end.

---

## Phase 1 — Ingestion (DONE)

Wolt live scraper, HTML parser, batch runner, descriptions backfill. Deterministic `woltId`-based dedup. Greeklish + accent-insensitive search.

**Exit:** A supermarket's current offers can be seeded from a single command.

---

## Phase 2 — Monetization prep (DONE)

Delivered per [GEMINI_HANDOFF.md](GEMINI_HANDOFF.md):
1. **Click tracking** — `ClickEvent` model, fire-and-forget `trackEvent`, 7d/30d admin table.
2. **Featured slots** — `isFeatured` / `featuredUntil` / `featuredLabel`, chip on card, capped injection (≤2 per carousel, ≤1 per category).
3. **Newsletter** — double opt-in `Subscriber`, confirm/unsubscribe routes, admin tab + CSV.
4. **Alerts** — `Alert` model, matcher on `createDiscount` with 6h cooldown, token-auth `/alerts` page.

**Exit:** all four features' verification checklists pass; `npm run build` green.

---

## Phase 3 — Email delivery (CODE SHIPPED 2026-06-04, ACTIVATION PENDING)

**Why:** Phase 2 left confirmation + alert emails logging to console. Nothing monetization-related ships publicly until real mail goes out — the newsletter list is worthless without delivery, and alerts don't retain users without it.

**Shipped:**
- Provider: **Resend** (free tier 3k/mo, 100/day).
- [src/lib/email.ts](src/lib/email.ts) — wraps Resend with Greek HTML+text templates for confirmation + price alerts. Falls back to console.log when `RESEND_API_KEY` unset (dev-friendly).
- Wired into [subscribe.ts](src/actions/subscribe.ts) (confirmation on signup) and `fireAlertsFor()` in [create-discount.ts](src/actions/admin/create-discount.ts) (price-match notification, after 6h cooldown bookkeeping).
- Env vars documented in [.env.example](.env.example): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`.

**Still pending for full activation:**
- Add `RESEND_API_KEY` to Vercel env vars (currently emails fall back to console.log in production).
- Verify a sending domain in Resend (`prosforespantou.gr`) and set `EMAIL_FROM="Prosfores Pantou <alerts@prosforespantou.gr>"`. Without this, the default `onboarding@resend.dev` only delivers to the Resend account holder.
- Alerts currently fire only from admin `createDiscount`; bulk-pipeline (ingest-offers) writes don't trigger alerts by design (would mail-bomb users). Plan: separate daily cron pass that batches alerts off recent NEW Discounts. Not built yet.

**Do NOT:**
- Send any marketing before `confirmedAt` is set.
- Reuse the confirmToken as the unsubscribe token. Separate tokens, already in schema.

**Exit:** Real confirmation email arrives within 30s of form submit + alert creates → matching new Discount → email arrives.

---

## Phase 4 — Per-chain adapters + shared pipeline (5 CHAINS LIVE 2026-06-04; coverage imbalance is the active gap)

**Why:** Data staleness is the single biggest product risk. The old per-chain bespoke pipelines (Playwright fetcher → Cheerio extractor → LLM matcher per chain) didn't scale to 10 chains — every new chain meant rewriting 3 scripts and managing their interactions. The new approach: **one adapter per chain (does fetching + shape mapping only) → one shared pipeline (matching + DB writes + safety checks)**. Adding a chain becomes ~80 lines, not a 3-file project.

**Architecture (decided 2026-04-26, GTIN pivot 2026-05-11, adapter refactor 2026-05-26):**

- `Discount.source` field (`'web'` / `'leaflet'` / `'manual'` / `'wolt'`) isolates each scraper's runs. End-of-run deactivation only touches its own source. The new adapters use `'web'` (and `'leaflet'` for leaflet flows).
- `Product` is the canonical cross-chain table. `Product.barcode` (normalized GTIN-13) is `@unique` and is the primary cross-chain key.
- One Product → many active Discount rows (one per source). UI groups by `productId`.
- **`ChainProductMapping(supermarket, chainItemcode, productId)`** — stable per-chain SKU → Product lookup. Populated by the pipeline on any successful match. Makes re-ingestion idempotent and instant.
- **GTIN-14 → GTIN-13 normalization mandatory** for any barcode write. `normalizeBarcode()` in [wolt-canonical-scraper.mjs](src/scripts/wolt-canonical-scraper.mjs) AND [lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) — kept identical. Without it: cross-chain duplicate Products.

**Adapter contract + shared pipeline (shipped 2026-05-26):**

- [src/scripts/adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) — read-first rulebook for every chain adapter. Defines the `OfferItem` shape and the safety guarantees.
- [src/scripts/lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) — shared pipeline. Exports `ingestOffers({chain, source, items, dryRun})`. Implements the matching waterfall (mapping → barcode → cache → PendingMatch), per-item writes, and the safety rules.

**Per-item matching waterfall** (first hit wins):
1. `ChainProductMapping` lookup `(chain, chainItemcode)` → instant
2. `Product.barcode` lookup → records ChainProductMapping for next time
3. `MatchCache` lookup `(name, chain)` → binds a ChainProductMapping too
4. None → `PendingMatch` row (Review Queue). Pipeline NEVER invents a Product.

**Safety guarantees:**
- Adapter returns `[]` → abort, NOTHING deactivated.
- Adapter returns < 50% of currently-active when active > 20 → writes happen, deactivation SKIPPED.
- Soft delete only.
- Source isolation: deactivation always filters `(supermarket, source)`.

**Currently shipped (2026-06-04 — 5,225 active Discounts across 5 chains):**

| Chain | Adapter | Active | Notes |
|---|---|---|---|
| Kritikos | [adapters/kritikos.mjs](src/scripts/adapters/kritikos.mjs) | **2,867 web** | GitHub Actions daily 02:00 UTC. 100% barcode-matched. Filter: `offerType !== 'none'`. |
| Masoutis | [adapters/masoutis.mjs](src/scripts/adapters/masoutis.mjs) | **2,015** (180 web + 1,835 leaflet) | Vercel Cron daily web 06:00 + weekly leaflet Thu 06:30 UTC. |
| AB Vasilopoulos | [adapters/ab.mjs](src/scripts/adapters/ab.mjs) | **255 web** | GitHub Actions daily 03:00 UTC, immediately chained with [resolve-pending-matches.mjs](src/scripts/resolve-pending-matches.mjs). ~70% resolution rate via brand-aware matching. |
| My Market | (canonical only via Wolt) | **56 wolt-strikethrough** | Weekly Sun 04:00 UTC. Chain-direct adapter not built — biggest coverage win remaining. |
| Sklavenitis | (canonical only via Wolt) | **32 wolt-strikethrough** | Weekly Sun 05:00 UTC. Chain-direct adapter not built. |
| Lidl | [api/cron/scrape-lidl/route.ts](src/app/api/cron/scrape-lidl/route.ts) | unclear | Vercel Cron Thu 07:00 UTC. Existing OCR cron bypasses ingest-offers. Rewire ~2h. |

**Infrastructure shipped 2026-05-26 → 2026-06-04:**

- LLM resolver [src/scripts/resolve-pending-matches.mjs](src/scripts/resolve-pending-matches.mjs) — chain-agnostic; brand-aware via new `PendingMatch.brand` column (added 2026-05-27).
- Kritikos canonical scraper [src/scripts/kritikos-canonical-scraper.mjs](src/scripts/kritikos-canonical-scraper.mjs) — 6,850 new canonical Products.
- Kritikos offers adapter — broadened filter to `offerType !== 'none'`, walks full category tree.
- Vercel Cron route [src/app/api/cron/scrape-masoutis/route.ts](src/app/api/cron/scrape-masoutis/route.ts).
- GitHub Actions workflow [.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml). Required repo secrets: `DATABASE_URL`, `DIRECT_URL`, `GROQ_API_KEY`.

**Still to do (priority order — chain coverage is the visible gap):**

1. **Sklavenitis chain-direct adapter** — currently 32 (Wolt 5%); their site has full feed → expected 500-1,500. ~3h.
2. **My Market chain-direct adapter** — same pattern, currently 56. ~3h.
3. **Lidl pipeline rewire** — make existing OCR cron use ingest-offers (source isolation, MatchCache, PriceSnapshot). ~2h.
4. **Bulk Review Queue admin actions** — clear ~1,172 pending rows. ~1h.
5. **AB persisted-query hash auto-recovery** — automate re-capture when hash 404s.
6. **Bazaar / Galaxias / Market In / Discount Markt** — Tier 3 — leaflet OCR if pursued at all.
9. **Scheduled cron** for daily/weekly runs.

**Do NOT:**
- Run the legacy Masoutis chain (`fetchers/masoutis.mjs → extractors/masoutis-web.mjs → matchers/groq-matcher.mjs`) alongside the new adapter — they both write `masoutis/web` Discounts and would stomp each other. The old `groq-matcher.mjs` is kept ONLY as a reference for building the standalone LLM resolver.
- Create a Product row from a chain adapter without going through the matching waterfall. The pipeline routes unmatched items to `PendingMatch` — the LLM resolver (or admin Review tab) is the only legitimate path to a new Product.
- Conflate sources. Always filter `(supermarket, source)` on deactivation.
- Auto-create SKUs from any matcher's "NEW" verdict.
- Delete `Discount` rows. Flip `isActive`.
- Skip GTIN normalization on any barcode write.
- Edit any adapter without first reading [adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md).

**Exit (Phase 4 is "complete" when):**
- ✅ Adapter contract + shared pipeline shipped (2026-05-26)
- ✅ Masoutis on the new pipeline (2026-05-26)
- ⏳ Kritikos canonical + adapter live
- ⏳ AB live (after LLM resolver)
- ⏳ ≥1 Wolt-only chain (Sklavenitis or My Market) live as baseline
- ⏳ Scheduled cron running at least one chain daily without manual intervention
- ⏳ Documented "add a new chain" recipe (probably just CONTRACT.md + a one-paragraph quickstart)

---

## Phase 4.5 — Matcher at scale (SHIPPED 2026-05-01 → verified on web cycle 2026-05-06)

**Status:** Implementation done. Empirical proof on web cycle 1: 120/365 cache hits + 3 auto-accepts = 33% of items skipped LLM on a "cold" cycle (because of overlapping items between consecutive matcher iterations during dev). Steady-state will be much higher once leaflet completes and we're in maintenance mode.

**Shipped:**

1. ✅ **`MatchCache` table** ([prisma/schema.prisma](prisma/schema.prisma) — `MatchCache` model). Unique on `(rawName, supermarket)`. `brandToken`, `source` (`'llm'`/`'auto_accept'`), `createdAt`, `lastUsedAt`. 90-day soft expiry (manual eviction via SQL).
2. ✅ **Cache-first lookup + write** in both [groq-matcher.mjs](src/scripts/matchers/groq-matcher.mjs) and [ollama-matcher.mjs](src/scripts/matchers/ollama-matcher.mjs). Hit → write Discount + PriceSnapshot, update `lastUsedAt`, skip pre-filter and LLM.
3. ✅ **High-overlap auto-accept**. Rule: `rawTokens.length >= 3 && rawTokens.every in topCandidate && brandsMatch(rawName, candidate)` → accept without LLM. Cached as `source='auto_accept'`.
4. ✅ **Brand-guard with Latin↔Greek transliteration** (`brandsMatch()` + `LATIN_TO_GREEK` map). Handles Fix↔Φιξ, Pampers↔Πάμπερς, Coca-Cola↔Κόκα-Κόλα, ΑΒ Βασιλόπουλος↔AB Vassilopoulos. Used by both pre-filter auto-accept gate AND post-LLM brand validation.

**Empirical results (web cycle 1, 2026-05-06):**

| Metric | Value |
|---|---|
| Total items | 365 |
| 💾 Cache hits | 120 (33%) |
| ⚡ Auto-accepts | 3 (1%) |
| 🤖 LLM calls | 242 (66%) |
| Run time | ~25 min (PACE_MS=2000 + retries) |

**Do NOT:**
- Remove the post-LLM brand-guard. Pre-filter brand-check and post-LLM brand validation protect different failure modes.
- Cache forever. 90-day soft expiry is the cheap correctness mechanism.
- Cache PendingMatch decisions. Only cache successful (rawName → productId) mappings.

**Open follow-ups (not blocking):**

- **Embeddings + pgvector (Step B)** — paused per "95% relevant" rule. Decide based on real-world cache hit rate after leaflet cycle 1 completes and we observe 2-3 maintenance cycles. If cache hit rate > 90% steady state, embeddings are unnecessary.
- **Cache eviction admin UI** — for now manual via `DELETE FROM match_cache WHERE raw_name = '...'`. Build admin button when first wrong cached match surfaces in the wild.

**Exit (already met):** Adding an 11th supermarket fits in < 30 min wall-time per cycle on the Groq free tier in steady state. Cold-start for a new supermarket is ~the original LLM-on-everything cost — one-time tax per chain.

---

## Phase 4.6 — Cross-chain price comparison (SHIPPED 2026-05-27)

**Why:** A competitor app already ships this as their headline feature (cross-chain price for a single product, "Φθηνότερο" badge on cheapest, % delta vs cheapest). Per the owner-validated product vision in [CONTEXT.md §0](CONTEXT.md#0-product-vision-recorded-2026-05-01-directly-from-owner), this is differentiator #1. Schema is already capable: a single `Product` can have many active `Discount` rows across `supermarket` slugs, and `MatchCache` will increasingly map raw names from different chains onto the same `productId` once cross-chain canonicalization happens.

**Deliverables:**

1. **Cross-chain query** in [src/actions/](src/actions/) — given a `productId`, return all active discounts grouped by supermarket with delta-vs-cheapest precomputed.
2. **Comparison component** — list of supermarket rows with logo, current price, delta. Cheapest gets a "Φθηνότερο" chip. Tap a row to deep-link to that supermarket's offer page.
3. **Surface placement:**
   - Offer detail page (`/offer/[id]`) — full comparison block.
   - DiscountCard modal — collapsed comparison summary "Επίσης σε X άλλα μαγαζιά".
4. **Cross-chain canonicalization** of `Product` rows. **2026-05-11 update:** `Product.barcode` is now `@unique` and gets populated from Wolt's `barcode_gtin` field — single canonical table, no `canonicalProductId` self-reference needed. Items not on Wolt (Lidl, fresh produce) fall back to fuzzy matching as before. Coverage measured: 99.7-99.8% of items have a real GTIN. See [CONTEXT.md §3.1](CONTEXT.md#31-wolt-primary-source-today) for the assortment-API recipe.

**Do NOT:**
- Match across chains using just rawName — too noisy. Use `Product.barcode` first; only fall back to `(brandToken, primaryNoun, quantityToken)` triple when barcode is null on both sides.
- Build the `canonicalProductId` self-reference. With Wolt as the canonical source it's no longer necessary — one `Product` row per real-world product, identified by `barcode`.
- **NEW 2026-05-12**: build the cross-chain comparison UI on top of Wolt-strikethrough data alone. Wolt only exposes strikethrough discounts (`original_price > price`), which is ~5% of items. The dominant Greek-supermarket promo pattern is **ΜΟΝΟ-style offers** ("ΜΟΝΟ X.XX€", no strikethrough) which Wolt does NOT flag. Proved empirically by scanning 3,750 Masoutis items: 0 had any non-strikethrough promo signal. For complete offer coverage, the UI must consume chain-direct ingestion (masoutis.gr's offers API has explicit `OfferDescr: "μόνo"` flag).

**Exit:** ELVIVE 400ml shampoo (or any popular cross-chain SKU) renders a single offer detail page showing prices from every chain that currently has it discounted, with the cheapest highlighted.

**2026-05-12 status:** Phase 4.6 is blocked on chain-direct offer ingestion. The Wolt canonical catalog is ready (7,271 canonical Products, 373 shared between Masoutis and AB). What's missing is per-chain offer data that captures ΜΟΝΟ-style promos. The path forward is to adapt the existing masoutis web/leaflet matcher (which already detects `OfferDescr: "μόνο"`) to write Discounts linked to the new canonical Products via GTIN-first matching.

**2026-05-27 update — SHIPPED:** `getPriceComparison` already existed and queries by `productId`. ProductModal got the comparison block (was only on offer detail page). 67+ cross-chain Products with active multi-chain Discounts visible today. Will grow as Sklavenitis/My Market chain-direct adapters ship (Phase 4 priority list).

---

## Phase 4.7 — Capacitor wrap → real iOS/Android app (UPCOMING — gated on completion of the rest of Phase 4)

**Owner alignment (2026-06-04):** Estimated 3-4 weeks to live on both stores. Sequence: finish remaining web items (Phase 3 activation, Phase 4 chain coverage, daily-deals widget, shopping-list pricing) → mobile UX audit → privacy policy + ToS → app icon + splash + screenshots → Capacitor wrap (1-2 days) → Apple/Google review (1-2 weeks).

**Why:** End form per [CONTEXT.md §0](CONTEXT.md#0-product-vision-recorded-2026-05-01-directly-from-owner) is a native app on App Store + Play Store. Native unlocks: push notifications for watch-list alerts, barcode scanner, app-store presence (huge for an elderly audience that finds apps via the store search). The Phase 4.6 cross-chain comparison + Phase 6 price-history features are now shipped, so the app would launch with real differentiators on day 1 of TestFlight.

**Why Capacitor and not React Native:** the current codebase is Next.js + JS components. Rewriting in RN is a 2-3 month project with high regression risk. Capacitor wraps the existing app as a real iOS/Android binary — same codebase, native shell, native plugins for push + barcode. Pragmatic 1-2 day wrap.

**Deliverables:**

- `npx cap init` + iOS + Android scaffolding under `ios/` and `android/`.
- Static-export build target (`output: 'export'`) for the wrapped surface OR run a small Node serverless target — TBD based on which Next.js features we lean on hardest.
- `@capacitor/push-notifications` + a `device_tokens` table linking subscriber → device for native push.
- `@capacitor/barcode-scanner` plugin → barcode lookup against `Product.barcode`.
- TestFlight + Play Console internal track distribution.

**Do NOT:**
- Try to wrap before the Phase 3 (email) + Phase 4.6 (cross-chain) features ship. The app needs a "wow" feature on day 1 of TestFlight.
- Attempt this on top of Server Actions only — Capacitor needs static or rendered HTML it can pre-package. Audit which routes use SA-only fetches.

**Exit:** owner can install the app via TestFlight on a real iPhone, see the homepage, search, view a deal, scan a barcode, and get a push notification when a watched product goes on offer.

---

## Phase 5 — Partner pitch package

**Why:** By this point there's real click data + a subscriber list + featured slot infra. Convert one supermarket to paid.

**Deliverables:**
- **Public partner page** (`/partners`) — static pitch: audience size, click volume by supermarket (last 30d), example featured placement.
- **Media kit** (PDF) generated from live data once a week.
- **Partner-self-serve dashboard** (read-only) at `/partners/{supermarket}?token=...` showing their own clicks, list adds, leaflet opens, featured-slot performance.
- Rate-card somewhere internal (not public) for featured slot pricing.

**Exit:** first paid featured slot live; the partner receives a weekly email summary from Phase 3's infra.

---

## Phase 6 — Price history UI (SHIPPED 2026-06-04)

**Why:** "Is this actually a good price?" is the #1 question after "what's on offer?". Phase 4 populated the data; now show it.

**Shipped:**
- [src/actions/get-price-history.ts](src/actions/get-price-history.ts) — returns last-N-day points, min/max/avg + verdict (lowest/good/fair/meh/high). Tuned for honesty: "lowest" only when current = window min; "high" warns when current > avg.
- [src/components/PriceHistory.js](src/components/PriceHistory.js) — inline SVG sparkline (no charting dep), Greek verdict pill, plain summary line. `compact` prop for the tighter modal layout.
- Rendered in `ProductModal` (background fetch on open) and the offer detail page (server-side in `Promise.all`).
- Uses already-collected `PriceSnapshot` rows (~12,542 as of 2026-06-04, top products have 50-115 snapshots).

**Verified live:**
- Heinz Mayo at €1.74 (range €1.74-€3.21) → ✓ "Χαμηλότερη τιμή που έχουμε δει"
- Colgate Max White at €3.75 (range €1.68-€3.75) → ⚠ "Πάνω από τον μέσο όρο"

**Renders only when ≥3 data points exist for a product** — newer chains' Discounts show nothing until 3 cycles have been ingested. Daily crons fix this naturally.

---

## Phase 7 — Mobile + leaflet viewer polish

**Why:** Greek supermarket shoppers are heavily mobile. Current UI is desktop-first.

**Deliverables:**
- Responsive pass on homepage + supermarket pages. No horizontal scroll on 360px viewports.
- Full-screen pinch-zoom leaflet viewer (pageImages[] swipe).
- Install prompt / PWA shell — shopping list works offline via service worker cache.

**Exit:** Lighthouse mobile score ≥90 on homepage; leaflet viewer works on a real phone.

---

## Phase 8 — Scale beyond Wolt-listed chains (PARTIALLY SHIPPED — see Phase 4 status)

**Original goal:** ≥6 chains live with automated ingestion.

**2026-06-04 status: 5 chains live** (Kritikos, Masoutis, AB, My Market, Sklavenitis). Lidl has a cron but bypasses ingest-offers. Remaining Tier 1/2 gaps tracked in Phase 4's "Still to do" list. Tier 3 chains (Bazaar, Galaxias, Market In, Discount Markt) remain unaddressed — leaflet-OCR path via the Lidl pattern is the future option if pursued at all.

---

## Phase 9 — Full-catalog price baseline → honest verdicts → watch-list alerts (PLANNED 2026-06-12)

**Why (user decision, 2026-06-12):** today we only see prices when a chain *promotes* an item, so (a) the price-history "Μέση" is an average of offer prices — biased low, (b) we cannot prove a "-35%" is real (the chain may have raised the base price last week), (c) watch-list alerts can't fire for products that simply aren't on promo anywhere. Ingesting every product's shelf price gives us the baseline that makes the honesty positioning bullet-proof — it's the moat.

**The three price kinds to distinguish (explicit user requirement):**
1. **normal** — regular shelf price, no promo claimed.
2. **strikethrough** — real price-change discount (original → offer price, both published).
3. **mono** — "ΜΟΝΟ x€"-style promos where the chain HIDES the reference price (94% of real offers per the 2026-05-12 analysis). With a baseline we can compute the hidden delta ourselves and say honestly "κανονικά ~2.49€, τώρα 1.99€".

**Design sketch (build on what exists — no new architecture):**
- Adapters already see the full catalog (they currently FILTER to on-offer rows: mymarket keeps only `is-on-offer` cards, etc.). Step 1 is a per-chain `FULL_CATALOG=1` pass that walks all items, *not* writing Discounts for non-offer rows — only PriceSnapshots.
- `OfferItem.offerType` (`'mono' | 'strikethrough' | null`) already flows from the adapters but ingest-offers DOESN'T persist it — persist it first (new `Discount.offerType` + `PriceSnapshot.kind = 'normal' | 'strikethrough' | 'mono'`; `isDiscounted` stays for back-compat).
- Snapshot only on change (the ingest already does this for offers) — catalog size is ~10-30k items/chain but steady-state daily writes are the few hundred that moved.
- Match by `chainItemcode` via ChainProductMapping — no new matching work; unmatched catalog items get NO snapshot (no productless shelf-price rows).
- Pilot with sklavenitis + mymarket (richest catalogs, adapters already paginate the full listing), watch DB growth + IngestRun duration for two weeks, then expand.
- Then alerts: favorites already persist client-side (`favorites` in the zustand store) + Subscriber double-opt-in email exists (Phase 3) → server-side watch list keyed by productId, daily post-ingest check "did any watched product gain an active Discount / drop below its baseline?", email via Phase 3 plumbing, push later via the Capacitor wrap (Phase 4.7).

**Do NOT:**
- Do NOT write Discount rows for non-offer catalog items — the public UI is offers-only; normal prices live in PriceSnapshot.
- Do NOT compute verdicts mixing pack sizes or mis-mapped products — the offer-similarity guard + mapping audit (2026-06-12) must stay green first.
- Do NOT turn on a chain's full-catalog pass before its mappings audit is clean — baselines written through wrong mappings poison the exact feature this phase exists for.

**Exit:** for ≥2 chains, an offer page can show "κανονική τιμή ~X€" sourced from ≥7 days of normal-price snapshots; ≥1 real user receives a watch-list email triggered by a real price drop.

---

## Cross-cutting: what NOT to do

- Don't build admin charts before a partner asks for them. Tables sell fine.
- Don't pick an email provider before Phase 3 starts — requirements change once you see real bounce rates.
- Don't add GDPR cookie banners preemptively. LocalStorage UUID for sessionId is functional, not tracking. Consult a lawyer before public launch, not before.
- Don't start Phase 5 without the ingestion reliability from Phase 4 — a pitch deck with stale data is worse than no pitch.
- Don't refactor `src/lib/prisma.ts`, `next.config.*`, or `AGENTS.md` while chasing a bug elsewhere.
