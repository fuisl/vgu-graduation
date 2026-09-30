import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Inter_Tight } from "next/font/google";
import "@grad/design-tokens/tokens.css";
import "@grad/design-tokens/brand.css";
import "./globals.css";

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
  return <html className={`${GeistSans.variable} ${GeistMono.variable} ${interTight.variable}`} lang="en"><body>{children}</body></html>;
}
