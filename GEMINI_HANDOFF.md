# Handoff Spec — Monetization-Prep Features

> Paste this entire document to Gemini before asking it to do anything. Then give it features one at a time in the order listed.

---

## PART 0 — CONTEXT GEMINI MUST READ FIRST

You are working inside an existing Next.js 16 project called **prosforespantou-next**. It is a Greek supermarket discount aggregator. Your job is to add four small monetization-prep features without breaking what already works.

### Stack (exact versions — do not assume older APIs)
- **Next.js 16.2.2** with **Turbopack** (not Webpack). Turbopack caches compiled modules in `.next/`.
- **Prisma 7** (client 7.7.0) using the **Driver Adapter** pattern (`@prisma/adapter-pg`). Do NOT use the legacy `new PrismaClient()` signature — check [src/lib/prisma.ts](src/lib/prisma.ts) to see the current constructor.
- **PostgreSQL** (Neon).
- **React 19** with the new Server Actions model (`'use server'` directive at top of file).
- **Sentry** wraps every server action via `Sentry.withServerActionInstrumentation`.
- **Zod** for input validation.
- **Zustand** for client state (see [src/lib/store.js](src/lib/store.js)).
- No Tailwind — uses plain CSS (`globals.css`) plus inline `style={{}}` objects.
- Project root contains `AGENTS.md` which says: *"This is NOT the Next.js you know. Read `node_modules/next/dist/docs/` before writing any code."* Obey that if you hit an API you aren't sure about.

### Windows-specific
- User is on Windows 11 but running commands through **Git Bash**. Use forward slashes in paths and Unix shell syntax. `rm -rf` works. `NUL` does not — use `/dev/null`.

### Files you must read before touching anything
Read these in order. Do not skip.
1. `AGENTS.md` and `CLAUDE.md` — project rules.
2. `prisma/schema.prisma` — current data model.
3. `src/lib/prisma.ts` — how the client is instantiated.
4. `src/lib/constants.js` — supermarket list, categories.
5. `src/lib/session.ts` — `requireAdmin()` helper pattern.
6. `src/actions/admin/create-discount.ts` — canonical example of a server action (Zod + Sentry + revalidateTag).
7. `src/actions/admin/leaflet-actions.ts` — another example with list/delete patterns.
8. `src/components/AdminPanel.js` — the admin UI you will extend.
9. `src/components/DiscountCard.js` — the public card where click tracking attaches.
10. `src/app/page.tsx` and `src/components/HomeClient.js` — homepage entry.
11. `src/app/supermarket/[id]/page.tsx` and `src/components/SupermarketClient.js` — per-supermarket page.

### House rules (non-negotiable)
- **Do not** run `prisma migrate`. This project uses `npx prisma db push` only (no migration history). After schema changes, run: `npx prisma db push && npx prisma generate && rm -rf .next`.
- **Do not** edit `prisma/schema.prisma` without then running the three commands above. Forgetting `prisma generate` produces the infamous "Unknown argument" runtime error. Forgetting `rm -rf .next` leaves Turbopack serving a stale client.
- **Do not** create new Prisma client instances. Always `import prisma from '@/lib/prisma'`.
- **Do not** use `fetch('/api/...')` from server components. Call the server action directly.
- **Do not** add API routes under `app/api/` for features that can be server actions. Server actions only.
- **Do not** use `revalidatePath`. Use `revalidateTag('tagName', 'max')` — this project already tags reads with specific strings. Match the existing tag names.
- **Do not** add new npm dependencies without checking `package.json` first to see if something equivalent exists.
- **Do not** edit `.env` or `.env.local`. If you need a new env var, tell the user what to add and where.
- **Always** wrap server actions in `Sentry.withServerActionInstrumentation('actionName', { recordResponse: true }, async () => { ... })`.
- **Always** call `await requireAdmin()` at the top of any admin-only action.
- **Always** return `{ success: true, ... }` or `{ success: false, error: '...' }` — never throw across the server/client boundary.
- **Always** validate with Zod at the action boundary.
- **Never** commit secrets. Never log full request bodies in production.
- **Comments**: write almost none. Only if WHY is non-obvious. Never leave "// added for feature X" comments — they rot.

### How to verify the stack is alive before you start
```bash
npm run dev
```
Open `http://localhost:3000`. If the homepage renders and you can click into a supermarket page and see deals, you're good. If anything errors, fix the environment before writing new code.

---

