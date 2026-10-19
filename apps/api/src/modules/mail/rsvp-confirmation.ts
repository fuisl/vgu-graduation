import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { guests, invitations, rsvp } from "../../db/schema.js";
import type { Job, JobQueue } from "../../worker/queue.js";
import type { JobHandler } from "../../worker/worker.js";
import { MailService } from "./mail.service.js";
import { mailErrorCode } from "./mailer.js";

/** Worker job: confirm an RSVP to the guest's stored address (ADR-012). Payload: ids and a timestamp only. */
export const RSVP_CONFIRMATION_JOB = "mail.rsvp_confirmation";

/** Guests often save, then fix a plus-one: wait a little so one email covers the final answer. */
export const RSVP_CONFIRMATION_DELAY_MS = 2 * 60_000;

/** What the confirmation needs, read fresh when the job runs. Guest PII: never log it. */
export interface RsvpRecipient {
  email: string | null;
  givenName: string;
  invitationStatus: "active" | "revoked";
  attending: boolean;
  plusOnesCount: number;
  rsvpUpdatedAt: Date;
}

export interface RsvpRecipientStore {
  find(invitationId: string): Promise<RsvpRecipient | null>;
}

export class RsvpRecipientRepository implements RsvpRecipientStore {
  constructor(private readonly database: typeof db = db) {}

  async find(invitationId: string): Promise<RsvpRecipient | null> {
    const [row] = await this.database
      .select({
        email: guests.email,
        givenName: guests.givenName,
        invitationStatus: invitations.status,
        attending: rsvp.attending,
        plusOnesCount: rsvp.plusOnesCount,
        rsvpUpdatedAt: rsvp.updatedAt,
      })
      .from(invitations)
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .innerJoin(rsvp, eq(rsvp.invitationId, invitations.id))
      .where(eq(invitations.id, invitationId))
      .limit(1);
    return row ?? null;
  }
}

/** Queues the confirmation for an RSVP that was just saved. */
export function queueRsvpConfirmation(
  queue: Pick<JobQueue, "enqueue">,
  invitationId: string,
  rsvpUpdatedAt: string,
  now: () => number = Date.now,
): Promise<string> {
  return queue.enqueue(
    RSVP_CONFIRMATION_JOB,
    { invitationId, rsvpUpdatedAt },
    { runAt: new Date(now() + RSVP_CONFIRMATION_DELAY_MS), maxAttempts: 5 },
  );
}

export interface RsvpConfirmationDeps {
  mail?: Pick<MailService, "sendRsvpConfirmation">;
  recipients?: RsvpRecipientStore;
}

/**
 * Sends the confirmation, or quietly does nothing when it no longer applies: the
 * invitation was revoked, the guest has no address, or a later save queued its
 * own job (only the newest answer is confirmed). SMTP errors are reduced to a
 * code before the queue stores them, since a reply can quote the address.
 */
export function rsvpConfirmationHandler(deps: RsvpConfirmationDeps = {}): JobHandler {
  const mail = deps.mail ?? new MailService();
  const recipients = deps.recipients ?? new RsvpRecipientRepository();

  return async (job: Job) => {
    const { invitationId, rsvpUpdatedAt } = job.payload;
    if (typeof invitationId !== "string" || typeof rsvpUpdatedAt !== "string") {
      throw new Error(`${RSVP_CONFIRMATION_JOB} payload is incomplete`);
    }
    const recipient = await recipients.find(invitationId);
    if (!recipient || !recipient.email || recipient.invitationStatus !== "active") return;
    if (recipient.rsvpUpdatedAt.getTime() > new Date(rsvpUpdatedAt).getTime()) return;

    let result: Awaited<ReturnType<typeof mail.sendRsvpConfirmation>>;
    try {
      result = await mail.sendRsvpConfirmation({
        to: recipient.email,
        givenName: recipient.givenName,
        attending: recipient.attending,
        plusOnesCount: recipient.plusOnesCount,
      });
    } catch (error) {
      throw new Error(`rsvp confirmation not sent: ${mailErrorCode(error)}`);
    }
    // A worker without SMTP credentials (or an event row) can't send: fail so the job stays visible.
    if (result !== "sent") throw new Error(`rsvp confirmation not sent: ${result}`);
  };
}
