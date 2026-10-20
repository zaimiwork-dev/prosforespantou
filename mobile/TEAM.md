# Engineering handbook — the app team

How work gets done on the Android app (`mobile/`). Read this, then
[AGENTS.md](AGENTS.md) (Expo changes every release — check the docs, never memory),
then [../APP_PLAN.md](../APP_PLAN.md).

## Roles

- **Owner (CEO):** product decisions, anything costly or irreversible, weekly test on a real phone.
- **Lead (Claude Opus):** architecture, tickets, reviews every diff, runs the checks, merges.
- **Engineers (Claude Sonnet agents):** one ticket each, in an isolated git worktree. Commit to your branch. **Never push, never merge** — report back; the lead reviews and merges.

## Ground rules

1. **Stay in your ticket's files.** The ticket lists them. Do not edit the website (`../src/`), the API, `src/lib/api.ts`, `src/lib/lists.ts`, `src/components/deal-card.tsx`, `src/components/chip.tsx`, the layouts or `app.json` unless the ticket says so. Need a change there? Say so in your report.
2. **Data comes only from `src/lib/api.ts`** (`api.home/meta/deals/search/offer`). The response types live there; the card shape is `DealCard` from the server's contract `../src/lib/api/deal-card.ts` — read its header.
3. **Every offer is drawn with `DealCardView`** (`src/components/deal-card.tsx`). It opens the product page on tap by default. Chips are `Chip` (`src/components/chip.tsx`). Chain names/colours: `useChains()` (`src/lib/chains.ts`). Lists of offers go through `arrangeDeals` / `dedupeCards` (`src/lib/lists.ts`) — the website's own ordering.
4. **Look:** colours, sizes and spacing only from `src/constants/theme.ts`. The audience is elderly and 40+: text from `Type` (never smaller than `Type.caption`), touch targets at least 44 px, plenty of contrast.
5. **Words:** all UI text in Greek, plain and short. **No emoji anywhere.** Icons only as line glyphs.
6. **Every screen has four states:** loading, content, empty (with a way out — e.g. clear filters), and error (Greek message + «Δοκίμασε ξανά»). Network calls use an `AbortController` and are cancelled when inputs change or the screen unmounts. No `setState` synchronously inside `useEffect` (the linter enforces it).
7. **Accessibility:** buttons get `accessibilityRole` and a Greek `accessibilityLabel` when the text alone is unclear; selected chips set `accessibilityState`.
8. **No new dependency** unless the ticket allows it — and then only with `npx expo install <pkg>` (SDK-matched versions), justified in your report.
9. **Comments say why, not what.** Match the surrounding style.
10. **Windows:** the Bash tool mangles backslashes in heredocs. Create and edit files with the Write/Edit tools.

## Before you report — all of these, every time

Run in `mobile/` of your worktree (run `npm install` there first; `node_modules` is not shared between worktrees):

1. `npx tsc --noEmit` — zero errors.
2. `npx expo lint` — zero errors.
3. `npx expo export --platform android --output-dir ../.local-scratch/<TICKET>/export` — must succeed.
4. **Look at your screen.** `CI=1 npx expo start --web --port <your ticket's port>` (background), then screenshot it at 390×844 with Playwright from the main checkout: `import { chromium } from 'file:///C:/Users/Work/prosforespantou-next/node_modules/playwright/index.mjs'`. Save PNGs to `../.local-scratch/<TICKET>/`, open them, and fix what looks wrong — overlaps, cut text, empty areas, wrong colours. Exercise the states (filters, empty, error). Note: in the browser preview the native tabs render at the TOP and can cover a title; that is the web renderer only — on Android they are at the bottom.
5. **Stop your Expo server and prove it.** A server left running locks your worktree folder so it cannot be deleted (two of three week-2 engineers left one running while reporting it stopped). In PowerShell: `Get-NetTCPConnection -LocalPort <port> -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`, then confirm `Get-NetTCPConnection -LocalPort <port> -State Listen` returns nothing, and say so in your report.
6. **Screenshots must show the final code.** Retake any screenshot after the last change that affects it; a stale one costs the reviewer a re-check.

The preview talks to the live API (`https://prosforespantou.gr/api/v1/…`), which allows browser origins. Do not create `mobile/.env.local` pointing at localhost and leave it behind.

## Your report (final message)

- What you built, file by file.
- How you verified it: the four checks above with their results, and the screenshot paths.
- Anything you could not do, any decision you made that the lead should review, any change you need outside your files.

## Commit

One commit on your branch: `feat(app): <what> (APP-2xx)`, a short body saying what and why. The lead re-reads the diff before merging.
