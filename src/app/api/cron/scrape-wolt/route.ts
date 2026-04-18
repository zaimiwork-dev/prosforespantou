import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { revalidateTag } from 'next/cache';

// This route handles automated syncs triggered by Vercel Cron
// Usage: /api/cron/scrape-wolt?sm=ab&url=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const smId = searchParams.get('sm');
  const woltUrl = searchParams.get('url');

  // 1. Security check
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!smId || !woltUrl) {
    return NextResponse.json({ error: 'Missing sm or url parameter' }, { status: 400 });
  }

  try {
    console.log(`[CRON] Starting sync for ${smId}...`);
    
    // 2. Fetch the JSON from Wolt directly
    // Note: Some Wolt endpoints require specific headers or are protected.
    // This assumes the provided URL is a fetchable JSON endpoint.
    const response = await fetch(woltUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });

    if (!response.ok) {
      throw new Error(`Wolt API returned ${response.status}`);
    }

    const json = await response.json();

    // 3. Reuse the existing import logic via an internal fetch to our own API
    // (or we could extract the logic to a shared lib, but this is cleaner for now)
    const baseUrl = new URL(req.url).origin;
    const importRes = await fetch(`${baseUrl}/api/admin/import-wolt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // We use the CRON_SECRET to bypass admin check if we update that route,
        // or just pass a internal header. For simplicity here, we assume 
        // this route is only reachable internally or we use a master key.
        'Authorization': `Bearer ${process.env.CRON_SECRET}` 
      },
      body: JSON.stringify({ json, supermarketId: smId }),
    });

    const result = await importRes.json();
    
    revalidateTag('deals:default', 'max');
    
    return NextResponse.json({ 
      success: true, 
      supermarket: smId, 
      importedCount: result.count || 0 
    });

  } catch (error: any) {
    console.error('[CRON] Sync failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
