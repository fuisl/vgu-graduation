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

      <section className="guest-stage" aria-labelledby="guest-page-title">
        <div className="guest-stage-heading">
          <p className="mono">01 / THE PASS</p>
          <h1 id="guest-page-title">Your place in this memory.</h1>
          <p>A first look at the guest badge. Details shown are placeholders.</p>
        </div>

        <div className="guest-object-scene">
          <div className="guest-orbit guest-orbit-one" aria-hidden="true" />
          <div className="guest-orbit guest-orbit-two" aria-hidden="true" />
          <span className="guest-cross guest-cross-left" aria-hidden="true">+</span>
          <span className="guest-cross guest-cross-right" aria-hidden="true">+</span>

          <BadgeScene><div className="guest-badge-assembly">
            <div className="guest-lanyard mono" aria-hidden="true"><span>GRADUATION ’26</span></div>
            <div className="guest-ring" aria-hidden="true" />
            <article className="guest-badge" aria-label="Prototype guest badge for GRAD '26">
              <div className="guest-badge-top mono"><span>VGU / 26</span><span>GUEST</span></div>
              <pre className="guest-badge-ascii" aria-hidden="true">{`        . : .
     . : + : .
   . : + * + : .
. : + * # * + : .
   . : + * + : .
     . : + : .
        . : .`}</pre>
              <p className="guest-badge-name mono">YOUR NAME HERE</p>
              <div className="guest-badge-bottom mono">
                <div className="guest-badge-details"><span>NOV 2026<br />VGU CAMPUS</span><span>PASS / 001<br />PREVIEW</span></div>
                <p>SAME PEOPLE. A BRIGHTER YOU.</p>
              </div>
            </article>
          </div></BadgeScene>
        </div>

        <p className="guest-stage-footer mono">[ PREVIEW ONLY ] <span aria-hidden="true">—</span> A PLACEHOLDER FOR YOUR STORY</p>
      </section>
    </main>
  );
}