## FEATURE 1 — CLICK TRACKING (priority 1, do this first)

### Why
The user plans to pitch supermarkets for partnership/ad money. The pitch needs data: *"Your store got N clicks last month vs competitor's M."* Without tracking, there is nothing to sell. Everything else depends on this data existing, even retroactively.

### What counts as a "click"
Three events for v1:
1. **deal_click** — user clicks a discount card to open its modal (or the card's primary CTA).
2. **leaflet_click** — user clicks the leaflet link on a supermarket page.
3. **list_add** — user adds a discount to their shopping list.

Everything else (search, scroll, hover) — skip for v1.

### Data model

Add to `prisma/schema.prisma`:

```prisma
model ClickEvent {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventType   String   // "deal_click" | "leaflet_click" | "list_add"
  supermarket String   // slug e.g. "lidl", "ab", "sklavenitis"
  discountId  String?  @db.Uuid
  leafletId   String?  @db.Uuid
  category    String?
  sessionId   String?  // anonymous client-generated UUID from localStorage
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([supermarket, createdAt])
  @@index([eventType, createdAt])
  @@index([createdAt])
}
```

Then run (from Git Bash, in project root):
```bash
npx prisma db push
npx prisma generate
rm -rf .next
```

### Server action
Create `src/actions/track-event.ts`:

```ts
'use server';

import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

const schema = z.object({
  eventType: z.enum(['deal_click', 'leaflet_click', 'list_add']),
  supermarket: z.string().min(1).max(32),
  discountId: z.string().uuid().optional(),
  leafletId: z.string().uuid().optional(),
  category: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
});

export async function trackEvent(input: unknown) {
  return await Sentry.withServerActionInstrumentation('trackEvent', { recordResponse: false }, async () => {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false };

      const h = await headers();
      const userAgent = h.get('user-agent')?.slice(0, 256) ?? null;

      await prisma.clickEvent.create({
        data: { ...parsed.data, userAgent },
      });
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false };
    }
  });
}
```

Note: **do not** revalidate any tags here — this is write-only telemetry, not user-visible state.

### Client wiring

**Session ID helper** — create `src/lib/session-id.js`:
```js
export function getSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('sid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sid', id);
  }
  return id;
}
```

**In [src/components/DiscountCard.js](src/components/DiscountCard.js)** — find where the card is clicked (probably an onClick that opens a modal via `onSelect`). Fire-and-forget the track:
```js
import { trackEvent } from '@/actions/track-event';
import { getSessionId } from '@/lib/session-id';

// inside the onClick that opens the modal:
trackEvent({
  eventType: 'deal_click',
  supermarket: deal.supermarket,
  discountId: deal.id,
  category: deal.category,
  sessionId: getSessionId(),
}).catch(() => {});
```

Do NOT `await` it. Do NOT block the UI.

**In [src/components/SupermarketClient.js](src/components/SupermarketClient.js)** (or wherever the leaflet link lives) — on click of the leaflet link:
```js
onClick={() => {
  trackEvent({
    eventType: 'leaflet_click',
    supermarket: sm.id,
    leafletId: leaflet.id,
    sessionId: getSessionId(),
  }).catch(() => {});
}}
```

**In [src/lib/store.js](src/lib/store.js)** inside the Zustand `addItem` action, or in the caller that invokes `addItem` — fire `list_add` with the supermarket of the item. Pick ONE place so you don't double-count. The caller (e.g., DiscountCard's "+" button) is usually cleaner.

### Admin dashboard view

Add an "Αναλυτικά" tab to [src/components/AdminPanel.js](src/components/AdminPanel.js) showing:
- Total events per supermarket in the last 7 / 30 days (two columns).
- Breakdown by event type (deal_click, leaflet_click, list_add).
- Simple HTML table. No charts in v1.

Create the fetching action `src/actions/admin/get-stats.ts`:
```ts
'use server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import * as Sentry from '@sentry/nextjs';

export async function getStats() {
  try {
    await requireAdmin();
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 86400000);
    const d30 = new Date(now.getTime() - 30 * 86400000);

    const rows = await prisma.clickEvent.groupBy({
      by: ['supermarket', 'eventType'],
      where: { createdAt: { gte: d30 } },
      _count: { _all: true },
    });

    const rows7 = await prisma.clickEvent.groupBy({
      by: ['supermarket', 'eventType'],
      where: { createdAt: { gte: d7 } },
      _count: { _all: true },
    });

    return { success: true, last30: rows, last7: rows7 };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: 'Internal server error', last30: [], last7: [] };
  }
}
```

