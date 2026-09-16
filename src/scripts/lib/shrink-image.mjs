// Downscale + re-encode a product image before it reaches the mirror.
//
// Why (measured 2026-09-16): the Vercel image optimizer is off — its Hobby
// quota ran out in June and every /_next/image request 402'd — so phones
// download whatever the chain published, at full size, forever. Κρητικός
// publishes 1080px JPEGs and My Market 1000px PNGs, which is ~5-8 MB for one
// screen of 48 cards that render at ~170px. Μασούτης (900px webp, 22 KB
// median) shows what the same page can weigh.
//
// WebP at 800px wide beat every alternative on the live objects:
//   κρητικός  174 KB → 19 KB   my market 108 KB → 43 KB
//   lidl       97 KB →  9 KB   ab         24 KB →  8 KB
// (Μασούτης is already 900px webp and comes out slightly LARGER re-encoded,
// which is why the result is only kept when it actually saves bytes.)
//
// WebP is supported by every browser this audience has had since ~2020 and,
// unlike JPEG, keeps the alpha channel that packshots rely on.

import sharp from 'sharp';

export const MAX_WIDTH = 800;
export const WEBP_QUALITY = 80;

// Formats worth touching. SVG is vector (already tiny), GIF may be animated,
// AVIF is smaller than anything we would produce.
const SHRINKABLE = new Set(['jpeg', 'jpg', 'png', 'webp']);

/**
 * @param {Buffer} bytes            the original image
 * @param {string} contentType      its media type, e.g. 'image/png'
 * @returns {Promise<{bytes: Buffer, contentType: string, changed: boolean, note: string}>}
 *          The original, untouched, whenever re-encoding would not help or
 *          anything goes wrong — a mirror that drops images is worse than a
 *          mirror that stores big ones.
 */
export async function shrinkImage(bytes, contentType = '') {
  const keep = (note) => ({ bytes, contentType, changed: false, note });
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return keep('empty');

  let meta;
  try {
    meta = await sharp(bytes).metadata();
  } catch (e) {
    return keep(`unreadable (${e.message.slice(0, 40)})`);
  }
  if (!meta.format || !SHRINKABLE.has(meta.format)) return keep(`format ${meta.format}`);
  if (meta.pages && meta.pages > 1) return keep('animated');
  if (!meta.width) return keep('no width');

  let out;
  try {
    let img = sharp(bytes, { animated: false }).rotate(); // honour EXIF orientation
    if (meta.width > MAX_WIDTH) img = img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    out = await img.webp({ quality: WEBP_QUALITY }).toBuffer();
  } catch (e) {
    return keep(`encode failed (${e.message.slice(0, 40)})`);
  }

  if (out.length >= bytes.length) return keep('already smaller');
  return {
    bytes: out,
    contentType: 'image/webp',
    changed: true,
    note: `${meta.format} ${meta.width}px ${Math.round(bytes.length / 1024)}KB → webp ${Math.min(meta.width, MAX_WIDTH)}px ${Math.round(out.length / 1024)}KB`,
  };
}
