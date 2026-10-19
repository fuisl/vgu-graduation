import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createI18n } from "../../../lib/i18n/dictionary";
import { badgeDate, demoBadgeCard, guestBadgeCard, guestBadgeLabels } from "../../../lib/profile/badge";
import { isLowPower, mayDropBadge } from "./badge-gate";
import { BadgePlaceholder } from "./BadgeFallback";
import { estimateNameSize, FACE, fitText } from "./card";
import { NameBadge } from "./NameBadge";

const en = createI18n("en");
const vi = createI18n("vi");
const event = {
  status: "ok" as const,
  data: {
    name: "VGU Graduation 2026",
    startsAt: "2026-11-21T08:00:00+07:00",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: false,
    venue: { name: "Ceremony Hall", address: "Ben Cat", mapUrl: "https://maps.example.test/hall" },
    contact: null,
    arrivalInfo: null,
  },
};

describe("fitText", () => {
  // A fake measure: every character is half the font size wide.
  const measure = (text: string, size: number) => Array.from(text).length * size * 0.5;

  it("keeps the largest size that fits", () => {
    expect(fitText(measure, "An", 884, 150, 72)).toEqual({ text: "An", size: 150 });
  });

  it("shrinks a longer name before cutting it", () => {
    const fit = fitText(measure, "Christopherson", 884, 150, 72);
    expect(fit.text).toBe("Christopherson");
    expect(fit.size).toBeLessThan(150);
    expect(measure(fit.text, fit.size)).toBeLessThanOrEqual(884);
  });

  it("cuts with an ellipsis at the smallest size, by whole characters", () => {
    const fit = fitText(measure, "Nguyễn Thị Ánh Tuyết Hoàng", 300, 40, 30);
    expect(fit.size).toBe(30);
    expect(fit.text.endsWith("…")).toBe(true);
    expect(measure(fit.text, 30)).toBeLessThanOrEqual(300);
  });
});

describe("estimateNameSize", () => {
  it("stays between the card's smallest and largest name size", () => {
    expect(estimateNameSize("An")).toBe(FACE.nameMax);
    expect(estimateNameSize("A very long given name indeed")).toBe(FACE.nameMin);
  });
});

describe("mayDropBadge", () => {
  const capable = { reducedMotion: false, saveData: false, webgl: true, lowPower: false };

  it("drops the 3D badge only on a capable device that wants motion", () => {
    expect(mayDropBadge(capable)).toBe(true);
    expect(mayDropBadge({ ...capable, reducedMotion: true })).toBe(false);
    expect(mayDropBadge({ ...capable, saveData: true })).toBe(false);
    expect(mayDropBadge({ ...capable, webgl: false })).toBe(false);
    expect(mayDropBadge({ ...capable, lowPower: true })).toBe(false);
  });

  it("calls two or fewer cores, or 2 GB or less, low power; missing hints are not", () => {
    expect(isLowPower(2, 8)).toBe(true);
    expect(isLowPower(8, 2)).toBe(true);
    expect(isLowPower(8, 4)).toBe(false);
    expect(isLowPower(undefined, undefined)).toBe(false);
  });
});

describe("badge cards", () => {
  it("prints the given name large and the full name in capitals when they differ", () => {
    const card = guestBadgeCard({ name: "Nguyễn Văn An", givenName: "An" }, event, en);
    expect(card).toMatchObject({ givenName: "An", fullName: "NGUYỄN VĂN AN", role: "GUEST", date: "21 NOV 2026", status: null });
  });

  it("leaves the full name out when it is the given name", () => {
    expect(guestBadgeCard({ name: "Linh", givenName: "Linh" }, event, en).fullName).toBeNull();
  });

  it("is in the page's language", () => {
    const card = guestBadgeCard({ name: "Nguyễn Văn An", givenName: "An" }, event, vi);
    expect(card.role).toBe("KHÁCH MỜI");
    expect(card.date).toBe(badgeDate(event.data, "vi-VN"));
    expect(card.date).toContain("2026");
  });

  it("the demo badge has no guest data and says it is a preview", () => {
    expect(demoBadgeCard(en)).toMatchObject({ givenName: "Your name", fullName: null, status: "PREVIEW", date: "NOV 2026" });
  });
});

describe("NameBadge (server render)", () => {
  const card = guestBadgeCard({ name: "Nguyễn Văn An", givenName: "An" }, event, en);

  it("is one labelled image whose CSS badge is hidden from assistive tech, with no canvas yet", () => {
    const out = html(<NameBadge card={card} labels={guestBadgeLabels("Nguyễn Văn An", en)} />);
    expect(out).toContain('class="name-badge" role="img" aria-label="Name badge for Nguyễn Văn An, guest at GRAD &#x27;26."');
    expect(out).toContain('class="name-badge__hang" aria-hidden="true"');
    expect(out).not.toContain("<canvas");
  });

  it("the loading placeholder is a blank card", () => {
    const out = html(<BadgePlaceholder />);
    expect(out).toContain("name-badge__card");
    expect(out).not.toContain("name-badge__name");
  });
});
