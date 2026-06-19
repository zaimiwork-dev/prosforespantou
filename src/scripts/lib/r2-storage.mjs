// Cloudflare R2 storage backend for the image mirror.
//
// R2 is S3-compatible and — unlike Supabase Storage — has a generous free tier
// (10 GB) AND zero egress fees, which is the right home for user-facing product
// images. We sign S3 PUT requests with aws4fetch (tiny, zero-dep) rather than
// pulling in the full AWS SDK.
//
// Config (all required to enable R2; otherwise the mirror falls back to Supabase):
//   R2_ACCOUNT_ID          — Cloudflare account id (the r2.cloudflarestorage.com host)
//   R2_ACCESS_KEY_ID       — R2 API token access key
//   R2_SECRET_ACCESS_KEY   — R2 API token secret
//   R2_BUCKET              — bucket name (default 'chain-images')
//   R2_PUBLIC_URL          — public base, e.g. https://pub-xxxx.r2.dev or a custom
//                            domain (no trailing slash). This is what we write into
//                            Product/Discount.imageUrl.
//
// Object keys match the Supabase layout (<chain>/<sha>.<ext>) so a migration is a
// pure base-URL swap.

import { AwsClient } from 'aws4fetch';

export function resolveR2Config(env = process.env) {
  const accountId = (env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (env.R2_BUCKET || 'chain-images').trim();
  const publicUrl = (env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

// A minimal storage backend: { kind, publicUrlFor(path), upload(path, bytes, ct) }.
export function makeR2Backend(cfg = resolveR2Config()) {
  if (!cfg) return null;
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return {
    kind: 'r2',
    publicUrlFor: (path) => `${cfg.publicUrl}/${path}`,
    async upload(path, bytes, contentType) {
      const res = await client.fetch(`${cfg.endpoint}/${cfg.bucket}/${encodeURI(path)}`, {
        method: 'PUT',
        body: bytes,
        headers: { 'Content-Type': contentType || 'application/octet-stream' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`R2 upload HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    },
    // Every key currently in the bucket (S3 ListObjectsV2, paginated). Uses the
    // signed S3 API — NOT the rate-limited public r2.dev host — so it is safe to
    // call for bulk resume/skip logic.
    async listKeys(onProgress) {
      const keys = new Set();
      let token = null;
      do {
        const u = new URL(`${cfg.endpoint}/${cfg.bucket}`);
        u.searchParams.set('list-type', '2');
        u.searchParams.set('max-keys', '1000');
        if (token) u.searchParams.set('continuation-token', token);
        const res = await client.fetch(u.toString(), { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`R2 list HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
        const xml = await res.text();
        for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.add(decodeXml(m[1]));
        const t = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
        token = t ? decodeXml(t[1]) : null;
        if (onProgress) onProgress(keys.size);
      } while (token);
      return keys;
    },
  };
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
