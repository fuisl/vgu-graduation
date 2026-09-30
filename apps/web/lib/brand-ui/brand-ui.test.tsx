import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArrowUpRightPixel, BrandEyebrow, BrandTheme, Cta, PillGroup, PillItem, Section } from "@grad/ui";

describe("brand primitives", () => {
  it("BrandTheme renders the opt-in root", () => {
    expect(html(<BrandTheme>x</BrandTheme>)).toBe('<div data-theme="brand">x</div>');
  });

  it("Section maps tone to a class and wraps content", () => {
    expect(html(<Section tone="blue">a</Section>)).toContain("brand-section--blue");
    expect(html(<Section tone="white">a</Section>)).toContain("brand-section--white");
    expect(html(<Section tone="white">a</Section>)).toContain("brand-section-inner");
  });

  it("Section maps density and supports blue-deep, capped by the brand inner wrapper", () => {
    expect(html(<Section tone="white">a</Section>)).toContain("brand-section--airy");
    expect(html(<Section tone="white" density="compact">a</Section>)).toContain("brand-section--compact");
    expect(html(<Section tone="blue-deep">a</Section>)).toContain("brand-section--blue-deep");
    expect(html(<Section tone="blue">a</Section>)).toContain('class="brand-section-inner"');
  });

  it("disabled Cta link has aria-disabled and no href", () => {
    const a = html(<Cta tone="on-white" href="/invite" disabled>Go</Cta>);
    expect(a).toContain('aria-disabled="true"');
    expect(a).not.toContain("href");
    const b = html(<Cta tone="on-blue" disabled>Go</Cta>);
    expect(b).toContain("disabled");
  });

  it("Cta renders an anchor with href and a button without", () => {
    const a = html(<Cta tone="on-blue" href="/invite">Go</Cta>);
    expect(a).toMatch(/^<a class="brand-cta brand-cta--on-blue" href="\/invite"/);
    expect(a).toContain("brand-cta__tile");
    const b = html(<Cta tone="on-white">Go</Cta>);
    expect(b).toMatch(/^<button class="brand-cta brand-cta--on-white" type="button"/);
  });

  it("PillGroup maps tone to a class, on-blue by default", () => {
    expect(html(<PillGroup label="Main"><PillItem href="/">Home</PillItem></PillGroup>)).toContain("brand-pills--on-blue");
    expect(html(<PillGroup label="Main" tone="on-white"><PillItem href="/">Home</PillItem></PillGroup>)).toContain("brand-pills--on-white");
  });

  it("PillItem sets aria-current only when current", () => {
    const out = html(<PillGroup label="Main"><PillItem href="/" current>Home</PillItem><PillItem href="/venue">Venue</PillItem></PillGroup>);
    expect(out).toContain('aria-label="Main"');
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("BrandEyebrow adds the trailing ellipsis only on request", () => {
    expect(html(<BrandEyebrow>Hello</BrandEyebrow>)).toContain(">Hello</p>");
    expect(html(<BrandEyebrow ellipsis>Hello</BrandEyebrow>)).toContain("Hello ...");
  });

  it("ArrowUpRightPixel is decorative", () => {
    expect(html(<ArrowUpRightPixel />)).toContain('aria-hidden="true"');
  });
});
