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
