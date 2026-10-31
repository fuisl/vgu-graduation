import type { EmailStatus } from "@grad/contract";
import { describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "../event/event.repository.js";
import { MailService } from "../mail/mail.service.js";
import { fakeMailer } from "../mail/mailer.fake.js";
import type { JoinStore, RegisterResult } from "./join.repository.js";
import { JoinService, generateJoinCode } from "./join.service.js";

const ORIGIN = "https://grad26.example.com";
const GRADUATE = { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", name: "Ann Nguyen", givenName: "Ann" };
const INVITATION_ID = "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const GUEST_ID = "7c2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";

const EVENT: StoredEvent = {
  name: "VGU Graduation Ceremony 2026",
  nameVi: "Lễ Tốt nghiệp VGU 2026",
  startsAt: new Date("2026-11-20T02:00:00Z"),
  endsAt: new Date("2026-11-20T05:00:00Z"),
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: true,
  venueName: "Ceremony Hall",
  venueAddress: "Ring Road 4",
  venueAddressVi: null,
  venueMapUrl: "https://maps.example.com/vgu",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  arrivalInfo: null,
  arrivalInfoVi: null,
  sequence: 0,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

function store(overrides: Partial<JoinStore> = {}, result: RegisterResult = { kind: "created", invitationId: INVITATION_ID, guestId: GUEST_ID, givenName: "Bao" }) {
  return {
    findGraduateByCode: vi.fn(async (code: string) => (code === "code-ann-123" ? GRADUATE : null)),
    findGraduateByEmail: vi.fn(async (email: string) =>
      email === "ann@example.com" ? { ...GRADUATE, email, joinCode: null as string | null } : null,
    ),
    ensureJoinCode: vi.fn(async (_id: string, candidate: string) => candidate),
    rotateJoinCode: vi.fn(async () => true),
    register: vi.fn(async () => result),
    discard: vi.fn(async () => {}),
    ...overrides,
  };
}

function mail(sendInvitation = vi.fn(async (): Promise<EmailStatus> => "sent"), enabled = true) {
  return { enabled, sendInvitation, sendJoinLink: vi.fn(async (): Promise<EmailStatus> => "sent") };
}

const register = { name: "Bao Tran", email: "bao@example.com" };

describe("JoinService.register", () => {
  it("invites a new guest with the graduate as inviter and mails the invitation link", async () => {
    const s = store();
    const m = mail();
    const service = new JoinService(s as JoinStore, m, ORIGIN);
    expect(await service.register("code-ann-123", register)).toBe("registered");
    expect(s.register).toHaveBeenCalledWith(expect.objectContaining({ graduateId: GRADUATE.id, name: "Bao Tran", email: "bao@example.com" }));
    const [[sent]] = m.sendInvitation.mock.calls as unknown as [[{ inviteUrl: string; to: string; givenName: string }]];
    expect(sent.to).toBe("bao@example.com");
    expect(sent.givenName).toBe("Bao");
    expect(sent.inviteUrl).toMatch(/^https:\/\/grad26\.example\.com\/invite\/[A-Za-z0-9_-]{22}$/);
    // Only the hash is stored: the raw token from the link never reaches the store.
    const token = sent.inviteUrl.split("/").pop()!;
    expect(JSON.stringify(vi.mocked(s.register).mock.calls)).not.toContain(token);
  });

  it("sends nothing for an address that is already invited", async () => {
    const m = mail();
    const service = new JoinService(store({}, { kind: "existing", invitationId: INVITATION_ID }), m, ORIGIN);
    expect(await service.register("code-ann-123", register)).toBe("registered");
    expect(m.sendInvitation).not.toHaveBeenCalled();
  });

  it("discards the registration when the email fails, so the guest can try again", async () => {
    const s = store();
    const service = new JoinService(s, mail(vi.fn(async (): Promise<EmailStatus> => "failed")), ORIGIN);
    expect(await service.register("code-ann-123", register)).toBe("send_failed");
    expect(s.discard).toHaveBeenCalledWith({ invitationId: INVITATION_ID, guestId: GUEST_ID, graduateId: GRADUATE.id });
  });

  it("rejects an unknown code, drops a filled honeypot, and stores nothing while mail is off", async () => {
    const s = store();
    const service = new JoinService(s, mail(), ORIGIN);
    expect(await service.register("nope-nope-nope", register)).toBe("unknown_code");
    expect(await service.register("code-ann-123", { ...register, website: "http://spam" })).toBe("registered");
    expect(s.register).not.toHaveBeenCalled();

    const off = new JoinService(s, mail(undefined, false), ORIGIN);
    expect(await off.register("code-ann-123", register)).toBe("not_configured");
    expect(s.register).not.toHaveBeenCalled();
  });
});

describe("JoinService.requestLink", () => {
  it("issues a code on the first request and mails the link to the graduate's stored address", async () => {
    const s = store();
    const m = mail();
    const service = new JoinService(s, m, ORIGIN, () => "fresh-code-1");
    expect(await service.requestLink({ email: "ann@example.com", locale: "vi" })).toBe("sent");
    expect(s.ensureJoinCode).toHaveBeenCalledWith(GRADUATE.id, "fresh-code-1");
    expect(m.sendJoinLink).toHaveBeenCalledWith({
      to: "ann@example.com",
      givenName: "Ann",
      locale: "vi",
      joinUrl: "https://grad26.example.com/join/fresh-code-1",
    });
  });

  it("re-sends the same link when the graduate already has one", async () => {
    const s = store({ findGraduateByEmail: vi.fn(async () => ({ ...GRADUATE, email: "ann@example.com", joinCode: "kept-code-1" })) });
    const m = mail();
    await new JoinService(s, m, ORIGIN).requestLink({ email: "ann@example.com", locale: "en" });
    expect(s.ensureJoinCode).not.toHaveBeenCalled();
    expect(m.sendJoinLink).toHaveBeenCalledWith(expect.objectContaining({ joinUrl: "https://grad26.example.com/join/kept-code-1" }));
  });

  it("sends nothing to an address that is not a graduate", async () => {
    const m = mail();
    expect(await new JoinService(store(), m, ORIGIN).requestLink({ email: "who@example.com", locale: "en" })).toBe("not_graduate");
    expect(m.sendJoinLink).not.toHaveBeenCalled();
  });
});

describe("join link email", () => {
  it("carries the link in the asked language and says it is meant to be shared", async () => {
    const fake = fakeMailer();
    const service = new MailService(fake.mailer, { get: async () => EVENT }, { publicOrigin: ORIGIN, apiOrigin: "https://api.example.com" });
    const joinUrl = `${ORIGIN}/join/abc-def-123`;
    expect(await service.sendJoinLink({ to: "ann@example.com", givenName: "Ann", locale: "en", joinUrl })).toBe("sent");
    expect(fake.sent[0].subject).toBe("Your guest link: VGU Graduation Ceremony 2026");
    expect(fake.sent[0].text).toContain(joinUrl);
    expect(fake.sent[0].text).toContain("Anyone with this link can register as your guest");
    expect(fake.sent[0].html).toContain(joinUrl);

    await service.sendJoinLink({ to: "ann@example.com", givenName: "Ann", locale: "vi", joinUrl });
    expect(fake.sent[1].subject).toContain("Lễ Tốt nghiệp VGU 2026");
    expect(fake.sent[1].text).toContain("Chào Ann");
  });
});

describe("generateJoinCode", () => {
  it("is 64-bit base64url and different every time", () => {
    const codes = new Set(Array.from({ length: 50 }, generateJoinCode));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[A-Za-z0-9_-]{11}$/);
  });
});
