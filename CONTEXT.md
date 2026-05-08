# Prosfores Pantou — Project Context

Living snapshot of what the project is, how data flows, and where things live. Read this before starting any new work. For the forward-looking roadmap see [PHASES.md](PHASES.md).

---

## ⚡ Pick up here (2026-05-07)

**Current state of the Masoutis ingestion cycle:**

- ✅ **Web matcher cycle 1 — DONE** (2026-05-06). Final stats: 120 cache hits, 3 auto-accepts, 242 LLM calls → 138 updated, 227 to review queue, 15 deactivated. Log: `matcher_web_v8_2026-05-06.log`.
- ⚠️ **Leaflet matcher cycle 1 — STOPPED at item 1041/2319** (~45% complete). Cause: Groq daily quota burned mid-run. Log: `matcher_leaflet_v2_2026-05-06.log`. The cache from this partial run captured ~700+ matches that the next run will hit instantly.

**Next concrete steps (in order):**

1. **Resume leaflet matcher** when Groq quota resets (UTC 00:00). Re-run command from CLAUDE.md "Ingestion pipeline" — same input file. Cache hits + auto-accepts will skip already-matched items, so the actual LLM workload will be ~1300 fresh items. Even on free tier that's ~75 min wall-time.
2. **Verify leaflet completion**: check final stats line, count active leaflet discounts in DB (`SELECT COUNT(*) FROM discounts WHERE source='leaflet' AND is_active=true`).
3. **End-to-end smoke** on the public site: visit homepage, confirm both web + leaflet source chips render on dual-source products via `groupDealsByProduct()`.
4. **Then move on to**: cross-chain price comparison (highest-leverage feature per competitor analysis 2026-05-01) OR Capacitor wrap to ship as a real iOS/Android app (see PHASES.md Phase 7+).

**Architecture status — what shipped during 2026-05-01 → 2026-05-06:**

- `MatchCache` table live. Schema: `(rawName, supermarket) UNIQUE → productId, brandToken, source, lastUsedAt`. Wired into both `groq-matcher.mjs` and `ollama-matcher.mjs` (cache-lookup → auto-accept → LLM in priority order).
- **Groq Llama-4-Scout** (`meta-llama/llama-4-scout-17b-16e-instruct`) is now the canonical matcher backend — see [src/scripts/matchers/groq-matcher.mjs](src/scripts/matchers/groq-matcher.mjs). Ollama remains a fallback for unattended overnight runs without API quotas.
- **Brand-guard with Latin↔Greek transliteration**. The `brandsMatch()` function maps Fix↔Φιξ, Pampers↔Πάμπερς, Coca-Cola↔Κόκα-Κόλα so cross-script brand names don't get filtered out. See `LATIN_TO_GREEK` map at top of `groq-matcher.mjs`.
- **Auto-accept rule**: if `rawTokens.length >= 3` AND every raw token appears in the top candidate AND `brandsMatch(rawName, candidate)`, accept without LLM call. Verified: 3 auto-accepts on web cycle 1.
- **Multi-source UI grouping**. [src/lib/group-deals.js](src/lib/group-deals.js) groups by `productId`, picks lowest discountedPrice as primary, attaches `sources: string[]`. [src/components/DiscountCard.js](src/components/DiscountCard.js) renders source-tag chips (yellow=leaflet, blue=web).
- **Leaflet pipeline live**: fetcher [masoutis-leaflet.mjs](src/scripts/fetchers/masoutis-leaflet.mjs), extractor [masoutis-leaflet.mjs](src/scripts/extractors/masoutis-leaflet.mjs), runs through `groq-matcher.mjs` with `SOURCE=leaflet` env. Output: 2319 items.
- **DB hardening**: matcher uses `withDbRetry()` with delays `[5000, 10000, 20000, 30000, 60000] ms` to survive Supabase pooler EAUTHTIMEOUT during cold-start (~45s recovery typical). 30s fetch timeout via `AbortSignal.timeout()` on Groq calls.

**Known open issues:**

