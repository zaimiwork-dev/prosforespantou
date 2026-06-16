# Prosfores Pantou — Project Context

Living snapshot of what the project is, how data flows, and where things live. Read this before starting any new work. For the forward-looking roadmap see [PHASES.md](PHASES.md).

---

## ⚡ START HERE — full checkpoint for a fresh chat (2026-06-13)

**Project:** Prosfores Pantou — cross-chain Greek supermarket offers (6 chains, ~11k offers). **End goal:** native iOS/Android app; **login OPTIONAL** (email/Google/Apple) → cross-device sync + **push/email watch-list alerts**. Anonymous browsing/list/favorites always work. See [[project_vision]].

**Everything below is committed + pushed to `origin/main` (working tree clean apart from 4 untracked scratch `.txt` files in root — incl. a `passwords.txt` security smell; move out).**

### ✅ Shipped this session (all LIVE on prod unless noted)

**Accuracy / data quality:**
- Comparison no longer shows different products as "same item elsewhere" — new [offer-similarity.ts](src/lib/offer-similarity.ts) guards getPriceComparison + getCheaperAlternatives. Mapping audit **applied in CI**: 577 wrong ChainProductMappings deleted, 402 poisoned PriceSnapshots removed. Re-run anytime: `gh workflow run audit-mappings.yml`.
- **Prod photos fixed** — root cause was the **Vercel image-optimizer quota (402 on `/_next/image`)**, not (only) CDN blocking. `images.unoptimized:true` → browsers load straight from source hosts. Image mirroring (AB done 359/359; sklavenitis/mymarket/masoutis draining) is the server-side resilience layer.

**UX / product:**
- Infinite scroll; full category names on titles; homepage honors "Τα καταστήματά μου"; "Παρόμοιες προσφορές" strip; capped (de-blurred) offer image.
- φυλλάδιο links: every supermarket page links the chain's **real leaflet page** (slugs in [constants.js](src/lib/constants.js)).
- **Personalization v1**: first-visit onboarding sheet (stores + "Τι αγοράζεις συνήθως;"), on-device [interest-profile.ts](src/lib/interest-profile.ts), "✨ Για σένα" homepage rail. (PHASES Phase 10.)

**Phase 9 — full-catalog baseline + offer-type distinction + alerts (slices 1–4a):**
- `Discount.offerType` + `PriceSnapshot.kind`: every offer tagged `strikethrough` (published reference %) vs `mono` (hidden reference).
- **Κρητικός full-catalog `normal`-price baseline**, live behind `BASELINE=1` on the nightly job — [ingestBaseline()](src/scripts/lib/ingest-offers.mjs), batched + barcode-matched (verified: 8,669 products → 6,038 snapshots, 99.8% match, 9m55s). NO Discount rows for non-offers.
- Clear **−X% / ΜΟΝΟ** badge on the offer detail view (mirrors the card). **User decision: NO "κανονική τιμή" text** — baseline quietly powers the verdict + alerts.
- **Alert engine now fires from the scraped pipeline** (was admin-only/dormant) for newly-appeared/price-dropped offers; shared [alert-match.ts](src/lib/alert-match.ts); 6h cooldown; **no-op until `RESEND_API_KEY` exists**.

**Auth accounts FOUNDATION (login not active yet):**
- next-auth@5 (supports Next 16/React 19) + @auth/prisma-adapter; `User`/`Account`/`Session`/`VerificationToken` + `PushToken` models (db-pushed); [src/auth.ts](src/auth.ts) DB sessions, Google/Apple/Resend providers **gated on env**; route `/api/auth/[...nextauth]`.

### ⛔ BLOCKED ON USER — credential shopping list (unblocks the next build)
1. **`RESEND_API_KEY`** → Vercel + `.env.local` (resend.com). Unblocks **alert emails AND email magic-link login**. To email real users (not just your own address), verify domain `prosforespantou.gr` in Resend (DNS).
2. **`AUTH_SECRET`** → Vercel (`openssl rand -base64 32`; a local one is in `.env.local`).
3. *(optional, social login)* **Google OAuth** → `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, redirect `https://prosforespantou.gr/api/auth/callback/google` (+ localhost for dev).
4. *(iOS-app stage)* **Apple Sign-In** — paid Apple Developer Program ($99/yr) + JWT key.

### ▶ NEXT BUILD (once #1 + #2 land — fully testable then)
Login UI + session-aware header → move favorites / preferred-stores / preferred-categories **server-side keyed by `userId` with merge-on-login** from localStorage → favorites→alerts as a logged-in toggle on the live engine. Then **Capacitor wrap (Phase 4.7)** adds native push (PushToken table ready; PWA assets exist).

### ❓ OPEN DECISIONS (owner)
- **Σκλαβενίτης scrape is CI-IP-blocked** (Akamai blocks GH + Vercel datacenter IPs; serves residential). Data was **refreshed manually 06-13**. Durable fix: residential proxy (~$/mo, hands-off) vs scheduled task on the dev PC (free, PC-must-be-on). Not urgent (weekly offers).
- **Android vs iOS first:** recommend **Android public-first** (Greek market ~75–80% Android; cheaper/faster review; defers Apple Sign-In). iOS TestFlight early **if owner is on iPhone**. Awaiting owner's phone choice.

### 🧰 Machine / infra gotchas
- This dev machine: **Groq + ab.gr + Anthropic WebFetch→ab are IP-blocked** (CI only). **sklavenitis.gr blocks CI but serves this machine** (residential). `gh` + `vercel` CLIs are authenticated and work.
- PowerShell here-strings mangle `git commit -m` with Greek/quotes → use `git commit -F <file>` or a bash heredoc.
- After `prisma db push` → `rm -rf .next` (stale generated client).

### 🔍 Verify-on-prod next session
Fresh incognito: onboarding sheet + Για σένα rail; photos load; ΜΟΝΟ badge on a mono offer's detail page; Κρητικός baseline growing (`PriceSnapshot` where `kind='normal'`); tonight's runs healthy in the Υγεία tab.

*(Detailed per-area blocks below, newest first.)*

---

## Pick up here (2026-06-16 -- Sklavenitis safer unblock probe)

Sklavenitis is currently reachable from this dev machine again, but treat it gently. A one-page probe against `https://www.sklavenitis.gr/sylloges/prosfores/?pg=1` returned real markup (`200`, 24 `data-productsku` cards, total reported `3038` offers), not an Akamai block page.

Safety changes from this session:
- [src/scripts/adapters/sklavenitis.mjs](src/scripts/adapters/sklavenitis.mjs) now defaults to slower page pacing (`PACE_MS=1200` + `JITTER_MS=600`) instead of a hard 250ms, and exposes `MAX_PAGES`, `PACE_MS`, `JITTER_MS`.
- One-page dry-run probe command: `DRY_RUN=1 ALLOW_PARTIAL_DRY_RUN=1 LIMIT=24 MAX_PAGES=1 PACE_MS=3000 JITTER_MS=1000 node src/scripts/adapters/sklavenitis.mjs`.
- The probe intentionally trips the shared "partial scrape" health warning because 24 < active 2830, but with `ALLOW_PARTIAL_DRY_RUN=1` it exits 0 if it scraped at least one item and had no errors. It still writes nothing and deactivates nothing.
- [.github/workflows/scrape-chains.yml](.github/workflows/scrape-chains.yml) has a new manual `sklavenitis-offers-probe` option that runs the exact one-page dry run in CI **without `PROXY_URL`**. Use this before trying the full GitHub `sklavenitis-offers` run, so we do not hammer the site if GitHub is still blocked.

Verified locally:
- `DRY_RUN=1 ALLOW_PARTIAL_DRY_RUN=1 LIMIT=24 MAX_PAGES=1 PACE_MS=3000 JITTER_MS=1000 node src/scripts/adapters/sklavenitis.mjs`
- Result: 24 scraped, 22 via mapping, 2 review queue, 0 errors, 0 writes/deactivations.

Next safe escalation path:
1. Push this change.
2. Trigger `gh workflow run scrape-chains.yml -f chain=sklavenitis-offers-probe`.
3. If the CI probe gets real cards, then run a slightly larger dry-run (`LIMIT=120 MAX_PAGES=5`) before any full run.
4. Only run full `sklavenitis-offers` after the probes pass; keep the slower pacing.

---

## ⚡ Pick up here (2026-06-16 — GDPR opt-in consent + legal pages SHIPPED)