Render the tab so each supermarket gets one row. Columns: 7d deal_click, 7d leaflet_click, 7d list_add, 30d totals same three. Sort by 30d total deal_click descending.

### Verification for Feature 1
- [ ] `npx prisma studio` opens and `ClickEvent` table is visible.
- [ ] Click a discount card on the homepage → row appears in `ClickEvent` within 1–2 seconds.
- [ ] Click a leaflet link → row appears.
- [ ] Add a product to shopping list → row appears. Exactly one row, not two.
- [ ] Admin panel → Αναλυτικά tab renders the table without errors, and clicks you just made appear in the counts.
- [ ] Network tab in browser devtools: the track request does NOT block navigation (card click should feel instant).
- [ ] Kill the DB / disable network mid-click — the UI should NOT error or show a loading spinner. Track failures must be silent.
- [ ] Run `npm run build` — build must succeed with zero new errors.

### Do's & Don'ts for Feature 1
- **Do** fire-and-forget (`.catch(() => {})`). Never `await` a tracking call in an onClick.
- **Do** store `sessionId` so you can deduplicate later ("unique sessions" is a more honest metric than "total clicks").
- **Don't** store IP addresses, full user agents longer than 256 chars, or anything that could be considered PII under GDPR. Greece is in the EU.
- **Don't** add a cookie banner yet — you're not setting cookies, and localStorage for a random UUID is generally considered functional, not tracking, under GDPR. But consult a lawyer before going public.
- **Don't** build charts. A boring table is enough for the pitch deck. Add charts after you have a first paying partner.

---

## FEATURE 2 — FEATURED / SPONSORED SLOTS

### Why
Once Feature 1 gives you numbers, you can sell placement. A supermarket pays → their deal pins to the top of a carousel / category page for N days. You need the *infrastructure* for this now so the first sales conversation can become a real contract quickly.

### Data model
Add to the existing `Discount` model in `prisma/schema.prisma`:
```prisma
  isFeatured     Boolean   @default(false)
  featuredUntil  DateTime?
  featuredLabel  String?   // optional override, e.g. "Χορηγούμενο" (sponsored) vs "Επιλογή μας"
```

Then run the usual trio: `npx prisma db push && npx prisma generate && rm -rf .next`.

### Server-side changes

**In [src/app/page.tsx](src/app/page.tsx)** and wherever `getTopDeals` / `getEndingSoonDeals` live: prepend featured (current and not-expired) deals before normal sorting. Cap the featured injection at 2 per carousel so the organic ranking still breathes.

Example pseudocode for a "top deals" action:
```ts
const now = new Date();
const featured = await prisma.discount.findMany({
  where: {
    isActive: true,
    isFeatured: true,
    OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }],
    validUntil: { gt: now },
  },
  include: { store: true, leaflet: true, product: true },
  orderBy: { createdAt: 'desc' },
  take: 2,
});

const normal = await prisma.discount.findMany({ /* existing query */ take: limit - featured.length });
const seen = new Set(featured.map((d) => d.id));
return [...featured, ...normal.filter((d) => !seen.has(d.id))];
```

### UI
In [src/components/DiscountCard.js](src/components/DiscountCard.js), when `deal.isFeatured` is true, render a small chip on the card (top-left or top-right) with the text from `featuredLabel ?? 'Χορηγούμενο'`. Use a subtle style — a small rounded badge in the supermarket's brand color, not a loud banner. Trust that users can handle seeing it.

### Admin UI
In the admin panel's discount create/edit form:
- Add a toggle: "Προβεβλημένη προσφορά".
- When on, show two inputs: `featuredUntil` (date) and `featuredLabel` (text, optional).
- Default label suggestion: "Χορηγούμενο" if label blank.

Also add a filter in the admin discount list: "Μόνο προβεβλημένες". This lets you quickly audit what's currently sponsored.

### Verification for Feature 2
- [ ] Mark one discount as featured (via admin). Homepage "Κορυφαίες εκπτώσεις" shows it first with a badge.
- [ ] Set `featuredUntil` to yesterday → it disappears from featured but remains as a normal deal.
- [ ] Featured flag on a discount that is `isActive: false` → does NOT appear (featured does not override inactive).
- [ ] Admin list filter "Μόνο προβεβλημένες" shows only featured.
- [ ] Click tracking still records clicks on featured items (they should, since you just marked a flag; no other logic changes).

