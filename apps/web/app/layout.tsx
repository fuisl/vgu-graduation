import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Inter_Tight } from "next/font/google";
import "@grad/design-tokens/tokens.css";
import "@grad/design-tokens/brand.css";
import "./globals.css";
import { TEXT_SIZE_BOOT_SCRIPT } from "../lib/a11y/text-size";
import { SpeedInsightsReporter } from "./speed-insights/SpeedInsightsReporter";

const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
  variable: "--font-inter-tight",
});

export const metadata: Metadata = {
  title: "GRAD '26",
  description: "VGU graduation ceremony companion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script may set data-text-size on <html> before React hydrates.
    <html className={`${GeistSans.variable} ${GeistMono.variable} ${interTight.variable}`} lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the guest's text size before first paint (#176). Static string, no user data. */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        {/* Vercel serves the collector at /_vercel/speed-insights; other hosts (local, homelab) would only 404. */}
        {process.env.VERCEL ? <SpeedInsightsReporter /> : null}
      </body>
    </html>
  );
}
