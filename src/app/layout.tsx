import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

/*
 * Three faces, three jobs.
 *
 *  Inter        — the interface. Dense tables and forms need a face designed
 *                 for exactly that, and this one is.
 *  Bricolage    — headings. Enough personality to make the product feel like
 *                 something rather than a dashboard template.
 *  Plex Mono    — money, references, transaction hashes. Tabular figures are
 *                 not decoration here: a column of amounts has to align on the
 *                 decimal, and nobody can compare two hashes set proportionally.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "TaskEarn — Complete Tasks & Earn Rewards",
    template: "%s · TaskEarn",
  },
  description:
    "Earn rewards by completing legitimate sponsored tasks and qualifying surveys. Free to join — TaskEarn never asks members for money.",
  applicationName: "TaskEarn",
  keywords: ["task rewards", "paid surveys", "sponsored video tasks", "reward platform"],
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "TaskEarn",
    title: "TaskEarn — Complete Tasks & Earn Rewards",
    description:
      "Earn rewards by completing legitimate sponsored tasks and qualifying surveys. No deposit is ever required.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TaskEarn — Complete Tasks & Earn Rewards",
    description: "Rewards for sponsored video tasks and qualifying surveys.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Matches the page background so the mobile browser chrome disappears into
  // the app instead of framing it in a contrasting bar.
  themeColor: "#080C12",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      // `dark` is on the root rather than offered as a toggle: the theme is
      // built dark-first and the light tokens in globals.css are a fallback,
      // not a second design. Swap this for `light` to use them.
      className={`dark ${inter.variable} ${bricolage.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