- 167 items in web review queue + ~700 expected leaflet review-queue items once leaflet finishes. These are mostly catalog gaps (personal care, hair, cosmetics) — see §4.2 below. Either expand catalog via Wolt or use Create-SKU button in admin Review tab.
- Groq free-tier daily quota cap (~25k tokens/day on free tier) is the real bottleneck for the 2319-item leaflet run. Options going forward: (a) split leaflet into 2 day-spaced runs, (b) upgrade Groq to dev tier (~$5/mo), (c) switch leaflet runs to Ollama overnight.

---

## 0. Product vision (recorded 2026-05-01 directly from owner)

**End form:** native mobile app on Play Store + App Store (iOS + Android). The web app is the companion / preview, not the primary surface. Phone-first design always.

**Audience:** Greek shoppers. Heavy lean toward elderly + 30–40+ adults. Some students. Designed for users who are NOT tech-savvy. UX must be forgiving, large-touch-target, low-cognitive-load.

**Core value proposition:** Single place to see ALL current discounts from every major chain — both supermarket-website offers (Προσφορές Εβδομάδας) AND printed leaflet offers (Προσφορές Φυλλαδίου). Replaces the painful workflow of checking multiple store apps + flipping through paper/PDF leaflets.

**Differentiators vs raw store apps:**
1. Cross-chain comparison ("γάλα δέλτα is X€ at AB, Y€ at Lidl, Z€ at Masoutis").
2. Price history per product (sparkline + "actually cheap?" badge).
3. Watch-list with alerts — user saves a product or keyword, gets notified (push + email) when it goes on discount.

### Hard rules

- **Login is OPTIONAL, never required.** Shopping list, search, browsing, leaflet viewing all work fully anonymous (LocalStorage). Login adds: cross-device sync, savings tracker, email/push alerts on watched items.
- **Honest pricing.** Many supermarket offers show only a current price with no strikethrough — these are genuine offers, not pollution. Render the price card without a fake % badge when `originalPrice IS NULL`. See §4.1.
- **Validity dates always visible.** Show absolute dates ("Από 16/4 έως 6/5"). Show a "λήγει σε X μέρες" urgency badge ONLY when ≤ 2–3 days remain.
- **Mobile-first, not "responsive later."** Audience is overwhelmingly on phones. Desktop is a fallback, not the design target.

### Already shipped (per owner, 2026-05-01)

- Shopping list works without login (LocalStorage).
- "Δες το φυλλάδιο" link on each supermarket page.
- Categories exist (improvement opportunity acknowledged — not a rebuild).
- Visible supermarket logos.

### Roadmap, re-prioritized for the audience

| # | Feature | Status |
|---|---|---|
| 1 | Mobile-responsive pass | NEXT — biggest unlock for the audience, moved ahead of P6 |
| 2 | Email delivery (Phase 3) | Newsletter + alerts hostage to this; provider TBD |
| 3 | Price history UI | Sparklines + "this isn't actually cheap" honest badge — main differentiator |
| 4 | Item watch-list with notifications/email | User saves product or keyword → push + email when it appears on discount |
| 5 | Cross-chain product matching | Same product across all chains, single comparison view |
| 6 | Category-first homepage redesign | Categories more prominent than chains |
| 7 | Savings tracker (logged-in users) | "Checkout" flow marks list items bought, computes savings vs strikethrough originalPrice |
| 8 | "Liked stores" (favorite 2–3 chains) | Filter site-wide by user's preferred chains. POST-LAUNCH. |
| 9 | Map / proximity | Nearest store, sort search results by closest. POST-LAUNCH, low priority — Greek cities are dense. |
| 10 | Direct-buy referral links | Supermarket pays per click. LAST — wait for supermarket e-commerce maturity. |

### Sharing

- Shopping list shareable via Notes / WhatsApp / Viber (Web Share API + clipboard fallback). No print stylesheet — print was dropped.

### Skipped / explicitly NOT building

- Print stylesheet (low value vs mobile audience).
- Required-login flows (kills adoption for elderly).
- Native maps for "nearest store" before launch (heavy on old phones; Greek cities dense; "liked stores" gives 90% of value).

### Auto-update / freshness

- Discounts have hard start/end dates. Treat them precisely — never extend `validUntil` past the leaflet's actual end.
- Pipelines run on a schedule (weekly / twice-weekly) — either via Vercel Cron OR owner manually triggers from local terminal. End-of-run deactivation per `source` removes expired rows. New ones get created/updated in-place. PriceSnapshot history is preserved across cycles.

