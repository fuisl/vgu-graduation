import type { EmailStatus } from "@grad/contract";
import { describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "../event/event.repository.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import type { InvitationsRepository } from "../invitations/invitations.repository.js";
import { RsvpService } from "../rsvp/rsvp.service.js";
import { MailService } from "./mail.service.js";
import { mailErrorCode } from "./mailer.js";
import { fakeMailer } from "./mailer.fake.js";
import { SlidingWindowLimiter } from "./rate-limit.js";
import {
  RSVP_CONFIRMATION_DELAY_MS,
  RSVP_CONFIRMATION_JOB,
  queueRsvpConfirmation,
  rsvpConfirmationHandler,
  type RsvpRecipient,
} from "./rsvp-confirmation.js";
import { formatWhen } from "./templates.js";

const EVENT: StoredEvent = {
  name: "VGU Graduation Ceremony 2026",
  nameVi: "Lễ Tốt nghiệp VGU 2026",
  startsAt: new Date("2026-11-21T02:00:00Z"),
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: true,
  venueName: "Ceremony Hall",
  venueAddress: "Ring Road 4, Thu Dau Mot",
  venueAddressVi: "Đường Vành đai 4, Thủ Dầu Một",
  venueMapUrl: "https://maps.example.com/vgu",
  contactName: "Organizers",
  contactEmail: "organizers@example.com",
  contactPhone: null,
  arrivalInfo: null,
  arrivalInfoVi: null,
  sequence: 3,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const CONFIG = { publicOrigin: "https://grad26.example.com", apiOrigin: "https://api.grad26.example.com" };
const INVITE_URL = "https://grad26.example.com/invite/raw-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";

function mailService(event: StoredEvent | null = EVENT) {
  const fake = fakeMailer();
  return { ...fake, service: new MailService(fake.mailer, { get: async () => event }, CONFIG) };
}

describe("MailService", () => {
  it("reports not_configured without an SMTP account and sends nothing", async () => {
    const service = new MailService(null, { get: async () => EVENT }, CONFIG);
    expect(service.enabled).toBe(false);
    expect(await service.sendInvitation({ to: "guest@example.com", givenName: "An", inviteUrl: INVITE_URL })).toBe(
      "not_configured",
    );
    expect(await service.sendCalendarInvite({ to: "guest@example.com", locale: "en" })).toBe("not_configured");
  });

  it("mails the invitation link in the body only, in Vietnamese then English", async () => {
    const { service, sent } = mailService();
    expect(await service.sendInvitation({ to: "guest@example.com", givenName: "An", inviteUrl: INVITE_URL })).toBe("sent");
    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message.to).toBe("guest@example.com");
    expect(message.subject).not.toContain("raw-token-value");
    expect(message.text).toContain(INVITE_URL);
    expect(message.text.indexOf("Kính gửi An")).toBeLessThan(message.text.indexOf("Dear An"));
  });

  it("says no_address for a guest without email and failed when SMTP refuses", async () => {
    const { service, fail } = mailService();
    expect(await service.sendInvitation({ to: null, givenName: "An", inviteUrl: INVITE_URL })).toBe("no_address");
    fail();
    expect(await service.sendInvitation({ to: "guest@example.com", givenName: "An", inviteUrl: INVITE_URL })).toBe("failed");
  });

  it("attaches the .ics and the webcal feed to the calendar invite, in the asked language", async () => {
    const { service, sent } = mailService();
    expect(await service.sendCalendarInvite({ to: "guest@example.com", locale: "vi" })).toBe("sent");
    const [message] = sent;
    expect(message.subject).toContain("Lễ Tốt nghiệp VGU 2026");
    expect(message.text).toContain("webcal://api.grad26.example.com/event/calendar.ics");
    expect(message.attachments?.[0]).toMatchObject({ filename: "grad26.ics" });
    expect(message.attachments?.[0].content).toContain("BEGIN:VEVENT");
  });

  it("returns no_event for the calendar invite before the event is configured", async () => {
    const { service, sent } = mailService(null);
    expect(await service.sendCalendarInvite({ to: "guest@example.com", locale: "en" })).toBe("no_event");
    expect(sent).toHaveLength(0);
  });

  it("confirms an RSVP with attendance and plus-ones only", async () => {
    const { service, sent } = mailService();
    await service.sendRsvpConfirmation({ to: "guest@example.com", givenName: "An", attending: true, plusOnesCount: 2 });
    expect(sent[0].text).toContain("with 2 guests");
    expect(sent[0].text).toContain("cùng 2 người đi cùng");
  });

  it("throws on an RSVP confirmation SMTP failure so the job retries", async () => {
    const { service, fail } = mailService();
    fail();
    await expect(
      service.sendRsvpConfirmation({ to: "guest@example.com", givenName: "An", attending: false, plusOnesCount: 0 }),
    ).rejects.toThrow();
  });
});

describe("formatWhen", () => {
  it("shows the clock time only once confirmed", () => {
    // 02:00 UTC is 09:00 in Ho Chi Minh City. Exact punctuation varies with the ICU data, so check the parts.
    expect(formatWhen(EVENT, "en")).toMatch(/Saturday.*21 November 2026.*09:00$/);
    const unconfirmed = formatWhen({ ...EVENT, timeConfirmed: false }, "en");
    expect(unconfirmed).toMatch(/21 November 2026 \(time to be confirmed\)$/);
    expect(unconfirmed).not.toContain("09:00");
    expect(formatWhen({ ...EVENT, timeConfirmed: false }, "vi")).toContain("giờ sẽ được xác nhận sau");
  });
});

describe("mailErrorCode", () => {
  it("keeps nodemailer's code and drops messages that may quote an address", () => {
    expect(mailErrorCode(Object.assign(new Error("550 guest@example.com unknown"), { code: "EENVELOPE" }))).toBe("EENVELOPE");
    expect(mailErrorCode(new Error("550 guest@example.com unknown"))).toBe("SEND_FAILED");
    expect(mailErrorCode({ code: "guest@example.com" })).toBe("SEND_FAILED");
  });
});

describe("SlidingWindowLimiter", () => {
  it("allows the limit per window, then frees up as hits age out, and refunds", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    limiter.refund("a");
    expect(limiter.take("a")).toBe(true);
    now = 1000;
    expect(limiter.take("a")).toBe(true);
  });
});

