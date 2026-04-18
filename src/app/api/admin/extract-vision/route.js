import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { aiExtractionArraySchema } from '@/lib/validations/ai-extraction';
import { revalidateTag } from 'next/cache';
import * as Sentry from "@sentry/nextjs";

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

const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const requestSchema = z.object({
  image: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('data:image/'), 'Image must be a data URL'),
  supermarketId: z.string().refine((id) => id in SM_MAPPING, 'Unknown supermarketId'),
});

const EXTRACTION_PROMPT = `You are analyzing a supermarket leaflet image. Extract every visible discount offer you can see.
Return a JSON object with a single key "discounts" whose value is an array of offers.
Each offer must have:
- productName (string, required)
- discountedPrice (number, required, in euros)
- originalPrice (number, optional)
- discountPercent (number, optional)
- category (string, optional — one of: Κρέας & Ψάρι, Γαλακτοκομικά, Φρούτα & Λαχανικά, Αρτοποιία, Κατεψυγμένα, Ροφήματα, Σνακ & Γλυκά, Είδη Καθαριότητας, Προσωπική Φροντίδα, Άλλο)
- description (string, optional)
Return only the JSON object, no prose.`;

function approximateDataUrlBytes(dataUrl) {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return 0;
  const base64 = dataUrl.slice(commaIdx + 1);
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(req) {
  try {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    }

    const { image, supermarketId } = parsed.data;
    if (approximateDataUrlBytes(image) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image exceeds 5MB limit' }, { status: 413 });
    }

    let aiResponse;
    try {
      aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_VISION_MODEL,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: EXTRACTION_PROMPT },
                { type: 'image_url', image_url: { url: image } },
              ],
            },
          ],
        }),
      });
    } catch (err) {
      Sentry.captureException(err);
      console.error('[EXTRACT] Groq fetch failed:', err?.message);
      return NextResponse.json({ error: 'Vision API unreachable' }, { status: 502 });
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text().catch(() => '');
      console.error('[EXTRACT] Groq error:', aiResponse.status, errText);
      return NextResponse.json({ error: 'Vision API error' }, { status: 502 });
    }

    const aiJson = await aiResponse.json();
    const rawContent = aiJson.choices?.[0]?.message?.content || '{}';

    let parsedContent;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch {
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 422 });
    }

    const rawArray = Array.isArray(parsedContent)
      ? parsedContent
      : parsedContent.discounts || parsedContent.offers || [];

    const validation = aiExtractionArraySchema.safeParse(rawArray);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'AI output failed validation', details: validation.error.issues.slice(0, 3) },
        { status: 422 }
      );
    }

    if (validation.data.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const storeName = SM_MAPPING[supermarketId];
    const store = await prisma.store.upsert({
      where: { name: storeName },
      update: {},
      create: { name: storeName },
    });

    const now = new Date();
    const defaultUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    let count = 0;

    for (const deal of validation.data) {
      try {
        await prisma.discount.create({
          data: {
            storeId: store.id,
            supermarket: supermarketId,
            productName: deal.productName,
            category: deal.category || 'Άλλο',
            discountedPrice: Number(deal.discountedPrice),
            originalPrice: deal.originalPrice ?? null,
            discountPercent: deal.discountPercent ?? null,
            description: deal.description ?? null,
            validFrom: deal.validFrom ? new Date(deal.validFrom) : now,
            validUntil: deal.validUntil ? new Date(deal.validUntil) : defaultUntil,
            isActive: true,
          },
        });
        count++;
      } catch (err) {
        console.error('[EXTRACT] insert failed:', err?.message);
      }
    }

    revalidateTag('deals:default', 'max');
    return NextResponse.json({ success: true, count });
  } catch (error) {
    Sentry.captureException(error);
    console.error('[EXTRACT] Fatal:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