**The privacy/consent layer is live on `main` (PR #2, merge `3061220`).** This closes the legal/GDPR launch blocker and makes the behavioural analytics legally collectable (owner wants click/behaviour data as an investor selling point — now opt-in, defensible in due diligence).

**Consent model = Option 1 (opt-in gate).** Nothing behavioural is tracked until the visitor presses «Αποδοχή». Chosen over an "anonymous-for-everyone" tier because the existing analytics use a persistent `sessionId` (not anonymous in the GDPR sense) and a clean opt-in story is the stronger DD asset.

**Architecture (all new unless noted):**
- [src/lib/consent.js](src/lib/consent.js) — single source of truth: `accepted`|`rejected`|not-asked, **default OFF**. `hasAnalyticsConsent()`, `onConsentChange()` store.
- [src/lib/track.js](src/lib/track.js) — **the only path components may use to log events**. Hard no-op until consent → the `trackEvent` server action is never called (so no `sessionId`/IP/user-agent reaches the server) for non-consenters. Do NOT call the `trackEvent` action directly from a component; it bypasses the gate.
- [src/lib/session-id.js](src/lib/session-id.js) — persistent `sid` is created **only after** consent; reject wipes it.
- [src/components/CookieConsent.js](src/components/CookieConsent.js) — banner; **equal-prominence Αποδοχή/Απόρριψη** (do NOT make reject harder — that invalidates ALL consent; this was an explicit owner ask we talked down). `useSyncExternalStore` (no SSR flash). Re-openable via the footer's "Ρυθμίσεις cookies" → `open-consent` window event. Mounted in [layout.js](src/app/layout.js).
- Refactored 4 call sites (DiscountCard, OfferDetails, ProductSheet, SupermarketClient) off the raw action onto `track()`.

**Analytics funnel broadened (server-action contract changed).** [track-event.ts](src/actions/track-event.ts) schema now also accepts `page_view`, `search`, `filter`, `store_select`, `favorite`, `outbound_click`; `supermarket` is now optional (defaults to `'site'`); `category` doubles as a free-form context label (search term / filter value / route path) — **no DB migration** (reuses `ClickEvent`). [PageViewTracker.js](src/components/PageViewTracker.js) fires consent-gated `page_view` on route change (mounted in layout). The other new event types are wired in the schema but not yet emitted from components — wire them when you want that data.

**Legal pages (static, footer-linked + cross-linked):** [/aporrito](src/app/aporrito/page.js) (Privacy), [/cookies](src/app/cookies/page.js) (Cookies), [/oroi-chrisis](src/app/oroi-chrisis/page.js) (Terms), via shared [LegalLayout.js](src/components/LegalLayout.js). Data inventory + processors (Vercel/Supabase/Sentry/Resend), GDPR rights, retention (email until unsubscribe; analytics ≤14 months), and an explicit **"δεν αποτελούν επίσημα δεδομένα των αλυσίδων" / independent-service / not-affiliated** disclaimer in Terms §1–3 (owner confirmed buried-in-Terms is legally fine; no banner needed). **Controller: Σίλβι Ζαΐμι (φυσικό πρόσωπο)** — launching as an individual, no company; contact **`zaimiwork@gmail.com`** for now.

**⛔ Follow-ups on owner (not blockers):**
1. **Set up `privacy@prosforespantou.gr`** (forwarding alias → Gmail, free; do it when you add Resend DNS) → then swap the contact email on all 3 pages from `zaimiwork@gmail.com`. A bouncing privacy contact is itself a GDPR problem, so until the alias exists the Gmail is the correct live value.
2. If you later register a business, swap the controller name for the company + ΑΦΜ/ΓΕΜΗ (2-min edit; shields your personal name).
3. The 3 legal pages are accurate-skeleton — fine to launch, but you can hand the prose to ChatGPT to polish (€0-budget rule) without touching the factual lists.

**Verify on prod:** incognito → banner appears bottom-center above the nav; press Απόρριψη → no `track:*`/ClickEvent network calls; press Αποδοχή → `page_view`/`deal_click` fire; `/aporrito`, `/cookies`, `/oroi-chrisis` render + footer links work; "Ρυθμίσεις cookies" re-opens the banner.

---

## ⚡ Pick up here (2026-06-15 — Lidl flyer-OCR REPLACED by structured e-shop API)

**Lidl now reads clean structured data instead of OCR'ing flyer images. Shipped to prod (ran both scrapers locally).** This kills the ~15% garbled-name problem for good — names/prices/dates/photos are now Lidl's own structured data, zero OCR.

**The data source (cracked this session):** lidl-hellas.gr's product search API.
- `GET /q/api/search?assortment=GR&locale=el_GR&version=v2.0.0&category.id=<NUM>&offset=N&fetchsize=48`
- **The filter param is `category.id` WITH the dot.** The plain `categories=` param is silently ignored and returns a fixed ~299 default set (this burned hours — every "wrong number" today traced back to it). With `category.id`, Food&Drink = **183** (matches the site's "120/183" loader), and non-food departments filter correctly (sports 26, tools 13, fashion 16…).
- **Auth/anti-block:** API 401s (or soft-blocks to `numFound:0`) without a same-site Referer/Origin **and a real session cookie**. The shared lib loads a category page first to get cookies + scrape the department nav, sends `sec-fetch-*` headers, honours `Retry-After`/429/503, and jitters pacing. Sweeping all sitemap entries got the dev IP throttled — discovery now uses the **landing-nav departments (~8–17, ~68 requests total)**, not 277.
- Products nest at `items[].gridbox.data`. SKU = `productId` (no GTIN; `ians` only).

**Architecture (shared helper):**
- [src/scripts/lib/lidl-eshop.mjs](src/scripts/lib/lidl-eshop.mjs) — discovery + session + paginated `scrapeAllProducts()` + `classifyOffer()`. One correct paginator for both tracks. **Throttle-safe:** a failed/empty fetch returns `{ok:false}` and is surfaced as a warning, NEVER silently counted as "empty category" (the silent-undercount trap).
- **Offers** [adapters/lidl.mjs](src/scripts/adapters/lidl.mjs) — discounted items only, each with a badge. CURRENT only: strikethrough (`oldPrice>0`), ΜΟΝΟ (`price.discount.discountText`), or in-store badge active **today** (`IN_STORE_TODAY_DATE_RANGE`/`FROM_DATE_TODAY`). EXPIRED (past) + UPCOMING (future) excluded — owner decision: no other chain shows upcoming; revisit post-launch via future `validFrom` + a `validFrom<=today` public filter so they auto-activate. `source:'leaflet'` (replaces the OCR rows on the same source). No Groq/sharp/cheerio/backfill.
- **Catalog** [lidl-catalog.mjs](src/scripts/lidl-catalog.mjs) — FULL assortment (discounted + full-price); `baseline:false` for on-offer items so their promo price isn't snapshotted as 'normal'. Full-price items show plain/no badge, like every other chain.

**Live prod after the runs:**
- **Offers: 128 active** (48 strikethrough + 80 ΜΟΝΟ), **76→128 auto-linked** to Lidl Products via `productId`→ChainProductMapping. **181 old OCR rows deactivated.** Names verified clean (no homoglyphs).
- **Catalog: 256 products** (104 new), 152→256 SKUs, 52 baseline snapshots.
- **Images self-hosted: 128/128 offers + 256/256 catalog mirrored to Supabase** (Lidl hosts photos on TWO hosts — `imgproxy-retcat.assets.schwarz` AND `www.lidl-hellas.gr/assets/`; match both). Both scrapers mirror **inline** each run via `mirrorImages` (small assortment → no timeout), so Lidl photos survive a CDN rotation/block. `mirror-catalog.mjs` also gained a `lidl` host entry for manual drains.
- Workflow: `lidl-offers` (Thu) no longer needs `GROQ_API_KEY`; `lidl-catalog` (Sun). Both run free/fast (~1–2 min).

**SHIPPED to `origin/main`** (commits `9625b6d` + `c4e022a`; ran both scrapers + image mirror locally, so prod DB already holds the clean data). Nothing left on this task.

**Verify next session (prod):** Lidl offer cards show clean Greek names + real photos (not Lidl-hosted — should be `…/storage/v1/object/public/chain-images/…`); confirm the **Thu `lidl-offers`** + **Sun `lidl-catalog`** CI runs go green in the Υγεία tab (they no longer need `GROQ_API_KEY`).

**Open / next candidates:**
- **Other chains still OCR/flyer-based?** The structured-API pattern (shared lib + inline mirror + nav discovery + session/Retry-After) is now the template — apply it to any chain still scraping fragile sources.
- **Sklavenitis images** are the only un-mirrored set (its host IP-blocks us) — gated on the residential-proxy decision already in OPEN DECISIONS above.
- Offer mix is heavy on Carroten sun-care (a real Lidl summer ΜΟΝΟ promo in Food's health/beauty subcat) — legit, just eyeball it.
- Untracked root scratch `.txt` files (incl. a `passwords.txt` security smell) + root `MEMORY.md` still deferred — move out / .gitignore.

**Key gotcha for whoever touches Lidl next:** the search API filter param is **`category.id`** (with the dot) + `version=v2.0.0`; plain `categories=` is silently ignored → fixed default set. Needs a **session cookie** (load a page first) or it soft-blocks to `numFound:0`. Don't sweep all sitemap entries — that throttles the IP; use the landing-nav departments. All of this is in [src/scripts/lib/lidl-eshop.mjs](src/scripts/lib/lidl-eshop.mjs).

---

## ⚡ Pick up here (2026-06-15 — Lidl OCR verified in CI + mymarket/masoutis images drained)

Two follow-through tasks closed out this session.

**1. Lidl OCR cleanup + showUnmatched — VERIFIED on prod.** CI run [`27539376113`](https://github.com/zaimiwork-dev/prosforespantou/actions/runs/27539376113) (`gh workflow run scrape-chains.yml -f chain=lidl-offers`) succeeded. DB after: **active Lidl offers 71 → 186** (all productless, as expected for unmatched OCR items), **54 imaged** by the auto-backfill, brand cleanup confirmed on live data (TRONIC/LIVARNO/etc. clean). Remaining deep Greek OCR typos (κουμπι, Φωταλίες, ραδιοκουμπάτων…) are the **Groq semantic typo-fix pass — still deferred** (CI-only); owner accepts minor typos over hiding deals.

**2. Catalog image draining — mymarket + masoutis DONE (local).** `CHAIN=<x> MIRROR_MAX_NEW=3000 QUERY_LIMIT=3000 MIRROR_CONCURRENCY=16 node src/scripts/mirror-catalog.mjs`, looped until drained. Results (live prod `Product.imageUrl`):
- **mymarket:** 3,152 mirrored, only **7 still on chain host** (persistent fetch timeouts — keep chain URL, retry next scheduled run).
- **masoutis:** 3,589 mirrored, only **57 still on chain host** (same — timeout stragglers).
- The other imaged products per chain sit on *other* chains' hosts (GTIN-canonical product first surfaced elsewhere) — out of scope for a per-chain drain.
- ⚠️ Loop gotcha: `grep -q "0 catalog images to consider"` matches as a **substring of "3000 catalog…"** — anchor it (`grep -qE "^[[:space:]]*0 catalog"`) or the loop exits after one pass.
- **Still un-drained:** `ab` (CI-only host) and `sklavenitis` (needs `PROXY_URL`/residential). lidl catalog images come via `lidl-catalog.mjs` + the offer backfill, not this drain.

---

## ⚡ Pick up here (2026-06-15 — Lidl OCR cleanup + showUnmatched ON)

**Goal:** surface the ~135 real Lidl food deals stuck unshown in the review queue. 171 Lidl items sit in PendingMatch unmatched (Lidl is barcode-less + own-brand heavy → no cross-chain canonical to match). Owner confirmed: show everything incl. the ~36 non-food middle-aisle items (no filter).

**Changed in [adapters/lidl.mjs](src/scripts/adapters/lidl.mjs):**
- `showUnmatched: false → true` — unmatched offers now written as productless Discounts (display-first), claimed later by the resolver.
- New `cleanOcrName()` — *deterministic, safe-only* OCR cleanup applied to the displayed name + used for the `chainItemcode` hash: collapses split private-label brands ("PARK SIDE"→"PARKSIDE") and de-homoglyphs a leading brand cap ("ΒESTWAY"→"BESTWAY"). Verified locally on real examples. Does NOT touch semantic Greek typos (καρπόζί→καρπούζι, Τσαουρεκάκια…) — those need a Groq pass (CI-only) and are left as a future step; owner accepts minor typos over hiding deals.

**⚠️ Verification is CI-only:** the Lidl adapter OCRs the leaflet via Groq vision, and **Groq is IP-blocked on this dev machine** — the adapter cannot run/verify locally. Path: push → `gh workflow run scrape-chains.yml -f chain=lidl-offers` (gh CLI works here) → check DB. The Lidl image backfill (prev section) also runs at the end of this same adapter, so a fresh run re-images too.

**Next:** confirm the triggered CI run wrote productless Lidl Discounts with cleaned names + that the app renders them; then the other open task = drain mymarket/masoutis/lidl catalog images (fully local-doable).

---

## ⚡ Pick up here (2026-06-15 — Lidl own-images backfill)

**Follows the 2026-06-14 catalog fix's "known remaining data issue."** All 71 active Lidl offers had `Discount.imageUrl = null` (leaflet OCR carries no per-tile image), so cards fell back to the linked canonical Product's image — for ~40% of them a *different chain's* packaging, and a blank tile when that cross-chain host failed.

**Fix — stamp each Lidl offer with a Lidl-sourced image** (the card prefers `offer.imageUrl`): [lidl-image-backfill.mjs](src/scripts/lib/lidl-image-backfill.mjs) `backfillLidlImages()`:
1. Linked product is a Lidl product with an image → copy it (authoritative).
2. Else fuzzy-match the OCR name against the 152-row Lidl catalog, **gated on a brand-safety rule** (the offer's head/brand token must appear in the candidate) — this is load-bearing: without it, branded offers (ΗΠΕΙΡΟΣ/LURPAK/ΔΩΔΩΝΗ) get matched to Lidl's own-brand *generic* ("Φέτα Π.Ο.Π.") = wrong packaging. Threshold 0.6.
3. No confident source → leave null (unchanged cross-chain fallback; never stamp a wrong image).

**Applied to prod (2026-06-15):** 44/71 imaged (43 linked + 1 safe fuzzy), 27 left null — all 27 still have a working linked-product fallback (**0 offers imageless**, no regression). Imaged URLs are Lidl's own hosts (`www.lidl-hellas.gr`, `imgproxy-retcat.assets.schwarz`), verified 200 + real image content-type.

- Idempotent (fills nulls only); re-run via `node src/scripts/backfill-lidl-images.mjs` (`DRY_RUN=1` to preview the fuzzy matches).
- **Auto-applies each weekly Lidl scrape** — wired into [adapters/lidl.mjs](src/scripts/adapters/lidl.mjs) `runLidlAdapter` after `ingestOffers` (skipped on dryRun).
- Verified: eslint clean, `npm run build` green.

**Still open for Lidl:** the 27 cross-chain-linked offers keep a cross-chain image (acceptable when the canonical product genuinely matches); better same-chain linking would need the offer to carry a Lidl SKU/barcode, which OCR doesn't give. OCR name-cleanup pass + `showUnmatched` flip still pending.

---

## ⚡ Pick up here (2026-06-14 — catalog UX correction after owner QA)

**Owner QA caught a real bug:** `/catalog` said "Πλήρεις κατάλογοι" and showed `34.218 προϊόντα`, but the filter chips were active-offer counts. Clicking Lidl showed `71 προϊόντα` even though `71` is the active-offer count, not the full catalog count. This was wrong and must not regress.

**Correct mental model now:**
- `Product` catalog = full catalog surface. Counts are product rows with images.
- `Discount` / active public offers = offers surface. Counts are offer rows after `activePublicDealWhere()`.
- `/catalog` has explicit modes:
  - `Όλα τα προϊόντα` -> Product counts/filtering.
  - `Προσφορές τώρα` -> active public Discount counts/filtering + category chips.
- Product rows do not have a stable category field, so category chips appear only in offer mode.

**Live DB facts measured 2026-06-14:**
- Product rows with images: `34.218`.
- Product store counts: AB `14.669`, Μασούτης `7.924`, Κρητικός `6.878`, My Market `4.577`, Lidl `152`, Σκλαβενίτης `18`.
- Public active offers shown in the app: `7.118`.
- Offer store counts: Σκλαβενίτης `2.846`, Κρητικός `2.238`, Μασούτης `1.171`, My Market `417`, AB `375`, Lidl `71`.

**Files changed by the fix:**
- [get-catalog-products.ts](src/actions/get-catalog-products.ts): added `mode: 'catalog' | 'offers'`, separated Product vs Discount counts, and returns `offerBySupermarket`.
- [CatalogClient.js](src/components/CatalogClient.js): mode segmented control, Product-count store chips in catalog mode, offer-count category/store chips in offer mode.
- [ProductCard.js](src/components/ProductCard.js): removed category-icon fallbacks from catalog cards, tries offer image then product image, hides wrong-chain metadata such as `ΑΒ` under Lidl.
- [globals.css](src/app/globals.css): mode tabs, hidden chip scrollbar, local clear-filter pill, quiet image-empty state.

**Verified locally before handoff:**
- `npx eslint src/actions/get-catalog-products.ts src/components/CatalogClient.js src/components/ProductCard.js`
- `npm run build`
- Browser DOM:
  - default `/catalog` -> `34.218 προϊόντα`
  - Lidl catalog filter -> `152 προϊόντα`
  - Lidl + offer mode -> `71 προσφορές`
  - visible icon fallback count -> `0`
- Screenshots:
  - `C:\Users\Work\AppData\Local\Temp\prosfores-catalog-fix-2026-06-14\catalog-default-fixed.png`
  - `C:\Users\Work\AppData\Local\Temp\prosfores-catalog-fix-2026-06-14\catalog-lidl-products-fixed.png`
  - `C:\Users\Work\AppData\Local\Temp\prosfores-catalog-fix-2026-06-14\catalog-lidl-offers-fixed.png`

**Known remaining data issue:** Lidl offer rows often have `Discount.imageUrl = null` and can be linked to a cross-chain canonical `Product.imageUrl`; when that cross-chain image fails, the UI shows a quiet blank image area. Do not bring back random icons. Real fix is a Lidl own-image backfill/mirror from Lidl catalog/detail/leaflet data and better same-chain product matching for Lidl offers.

**Repo hygiene:** root scratch files still exist and should not be staged unless intentionally reviewed: `claude-search.txt`, `findstr-output.txt`, `hash_search.txt`, `passwords.txt` (security smell; move out of repo root).

---

## ⚡ Pick up here (2026-06-14 — FULL-CATALOG engine + 5 chains done; sklavenitis needs proxy; images draining)

**Goal (owner):** full, self-renewing product catalogs for all 6 live chains, plus self-hosted
images ("own every product+pic, survive a block"). Prior catalog slice is committed + pushed; this
Codex continuation has local uncommitted mirror-concurrency/drain changes. Check live numbers anytime:
`npm run catalog:coverage`.

**Reusable engine (the load-bearing piece):** [ingest-catalog.mjs](src/scripts/lib/ingest-catalog.mjs)
`ingestCatalog({chain,items})` — the ONLY place allowed to GROW the Product catalog, with a
DETERMINISTIC identity (real barcode, else the chain's own SKU via ChainProductMapping — never an
LLM guess → no pollution; same shape as the existing barcode-less Masoutis rows). Writes
`kind:'normal'` shelf baselines on-change; creating the SKU mapping **auto-links that chain's future
offers** (the proven bonus: mymarket's offer link-rate jumped 63%→84%). Exported
`SM_MAPPING`/`normalizeBarcode`/`withDbRetry` from ingest-offers for reuse.

**Recipe for any new catalog feeder (mechanical now):** scrape the chain's full listing → map each
product to `{chainItemcode, name, price, imageUrl?, brand?, barcode?, baseline?}` → `ingestCatalog`.
[mymarket-catalog.mjs](src/scripts/mymarket-catalog.mjs) is the reference; `baseline:false` for
on-offer rows (their price is the promo, not the shelf price).

**Per-chain catalog status:**
- **kritikos** ✅ full (6,881, barcoded). Daily CI offers run does `BASELINE=1`; weekly canonical refreshes.
- **mymarket** ✅ **DONE** — [mymarket-catalog.mjs](src/scripts/mymarket-catalog.mjs) walks /offers
  (whole offers-heavy listing, ~5.5k) → **1,453 → 4,613**, offer link-rate **63%→84%**. Wired weekly
  (`mymarket-canonical` job). (/offers ≠ the entire store; full store would need category-tree walking.)
- **ab** ✅ **DONE — 11,728 products** (vs 3,433 from Wolt; created 11,238 + 490 existing, 11,664
  baselines, 0 err) — [ab-catalog.mjs](src/scripts/ab-catalog.mjs) walks the
  `productListingType:'CATEGORY'` GraphQL listing across ~14 root category codes (SKU-keyed, no GTIN).
  Wired weekly (Sun 04:30 UTC). Inline image mirror is OFF (`MIRROR_IMAGES=1` to opt in) — it timed
  the run out otherwise; AB images drain via `mirror-catalog CHAIN=ab` in CI instead.
- **lidl** ✅ **CORRECTED + DONE** (owner caught my "flyer-only" error) — lidl-hellas.gr HAS an e-shop.
  [lidl-catalog.mjs](src/scripts/lidl-catalog.mjs) discovers categories from the sitemap, decodes the
  **index-dehydrated** product JSON (flat array; field values are indices), → **152 priced products**.
  Wired weekly (Sun 03:30 UTC). HONEST LIMITS: grid pages carry the national price but only surface
  ~hundreds; product *detail* pages list ~426 + real GTINs but OMIT price (store-dependent, separate
  client call). Full priced coverage needs Lidl's per-store price API (future). Flyer-OCR offers
  ([adapters/lidl.mjs](src/scripts/adapters/lidl.mjs)) still provide Lidl's deal prices on top.
- **masoutis** 🟡 7,924 (best-covered; stale snapshot from the OLD pipeline, not self-renewing).
  PARKED — its category API is JS-gated (homepage nav 0 links; would need a Playwright capture). Low ROI.
- **sklavenitis** 🔴 **18 — blocked on owner `PROXY_URL`.** Barcode-less + CI-IP-blocked, and heavy-
  scraping the home IP risks a ban. Once the proxy secret is set: write `sklavenitis-catalog.mjs`
  (walk category tree, reuse the [sklavenitis.mjs](src/scripts/adapters/sklavenitis.mjs) card parser)
  → ingestCatalog, run via proxy in CI.

**Images self-hosted: 25% overall — Κρητικός now 100%.** [mirror-images.mjs](src/scripts/lib/mirror-images.mjs)
is concurrent (default 6 workers; override `MIRROR_CONCURRENCY`; `maxNew` shared across workers). The
long Κρητικός drain completed (6,737 uploaded + 1,885 reused → 8,622 `Product.imageUrl` rewritten; 64
timeouts kept original): coverage now **8,660 mirrored Products / 25% total**, **Κρητικός ~6,845 / 100%**.
REMAINING: ab/mymarket/masoutis/lidl catalog images — drain with
`CHAIN=<x> MIRROR_CONCURRENCY=16 node src/scripts/mirror-catalog.mjs` (ab + www.ab.gr = CI-only;
sklavenitis needs `PROXY_URL`). Only the `kritikos-canonical` CI job has a `mirror-catalog` step so far
— wire the others (or one combined image-mirror job). HOST_MATCH covers
kritikos/ab/mymarket/masoutis/sklavenitis/wolt; add a lidl (schwarz CDN) host for Lidl images.

**NEXT (ranked):** ① **owner sets `PROXY_URL`** → build sklavenitis catalog (also unblocks the
sklavenitis OFFERS scrape AND the Capacitor app track — the biggest single unblock). ② continue
catalog-image drains (Kritikos first; AB from CI; Sklavenitis only with `PROXY_URL`). ③ (optional)
masoutis self-renewing catalog; Lidl full-426 via Lidl's per-store price API; the Android app build.
Catalog now **34,259 Products** across 5 catalog-fed chains, with AB verified as a full-catalog baseline.

---

## ⚡ Pick up here (2026-06-13 — AUTONOMY + APP slice: proxy, full-image self-hosting, browse catalog, Capacitor scaffold)

**Owner ask:** make the product self-sufficient — own every product/price/picture so nothing
breaks when a chain blocks us, keep it auto-renewing even when blocked, make the **full catalog
browsable**, and **wrap it as a native app**. Decisions locked: residential proxy from CI;
full catalog browsable; Android dogfood APK first (iOS later via cloud-Mac CI). Plan file:
`~/.claude/plans/hi-so-read-whatver-noble-zephyr.md`. **SHIPPED + LIVE:** committed + pushed
(`39fadf2`) and deployed to prod — `/catalog` verified live (24 cards SSR, offer deep-links 200).
A follow-up Codex session extended this slice: catalog is now **offers-first with real search
ranking** (reuses [search-rank.ts](src/lib/search-rank.ts) via `unaccent` SQL), wrapped in the app
shell (header/cart/preferred-stores), non-offer items stay **price-silent** (honest), plus a new
**coverage diagnostic** ([catalog-coverage.ts](src/lib/catalog-coverage.ts) + `catalog:coverage`
script + admin panel). Build green, 153 tests, lint at the pre-existing baseline (5 errors/6 warnings,
all AdminPanel/DealsClient).

**Track 1 — autonomous refresh that survives IP blocks (Σκλαβενίτης):**
- New [proxy-fetch.mjs](src/scripts/lib/proxy-fetch.mjs): `installProxyFromEnv()` installs an
  `undici` global `ProxyAgent` when `PROXY_URL` is set (no-op otherwise → other chains
  untouched). Added `undici` dep + 4 unit tests.
- [sklavenitis.mjs](src/scripts/adapters/sklavenitis.mjs) calls it at startup → in CI the page
  scrape **and** the s1.sklavenitis.gr image downloads route through a residential IP. 403 still
  throws before ingest, so a blocked run deactivates nothing (safety intact).
- `scrape-chains.yml`: `PROXY_URL` secret passed to the `sklavenitis-offers` job (+ documented).
  The dead Vercel sklavenitis route was already gone.
- **⛔ USER ACTION:** sign up for a residential proxy (Greek/EU residential), add repo secret
  `PROXY_URL=http://user:pass@host:port`. Then the daily 01:00 UTC run self-heals. Verify:
  `gh workflow run scrape-chains.yml -f chain=sklavenitis-offers` → 200 + healthy IngestRun.

**Track 2 — every image self-hosted (resilience):**
- [kritikos.mjs](src/scripts/adapters/kritikos.mjs) now mirrors its OFFER images (S3 host,
  reachable from CI; `maxNew` capped). Added SUPABASE creds to the `kritikos-offers` job.
- New [mirror-catalog.mjs](src/scripts/mirror-catalog.mjs): self-hosts `Product.imageUrl` (the
  non-offer catalog that the browse view renders), chain-parameterized + incremental + proxy-aware,
  writes the rewritten URL back. Wired into the `kritikos-canonical` weekly job. Smoke-tested
  (DRY_RUN) against the live DB. **Seed the initial ~8.7k Κρητικός locally to drain fast:**
  `CHAIN=kritikos node src/scripts/mirror-catalog.mjs` (re-run until uploaded=0). Other chains:
  `CHAIN=ab` (CI), `CHAIN=sklavenitis PROXY_URL=…`, etc.
- **Deferred (noted):** Lidl leaflet-page mirroring (Lidl items are OCR'd, no per-product images).

**Track 3a — full catalog, browsable (NEW public surface):**
- [get-catalog-products.ts](src/actions/get-catalog-products.ts): searches every `Product`,
  attaches its cheapest CURRENT offer when one exists (honest — silent price otherwise).
- [ProductCard.js](src/components/ProductCard.js) + [CatalogClient.js](src/components/CatalogClient.js)
  (debounced search + infinite scroll, DealsClient's setState-in-callback pattern) +
  [/catalog](src/app/catalog/page.tsx) (force-dynamic). New **"Κατάλογος" bottom-nav tab**
  (+ `Icon.Grid`). v1 = search + paginate (no category/chain facet yet — `Product` has no category;
  that's the Track 3b follow-up).

**Track 3b — catalog ranking / honesty tweak (Codex continuation):**
- `/catalog` now ranks products with a CURRENT active offer first, then quiet catalog-only products
  underneath. Search still spans the full catalog, but offers lead the results.
- Non-offer products stay **price-silent** — no "Τιμή ραφιού" card treatment. We only promote
  active offers with the real `-X%` badge or supermarket-style `ΜΟΝΟ`.

**Track 3c — catalog/search UX fix (Codex continuation):**
- Added a visible desktop/tablet `Κατάλογος` header link and the normal app header on `/catalog`
  (mobile still uses the bottom tab).
- Search suggestions no longer open empty / sticky panels; `/search` shows only the submitted
  results after Enter. `gala`/`γάλα` now ranks actual dairy before soap/body-care scent matches,
  and short hidden substrings like `μεγάλα` are not treated as hits.
- `/catalog` search now uses the shared greeklish + relevance scorer instead of raw substring
  matching, while still keeping current offers first. Offer detail images render inside a centered
  frame.

**Track 3d — catalog coverage visibility (Codex handoff slice, local commit):**
- Owner correctly flagged data coverage as the biggest risk: we do **not** have every shelf product
  from every supermarket. Current facts from local DB on 2026-06-13: ~19.7k Products, ~19.65k with
  images, ~15.6k with GTIN/barcode, ~11.5k active offer rows, ~8.1k linked to canonical Products,
  ~3.36k active offers still unlinked. Full normal shelf-price baseline currently exists only for
  Κρητικός.
- Added [catalog-coverage.ts](src/lib/catalog-coverage.ts): shared read-only coverage calculator
  for totals + per-chain mode (`full-catalog-baseline` vs `offers-only`), active offers, linked /
  unlinked offers, pending matches, mapped products, source products, GTIN products, and normal
  baseline products.
- Extended [get-ingest-health.ts](src/actions/admin/get-ingest-health.ts) so the admin Υγεία tab
  returns `coverage` alongside feed health and recent runs.
- Extended [AdminPanel.js](src/components/AdminPanel.js) Υγεία tab with coverage KPI cards +
  per-chain table, so the owner can see the exact gap instead of guessing from the public catalog.
- Added [catalog-coverage.mjs](src/scripts/catalog-coverage.mjs) and `npm run catalog:coverage`
  for a read-only CLI report.
- Verification status: code was saved, but `npm run catalog:coverage` was interrupted by the user
  to preserve usage. Claude/Codex should run `npm run catalog:coverage`, then `npm run test:run`,
  `npm run build`, and `npm run lint` next. Expect lint to keep the pre-existing AdminPanel debt.
- Next data work after verification: (1) run/repair `resolve-pending-matches.mjs` where Groq works
  to reduce the ~3.36k unlinked active offers; (2) design full-catalog ingestion per chain, starting
  with the chains that expose catalog pages/feeds most cleanly; (3) keep Κρητικός as the proven
  baseline pattern.

**Track 4 — native app (Capacitor 8 scaffold):**
- [capacitor.config.ts](capacitor.config.ts) → `server.url` = `CAP_SERVER_URL` || prod
  (`https://prosforespantou.gr`); loads the live site so SSR + Server Actions keep working.
  Minimal offline `capacitor-www/index.html`. `cap:sync`/`cap:android` npm scripts. `android/`,
  `ios/` gitignored. Deps installed (`@capacitor/core|cli|android|push-notifications`).
- Push foundation: [register-push-token.ts](src/actions/register-push-token.ts) (session-gated —
  `PushToken.userId` is required) + [PushRegistrar.js](src/components/PushRegistrar.js)
  (native-only via `window.Capacitor`, zero web overhead), mounted in layout. Inert until login is
  active + FCM/APNs configured.
- **⛔ USER ACTIONS (runbook):** `npx cap add android` → open in Android Studio (`npm run cap:android`)
  → build/sign APK → sideload to dogfood. Push needs a Firebase project (FCM `google-services.json`).
  iOS: same project built on Codemagic/GitHub-macOS + Apple Developer Program ($99/yr) — no Mac needed.

**Still open / honest caveats:** full-catalog shelf-price baselines should stay behind the scenes
until a chain's mappings are clean; public store launch (review + legal pages + dev accounts) is
beyond the couple-days window; alerts/login still need `RESEND_API_KEY` + `AUTH_SECRET`.

---

## ⚡ Pick up here (2026-06-13 — Auth.js accounts FOUNDATION shipped; awaiting creds)

**End-goal context (owner):** this becomes a native iOS/Android app; users **log in (email/Google/Apple)** → get **push + email** alerts on watched items. Login STAYS OPTIONAL (anonymous UX unaffected); accounts add sync + notifications. See [[project_vision]].

**Shipped (`4391df3`)** — the auth foundation (NO login active yet, all gated on env):
- next-auth@5 beta.31 (confirmed: supports Next 16 + React 19) + @auth/prisma-adapter.
- Prisma: `User`/`Account`/`Session`/`VerificationToken` (Auth.js standard, UUID-aligned) + `PushToken` (future Capacitor FCM/APNs). db-pushed.
- [src/auth.ts](src/auth.ts): database sessions via the Prisma driver-adapter singleton; **Google / Apple / Resend-magic-link providers gated on their env vars** (none set → app builds + runs, login just isn't offered). Route at `/api/auth/[...nextauth]`.

**USER CREDENTIAL SHOPPING LIST (to activate login):**
1. **`AUTH_SECRET`** → Vercel env (generate: `openssl rand -base64 32`). A local one is already in `.env.local`.
2. **Google OAuth** (Google Cloud Console → OAuth client, Web): redirect `https://prosforespantou.gr/api/auth/callback/google` (+ `http://localhost:3000/...` for dev) → `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` to Vercel + `.env.local`.
3. **`RESEND_API_KEY`** (resend.com) → Vercel + `.env.local`. Dual-purpose: enables alert emails AND the email magic-link login.
4. **Apple Sign-In** — needs the paid Apple Developer Program; defer to the iOS-app stage (required for App Store if Google login is offered, not for web).

**NEXT (once Google + AUTH_SECRET + Resend land):** login UI + session-aware header (login/account button), then move favorites/preferred-stores/categories server-side keyed by userId with **merge-on-login** from localStorage. Then favorites→alerts become a logged-in toggle on the (already-live) alert engine.

**App-store timing (owner asked):** two moments — (1) Capacitor wrap + push → TestFlight/Play-internal (dogfood on your phone) soon after accounts+push; (2) public launch later, gated on native value (push+login = Apple's justification), "Sign in with Apple", polish, stable data, privacy/terms, dev accounts ($99/yr Apple, $25 Google). Recommend Android public first, then iOS.

---

## ⚡ Pick up here (2026-06-13 — Phase 9 (full-catalog baseline + alerts) slices 1–4a SHIPPED)

**The "store every item + clear offer distinction + alerts" track. All pushed.**

- **Slice 1 (`d4c5335`)** — `Discount.offerType` + `PriceSnapshot.kind` (additive, db-pushed). Every offer records WHY: `strikethrough` (published reference price) vs `mono` (hidden reference). Ingest writes both.
- **Slice 2 (`dbaad56`)** — **full-catalog price baseline, Κρητικός pilot, live behind `BASELINE=1`** on the nightly job. `ingestBaseline()` in [ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) writes `kind:'normal'` snapshots for NON-offer items, **batched** (preload mappings/barcodes/cache/last-price → bulk createMany; scales to full catalog in seconds), barcode-matched, matched-only, NO Discount rows. **Full CI run verified: 8,669 products → 6,421/6,436 non-offers matched (99.8%), 6,038 normal snapshots, 9m55s.** Κρητικός is the pilot because its adapter already fetches the whole catalog + matches by GTIN (sidesteps the mapping-cleanliness risk). To extend to another chain: that chain's adapter must expose its full catalog AND have clean (barcode-based) matching.
- **Slice 3 (`03d8be6`)** — offer-type clarity on the detail view: −X% (strikethrough) vs a **ΜΟΝΟ** badge (or chain sticker text), mirroring the card. **Per user: NO "κανονική τιμή" text** — non-discounted items aren't shown, and we don't surface a computed reference. The baseline data quietly powers the price-history verdict + alerts instead.
- **Slice 4a (`465eff0`)** — the keyword-alert engine (Alert model + `/alerts` page + `sendAlertEmail`) was **dormant for scraped offers** (only admin-created discounts fired it). Now the nightly scrape fires it too, for offers that **newly appeared / dropped** that run (standing offers don't re-spam; 6h cooldown). New shared [alert-match.ts](src/lib/alert-match.ts) predicate (admin path refactored onto it). **Safe no-op today** — no confirmed subscribers + no `RESEND_API_KEY` ⇒ nothing sends.

**Phase 9 — what's left (slice 4b, needs user):**
1. **USER: add `RESEND_API_KEY`** (free at resend.com) to Vercel env → alert emails actually send. Until then everything's a logged no-op.
2. **Favorites→email opt-in UI** (the user's stated vision): attach an email to the ⭐ favorites (via the existing double-opt-in Subscriber) so a saved PRODUCT alerts when it drops — built on the now-live engine. This is the next build once a Resend key exists (so it's end-to-end verifiable).

**Still parked (non-blocking):** Σκλαβενίτης durable scrape fix (residential-only — proxy vs PC task; data was refreshed manually, see below).

---

## ⚡ Pick up here (2026-06-13 cont. — Σκλαβενίτης is now CI-IP-blocked; data refreshed manually; FIX DECISION PENDING)

**New finding (Opus continuation):** the scheduled Σκλαβενίτης scrape **fails in CI with `page 1 HTTP 403`** — confirmed PERSISTENT across two GH dispatches AND a freshly-built Vercel cron route (`75b3b56`, [scrape-sklavenitis/route.ts](src/app/api/cron/scrape-sklavenitis/route.ts)). sklavenitis.gr's Akamai **IP-blocks datacenter ranges (GitHub Actions + Vercel both)** while serving residential IPs fine (this dev machine + the user's browser get 200, same headers). It's per-chain and not uniform: **AB is the opposite** (works from GH runners, blocks this dev machine). So "blocked" is chain×IP-range specific, not global.

- **Immediate staleness handled:** ran the adapter from this machine (residential) → **2983 scraped / 1850 matched / 44 deactivated / health OK** (image-mirroring deliberately skipped for speed — live photos already load direct via `unoptimized`). Data is fresh as of now.
- **The Vercel route (`75b3b56`) is confirmed NON-functional** (Vercel egress is also blocked) — it's NOT in vercel.json, never called. Remove it OR repurpose it only if we add a proxy. Decide with the chosen fix.
- **DECISION PENDING (user):** durable fix for residential-only chains = **(a) residential proxy** routed from CI (set-and-forget, scales to future blocked chains, ~$5–15/mo) vs **(b) Windows scheduled task on this PC** (free, proven, but pipeline depends on the machine being on). User is cost-conscious (chose "test Vercel free" first). No urgency now that data is fresh + sklavenitis offers rotate weekly.
- Tiny follow-up from the refresh: 1 unmapped native category `fresko-kreas/freska-arnia-katsikia` (fresh lamb/goat) → add to [native-category-maps.ts](src/lib/native-category-maps.ts); 169 sklavenitis shared-productId mis-mappings remain (post-audit residue, "winner-takes-row" warning).

---

## ⚡ Pick up here (2026-06-13 — bug-report session COMPLETE: all pushed, audit APPLIED, prod photos FIXED)

**Everything below is LIVE on prod (user authorized push mid-session). Final state:**

- **Mapping audit APPLIED in CI** (run 27430958570): Groq judged 1,354 questionable mappings → **577 deleted, 578 discounts unlinked (display-first, re-linkable via Review), 402 poisoned PriceSnapshots removed**. Verdict quality spot-checked both directions before apply. The ~770 "same" verdicts stay; LLM is slightly lenient there — the render guard covers display; re-audit anytime via `gh workflow run audit-mappings.yml`.
- **🔥 PROD PHOTOS ROOT CAUSE was NOT (only) CDN blocking: Vercel image-optimization quota exhausted** — `/_next/image` returned **402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED for EVERY host** (visible photos were just cached transformations). Fixed with `images.unoptimized: true` (`400b8e6`) — browsers now load images straight from source hosts. **Verified live: 0 optimizer refs, all 6 image hosts 200.** The datacenter-block story still matters for SERVER-side fetches (AB blocks everyone → mirror stays essential; masoutis URLs rotate → mirroring still right), but listing blanking was the quota. If the site ever upgrades to a paid Vercel plan, flip `unoptimized` off for resizing.
- **Leaflet links corrected** (`5a2a323`, user caught mymarket pointing at the offers grid): every chain now links its REAL φυλλάδιο page, verified by page title. Odd spellings live in constants.js comments (kritikos `/fulladia/fulladio/`, marketin `/filadio/`, sklavenitis `/katalogoi_/`). AB = `/promotions/leaflet` (user's URL — **CI-confirmed 200**, the old /fylladia guess 404s). galaxias + discountmarkt have no leaflet page → no link.
- **Vercel env**: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` added to Production via CLI (npx vercel, project linked) → masoutis cron mirroring activates from its next run. sklavenitis/mymarket mirror on tonight's GH runs.
- gotcha: `gh workflow run` + artifacts + `npx vercel env add` all work from this machine; Groq + ab.gr + WebFetch-to-ab do NOT (IP blocks).

1. **`9e4cf8a` accuracy core** — ΣΥΓΚΡΙΣΗ ΤΙΜΗΣ showed *different* Nescafé variants as "same product elsewhere" (mis-mapped shared productIds). New [offer-similarity.ts](src/lib/offer-similarity.ts) (token Jaccard; Greek↔Latin transliteration, unit canonicalization "280γρ"="280gr", word-prefix credit for inflection/abbreviations) now gates getPriceComparison (per-chain best + 0.5 floor) AND getCheaperAlternatives. `packCount` no longer parses "SPF50+ 40ml" as a 50+40 multibuy. **Data cleanup pending:** [audit-mappings.mjs](src/scripts/audit-mappings.mjs) found 13.7k mappings → ~1.4k questionable, but name-score alone is UNSAFE to act on (canonical names are wolt-era abbreviations/translations — 30%+ FP in every band <0.5; verified by sampling). So: Groq same/different verdict pass, APPLY only fixes verdict=different. **Dev machine is Groq-403'd (network block, same class as ab.gr!)** → runs in CI: `gh workflow run audit-mappings.yml -f apply=0` → download `mapping-audit` artifact → eyeball verdicts → re-run `-f apply=1`.
2. **`3bcd843` UX batch** — DealGrid infinite scroll (IntersectionObserver sentinel, button kept as fallback); /deals title + active chips show FULL category names (`full ?? id`, never `label` — rule in constants.js); **homepage now honors Τα καταστήματά μου** (carousels refetch filtered; gear icon shows count badge — before, only /deals filtered, which is why the user called it dead); offer image box height-capped (blur fix) + new "Παρόμοιες προσφορές" strip ([get-similar-offers.ts](src/actions/get-similar-offers.ts): same department, similarity-ranked) on sheet + page.
3. **`1cb9da8` images root-cause KILLED** — prod placeholders vs local photos = chain CDNs refuse Vercel optimizer's datacenter IPs (verified: live DB URLs all 200 from residential). Mirroring extended to sklavenitis + mymarket (CI jobs got SUPABASE secrets in scrape-chains.yml) and masoutis (Vercel cron — `maxNew: 120`/run cap for the 300s budget; **needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY added to Vercel env to activate — USER ACTION**). mymarket mirrors the `original` style (sharp full-screen). Verified live: 5-item sklavenitis run → 5/5 uploaded, DB rows HEAD 200 image/jpeg.
4. **`d9a6255` φυλλάδιο links** — every supermarket page header links the chain's OWN current-leaflet page (`SUPERMARKETS[].leafletUrl`, each probed live except ab.gr — Akamai-blocked from here, **verify ab.gr/fylladia once in a browser**). Admin PDF (when current) still wins; stale ones no longer kill the link.
5. **PHASES.md Phase 9** — full-catalog price baseline plan (user's strategic ask): normal/strikethrough/ΜΟΝΟ price kinds, snapshot-on-change, pilot sklavenitis+mymarket, then watch-list alerts via Phase 3 email. Read it before starting that work.

**Late addition same night — Personalization v1 (user: "onboarding picks + an algorithm like the big platforms"):** first visit auto-opens the preferences sheet (stores + "Τι αγοράζεις συνήθως;" categories, `intro` mode, `pp-onboarded` flag); [interest-profile.ts](src/lib/interest-profile.ts) keeps an on-device learned profile (view+1/add+3/fav+4, 14-day half-life); homepage gained a **"✨ Για σένα" rail** (declared + learned categories → hot pool → personal re-rank). `getActiveDeals` category param accepts arrays now. PHASES.md **Phase 10** documents the ladder (rung 2 = accounts, rung 3 = collaborative filtering over the ClickEvents we already log) + Do-NOTs (never personalize Κορυφαίες or the honesty verdicts). 143 tests.

**NEXT SESSION, ranked:** ① verify tonight's runs (Υγεία + live site): mymarket/sklavenitis images should flip to the mirror, masoutis mirror warnings should disappear; ② eyeball onboarding + Για σένα on prod (fresh incognito visit); ③ Bazaar+Γαλαξίας recon; ④ Lidl OCR cleanup; ⑤ Phase 9 full-catalog pilot (PHASES.md — only after mappings stay clean); ⑥ admin-panel UX rethink (deferred); ⑦ repo-root scratch txt hygiene.

---

## ⚡ Pick up here (2026-06-12 EOD — AB image mirroring LIVE & VERIFIED ✅, all pushed @ `e8b833b`)

**AB images: solved end-to-end in one day.** Secrets set, `ab-offers` dispatched, run healthy — **348/389 active AB offers now serve from the Supabase mirror (`chain-images` bucket), 0 still on www.ab.gr, 0 mirror failures** (Akamai DOES serve media to GH runners; the remaining 41 rows never had an image in AB's feed). Spot-checked public URLs: 200 image/jpeg. The Akamai-403 risk flagged in the section below is RESOLVED. Also shipped same evening (`e8b833b`): **'nirvana' frozen-brand rule** (2 mymarket name-only rows were Άλλο — user screenshot; backfilled) and **`.od-img .chain-pill right:auto`** (pill inherited base `right:10px`, stretched full-width and buried the −X% badge on the offer page — same both-edges bug class as the badge fix one line above it; check BOTH edges whenever overriding `.chain-pill`/`.discount-badge`).

**Environment changes this session (machine capabilities!):**
- `gh` CLI is now **authenticated** on the dev machine (account zaimiwork-dev, repo+workflow scopes) → can set secrets, dispatch workflows (`gh workflow run scrape-chains.yml -f chain=ab-offers`), and watch runs from here. The old "check Actions via DB freshness" workaround is obsolete.
- `SUPABASE_SERVICE_ROLE_KEY` lives in `.env.local` → storage admin works locally (the line may carry an invisible leading char from the web-copy — dotenv tolerates it, PowerShell `^`-anchored regex does NOT).
- Dev machine is Akamai-403'd from ALL of www.ab.gr (API included) → AB is **only testable via CI**.

**NEXT SESSION, ranked:**
0. **⚠️ FIRST: user has minor + major bugs to report** (he'll describe them in chat at session start — they were found after 06-12 EOD and are NOT written down anywhere). Fix those before anything below, then return to this list in order.
1. **Confirm steady-state mirror behavior** (2 min): after the next scheduled ab run (03:00 UTC daily), check Υγεία — expect mostly `reused` (HEAD-skips), no mirror warnings. Then eyeball the AB section on the live site.
2. **Bazaar Discount + Γαλαξίας recon** (user wants these chains) — new adapters plug into native-map + mirror systems from day one. Check what each site exposes first.
3. **Lidl OCR name cleanup** — pipeline works (257 items/run) but ~25% of names garbled; cheap Groq text-fix pass, THEN flip `showUnmatched: true` for lidl.
4. **Mirror masoutis images too** — its promo URLs rotate weekly (root cause of the 06-12 image regression); `mirrorImages` is chain-generic, AB has now proven it out.
5. Shared-productId mis-mapping audit (ab warns 12, sklavenitis 173, masoutis 183 — samePack-based).
6. Hygiene: `passwords.txt` + 3 scratch .txt files untracked in repo root (move out!); ~50 probe-* scripts; CLAUDE.md still documents the old fetcher→extractor→matcher pipeline as canonical.
7. Small data nit: 5 masoutis rows store the raw chain label ("Παγωτά - Οικογενειακά…") as `category` — legacy-pipeline artifact, invisible to the Κατεψυγμένα filter chip.
8. Hardening nit: `mirror-images.mjs` fetches have no per-request timeout — add `AbortSignal.timeout(10_000)` if an ab-offers run ever hangs in the adapter step.

---

## ⚡ Pick up here (2026-06-13 — AB image mirroring SHIPPED, needs 2 GH secrets to activate)

**AB image mirroring at scrape time — code complete, awaiting credentials.** www.ab.gr (Akamai) 403s every off-site fetch (Vercel optimizer, node, local browsers — even this dev machine can no longer reach the AB **API**; GH Actions CAN, runs are healthy). Solution shipped:
- **[mirror-images.mjs](src/scripts/lib/mirror-images.mjs)** — downloads images in the adapter's CI context, uploads to public Supabase Storage bucket `chain-images` (plain REST, no new dep), rewrites `item.imageUrl` pre-ingest. Deterministic path `ab/<sha1(url)>.<ext>` → re-runs HEAD the public URL and skip already-mirrored files. Per-image failures keep the original URL; Akamai HTML block pages are rejected by content-type. No creds → graceful no-op + run warning (visible in Υγεία).
- ab.mjs calls it (skipped under DRY_RUN); `ingestOffers` gained `extraWarnings` param; next.config allows the supabase host (mirrored URLs go through the optimizer — the `unoptimized` ab.gr bypass in DiscountCard/OfferDetails stays for legacy rows); workflow passes the two new secrets to the ab-offers job. 117 tests green, build green.
- **USER ACTION to activate:** add repo secrets `SUPABASE_URL` (https://qddyyykuaiuqpzmmzqzf.supabase.co) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings → API keys → service_role) under GitHub → Settings → Secrets → Actions. Then either wait for the 03:00 UTC run or trigger `ab-offers` via workflow_dispatch. The bucket is auto-created on first run. All ~355 broken rows self-heal because ingest rewrites imageUrl on every update. **Verify after first run:** Υγεία tab shows no mirror warning + AB cards show photos.
- Risk noted: untested whether Akamai serves the *media* paths to GH runner IPs (the API works from there; same host, so likely). If the first run warns `N/M image mirrors failed`, that's the signal it doesn't — fallback plan = mirror via a Greek residential proxy or at user's machine on a network that isn't blocked.

**NEXT SESSION, ranked:**
1. Activate + verify AB image mirroring (above — 5-min user task, then check Υγεία).
2. **Bazaar Discount + Γαλαξίας recon** (user wants these chains) — new adapters plug into the native-map system from day one. Check what each site exposes first.
3. **Lidl OCR name cleanup** — pipeline works (257 items/run, healthy IngestRuns) but ~25% of names are garbled ("LAY'S Ταιτσ", "Tonωτικό ρόφλημα"); add a cheap Groq text-fix pass, THEN flip `showUnmatched: true` for lidl.
4. 173 sklavenitis rows share productIds with other-chain SKUs (winner-takes-row warning every run) — audit ChainProductMapping; load-bearing since the carousel swaps in "cheaper chain" rows by productId.
5. Hygiene: `passwords.txt` + scratch files still untracked in repo root (move out!); ~50 probe-* scripts; CLAUDE.md still documents the old fetcher→extractor→matcher pipeline as canonical.
6. Later: masoutis promo URLs rotate weekly (the 7613174 image-regression root cause) — `mirrorImages` is chain-generic, could mirror masoutis too once AB proves it out.

---

## 🚀 LAUNCH PLAN (new north star, set 2026-06-12) — ship in days, beat the copycat

**Context shift:** a competitor has shipped something similar → goal is now **public launch in the next few days, made BETTER than baseline**, then pivot to marketing. User has a ChatGPT Pro plan for cheaper/boilerplate work (drafts, copy, legal text); use THIS session for architecture + data + anything load-bearing. User budget = €0 (no paid Claude tier), so be token-efficient: background long jobs, don't stream logs, compact between sessions.

**Our edge vs the copycat (lead with these in product + marketing):**
1. **Honest €/κιλό–€/λίτρο–€/μεζούρα unit pricing** (shipped) — almost no GR offers site does this; it's the anti-shrinkflation hook.
2. **Cross-chain cheapest price** per product (carousel swaps in the cheaper chain).
3. **Watch-list ⭐ + price-drop alerts** (favorites shipped; email alerts need RESEND key).
4. **Honest price verdicts + history** (not fake "-50%" theater).
5. **Accurate categories** via per-chain native taxonomy (just hardened).

**LAUNCH BLOCKERS (must clear before public launch):**
- [ ] **Legal/GDPR** — NO privacy policy / terms / cookie-consent pages exist. Mandatory for an EU consumer site. (Good ChatGPT task: draft Greek Πολιτική Απορρήτου + Όροι Χρήσης; we wire the pages + a cookie banner.)
- [ ] **AB images** (~360 placeholder; host 403s everyone) — mirror at scrape time. #1 visible-polish item.
- [ ] **Email alerts live** — needs `RESEND_API_KEY` (user-provided). Then watch-list → "το Χ έπεσε στα Υ€". This is the retention hook; high marketing value.
- [ ] **Login decision** — accounts foundation shipped but login NOT active (needs `AUTH_SECRET` + optional Google OAuth). Per vision login is OPTIONAL → can launch WITHOUT it (favorites already work device-local); decide explicitly, don't let it block.
- [ ] **Production smoke** — confirm prod deploy (Vercel), custom domain, all 6 chains' crons green in Υγεία tab, Sentry receiving.
- [ ] **Basic analytics** for the marketing phase (Vercel Analytics or Plausible — privacy-friendly fits the brand).

**NICE-TO-HAVE (post-launch / marketing phase):** Capacitor wrap for app stores (vision = native mobile app); Bazaar Discount + Γαλαξίας chains (more coverage = better than competitor); Lidl OCR cleanup; the 173 sklavenitis mis-mappings audit.

**Suggested launch order:** legal pages + cookie banner → AB images → prod/cron/domain smoke → (RESEND key) email alerts → soft launch → marketing. Login can come after.

---

## ⚡ Pick up here (2026-06-12 EOD — ALL PUSHED @ `3b2930a`, 10 commits)

### Late-day finds (after the root-cause commit) — all shipped
- **Σκλαβενίτης adapter slug map was STALE** (`3b2930a`): the site RENAMED its URL taxonomy; unknown slugs silently fell to keyword guessing ("Ρεβίθια με λαχανικά" → 'λαχανικ' → Φρούτα) and the provenance rule then protected the wrong answers. Adapter now emits the RAW slug pair (`katepsygmena/katepsygmena-geymata`) as the native label; [native-category-maps.ts](src/lib/native-category-maps.ts) maps all 115 current pairs; a future rename raises ingest warnings (Υγεία tab). Φρούτα & Λαχανικά verified ROW-BY-ROW: 59/59 real produce.
- **Image regression** (`7613174`): display preferred `product.imageUrl` (whichever chain we catalogued FIRST — masoutis promo URLs rotate weekly, wolt-era links dead) over the offer's own image. When the 06-12 mymarket scrape matched 4,010 rows, thousands of live pics vanished overnight. Fixed offer-own-first in DiscountCard/OfferDetails/ShoppingList.
- **Frozen-only brands** → Κατεψυγμένα for name-only chains: Μπάρμπα Στάθης (mini-rule keeps its FRESH bagged salads out), McCain, Noon, Natural Cool, Λαζαρίδη, Σπιτικές Επιλογές, spring rolls.
- recompute-categories: provenance keep-rule restricted to ADAPTER_TAXONOMY_CHAINS={sklavenitis}; failed writes now counted (was silently swallowing pooled-connection drops — re-run if failed>0).

### Same-day earlier slices
- `da07a48`+`9f69e05` two-row compact carousel with arrows; `d406d58` cheapest-chain carousel (sibling fetch by productId), card top-strip (badge/pill can't overlap), sheet badge fix + no-photo band; `f4c5ad6` Κάβα=drinks-only beverage split + τοματοχυμός→Κονσέρβες + pack-info τεμ honesty; `327ec42` **€/κιλό–€/λίτρο–€/μεζούρα unit pricing in the sheet** (gift multibuys multiply per-piece size; doses beat volume; diaper kg-ranges guarded); `49339c6` provenance/backfill honesty.
- Lidl verdict: don't flip showUnmatched until OCR cleanup (see #3).
- My Market "2-3× more offers" answered: genuine — adapter filters to on-offer rows; the chain just publishes ~5k.

### Category root-cause architecture (`826f414`) — how it works now

1. **[native-category-maps.ts](src/lib/native-category-maps.ts)** — EVERY native label of mymarket (329) / kritikos (273) / ab (14) mapped once to a department; that's ~72% of the catalog now deterministic. Per-chain because the same label flips meaning across chains ('Παιδικά' suncare↔baby-yogurt, 'Λευκά' wine↔cheese, 'Γάλα'@kritikos = infant formula, 'Συμπυκνωμένα' softener↔tomato juice). `null` value = known-but-mixed label → keyword-split, no warning. **Unknown labels show up as ingest-run warnings** (Υγεία tab) — add them to the map, re-run backfill.
2. **`categorizeForChain(chain, name, native)`** in [categories.ts](src/lib/categories.ts) is the entry now (map hit beats everything); ingest-offers.mjs uses it + collects `unmappedLabels`. tsconfig gained `allowImportingTsExtensions` (node strip-types needs the explicit `.ts` import).
3. **Provenance rule** in [recompute-categories.mjs](src/scripts/recompute-categories.mjs): no native label + valid stored department = adapter taxonomy set it (sklavenitis href slugs) → KEEP; never re-derive from name keywords. (The 06-11/12 backfills had corrupted sklavenitis rows this way — repaired by re-running the sklavenitis adapter, whose update path rewrites category.)
4. **Keyword fallback** (masoutis/lidl/unmapped only): Φρούτα rule moved LAST (fruit words are scent words: "Klinex Λεμόνι", "σαμπουάν Πράσινο Μήλο"); λεμοναδα/πορτοκαλαδα/γκαζοζα→Κάβα; πουρες/μπεσαμελ/ξιδι→Παντοπωλείο.
5. Backfill: 955 rows moved, Άλλο 563→216, Φρούτα 214→~real-produce-only. 17 new tests (95 total).

**Maintenance loop:** new chain label appears → Υγεία-tab warning → add 1 line to native-category-maps.ts → `node src/scripts/recompute-categories.mjs`.

---

## ⚡ Pick up here (2026-06-11 — obs + display-first + categories + ranking + search/UX SHIPPED)

### Slices ④+⑤ — honest hotness protocol & search/UX overhaul (2026-06-11, after user feedback)

**④ Ranking** (`9c1fb12`): user said top items felt random. Causes: 66 total clicks ×8 points let stray test-clicks pin a duster at #5; honest-pricing verdict ignored (a 'high'-verdict offer ranked #4); 357-row score ties collapsed into chain blocks. [hotness.ts](src/lib/hotness.ts) now: **verdict-aware** (lowest +8 / good +4 / high −6 — hot sort can never contradict the honesty badge), **log-dampened popularity** (log2(1+clicks)·7 + log2(1+list_adds)·10 — list_add is the stronger intent), **stable per-row jitter** [0,1.2) breaks tie plateaus deterministically, CLICK_WEIGHT 8→3. scrape-chains.yml recomputes **verdicts BEFORE hotness**. All public sorts end on `{id:'asc'}` (stable pagination). 9,580 rows rescored in prod. 10 tests.

**⑤ Search + UX** (this commit), from the honest site review:
- **Search relevance** — searching "γάλα" returned body lotions and honey-milk soaps before ANY milk (substring LIKE + ORDER BY expiry + LIMIT 50 cutoff). New [search-rank.ts](src/lib/search-rank.ts), shared by the server action AND the suggestion dropdown (killed the divergent inline copies): word-in-name > word-prefix > substring > description; **query category intent** via the catalog categorizer ("γάλα" → Γαλακτοκομικά rows boosted +50); hotScore = tiebreak only. SQL recall stage now over-fetches 300–400 by hotScore. Verified: γάλα → Μεβγάλ/ΝΟΥΝΟΥ/ΔΕΛΤΑ milk first, dropdown matches. 10 tests.
- **Display dedupe** — same product showed twice (web+leaflet rows, AND same-name catalog dupes under two productIds). New [dedupe-deals.ts](src/lib/dedupe-deals.ts) collapses on BOTH keys (productId+chain, then name+chain; cheaper price wins the slot). Applied: getTopDeals (server), DealsClient, SupermarketClient, /search. ([group-deals.js](src/lib/group-deals.js) still does the richer source-tag merge in FeaturedCarousel.)
- **Carousel freshness** — stable partition: offers with >24h of life lead; "Λήγει σήμερα" can't headline.
- **Watchlist v1 ("Τα αγαπημένα σου")** — ⭐ toggle in [OfferDetails](src/components/OfferDetails.js) (sheet + page), favorites persisted in the zustand localStorage store (`favorites`, `toggleFavorite`, `favoriteKeyFor` — productId-keyed with name+chain fallback for unmatched offers), [get-favorite-deals.ts](src/actions/get-favorite-deals.ts) (public, zod, rate-limited, matches productIds across ALL chains), [FavoritesRow](src/components/FavoritesRow.js) renders ABOVE Κορυφαίες only when a favourite is live. Verified end-to-end with Playwright (star → row appears).
- Dead store tiles: review flagged them, but the redesign already renders them as a dimmed non-link "Σύντομα κοντά μας" row — no change needed.

---

## ⚡ Pick up here (2026-06-11 — observability + display-first + category overhaul SHIPPED)

**All pushed to `origin/main`** (`4963545`, `c124970`, `fcbadbd`). Context: user asked "is my extraction architecture healthy/sustainable?" → verdict: yes, the adapter→ingest design is right; the two gaps were **nobody watching it** and **~4k scraped offers invisible** (no Discount written when matching fails). Both shipped. Then user reported the categories looked wrong → systematic leak hunt + engine fixes + 1,573-row backfill (slice ③).

### Slice ③ — category leak overhaul (2026-06-11)

User-visible problem: fabric softeners/razor refills/tissues in Προσωπική Φροντίδα, ΜΕΛΙΣΣΑ pasta in Πρωινό, juices in Φρούτα, Somersby/ρετσίνα/Μπίρα in Άλλο. Root causes found via `categorizeTrace` audit over all 9,669 active rows:

- **`'λακ'` substring ate 381 rows** ("μαΛΑΚτικό", "ανταΛΑΚτικό", "σακουΛΑΚι", "φασοΛΑΚια", "διαβοΛΑΚος"). Fixed with a new **`'='` word-boundary marker** in `buildMatcher` for short Greek tokens (`'=λακ'`, `'=μελι'` honey-vs-μελιτζάνα, `'=τζιν'` gin-vs-τζίντζερ).
- **Rule order:** new TOP-priority laundry/paper/home rule (beats 'baby'/'αρωμα'/'σαπουν'); adult-incontinence mini-rule beats Βρεφικά 'πανες' (TENA/Sani); **Προσωπική Φροντίδα moved BEFORE the food departments** (scent words — μήλο/μέλι/φράουλα/γάλα αμυγδάλου — were eating cosmetics); **Κάβα+Πρωινό before Φρούτα** (juices/ice tea land as drinks).
- **Keywords/brands added** (each evidence-backed): κτψ (kritikos frozen abbr — 40+ rows), μπιρα spelling, ρετσινα/somersby/schweppes/xixo/powerade, haribo/cheetos/lays/tsakiris/σοκοφρετ (flavour words were dragging snacks into drinks/cheese/pantry), dirollo/babybel/milner/la vache/ηπειρος (cheese brands), lurpak, πουτιγκ/danette/στραγγιστ, le petit marseillais/papoutsanis/καραβακι/γαλακτωμα σωματος; 'καρυδ'→'καρυδι' (coconut≠walnut); bare 'milk' removed from dairy (ate Body Milk); 'adoro' deliberately NOT a cheese brand (sells butter/cream too).
- **12 native aliases added** (all sampled first): Μπάνιου→Καθαρισμός, Υγρά Μαλακτικά→Καθαρισμός, Χαρτομάντηλα→Καθαρισμός, Παιδικά - Τρίγωνα→Τυριά, Πίτσες - Πεινιρλί→Κατεψ., Φύλλα - Βάσεις - Ζύμες→Κατεψ., Σαλάτες→Σαλάτες & Αλοιφές, Ελιές→Παντοπωλείο, Έτοιμα Μιξ→Παντοπωλείο, Μιλήτες→Κάβα (kritikos typo for Μηλίτες), Λειτουργικά + Υψηλής Παστερίωσης→Γαλακτοκομικά, **Latin-E 'Eνηλίκων'→Προσωπική** (mymarket suncare) while Greek-Ε 'Ενηλίκων' (kritikos puddings) stays keyword-resolved.
- **Backfill policy change** in [recompute-categories.mjs](src/scripts/recompute-categories.mjs): never demote a specific category to Άλλο (the keyword engine's Άλλο = "no signal", not evidence — preserves LLM/admin knowledge).
- **15 regression tests** in [categories.test.ts](src/lib/categories.test.ts), all real product names from the DB.
- **Backfill applied to prod DB: 1,550 + 23 rows moved.** Distribution after: Άλλο 459→290, Καθαρισμός 1276→1607, Κάβα 369→549, Φρούτα 349→223 (now actual produce). Προσωπική stays ~3.7k — that's REAL (chains' web-offer feeds genuinely skew to personal care/cleaning promos).
- Pushed same night, so nightly GH runs pick up the new engine. If any run fired between the backfill and the push, re-run `node src/scripts/recompute-categories.mjs` once (idempotent) to clean up.

### Slice ② — display-first unmatched offers (2026-06-11)

- **`Discount.chainItemcode`** (new column + `@@unique([supermarket, source, chainItemcode])`) — the chain SKU is now the offer's dedup identity; `(productId, chain, source)` is the legacy fallback.
- **[ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs):** unmatched items still go to PendingMatch but are ALSO written as visible **productless Discounts** (chain's real name/price/image/dates; comparison/history light up after matching). `ingestOffers({ showUnmatched })` defaults true; **Lidl passes `false`** (vision-OCR data unreviewed — flip after eyeballing the first real run). `IngestRun.unmatchedShown` records the count.
- **Claim, don't duplicate:** [resolve-pending-matches.mjs](src/scripts/resolve-pending-matches.mjs) + admin approve/bulk-approve/create-sku now `updateMany({...productName, productId: null} → { productId })` FIRST — claiming preserves the adapter's real dates/originalPrice (the resolver's synthetic now+14d data is legacy-path only). Single approve also applies the admin's category; bulk deliberately doesn't (would clobber adapter categories with 'Άλλο').
- **Winner-takes-row + honest snapshots (bonus bug fix):** 183 masoutis products have 2+ itemcode mappings (stale mis-matches) — the two SKUs used to alternate overwriting one row: **visible price flip-flopped between runs and every flip wrote a bogus PriceSnapshot** (polluting the honest-pricing history!). Now: first SKU per run owns the row, later ones skip (report warns with count); snapshots only write when THIS offer's stored price moved. **Verified: two back-to-back masoutis runs → second run priceChanges=0** (was 47/47 before). The 183 mis-mappings themselves still deserve an audit (samePack-based) — future task.
- **UI:** zero changes needed — OfferDetails falls back to CategoryIcon for missing images, getPriceComparison returns [] for productless, PriceComparison/PriceHistory render null on empty. Verified at 390px (offer page + listing screenshots).
- Masoutis now shows **+54 offers** immediately; mymarket/sklavenitis/ab/kritikos backlogs (~3.9k) become visible on each chain's next scheduled run — **no backfill script on purpose** (PendingMatch rows lack source/dates/itemcode; adapter re-runs write full-fidelity rows within 24h).

### Slice ① — pipeline observability (2026-06-10)

**What shipped (one commit):**
- **`IngestRun` flight recorder** — new table (db-pushed); [ingest-offers.mjs](src/scripts/lib/ingest-offers.mjs) records every real run (incl. zero-item aborts; dry runs skipped) with `priceChanges` = PriceSnapshots written that run (the per-chain "how much actually changed" signal for future cadence tuning).
- **[src/lib/pipeline-health.ts](src/lib/pipeline-health.ts)** — `EXPECTED_FEEDS` registry (7 feeds: 5 daily web + 2 weekly leaflet; **keep in sync with scrape-chains.yml + vercel.json**), pure `evaluateFeed()` → `ok|warn|stale|never` (daily=36h window, weekly=8d), `fetchFeedHealth(prisma)` shared by both consumers. 9 unit tests.
- **`/api/cron/pipeline-health`** — daily 08:00 UTC Vercel cron (after all scrape windows); raises a **Sentry error** naming each stale/never feed. `warn` (tripped safety check but fresh OK run exists) deliberately does NOT alarm — safety rails keep last-good data and it self-heals.
- **Admin "🩺 Υγεία" tab** — per-feed status pills + last-30-runs history table ([get-ingest-health.ts](src/actions/admin/get-ingest-health.ts)).

**Verified end-to-end:** zero-item abort records `healthOk:false` row (tested + cleaned up); real Masoutis web run recorded `372 scraped / 317 matched (all via mapping, 0 LLM) / 55 review / 47 priceChanges / healthOk:true`. Build green, 26 tests pass, lint unchanged (same 11 pre-existing AdminPanel items).

**Expected noise:** until each feed's next scheduled run lands, the 08:00 UTC check reports `never` for feeds with no recorded run yet (Lidl genuinely never ran — first scheduled run Thu 06:00 UTC; masoutis/leaflet runs Thu 06:30). Sentry errors on day 1–2 are start-up noise, not bugs — they stop as soon as real runs land.

**Decision made (user asked about scrape scheduling):** keep daily polling — adapters hit free chain JSON endpoints (no LLM in adapters; Groq only sees never-before-seen items via the resolver), so daily costs ~nothing. Aligning to assumed per-chain offer cycles would save nothing and risk missing mid-cycle changes; `priceChanges` per run now records each chain's real cadence so this can be revisited with data.

**Next candidates (assessment ranked):** ③ verify Lidl's first run Thu 06:00 UTC (then decide `showUnmatched` for it) + AB recon (246 active offers looks like the ΜΟΝΟ-subset problem); ④ scripts cleanup + CLAUDE.md de-drift (still documents the OLD fetcher→extractor→matcher pipeline as canonical); audit the 183 multi-itemcode mis-mappings (samePack-based); search relevance; `.js→.tsx` PR; Capacitor.

---

## ⚡ Pick up here (2026-06-11 PM — Fable 5 mobile redesign SHIPPED, local only)

**All pushed to `origin/main`** (`a4a5830`→`2bb7403`). Fable 5 executed the redesign brief with an independent re-audit first. Build green, 17 tests pass, lint 22→11 (remaining 5 errors all AdminPanel — internal tool, deliberate). Verified end-to-end at 390px with Playwright screenshots each slice.

| commit | what |
|---|---|
| `a4a5830` | **Bugs found in re-audit:** /deals price sort silently broken (server ignored `price_asc/desc` → fell back to hot); AdminPanel (~1k lines) statically imported into the public homepage bundle → `next/dynamic`; 0-offer chains hidden from /deals filter chips (counts wired from `getDealCounts`); hero-meta clip fixed + chain stat counts live chains only |
| `bcb0ac8` | **Deals-first homepage:** hero+search → Κορυφαίες προσφορές → Τελειώνουν σύντομα → promo → categories → stores. UI copy genericized to "καταστήματα" (multi-store future); SEO meta keeps "σούπερ μάρκετ" deliberately |
| `24b8d0c` | **Listings:** products above the fold on /deals + /supermarket/[id]. New reusable [Sheet.js](src/components/Sheet.js) bottom sheet; filters collapse into a Φίλτρα sheet with live count CTA; visible sort select; supermarket pages got price sorting; SortBar + StickySearch deleted |
| `c536a0d` | **Unified offer detail:** new [OfferDetails.js](src/components/OfferDetails.js) = single source for sheet + page (image, dates grid, price, qty+CTA, [PriceComparison.js](src/components/PriceComparison.js), PriceHistory). [ProductSheet.js](src/components/ProductSheet.js) (bottom sheet) replaced ProductModal everywhere; "Δεν υπάρχει διαθέσιμη περιγραφή" gone. ("WEB ONLY" is baked into chain artwork, not our UI) |
| `259ab25` | **Bottom nav** (Αρχική/Προσφορές/Αναζήτηση/Λίστα — Ειδοποιήσεις deliberately excluded while /alerts is token-gated) mounted in layout; list + /alerts empty states got explanations and CTAs |
| `5915160` | **Visual hierarchy:** 900-weight price, accent color when strikethrough exists, `.verdict-pill` class, floating 🛒 removed (clashed with nav), dead modal CSS pruned |
| `2a0f8e3` | **PWA:** manifest.webmanifest + 192/512/apple icons (rendered from the Π mark via Playwright). Installable today; Capacitor reuses assets |
| `bd0ef56` | **react-compiler clean** in consumer components: clock snapshot per mount (no `Date.now()` in render), PreferredStoresSheet mounts fresh per open, ProductSheet split outer(URL lifecycle)/inner(keyed fetch state) — **gotcha: moving pushState/`history.back()` into a keyed child broke opening in dev (StrictMode mount→cleanup→mount ran `back()` and the async popstate closed the sheet on open). URL lifecycle must live in an always-mounted component.** |

**Next candidates:** push to origin; Lidl-live + Tier-3 recon (user's chain priorities); deeper search relevance (results cluster by chain); `.js→.tsx` as its own PR; Capacitor wrap (PHASES 4.7) now has manifest/icons ready.

---

## ⚡ Pick up here (2026-06-11 — honest-pricing + category + tech-debt sprint; NEXT = Fable 5 redesign)

**5 commits, LOCAL ONLY — not yet pushed to `origin/main`** (`026002e`→`6310505`). Working tree clean. This sprint came out of an honest UX teardown the user requested (screenshots at 390px) ahead of handing the **visual/UX redesign to Fable 5**. The plan: this Opus session fixes the correctness-sensitive layers (pricing/categories/tech-debt); Fable 5 owns the mobile presentation redesign on top. See **[REDESIGN_BRIEF.md](REDESIGN_BRIEF.md)** — the constraints-heavy handoff for Fable.

| commit | what |
|---|---|
| `026002e` | Native→dept alias map (`NATIVE_ALIASES` in categories.ts) — Άλλο 12%→7% |
| `6f8b1da` | **Honest-pricing engine** — killed the false "🔥 Χαμηλότερη τιμή" badge (it judged the last cross-chain snapshot, not the offer price). `src/lib/price-verdict.ts` (pure+tested), positive-only badges, young-data guards (≥3 pts + price spread). New **`Discount.priceVerdict`** (db-pushed) precomputed by `recompute-price-verdicts.mjs` (daily in resolvers job). ~17.6% earn a badge. |
| `2a34e52` | Latin/English-name keyword pass — Άλλο 7%→**4.7%** (carroten/hansaplast/misko/raid/χρωμοπαγιδ + processed-tomato + hair-oil alias fix) |
| `0081576` | Tech-debt: Outfit via `next/font` (removed 3 render-blocking `<link>`s), SearchDropdown `<img>`→`next/image`, config named exports. Lint 22→16. |
| `6310505` | `REDESIGN_BRIEF.md` for Fable 5 + gitignore `screenshots/` |

**Next:** kick off Fable 5 on REDESIGN_BRIEF.md (deals-wall homepage, modal→bottom-sheet, dead-chain filters, bottom nav, empty states). Deliberately NOT done by Opus: the 9 react-compiler setState-in-effect/purity "errors" (conventional patterns / redesign-bound — listed in the brief for Fable to avoid in the rewrites) and the `.js→.tsx` migration (separate PR, after redesign). User dropped the standalone dead-chain/sort task — it folds into Fable's redesign.

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
Άλλο ≈ **733 (~7%)** after the native→department alias map (2026-06-11), down from ~1,216. 17 departments populated, audit reports **0 Latin-substring leaks**, Κατοικίδια/Κάβα verified clean. `audit-categories.mjs` is the tool to re-check after any keyword edit.

**Native→department alias map (2026-06-11).** [src/lib/categories.ts](src/lib/categories.ts) now has `NATIVE_ALIASES` — ~95 of the chains' own category labels mapped straight to departments, applied as a high-precision step BEFORE keyword matching. Keys are normalized at load (write labels verbatim). It both rescues Άλλο rows AND fixes name-keyword misfires (e.g. "Γαλάκτωμα"/"Body Milk" body-lotions were stuck in dairy via the `γαλα` stem; "Καθαρισμός Προσώπου" face-cleanser was in Καθαρισμού; denture care was in Αρτοποιία). Only UNAMBIGUOUS labels included — polysemous ones (Λευκά, Υγρό, Ενηλίκων, Pants, Γεμιστά, Multipack) deliberately fall through to name matching. Backfilled, idempotent. `categorizeTrace` reports `via:'native-alias'`.

**Latin/English-name keyword pass (2026-06-11).** Άλλο **733 → 471 (~4.7%)**. Added the brand/product tokens the Greek-centric lists missed on null-native chains (masoutis/sklavenitis/ab name-only): suncare/cosmetics (`carroten`,`hansaplast`,`wellaflex`,`noxzema`,`septona`,`after shave`), cleaning (`χρωμοπαγιδ`,`σκοροκτον`,`λευκαντικ`,`colour catcher`,`raid`,`airwick`,`softex`,`sanitas`), pasta/pantry (`misko`,`knorr`,`penne`,`φιδες`,`κριθαρακ`), processed tomato (`pummaro`,`τοματα τριμ/ψιλοκομ/περαστ`), seafood (`θραψαλο`,`γαμπαρ`), `babycare`, `ψωμακ`, `κερασ`. All Latin singles stay word-bounded (audit: 0 leaks). Also moved hair-oil natives ("Λάδι / Μάσκα", "Λάδια, Serum, Θεραπείες") into the alias map → Προσωπική (the `λαδι` cooking-oil keyword was eating them). **Still open:** scent/brand-word traps remain for a handful (`αρωμα`→cosmetics catches scented insecticides; `frozen`→Κατεψυγμένα catches Disney-Frozen kids items) — low volume, native-alias is the lever if it grows.

### Honest-pricing engine (2026-06-11)
[src/lib/price-verdict.ts](src/lib/price-verdict.ts) — pure, tested `computeVerdict(currentPrice, prices[])` → `{verdict, min, max, avg, percentAboveMin}`. **The cardinal rule it fixed:** the verdict judges the price the shopper actually sees (the offer's `discountedPrice`), NOT the last snapshot in the series. The series is cross-chain, so its last point could be another store's price — that produced false "🔥 Χαμηλότερη τιμή" badges on offers that were actually the most expensive they'd ever been (the 7.73€-vs-6.99€ bug). Guards for **young-data honesty**: no verdict under 3 points or on a flat history (no spread = "just the price", not a deal). **Positive-only surfacing** (product decision): only `lowest`/`good` ever render a badge (`isPositiveVerdict`); mediocre prices stay silent, the factual low/avg line always shows. ~17.6% of offers earn a badge (was a dishonest 71% before the guards).
- **Live** path: [get-price-history.ts](src/actions/get-price-history.ts) takes `currentPrice`; [ProductModal.js](src/components/ProductModal.js) + offer [page.js](src/app/offer/[id]/page.js) pass the offer price; [PriceHistory.js](src/components/PriceHistory.js) renders positive-only.
- **Card** path: new `Discount.priceVerdict String?` (db-pushed), precomputed by [recompute-price-verdicts.mjs](src/scripts/recompute-price-verdicts.mjs) (daily, last step of the `resolvers` job, after recompute-hotness). [DiscountCard.js](src/components/DiscountCard.js) shows the green pill for positive verdicts only. New rows stay null (no badge) until the nightly pass; detail/modal always compute live.

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
