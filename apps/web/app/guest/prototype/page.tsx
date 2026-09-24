import type { Metadata } from "next";
import Link from "next/link";
import { BackgroundMotion } from "../../background/BackgroundMotion";
import { GridCells } from "../../background/GridCells";
import { TwinkleField } from "../../background/TwinkleField";
import { BrandName } from "../../logo/BrandName";
import { BadgeScene } from "./BadgeScene";
import "./prototype.css";

export const metadata: Metadata = {
  title: "Guest badge prototype | GRAD '26",
  description: "A preview of the GRAD '26 guest badge.",
};

export default function GuestPrototype() {
  return (
    <main className="landing guest-prototype">
      <BackgroundMotion />
      <div className="landing-aurora" aria-hidden="true">
        <span className="landing-aurora-blob" />
        <span className="landing-aurora-blob" />
        <span className="landing-aurora-blob" />
      </div>
      <div className="landing-field" aria-hidden="true"><GridCells /></div>
      <TwinkleField />

      <header className="guest-header">
        <Link className="guest-brand" href="/" aria-label="GRAD '26 home"><BrandName /></Link>
        <span className="guest-header-label mono">GRADUATION ’26 <span aria-hidden="true">/</span> GUEST PREVIEW</span>
        <Link className="guest-back mono" href="/">← BACK TO HOME</Link>
      </header>

      <section className="guest-stage" aria-label="Guest badge preview">
        <div className="guest-object-scene">
          <BadgeScene><p className="guest-badge-placeholder mono">YOUR NAME HERE</p></BadgeScene>
        </div>

        <p className="guest-stage-footer mono">[ PREVIEW ONLY ] <span aria-hidden="true">—</span> A PLACEHOLDER FOR YOUR STORY</p>
      </section>
    </main>
  );
}
