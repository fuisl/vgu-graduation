import Link from "next/link";
import { BackgroundMotion } from "./background/BackgroundMotion";
import { TwinkleField } from "./background/TwinkleField";
import { GridCells } from "./background/GridCells";
import { ArrowUpRight } from "./icons/ArrowUpRight";
import { NotFoundCode } from "./not-found-title/NotFoundCode";

export default function NotFound() {
  return <main className="notfound">
    <BackgroundMotion />
    <div className="landing-aurora" aria-hidden="true">
      <span className="landing-aurora-blob" />
      <span className="landing-aurora-blob" />
      <span className="landing-aurora-blob" />
    </div>
    <div className="landing-field" aria-hidden="true">
      <GridCells />
    </div>
    <TwinkleField />

    <section className="notfound-content" aria-labelledby="notfound-title">
      <NotFoundCode />
      <h2 id="notfound-title">Page not found</h2>
      <p>This page wandered off before the ceremony started.</p>
      <div className="notfound-actions">
        <Link className="notfound-cta" href="/">Back to home <ArrowUpRight /></Link>
        <Link className="notfound-link" href="/#gallery">Gallery</Link>
      </div>
    </section>
  </main>;
}
