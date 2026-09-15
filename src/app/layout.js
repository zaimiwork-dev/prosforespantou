import { Inter, DM_Serif_Display, Noto_Serif_Display, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "greek"],
  display: "swap",
});

// DM Serif Display has no Greek glyphs (Google ships latin/latin-ext only), so
// every Greek heading rendered in Times New Roman (measured 2026-09-16 with
// CSS.getPlatformFontsForNode: 3 DM glyphs, 20 Times glyphs in «Τα βασικά της
// εβδομάδας»). Greek now comes from Noto Serif Display, a similar
// high-contrast serif, loaded for the Greek subset only.
const dmSerif = DM_Serif_Display({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const greekSerif = Noto_Serif_Display({
  variable: "--font-serif-greek",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["greek"],
  display: "swap",
});

// The heading stack must put the Greek face BEFORE DM's metric fallback face
// (a local Times New Roman covering every glyph), or that fallback swallows
// Greek first. `var(--font-serif)` bundles DM with its fallback, and Turbopack
// ignores adjustFontFallback: false, so the stack is assembled here from the
// real family names and set on <html> as --font-display.
const families = (font) => font.style.fontFamily.split(",").map((f) => f.trim()).filter(Boolean);
const [dmPrimary, ...dmFallbacks] = families(dmSerif);
const [greekPrimary, ...greekFallbacks] = families(greekSerif);
const DISPLAY_STACK = [dmPrimary, greekPrimary, ...dmFallbacks, ...greekFallbacks, "Georgia", "serif"].join(", ");

// Loaded once here (was injected as a render-blocking <link> on several pages —
// see no-page-custom-font). Greek subset included; exposed as --font-outfit.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "greek"],
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://prosforespantou.gr"),
  title: {
    default: "Προσφορές Παντού — Όλες οι προσφορές σούπερ μάρκετ",
    template: "%s | Προσφορές Παντού",
  },
  description:
    "Βρες και σύγκρινε προσφορές από όλα τα μεγάλα σούπερ μάρκετ της Ελλάδας σε ένα μέρος. Εξοικονόμησε χρόνο και χρήματα.",
  openGraph: {
    title: "Προσφορές Παντού",
    description: "Όλες οι προσφορές σούπερ μάρκετ σε ένα μέρος.",
    locale: "el_GR",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F5132",
};

import { BottomNav } from "@/components/BottomNav";
import { PushRegistrar } from "@/components/PushRegistrar";
import { CookieConsent } from "@/components/CookieConsent";
import { PageViewTracker } from "@/components/PageViewTracker";
import { ProfileSync } from "@/components/ProfileSync";
import SiteAnalytics from "@/components/SiteAnalytics";
import { TEXT_SIZE_BOOTSTRAP } from "@/lib/text-size";

export default function RootLayout({ children }) {
  return (
    <html
      lang="el"
      data-theme="fresh"
      data-density="compact"
      className={`${inter.variable} ${dmSerif.variable} ${greekSerif.variable} ${outfit.variable}`}
      style={{ "--font-display": DISPLAY_STACK }}
    >
      <body>
        {/* «Μεγάλα γράμματα» preference, applied before hydration so a
            returning large-text user never sees a flash of the small layout.
            The attribute is set on <html> by this script only (never during
            render), so server and client markup stay identical. */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOTSTRAP }} />
        {children}
        <BottomNav />
        {/* Native-only push registration (no-op on web). */}
        <PushRegistrar />
        {/* GDPR opt-in cookie banner — gates all behavioural analytics. */}
        <CookieConsent />
        {/* Consent-gated page_view funnel signal (no-op until opt-in). */}
        <PageViewTracker />
        {/* Anonymous server profile sync (W4a): off unless
            NEXT_PUBLIC_PROFILE_SYNC=1 and consent; erases on withdrawal. */}
        <ProfileSync />
        {/* Cookieless aggregate visit count — NOT consent-gated, and not a
            substitute for the tracker above. Stores nothing on the device, so
            there is no behavioural profile to consent to. See SiteAnalytics. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
