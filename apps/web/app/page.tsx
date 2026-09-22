import { Sculpture } from "./sculpture/Sculpture";

export default function Home() {
  return <main className="landing">
    <div className="landing-field" aria-hidden="true" />
    <header className="landing-header mono">
      <span>VGU / CSE</span>
      <span>GRAD ’26</span>
    </header>
    <section className="landing-center" aria-labelledby="landing-title">
      <div className="landing-kicker mono"><span className="landing-kicker-line" />A NEW CHAPTER IS TAKING SHAPE<span className="landing-kicker-line" /></div>
      <Sculpture />
      <div className="landing-message">
        <h1 id="landing-title">Coming soon in November.</h1>
        <p>The next chapter begins together.</p>
      </div>
    </section>
    <footer className="landing-footer mono">
      <span>VIETNAMESE–GERMAN UNIVERSITY</span>
      <span>CLASS OF 2026 <span className="landing-footer-dot">·</span> MADE TO REMEMBER</span>
    </footer>
  </main>;
}
