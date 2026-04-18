import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { revalidateTag } from 'next/cache';

const SM_MAPPING = {
  ab: 'AB Vassilopoulos',
  lidl: 'Lidl',
  sklavenitis: 'Σκλαβενίτης',
  mymarket: 'My Market',
  masoutis: 'Μασούτης',
  bazaar: 'Bazaar',
  kritikos: 'Κρητικός',
  marketin: 'Market In',
};

function extractItems(json) {
  if (Array.isArray(json?.sections)) return json.sections.flatMap((s) => s.items || []);
  if (Array.isArray(json?.items)) return json.items;
  const nested = json?.props?.pageProps?.initialState?.venue?.menu?.categories;
  if (Array.isArray(nested)) return nested.flatMap((c) => c.items || []);

  let found = [];
  const visit = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v) && v.length > 0 && v[0]?.name && v[0]?.baseprice !== undefined) {
      found = v;
      return;
    }
    if (Array.isArray(v)) v.forEach(visit);
    else Object.values(v).forEach(visit);
  };
  visit(json);
  return found;
}

function computeWoltId(rawItem, supermarketId) {
  if (rawItem.id) return String(rawItem.id);
  const slug = rawItem.name
    .substring(0, 50)
    .replace(/[^a-z0-9\u0370-\u03FF]/gi, '-')
    .toLowerCase()
    .replace(/-+/g, '-');
  return `wolt-${supermarketId}-${slug}`;
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    
    if (!isCron) {
      await requireAdmin();
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { json, supermarketId, category: globalCategory } = body;
  if (!json || !supermarketId) {
    return NextResponse.json({ error: 'JSON payload and supermarketId are required' }, { status: 400 });
  }

  const targetStoreName = SM_MAPPING[supermarketId];
  if (!targetStoreName) {
    return NextResponse.json({ error: 'Unknown supermarketId' }, { status: 400 });
  }

  try {
    const store = await prisma.store.upsert({
      where: { name: targetStoreName },
      update: {},
      create: { name: targetStoreName },
    });

    const rawItems = extractItems(json);
    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 422 });
    }

    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Collect unique woltIds and prepare data
    const itemMap = new Map();
    for (const raw of rawItems) {
      if (!raw?.name) continue;
      const wId = computeWoltId(raw, supermarketId);
      // Keep only one (the last one found) to avoid duplicate key issues in the map
      itemMap.set(wId, {
        woltId: wId,
        name: raw.name,
        description: raw.description || null,
        imageUrl: raw.images?.[0]?.url || raw.image_url || null,
        supermarket: supermarketId,
        storeId: store.id,
        // Carry over original data for discount processing
        _raw: raw
      });
    }

    const allWoltIds = Array.from(itemMap.keys());

    // 2. Identify existing products
    const existingProducts = await prisma.product.findMany({
      where: { woltId: { in: allWoltIds } },
      select: { id: true, woltId: true }
    });

    const existingWoltIds = new Set(existingProducts.map(p => p.woltId));
    
    const productsToCreate = [];
    const productsToUpdate = [];

    for (const [wId, data] of itemMap.entries()) {
      const { _raw, ...productData } = data;
      if (existingWoltIds.has(wId)) {
        productsToUpdate.push(productData);
      } else {
        productsToCreate.push(productData);
      }
    }

    // 3. Bulk Create Products
    if (productsToCreate.length > 0) {
      await prisma.product.createMany({
        data: productsToCreate,
        skipDuplicates: true
      });
    }

    // 4. Update Products (Sequential but only for existing ones)
    // Usually a small portion of the batch
    for (const p of productsToUpdate) {
      await prisma.product.update({
        where: { woltId: p.woltId },
        data: {
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          supermarket: p.supermarket,
        }
      });
    }

    // 5. Re-fetch all products to get IDs for discounts
    const dbProducts = await prisma.product.findMany({
      where: { woltId: { in: allWoltIds } },
      select: { id: true, woltId: true, name: true }
    });

    const dbProductMap = new Map(dbProducts.map(p => [p.woltId, p]));

    // 6. Fetch latest price snapshots for these products
    const latestSnapshots = await prisma.priceSnapshot.findMany({
      where: { productId: { in: dbProducts.map(p => p.id) } },
      distinct: ['productId'],
      orderBy: { recordedAt: 'desc' }
    });

    const latestPriceMap = new Map(latestSnapshots.map(s => [s.productId, s.price]));

    // 7. Identify existing active discounts
    const existingDiscounts = await prisma.discount.findMany({
      where: { 
        productId: { in: dbProducts.map(p => p.id) },
        isActive: true
      }
    });

    const existingDiscountMap = new Map(existingDiscounts.map(d => [d.productId, d]));

    const discountsToCreate = [];
    const discountsToUpdate = [];
    const snapshotsToCreate = [];
    let count = 0;

    for (const [wId, itemData] of itemMap.entries()) {
      const dbProduct = dbProductMap.get(wId);
      if (!dbProduct) continue;

      const raw = itemData._raw;
      if (raw.discountedPrice === undefined || raw.discountedPrice === null) continue;

      const discPrice = parseFloat(raw.discountedPrice);
      if (!Number.isFinite(discPrice)) continue;

      // Handle Price History
      const lastPrice = latestPriceMap.get(dbProduct.id);
      if (lastPrice === undefined || Math.abs(lastPrice - discPrice) > 0.001) {
        snapshotsToCreate.push({
          productId: dbProduct.id,
          supermarket: supermarketId,
          price: discPrice,
          isDiscounted: raw.originalPrice !== undefined && raw.originalPrice !== null,
          recordedAt: now
        });
      }

      const origPrice = raw.originalPrice ? parseFloat(raw.originalPrice) : null;
      const cat = raw.category || globalCategory || 'Άλλο';

      const existingDisc = existingDiscountMap.get(dbProduct.id);

      if (existingDisc) {
        discountsToUpdate.push({
          id: existingDisc.id,
          data: {
            productName: dbProduct.name,
            category: cat,
            discountedPrice: discPrice,
            originalPrice: origPrice,
            description: itemData.description,
            validUntil: nextWeek,
          }
        });
      } else {
        discountsToCreate.push({
          productName: dbProduct.name,
          category: cat,
          discountedPrice: discPrice,
          originalPrice: origPrice,
          description: itemData.description,
          validFrom: now,
          validUntil: nextWeek,
          storeId: store.id,
          supermarket: supermarketId,
          productId: dbProduct.id,
          isActive: true,
        });
      }
      count++;
    }

    // 8. Bulk Create Discounts & Snapshots
    if (discountsToCreate.length > 0) {
      await prisma.discount.createMany({
        data: discountsToCreate
      });
    }

    if (snapshotsToCreate.length > 0) {
      await prisma.priceSnapshot.createMany({
        data: snapshotsToCreate
      });
    }

    // 9. Update Discounts (Sequential)
    for (const d of discountsToUpdate) {
      await prisma.discount.update({
        where: { id: d.id },
        data: d.data
      });
    }

    revalidateTag('deals:default', 'max');
    return NextResponse.json({ success: true, count, failures: [] });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[IMPORT] Fatal:', error);
    return NextResponse.json({ error: 'Import failed: ' + error.message }, { status: 500 });
  }
}
