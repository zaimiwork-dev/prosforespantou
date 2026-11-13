// Generates the app's icon and splash images from the website's brand mark
// (public/icons/icon-512.png: a cream «Π» on the brand green), so the app on
// the home screen and the site in a browser tab look like one product.
// Replaces the Expo template's blue chevron (lead review 2026-11-10).
//
//   node mobile/scripts/make-icons.mjs      (from the repo root; uses the
//                                            website's `sharp` dependency)
//
// Android adaptive icons: the foreground must keep its content inside the
// central 66 % safe zone, because launchers mask it to a circle, squircle or
// rounded square. The mark below spans ~38 % of the canvas.
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const BRAND = '#0F5132'; // Colors.brand (mobile/src/constants/theme.ts)
const CREAM = '#F3EEE2'; // Colors.brandInk
const out = (name) => fileURLToPath(new URL(`../assets/images/${name}`, import.meta.url));

// The website's «Π»: a top bar and two legs, proportions taken from icon-512.
// Drawn in a 512 box centred on (256, 262) so the visual weight sits centrally.
function mark(color, scale = 1) {
  const s = scale;
  const w = 157 * s, h = 164 * s, bar = 40 * s, leg = 50 * s;
  const x = 256 - w / 2, y = 262 - h / 2;
  return `<g fill="${color}">
    <rect x="${x}" y="${y}" width="${w}" height="${bar}"/>
    <rect x="${x}" y="${y}" width="${leg}" height="${h}"/>
    <rect x="${x + w - leg}" y="${y}" width="${leg}" height="${h}"/>
  </g>`;
}
const svg = (body, bg = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${
    bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''
  }${body}</svg>`;

async function png(svgText, size, file) {
  await sharp(Buffer.from(svgText)).resize(size, size).png().toFile(out(file));
  console.log(`${file} ${size}×${size}`);
}

// Store/legacy icon: full square, mark at the site's size ×1.15.
await png(svg(mark(CREAM, 1.15), BRAND), 1024, 'icon.png');
// Adaptive icon layers (Android 8+).
await png(svg(mark(CREAM, 1.25)), 1024, 'android-icon-foreground.png');
await png(svg('', BRAND), 1024, 'android-icon-background.png');
// Themed icon (Android 13+): the launcher recolours the shape, only alpha counts.
await png(svg(mark('#FFFFFF', 1.25)), 1024, 'android-icon-monochrome.png');
// Splash: cream mark on the brand-green splash background (app.json).
await png(svg(mark(CREAM, 1.6)), 512, 'splash-icon.png');
// Browser tab of the web build.
await png(svg(mark(CREAM, 1.3), BRAND), 48, 'favicon.png');
