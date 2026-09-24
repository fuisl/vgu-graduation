import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "@grad/design-tokens/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRAD '26",
  description: "VGU graduation ceremony companion.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html className={`${GeistSans.variable} ${GeistMono.variable}`} lang="en"><body>{children}</body></html>;
}
