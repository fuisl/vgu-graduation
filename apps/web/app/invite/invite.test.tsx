import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createI18n } from "../../lib/i18n/dictionary";
import { InviteNotice } from "./_components/InviteNotice";
import { PersonalInvitation } from "./_components/PersonalInvitation";

const i18n = createI18n("en");
const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Linh Tran", givenName: "Linh", email: "linh@example.com", phone: null },
  maxPlusOnes: 2,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [{ id: "6b1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e01", name: "Minh Le", email: "minh@example.com" }],
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

describe("PersonalInvitation", () => {
  const out = html(<PersonalInvitation i18n={i18n} invitation={invitation} event={event} savedNeeds={{ status: "ok", needs: null }} />);

  it("greets the guest and says who invited them", () => {
    expect(out).toContain("You are invited, Linh Tran");
    expect(out).toContain("Invited by Minh Le.");
    expect(out).not.toContain("minh@example.com");
  });

  it("makes the RSVP the one primary action, with who the invitation covers", () => {
    expect(out).toContain('id="rsvp"');
    expect(out).toContain("Respond to the invitation");
    expect(out).toContain("You may bring up to 2 guests.");
    expect(out.match(/class="brand-cta brand-cta--on-white"/g)).toHaveLength(1);
    expect(out).toContain("Save RSVP");
  });

  it("folds the ceremony details (calendar, directions, captions) into a closed disclosure", () => {
    expect(out).toMatch(/<details class="invite-assist"><summary class="invite-assist__summary"><span class="invite-assist__title">Ceremony details<\/span>/);
    expect(out).toContain("Add to calendar");
    expect(out).toContain('href="https://maps.example.test/hall"');
    expect(out).toContain('href="/live"');
  });

  it("links the name badge and the guide-book as rows, without a pass block", () => {
    expect(out).toContain('href="/me"');
    expect(out).toContain('href="/guide"');
    expect(out).not.toContain("QR");
  });

  it("shows the saved answer once there is one", () => {
    const answered = html(
      <PersonalInvitation
        i18n={i18n}
        invitation={{ ...invitation, rsvp: { id: "7c1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e03", attending: true, plusOnesCount: 1, dietaryRequirements: null, notes: null, updatedAt: "2026-10-01T00:00:00Z" } }}
        event={event}
        savedNeeds={{ status: "ok", needs: null }}
      />,
    );
    expect(answered).toContain("Change your RSVP");
    expect(answered).toContain('<p class="invite-rsvp-status">You are attending, with 1 guest.</p>');
  });
});

describe("an answer from an email link", () => {
  const saved = (attending: boolean) => ({
    id: "7c1e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e03",
    attending,
    plusOnesCount: 0,
    dietaryRequirements: null,
    notes: null,
    updatedAt: "2026-10-01T00:00:00Z",
  });
  const render = (linkAnswer: "yes" | "no" | null, rsvp: ReturnType<typeof saved> | null = null, locale: "en" | "vi" = "en") =>
    html(
      <PersonalInvitation
        i18n={createI18n(locale)}
        invitation={{ ...invitation, rsvp }}
        event={event}
        savedNeeds={{ status: "ok", needs: null }}
        linkAnswer={linkAnswer}
      />,
    );
  const checked = (out: string) => /<input[^>]*checked=""[^>]*value="(yes|no)"|<input[^>]*value="(yes|no)"[^>]*checked=""/.exec(out)?.slice(1).find(Boolean);

  it("opens the form with the answer pre-selected and asks the guest to confirm", () => {
    const yes = render("yes");
    expect(checked(yes)).toBe("yes");
    expect(yes).toContain("This is not saved yet");
    expect(yes).toContain("Confirm answer");
    expect(yes).not.toContain("Save RSVP");
    expect(yes).not.toContain("Your saved answer stays");
    expect(checked(render("no"))).toBe("no");
  });

  it("shows the link's answer as pending over a different saved answer, which it says it keeps", () => {
    const out = render("no", saved(true));
    expect(checked(out)).toBe("no");
    expect(out).toContain('<p class="invite-rsvp-status">You are attending.</p>');
    expect(out).toContain("“No, I cannot attend”. This is not saved yet");
    expect(out).toContain("Your saved answer stays as it is until you confirm.");
    expect(out).toContain("Confirm answer");
  });

  it("asks nothing when the link's answer is already the saved one", () => {
    const out = render("yes", saved(true));
    expect(checked(out)).toBe("yes");
    expect(out).not.toContain("not saved yet");
    expect(out).toContain("Save RSVP");
  });

  it("leaves the form as it was without a link answer", () => {
    expect(checked(render(null))).toBeUndefined();
    expect(checked(render(null, saved(false)))).toBe("no");
    expect(render(null)).toContain("Save RSVP");
    expect(render(null)).not.toContain("not saved yet");
  });

  it("reads in Vietnamese", () => {
    const out = render("yes", saved(false), "vi");
    expect(out).toContain("Câu trả lời này chưa được lưu");
    expect(out).toContain("Câu trả lời đã lưu vẫn được giữ nguyên");
    expect(out).toContain("Xác nhận câu trả lời");
  });
});

describe("InviteNotice", () => {
  it("is one short band: the missing link points to the guest portal", () => {
    const out = html(<InviteNotice i18n={i18n} kind="missing" event={event} />);
    expect(out).toContain("Open your invitation link first");
    expect(out).toContain('href="/me"');
    expect(out.match(/<section/g)).toHaveLength(1);
    expect(out).not.toContain("Ceremony Hall");
  });

  it("names the organizer when the link is invalid or expired", () => {
    expect(html(<InviteNotice i18n={i18n} kind="expired" event={event} />)).toContain("Organizer: The organizing team");
  });

  it("offers a retry for a temporary error", () => {
    const out = html(<InviteNotice i18n={i18n} kind="error" event={event} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Try again");
    expect(out).toContain('href="/invite"');
  });

  it("keeps the email's answer through a retry, and shows no form in any notice", () => {
    expect(html(<InviteNotice i18n={i18n} kind="error" event={event} linkAnswer="no" />)).toContain('href="/invite?answer=no"');
    for (const kind of ["missing", "invalid", "expired", "error"] as const) {
      expect(html(<InviteNotice i18n={i18n} kind={kind} event={event} linkAnswer="yes" />)).not.toContain("<form");
    }
  });
});
