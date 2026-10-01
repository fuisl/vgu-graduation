import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme } from "@grad/ui";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { BadgeScene } from "./BadgeScene";
import "./prototype.css";

export const metadata: Metadata = {
  title: "Guest badge prototype | GRAD '26",
  description: "A preview of the GRAD '26 guest badge.",
};

export default function GuestPrototype() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main className="guest-prototype">
        {/* Plain brand-blue stage; the canvas spans it so drags can reach the edges. */}
        <section className="guest-stage" aria-label="Guest badge preview">
          <div className="guest-object-scene">
            <BadgeScene><p className="guest-badge-placeholder mono">YOUR NAME HERE</p></BadgeScene>
          </div>
          <div className="guest-stage-footer">
            <BrandEyebrow>[ PREVIEW ONLY ] <span aria-hidden="true">—</span> A PLACEHOLDER FOR YOUR STORY</BrandEyebrow>
          </div>
        </section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
