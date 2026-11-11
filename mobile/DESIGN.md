# App design — the website's look, built natively

Owner, 2026-11-05: «make it look similar to the site's landing page, but better», after
a design study of 14 apps (marktguru, kaufDA, Flipp, Trolley, Bring!, Skroutz, PosoKanei,
Kimbino, Lidl Plus, AB, My Market, Μασούτης, efood, Wolt). Screenshots and notes:
`.local-scratch/design-research/` (not committed). Reference for every screen:
`own-site/home-first.png`, `own-site/deals-first.png`, `own-site/product-sheet.png`.

**Rule:** when this file and the website disagree, the website wins unless a line here
says why the app differs (bigger sizes for older eyes are the usual reason).

## Type
- **Inter** (400/500/700/900) for everything that is UI: body, labels, prices. Prices
  900, `fontVariant: ['tabular-nums']`, letter-spacing −0.5.
- **Noto Serif Display** (400 + 400 italic) for the home hero and section headings
  only — the site's serif identity; no rival app uses a serif, it is ours.
- Load with `expo-font` + `@expo-google-fonts/inter` / `@expo-google-fonts/noto-serif-display`
  (Greek subsets are in both). Keep the splash up until fonts are loaded.
- Do not use Outfit, Poppins, Montserrat, DM Sans, Nunito: no Greek glyphs.

| Role | Size / line / weight |
|---|---|
| Hero h1 (serif) | 32 / 36 / 400, second line italic in brand green |
| Section h2 (serif) | 26 / 30 / 400 |
| Card price | 26 / 30 / 900 |
| Product page price | 44 / 48 / 900 |
| Card title | 17 / 22 / 500, 2 lines |
| Secondary (pack size, unit price, old price) | 15 / 20 / 500 — never below 14 |
| Badge | 14 / 18 / 800 |
| Button | 17 / 22 / 700, height ≥ 52 |
| Tab label | 13 / 18 / 600 (shorter line heights clip Greek) |

All sizes go through `useType()` so «Μεγάλα γράμματα» scales them.