### Monetization order (matches end-goal)

1. **Featured slots** (in-schema; admin toggle shipped) — pay-for-placement.
2. **Newsletter sponsorship** (gated on Phase 3 email delivery).
3. **Direct-buy referrals** (last — depends on supermarket online-shopping maturity, currently weak in Greece).

---

## 1. What the site is

**Prosfores Pantou** is a Greek supermarket discount aggregator. A shopper lands on one page and sees current offers across AB Vassilopoulos, Lidl, Sklavenitis, Masoutis, etc., instead of opening each retailer's app/leaflet separately.

Core user value:
- Search offers across all supermarkets in one place (with Greeklish + accent-insensitive matching).
- Build a shopping list that survives page reloads.
- Browse a single supermarket's current deals / digital leaflet.
- (Soon) Get emailed when a watched product goes on offer.

Monetization thesis: once we have click data per supermarket, we can sell featured placements / newsletter slots to those same supermarkets.

---

## 2. Tech stack (exact — don't assume older APIs)

- **Next.js 16.2.2** (App Router) on **Turbopack**. Aggressive caching in `.next/` — after schema changes, `rm -rf .next`.
- **React 19** with Server Actions (`'use server'` at top of file). No `app/api/*` routes unless absolutely required.
- **Prisma 7** with the **driver-adapter** pattern (`@prisma/adapter-pg`). Client lives in [src/lib/prisma.ts](src/lib/prisma.ts) — never `new PrismaClient()`.
- **PostgreSQL on Neon** (via Supabase historically; Neon is current).
- **Zod** for input validation at every action boundary.
- **Sentry** wraps every server action via `Sentry.withServerActionInstrumentation(name, { recordResponse }, fn)`.
- **Zustand** for client state (shopping list) — [src/lib/store.js](src/lib/store.js).
- **Playwright-extra + Stealth + Cheerio** for scraping.
- **No Tailwind.** Plain CSS in [src/app/globals.css](src/app/globals.css) + inline `style={{}}`.
- **Windows 11 + Git Bash.** Use forward slashes. `/dev/null`, not `NUL`.

House rules (from [AGENTS.md](AGENTS.md) / [GEMINI_HANDOFF.md](GEMINI_HANDOFF.md)):
- No `prisma migrate`. Only `npx prisma db push && npx prisma generate && rm -rf .next`.
- No `revalidatePath`. Use `revalidateTag('tagName', 'max')` with the existing tags.
- Server actions return `{ success: true, ... } | { success: false, error }` — never throw across the boundary.
- Admin actions start with `await requireAdmin()` from [src/lib/session.ts](src/lib/session.ts).
- Almost no code comments. Commit messages carry the "why".

---

## 3. Where the data comes from

### 3.1 Wolt (primary source today)
Most supermarkets in Greece sell through Wolt's marketplace, which exposes clean product JSON.

- **Live scraping** — [src/scripts/scrape-wolt.mjs](src/scripts/scrape-wolt.mjs): Playwright opens a venue page, intercepts XHR hitting `/menu/categories/` or `/venue/`, and captures JSON as you scroll categories. Stealth plugin avoids bot blocks.
- **Offline parsing** — [src/scripts/parse-wolt-html.mjs](src/scripts/parse-wolt-html.mjs): reads saved `.html` files from [library_data/](library_data/) (mostly Masoutis) with Cheerio, upserts into Product + Discount.
- **Batch** — [src/scripts/batch-parse-masoutis.mjs](src/scripts/batch-parse-masoutis.mjs) loops the HTML snapshots in `library_data/`.
- **Descriptions backfill** — [src/scripts/fetch-wolt-descriptions.mjs](src/scripts/fetch-wolt-descriptions.mjs) with [library_data/wolt_urls.json](library_data/wolt_urls.json) / `wolt_descriptions_done.json`.
- **Wipes** — [src/scripts/wipe-masoutis.mjs](src/scripts/wipe-masoutis.mjs), [src/scripts/wipe-lidl.mjs](src/scripts/wipe-lidl.mjs) for re-seeding.

Deduplication: `woltId` on `Product` is the source of truth. Deterministic IDs follow `wolt-{smId}-{slugifiedName}` so re-runs upsert rather than duplicate.

