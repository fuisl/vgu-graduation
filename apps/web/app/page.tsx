import { BrandName } from "./logo/BrandName";
import { Sculpture } from "./sculpture/Sculpture";

export default function Home() {
  return <main className="landing">
    <div className="landing-field" aria-hidden="true" />
    <header className="landing-header mono">
      <BrandName />
      <span>GRAD ’26</span>
    </header>
    <section className="landing-center" aria-labelledby="landing-title">
      <Sculpture />
      <div className="landing-message">
        <h1 id="landing-title">Coming soon in November.</h1>
        <p>The next chapter begins together.</p>
      </div>
    </section>
  </main>;
}