describe("InvitationsService emails", () => {
  const guest = { id: INVITATION_ID, name: "Nguyễn An", givenName: "An", familyName: "Nguyễn", email: "guest@example.com", phone: null };

  function invitations(sendInvitation = vi.fn(async (): Promise<EmailStatus> => "sent")) {
    const repository = {
      createInvitation: async () => ({ invitationId: INVITATION_ID, guest, inviterUserIds: [], maxPlusOnes: 0 }),
      rotateTokenHash: async () => true,
      listForAdmin: async () => [{ guest }],
    } as unknown as InvitationsRepository;
    return { service: new InvitationsService(repository, () => new Date(), { sendInvitation }), sendInvitation };
  }

  it("mails the new link only when asked and still returns it", async () => {
    const { service, sendInvitation } = invitations();
    const quiet = await service.issueInvitation({ guestName: "Nguyễn An", inviterUserIds: [INVITATION_ID] }, "admin");
    expect(quiet.emailStatus).toBeUndefined();
    expect(sendInvitation).not.toHaveBeenCalled();

    const mailed = await service.issueInvitation(
      { guestName: "Nguyễn An", inviterUserIds: [INVITATION_ID], sendEmail: true },
      "admin",
    );
    expect(mailed.emailStatus).toBe("sent");
    expect(mailed.inviteUrl).toContain(mailed.token);
    expect(sendInvitation).toHaveBeenCalledWith({ to: "guest@example.com", givenName: "An", inviteUrl: mailed.inviteUrl });
  });

  it("mails the rotated link to the stored address", async () => {
    const { service, sendInvitation } = invitations(vi.fn(async (): Promise<EmailStatus> => "failed"));
    const rotated = await service.rotateInvitationToken(INVITATION_ID, "admin", { sendEmail: true });
    expect(rotated?.emailStatus).toBe("failed");
    expect(sendInvitation).toHaveBeenCalledWith(expect.objectContaining({ inviteUrl: rotated?.inviteUrl }));
  });
});