### 3.2 Admin panel (manual fallback)
[src/components/AdminPanel.js](src/components/AdminPanel.js) — password-gated (double-click the logo to reveal). Supports:
- Manual discount entry.
- Paste-Wolt-JSON import.
- AI Vision OCR (for printed leaflets).
- Product library browsing.
- Leaflet upload / auto-expire (`autoDeleteDays`).
- Stats tab (`ClickEvent` aggregates).
- Subscribers tab + CSV export.

### 3.3 Agentic Ingestion (Masoutis web + leaflet — live as of 2026-05-06)

A three-stage pipeline matches live store offers to the Wolt-sourced Master Catalog. Two parallel sub-pipelines now exist (web + leaflet), each tagged with its own `Discount.source`.

**Web pipeline** (subitem=1, "Προσφορές Εβδομάδας" — single-discounted-price card):

1. **Fetcher** [src/scripts/fetchers/masoutis.mjs](src/scripts/fetchers/masoutis.mjs) — Playwright + stealth, dated HTML to `library_data/masoutis_web_YYYY-MM-DD.html`.
2. **Extractor** [src/scripts/extractors/masoutis-web.mjs](src/scripts/extractors/masoutis-web.mjs) — Cheerio parses Angular DOM (`.product` cards). Output: `pending_masoutis_deals.json` (~365 items).
3. **Matcher** — defaults to `SOURCE=web`.

**Leaflet pipeline** (subitem=2, "Προσφορές Φυλλαδίου" — printed leaflet, often has strikethrough originalPrice):

1. **Fetcher** [src/scripts/fetchers/masoutis-leaflet.mjs](src/scripts/fetchers/masoutis-leaflet.mjs) — same shape as web fetcher, different URL path.
2. **Extractor** [src/scripts/extractors/masoutis-leaflet.mjs](src/scripts/extractors/masoutis-leaflet.mjs) — does NOT filter on `originalPrice` (see §4.1). Output: `pending_masoutis_leaflet_deals.json` (~2319 items).
3. **Matcher** — `SOURCE=leaflet INPUT_FILE=./pending_masoutis_leaflet_deals.json node src/scripts/matchers/groq-matcher.mjs`.

**Matcher backends** (canonical: `groq-matcher.mjs`):

- **[src/scripts/matchers/groq-matcher.mjs](src/scripts/matchers/groq-matcher.mjs)** — RECOMMENDED. Groq Cloud, model `meta-llama/llama-4-scout-17b-16e-instruct`. Free tier ~25k tokens/day; PACE_MS=2000 default. Env: `SOURCE`, `INPUT_FILE`, `LIMIT`, `PACE_MS`, `MAX_LLM_CANDIDATES`.
- **[src/scripts/matchers/ollama-matcher.mjs](src/scripts/matchers/ollama-matcher.mjs)** — fallback. Local Gemma4 via Ollama (`http://localhost:11434`). No API quotas; slower (~10-15s/item). Use for unattended overnight runs of large batches.
- **[src/scripts/matchers/gemini-matcher.mjs](src/scripts/matchers/gemini-matcher.mjs)** — currently blocked by Gemini free-tier quota=0 on owner's key. Unused.

**Per-item flow inside matcher** (decided 2026-05-01, shipped 2026-05-06):

1. **MatchCache lookup** (`SELECT FROM match_cache WHERE rawName=$1 AND supermarket=$2`). Hit → reuse `productId`, skip pre-filter + LLM, write Discount + PriceSnapshot, update `lastUsedAt`. Tag log line `💾 CACHE`.
2. **Auto-accept** (only if cache miss). Token-set pre-filter selects top-10 candidates by overlap; if `rawTokens.length >= 3 && rawTokens.every in topCandidate.tokens && brandsMatch(rawName, candidate)`, accept without LLM. Tag log line `⚡ AUTO`. Cache the result.
3. **LLM call** (only if cache + auto-accept both miss). Prompt with top-10 candidates + strict brand+quantity rules. Validate response UUID shape AND that UUID is in candidate list (kills hallucinations). Cache successful matches.

**Brand-guard with Latin↔Greek transliteration** (`brandsMatch()` in matcher). `LATIN_TO_GREEK` map handles Fix↔Φιξ, Pampers↔Πάμπερς, Coca-Cola↔Κόκα-Κόλα, ΑΒ Βασιλόπουλος↔AB Vassilopoulos. Without this, cross-script brand names false-negative the auto-accept gate AND the post-LLM brand validation.

