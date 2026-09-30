import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DesignSystem, { metadata } from "./page";

describe("/design-system", () => {
  const out = html(<DesignSystem />);
  it("renders every section heading", () => {
    for (const h of ["Design system", "Colour", "Contrast", "Inter Tight and Geist Mono", "Rhythm and shape", "On blue", "On white", "Two states", "Do and don"])
      expect(out).toContain(h);
  });
  it("alternates tones inside the brand theme and proves diacritics", () => {
    expect(out).toContain('data-theme="brand"');
    expect(out).toContain("brand-section--blue");
    expect(out).toContain("brand-section--white");
    expect(out).toContain("Chúc mừng tốt nghiệp, khóa 2026");
    expect(out).not.toContain("coming in #145");
    expect(out).toContain("brand-section--compact");
    expect(out).toContain("brand-pills--on-white");
    expect(out).toContain("brand-footer");
  });
  it("sets the title", () => expect(metadata.title).toBe("Design system · GRAD '26"));
});
