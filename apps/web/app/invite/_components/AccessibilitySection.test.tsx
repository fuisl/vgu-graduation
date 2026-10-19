import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NO_NEEDS } from "../../../lib/invite/accessibility";
import { AccessibilitySection } from "./AccessibilitySection";
import { pickMessages } from "../../../lib/i18n/dictionary";

const messages = pickMessages("en", "rsvp.a11y.");

describe("AccessibilitySection", () => {
  it("is collapsed, optional and untouched with nothing stored", () => {
    const out = html(<AccessibilitySection messages={messages} saved={{ status: "ok", needs: null }} />);
    expect(out).toMatch(/<details class="invite-assist" id="accessibility">/);
    expect(out).toContain("Accessibility and assistance");
    expect(out).toContain("Only the organizers see this, and it is deleted after the event.");
    expect(out).toContain('name="accessibilityTouched" value=""');
    expect(out.match(/type="checkbox"/g)).toHaveLength(9);
    expect(out).not.toContain("checked");
  });

  it("opens and prefills stored needs, still untouched so saving keeps them", () => {
    const out = html(
      <AccessibilitySection messages={messages} saved={{ status: "ok", needs: { ...NO_NEEDS, wheelchair: true, note: "Arriving by taxi" } }} />
    );
    expect(out).toMatch(/<details class="invite-assist" id="accessibility" open="">/);
    expect(out).toContain("Optional · 2 details saved");
    expect(out).toMatch(/name="a11y-wheelchair" checked=""/);
    expect(out).toContain("Arriving by taxi</textarea>");
    expect(out).toContain('name="accessibilityTouched" value=""');
  });

  it("says so when the stored needs could not be loaded", () => {
    const out = html(<AccessibilitySection messages={messages} saved={{ status: "unavailable" }} />);
    expect(out).toContain("We could not load what you told us before.");
  });

  it("groups needs with legends and links to the accessibility page", () => {
    const out = html(<AccessibilitySection messages={messages} saved={{ status: "ok", needs: null }} />);
    for (const legend of ["Getting around", "Hearing", "Sight", "Seating"]) {
      expect(out).toContain(`<legend class="invite-assist__legend">${legend}</legend>`);
    }
    expect(out).toContain('href="/accessibility"');
  });
});