describe("RSVP confirmation", () => {
  const savedAt = new Date("2026-10-19T08:00:00.000Z");
  const recipient = (overrides: Partial<RsvpRecipient> = {}): RsvpRecipient => ({
    email: "guest@example.com",
    givenName: "An",
    invitationStatus: "active",
    attending: true,
    plusOnesCount: 1,
    rsvpUpdatedAt: savedAt,
    ...overrides,
  });
  const job = { id: "job-1", type: RSVP_CONFIRMATION_JOB, attempts: 1, maxAttempts: 5, payload: { invitationId: INVITATION_ID, rsvpUpdatedAt: savedAt.toISOString() } };

  it("queues ids and a timestamp only, a little later", async () => {
    const enqueue = vi.fn(async () => "job-1");
    await queueRsvpConfirmation({ enqueue }, INVITATION_ID, savedAt.toISOString(), () => 1_000);
    expect(enqueue).toHaveBeenCalledWith(
      RSVP_CONFIRMATION_JOB,
      { invitationId: INVITATION_ID, rsvpUpdatedAt: savedAt.toISOString() },
      { runAt: new Date(1_000 + RSVP_CONFIRMATION_DELAY_MS), maxAttempts: 5 },
    );
  });

  it("sends for the newest answer and skips stale, revoked or address-less ones", async () => {
    const send = vi.fn(async () => "sent" as const);
    const run = (row: RsvpRecipient | null) =>
      rsvpConfirmationHandler({ mail: { sendRsvpConfirmation: send }, recipients: { find: async () => row } })(job);

    await run(recipient());
    expect(send).toHaveBeenCalledWith({ to: "guest@example.com", givenName: "An", attending: true, plusOnesCount: 1 });
    send.mockClear();
    await run(recipient({ rsvpUpdatedAt: new Date(savedAt.getTime() + 1) }));
    await run(recipient({ invitationStatus: "revoked" }));
    await run(recipient({ email: null }));
    await run(null);
    expect(send).not.toHaveBeenCalled();
  });

  it("fails with a bare code so the queue never stores an SMTP reply", async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("550 5.1.1 guest@example.com does not exist"), { code: "EENVELOPE" });
    });
    const handler = rsvpConfirmationHandler({ mail: { sendRsvpConfirmation: send }, recipients: { find: async () => recipient() } });
    const error = await handler(job).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("rsvp confirmation not sent: EENVELOPE");
  });

  it("is queued by PUT /rsvp only for a guest with an address", async () => {
    const enqueue = vi.fn(async () => "job-1");
    const rsvp = { id: INVITATION_ID, attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: savedAt, accessibility: null };
    const service = (email: string | null) =>
      new RsvpService(
        {
          resolveByToken: async () => ({
            status: "ok",
            invitation: {
              id: INVITATION_ID,
              guest: { id: INVITATION_ID, name: "An", email, phone: null },
              maxPlusOnes: 1,
              status: "active",
              validFrom: null,
              validUntil: null,
              inviters: [],
              rsvp: null,
            },
          }),
        },
        { upsert: async () => rsvp, listAll: async () => [], findForInvitation: async () => null, listAccessibility: async () => [] },
        { enqueue },
      );

    expect(await service(null).putByToken("t", { attending: true, plusOnesCount: 0 })).not.toHaveProperty("confirmation");
    expect(enqueue).not.toHaveBeenCalled();
    expect(await service("guest@example.com").putByToken("t", { attending: true, plusOnesCount: 0 })).toMatchObject({
      status: "ok",
      confirmation: "queued",
    });
    enqueue.mockRejectedValueOnce(new Error("db down"));
    expect(await service("guest@example.com").putByToken("t", { attending: true, plusOnesCount: 0 })).toMatchObject({
      status: "ok",
      confirmation: "failed",
    });
  });
});
