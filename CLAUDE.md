# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## At the start of EVERY new session — read these before responding

Before answering the user's first message in a new conversation, read **both** of these in this order:

1. [CONTEXT.md](CONTEXT.md) — especially the `## ⚡ Pick up here` section at the top. This is the live state of the project: what shipped, what's in flight, what to do next, what bit us recently. The "Pick up here" section is rewritten regularly and is the single source of truth for current status.
2. The pickup-state memory file linked from `MEMORY.md` (a short mirror of "Pick up here" for quick recall).

Skipping this step is the #1 way a new session goes wrong — you'll miss in-flight pivots, recent architectural decisions, "Do NOT" rules added because of recent incidents, and which file to work on next. It costs ~5 seconds to read and prevents large mistakes.

If the user's first message is a trivial chat ("hi", "what time is it"), you can skip — but if they're asking about the project or want to do any work, read CONTEXT.md first, then respond.

## Read these before non-trivial work

- [CONTEXT.md](CONTEXT.md) — current state of the system: schema, conventions, what shipped vs what's in flight. Updated regularly.
- [PHASES.md](PHASES.md) — forward-looking roadmap with explicit exit criteria and "Do NOT" rules per phase. Phase 4 in particular encodes architectural invariants (source isolation, multi-source coexistence) that the codebase enforces.
- [README.md](README.md) — high-level intro, prerequisites, dev setup.

If you're making schema or data-pipeline changes, read PHASES.md first — there are several "Do NOT" rules that exist because of past incidents.

## Common commands

```bash
# Dev / build / lint / test
npm run dev          # next dev (Turbopack)
npm run build        # prisma generate && next build — this is the project's green-build gate
npm run lint         # eslint
npm run test:run     # vitest (one-shot)

# Database (no migrations directory — push only)
npx prisma db push && npx prisma generate && rm -rf .next   # after editing schema.prisma
```

After a `db push` you MUST `rm -rf .next` — Next caches the generated Prisma client and stale references will surface as obscure runtime errors.

## Ingestion pipeline (three stages)

The Masoutis pipeline is the canonical example; other supermarkets follow the same shape.

```bash
# Web (subitem=1, "Προσφορές Εβδομάδας")
node src/scripts/fetchers/masoutis.mjs              # Playwright → library_data/masoutis_web_YYYY-MM-DD.html
node src/scripts/extractors/masoutis-web.mjs        # Cheerio → pending_masoutis_deals.json
node src/scripts/matchers/groq-matcher.mjs          # Groq Llama-4 + DB writes (default SOURCE=web)

# Leaflet (subitem=2, "Προσφορές Φυλλαδίου")
node src/scripts/fetchers/masoutis-leaflet.mjs
node src/scripts/extractors/masoutis-leaflet.mjs    # filters to items with real originalPrice
SOURCE=leaflet INPUT_FILE=./pending_masoutis_leaflet_deals.json node src/scripts/matchers/groq-matcher.mjs
```

