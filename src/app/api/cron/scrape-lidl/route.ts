import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { aiExtractionSchema } from '@/lib/validations/ai-extraction';
import * as Sentry from '@sentry/nextjs';
import sharp from 'sharp';

export const maxDuration = 300;

const FLYERS_API = 'https://endpoints.leaflets.schwarz/v4/flyers';
const FLYER_API = 'https://endpoints.leaflets.schwarz/v4/flyer';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const STORE_NAME = 'Lidl';
const SM_ID = 'lidl';

const EXTRACTION_PROMPT = `You are analyzing a supermarket leaflet page. Enumerate EVERY individual priced product tile on the page.
Do NOT skip, summarize, group, or merge products. A single flyer page typically contains 6–15 separate product tiles — list all of them.
If a tile shows multiple variants (e.g. "apple / pear"), emit one entry per variant only if each has its own price; otherwise one entry for the combined tile.
Return a JSON object with a single key "discounts" whose value is an array of offers.
Each offer must have:
- productName (string, required — the product as printed, in Greek)
- discountedPrice (number, required, in euros — the large/final price shown)
- originalPrice (number, optional — the crossed-out price if visible)
- discountPercent (number, optional — e.g. 30 for "-30%")
- category (string, optional — one of: Κρέας & Ψάρι, Γαλακτοκομικά, Φρούτα & Λαχανικά, Αρτοποιία, Κατεψυγμένα, Ροφήματα, Σνακ & Γλυκά, Είδη Καθαριότητας, Προσωπική Φροντίδα, Άλλο)
- description (string, optional — weight, pack size, brand qualifier)
Use plain numbers (1.99 not "1,99€"). Return only the JSON object, no prose.`;

async function fetchImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const buffer = await sharp(input)
    .resize({ width: 768, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { buffer, mimeType: 'image/jpeg' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGroqWithRetry(
  imageBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  maxRetries = 5
) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0,
      }),
    });

    if (response.ok) return response;

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0;
      const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 2_000 * 2 ** attempt);
      if (wait > 120_000) throw new Error(`Rate limit: retry-after ${wait}ms — daily cap likely hit`);
      console.log(`[LIDL] 429, backing off ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(wait);
      attempt++;
      continue;
    }

    const body = await response.text().catch(() => '');
    throw new Error(`Groq returned ${response.status}: ${body.slice(0, 200)}`);
  }
}

async function extractPageDeals(imageUrl: string, apiKey: string) {
  const { buffer, mimeType } = await fetchImageBuffer(imageUrl);
  const response = await callGroqWithRetry(buffer, mimeType, apiKey);
  const json = await response.json();
  const raw = json.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  const array = Array.isArray(parsed) ? parsed : parsed.discounts || parsed.offers || [];

  const validated: any[] = [];
  let rejected = 0;
  for (const item of array) {
    const r = aiExtractionSchema.safeParse(item);
    if (r.success) validated.push(r.data);
    else rejected++;
  }
  console.log(`[LIDL] page ${imageUrl.slice(-24)} — raw:${array.length} valid:${validated.length} rejected:${rejected}`);
  return validated;
}

async function discoverCurrentFlyer(flyerIdentifier?: string) {
  if (flyerIdentifier) {
    const res = await fetch(
      `${FLYER_API}?flyer_identifier=${flyerIdentifier}&region_id=0`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Flyer API returned ${res.status}`);
    const data = await res.json();
    return data.success ? data.flyer : null;
  }

  const res = await fetch(
    `${FLYERS_API}?locale=el-GR&client=lidl%2Fel-GR&region_id=0&status=current`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Flyers list API returned ${res.status}`);
  const data = await res.json();
  const flyers: any[] = data.flyers || data.items || [];
  return flyers.find((f: any) => f.status === 'current') || flyers[0] || null;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const flyerIdentifier = searchParams.get('flyer_identifier') ?? undefined;
  const force = searchParams.get('force') === 'true';

  try {
    const flyer = await discoverCurrentFlyer(flyerIdentifier);
    if (!flyer) {
      return NextResponse.json({ success: true, message: 'No current flyer found', count: 0 });
    }

    const validFrom = new Date(flyer.offerStartDate || flyer.startDate);
    const validUntil = new Date(flyer.offerEndDate || flyer.endDate);

    const store = await prisma.store.upsert({
      where: { name: STORE_NAME },
      update: {},
      create: { name: STORE_NAME },
    });

    const existing = await prisma.leaflet.findFirst({
      where: { storeId: store.id, validFrom },
    });
    if (existing && !force) {
      return NextResponse.json({
        success: true,
        message: 'Flyer already processed',
        leafletId: existing.id,
        count: 0,
      });
    }
    if (existing && force) {
      await prisma.discount.deleteMany({ where: { leafletId: existing.id } });
      await prisma.leaflet.delete({ where: { id: existing.id } });
    }

    const pages: any[] = flyer.pages || [];
    const pageImages = pages.map((p: any) => p.image).filter(Boolean);

    const leaflet = await prisma.leaflet.create({
      data: {
        title: flyer.title || flyer.name,
        validFrom,
        validUntil,
        pageImages,
        storeId: store.id,
      },
    });

    let totalCount = 0;
    let failedPages = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      let deals: any[] = [];
      try {
        deals = await extractPageDeals(page.image, apiKey);
      } catch (err: any) {
        failedPages++;
        console.error(`[LIDL] Page ${i + 1}/${pages.length} failed:`, err?.message);
        continue;
      }

      for (const deal of deals) {
        try {
          await prisma.discount.create({
            data: {
              storeId: store.id,
              leafletId: leaflet.id,
              supermarket: SM_ID,
              productName: deal.productName,
              category: deal.category || 'Άλλο',
              discountedPrice: Number(deal.discountedPrice),
              originalPrice: deal.originalPrice ?? null,
              discountPercent: deal.discountPercent ?? null,
              description: deal.description ?? null,
              validFrom,
              validUntil,
              isActive: true,
            },
          });
          totalCount++;
        } catch (err: any) {
          console.error('[LIDL] Insert failed:', err?.message);
        }
      }

      await sleep(5000);
    }

    revalidateTag('deals:default', 'max');

    return NextResponse.json({
      success: true,
      flyer: flyer.name,
      pages: pages.length,
      failedPages,
      count: totalCount,
      leafletId: leaflet.id,
    });
  } catch (error: any) {
    Sentry.captureException(error);
    console.error('[LIDL] Fatal:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
