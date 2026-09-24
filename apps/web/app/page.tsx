import Link from "next/link";
import { BackgroundMotion } from "./background/BackgroundMotion";
import { TwinkleField } from "./background/TwinkleField";
import { GridCells } from "./background/GridCells";
import { ArrowUpRight } from "./icons/ArrowUpRight";
import { BrandName } from "./logo/BrandName";
import { Sculpture } from "./sculpture/Sculpture";
import { DecodeText } from "./landing-title/DecodeText";
import { WaveTitle } from "./landing-title/WaveTitle";

export default function Home() {
  return <main className="landing">
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
    <header className="landing-header">
      <a className="landing-brand" href="https://vgu.edu.vn/vi/home" target="_blank" rel="noopener noreferrer" aria-label="VGU home">
        <BrandName />
      </a>
      <nav className="landing-nav" aria-label="Main navigation">
        <a href="#gallery"><DecodeText text="Gallery" delay={160} /></a>
        <Link href="/ascii-live"><DecodeText text="ASCII live" delay={230} /></Link>
        <Link className="landing-signin" href="/guest/prototype"><DecodeText text="Guest preview" delay={300} /> <ArrowUpRight /></Link>
      </nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <h1 id="landing-title" aria-label="GRADUATION ’26">
        <DecodeText text="GRADUATION" delay={80} duration={880} ariaHidden />
        <span className="landing-year"><DecodeText text="’26" delay={360} duration={680} ariaHidden /></span>
      </h1>

      <div className="landing-centerpiece" id="gallery">
        <div className="landing-event-meta mono">
          <p><DecodeText text="November 2026 / VGU Campus, HCMC" delay={520} /></p>
          <span className="landing-event-signal" aria-hidden="true" />
        </div>
        <div className="landing-visual">
          <Sculpture />
        </div>
        <div className="landing-message">
          <WaveTitle />
          <p><DecodeText text="The next chapter begins together." delay={940} /></p>
        </div>
      </div>
    </section>

    <p className="landing-credit"><DecodeText text="Duong" delay={1080} /> <DecodeText className="landing-credit-alias" text="(aka. James)" delay={1150} /></p>
  </main>;
}
