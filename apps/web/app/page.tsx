import Link from "next/link";
import { BackgroundMotion } from "./background/BackgroundMotion";
import { TwinkleField } from "./background/TwinkleField";
import { GridCells } from "./background/GridCells";
import { BrandName } from "./logo/BrandName";
import { Sculpture } from "./sculpture/Sculpture";
import { WaveTitle } from "./landing-title/WaveTitle";

function ArrowUpRight() {
  return <span className="landing-arrow" aria-hidden="true">
    <svg viewBox="0 0 12 12" role="presentation">
      <path d="M2.25 9.75 9.75 2.25M4 2.25h5.75V8" />
    </svg>
  </span>;
}

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
      <Link className="landing-brand" href="/" aria-label="GRAD '26 home">
        <BrandName />
      </Link>
      <nav className="landing-nav" aria-label="Main navigation">
        <a href="#gallery">Gallery</a>
        <a href="#live-translate">Live translate</a>
        <Link className="landing-signin" href="/invite/demo">Guest sign in <ArrowUpRight /></Link>
      </nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <h1 id="landing-title">GRADUATION<span>’26</span></h1>

      <div className="landing-event-grid">
        <div className="landing-recap" id="gallery">
          <div className="landing-recap-frame" aria-hidden="true">
            <span className="landing-recap-mark">+</span>
            <span className="landing-recap-scan">MEDIA_00</span>
          </div>
          <div className="landing-recap-caption mono">
            <span>Pictures / recaps</span>
            <span>Coming later</span>
          </div>
        </div>

        <div className="landing-program">
          <div className="landing-event-meta mono">
            <p>November 2026 / VGU Campus, HCMC</p>
            <span>Graduation ceremony</span>
          </div>
          <div className="landing-visual" id="live-translate">
            <Sculpture />
          </div>
          <div className="landing-message">
            <WaveTitle />
            <p>The next chapter begins together.</p>
          </div>
        </div>
      </div>
    </section>
  </main>;
}
