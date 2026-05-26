# Adapter contract

Every supermarket has its own **adapter** — a small script that knows how to
read offers off *one* chain's website. This file is the rule all adapters obey.

The point: adapters are different (each chain's site is different), but they all
hand back the **same shape**. Everything downstream (matching to the canonical
catalog, writing Discounts, deactivating stale rows, health checks) is shared
code in [`../lib/ingest-offers.mjs`](../lib/ingest-offers.mjs) and is never
written per-chain. When a chain breaks, you fix one adapter file — nothing else.

## What an adapter does

1. Fetch the chain's current offers (HTTP/JSON, HTML scrape, or PDF/OCR).
2. Map each offer onto the item shape below.
3. Call `ingestOffers(...)` with the result. Done.

An adapter must NOT touch the database itself. It only produces data.

## The payload

```js
import { ingestOffers } from '../lib/ingest-offers.mjs';

await ingestOffers({
  chain: 'masoutis',        // chain slug — see SM_MAPPING in ingest-offers.mjs
  source: 'web',            // 'web' | 'leaflet'  (which feed this came from)
  items: [ /* OfferItem[] — see below */ ],
  dryRun: false,            // optional — true = no DB writes, just report
});
```

## OfferItem

| Field           | Required | Notes |
|-----------------|----------|-------|
| `name`          | ✅       | Product name as the chain prints it. |
| `price`         | ✅       | Current offer price, in euros (e.g. `1.29`). |
| `chainItemcode` | ✅       | The chain's own internal SKU/id. Stable identity — lets re-runs skip matching. If the chain truly has no id, use the barcode or a slug of the name. |
| `barcode`       | ⚠️ strongly preferred | GTIN/EAN. This is what links the offer to the canonical catalog. Without it the item falls back to fuzzy matching → Review Queue. |
| `originalPrice` | optional | Strikethrough/"before" price. `null` for ΜΟΝΟ-style single-price offers — that's normal, not an error. |
| `brand`         | optional | |
| `unit`          | optional | "1 L", "650 g" — for per-unit price display. |
| `category`      | optional | Chain's category name. Defaults to `Άλλο`. |
| `imageUrl`      | optional | Used for the Review Queue when matching fails. |
| `validFrom`     | optional | ISO date. Defaults to run time. |
| `validUntil`    | optional | ISO date. Defaults to run time + 14 days. |
| `offerType`     | optional | `'strikethrough'` \| `'mono'` \| `'multibuy'` — diagnostic only. |

## What the shared pipeline does with it (so adapter authors know)

For each item, in order — first hit wins:

1. **`ChainProductMapping` lookup** `(chain, chainItemcode)` → known Product. Instant, no matching.
2. **`Product.barcode` lookup** → canonical Product. Records a `ChainProductMapping` so step 1 hits next time.
3. **`MatchCache` lookup** `(name, chain)` → Product matched by a previous LLM run.
4. **No match** → row goes to the `PendingMatch` Review Queue. The pipeline never
   invents a Product. (The LLM matcher is a separate, optional pass over the queue.)

Then it writes/updates the `Discount`, writes a `PriceSnapshot` if the price moved,
and at the end deactivates that chain's stale offers for this `source` —
**unless the health check tripped** (see below).

## Safety rules baked into the shared pipeline

- **Zero items → abort.** An adapter returning `[]` is treated as "scrape broke",
  not "no offers this week". Nothing is deactivated; last-good data stays live.
- **Suspiciously low count → keep old data.** If this run has far fewer items
  than the chain's current active offers, deactivation is skipped and a warning
  is raised.
- **Soft delete only.** Stale offers get `isActive = false`, never deleted.
- **Per-chain isolation.** Deactivation filters by `(supermarket, source)`, so a
  Masoutis run can never touch AB's rows, and a `web` run never touches `leaflet`.