**Three outcomes per item:**

- **Confident match** (cache, auto, or LLM ≥90% on a real candidate) → upsert active `Discount` (with `source`) + write `PriceSnapshot`. Tag `✅ MATCHED` / `🔄 UPDATED` / `⚡ AUTO` / `💾 CACHE`.
- **No match** (LLM says "NEW" or no candidate clears thresholds) → upsert `PendingMatch` with image for Review Queue. Tag `⚠️ REVIEW NEEDED`.
- **Hallucinated UUID** → also routed to `PendingMatch`.

**End-of-run deactivation:** any active discount for the same supermarket AND same source whose `updatedAt < runStartedAt` is flipped to `isActive=false`. Critical: filtering by source means a leaflet run cannot deactivate web rows or vice versa. Skipped automatically when `LIMIT` env var is set (smoke-test mode).

**Robustness:**

- `withDbRetry()` with 5-attempt schedule `[5000, 10000, 20000, 30000, 60000] ms` (~125s budget) survives Supabase pooler `EAUTHTIMEOUT` cold-start (typical recovery ~45s).
- 30s fetch timeout via `AbortSignal.timeout(30000)` on every Groq call.
- 3× retry on Groq 429 with 30s backoff. Eventually surrenders to "⛔ giving up" → item routes to review queue, run continues.
- Per-item try/catch — one item's failure cannot kill the cycle.

**Master Catalog (Wolt-sourced) coverage gap.** Food / dairy / cleaning categories well-represented. Personal care, hair, cosmetics, OTC pharma largely missing — these items route to the Review Queue. Either expand via more Wolt category snapshots or rely on Create-SKU-from-pending. See [project_catalog_state memory](../.claude/projects/c--Users-Work-prosforespantou-next/memory/project_catalog_state.md).

**Architecture rule (Phase 4 invariant):** `Discount.source` (`'web'` / `'leaflet'` / `'manual'`) keeps each pipeline's data isolated. End-of-run deactivation always filters by source. One Product can have multiple active Discounts (one per source) — UI groups by `productId` via [src/lib/group-deals.js](src/lib/group-deals.js).

### 3.4 Admin Review Queue (live as of 2026-04-26)

🧐 Review tab in [src/components/AdminPanel.js](src/components/AdminPanel.js) lists all `PendingMatch` rows. Per row:
- **Approve** (when Gemma had a `suggestedProductId`): writes the Discount + deletes the PendingMatch.
- **Create SKU** (when no catalog match but image exists): creates a new Product from the rawName/imageUrl, then writes the Discount.
- **Reject**: deletes the PendingMatch row only.

Server actions: [list-pending-matches.ts](src/actions/admin/list-pending-matches.ts), [approve-pending-match.ts](src/actions/admin/approve-pending-match.ts), [reject-pending-match.ts](src/actions/admin/reject-pending-match.ts), [create-sku-from-pending.ts](src/actions/admin/create-sku-from-pending.ts).

---

## 4. Database schema — [prisma/schema.prisma](prisma/schema.prisma)

| Model | Role |
|---|---|
| `Store` | Supermarket entity (name, logoUrl). |
| `Product` | Persistent product. Unique `woltId` for dedup. Linked to Store. |
| `PriceSnapshot` | Time-series price per product (for future price history). |
| `Leaflet` | Digital flyer — pdfUrl, pageImages, validFrom/Until, autoDeleteDays. |
| `Discount` | The actual offer — originalPrice, discountedPrice, validFrom/Until, category, supermarket slug, isActive, + monetization flags `isFeatured` / `featuredUntil` / `featuredLabel`. |
| `ClickEvent` | Telemetry. `eventType` ∈ {`deal_click`, `leaflet_click`, `list_add`}. Anonymous `sessionId` from localStorage. |
| `Subscriber` | Double-opt-in email list. `confirmToken` + `unsubToken`. `preferredStores[]`. |
| `Alert` | Price/product watch belonging to a Subscriber. `keyword`, optional `supermarkets[]`, `category`, `maxPrice`, `lastTriggeredAt` (cooldown). |
| `Discount.source` | 2026-04-26: `'web'` / `'leaflet'` / `'manual'`. Each ingestion pipeline manages its own bucket; end-of-run deactivation filters by source. |
| `PendingMatch` | Review queue row. `rawName`, `rawPrice`, `imageUrl`, `aiConfidence`, optional `suggestedProductId`. Unique on `(rawName, supermarket)` so re-runs upsert. |
| `MatchCache` | 2026-05-01: persistent `(rawName, supermarket) → productId` mapping. `brandToken`, `source` (`'llm'`/`'auto_accept'`), `lastUsedAt` (90-day soft expiry). Populated by matcher on every successful match. Looked up BEFORE pre-filter to skip LLM entirely. Manual eviction via `DELETE FROM match_cache WHERE raw_name = '...'`. |

