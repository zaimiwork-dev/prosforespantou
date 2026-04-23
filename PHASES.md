# Prosfores Pantou — Phases

Forward-looking roadmap. Each phase has a clear "why", concrete deliverables, and an exit criterion. Don't start phase N+1 until N's exit criterion passes. Pair this with [CONTEXT.md](CONTEXT.md) for the current state.

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

## Phase 4 — Agentic Ingestion & Matching (NEXT)

**Why:** Data staleness is the single biggest product risk. But we also want a perfectly clean database. Instead of treating every store's items as new products, we use the existing Wolt data as a "Master Catalog" and map new prices to it using AI.

**Deliverables:**
- **Extractor Agents (Per-Store):** Scripts tailored to specific supermarkets (e.g., Lidl website, AB website, or parsing uploaded PDFs). These extract raw text (e.g., "Mebgal frsko gala 1L") and the price.
- **Matcher Agent (Universal):** An AI-powered script (using Groq/Gemini) that compares the Extractor's raw text against the Master Catalog. 
- **Conservative Matching Strategy:** If the AI is highly confident, it links the price to the Master SKU and creates an active `Discount`. If the AI is unsure, it saves the raw data to a "Review Needed" queue in the Admin Panel for manual approval. It does NOT automatically create new SKUs to prevent duplicates.
- GitHub Actions workflow (or cron) to run Extractors nightly.
- Populate `PriceSnapshot` on every Discount upsert.

**Do NOT:**
- Auto-create new SKUs if the Matcher Agent is unsure. Always default to the Review Queue.
- Delete `Discount` rows. Flip `isActive` so click history stays intact.

**Exit:**
- One Extractor (e.g., Lidl website) and the Matcher Agent are working end-to-end.
- Admin Panel has a functional "Review Queue" UI for unsure matches.

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
