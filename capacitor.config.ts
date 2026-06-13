import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for Prosfores Pantou. The app loads the live (server-rendered)
// site, so SSR + Server Actions keep working unchanged — the Next app is
// Server-Action-heavy and can't static-export (see PHASES.md 4.7). For the
// dogfood/Android milestone this "hardened webview of prosforespantou.gr" is the
// fast path to a real binary; for a public store submission we revisit bundling
// + lean on native push as the justification.
//
// CAP_SERVER_URL overrides the target (e.g. a Vercel preview or your LAN IP for
// local testing) without editing this file.
const config: CapacitorConfig = {
  appId: 'gr.prosforespantou.app',
  appName: 'Προσφορές Παντού',
  // Offline/splash fallback shown until the remote site loads (and if offline).
  webDir: 'capacitor-www',
  server: {
    url: process.env.CAP_SERVER_URL || 'https://prosforespantou.gr',
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
