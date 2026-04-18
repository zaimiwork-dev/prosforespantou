import { Inter, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "greek"],
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
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

export default function RootLayout({ children }) {
  return (
    <html
      lang="el"
      data-theme="fresh"
      data-density="compact"
      className={`${inter.variable} ${dmSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
