# Fable 5 — Mobile UX redesign brief (Prosfores Pantou)

> Handoff for the **visual/UX redesign of the consumer presentation layer only**.
> The data pipeline, matching, and honest-pricing engine are done and correct —
> your job is to make the surface that renders them feel finished. Written by the
> Opus session that just shipped the alias map, the honest-pricing engine, the
> category pass, and the font/perf cleanup (commits `026002e`→`0081576`).

## Mission (one line)
Redesign the mobile experience so **savings are the first impression** — homepage,
`/deals`, the product modal, navigation, and empty states — for an audience of
**elderly + 30–40 Greek shoppers on old phones**. Phone-first, forgiving, low
cognitive load, large touch targets.

## Read these first (don't skip)
1. `CONTEXT.md` — the `⚡ Pick up here` section. Current state, schema, what shipped.
2. `PHASES.md` — forward roadmap + the "Do NOT" invariants (source isolation, multi-source coexistence). These exist because of past incidents.
3. `src/components/DiscountCard.js`, `src/components/ProductModal.js`, `src/app/offer/[id]/OfferClientContent.js`, `src/app/page.js`, `src/app/deals/page.js` + `src/components/DealsClient.js` — the surfaces you'll touch.
4. Regenerate the "before" screenshots yourself: `npm run dev`, then screenshot every page at a **390px** viewport (the real target). Don't trust desktop — it hides the gaps.

## Hard guardrails — do NOT break these
- **Components are `.js`, not `.tsx`.** Do not migrate to TypeScript during the redesign — it's a separate focused PR later. Mixing it in will create a merge nightmare.
- **Vanilla CSS** (`src/app/globals.css`) + inline `style={{}}`. **Tailwind is installed but restricted** — do not introduce it broadly.
- **The data layer is off-limits.** `src/actions/`, `src/scripts/`, `prisma/schema.prisma`, the ingest pipeline. If a redesign seems to need a data/schema change, **flag it for the human — don't make it.** The `Discount.source` isolation invariant and the driver-adapter Prisma setup are load-bearing.
- **Login is optional, never required.** Browsing, search, list, leaflet all work anonymous (LocalStorage).
- **Honest pricing is sacred.** Render exactly what the engine returns. Never invent a "good deal" badge. Validity dates always visible.
- Keep `npm run build` green and `npm run test:run` passing. Don't add new lint errors.

## What's already built — RENDER it, don't rebuild it
| Thing | Where | How to use |
|---|---|---|
| Honest price verdict (precomputed) | `Discount.priceVerdict` + `isPositiveVerdict()` in `src/lib/price-verdict.ts` | Show a badge **only** when `isPositiveVerdict(d.priceVerdict)` is true (`lowest`→"🔥 Χαμηλότερη τιμή", `good`→"✅ Καλή τιμή"). Silent otherwise. `DiscountCard` has a minimal version — restyle it. |
| Live verdict + chart | `getPriceHistory(productId, { currentPrice })` → `PriceHistory.js` | Already wired into the modal + detail page. Pass the **offer's** price as `currentPrice`. Positive-only badge; factual low/avg line always shows. |
| Cross-chain comparison | `getPriceComparison(discountId)` | "Φθηνότερα στο X · −Y€" rows. Already on the detail page — **bring it into the modal too.** |
| Categories | 17 departments (`src/lib/categories.ts`), `CategoryIcon.js` emoji set | Άλλο is ~4.7% now. Grid hides empty departments. |
| Deal lists + sort | `getActiveDeals(limit, offset, sm, category, sort, preferredSMs)` | `sort` ∈ `hot | expiring | discount | newest`. The sort logic exists — it just has **no visible UI control**. Surface it. |
| Multi-source grouping | `src/lib/group-deals.js` | One product, multiple source tags on one card. Don't dedupe. |

## Product decisions — already made, don't re-ask
- **Homepage: DEALS WALL FIRST.** Lead with the hottest/biggest deals. Chain + category navigation moves **below** the fold. Today it's a directory of logos — that's the #1 complaint.
- **Badges: positive-only.** Highlight genuine good deals, stay silent on mediocre, never show a fake positive. (The engine already enforces this — match it visually.)
- **Dead chains:** Lidl/Bazaar/Market In/Discount Markt/Γαλαξίας currently have 0 offers. In the UI, **hide or disable** them in filter controls so nothing leads to an empty result. (Making them live is a separate backend task — not yours.)

## The teardown — fix these (outcomes; the design is YOURS)
**Critical / High**
1. **Homepage leads with deals,** not logos. Real products + prices above the fold.
2. **`/deals` shows products above the fold on mobile.** Today the entire first viewport is two stacked rows of filter chips. Collapse them into a single "Φίλτρα" control/sheet. **Surface the sort control** (hot/expiring/%/newest).
3. **Dead-chain filters** → hidden/disabled (see decisions).
4. **Modal parity + bottom-sheet.** The modal is missing what the full detail page has: **validity dates, the honest verdict, the cross-chain comparison** — bring them in. Drop the "Δεν υπάρχει διαθέσιμη περιγραφή" line (hide, don't announce absence). Reconsider the **"WEB ONLY"** badge (confusing to a shopper). Make the modal a **thumb-reachable bottom sheet**, not a center pop-up.
5. **Orphan card whitespace** — the 5th live chain (AB) sits alone on its own row with a void beside it. Fix the grid.
6. **Header stat truncates** on mobile ("Ενημερώνεται καθ…").
7. **Empty states** — shopping-list-empty and `/alerts`-reached-directly are bare one-liners. Give a helpful CTA ("Δες προσφορές").

**Medium / polish**
8. **Visual hierarchy** — it's flat and pale; everything has equal weight. Stronger price typography, a clear savings color.
9. **Bottom navigation bar** (Αρχική / Προσφορές / Λίστα / Ειδοποιήσεις) — better than hunting for gear/basket icons in the top corners. (Design the native shell now; Capacitor wrap is next on the roadmap.)
10. **Skeleton loaders** instead of blank flashes on navigation.
11. **Cohesive icon system** — the emoji set is mixed styles (realistic 🍎🧀 next to flat 🧊🛒).

## Known code smells in the files you'll rewrite — build the new versions WITHOUT them
(These are why I left them for you instead of patching throwaway code.)
- `setState` called synchronously inside effects: `ProductModal` (reset-on-prop-change — prefer a `key` or derive), `OfferClientContent`, `DiscountCard`.
- `Date.now()` / `new Date()` during render (`DiscountCard`, `OfferClientContent`) — compute once and pass down, so the component stays memoizable.
- raw `<img>` in `OfferClientContent` (3 instances) → `next/image` (remote hosts are already whitelisted in `next.config`).

## Acceptance criteria
- [ ] First mobile screen of `/` shows real deals with prices (not just logos).
- [ ] First mobile screen of `/deals` shows products; filters collapsed; sort control visible.
- [ ] Modal shows price + **validity dates** + honest verdict (positive-only) + cheaper-elsewhere.
- [ ] No filter chip leads to an empty result.
- [ ] Bottom nav present; empty states have a CTA.
- [ ] `npm run build` green, `npm run test:run` green, no new lint errors.
- [ ] Verified visually at **390px** (attach screenshots).

## Figma
A Figma MCP integration is wired up in this environment. If you want to mock up
the homepage / bottom-sheet / nav before coding, the `/figma-*` skills + design
tools are available. Optional — design-in-code is fine too.

## How to verify your work
`npm run dev`, then drive a 390px browser (Playwright is a dependency) and
screenshot `/`, `/deals`, a product modal, the shopping-list drawer, and an
offer detail page. Compare against the issues above.
