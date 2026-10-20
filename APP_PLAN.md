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

**Week 2 — in progress (engineers, Sonnet 5, isolated worktrees):**

| Ticket | Scope | Files | Status |
|---|---|---|---|
| APP-201 | Προσφορές tab: chain / department / sort chips, infinite 2-column grid, website ordering via `arrangeDeals` | `(tabs)/deals.tsx`, `components/deals/` | in progress |
| APP-202 | Αναζήτηση tab: debounced search, suggestions, session recents, chain filter | `(tabs)/search.tsx`, `components/search/` | in progress |
| APP-203 | Product page: price block, honest dates, comparison incl. shelf rows, 90-day chart (react-native-svg), leaflet link, similar | `offer/[id].tsx`, `components/offer/` | in progress |

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
