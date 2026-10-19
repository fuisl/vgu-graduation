import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { captionLanguage, parseCaptionSetting } from "./caption-setting";
import { DisplayScreen } from "./DisplayScreen";
import { pickMessages } from "../../lib/i18n/dictionary";

const props = {
  eventName: "VGU Graduation 2026",
  eventDate: "Saturday, 24 October 2026",
  wishesQrSvg: '<svg viewBox="0 0 10 10"></svg>',
  wishesLink: "grad26.fuisloy.dev/wishes",
  liveLink: "grad26.fuisloy.dev/live",
  captions: "auto" as const,
  messages: pickMessages("en", "display."),
};

describe("DisplayScreen (server render, before the feed connects)", () => {
  const out = html(<DisplayScreen {...props} />);

  it("shows the empty state: event name, date and the wishes QR", () => {
    expect(out).toContain("Welcome to");
    expect(out).toContain("display-empty__title\">VGU Graduation 2026");
    expect(out).toContain("Saturday, 24 October 2026");
    expect(out).toContain("Share your wishes");
    expect(out).toContain('aria-label="Leave a wish at grad26.fuisloy.dev/wishes"');
    expect(out).toContain('href="/wishes"');
  });

  it("has no site header and one h1", () => {
    expect(out).not.toContain("brand-header");
    expect(out.match(/<h1/g)).toHaveLength(1);
  });

  it("starts as connecting, with no caption band or sign-in notice", () => {
    expect(out).toMatch(/role="status"[^>]*>.*Connecting/);
    expect(out).not.toContain("display-captions");
    expect(out).not.toContain('role="alert"');
  });
});

describe("caption setting", () => {
  it("parses the query parameter", () => {
    expect(parseCaptionSetting(undefined)).toBe("auto");
    expect(parseCaptionSetting("off")).toBe("off");
    expect(parseCaptionSetting(["de", "en"])).toBe("de");
    expect(parseCaptionSetting("fr")).toBe("auto");
  });

  it("auto shows the other hall language", () => {
    expect(captionLanguage("auto", "en")).toBe("vi");
    expect(captionLanguage("auto", "vi")).toBe("en");
    expect(captionLanguage("de", "en")).toBe("de");
  });
});