Normalization / search lives in [src/lib/constants.js](src/lib/constants.js) — store colors, category list, Greeklish rules. The custom `normalize()` strips accents and maps Greeklish so "gala delta" matches "γάλα ΔΕΛΤΑ".

### 4.1 Pricing convention — single-price offers are normal

Greek supermarkets routinely publish leaflet/offer items with **only a discounted price** (no strikethrough `originalPrice`). Often labelled "ΜΟΝΟ X€" / "only X€". These are still legitimate offers — the supermarket presents them that way deliberately, not because of a data extraction failure.

Implications:
- **Extractor:** never filter rows out for missing `originalPrice`. Trust that everything published on the offers / leaflet page is intended as an offer.
- **Matcher:** doesn't depend on `originalPrice` for the match decision; only uses it for `discountPercent` calculation. NULL is fine.
- **UI:** when `originalPrice IS NULL`, render the price card without a discount-percent badge. Don't synthesize a fake "0% off". The card is still useful: product + current price + store.
- **`discountPercent`:** computed only when `originalPrice > discountedPrice`. Otherwise NULL.
- **"Best deals" / "% off" surfaces:** filter at the *query* layer with `WHERE original_price IS NOT NULL`, never at extraction. Keeps full data, lets specific surfaces opt into the strict view.

Practical: on 2026-05-01, 58 of 73 active web rows have `originalPrice IS NULL`. Correct, not pollution.

---

## 5. How data reaches the user (frontend)

### 5.1 Routes
- [src/app/page.tsx](src/app/page.tsx) → [src/components/HomeClient.js](src/components/HomeClient.js): hero, search, top/ending-soon carousels, infinite-scroll grid (20/page via IntersectionObserver).
- [src/app/supermarket/[id]/page.tsx](src/app/supermarket/[id]/page.tsx) → [src/components/SupermarketClient.js](src/components/SupermarketClient.js): per-store deals + leaflet link.
- [src/app/search/page.tsx](src/app/search/page.tsx): dedicated search results.
- [src/app/offer/[id]/page.js](src/app/offer/[id]/page.js): individual offer detail.
- [src/app/deals/page.js](src/app/deals/page.js): full paginated deal list.
- [src/app/alerts/page.tsx](src/app/alerts/page.tsx): subscriber-managed price alerts (auth via `confirmToken` in query string).
- [src/app/subscribe/confirm/page.tsx](src/app/subscribe/confirm/page.tsx) / [src/app/subscribe/unsubscribe/page.tsx](src/app/subscribe/unsubscribe/page.tsx): email double-opt-in + unsubscribe landing pages.

### 5.2 Server actions ([src/actions/](src/actions/))
Public read:
- [search-deals.ts](src/actions/search-deals.ts), [get-active-deals.ts](src/actions/get-active-deals.ts), [get-deal-counts.ts](src/actions/get-deal-counts.ts), [get-price-comparison.ts](src/actions/get-price-comparison.ts), [get-products.ts](src/actions/get-products.ts).

Telemetry / monetization:
- [track-event.ts](src/actions/track-event.ts) — fire-and-forget from cards/leaflet links/shopping list.
- [subscribe.ts](src/actions/subscribe.ts) — email capture with double opt-in.
- [alerts.ts](src/actions/alerts.ts) — create/list/delete alerts, gated on confirmed subscribers.

