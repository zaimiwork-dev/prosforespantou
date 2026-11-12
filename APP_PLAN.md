# Android app — plan and schedule

Owner decisions, 2026-10-20:
- **A real native app, not the website in a frame.** Built with **Expo (React Native)** in a new `mobile/` folder. It reads the same database through a new public JSON API; the scrapers, matching, comparisons and price history are unchanged.
- **Google Play first.** iOS later from the same codebase (Apple Developer, $99/yr, when the owner decides).
- Order stays: **app first, then marketing** (see CONTEXT.md row 41).
- **Name: «Προσφορές Παντού»** (store title, nothing appended). **Application ID `gr.prosforespantou.app`** — permanent once on Play. Search terms («σούπερ μάρκετ», «σύγκριση τιμών») go in the short description (80 chars, indexed). Researched 10-20: the name is free on Play; «Καλάθι» is taken twice (one a ministry app); the government's **PosoKanei** (`gr.gov.posokanei`, 50K+ downloads, **2.6★**, barcode + basket comparison, launched June 2026) is the real competitor; «προσφορές σούπερ μάρκετ» search results are mostly games plus Kimbino (leaflets, 4.6★).
- **Look:** same colours, type and icon style as the site, laid out as a native app — bottom tabs Αρχική / Προσφορές / Αναζήτηση / Λίστα, native scrolling and back gesture. No emoji.
- **No login at launch** — list, favourites and settings live on the device, as on the web.
- **Team:** Claude (Opus) leads — architecture, tickets, review of every diff, merges. Sonnet 5 agents implement tickets in isolated worktrees, 2–3 at a time. Week 1 (API + scaffold) is built by the lead; agents start in week 2.

This replaces PHASES.md Phase 4.7 (the June Capacitor plan). Why not Capacitor: it wraps the live site (Apple rejects that under guideline 4.2), iOS builds need a Mac, and the owner wants a real app.

## Status (update with every merge)

**Week 1 — done 2026-10-20 (lead).**
- App API v1 live on production: `GET /api/v1/home`, `/deals`, `/meta`, `/search`, `/offers/:id` (`src/app/api/v1/`). Contract: `src/lib/api/deal-card.ts` — additive-only within v1. CDN-cached 5 min; any origin may read (public data; needed by the browser preview).
- `mobile/`: Expo SDK 58 app, root Stack over native tabs (Αρχική / Προσφορές / Αναζήτηση / Λίστα), home screen on live data, cards open `/offer/[id]`. Shares the website's pure rules via `@shared/*` → `../src/lib` (Metro watchFolders). The website's tsc/eslint/vitest exclude `mobile/`; Vercel ignores it.
- Engineering handbook for the agents: [mobile/TEAM.md](mobile/TEAM.md).
- Repo needs `git config core.longpaths true` on Windows (a 260+ char file in `public/wolt_images/` broke worktree creation).

**Week 2 — done 2026-10-20 (engineers, Sonnet 5, isolated worktrees; lead reviewed and merged):**

| Ticket | Scope | Merged | Review notes |
|---|---|---|---|
| APP-201 | Προσφορές tab: chain / department / sort chips, infinite 2-column grid, website ordering via `arrangeDeals` | `1715e31` | Clean. 27 sequential pages, no duplicates. Cosmetic: chain chip row keeps its scroll offset after «Καθαρισμός φίλτρων». |
| APP-202 | Αναζήτηση tab: debounced search, suggestions, session recents, chain filter | `1391f43` | Clean. Engineer kept one FlatList so the field never remounts (keyboard stays up). |
| APP-203 | Product page: price block, honest dates, comparison incl. shelf rows, 90-day chart (react-native-svg), leaflet link, similar | `972ec5c` | Engineer corrected the ticket (no invented «Έναρξη»). Lead fixed: tied cheapest prices both tagged «Φθηνότερα». |

**Found during review — data/search, not the app (fix on the server, benefits the website too):**
- Search ranks condensed milk (ΝΟΥΝΟΥ ΣΥΜΠΥΚΝΩΜΕΝΟ) above fresh milk for «γάλα» (`src/lib/search-rank.ts`).
- Lidl items mis-filed under «Φρούτα & Λαχανικά» (e.g. «Donut μήλο», a frozen VEGETERRA product) — category mapping for Lidl rows.

**Week 3 — 2026-11-04 (engineers, lead reviewed and merged):**

