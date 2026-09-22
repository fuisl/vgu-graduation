"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups } from "../lib/navigation";

export function DocsNav() {
  const pathname = usePathname().replace(/^\/docs(?=\/|$)/, "") || "/";

  return (
    <nav className="docs-nav" aria-label="Documentation">
      {navGroups.map((group, index) => (
        <details
          className="docs-nav-group"
          key={`${group.title}-${pathname}`}
          open={group.items.some(([slug]) => pathname === `/${slug}`) || (pathname === "/" && index === 0)}
        >
          <summary>{group.title}<span>{String(group.items.length).padStart(2, "0")}</span></summary>
          <div className="docs-nav-links">
            {group.items.map(([slug, label]) => (
              <Link key={slug} href={`/${slug}`} aria-current={pathname === `/${slug}` ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </div>
        </details>
      ))}
    </nav>
  );
}
