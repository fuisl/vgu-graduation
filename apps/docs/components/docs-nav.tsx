"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupSize, navGroups } from "../lib/navigation";

export function DocsNav() {
  const pathname = usePathname().replace(/^\/docs(?=\/|$)/, "") || "/";

  return (
    <nav className="docs-nav" aria-label="Documentation">
      {navGroups.map((group, index) => (
        <details
          className="docs-nav-group"
          key={`${group.title}-${pathname}`}
          open={
            group.sections.some((section) => section.items.some(([slug]) => pathname === `/${slug}`)) ||
            (pathname === "/" && index === 0)
          }
        >
          <summary>{group.title}<span>{String(groupSize(group)).padStart(2, "0")}</span></summary>
          {group.sections.map((section) => (
            <div className="docs-nav-section" key={section.title ?? "pages"}>
              {section.title ? <div className="docs-nav-section-title">{section.title}</div> : null}
              <div className="docs-nav-links">
                {section.items.map(([slug, label]) => (
                  <Link key={slug} href={`/${slug}`} aria-current={pathname === `/${slug}` ? "page" : undefined}>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </details>
      ))}
    </nav>
  );
}
