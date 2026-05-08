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

## Phase 4 — Agentic Ingestion & Matching (IN PROGRESS — Masoutis web cycle 1 done 2026-05-06; leaflet cycle 1 ~45% blocked on Groq quota)

**Why:** Data staleness is the single biggest product risk. But we also want a perfectly clean database. Instead of treating every store's items as new products, we use the existing Wolt data as a "Master Catalog" and map new prices to it using AI.

**Architecture (decided 2026-04-26):**
- `Discount.source` field (`'web'` / `'leaflet'` / `'manual'`) isolates each scraper's runs. End-of-run deactivation only touches its own source — leaflet matcher cannot wipe web data, and vice versa.
- `Product` rows are still chain-specific (`supermarket = 'masoutis'`). Cross-chain canonical products are deferred until Lidl is added.
- One product can have many active `Discount` rows (one per source). UI groups by `productId` to render a single card with multiple source tags.

**Shipped (Masoutis web):**
- ✅ Live fetcher [src/scripts/fetchers/masoutis.mjs](src/scripts/fetchers/masoutis.mjs) — Playwright + stealth, scrapes masoutis.gr/prosfores, dated HTML output to `library_data/`.
- ✅ Web extractor [src/scripts/extractors/masoutis-web.mjs](src/scripts/extractors/masoutis-web.mjs) — Cheerio parser for the Angular DOM (`.product` / `.pDscntPrice` / `.pStartPrice`), produces matcher-ready JSON.
- ✅ Hardened matcher [src/scripts/matchers/ollama-matcher.mjs](src/scripts/matchers/ollama-matcher.mjs) — local Gemma4 via Ollama, token-set pre-filter, UUID + candidate-list validation (kills hallucinations), 3× retry on Ollama errors, 3× retry on transient DB errors, update-in-place with reactivation, end-of-run stale-deactivation filtered by source.
- ✅ `PriceSnapshot` written on every match.
- ✅ Admin Review Queue UI: 🧐 Review tab in [src/components/AdminPanel.js](src/components/AdminPanel.js) — Approve / Create-SKU / Reject buttons per row.
- ✅ Server actions: [list-pending-matches.ts](src/actions/admin/list-pending-matches.ts), [approve-pending-match.ts](src/actions/admin/approve-pending-match.ts), [reject-pending-match.ts](src/actions/admin/reject-pending-match.ts), [create-sku-from-pending.ts](src/actions/admin/create-sku-from-pending.ts).
- ✅ `PendingMatch` upsert by `(rawName, supermarket)` — runs no longer accumulate duplicates.

**Shipped (Masoutis leaflet, 2026-05-01 → 2026-05-06):**
- ✅ Leaflet fetcher [src/scripts/fetchers/masoutis-leaflet.mjs](src/scripts/fetchers/masoutis-leaflet.mjs) — same shape as web fetcher, hits `subitem=2`.
- ✅ Leaflet extractor [src/scripts/extractors/masoutis-leaflet.mjs](src/scripts/extractors/masoutis-leaflet.mjs) — does NOT filter on `originalPrice` (single-price items are valid offers; see CONTEXT.md §4.1).
- ✅ Source-isolated matching: `SOURCE=leaflet INPUT_FILE=./pending_masoutis_leaflet_deals.json node src/scripts/matchers/groq-matcher.mjs`.
- ✅ Multi-source UI grouping shipped: [src/lib/group-deals.js](src/lib/group-deals.js) groups by `productId`; DiscountCard renders source-tag chips.

**Still to do:**
- **Resume leaflet cycle 1** — partial run stopped at item 1041/2319 on 2026-05-06 (Groq daily quota burned). Cache from partial run will skip the first 1041 in next attempt. Re-run after quota reset OR over multiple days OR overnight via Ollama.
- **Master catalog gaps** — Wolt-sourced library is missing personal care / hair / cosmetics. Either save more Wolt category pages OR rely on Create-SKU-from-pending for those items.
- **Library viewer pagination** — Library tab fetches `limit: 100` so only a fraction of 1327 catalog items is browsable.
- **Lidl extractor** — only after Masoutis (web + leaflet) is fully clean.
- **Scheduled runs** — GitHub Actions / cron to run fetcher → extractor → matcher nightly.

**Do NOT:**
- Auto-create new SKUs from the matcher (Gemma's "NEW" verdict). Route to Review Queue and let admin decide via Create-SKU button.
- Delete `Discount` rows. Flip `isActive` so click history + PriceSnapshot history stay intact.
- Conflate `web` and `leaflet` deactivation runs — always filter `where: { source }`.

**Exit:**
- ✅ Masoutis web extractor + matcher end-to-end (done 2026-04-26).
- ✅ Admin Review Queue UI functional (done 2026-04-26).
- ✅ Masoutis leaflet fetcher + extractor + matcher wiring (done 2026-05-01).
- ✅ Web cycle 1 with cache + auto-accept (done 2026-05-06).
- ⏳ Leaflet cycle 1 — resume from item 1041 after Groq quota reset.
- ⏳ Library tab pagination + Wolt catalog gaps closed (or workflow defined).

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
4. **Cross-chain canonicalization** of `Product` rows. Today `Product` is keyed by `(woltId)` and tagged with a `supermarket` slug, so the same physical SKU has N rows across N chains. Canonicalize via shared `barcode` (when present) OR a normalized name-and-quantity fingerprint. Add a `canonicalProductId` self-reference on `Product` rather than a destructive merge.

**Do NOT:**
- Merge `Product` rows destructively. `canonicalProductId` self-reference preserves per-chain product history (PriceSnapshot, Discount).
- Match across chains using just rawName — too noisy. Require either matching `barcode` or matching normalized `(brandToken, primaryNoun, quantityToken)` triple.

**Exit:** ELVIVE 400ml shampoo (or any popular cross-chain SKU) renders a single offer detail page showing prices from every chain that currently has it discounted, with the cheapest highlighted.

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
