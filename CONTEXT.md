# Prosfores Pantou — Project Context

Living snapshot of what the project is, how data flows, and where things live. Read this before starting any new work. For the forward-looking roadmap see [PHASES.md](PHASES.md).

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

### 3.3 New Strategy: Agentic Ingestion & Master Catalog (In Progress)
To maintain a clean database and prevent duplicates (e.g., "Gala mebgal 1l" vs "Mebgal frsko gala 1L"), we are implementing a "Master Catalog" architecture:
- **Master Catalog:** The Wolt data (with high-quality images and descriptions) serves as the "perfect" base.
- **Extractor Agents (Store-Specific):** Scripts that pull raw text and prices from websites (easier) or PDFs (harder) for specific chains like Lidl or AB.
- **Matcher Agent (Universal):** An AI-powered (Gemini/Groq) script that takes the Extractor's raw output and links it to the exact same SKU in the Master Catalog.
- **Review Queue:** A conservative fallback. If the Matcher Agent isn't highly confident, the item is sent to a "Review Needed" queue rather than automatically creating a messy duplicate SKU.

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

Normalization / search lives in [src/lib/constants.js](src/lib/constants.js) — store colors, category list, Greeklish rules. The custom `normalize()` strips accents and maps Greeklish so "gala delta" matches "γάλα ΔΕΛΤΑ".

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

---

## 7. What's not done yet

- **Scheduled ingestion.** No cron / GitHub Actions job runs the Wolt scrapers. Fresh data still requires a human running `node src/scripts/...`.
- **Email sending.** Subscribers / alerts save fine, but no provider is wired (Resend / Postmark / SES TBD). Confirmation + alert emails currently log to console.
- **Mobile leaflet viewer.** Desktop-first right now.
- **Coverage beyond Masoutis / Lidl / AB.** `library_data/` is mostly Masoutis; broader Wolt coverage is a manual effort.
- **Price history UI.** `PriceSnapshot` table exists but nothing writes or reads from it in production paths.
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
| Anonymous session id | [src/lib/session-id.js](src/lib/session-id.js) |
