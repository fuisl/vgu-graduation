import { BackgroundMotion } from "./background/BackgroundMotion";
import { TwinkleField } from "./background/TwinkleField";
import { GridCells } from "./background/GridCells";
import { BrandName } from "./logo/BrandName";
import { Sculpture } from "./sculpture/Sculpture";
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
    <header className="landing-header mono">
      <BrandName />
      <span>GRAD ’26</span>
    </header>
    <section className="landing-center" aria-labelledby="landing-title">
      <Sculpture />
      <div className="landing-message">
        <WaveTitle />
        <p>The next chapter begins together.</p>
      </div>
    </section>
  </main>;
}
