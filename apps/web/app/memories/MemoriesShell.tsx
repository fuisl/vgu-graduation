import Link from "next/link";
import { BackgroundMotion } from "../background/BackgroundMotion";
import { GridCells } from "../background/GridCells";
import { TwinkleField } from "../background/TwinkleField";
import { BrandName } from "../logo/BrandName";
import "./memories.css";

type MemoriesPage = "gallery" | "wishes" | "polaroid";

const NAV: { page: MemoriesPage; href: string; label: string }[] = [
  { page: "gallery", href: "/gallery", label: "Gallery" },
  { page: "wishes", href: "/wishes", label: "Guestbook" },
  { page: "polaroid", href: "/polaroid", label: "Disposable" },
];

/**
 * The landing experience's shell (docs/design/landing.md) shared by the gallery,
 * guestbook and disposable-camera pages: the same background layers and header,
 * with one navigation whose current page is marked rather than linked.
 */
export function MemoriesShell({ current, label, children }: { current: MemoriesPage; label: string; children: React.ReactNode }) {
  return (
    <main className="landing-page">
      <section className="landing memories" aria-label={label}>
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
          <nav className="landing-nav" aria-label="Memories navigation">
            {NAV.map((item) =>
              item.page === current ? (
                <span key={item.page} className="memories-nav-current" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link key={item.page} href={item.href}>
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </header>

        <div className="memories-body">{children}</div>
      </section>
    </main>
  );
}
