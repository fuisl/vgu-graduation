import Link from "next/link";
import { DocsNav } from "./docs-nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <aside className="docs-sidebar">
        <Link className="brand" href="/">GRAD &apos;26 / DOCS</Link>
        <DocsNav />
      </aside>
      <main className="docs-main">{children}</main>
    </div>
  );
}
