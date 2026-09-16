import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
// @ts-expect-error — plain .mjs helper shared with the scrape scripts
import { shrinkImage, MAX_WIDTH } from './shrink-image.mjs';

// A smooth, photo-like image: real packshots are gradients and flat product
// faces, which is where webp wins. (Pure noise is incompressible and every
// encoder ties on it, so it would prove nothing.)
const photo = (w: number, h = w, alpha = false) => {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      raw[i] = Math.round(255 * (x / w));
      raw[i + 1] = Math.round(255 * (y / h));
      raw[i + 2] = Math.round(128 + 127 * Math.sin((x + y) / 90));
      if (alpha) raw[i + 3] = x < w / 8 ? 0 : 255; // a transparent margin
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels } });
};

describe('shrinkImage', () => {
  it('downscales an oversized photo and re-encodes it as webp', async () => {
    const src = await photo(1080).jpeg({ quality: 100 }).toBuffer();
    const out = await shrinkImage(src, 'image/jpeg');
    expect(out.changed).toBe(true);
    expect(out.contentType).toBe('image/webp');
    expect(out.bytes.length).toBeLessThan(src.length);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(MAX_WIDTH);
    expect(meta.format).toBe('webp');
  });

  it('keeps a small image at its own size', async () => {
    const src = await photo(256).jpeg({ quality: 100 }).toBuffer();
    const out = await shrinkImage(src, 'image/jpeg');
    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(256);
  });

  it('never returns something bigger than it got', async () => {
    const src = await photo(200).webp({ quality: 30 }).toBuffer();
    const out = await shrinkImage(src, 'image/webp');
    expect(out.bytes.length).toBeLessThanOrEqual(src.length);
    if (!out.changed) expect(out.bytes).toBe(src);
  });

  it('hands back anything it cannot read, rather than dropping it', async () => {
    const junk = Buffer.from('<!doctype html><html>Akamai block page</html>');
    const out = await shrinkImage(junk, 'text/html');
    expect(out.changed).toBe(false);
    expect(out.bytes).toBe(junk);
    expect(out.contentType).toBe('text/html');
    expect(await shrinkImage(Buffer.alloc(0), 'image/png')).toMatchObject({ changed: false });
  });

  // Packshots lean on the alpha channel, which is why the re-encode is webp
  // and not jpeg. (A source that compresses better as PNG is simply kept —
  // see the test above — so this one is comfortably oversized.)
  it('keeps transparency when it does re-encode', async () => {
    const src = await photo(1600, 1600, true).png().toBuffer();
    const out = await shrinkImage(src, 'image/png');
    expect(out.changed).toBe(true);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
  });
});
