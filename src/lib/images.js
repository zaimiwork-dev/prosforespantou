// Upgrade a chain image URL to a high-resolution variant for LARGE views
// (product detail page, product modal). List cards keep the smaller stored
// variant to save bandwidth on mobile.
//
// My Market's CDN serves fixed style buckets — thumbnail / alt_thumbnail /
// medium / original. The adapter stores `medium` (great for cards, blurry when
// blown up full-screen), so swap it to `original` for the big views.
export function hiResImage(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('cdn.mymarket.gr')) {
    return url.replace(/\/images\/styles\/(?:thumbnail|alt_thumbnail|medium)\//, '/images/styles/original/');
  }
  return url;
}
