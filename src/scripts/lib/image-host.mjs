// Moving stored product-photo URLs from one public host to another (first use
// 2026-09-23: Cloudflare's r2.dev development host → images.prosforespantou.gr).
// The object keys never change, only the base in front of them, so a move is a
// prefix swap. Kept pure so the rules below are tested, not assumed.

// "https://x.r2.dev/" → "https://x.r2.dev". HTTPS only: a photo served over
// plain HTTP is blocked as mixed content on the live site.
export function normalizeBase(base) {
  const trimmed = String(base ?? '').trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(trimmed); } catch { throw new Error(`not a URL: "${base}"`); }
  if (parsed.protocol !== 'https:') throw new Error(`image base must be https: "${base}"`);
  return trimmed;
}

// The rewritten URL, or null when `url` does not live under `fromBase`. The
// trailing slash is part of the match, so a look-alike host such as
// "https://x.r2.dev.example.com/…" is never rewritten.
export function rewriteBase(url, fromBase, toBase) {
  if (typeof url !== 'string') return null;
  const from = `${fromBase}/`;
  if (!url.startsWith(from)) return null;
  return `${toBase}/${url.slice(from.length)}`;
}

// A LIKE pattern matching every URL under `base`, with % and _ escaped (use
// with ESCAPE '\'), so the base is matched literally.
export function likePrefix(base) {
  return `${`${base}/`.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
