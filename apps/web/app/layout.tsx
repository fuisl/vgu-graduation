import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Inter_Tight } from "next/font/google";
import "@grad/design-tokens/tokens.css";
import "@grad/design-tokens/brand.css";
import "./globals.css";
import { TEXT_SIZE_BOOT_SCRIPT } from "../lib/a11y/text-size";
import { getI18n, getLocale } from "../lib/i18n/server";
import { SpeedInsightsReporter } from "./speed-insights/SpeedInsightsReporter";

const interTight = Inter_Tight({
  subsets: ["latin", "latin-ext", "vietnamese"],
  display: "swap",
  variable: "--font-inter-tight",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("meta.siteTitle"), description: t("meta.siteDescription") };
}

/**
 * viewport-fit=cover (#78): pages draw edge to edge, so the safe-area insets are real and the
 * paddings that use them (live caption dock, /display, mobile menu sheet, --gutter) take effect.
 * No themeColor here: SiteHeader's ThemeColorSync owns it on brand pages, and admin keeps the default.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The site language (#9): `lang` cookie, else Accept-Language. Admin overrides it with lang="en".
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: the boot script may set data-text-size on <html> before React hydrates.
    <html className={`${GeistSans.variable} ${GeistMono.variable} ${interTight.variable}`} lang={locale} suppressHydrationWarning>
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
