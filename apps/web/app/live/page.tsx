import type { Metadata } from "next";
import { BrandTheme } from "@grad/ui";
import { SiteHeader } from "../site/SiteHeader";
import { LiveCaptions } from "./LiveCaptions";
import "./live.css";

export const metadata: Metadata = {
  title: "Live captions | GRAD '26",
  description: "Read the ceremony live in Deutsch, English or Tiếng Việt on your phone.",
};

/**
 * /live (#70): live translation captions for phones. Experimental: everything
 * here is client-side and talks to the API directly (ADR-003), so a missing or
 * suspended translation service only changes this page's state. Not in the
 * header nav (four links); linked from the invitation and the event display.
 * No footer: the page is anchored to its live edge at the bottom.
 */
export default function LivePage() {
  return (
    <BrandTheme>
      <SiteHeader />
      <LiveCaptions />
    </BrandTheme>
  );
}
