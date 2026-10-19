import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LivePage from "./page";

describe("/live (server render, before the socket connects)", async () => {
  const out = html(await LivePage());

  it("uses the shared header with no current nav item, and no footer", () => {
    expect(out).toContain("brand-header");
    expect(out).not.toContain('aria-current="page"');
    expect(out).not.toContain("<footer");
  });

  it("shows the connecting state", () => {
    expect(out).toContain("Live captions");
    expect(out).toContain("Connecting to live captions");
  });

  it("offers language and text size as pressed toggles with full names", () => {
    expect(out).toContain('aria-label="Caption language"');
    expect(out).toContain('aria-label="Text size"');
    for (const name of ["Deutsch", "English", "Tiếng Việt", "Standard text", "Large text", "Extra large text"]) {
      expect(out).toContain(`aria-label="${name}"`);
    }
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it("has one polite live region for announcements", () => {
    expect(out.match(/aria-live="polite"/g)).toHaveLength(1);
  });
});
