import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { pickMessages } from "../../lib/i18n/dictionary";
import type { CalendarLinks } from "../../lib/calendar/links";
import { AddToCalendar } from "./AddToCalendar";

const links: CalendarLinks = {
  webcal: "webcal://api.example.test/event/calendar.ics",
  ics: "https://api.example.test/event/calendar.ics",
  google: "https://calendar.google.com/calendar/render?action=TEMPLATE",
  outlook: "https://outlook.live.com/calendar/0/deeplink/compose?rru=addevent",
};

describe("AddToCalendar (QA P1-3)", () => {
  it("server-renders an action that works on any device, plus every option", () => {
    const out = html(<AddToCalendar links={links} messages={pickMessages("en", "calendar.")} tone="on-blue" />);
    // Before the browser is known the action downloads the .ics file, never webcal only.
    expect(out).toMatch(/<a class="brand-cta brand-cta--on-blue" href="https:\/\/api\.example\.test\/event\/calendar\.ics">/);
    expect(out).toContain("Add to calendar");
    expect(out).toContain("Or choose your calendar");
    for (const href of [links.google, links.webcal, links.outlook]) expect(out).toContain(`href="${href}"`);
    expect(out).toContain("Google Calendar");
    expect(out).toContain("Download .ics file");
    expect(out).toContain('role="group"');
  });

  it("renders the action alone for the landing hero, and the options alone under a label", () => {
    const action = html(<AddToCalendar links={links} messages={pickMessages("en", "calendar.")} tone="on-blue" show="action" />);
    expect(action).not.toContain("Google Calendar");
    const options = html(<AddToCalendar links={links} messages={pickMessages("vi", "calendar.")} tone="on-white" show="options" />);
    expect(options).toContain("Thêm vào lịch");
    expect(options).toContain("Tải tệp .ics");
    // Four options, no separate action.
    expect(options.match(/class="brand-cta /g)).toHaveLength(4);
  });
});
