import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { navItems } from "./navigation";

const DOCS_ROOT = path.resolve(__dirname, "../../../docs");

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith(".md") ? [path.relative(DOCS_ROOT, full).replace(/\.md$/, "")] : [];
  });
}

describe("handbook navigation", () => {
  const slugs = navItems.map(([slug]) => slug);

  it("lists every Markdown file under docs/ so no page is orphaned", () => {
    const missing = markdownFiles(DOCS_ROOT).filter((file) => !slugs.includes(file));
    expect(missing).toEqual([]);
  });

  it("points only at files that exist", () => {
    const unknown = slugs.filter((slug) => !fs.existsSync(path.join(DOCS_ROOT, `${slug}.md`)));
    expect(unknown).toEqual([]);
  });

  it("lists each page once", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