### Do's & Don'ts for Feature 2
- **Do** keep the featured chip *visually honest*. You want partners to pay precisely because users see the chip.
- **Do** expire featured automatically via `featuredUntil`. Never rely on remembering to turn it off.
- **Don't** let featured dominate every carousel — cap at 2 per carousel, max 1 per category.
- **Don't** let featured bypass the `validUntil > now` filter. An expired deal must never appear even if featured.
- **Don't** mix "editorially curated" (your pick) and "paid" into the same flag later. If you need that distinction, split into `isFeatured` (paid) + `isEditorialPick` (free). For v1 one flag is enough.

---

## FEATURE 3 — EMAIL CAPTURE / NEWSLETTER

### Why
Email list is the single most durable monetization asset. Even if traffic drops, you can sell newsletter placement or send users back to the site. Capture now so by the time you have supermarket partners, you already have a list.

### Data model
```prisma
model Subscriber {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email          String    @unique
  confirmedAt    DateTime?
  confirmToken   String    @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  unsubToken     String    @unique @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  source         String?   // "homepage_footer" | "shopping_list" | etc
  preferredStores String[] // optional supermarket slugs
  createdAt      DateTime  @default(now())
  unsubscribedAt DateTime?
}
```

Run the trio: `npx prisma db push && npx prisma generate && rm -rf .next`.

### Server actions — create `src/actions/subscribe.ts`
```ts
'use server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import * as Sentry from '@sentry/nextjs';

const schema = z.object({
  email: z.string().email().max(254),
  source: z.string().max(64).optional(),
  preferredStores: z.array(z.string()).optional(),
});

export async function subscribe(input: unknown) {
  return await Sentry.withServerActionInstrumentation('subscribe', { recordResponse: false }, async () => {
    try {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { success: false, error: 'Μη έγκυρο email' };

      const email = parsed.data.email.toLowerCase().trim();
      const existing = await prisma.subscriber.findUnique({ where: { email } });
      if (existing && existing.confirmedAt) return { success: true, alreadyConfirmed: true };

      const sub = await prisma.subscriber.upsert({
        where: { email },
        update: {
          source: parsed.data.source,
          preferredStores: parsed.data.preferredStores ?? [],
          unsubscribedAt: null,
        },
        create: {
          email,
          source: parsed.data.source,
          preferredStores: parsed.data.preferredStores ?? [],
        },
      });

      // TODO: send confirmation email via Resend/Postmark/SES.
      // Use sub.confirmToken in the confirm link.
      // Do NOT send any marketing email until confirmedAt is set.

      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false, error: 'Κάτι πήγε στραβά' };
    }
  });
}
```

### Confirmation & unsubscribe routes

Create `src/app/subscribe/confirm/page.tsx` — reads `?token=...`, sets `confirmedAt = now()` for the matching subscriber, shows a success message.

Create `src/app/subscribe/unsubscribe/page.tsx` — reads `?token=...`, sets `unsubscribedAt = now()`, shows confirmation.

Both should be regular server components — no auth needed, but only the exact token works.

### Email sending
For v1, do NOT pick a provider yet. Just save the subscriber and log the confirmation URL to the server console. The user will decide between Resend, Postmark, or SES later. Tell them clearly in a comment where the send should happen.

