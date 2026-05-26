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

## Phase 3 — Email delivery (NEXT)

**Why:** Phase 2 left confirmation + alert emails logging to console. Nothing monetization-related ships publicly until real mail goes out — the newsletter list is worthless without delivery, and alerts don't retain users without it.

**Deliverables:**
- Pick one provider: **Resend** (simplest), Postmark (best deliverability), or SES (cheapest at scale). Default recommendation: **Resend** for v1.
- Add `RESEND_API_KEY` to `.env.local` (tell the user — do NOT edit env files).
- Thin wrapper `src/lib/email.ts` exporting `sendConfirmation(sub)`, `sendAlert(sub, discount)`, `sendUnsubscribeReceipt(sub)`. Wrapper signs every send with the existing `unsubToken` for one-click unsubscribe.
- Wire into [subscribe.ts](src/actions/subscribe.ts) (confirmation) and the alert matcher in [create-discount.ts](src/actions/admin/create-discount.ts).
- DKIM/SPF records on the sending domain. Warm the domain on low volume before a public push.
- Log every send as a `EmailEvent` row (type, subscriberId, sentAt, providerMessageId) so bounces / complaints have a paper trail.

**Do NOT:**
- Send any marketing before `confirmedAt` is set.
- Reuse the confirmToken as the unsubscribe token. Separate tokens, already in schema.

**Exit:**
- Real confirmation email arrives within 30s of form submit.
- Alert creates for a confirmed subscriber → when admin creates a matching discount, the email arrives.
- Bounce on a fake address flips a flag (or at minimum logs to Sentry) and stops future sends.

---

## Phase 4 — Per-chain adapters + shared pipeline (IN PROGRESS — Masoutis migrated 2026-05-26, AB built, Kritikos next)

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

**Currently shipped:**

| Chain | Adapter | Status | Notes |
|---|---|---|---|
| Masoutis | [adapters/masoutis.mjs](src/scripts/adapters/masoutis.mjs) | ✅ LIVE | 152 active Discounts, 70 in Review Queue, verified correct. Replaces the old fetcher+extractor+groq-matcher path. **DO NOT run that old path alongside.** |
| AB Vasilopoulos | [adapters/ab.mjs](src/scripts/adapters/ab.mjs) | ⚠️ built, not run live | Dry-run OK: 394 real price discounts reachable (vs Wolt's 41). All would cold-start to Review Queue — needs LLM resolver first. |
| Kritikos | [adapters/kritikos.mjs](src/scripts/adapters/kritikos.mjs) | 🚧 draft, broken | Filter too strict (3/94 pass) + URL-depth issues. Decision: build canonical scraper first. |

**Still to do (priority order):**

1. **`kritikos-canonical-scraper.mjs`** — modeled on Wolt scraper. Walks all 8,216 Kritikos products, upserts by GTIN. Grows canonical catalog.
2. **Fix Kritikos offers adapter** — loosen filter, handle SPA-fallback HTML responses.
3. **Live-run Kritikos** — expect ~2,700 Discounts, ~100% barcode matches after step 1.
4. **`resolve-pending-matches.mjs`** — LLM resolver as standalone infra (not Masoutis-specific like today's groq-matcher). Reads PendingMatch table, calls Groq with candidates, writes Discount + MatchCache + ChainProductMapping on success.
5. **Live-run AB** — once resolver exists, the 394 PendingMatch items become Discounts.
6. **AB persisted-query hash recovery** — automate re-capture when hash 404s.
7. **Other Wolt-listed chains** — Sklavenitis, My Market, Market In via [wolt-canonical-scraper.mjs](src/scripts/wolt-canonical-scraper.mjs). Trivial.
8. **Lidl** — PDF leaflet OCR. May reuse existing Lidl cron with adapter-style payload.
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

## Phase 4.6 — Cross-chain price comparison (NEW; elevated 2026-05-01 from competitor analysis)

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

---

## Phase 4.7 — Capacitor wrap → real iOS/Android app (NEW; per product vision §0)

**Why:** End form per [CONTEXT.md §0](CONTEXT.md#0-product-vision-recorded-2026-05-01-directly-from-owner) is a native app on App Store + Play Store. Native unlocks: push notifications for watch-list alerts, barcode scanner, app-store presence (huge for an elderly audience that finds apps via the store search). Doing this BEFORE the cross-chain comparison feature ships is wrong (no compelling app); doing it AFTER lets us launch with a real differentiator.

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

## Phase 6 — Price history UI

**Why:** "Is this actually a good price?" is the #1 question after "what's on offer?". Phase 4 populated the data; now show it.

**Deliverables:**
- Tiny sparkline on `DiscountCard` showing last-30-day price.
- Offer detail page gets a full chart + "lowest in last 90 days" badge.
- Honest-price logic: if `discountedPrice` is within 2% of the 30-day median, suppress the "Χορηγούμενο" feel of the UI — users will learn the chip means "actually cheap", not just "in leaflet".

**Exit:** a product that's been in the system ≥30 days shows a trend on its card.

---

## Phase 7 — Mobile + leaflet viewer polish

**Why:** Greek supermarket shoppers are heavily mobile. Current UI is desktop-first.

**Deliverables:**
- Responsive pass on homepage + supermarket pages. No horizontal scroll on 360px viewports.
- Full-screen pinch-zoom leaflet viewer (pageImages[] swipe).
- Install prompt / PWA shell — shopping list works offline via service worker cache.

**Exit:** Lighthouse mobile score ≥90 on homepage; leaflet viewer works on a real phone.

---

## Phase 8 — Scale beyond Wolt-listed chains

**Why:** Coverage is the moat. Chains not on Wolt (Bazaar, My Market, Kritikos, Galaxias) require their own ingestion paths.

**Deliverables:**
- Per-chain adapter pattern under `src/scripts/adapters/{chain}.mjs`. Each adapter produces the same upsert shape the current Wolt scripts do.
- At least one non-Wolt chain live.
- Adapter contract documented so a contractor could add a new chain without touching core code.

**Exit:** ≥6 chains live with automated ingestion.

---

## Cross-cutting: what NOT to do

- Don't build admin charts before a partner asks for them. Tables sell fine.
- Don't pick an email provider before Phase 3 starts — requirements change once you see real bounce rates.
- Don't add GDPR cookie banners preemptively. LocalStorage UUID for sessionId is functional, not tracking. Consult a lawyer before public launch, not before.
- Don't start Phase 5 without the ingestion reliability from Phase 4 — a pitch deck with stale data is worse than no pitch.
- Don't refactor `src/lib/prisma.ts`, `next.config.*`, or `AGENTS.md` while chasing a bug elsewhere.
