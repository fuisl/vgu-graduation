import type { GuideItem } from "@grad/contract";
import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideBook } from "./GuideBook";

const items: GuideItem[] = [
  {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e01",
    title: "Library steps",
    category: "photo-spot",
    description: "Wide steps that fit the whole family.",
    mapUrl: "https://maps.example.test/library",
    timeHint: "10 min",
    sortOrder: 1,
  },
  {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e02",
    title: "Canteen",
    category: "food-drink",
    description: "",
    mapUrl: null,
    timeHint: null,
    sortOrder: 2,
  },
];

describe("GuideBook", () => {
  const out = html(<GuideBook items={items} />);

  it("renders a filter pill for All and each category present", () => {
    expect(out).toContain('role="group" aria-label="Show"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>All</);
    expect(out).toContain(">Photo spots<");
    expect(out).toContain(">Food and drink<");
    expect(out).not.toContain(">Relax<");
  });

  it("renders one card per item with title, description and time hint", () => {
    expect(out.match(/class="guide-card"/g)).toHaveLength(2);
    expect(out).toContain("Library steps");
    expect(out).toContain("Wide steps that fit the whole family.");
    expect(out).toContain("10 min");
    expect(out).toContain("2 places");
  });

  it("opens maps in a new tab with a name that says which place", () => {
    expect(out).toContain('href="https://maps.example.test/library" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('Open in Maps<span class="brand-sr-only">: Library steps</span>');
    expect(out.match(/Open in Maps/g)).toHaveLength(1);
  });

  it("skips the filter when there is only one category", () => {
    expect(html(<GuideBook items={[items[0]!]} />)).not.toContain('aria-label="Show"');
  });
});
