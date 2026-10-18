import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuestNotice } from "./_components/GuestNotice";
import { GuestProfile } from "./_components/GuestProfile";

// The pass is an async server component with its own tests; render a stand-in here.
vi.mock("../invite/_components/PassBadge", () => ({
  PassBadge: () => <section>pass</section>,
  PassBadgeSkeleton: () => <section>pass loading</section>,
}));

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

describe("GuestProfile", () => {
  const out = html(<GuestProfile invitation={invitation} event={event} />);

  it("greets the guest by given name with the full name below", () => {
    expect(out).toMatch(/<h1 id="profile-heading" class="profile-name">An<\/h1>/);
    expect(out).toContain('<p class="profile-fullname">Nguyễn Văn An</p>');
    expect(out.match(/<h1/g)).toHaveLength(1);
  });

  it("shows the RSVP state and a single primary action to the invitation", () => {
    expect(out).toContain("You have not responded yet.");
    expect(out).toContain("Respond to your invitation");
    expect(out.match(/class="brand-cta brand-cta--on-blue"/g)).toHaveLength(1);
  });

  it("lists who invited the guest with still avatars, never their emails", () => {
    expect(out).toContain("Linh Tran");
    expect(out).toContain("Minh Le");
    expect(out).not.toContain("linh@example.com");
    expect(out).not.toContain("an@example.com");
    expect(out).not.toContain(TOKEN);
  });

  it("links to the invitation, venue, guide-book, captions, gallery, wishes, camera and accessibility", () => {
    for (const href of ["/invite", "/venue", "/guide", "/live", "/gallery", "/wishes", "/polaroid", "/accessibility"]) {
      expect(out).toContain(`href="${href}"`);
    }
  });

  it("offers the text size control and the pass", () => {
    expect(out).toContain('role="group" aria-label="Text size"');
    expect(out).toContain("<section>pass");
  });
});

describe("GuestNotice", () => {
  it("explains how to open an invitation when signed out, with public links only", () => {
    const out = html(<GuestNotice kind="signed-out" event={event} retryHref="/me" eyebrow="Guest portal" />);
    expect(out).toContain("Open your invitation");
    expect(out).toContain("How to open your invitation");
    expect(out).toContain("The organizing team");
    expect(out).toContain('href="/venue"');
    expect(out).not.toContain('href="/guide"');
    expect(out).not.toContain('href="/polaroid"');
    expect(out).not.toContain('role="alert"');
  });

  it("offers a retry for a temporary error", () => {
    const out = html(<GuestNotice kind="error" event={{ status: "error", kind: "network", message: "down" }} retryHref="/guide" eyebrow="Guide-book" />);
    expect(out).toContain('role="alert"');
    expect(out).toContain('href="/guide"');
    expect(out).not.toContain("How to open your invitation");
  });

  it("says when the invitation expired", () => {
    const out = html(<GuestNotice kind="expired" event={event} retryHref="/me" eyebrow="Guest portal" />);
    expect(out).toContain("Your invitation has expired");
  });
});
