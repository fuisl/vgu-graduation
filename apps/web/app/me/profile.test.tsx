import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestNotice } from "./_components/GuestNotice";
import { GuestProfile } from "./_components/GuestProfile";
import { createI18n } from "../../lib/i18n/dictionary";
import { demoBadgeCard, demoBadgeLabels } from "../../lib/profile/badge";
import { NameBadge } from "../guest/badge/NameBadge";

const i18n = createI18n("en");

const TOKEN = "secret-invitation-token-123";
const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
    name: "Nguyễn Văn An",
    givenName: "An",
    familyName: "Nguyễn",
    email: "an@example.com",
    phone: "+84123456",
  },
  maxPlusOnes: 1,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [
    { id: "6b1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e01", name: "Linh Tran", email: "linh@example.com" },
    { id: "6b1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e02", name: "Minh Le", email: "minh@example.com" },
  ],
  rsvp: null,
};
const event = {
  status: "ok" as const,
  data: {
    name: "VGU Graduation 2026",
    startsAt: "2026-11-21T08:00:00+07:00",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: false,
    venue: { name: "Ceremony Hall", address: "Ben Cat", mapUrl: "https://maps.example.test/hall" },
    contact: { name: "The organizing team", email: "team@example.com", phone: null },
    arrivalInfo: null,
  },
};
const attending = {
  ...invitation,
  rsvp: { id: "7c1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e03", attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: "2026-10-01T00:00:00Z" },
};
const primaryOnBlue = /class="brand-cta brand-cta--on-blue"/g;

describe("GuestProfile", () => {
  const out = html(<GuestProfile i18n={i18n} invitation={invitation} event={event} art={null} />);

  it("is the guest's name badge: given name large, full name below, the date and role", () => {
    expect(out).toContain('role="img" aria-label="Name badge for Nguyễn Văn An, guest at GRAD &#x27;26."');
    expect(out).toContain('<span class="name-badge__name">An</span>');
    expect(out).toContain('<span class="name-badge__fullname">NGUYỄN VĂN AN</span>');
    expect(out).toContain(">GUEST<");
    expect(out).toContain(">21 NOV 2026<");
    // Without a pass the card prints the ASCII artwork, not a QR.
    expect(out).toContain("name-badge__ascii");
    expect(out).not.toContain("name-badge__qr");
  });

  it("names the page with one (visually hidden) heading", () => {
    expect(out).toMatch(/<h1 id="profile-heading" class="brand-sr-only">Nguyễn Văn An<\/h1>/);
    expect(out.match(/<h1/g)).toHaveLength(1);
  });

  it("before an answer, the one next action is to respond", () => {
    expect(out).toContain("You have not responded yet.");
    expect(out).toContain('href="/invite#rsvp"');
    expect(out).toContain("Respond to your invitation");
    expect(out.match(primaryOnBlue)).toHaveLength(1);
  });

  it("once attending, the next action is the calendar, with changing the answer secondary", () => {
    const answered = html(<GuestProfile i18n={i18n} invitation={attending} event={event} art={null} />);
    expect(answered).toContain("You are attending.");
    expect(answered).toContain("Add to calendar");
    expect(answered).toContain("Change your RSVP");
    expect(answered.match(primaryOnBlue)).toHaveLength(1);
  });

  it("after declining, the next action is to change the answer", () => {
    const declined = html(<GuestProfile i18n={i18n} invitation={{ ...attending, rsvp: { ...attending.rsvp, attending: false } }} event={event} art={null} />);
    expect(declined).toContain("You have said you cannot attend.");
    expect(declined).toContain("Change your RSVP");
    expect(declined).not.toContain("Add to calendar");
  });

  it("lists who invited the guest with still avatars, never emails or the token", () => {
    expect(out).toContain("Invited by");
    expect(out).toContain("Linh Tran");
    expect(out).toContain("Minh Le");
    expect(out).not.toContain("linh@example.com");
    expect(out).not.toContain("an@example.com");
    expect(out).not.toContain("+84123456");
    expect(out).not.toContain(TOKEN);
  });

  it("keeps only what the site menu does not have: the guide-book, no event facts or text size", () => {
    expect(out).toContain('href="/guide"');
    for (const href of ["/venue", "/gallery", "/wishes", "/polaroid", "/live", "/accessibility"]) {
      expect(out).not.toContain(`href="${href}"`);
    }
    expect(out).not.toContain("Ceremony Hall");
    expect(out).not.toContain('aria-label="Text size"');
  });

  it("prints no date while the event is unavailable, and still offers the action", () => {
    const down = html(<GuestProfile i18n={i18n} invitation={invitation} event={{ status: "error", kind: "network", message: "down" }} art={null} />);
    expect(down).toContain("name-badge__name");
    expect(down).not.toContain("NOV 2026");
    expect(down).toContain("Respond to your invitation");
  });
});

describe("GuestNotice", () => {
  it("signed out on /me: the demo badge, how to open the invitation, and the organizer", () => {
    const badge = <NameBadge card={demoBadgeCard(i18n)} labels={demoBadgeLabels(i18n)} />;
    const out = html(<GuestNotice i18n={i18n} kind="signed-out" event={event} retryHref="/me" eyebrow="Guest portal" badge={badge} />);
    expect(out).toContain('class="badge-stage"');
    expect(out).toContain('<span class="name-badge__name">Your name</span>');
    expect(out).toContain(">PREVIEW<");
    expect(out).toContain("Open your invitation");
    expect(out).toContain("How to open your invitation");
    expect(out).toContain("The organizing team");
    expect(out).not.toContain('href="/venue"');
    expect(out).not.toContain('role="alert"');
  });

  it("without a badge (/guide), the portal's face instead", () => {
    const out = html(<GuestNotice i18n={i18n} kind="signed-out" event={event} retryHref="/guide" eyebrow="Guide-book" />);
    expect(out).not.toContain("badge-stage");
    expect(out).toContain("profile-hero__avatar");
  });

  it("offers a retry for a temporary error", () => {
    const out = html(<GuestNotice i18n={i18n} kind="error" event={{ status: "error", kind: "network", message: "down" }} retryHref="/guide" eyebrow="Guide-book" />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('href="/guide"');
    expect(out).not.toContain("How to open your invitation");
  });

  it("says when the invitation expired", () => {
    const out = html(<GuestNotice i18n={i18n} kind="expired" event={event} retryHref="/me" eyebrow="Guest portal" />);
    expect(out).toContain("Your invitation has expired");
  });
});
