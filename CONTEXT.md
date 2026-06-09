# Prosfores Pantou — Project Context

Living snapshot of what the project is, how data flows, and where things live. Read this before starting any new work. For the forward-looking roadmap see [PHASES.md](PHASES.md).

---

## ⚡ Pick up here (2026-06-10 — product-feedback + bug-fix sprint done, all pushed)

**Everything below is committed AND pushed to `origin/main`.** The whole 2026-06-07 product-feedback list (#1–#7) is resolved, plus a round of user-reported bugs and a deep category cleanup. Working tree clean.

### What shipped this sprint (newest commit last)
| commit | what |
|---|---|
| `5c73189` | **#4 Hotness default sort.** New `Discount.hotScore` + `clickCount`. Fylladio-style score (KVI/brand/deal-mechanic + recent clicks + recency) in [src/lib/hotness.ts](src/lib/hotness.ts). Default sort on /deals, supermarket pages, homepage top-deals widget. Daily recompute = last step of GH `resolvers` job ([recompute-hotness.mjs](src/scripts/recompute-hotness.mjs)). |
| `4b529ce` | **#5 Categories overhaul.** Keyword categorizer [src/lib/categories.ts](src/lib/categories.ts) → 17 stable departments; chain's native label kept in new `Discount.subcategory`. Backfill [recompute-categories.mjs](src/scripts/recompute-categories.mjs). |
| `4730937` | **#7 My Market price differences (REOPENED — I was wrong twice).** Web `/offers` DOES publish originals; two bugs hid them: weighted ΠΡΟΣΦΟΡΑ items used `selling-unit-row !gap-[9px]` (not `is-on-offer`) so the adapter dropped the whole fresh-food section; packaged offers never read the struck original. Adapter now reads both (per-kilo "Αρχ./Τελ. τιμή κιλού" pair for weighted; scale-invariant % for packaged). |
| `5f6480a` | **3 bugs:** (a) broken detail/modal/list images — added cdn.mymarket.gr, s1.sklavenitis.gr, www.ab.gr to next.config remotePatterns; (b) share-list shared only the URL — dropped `url` from `navigator.share`; (c) **multipack mismatch** — [src/lib/packaging.ts](src/lib/packaging.ts) `packCount`/`samePack`; cards/modal show raw `productName` first; comparison actions filter to same-pack; resolver rejects multipack↔single. |
| `a360e24` | Blurry detail images → [src/lib/images.js](src/lib/images.js) `hiResImage()` upgrades My Market `medium`→`original` on detail+modal only. Cheaper-alternative min savings 5c→**10c**. |
| `5817ab4` | **#6 icons → emoji** ([CategoryIcon.js](src/components/CategoryIcon.js)). |
| `3e72f2b` | Category leak fix #1 (Κάβα) + **fixed [recompute-categories.mjs](src/scripts/recompute-categories.mjs) no-op** (it was passing the current category back as the hint, which categorize() trusts → backfill never re-evaluated rows with null subcategory). |
| `abb057e` | **Category leak class fix.** Pure-Latin keywords now match on WORD BOUNDARIES (kills `ion`→"protectION" [212 items!], `pet`→"PETit", `rum`→"seRUM", `lacta`→"LACTAcyd", `cola`→"choCOLAte"). Greek stems stay substring. Added `categorizeTrace()` + [src/scripts/audit-categories.mjs](src/scripts/audit-categories.mjs). |

### Current category state (after all backfills)
Άλλο ≈ 1,200 (~12%), 17 departments populated, audit reports **0 Latin-substring leaks**, Κατοικίδια/Κάβα verified clean. `audit-categories.mjs` is the tool to re-check after any keyword edit.

### New/changed architecture this sprint (know these)
- **Schema:** `Discount.hotScore Float`, `Discount.clickCount Int`, `Discount.subcategory String?` (all `db push`ed, live).
- **Pure helper libs** (strip-safe, imported by both .ts actions and .mjs scripts): [hotness.ts](src/lib/hotness.ts), [categories.ts](src/lib/categories.ts), [packaging.ts](src/lib/packaging.ts), [images.js](src/lib/images.js). **All three keyword lists (hotness/categories) are user-editable — retune then re-run the matching `recompute-*.mjs` and `audit-categories.mjs`.**
- **categorize(name, native)** waterfall: trust native if it's already a valid department → else keyword-match native → else keyword-match name → Άλλο. Native-keyword-first beats misleading scent/flavour words in the name.
- Score/category computed at every write (ingest-offers, resolver, admin paths); recompute scripts are backfills/daily-refresh.

### Gotchas burned into this sprint (don't repeat)
1. **Don't generalize "the source doesn't expose X" from one sampled page.** I twice wrongly closed My Market %; the user's leaflet screenshot proved a whole item class (weighted fresh-food) was being dropped. Sample multiple pages / item types.
2. **Substring keyword matching leaks** — short Latin tokens match inside words (`ion`/`pet`/`rum`/`cola`). Latin terms are now word-bounded; if you add Greek stems, watch for collisions like `γατ`→"μπουγατσάκια" (the audit only catches Latin). Run `audit-categories.mjs` after edits.
3. **recompute-categories.mjs must pass only the true native hint**, never the current `category` (categorize trusts a valid-dept hint → silent no-op).
4. Re-running an adapter (kritikos/mymarket) is the way to repopulate granular `subcategory` + apply adapter fixes to live data; it's the same as the daily cron, safe to run manually.

### Next candidates (nothing urgent — pick with the user)
1. **Native→department alias map** — biggest remaining category win. Map reliable chains' native labels (kritikos "Εμφιαλωμένα Νερά" → Κάβα, mymarket "Κρεοπωλείο" → Κρέας) directly, bypassing name-guessing → shrinks Άλλο and prevents most remaining mismatches. The user explicitly asked about trusting native categories more.
2. **Chain-interleave** on the hot sort — the top tends kritikos-heavy. Cap N-in-a-row per chain.
3. Keep whittling **Άλλο** (~12%) via keyword lists, OR fold it into #1.
4. My Market weighted ΠΡΟΣΦΟΡΑ items mostly sit in **PendingMatch** (fresh meat/produce not in canonical catalog) — they convert to visible discounts as the resolver runs; some fresh cuts stay pending until catalog grows.
5. Per PHASES: mobile UX audit → Capacitor wrap → App Store.

### Price history honest state (user asked)
Real recorded prices, daily cadence, but young: oldest snapshot ~2026-04-26 (~44d), most products 1–2 points, only ~1,900 have ≥3 points (the minimum to draw the chart). Already a 90-day window on detail page + modal; deepens automatically. 90d is the right window — don't extend (a 10-month-old price would mislead the "is this cheap?" verdict).

---

## ⚡ Pick up here (2026-06-07 afternoon, mid-product-feedback session)

**Status: 5 chains live (Kritikos, Masoutis, AB, My Market, Sklavenitis) + Lidl rewired this morning. Active Discounts ~7,300 and climbing as the backlog resolver works through ~7,000 PendingMatch rows in background. Backend pipeline is solid; UI/UX layer is the focus this afternoon after honest product feedback from the user (paraphrased: "the website feels ~40% finished").**

### User feedback session (2026-06-07 afternoon — READ THIS FIRST)

The user pushed back on backend-checklist optimism and gave concrete UX issues. Per-issue status:

| # | Issue user raised | Status | Detail |
|---|---|---|---|
| 1 | `'wolt'` chip leaking on cards | ✅ shipped `7c1d7c3` | Filter to user-facing sources in DiscountCard. |
| 2 | Homepage looks half-empty (5 chains "Σύντομα") | ✅ shipped `7c1d7c3` | SupermarketTiles splits into live + dimmed "Σύντομα κοντά μας" row. |
| 3 | Kritikos shows "no discount" on most items | ✅ shipped `a0931c6` | **Real root cause was different than I first thought.** Kritikos uses `offerType: "super"` for what their UI labels "SUPER ΤΙΜΗ" — there's no `webSticker`/`mobileSticker` field at all (always absent in their API). 85%+ of Kritikos pantry offers are `super`-typed with no strikethrough. Adapter now maps `offerType: "super"` → `description: "SUPER ΤΙΜΗ"`, and DiscountCard renders description as the badge when no % is available. Backfill running in background; tomorrow's 02:00 UTC cron will fully catch up. |
| 4 | Default sort should be hot/popular items, not `createdAt DESC` | ✅ shipped 2026-06-09 | **Built as fylladio-style merchandising, not "clicks + %".** Reality check first killed the naive formula: clicks ≈ 20/14d (pre-launch noise) and only ~5% of deals carry a `discountPercent`, so neither can be the workhorse. Instead `Discount.hotScore` = KVI-staple boost + headline-brand boost + deal-mechanic boost ("1+1"/"ΔΩΡΟ"/"SUPER ΤΙΜΗ"/%) + recent-click boost + recency, matched by **keyword on product name** (the 348-value category field is too fragmented to use). Lists live in [src/lib/hotness.ts](src/lib/hotness.ts) — editable; they encode "what Greek shoppers care about". Now the default sort on `/deals`, supermarket pages, and the homepage top-deals widget. Verified: top reads like a real leaflet (beer 5+1, Pampers, Coca-Cola, ΟΛΥΜΠΟΣ/ΙΟΝ/BRAVO/ΝΟΥΝΟΥ). Click signal wired but ~0 until launch — grows into a true popularity rank as traffic arrives. **Not done: chain interleave** (top tends kritikos-heavy) — polish follow-up. |
| 5 | Categories wrong — most items end up in "Άλλο" or wrong bucket | ✅ shipped 2026-06-09 | Root cause was uneven per-chain assignment: masoutis 99.9% Άλλο (source exposes no category), mymarket 41% (only top-level mapped), kritikos raw-native (297 values), sklavenitis/AB clean 17-bucket. "Native passthrough" was rejected — masoutis can't participate + cross-chain labels don't align. Instead a **keyword categorizer on product name** ([src/lib/categories.ts](src/lib/categories.ts), same machinery as hotness) maps everything into the **kept 17 departments**; the chain's native label is preserved in new `Discount.subcategory` for future drill-down. Native-first matching (native label beats misleading scent/flavour words in the name). **Άλλο: 34% → 9%.** CategoryGrid now hides empty departments. Lists are user-editable. Categorizer runs at every write (ingest/resolver) + one-time backfill ([recompute-categories.mjs](src/scripts/recompute-categories.mjs)). |
| 6 | Category icons are "random garbage" | ✅ addressed 2026-06-09 (no work needed) | The 17 departments were kept, and `CategoryIcon.js` already has a hand-drawn glyph per department mapping 1:1 — so every populated tile shows a relevant icon. The grid no longer renders empty/garbage tiles (dynamic hide). If specific glyphs still read poorly they can be redrawn individually, but there are no longer mismatched/random icons. |
| 7 | My Market % missing on most items | ✅ shipped 2026-06-09 (commit `4730937`) — **I was wrong twice, corrected after user pushback** | First I claimed analytics.price was the regular price (wrong — it equals the offer price). Then I concluded "no regular price exists" — also wrong; I'd only sampled `/offers?page=2`, which happened to be all single-price SUPER ΤΙΜΗ items. The web page DOES publish originals: **(a)** weighted ΠΡΟΣΦΟΡΑ items (meat/produce/deli) render `selling-unit-row !gap-[9px]` (NOT `is-on-offer`) with an "Αρχ. τιμή κιλού / Τελ. τιμή κιλού" struck pair — the old is-on-offer-only filter **silently dropped this entire fresh-food class**; **(b)** packaged offers carry a struck `line-through` original. Adapter now includes weighted offers (priced per-kilo from the pair) and derives packaged originals via the scale-invariant discount % back-applied to the displayed price. Verified against the printed leaflet (Ελιά Βοείου 16.89→14.29, etc.). **Lesson:** don't generalize a "source doesn't have X" claim from one sampled page. |
| 8 | Tier-3 chains (Bazaar, Galaxias, Market In, Discount Markt) all empty | Won't-fix this session | Marked Tier 3 in CONTEXT (no public API). 3-5h recon each. Defer; #5 of homepage tile split already hides them. |

**Methodology corrections from this session (carry forward):**
- Don't trust DB counts before verifying the chain's source actually exposes the field you're assuming. I claimed "Kritikos shows 9% with % because the source doesn't have strikethrough" when really the source has `offerType: "super"` we just weren't reading.
- For UI changes, actually run the dev server and verify visually — I've been shipping based on `npm run build` passing, which only checks types. The user notices the visual gap; the build doesn't.
- When the user's gut conflicts with my data analysis, the user is usually right about reality and I should re-investigate, not defend my numbers.

### Today's commits (2026-06-07)

```
a0931c6 fix(ingest): kritikos offerType=super → "SUPER ΤΙΜΗ" description
7c1d7c3 fix(ui): hide internal source labels, surface chain sticker text, declutter supermarket tiles
5056551 feat(admin): bulk approve and bulk reject for the Review Queue
42f7d58 docs: CONTEXT + .gitignore for Lidl adapter
c33ef7a feat(ingest): lidl chain-direct adapter via flyer OCR
42ae324 docs: pickup-here reflects 2026-06-07 state and workflow split
3e74f28 fix(workflow): split adapter and resolver into separate jobs
```

### What's running in background right now

- **Local resolver backlog** (started morning of 2026-06-07): chains through `ab → masoutis → sklavenitis → mymarket`. ~4h total. Progress to date: AB queue mostly rejected as low-confidence (private-label catalog gap), Masoutis at ~350/984, Sklavenitis growing fast (49 → 443 → more).
- **Local Kritikos backfill** (started 2026-06-07 afternoon): re-running adapter to write `description: "SUPER ΤΙΜΗ"` on existing `offerType: super` rows. Output dropped to log file due to Windows stdout buffering — verify by querying `description IS NOT NULL` count.
- Both are independent of the new daily 04:00 UTC `resolvers` GH Actions job that lands tomorrow.

### What bit us this morning (2026-06-06/07) — kept for context

The old workflow chained adapter + resolver in a single 90-min GH Actions job. mymarket-offers at 00:00 UTC kicked off a first-day resolver pass over 5,134 PendingMatch rows — at PACE_MS=2000 that's ~170 min of LLM calls, way over the 90-min job timeout, so the whole job got cancelled. sklavenitis-offers at 01:00 UTC then **failed at the adapter step** (transient — adapter works fine locally now), which meant its resolver step was skipped too.

**Fix (committed `3e74f28`):** workflow rewritten so adapter jobs only scrape + DB-ingest (60-min budget), and a single combined `resolvers` job runs daily at 04:00 UTC with a 350-min budget, processing every chain's PendingMatch queue sequentially with `continue-on-error: true` so a stuck chain doesn't block the rest. See [.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml).

### The shape of things now

There's an abstraction layer for chain ingestion. Read [src/scripts/adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) before touching anything chain-related.

```
chain adapter (per chain, ~100 lines) ──┐
                                         ├─→ ingestOffers() ──→ matching waterfall ──→ Discount + PriceSnapshot
                                         │   (one shared file)   1. ChainProductMapping
                                         │                       2. Product.barcode (GTIN)
                                         │                       3. MatchCache
                                         │                       4. fail → PendingMatch (Review Queue)
                                         │
                                         └─→ safety: zero items / suspiciously low → SKIP deactivation
                                         
PendingMatch rows are cleared by the LLM resolver
[src/scripts/resolve-pending-matches.mjs] — chain-agnostic, brand-aware:
  CHAIN=ab SOURCE=web node src/scripts/resolve-pending-matches.mjs
  → Groq Llama-4 picks from top-10 candidates → writes Discount + MatchCache
```

- Contract doc: [src/scripts/adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) — the rule every adapter follows.
- Shared pipeline: [src/scripts/lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) — matching + writes + health checks. The ONLY place we write `Discount` rows from chain-direct adapters.
- Per-chain adapters: [src/scripts/adapters/](src/scripts/adapters/).
- LLM resolver: [src/scripts/resolve-pending-matches.mjs](src/scripts/resolve-pending-matches.mjs) — runs as a separate pass over PendingMatch rows. Uses `PendingMatch.brand` (schema added 2026-05-27) for brand-aware matching on chains that strip brand from display name (AB).

### Per-chain status (2026-06-07 morning)

| Chain | Adapter | Active Discounts | Notes |
|---|---|---|---|
| **Kritikos** | [adapters/kritikos.mjs](src/scripts/adapters/kritikos.mjs) ✅ | **2,868 (web)** | 100% barcode-matched via canonical scrape. Daily 02:00 UTC on GitHub Actions. Filter uses `offerType !== 'none'` (Kritikos default = "none"; real offers are amount/super/percentage). |
| **Masoutis** | [adapters/masoutis.mjs](src/scripts/adapters/masoutis.mjs) ✅ | **2,224** (190 web + 199 wolt + 1,835 leaflet) | Daily 06:00 UTC web + weekly Thu 06:30 UTC leaflet, both on Vercel Cron. Masoutis run's PendingMatch (984 rows) now picked up by combined `resolvers` cron job at 04:00 UTC. |
| **AB Vasilopoulos** | [adapters/ab.mjs](src/scripts/adapters/ab.mjs) ✅ | **284** (243 web + 41 wolt) | Daily 03:00 UTC adapter on GitHub Actions; resolver moved to combined 04:00 UTC job (2026-06-07 refactor). Resolver gets ~70% resolution rate when brand is present in PendingMatch (vs 1.5% before brand column added 2026-05-27). 180 PendingMatch rows still queued; most look like private-label / brand-less items the catalog doesn't have. |
| **My Market** | [adapters/mymarket.mjs](src/scripts/adapters/mymarket.mjs) ✅ | **1,708** (1,649 web + 59 wolt) | Adapter shipped 2026-06-05. ~5,134 offers ingested per cycle; first-day resolver pass got to ~1,649 of 5,134 before the cancelled GH Actions job — 3,294 still queued, being cleared by local backlog run 2026-06-07. Daily 00:00 UTC adapter, resolver in combined 04:00 UTC job. HTML scrape of `/offers?page=N`. The /offers landing mixes ~5,276 products sorted offers-first; we keep only cards with `selling-unit-row.is-on-offer`. Brand is included in the per-card `data-google-analytics-item-value` JSON blob → highest-fidelity brand-aware matching of any chain so far. UA gotcha: mymarket.gr blocks old Chrome 120 UA → adapter uses Chrome 131 (update if 429s appear). `PACE_MS` env var (default 600ms) throttles requests. Weekly Sun 05:30 UTC canonical via `my-market` venue slug. |
| **Sklavenitis** | [adapters/sklavenitis.mjs](src/scripts/adapters/sklavenitis.mjs) ✅ | **49** (17 web + 32 wolt) | Adapter shipped 2026-06-05. First-day resolver never ran (the original chained sklavenitis-offers job failed at the adapter step — transient — and the resolver step was skipped). 2,877 PendingMatch being cleared by local backlog run 2026-06-07. Daily 01:00 UTC adapter, resolver in combined 04:00 UTC job. HTML scrape of `/sylloges/prosfores/?pg=N` (Knockout.js front-end, server-rendered cards). No GTIN exposed — resolver relies on brand baked into rawName (90% resolution on first sample of 20). |
| **Lidl** | [adapters/lidl.mjs](src/scripts/adapters/lidl.mjs) ✅ | **0 today, first run pending Thu 06:00 UTC** | Rewired 2026-06-07. The old Vercel cron at `/api/cron/scrape-lidl` had been silently no-op'ing since ~2026-04-20 because `endpoints.leaflets.schwarz/v4/flyers` (the list endpoint) started returning 404 — discovery returned null, route returned "No current flyer found". The per-flyer endpoint (`/v4/flyer?flyer_identifier=X`) still works fine. New adapter discovers the current `food-nonfood` flyer by scraping `https://www.lidl-hellas.gr/c/fylladio-lidl/s10020481` for `l/el/fyladia/<id>/ar/0` hrefs, then calls the per-flyer endpoint, then OCRs each page (~30–60 pages) via Groq vision and hands the result to ingest-offers. Weekly Thu 06:00 UTC on GitHub Actions; resolver step in the combined 04:00 UTC `resolvers` job handles `source: 'leaflet'`. Old Vercel cron stubbed to 501 + removed from vercel.json. |
| **Bazaar / Galaxias / Market In / Discount Markt** | none | 0 | Tier 3 — no public API explored. Future leaflet-OCR via the same path as Lidl. |

### Sustainability tiers (decided 2026-05-26, still current)

- **Tier 1 — barcoded, set-and-forget:** Kritikos ✅, Masoutis ✅ (via chainItemcode+cache, no GTIN in their API but rawName stable). Wolt-strikethrough scrapes for any chain on Wolt (My Market, Sklavenitis — current; AB Wolt also).
- **Tier 2 — works but costlier:** AB direct ✅ (LLM resolver for the unmatched), Lidl PDF (vision OCR, weekly).
- **Tier 3 — skip / future:** Bazaar, Galaxias, e-fresh, afroditi (no public API, tiny chains). Don't pursue unless via leaflet OCR.

### Known immediate debt

1. **PendingMatch backlog clearing.** As of 2026-06-07 morning: sklavenitis=2,877, mymarket=3,294, masoutis=984, ab=180, kritikos=8 (total ~7,343). Local sequential resolver run started 2026-06-07 ~11:48 EEST (~4h foreground). After it lands + tomorrow's 04:00 resolver, expect ~12,000 active Discounts.
2. **Chain coverage gap closing.** Kritikos 2,868 ✅, Masoutis 2,224 ✅, My Market 1,708 (growing) ✅, Sklavenitis 49 (resolver backlog being cleared) ✅, AB 284 ✅. Last big rewire is Lidl pipeline (currently bypasses ingest-offers AND appears to have 0 active rows). ~2h.
2. **1,172 PendingMatch rows accumulated.** Mostly genuine catalog gaps (personal care, niche brands) but bulk-approve admin UI would clear them faster than per-item clicks. Roadmap item.
3. ~~**Lidl pipeline doesn't use ingest-offers.**~~ ✅ rewired 2026-06-07. See per-chain table row.
4. **AB persisted-query hash will eventually break.** Manual recovery via [probe-ab-offers-capture.mjs](src/scripts/probe-ab-offers-capture.mjs) + edit `PQ_HASH` constant. Auto-recovery script not built.
5. **`RESEND_API_KEY` not yet set in Vercel.** Email module ([src/lib/email.ts](src/lib/email.ts)) falls back to console.log silently — both confirmation and price-alert emails currently log only. To activate: get a Resend key, add as Vercel env var, optionally verify a domain and set `EMAIL_FROM`.
6. **Alerts don't fire from the bulk pipeline.** `fireAlertsFor` only runs from admin `createDiscount` — bulk-adapter writes don't trigger emails. By design (would mail-bomb users) but means alerts only fire on manual entries. Plan: separate daily cron pass that batches alerts off recent new Discounts.
7. **Old `groq-matcher.mjs` and new `ingest-offers.mjs` both write `masoutis/web` Discounts.** DO NOT run the old chain alongside the new adapter. Old matcher is now superseded by the chain-agnostic resolver.

### Next concrete steps (priority order — the "5 web items + chain coverage" roadmap)

Pre-agreed sequence:

1. ~~**Email delivery via Resend**~~ ✅ shipped 2026-06-04 (needs RESEND_API_KEY in Vercel to activate)
2. ~~**Masoutis leaflet automation**~~ ✅ wired in vercel.json + ran 2026-06-04 (1,835 leaflet Discounts now active)
3. ~~**Shopping list cross-chain pricing**~~ ✅ shipped 2026-06-05 — `getCheaperAlternatives` batched server action + inline "Πιο φθηνά στο X · −Y€" chip per item + group/total savings hints in `ShoppingList` drawer.
4. ~~**Daily best deals widget on homepage**~~ ✅ shipped 2026-06-05 — fixed `getTopDealsCached` to actually rank by `discountPercent DESC` (was sorted by createdAt before) with per-chain cap of 2 + fallback fill. Today the pool is limited to Kritikos + AB because only those chains populate `discountPercent`; widens automatically as other chains' originalPrice coverage improves.
5. ~~**Sklavenitis chain-direct adapter**~~ ✅ shipped 2026-06-05 — HTML scrape of `/sylloges/prosfores/?pg=N`. 2,895 offers ingested on first run, 2,877 in PendingMatch waiting for first resolver pass. Daily 01:00 UTC GH Actions schedule. See per-chain row above.
6. ~~**My Market chain-direct adapter**~~ ✅ shipped 2026-06-05 — HTML scrape of `/offers?page=N`. 5,134 offers ingested on first run (more than expected — `is-on-offer` density climbs from 46% on page 1 to 100% on later pages). Brand populated for ~100% of items from `data-google-analytics-item-value` JSON. Daily 00:00 UTC GH Actions. See per-chain row above.
7. **Lidl pipeline rewire** — make existing OCR cron use ingest-offers. ~2h.
8. **Bulk review-queue admin actions** — "Approve all" / "Reject all" per chain. ~1h.
9. (Later) **Mobile UX audit**, **Capacitor wrap**, **App Store submission**.

### Per-chain offer-API field notes (for reference when re-building / debugging)

**Masoutis `GetPromoItemWith...`** (POST, no auth — call `GetCred` first for `uid/usl/key` headers):
- Body: `{PassKey: "Sc@NnSh0p", Itemcode: "0,1" (web) or "0,2" (leaflet), IfWeight: "<page>", ...}` — `IfWeight` is THE PAGE NUMBER (1..N), not weight. 50 items/page.
- Fields: `Itemcode`, `ItemDescr`, `StartPrice`, `PosPrice`, `OfferDescr` ("μόνo"), `PhotoData`, `OfferCategoryDescr`, `BrandNameDesciption`, `ItemSize`. **No barcode.**

**AB `ProductList` (PROMOTION_SEARCH)** (GET, plain HTTP, but needs `apollo-require-preflight: true` header to bypass Apollo CSRF guard):
- Pagination: `pageNumber` 0..N, `lazyLoadCount: 10`. Use `pagination.totalPages` from response, NOT short-page-detection (page 2 had 9 in middle of 89).
- Per item: `code`, `name`, `manufacturerName`, `firstLevelCategory.name`, `price.value` (regular), `price.discountedPriceFormatted` ("€6,08" — parse it for real price), `price.wasPrice` (often null even for discounts!), `images[]`, `potentialPromotions[]`.
- `potentialPromotions[].promotionType` — filter to keep only price-affecting promos. ~56% are loyalty-points-only ("X Plus points for Y articles", "Fixed Points For Threshold Promotion") — skip those unless `INCLUDE_POINTS=1`.
- **No barcode.** `code` is AB internal SKU. `manufacturerName` is the brand — adapter writes it to `PendingMatch.brand` so the resolver can match brand-stripped names.

**Kritikos `_next/data/{buildId}/categories/{parent}/{child}.json`** (GET, plain HTTP, no auth):
- `pageProps.staticProducts` is an OBJECT keyed by category MongoDB ObjectId → value is product array. `Object.values(sp).flat()` to get products.
- Per item: `sku`, `name`, `brand`, `quantity`, **`barcodes: string[]`** (GTIN array, 1+ values), `finalPrice` & `beginPrice` in CENTS, `offerType`, `mobileSticker`, `webSticker`, `images.primary` + `images.baseUrl`.
- **`offerType` values:** `"none"` (default — most items), `"amount"`, `"percentage"`, `"super"`. Filter as `offerType !== 'none'` — that's the real offer signal (not finalPrice<beginPrice, which misses multibuy "super" offers).
- buildId: scrape from homepage HTML (`"buildId":"<id>"`). Self-heals across deploys.
- Category tree: `https://kritikos-cxm-production.herokuapp.com/api/v2/categories/tree?collectionType=900` → `payload.categories[].subCategories[]` recursively.
- **URL depth note:** 3-level paths often return SPA-fallback HTML; their products are reachable via the 2-level parent's `staticProducts` (keyed by descendant ObjectId). Adapter walks ALL paths and filters per-product downstream.

**Wolt assortment `consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/<venue>/assortment`** (GET, plain HTTP):
- `categories` tree. Each cat slug → `/assortment/categories/slug/<slug>` → items[].
- Per item: `id`, `name`, `description`, **`barcode_gtin`** (99.7% coverage on Masoutis-Makedonias). `price` and `original_price` in CENTS.
- Known venue slugs: `masoutis-makedonias`, `ab-vasilopoulos-pylaia`, `my-market`, `sklavenitis-gerakas`.
- Market In / Galaxias / Bazaar slugs not found via simple guessing.

### Operations — cron schedule

**Vercel Cron** (in [vercel.json](vercel.json)):
- `/api/cron/scrape-lidl` — Thu 07:00 UTC (existing, pre-pipeline, writes Discounts directly)
- `/api/cron/scrape-masoutis` — daily 06:00 UTC (web offers)
- `/api/cron/scrape-masoutis?source=leaflet` — Thu 06:30 UTC (leaflet)

**GitHub Actions** ([.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml)) — for adapters that exceed Vercel's 300s timeout. **Adapters and resolvers are separated as of 2026-06-07** so a slow first-day resolver can't cancel its adapter, and so the resolver always gets its own timeout budget.
- daily 00:00 UTC — `mymarket-offers` (adapter only, 60-min budget)
- daily 01:00 UTC — `sklavenitis-offers` (adapter only, 60-min budget)
- daily 02:00 UTC — `kritikos-offers`
- daily 03:00 UTC — `ab-offers` (adapter only, 60-min budget)
- daily 04:00 UTC — `resolvers` (combined: ab → sklavenitis → mymarket → masoutis/web → masoutis/leaflet → lidl/leaflet sequentially, `continue-on-error: true` per step, 350-min budget)
- weekly Thu 06:00 UTC — `lidl-offers` (vision OCR over leaflet pages)
- weekly Sun 05:00 UTC — `sklavenitis-canonical` (Wolt)
- weekly Sun 05:30 UTC — `mymarket-canonical` (Wolt)
- weekly Sun 06:00 UTC — `kritikos-canonical` (catalog refresh)
- Workflow_dispatch trigger for manual re-runs of any chain — including `resolvers-all`, `lidl-resolver-only`, `masoutis-resolver-only`, and per-chain `*-resolver-only` jobs.
- Required GitHub repo secrets: `DATABASE_URL`, `DIRECT_URL`, `GROQ_API_KEY`. Active since 2026-05-27.

### Carryover from earlier sessions

- **GTIN-14 → GTIN-13 normalization** is mandatory in any scraper writing to `Product.barcode`. See `normalizeBarcode()` in [wolt-canonical-scraper.mjs](src/scripts/wolt-canonical-scraper.mjs) and [ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs). Without it: cross-chain duplicate Products.
- **~19,687 canonical Products** as of 2026-06-04 (15,636 with barcode). Catalog growth came from per-chain canonical scrapes: Masoutis-Makedonias (Wolt), AB-Pylaia (Wolt), Kritikos-canonical (direct, +6,850), My Market (Wolt, +1,446), Sklavenitis-Gerakas (Wolt). 4,051 pre-pivot rows with `barcode = NULL` still in DB.
- **Wolt only exposes ~5% of offers (strikethrough)** — 94% of real Greek-chain offers are ΜΟΝΟ-style and need chain-direct adapters. That's the whole point of this architecture.

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
Most supermarkets in Greece sell through Wolt's marketplace, which exposes clean product JSON **including the GTIN/EAN-13 for every product**.

**Canonical API recipe (validated 2026-05-11):**

1. `GET https://consumer-api.wolt.com/consumer-api/consumer-assortment/v1/venues/slug/{venue-slug}/assortment` → returns the category tree (190+ categories+subcategories for Masoutis).
2. For each category slug: `GET .../assortment/categories/slug/{slug}` → returns items[] with `id`, `name`, `description`, **`barcode_gtin`** (GTIN-13 for packaged goods, GTIN-14 for multipacks, short codes for fresh produce), `images`, `price`, `original_price`, `unit_info`, `vat_percentage`, `dietary_preferences`, etc.

Coverage measured: **99.7–99.8% of items have `barcode_gtin` populated**. Greek EAN prefix (520/521) covers ~67% of items, international prefixes cover the rest. Only fresh produce (sold by weight) lacks a real GTIN.

**Existing scripts (pre-pivot, partial):**

- **Live scraping** — [src/scripts/scrape-wolt.mjs](src/scripts/scrape-wolt.mjs): Playwright opens a venue page, intercepts XHR hitting `/menu/categories/` or `/venue/`, and captures JSON as you scroll categories. **Does NOT yet capture `barcode_gtin`** — needs update to hit the assortment endpoints above.
- **Offline parsing** — [src/scripts/parse-wolt-html.mjs](src/scripts/parse-wolt-html.mjs): reads saved `.html` files from [library_data/](library_data/) (mostly Masoutis) with Cheerio, upserts into Product + Discount.
- **Batch** — [src/scripts/batch-parse-masoutis.mjs](src/scripts/batch-parse-masoutis.mjs) loops the HTML snapshots in `library_data/`.
- **Descriptions backfill** — [src/scripts/fetch-wolt-descriptions.mjs](src/scripts/fetch-wolt-descriptions.mjs) with [library_data/wolt_urls.json](library_data/wolt_urls.json) / `wolt_descriptions_done.json`.
- **Wipes** — [src/scripts/wipe-masoutis.mjs](src/scripts/wipe-masoutis.mjs), [src/scripts/wipe-lidl.mjs](src/scripts/wipe-lidl.mjs) for re-seeding.

**Probe scripts (validated the assortment recipe):**

- [src/scripts/probe-wolt-gtin.mjs](src/scripts/probe-wolt-gtin.mjs) — discovered `barcode_gtin` field on Wolt product responses.
- [src/scripts/probe-wolt-fullcatalog.mjs](src/scripts/probe-wolt-fullcatalog.mjs) — walks all categories for a venue, measures coverage. Use this as the template for the production scraper.
- [src/scripts/probe-ab-stores.mjs](src/scripts/probe-ab-stores.mjs) — compared AB Vassilopoulos venues, found Pylaia is the biggest (3815 items).

**Deduplication keys (in priority order):**

1. **`Product.barcode`** (GTIN-13/14) — canonical cross-chain key. Set from `barcode_gtin`. `@unique`, so upserts by barcode prevent any duplication forever.
2. `Product.woltId` — Wolt's internal item id. Still useful for back-compat and chain-exclusive items.
3. Legacy: name-similarity matching (matcher LLM path).

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

### 3.5 Chain-direct adapter architecture (shipped 2026-05-26)

The canonical way to add a supermarket going forward. One adapter per chain → one shared pipeline. This **supersedes** the older `fetcher → extractor → groq-matcher` chain for any chain we re-do (the old scripts still exist but should not run alongside their adapter — they would fight over `Discount` rows).

**Three files form the foundation:**

- [src/scripts/adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) — the rule. The `OfferItem` shape every adapter must hand back: `{name, price, originalPrice, chainItemcode, barcode, brand, unit, category, imageUrl, validUntil, offerType}`. Read this before writing a new adapter or modifying the pipeline.
- [src/scripts/lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) — the shared pipeline. Exports `ingestOffers({chain, source, items, dryRun})` and `printReport(report)`. The ONLY place chain-direct adapters write Discount/PriceSnapshot/ChainProductMapping/PendingMatch. Reuses `gtin13CheckDigit` + `normalizeBarcode` from the Wolt scraper for canonical barcode normalization. Includes `withDbRetry` (5s/10s/20s/30s) for Neon/Supabase cold-start.
- [src/scripts/adapters/](src/scripts/adapters/) — one `.mjs` file per chain. ~80–120 lines each. Pure fetch logic + a `toOfferItem(raw)` mapper. Never touches DB.

**Per-item matching waterfall** (inside `ingest-offers.mjs::matchItem`):

1. `ChainProductMapping` lookup `(chain, chainItemcode)` → instant. Populated by previous successful matches.
2. `Product.barcode` lookup (barcode normalized first) → records a mapping, returns Product.
3. `MatchCache` lookup `(rawName, chain)` → uses cache + binds a mapping for future.
4. **No deterministic match** → upsert `PendingMatch` row. The pipeline NEVER creates a Product on its own; the LLM resolver (TBD) or admin Review tab does that.

**Safety rules baked in:**

- Adapter returns `[]` → run aborts, NOTHING deactivated (last-good data stays live).
- Adapter returns far fewer items than current active count (< 50% when active > 20) → writes happen but deactivation is SKIPPED + warning raised.
- Soft delete only (`isActive: false`), never `DELETE`.
- Source isolation: deactivation filters by `(supermarket, source)` so chains/sources never wipe each other.
- `DRY_RUN=1` is truly read-only — verified 2026-05-26 after a bug where matchItem was writing ChainProductMapping in dry mode.

**Currently shipped adapters:**

- [adapters/masoutis.mjs](src/scripts/adapters/masoutis.mjs) — pure HTTP, replaces the old Playwright fetcher + Cheerio extractor + groq-matcher for Masoutis. `SOURCE=leaflet` switches to leaflet offers. Live (152 active Discounts).
- [adapters/ab.mjs](src/scripts/adapters/ab.mjs) — built, dry-run validated, NOT live. AB GraphQL via Apollo persisted-query hash. Default filters out loyalty-points-only promos (~56% of AB's promo feed). `INCLUDE_POINTS=1` to keep them.
- [adapters/kritikos.mjs](src/scripts/adapters/kritikos.mjs) — draft, NOT working. Filter too strict + URL-depth issues. Next: canonical-scraper-first approach.

**QA helpers:**

- [src/scripts/verify-masoutis-matches.mjs](src/scripts/verify-masoutis-matches.mjs) — joins active masoutis/web Discounts to their Products, flags low name-overlap as suspicious. Re-runnable.

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
- [x] **Wolt canonical catalog (2026-05-11/12)** — `wolt-canonical-scraper.mjs` walks any venue's assortment, upserts Products by GTIN. 7,271 distinct canonical Products ingested from Masoutis Makedonias + AB Pylaia (373 shared cross-chain).
- [x] **Schema GTIN-pivot (pushed 2026-05-11)** — `Product.barcode @unique` + `Product.brand` + `Product.unitInfo` + `ChainProductMapping` table.
- [x] **Adapter contract + shared pipeline (2026-05-26)** — [adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) + [lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs). One adapter per chain, all feed into the same matching+writes+safety code.
- [x] **Masoutis chain-direct adapter (2026-05-26)** — pure HTTP, no Playwright. Web + leaflet via `Itemcode=0,1` / `0,2`. Daily/weekly Vercel Cron.
- [x] **Kritikos canonical scraper + offers adapter (2026-05-26/27)** — 6,850 new canonical Products, then 2,902 offers all barcode-matched on first live run (~100% deterministic, 0 Review Queue). Filter uses `offerType !== 'none'`.
- [x] **AB Vasilopoulos live ingestion (2026-05-26/27)** — adapter + LLM resolver pipeline. 394 promo rows → ~70% resolved into Discounts on each run.
- [x] **LLM resolver (`src/scripts/resolve-pending-matches.mjs`, 2026-05-27)** — chain-agnostic, brand-aware. Reads PendingMatch, asks Groq with top-10 candidates, writes Discount + MatchCache. **Brand column added to PendingMatch** so chains that strip brand from name (AB) still resolve correctly.
- [x] **Wolt canonical scrapes for cross-chain catalog growth** — Masoutis-Makedonias + AB-Pylaia (2026-05), My Market + Sklavenitis-Gerakas (2026-05-27). ~19,687 Products as of 2026-06-04.
- [x] **Operationalised ingestion (2026-05-27)** — Vercel Cron (Masoutis) + GitHub Actions (Kritikos, AB+resolver, canonical scrapes). Manual `workflow_dispatch` trigger.
- [x] **Cross-chain price comparison UI (2026-05-27)** — `getPriceComparison` already existed; surfaced into ProductModal (was only on offer detail page). 67+ cross-chain Products with active comparison.
- [x] **Supermarket page payload cap (2026-05-27)** — `take: 500` server-side fetch + `searchDeals(query, supermarket)` server action for full-catalog search. Kritikos page dropped 4.4 MB → 1.06 MB (~70% smaller).
- [x] **Price history sparkline + "actually cheap?" verdict (2026-06-04)** — uses already-collected PriceSnapshot data (~12,542 rows). Component renders in modal + offer page. Honest verdicts: green when at window-min, red when above average.
- [x] **Email delivery via Resend (2026-06-04)** — [src/lib/email.ts](src/lib/email.ts) wraps Resend with Greek HTML+text templates for confirmation + price alerts. Wired into `subscribe.ts` and `fireAlertsFor`. Falls back to console.log when `RESEND_API_KEY` is unset (dev-friendly).
- [x] **Shopping list cross-chain pricing (2026-06-05)** — batched [src/actions/get-cheaper-alternatives.ts](src/actions/get-cheaper-alternatives.ts) (UUID-validated, ≤100 ids/call) joins by `productId` + `Product.barcode`. [src/components/ShoppingList.js](src/components/ShoppingList.js) renders per-item "Πιο φθηνά στο X · −Y€" chip linking to the cheaper offer, per-group savings hint, and a footer total-savings line. Threshold: ignore alternatives below €0.05.
- [x] **Real top-deals carousel (2026-06-05)** — [getTopDealsCached](src/actions/get-active-deals.ts) now actually ranks by `discountPercent DESC` (with `originalPrice IS NOT NULL` per §4.1 strict view) and applies a per-chain cap of 2 over an 80-row pool for diversity, falling back to over-cap fills if not enough chains are eligible. Was previously ordering by `createdAt DESC` — a known mislabel.
- [x] **Sklavenitis chain-direct adapter (2026-06-05)** — [src/scripts/adapters/sklavenitis.mjs](src/scripts/adapters/sklavenitis.mjs). Pure-HTML scrape of `/sylloges/prosfores/?pg=N` (Knockout.js front-end but offer cards are server-rendered) → cheerio. No GTIN, no strikethrough — all offers are ΜΟΝΟ-style. Brand is embedded in rawName (e.g. "PUMMARO Ντομάτα…") which gives resolver ~90% resolution rate without a separate brand column. Daily 01:00 UTC GitHub Actions job runs adapter + resolver in sequence; pickups ~2,895 offers per cycle, ~2,500 expected to land as Discounts after first resolver pass.
- [x] **My Market chain-direct adapter (2026-06-05)** — [src/scripts/adapters/mymarket.mjs](src/scripts/adapters/mymarket.mjs). HTML scrape of `/offers?page=N`. The /offers landing mixes all ~5,276 products sorted offers-first; we filter to cards with `selling-unit-row.is-on-offer`. Per-card `data-google-analytics-item-value` JSON gives name + brand + category structured, so brand is populated on virtually every offer. Daily 00:00 UTC GitHub Actions job. **Anti-bot quirk:** mymarket.gr returns 429 on Chrome 120 UA — adapter sets Chrome 131. `PACE_MS` env tunes throttling (default 600ms ≈ 1.6 req/s).
- [x] **Workflow split (2026-06-07)** — adapter and resolver jobs separated in [.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml). Adapters keep 60-min budget and only scrape + DB-ingest. One combined `resolvers` job runs daily 04:00 UTC with 350-min budget, processes every chain sequentially with `continue-on-error: true`. Reason: 2026-06-06/07 the chained 90-min mymarket-offers job got cancelled by its 5,134-row first-day resolver pass, and the sklavenitis-offers chained job failed at the adapter step so its resolver step never ran. New design isolates failures: a bad adapter or a long resolver no longer poisons the next day.
- [x] **Lidl chain-direct adapter (2026-06-07)** — [src/scripts/adapters/lidl.mjs](src/scripts/adapters/lidl.mjs). Replaces the broken Vercel cron route (silently no-op since ~2026-04-20 because `endpoints.leaflets.schwarz/v4/flyers` started returning 404; per-flyer endpoint still works). Discovers the current `food-nonfood` flyer by parsing `https://www.lidl-hellas.gr/c/fylladio-lidl/s10020481`, fetches pages via per-flyer API, OCRs each via Groq vision, ingests via the shared pipeline. Stable `chainItemcode` = SHA1 hash of normalised productName so re-runs hit ChainProductMapping after week one. Weekly Thu 06:00 UTC on GitHub Actions; resolver step handles `source: 'leaflet'` in the 04:00 UTC combined job. Old Vercel cron stubbed to 501 and removed from vercel.json.
- [x] **Credential rotation tooling exercised (2026-05-27)** — Groq + Supabase DB passwords rotated successfully without downtime.

---

## 7. What's not done yet

### Chain coverage (the biggest visible gap — Kritikos dominates)
- **Sklavenitis chain-direct adapter** — currently 32 Discounts (Wolt strikethrough only). Their website has the full feed; needs HTML extraction or hidden API discovery. Expected ~500-1,500 Discounts. ~3h.
- **My Market chain-direct adapter** — same pattern as Sklavenitis. Currently 56. Expected ~500-1,500. ~3h.
- **Lidl pipeline rewire** — existing OCR cron at [src/app/api/cron/scrape-lidl/route.ts](src/app/api/cron/scrape-lidl/route.ts) writes Discounts directly without `ingest-offers`. Rewire would give source isolation + MatchCache + PriceSnapshot. ~2h.
- **Bazaar / Galaxias / Market In / Discount Markt** — Tier 3, no public API. Leaflet OCR via Lidl-style cron is the future path.

### Product features
- **Shopping list cross-chain pricing** — when item is added, show cheapest chain inline (reuse `getPriceComparison`). ~1.5h.
- **Daily best deals widget on homepage** — top 10 deepest-discount Discounts across all chains. ~1h.
- **Bulk Review Queue admin actions** — "Approve all / Reject all" per chain to clear the ~1,172 pending rows. ~1h.
- **Mobile UX audit** — tap targets, card density, scroll perf. Required before native app submission.
- **Capacitor wrap → iOS/Android app** — end form per [§0](#0-product-vision-recorded-2026-05-01-directly-from-owner). After web feels complete + mobile pass.
- **Mobile leaflet viewer.** Desktop-first right now.
- **Analytics charts.** Admin Αναλυτικά is a plain table.
- **Public-facing partner dashboard.** Supermarkets can't see their own numbers yet.
- **Library tab pagination.** Admin Library tab fetches `limit: 100` so only a fraction of catalog items is browsable.

### Email + alerts
- **`RESEND_API_KEY` not yet set in Vercel.** Email module silently falls back to console.log; in production this means no confirmation or alert emails go out. Activate by adding the env var in Vercel.
- **Verified sender domain.** Currently `EMAIL_FROM` defaults to `onboarding@resend.dev` which Resend only delivers to the account holder. Need to verify `prosforespantou.gr` in Resend for real user delivery.
- **Alert firing from bulk pipeline.** Currently alerts only fire from admin `createDiscount`. Bulk-adapter writes don't trigger emails by design (would spam). Needs a separate daily cron pass that batches alerts off recent new Discounts.

### Ops debt
- **AB persisted-query hash auto-recovery.** Manual via `probe-ab-offers-capture.mjs` + edit `PQ_HASH` constant.
- **Old `groq-matcher.mjs`** — superseded by the chain-agnostic resolver. Keep for reference but DO NOT run alongside the new adapter for the same source.

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
| Adapter contract | [src/scripts/adapters/CONTRACT.md](src/scripts/adapters/CONTRACT.md) — read before writing/modifying a chain adapter |
| Shared ingest pipeline | [src/scripts/lib/ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) — only place chain-direct adapters write to DB |
| Per-chain adapters | [src/scripts/adapters/](src/scripts/adapters/) — `masoutis.mjs` ✅, `ab.mjs` ✅, `kritikos.mjs` ✅ live; Sklavenitis + My Market direct adapters not built yet |
| LLM resolver (chain-agnostic) | [src/scripts/resolve-pending-matches.mjs](src/scripts/resolve-pending-matches.mjs) — `CHAIN=ab SOURCE=web node ...`. Brand-aware via `PendingMatch.brand`. |
| Canonical (Wolt) scraper | [src/scripts/wolt-canonical-scraper.mjs](src/scripts/wolt-canonical-scraper.mjs) — `<venue-slug> [chain-slug]` args. Use for any Wolt-listed chain. |
| Kritikos canonical scraper | [src/scripts/kritikos-canonical-scraper.mjs](src/scripts/kritikos-canonical-scraper.mjs) — walks the full Kritikos category tree, upserts Products by GTIN. |
| Verify match correctness | [src/scripts/verify-masoutis-matches.mjs](src/scripts/verify-masoutis-matches.mjs) — pattern for spot-checking any chain's matches |
| LEGACY Masoutis pipeline (DO NOT run alongside new adapter) | [fetchers/masoutis.mjs](src/scripts/fetchers/masoutis.mjs), [extractors/masoutis-web.mjs](src/scripts/extractors/masoutis-web.mjs), [matchers/groq-matcher.mjs](src/scripts/matchers/groq-matcher.mjs) — kept for reference. |
| Email delivery | [src/lib/email.ts](src/lib/email.ts) — Resend wrapper. `sendConfirmationEmail` + `sendAlertEmail`. |
| Cross-chain comparison | [src/actions/get-price-comparison.ts](src/actions/get-price-comparison.ts) + render in [ProductModal.js](src/components/ProductModal.js) and [OfferClientContent.js](src/app/offer/%5Bid%5D/OfferClientContent.js) |
| Price history + verdict | [src/actions/get-price-history.ts](src/actions/get-price-history.ts) + [src/components/PriceHistory.js](src/components/PriceHistory.js) |
| Cron routes | [vercel.json](vercel.json) + [src/app/api/cron/](src/app/api/cron/) (scrape-lidl, scrape-masoutis) |
| GitHub Actions workflow | [.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml) — heavy adapters that don't fit Vercel's 300s timeout |
| Multi-source grouping | [src/lib/group-deals.js](src/lib/group-deals.js) — used by DealGrid + FeaturedCarousel |
| Review Queue actions | [src/actions/admin/list-pending-matches.ts](src/actions/admin/list-pending-matches.ts), [approve-pending-match.ts](src/actions/admin/approve-pending-match.ts), [create-sku-from-pending.ts](src/actions/admin/create-sku-from-pending.ts) |
| Anonymous session id | [src/lib/session-id.js](src/lib/session-id.js) |
