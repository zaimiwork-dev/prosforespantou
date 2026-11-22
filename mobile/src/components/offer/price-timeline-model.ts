// The product page's «Ιστορικό τιμής» rules now live in ONE place shared with
// the website: src/lib/price-history-view.ts (owner 2026-11-22 — the site and
// the app must show the same, correct history in the same words). This file
// keeps the old import path working for the app.
export * from '@shared/price-history-view';
