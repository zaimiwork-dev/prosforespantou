import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // 2026-06-12: Vercel's image-optimization quota (Hobby tier) ran out —
    // /_next/image started returning 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED
    // for EVERY host, which blanked most product photos on prod while dev
    // looked fine. Serve <img> directly from the source hosts instead: the
    // Supabase mirror + chain CDNs are public and browsers reach them fine
    // (the datacenter-IP blocks only ever affected server-side fetchers).
    // If the site moves to a paid plan, flip this off to get resizing back.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'imageproxy.wolt.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wolt-com-static-assets.wolt.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wolt-menu-images-cdn.wolt.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'masoutisimagesneu.blob.core.windows.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's3.eu-central-1.amazonaws.com',
        port: '',
        pathname: '/w4ve/kritikos/**',
      },
      // Chain image hosts used by Discount.imageUrl / Product.imageUrl. Without
      // these, next/image (offer detail page, shopping list, modal) 400s and
      // shows a broken image, even though plain-<img> cards render fine.
      {
        protocol: 'https',
        hostname: 'cdn.mymarket.gr',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 's1.sklavenitis.gr',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.ab.gr',
        port: '',
        pathname: '/**',
      },
      // Supabase Storage mirror for chains whose own image host blocks
      // off-site fetches (AB today — see src/scripts/lib/mirror-images.mjs).
      {
        protocol: 'https',
        hostname: 'qddyyykuaiuqpzmmzqzf.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/chain-images/**',
      },
      // The R2 mirror — 97% of live offer images (measured 2026-09-16), i.e.
      // every chain except Sklavenitis. It was missing here: harmless while
      // `unoptimized` is on, but the moment anyone flips that off (the comment
      // above invites it) every product photo would 400.
      {
        protocol: 'https',
        hostname: '*.r2.dev',
        port: '',
        pathname: '/**',
      },
      // Reserved for the custom image domain we should move to: the public
      // r2.dev host is rate-limited by Cloudflare and some Greek resolvers
      // blackhole it (this dev machine's resolver answers 127.0.0.1).
      {
        protocol: 'https',
        hostname: 'images.prosforespantou.gr',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during build
  silent: true,
  org: "zaimi-work",
  project: "javascript-nextjs",
}, {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11 (increases bundle size)
  transpileClientSDK: false,

  // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
  tunnelRoute: "/monitoring",

  // Hides source maps from visitors
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Jobs.
  // See the "Automatic Instrumentation-Vercel Cron Jobs" section below for more details.
  automaticVercelCronInstrumentation: true,
});
