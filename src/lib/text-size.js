// Text-size preference for the elderly-first audience.
//
// 'large' scales the whole document (fonts, images, tap targets) via
// `html[data-text-size="large"] body { zoom }` in globals.css — one rule that
// also enlarges buttons and spacing, which a font-size-only change would not
// (most sizes in globals.css are px). Persisted in localStorage; applied
// before first paint by the inline script in app/layout.js so there is no
// flash, and re-applied by setTextSize() immediately on change.

export const TEXT_SIZE_KEY = 'pp-text-size';
export const TEXT_SIZES = ['normal', 'large'];

export function getTextSize() {
  if (typeof window === 'undefined') return 'normal';
  try {
    const v = window.localStorage.getItem(TEXT_SIZE_KEY);
    return TEXT_SIZES.includes(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size) {
  if (typeof document === 'undefined') return;
  if (size === 'large') document.documentElement.setAttribute('data-text-size', 'large');
  else document.documentElement.removeAttribute('data-text-size');
}

export function setTextSize(size) {
  if (!TEXT_SIZES.includes(size)) return;
  try { window.localStorage.setItem(TEXT_SIZE_KEY, size); } catch { /* private mode */ }
  applyTextSize(size);
}

// Inline-able bootstrap (kept tiny, no dependencies): runs in <head>/<body>
// before hydration so a returning "large" user never sees the small layout.
export const TEXT_SIZE_BOOTSTRAP =
  `try{if(localStorage.getItem('${TEXT_SIZE_KEY}')==='large')document.documentElement.setAttribute('data-text-size','large')}catch(e){}`;