| Ticket | Scope | Merged | Review notes |
|---|---|---|---|
| APP-301 | Λίστα tab: on-device list grouped by chain with subtotals, qty, tick, share text (website wording); favourites (website's key rule); «Στη λίστα» + heart on product page; persisted recents | `66e44c3` | Lead fixed: «Έληξε» only when `datesFromSource` (our +14-day default is not an end date). Favourite tap opens a search (live offers), by design. |
| APP-302 | Settings (text size via `useType()`, my stores), 3-step onboarding with equal-weight consent, `Stack.Protected` gate, analytics client (nothing sent before «Αποδοχή») | `223345d` | Clean. «Τα καταστήματά μου» merges per-chain `/deals` pages client-side — ordering approximate across pages until `/deals` takes `chain=a,b`. No event on rejection (stricter than the web). |

Also: `POST /api/v1/events` (lead) live; EAS project linked (`@sigmax99/prosfores-pantou`); first preview APK build queued 11-04.

**Lead follow-ups:** wire `list_add/list_remove/favorite/unfavorite/search` events; pass `position` from list/search cards; convert list/search/offer screens to `useType()`; `/deals?chain=a,b`.

**Owner's phone is an iPhone (11-05).** The preview APK (`eas build --profile preview`) is for Android only. The owner follows progress on the **web build**: `npx expo export --platform web --output-dir dist` then `npx eas-cli deploy` (preview URL `prosfores-pantou--<id>.expo.app`; send the new URL after each change). Owner reconfirmed **Android first**; a borrowed Android phone covers Play Console device verification and real-device tests.

**Redesign — 2026-11-05 (owner: «make it look like the site's landing page, but better»).** Design study of 14 apps → [mobile/DESIGN.md](mobile/DESIGN.md) (owner approved; price format «0,83 €» everywhere). Done: WEB-01 (website prices «0,83 €», shared `src/lib/format-price.ts`), APP-401 (Inter + Noto Serif Display, type roles in `useType().text`, `formatPrice`, new offer card with badge strip and round «+», tab bar pill + Λίστα badge), lead: `DealCard.sticker` (chain sticker text, additive) and full chain names on cards. Merged: APP-402 home (landing-page layout, chain strip, rails, banner, category grid; `useChains()` now carries `.error/.retry`), APP-403 (one «Φίλτρα» row + bottom sheet, `chain=a,b`, settings/onboarding with chain logo tiles), APP-404 (product page, Trolley-style comparison, list, search `?focus=1`, list/favourite/search events). Lead: `?sort=` on Προσφορές; card chain line under the photo and «+» on the photo corner. Web preview for the owner: `npx eas-cli deploy` (non-prod). Note: `expo lint` can report stale `import/no-unresolved` after installs — `npx eslint src` is the reliable check.

**Lead review 2026-11-10 (Fable took over as lead).** Read every screen and lib file. Verdict: the architecture is sound and should stay — thin typed client over the shared `DealCard` contract, module stores on `useSyncExternalStore`, Stack over tabs, four states per screen, AbortControllers, accessibility labels, large-text scaling, consent gating, honest dates. Design now matches the site. **The one gating risk: the app has never been executed on Android** — every check was `expo export` plus the web preview; NativeTabs, `Stack.Protected`, fonts, keyboard, safe areas and FlatList performance are unverified on the target. No emulator on the dev PC (adb only; 15 GB RAM, HyperV on → install cmdline-tools + emulator, ~5 GB). Gaps ranked: (1) run on Android; (2) no offline cache — supermarkets have bad signal, home/deals should show the last good response with a stale banner; (3) no crash reporting before testers (Sentry); (4) favourites are name+chain → search, not a product watch; `push_tokens` table exists, app never registers; (5) list promises «σε ποιο κατάστημα» but only shows per-chain subtotals; (6) no catalogue screen (owner asked 11-05); (7) icon/splash are still the Expo template chevron; (8) no Android App Links for prosforespantou.gr/offer/:id. Housekeeping (APP-405): duplicate `/meta` fetch in deals.tsx, unused template deps (expo-glass-effect, @expo/ui, expo-symbols, expo-device, expo-system-ui, expo-linking, gesture-handler, reanimated, worklets), `platform` hard-coded 'android', no fetch timeout, share text uses 2-letter chain codes, list footer copy contradicts itself, home errors when only /meta fails, `scripts/reset-project.js`, zero unit tests for lib logic.

**Wave 1 — 2026-11-12 (after the owner's 11-10 brief; findings in CONTEXT.md START HERE).**

| Ticket | Scope | Merged | Review notes |
|---|---|---|---|
| SRV-01 | `src/lib/price-timeline.ts` + `timeline` on `/api/v1/offers/:id` | `140e39e` | Lead fixed a build break (type re-export from a 'use server' file) and added `reliable` + the foreign-point rule after checking 42 live offers. |
| lead | `GET /api/v1/feed`, `POST /api/v1/impressions` | `7c4cc0c` | Live: 21 rails, 209 cards, 0 duplicates. Pools balanced per chain. |
| APP-500a | `useApi` + cache + stale banner, timeout, housekeeping, 8 unused deps removed | `b651014` | `expo-linking` had to stay (expo-router peer). expo-doctor reports patch-level drift vs SDK 58 — not yet fixed. |
| APP-500b | skeletons, toast + undo, haptics, card tag, recently-viewed, interest profile, impressions queue | `12a4460` | Tag wraps to two lines instead of cutting the number. After merging with 500a three test files failed to parse → `test/react-native-stub.ts`. |

**Wave 2 — merged 2026-11-13:**

| Ticket | Scope | Merged | Review notes |
|---|---|---|---|
| APP-501 | Home = the server's feed: sticky search, category chips, chain strip, «Είδες πρόσφατα», 21 rails virtualised, impressions per rail, skeletons, offline | `eaf03ef` | Clean. `stickyHeaderIndices={[1]}` (index 0 pins the header) — web only, unverified on Android. |
| APP-502 | Product page v2: price history on `timeline` (stepped shelf line, promo dots, range chips, drag marker, facts in words), signals, skeleton, comparison empty state | `b3671d2` | Lead fixed: facts dated from their own first observation (it printed «από Απρίλιο» for a shelf price first read in November); `/api/v1/offers/:id` no longer lists the offer's own chain as a rival. |

Web preview for the owner (11-13): https://prosfores-pantou--kol3qace2m.expo.app

**Still unverified on Android (nothing has run on a device or emulator):** NativeTabs, sticky header, toast position above the tab bar, haptics, drag on the chart, FlatList smoothness with 21 rails. Owner decision on the emulator install is pending.

**Next app tickets:** APP-503 search suggestions + category browse; list intelligence («όλη η λίστα στο ΑΒ vs στον Σκλαβενίτη»); icon + splash (still the Expo template); Sentry.

**Next:** Play internal test → closed test opens (needs the owner's Play Console account — postponed by the owner on 11-04).

## The one constraint that sets the calendar

A **new personal Google Play account must run a closed test with at least 12 testers, opted in for 14 days in a row, before it can apply for production.** (Organisation accounts are exempt but need a registered business and a D-U-N-S number.) So the plan starts the 14-day clock as early as possible — with a basic but working build at the end of week 3 — and keeps improving the app during the test (updates are allowed; testers must stay opted in).

## Schedule (weeks start Monday)

| Week | Dates | Owner | Claude |
|---|---|---|---|
| 1 | Oct 20–26 | Create Google Play Console account ($25, ID verification). Create a free Expo account. Start collecting 12 testers' Gmail addresses (Android phones). Install **Expo Go** on your phone. | Public read API v1 (`/api/v1/…`: deals, search, product, comparison, chains, categories, weekly essentials) on the existing queries, with tests. Scaffold `mobile/` (Expo, Greek, large type). Home screen on real data, viewable in Expo Go. |
| 2 | Oct 27–Nov 2 | Try the app in Expo Go, send feedback (screenshots are fine). | Offers list with filters, search, product page (cross-chain comparison, price history), chain pages. |
| 3 | Nov 3–9 | Confirm all 12 testers. Approve app name, icon direction. | Shopping list (offline, on the device), favourites, settings (text size, my stores), first-run onboarding, in-app consent screen + the same analytics events as the web. **First Android build (EAS) → Play internal test → closed test opens: 14-day clock starts ~Nov 9.** |
| 4 | Nov 10–16 | Create a free Firebase project (guided) for Android push. Testers install and open the app. | Push notifications (device tokens table, watched-product alerts from the nightly ingest). Barcode scanner (camera → product → where it is cheapest). Ship update to testers. |
| 5 | Nov 17–23 | Review store listing text and screenshots. Answer the data-safety questions with Claude. | Polish: accessibility (big text, contrast, touch targets), offline and error states, crash reporting (Sentry), icon, splash, feature graphic, Greek listing draft, privacy policy section for the app. Ship update. |
| 6 | Nov 24–30 | Keep testers using it; collect what they say. **14 days complete ~Nov 23 → apply for production access** (Google asks how the test went). | Fix tester feedback. Final release build. Content-rating questionnaire, data-safety form, listing — submitted with the owner. |
| 7 | Dec 1–7 | Watch for Google's decision (usually days; can ask for more testing). | Answer review findings. **Production release** as soon as access is granted. |
| 8+ | Dec 8 → | Marketing starts. | Watch crash reports and store reviews; weekly updates. iOS when the owner opens an Apple account. |

Realistic launch window: **early December**; mid-December if Google asks for more testing.

## Store paperwork checklist (Google Play)

- App name, short description (80 chars), full description — Greek.
- Icon 512×512, feature graphic 1024×500, at least 2 phone screenshots.
- Privacy policy URL (`/aporrito`, with an app section added).
- **Data safety form** — must match what the app really collects (analytics events, the optional profile, push tokens). Inaccurate forms get apps removed, so it is filled against the code, not from memory.
- Content rating (IARC questionnaire), target audience, ads declaration (no ads).
- Production-access application after the closed test.

## What stays the same

Database, scrapers, matching, Review Queue, comparisons, price history, the website. The app is a second front end. Every rule in CLAUDE.md / PHASES.md still applies to the API (Zod at the boundary, rate limits, `Discount.source` isolation, public queries hide expired offers).