Admin ([src/actions/admin/](src/actions/admin/)):
- [create-discount.ts](src/actions/admin/create-discount.ts) — canonical example (Zod + Sentry + revalidateTag + fires alert matcher).
- [list-discounts.ts](src/actions/admin/list-discounts.ts), [delete-discount.ts](src/actions/admin/delete-discount.ts).
- [leaflet-actions.ts](src/actions/admin/leaflet-actions.ts).
- [get-stats.ts](src/actions/admin/get-stats.ts), [get-subscribers.ts](src/actions/admin/get-subscribers.ts).
- Review Queue (2026-04-26): [list-pending-matches.ts](src/actions/admin/list-pending-matches.ts), [approve-pending-match.ts](src/actions/admin/approve-pending-match.ts), [reject-pending-match.ts](src/actions/admin/reject-pending-match.ts), [create-sku-from-pending.ts](src/actions/admin/create-sku-from-pending.ts).

Auth helpers:
- [admin-session.ts](src/actions/admin-session.ts), [verify-admin.ts](src/actions/verify-admin.ts), [src/lib/session.ts](src/lib/session.ts) (`requireAdmin()`).

### 5.3 Key components
- [src/components/DiscountCard.js](src/components/DiscountCard.js) — the public card. Owns `deal_click` tracking on modal open, renders the `isFeatured` chip.
- [src/components/ShoppingList.js](src/components/ShoppingList.js) — Zustand-backed drawer. Fires `list_add`.
- [src/components/AdminPanel.js](src/components/AdminPanel.js) — admin cockpit.
- [src/components/SiteHeader.js](src/components/SiteHeader.js) / footer — also hosts the newsletter form.

### 5.4 Caching / revalidation
Reads are tagged by string (match existing names in each action — grep before inventing). Writes call `revalidateTag('tagName', 'max')`. Telemetry writes (click events, alert triggers) **do not** revalidate — they're not user-visible.

---

## 6. What's currently shipped

- [x] DB schema + driver-adapter Prisma 7 setup.
- [x] Wolt ingestion (live scrape + HTML parse + batch + descriptions backfill).
- [x] Homepage, supermarket pages, search, offer detail, deals list.
- [x] Shopping list (Zustand, persistent).
- [x] Admin panel: manual entry, Wolt JSON import, Vision OCR, leaflet upload with auto-expire, library browse.
- [x] Sentry wrapping on every server action.
- [x] **Feature 1** — Click tracking (`ClickEvent` on deal_click / leaflet_click / list_add, anonymous sessionId, admin Αναλυτικά tab with 7d/30d breakdown).
- [x] **Feature 2** — Featured/sponsored slots (`isFeatured` + `featuredUntil` + `featuredLabel`, chip on card, admin toggle + filter, capped injection in carousels).
- [x] **Feature 3** — Newsletter (double opt-in, confirm/unsubscribe pages, admin Συνδρομητές tab + CSV export). Email provider not yet picked — confirmation URL currently logs to server console.
- [x] **Feature 4** — Price/product alerts (`Alert` model, matcher fires from `createDiscount` with 6h cooldown, `/alerts?token=` self-service page).
- [x] **Masoutis web ingestion (2026-04-26)** — fetcher → extractor → matcher pipeline live. Source-tagged Discounts (`source='web'`). PriceSnapshot history written every run. End-of-run stale-deactivation by source.
- [x] **Admin Review Queue UI (2026-04-26)** — 🧐 Review tab with Approve / Create-SKU / Reject per row. Library cards now clickable into a detail modal.
- [x] **Masoutis leaflet ingestion (2026-05-01)** — fetcher + extractor live, runs through `groq-matcher.mjs` with `SOURCE=leaflet`. Cycle 1 partially complete (1041/2319 — quota burn).
- [x] **Groq Llama-4 matcher (2026-05-01)** — replaces Ollama as canonical backend (faster, free tier). Ollama remains fallback.
- [x] **MatchCache + auto-accept (2026-05-01)** — cache-first lookup → token-overlap auto-accept → LLM in priority order. Web cycle 1 (2026-05-06) showed 120/365 cache hits + 3 auto-accepts on a single cycle.
- [x] **Brand-guard with Latin↔Greek transliteration (2026-05-01)** — `brandsMatch()` + `LATIN_TO_GREEK` map. Prevents Fix/Φιξ false-negatives.
- [x] **Multi-source UI grouping (2026-05-01)** — [src/lib/group-deals.js](src/lib/group-deals.js) + source-tag chips in [DiscountCard.js](src/components/DiscountCard.js). DealGrid + FeaturedCarousel use `useMemo(groupDealsByProduct)`.
- [x] **DB cold-start hardening (2026-05-01)** — `withDbRetry()` 5-attempt schedule survives ~45s Supabase pooler cold-start.