Matcher env vars: `SOURCE` (`web`|`leaflet`|`manual`), `INPUT_FILE`, `LIMIT` (smoke-test mode — skips deactivation), `PACE_MS`. Three matcher backends exist: `groq-matcher.mjs` (recommended — fast, free tier), `ollama-matcher.mjs` (local Gemma 4, slow), `gemini-matcher.mjs` (currently blocked by free-tier quota = 0 on user's key).

## Architecture invariants

**Discount.source field.** Every `Discount` row is tagged `'web' | 'leaflet' | 'manual'`. Every read/write that scopes to a pipeline MUST filter by source. Cross-source contamination is the #1 risk per PHASES.md. The matcher's `findFirst`, `update`, `create`, and end-of-run `updateMany` all use `source: SOURCE`. The Lidl cron route writes `source: 'leaflet'`.

**Multi-source coexistence.** A single `Product` can have multiple active `Discount` rows (one per source). The public UI is expected to group by `productId` and render both source tags on a single card. Don't dedupe at the data layer.

**Soft delete only.** Discounts are deactivated via `isActive: false`, never deleted. ClickEvent + PriceSnapshot history depend on this.

**Driver-adapter Prisma.** [src/lib/prisma.ts](src/lib/prisma.ts) uses `PrismaPg` + `pg.Pool` over `DATABASE_URL` (port 6543, pgbouncer). Migrations use `DIRECT_URL` (5432). Never write `new PrismaClient()` anywhere — the adapter is required for serverless cold-start safety.

**dotenv ordering in scripts.** ESM hoists imports above `dotenv.config()`. In `src/scripts/*.mjs` files that touch the DB, do NOT `import prisma` at the top — load dotenv first, then `const { default: prisma } = await import('../../lib/prisma.ts')`. The matchers all follow this pattern.

## Server actions

All actions live in `src/actions/`. Admin-only actions live in `src/actions/admin/`. Conventions enforced project-wide:

1. Wrap every action body in `Sentry.withServerActionInstrumentation('actionName', { recordResponse: bool }, async () => { ... })`.
2. Validate input with Zod (`safeParse`); return `{ success: false, error }` on validation failure rather than throwing.
3. Admin actions call `await requireAdmin()` (see [src/lib/session.ts](src/lib/session.ts)) before any DB work — JWT cookie via jose.
4. After DB writes that affect listings, call `revalidateTag('deals:default', 'max')` (and `revalidateTag('offer:${id}', 'max')` if relevant).
5. Public actions that accept untrusted input also call `checkRateLimit` from [src/lib/rate-limit.ts](src/lib/rate-limit.ts).

`subscribe.ts` and `track-event.ts` are good examples of public-facing actions. `delete-discount.ts` and `set-featured.ts` are good examples of admin actions.

## Cron routes

`src/app/api/cron/*/route.ts` — auth via `Authorization: Bearer ${CRON_SECRET}`. Vercel injects this header on scheduled runs. The Wolt cron is currently a 501 stub (route exists, body returns "not implemented" with a hint pointing at PHASES.md Phase 4). The Lidl cron uses Groq vision (`meta-llama/llama-4-scout-17b-16e-instruct`) for OCR'ing flipbook page images.

## Frontend

Components are `.js` (not `.tsx`) — the project hasn't migrated. Don't convert during unrelated work; do it as a focused PR. Styling is vanilla CSS (`globals.css`) plus inline styles. Tailwind is installed but its use is restricted to experimental areas.

## Things that have bitten people

- **Schema field renames without `db push + rm -rf .next`** → runtime errors that look like "column not found".
- **Forgetting `source` filter** → leaflet run wipes web rows or vice versa. There are explicit "Do NOT conflate" warnings in PHASES.md for a reason.
- **Mixing Product counts with Discount counts on `/catalog`** → owner caught this on 2026-06-14. Full-catalog mode must use Product counts/filtering; offer mode must use active public Discount counts/filtering. Lidl is the canary: `152` products vs `71` offers.
- **Importing prisma before dotenv in `.mjs` scripts** → ECONNREFUSED because `DATABASE_URL` isn't loaded yet.
- **Auto-creating SKUs from the matcher's "NEW" verdict** → polluted catalog. The Review Queue (Admin Panel "🧐 Review" tab) is the manual gate; matcher only routes, never creates products.
- **Pipe stdout through `tail` to monitor a long-running script** → buffering hides progress until exit. Redirect to a log file (`> matcher.log 2>&1`) and tail the file separately.

## When to update CONTEXT.md / PHASES.md

After any change that affects:
- Schema fields or invariants
- A pipeline's inputs/outputs/scripts
- Server action contracts
- Phase 4 status (ingestion / matching)

The user maintains these docs as the source of truth — a session that ships pipeline work without updating them creates drift that costs the next session 30+ minutes to reconcile.