### UI
- Small form in the site footer (`SiteHeader.js` probably handles layout; if there's no footer component, create `Footer.js`): email input + "Εγγραφή" button + GDPR-style microcopy: *"Θα σου στέλνουμε τις κορυφαίες προσφορές της εβδομάδας. Άκυρο οποτεδήποτε."*
- Optional: second capture point — after adding 3+ items to the shopping list, a subtle inline prompt in [src/components/ShoppingList.js](src/components/ShoppingList.js): *"Θέλεις την εβδομαδιαία λίστα με τις κορυφαίες προσφορές;"*

### Admin UI
Add a "Συνδρομητές" tab showing count confirmed vs pending, and a button to export CSV (email,source,confirmedAt,preferredStores).

### Verification for Feature 3
- [ ] Submit valid email → DB row created with `confirmedAt: null` and a `confirmToken`.
- [ ] Visit `/subscribe/confirm?token=...` with that token → `confirmedAt` becomes set.
- [ ] Submit same email twice → no duplicate; `alreadyConfirmed: true` is returned on second attempt if already confirmed.
- [ ] Visit `/subscribe/unsubscribe?token=...` → `unsubscribedAt` set.
- [ ] Submit `notanemail` → friendly error, no DB row.
- [ ] Admin Συνδρομητές tab shows counts and CSV export works.

### Do's & Don'ts for Feature 3
- **Do** double opt-in (confirmation email before adding to marketing list). EU law requires it in practice.
- **Do** include a working unsubscribe link in every email you ever send. Token-based, one-click.
- **Do** lowercase + trim every email on save.
- **Don't** send any marketing before `confirmedAt` is set.
- **Don't** store plaintext unsubscribe reasons. If you add a "why unsubscribed?" flow later, store categorical enums only.
- **Don't** import subscribers from anywhere else. Only people who confirmed on your site.

---

## FEATURE 4 — PRICE / PRODUCT ALERTS (optional, do last)

### Why
Retention + email list growth side-effect. When a user says *"tell me when γάλα δέλτα is on offer"*, you have both a reason to email them and a reason for them to return. Only build this after email capture works, because alerts need email delivery.

### Data model
```prisma
model Alert {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  subscriberId   String    @db.Uuid
  keyword        String    // normalized lowercase
  supermarkets   String[]  // empty = any
  category       String?
  maxPrice       Decimal?  @db.Decimal(10, 2)
  isActive       Boolean   @default(true)
  lastTriggeredAt DateTime?
  createdAt      DateTime  @default(now())
  subscriber     Subscriber @relation(fields: [subscriberId], references: [id], onDelete: Cascade)

  @@index([isActive, keyword])
}
```

Add back-relation on `Subscriber`: `alerts Alert[]`.

Run the trio.

### Matcher
When a new `Discount` is created (inside [src/actions/admin/create-discount.ts](src/actions/admin/create-discount.ts), after the successful create), run a matcher:

```ts
async function fireAlertsFor(discount) {
  const name = discount.productName.toLowerCase();
  const alerts = await prisma.alert.findMany({
    where: { isActive: true, subscriber: { confirmedAt: { not: null }, unsubscribedAt: null } },
    include: { subscriber: true },
  });
  const matched = alerts.filter((a) => {
    if (!name.includes(a.keyword.toLowerCase())) return false;
    if (a.supermarkets.length && !a.supermarkets.includes(discount.supermarket)) return false;
    if (a.category && a.category !== discount.category) return false;
    if (a.maxPrice && Number(discount.discountedPrice) > Number(a.maxPrice)) return false;
    const recently = a.lastTriggeredAt && (Date.now() - a.lastTriggeredAt.getTime()) < 6 * 3600000;
    if (recently) return false;
    return true;
  });
  for (const a of matched) {
    // queue email send here — do NOT block the action on it
    await prisma.alert.update({ where: { id: a.id }, data: { lastTriggeredAt: new Date() } });
  }
}
```

Call `fireAlertsFor(created).catch(() => {})` after the `prisma.discount.create(...)`. Fire-and-forget. Do not block the admin save.

### UI
- Public page `/alerts` (or a drawer) where a confirmed subscriber manages their alerts: keyword input, supermarket multi-select (optional), category (optional), max price (optional). List of existing alerts with delete buttons.
- Gate on `confirmedAt` — unconfirmed subscribers see "confirm your email first".
- Use the subscriber's confirmToken as the auth mechanism for alert management URLs (`/alerts?token=...`). This avoids needing full auth.

### Verification for Feature 4
- [ ] Create alert with keyword "γάλα" for a confirmed subscriber.
- [ ] Admin creates a discount with productName "Φρέσκο γάλα ΔΕΛΤΑ 1L" → alert's `lastTriggeredAt` updates.
- [ ] Creating a second matching discount within 6 hours does NOT re-trigger (cooldown works).
- [ ] Unconfirmed subscriber's alert does NOT trigger.
- [ ] Unsubscribed user's alert does NOT trigger.
- [ ] Admin save latency is unchanged — the alert matcher runs in the background.

### Do's & Don'ts for Feature 4
- **Do** cooldown per alert (suggest 6 hours) so a user doesn't get 8 emails when you bulk-import deals.
- **Do** match case-insensitively and without Greek accents (normalize both sides with `.normalize('NFD').replace(/\p{Diacritic}/gu, '')`).
- **Don't** let the matcher block `createDiscount`. If matcher is slow, admin UI freezes. Always fire-and-forget.
- **Don't** build notification preferences (daily digest vs instant) in v1. Instant with cooldown is enough.

---

## PART 5 — GENERAL DO'S AND DON'TS

### Code style
- **No new comments** unless the WHY is non-obvious. Never write `// added for click tracking`. The commit message + git blame carries that.
- **No trailing summaries** in commit messages like "this file was modified to add tracking". Say *why* in 1–2 lines.
- **No backwards compatibility shims** for code you're replacing. Delete old code cleanly.
- **No try/catch that just re-throws**. Either handle or let it propagate.

### Git
- After each of the 4 features, make ONE commit. Commit message format:
  ```
  Short imperative title under 60 chars

  - Bullet 1 of what changed at a high level
  - Bullet 2
  - Bullet 3

  Co-Authored-By: Gemini <noreply@google.com>
  ```
- Do NOT push without explicit user approval.
- Do NOT create a branch unless asked.

### Database safety
- `prisma db push` is not reversible via `prisma` — if you add a column and regret it, you must manually drop it with SQL or with a second `db push` after editing the schema. Before pushing, make sure the schema change is actually what you want.
- Never `DROP TABLE` or delete rows without the user's explicit OK.

### Testing philosophy
- This project has minimal automated tests. Your verification is: build succeeds (`npm run build`), dev server runs cleanly (`npm run dev`), each feature's manual checklist passes.
- If you add tests, use the patterns already present in the repo. Do not introduce a new test framework.

### If you get stuck
- Read the actual files in `node_modules/next/dist/docs/` and `node_modules/@prisma/client/` before guessing at an API.
- If a Prisma error says "Unknown argument X", run `npx prisma generate && rm -rf .next && npm run dev`. 90% of the time that fixes it.
- If a change doesn't appear in the browser, you forgot `rm -rf .next`. Turbopack caches aggressively.
- If `requireAdmin()` throws in an action, the session cookie has expired — log in again through the admin UI.

### What NOT to touch
- `src/lib/prisma.ts` — working Prisma 7 driver-adapter setup. Don't "improve" it.
- `next.config.ts` / `next.config.mjs` — works with Turbopack. Don't change loaders.
- `AGENTS.md` / `CLAUDE.md` — read them, don't edit them.
- `.env*` files.
- `prisma/migrations/` — should be empty or near-empty; do not create migrations.

---

## PART 6 — FINAL VERIFICATION CHECKLIST (run after ALL 4 features)

Run in order:
```bash
npx prisma generate
rm -rf .next
npm run build
```
Build must succeed.

```bash
npm run dev
```

Manually verify in the browser:
- [ ] Homepage renders, supermarket tiles show, carousels populate.
- [ ] Click a discount card → modal opens → ClickEvent row created.
- [ ] Click a leaflet link on `/supermarket/lidl` → ClickEvent row created.
- [ ] Add deal to list → ClickEvent row created.
- [ ] Admin → Αναλυτικά tab → numbers match what you just clicked.
- [ ] Mark a discount as featured for 7 days → appears with chip on homepage carousel.
- [ ] Footer email form → submit → subscriber row created.
- [ ] Confirm via `/subscribe/confirm?token=...` → `confirmedAt` set.
- [ ] Create an alert → admin creates matching discount → `lastTriggeredAt` updates.
- [ ] No new console errors in browser devtools.
- [ ] No new Sentry errors (check Sentry dashboard if configured).
- [ ] Lighthouse performance score has not dropped more than 5 points on the homepage.

If anything fails, STOP and diagnose. Do not "fix" by bypassing checks.

---

## PART 7 — SUGGESTED PROMPT TO GEMINI

Start your Gemini session with this single prompt:

> I'm going to give you a 10-page handoff document for adding four features to an existing Next.js 16 / Prisma 7 project. Before you write any code:
>
> 1. Read the document end-to-end.
> 2. Read the files it tells you to read (numbered list in Part 0).
> 3. Confirm back to me: which files you read, what's currently in the Discount model, how server actions are wrapped, and what the Prisma client import looks like. Do NOT start coding until you've done this and I've confirmed.
>
> Then I'll tell you to start on Feature 1. Do features one at a time, commit between each. Do not start a feature until the previous one passes its verification checklist.

Then paste this entire document.

Then, after Gemini confirms understanding, say: **"Start Feature 1."** Wait for it to finish and verify before saying **"Start Feature 2."**

---

End of handoff.