---

## 7. What's not done yet

- **Leaflet matcher cycle 1 — STOPPED at 1041/2319.** Resume after Groq quota reset. ~1300 fresh items remaining + cache hits on the rest.
- **Master catalog gaps.** Wolt-sourced library is missing personal care / hair / cosmetics — those items hit the Review Queue. Either save more Wolt category pages or rely on Create-SKU-from-pending.
- **Cross-chain price comparison.** Single-product card with side-by-side prices across all chains. Highest-leverage feature per competitor analysis (2026-05-01); currently same `productId` can have multiple active Discounts but no UI surface compares them. Schema is ready — needs a query (`WHERE productId IN (...)`) + a comparison component.
- **Capacitor wrap → iOS/Android app.** End form per [§0](#0-product-vision-recorded-2026-05-01-directly-from-owner). 1-2 day wrap of existing Next.js app, not a React Native rewrite.
- **Library tab pagination.** Admin Library tab fetches `limit: 100` so only a fraction of 1327 catalog items is browsable. Needs pagination / load-more.
- **Scheduled ingestion.** No cron / GitHub Actions job. Pipeline still runs by hand: fetcher → extractor → matcher.
- **Email sending.** Subscribers / alerts save fine, but no provider is wired (Resend / Postmark / SES TBD). Confirmation + alert emails currently log to console.
- **Mobile leaflet viewer.** Desktop-first right now.
- **Coverage beyond Masoutis.** Lidl / AB / etc. extractors not yet built.
- **Price history UI.** `PriceSnapshot` is populated by every matcher run, but nothing reads from it on the public site yet.
- **Analytics charts.** Admin Αναλυτικά is a plain table — good enough for pitch decks, not for partners' self-serve dashboards.
- **Public-facing partner dashboard.** Supermarkets can't see their own numbers yet.

---

## 8. Files you'll touch most often

| Concern | File |
|---|---|
| Add/change a field | [prisma/schema.prisma](prisma/schema.prisma) → then `db push && generate && rm -rf .next` |
| Prisma client | [src/lib/prisma.ts](src/lib/prisma.ts) — don't "improve" |
| Auth guard | [src/lib/session.ts](src/lib/session.ts) |
| Store colors / categories / Greeklish | [src/lib/constants.js](src/lib/constants.js) |
| Canonical server action | [src/actions/admin/create-discount.ts](src/actions/admin/create-discount.ts) |
| Public card | [src/components/DiscountCard.js](src/components/DiscountCard.js) |
| Admin cockpit | [src/components/AdminPanel.js](src/components/AdminPanel.js) |
| Shopping list store | [src/lib/store.js](src/lib/store.js) |
| Masoutis web pipeline | [fetchers/masoutis.mjs](src/scripts/fetchers/masoutis.mjs) → [extractors/masoutis-web.mjs](src/scripts/extractors/masoutis-web.mjs) → [matchers/groq-matcher.mjs](src/scripts/matchers/groq-matcher.mjs) |
| Masoutis leaflet pipeline | [fetchers/masoutis-leaflet.mjs](src/scripts/fetchers/masoutis-leaflet.mjs) → [extractors/masoutis-leaflet.mjs](src/scripts/extractors/masoutis-leaflet.mjs) → `SOURCE=leaflet INPUT_FILE=... node matchers/groq-matcher.mjs` |
| Multi-source grouping | [src/lib/group-deals.js](src/lib/group-deals.js) — used by DealGrid + FeaturedCarousel |
| Review Queue actions | [src/actions/admin/list-pending-matches.ts](src/actions/admin/list-pending-matches.ts), [approve-pending-match.ts](src/actions/admin/approve-pending-match.ts), [create-sku-from-pending.ts](src/actions/admin/create-sku-from-pending.ts) |
| Anonymous session id | [src/lib/session-id.js](src/lib/session-id.js) |