## Colour
The website's «fresh» palette — already `Colors` in `src/constants/theme.ts`. Additions:
- Text under 18 px that is grey uses `ink2` (#43544A) or a new `ink3Text` #5F6E65 —
  `ink3` #7A8880 is 3.7:1 on white, too faint for this audience.
- Discount red `#D1453B` is the only warm colour on cards. Gold `#E8B24A` only on the
  single home banner button.
- Chain colour comes from `/api/v1/meta` (`color`, `bg`) — never hard-coded.

## Shapes
Card radius 12, badge 8, buttons/search/chips pill. Cards: white, 1 px `line` border,
no heavy shadow. Grid gap 12, screen padding 16.

## Price format
**«0,83 €» style with a decimal comma** (Greek convention; Μασούτης, Lidl, AB all use it).
The website shows «0.83€» — flagged to the owner; fix on the site separately.

## Offer card (2-column grid and rails)
**Changed 2026-11-05 after review:** the chain is a coloured dot + full name on its own line under the photo (on the photo it covered the product; beside the badge it had to be cut to «My …» / «MM»), and the round «+» sits on the photo's bottom-right corner (beside the price it wrapped under «11,60 €» in rail cards). The list below is otherwise current.
1. Square image on `surface2`, contain-fit.
2. Strip over the image: **red badge** top-left — «−30%» when a real old price exists,
   else «ΜΟΝΟ» / «SUPER ΤΙΜΗ» as the site does — and a **white chain pill** top-right
   (chain name, chain colour text, never truncated: shrink to the chain's `short` name).
3. At most one chip (category eyebrow, as the site's «Γάλα»).
4. Title 17/500, 2 lines; pack size below.
5. Price row: price 26/900 (red when there is a struck old price), old price struck
   and unit price under it at 15; a **48 dp round dark-green «+»** on the right that
   adds to the list (filled check once added).

## Home, top to bottom
1. Header: green rounded «Π» mark (34 dp), settings gear right, list icon with count badge.
2. Hero: serif «Όλες οι προσφορές,» / italic green «σε ένα μέρος»; trust line
   «13.154 προσφορές · 7 αλυσίδες · ●» and «Ενημερώνεται καθημερινά».
3. Pill search with inline «Αναζήτηση» button → opens the Search tab focused.
4. Chain strip: logos (`logoUrl` from meta) with offer counts, horizontally scrolling;
   tap = Προσφορές filtered to that chain.
5. Rails: «Τα βασικά της εβδομάδας», «Κορυφαίες προσφορές», «Τελειώνουν σύντομα».
6. Dark-green banner, serif headline, gold button (the site's banner text).
7. «Ανά κατηγορία»: 3-column tile grid with line icons and counts.

## Προσφορές
One row only: «Φίλτρα» pill (with a count of active filters) + sort pill «Δημοφιλή ▾».
Both open a **bottom sheet**: chain logo tiles, category tiles, sort options, sticky
«Δες N προσφορές» button. «Τα καταστήματά μου» is the first chain tile when set.

## Tab bar
4 tabs, white, 1 px top line, height ~68. Active: brand-green icon + label and a
`bgSoft` pill behind the icon. Red count badge on Λίστα. Labels 13/600.

## Product page
Port `own-site/product-sheet.png`: chain name, big image, green uppercase category,
44/900 price, unit-price box, favourite + quantity stepper + pill «Στη λίστα»,
freshness line («Ενημερώθηκε …»), then the comparison table — Trolley-style: one row
per chain, price right-aligned and bold, the cheapest row raised as a white card.

---

# v2 — discovery and trust (2026-11-12)

Owner, 2026-11-10: «find what they want fast and not only by searching — they scroll
and see things they like»; «price history with actual real data»; «as refined as
possible», taking the patterns of the biggest apps. What we take, and from whom:

| Pattern | Seen in | Where it goes here |
|---|---|---|
| Home = a stack of rails, one reason each, «Όλες» to the full list | Wolt, efood, Amazon | Home (server-driven: `GET /api/v1/feed`) |
| Aisle shortcuts at the top | Wolt, efood | Category chips row under the search |
| «Recently viewed», «because you looked at…» | Amazon | «Είδες πρόσφατα» rail; interest-ordered department rails |
| Grey placeholders while loading, never a blank screen | all of them | `ui/skeleton` |
| «Added · Undo» bar instead of a silent state change | Wolt, Gmail | `ui/toast` |
| Regular price as a line, promotions as marks; facts in words | Keepa, Skroutz, Trolley | Product page «Ιστορικό τιμής» |

**Not taken, on purpose:** a «most popular» ranking. On 2026-11-11 there were 19 offer
clicks from 5 visitors in 30 days. The server shows «Δημοφιλή τώρα» only past a real
traffic threshold; the app just draws the rails it is sent.

## Foundation (APP-500a/b) — use it, do not rebuild it
- Data: `useApi(key, fetcher)` (`lib/use-api.ts`) — cached, works offline, `stale` flag →
  `<StaleBanner>`. No hand-written fetch effects in screens.
- Loading: `ui/skeleton` (`RailSkeleton`, `GridSkeleton`, `DealCardSkeleton`), not spinners.
- Feedback: `showToast` (`ui/toast`), `tap()`/`success()` (`lib/haptics`).
- On-device signals: `recordView` (`lib/recently-viewed`), `noteInterest` /
  `topInterests` (`lib/interest`, consent-gated inside), `useImpressionTracker(page)`
  (`lib/impressions`, consent-gated inside).
- Cards: `DealCardView` already carries badge, chain line, price, one honest tag, «+».

## Home v2 (top to bottom)
1. Header: «Π» mark, settings, list badge (unchanged).
2. Hero headline + trust line — kept (it is the brand), spacing tightened so the first
   rail starts on the first screen of a 390×844 phone.
3. Search pill — sticks to the top once the hero scrolls away.
4. Category chips: horizontal, line icon + short label, tap → Προσφορές with that
   department. Replaces the category grid at the bottom of the page.
5. Chain strip (logos + counts).
6. «Είδες πρόσφατα» — only when the shopper has opened offers; compact cards
   (thumbnail, name, price), newest first, tap opens the offer.
7. The feed's sections in the SERVER's order. Each: serif title, grey subtitle when
   present, «Όλες →» when `seeAll` is not null (→ Προσφορές with those parameters),
   a horizontal rail of `DealCardView` (two cards and a peek). The vertical list is
   virtualised (20+ rails): rails below the fold mount as they approach.
8. The green banner sits after the fourth rail.
9. Last: a full-width «Δες όλες τις N προσφορές» button.
- Request: `api.feed({ chains: settings.myChains, cats: topInterests(3).categories })`
  through `useApi` (key includes both lists). Pull to refresh. Skeleton = hero +
  three `RailSkeleton`s. Offline → cached feed + `StaleBanner`.
- Impressions: every rail uses `useImpressionTracker('home:' + section.id)`.
- An unknown section id is just another rail. No rail is hard-coded in the app.

## Product page v2
- On load: `recordView(offer)`, `noteInterest('view', …)`. Adding to the list and the
  heart call `noteInterest('list_add' | 'favourite', …)`. Skeleton instead of a spinner.
- **«Ιστορικό τιμής»** is built on `timeline` (`PriceTimeline`, server lib
  `src/lib/price-timeline.ts` — read its header):
  - no `timeline`, or `quality` 'none' → nothing.
  - `quality` 'thin' → one line: «Παρακολουθούμε αυτή την τιμή από {ημ/νία}.»
  - `reliable === false` → one line, no chart, no numbers: «Δεν έχουμε ακόμα
    αξιόπιστο ιστορικό τιμής για αυτό το προϊόν.»
  - otherwise the chart: time from `since` to today. **Shelf** steps = one solid
    stepped line («Κανονική τιμή», ink colour). **Promos** = red dots; a short
    horizontal red segment only when `until` is known or the promo is `ongoing`
    (never draw a promo as lasting until the next point). The price on screen is the
    last, larger dot. Two or three horizontal gridlines with price labels. Range
    chips 1Μ / 3Μ / 6Μ / Όλα (default Όλα). Press-and-drag shows a marker with date,
    price and «Κανονική τιμή» or «Προσφορά».
  - Facts under the chart, in words, each only when true (max three):
    «Η χαμηλότερη τιμή από {μήνας}» (green pill, `stats.currentIsLowest`);
    «Χαμηλότερη που έχουμε δει: {τιμή} ({ημ/νία})»; «Κανονική τιμή: {shelfNow}»;
    «Η κανονική τιμή ανέβηκε/έπεσε {|shelfChangePct|}% από {μήνας}» (only when
    |pct| ≥ 1); «Σε προσφορά {promoCount} φορές από {μήνας}» (only when ≥ 2).
  - Footnote: «Παρακολουθούμε την τιμή από {ημ/νία}.»
  - No percentage is computed in the app. The only «% off» the app prints is the
    server's (`offer.percent`, `offer.baseline`).
- **Comparison:** unchanged table. When there are no rows: a quiet line «Δεν βρήκαμε
  το ίδιο προϊόν σε άλλο κατάστημα ακόμα» and a secondary button «Ψάξε παρόμοια» →
  Search with the product title.
