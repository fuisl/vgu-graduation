import type { EmailStatus, MailLocale } from "@grad/contract";
import { config as defaultConfig, type Config } from "../../config.js";
import { buildIcs } from "../event/event.ics.js";
import { buildInviteRequest } from "./calendar-rsvp.js";
import { EventRepository, type EventStore } from "../event/event.repository.js";
import { createMailer, type Mailer, type MailMessage } from "./mailer.js";
import { calendarInviteEmail, invitationEmail, rsvpConfirmationEmail, type EventLinks } from "./templates.js";

let shared: Mailer | null | undefined;

/** One SMTP transport per process, however many services are built with the default. */
function defaultMailer(): Mailer | null {
  if (shared === undefined) shared = createMailer(defaultConfig.mail);
  return shared;
}

export type CalendarEmailResult = "sent" | "failed" | "not_configured" | "no_event";

export interface RsvpConfirmationInput {
  to: string;
  givenName: string;
  attending: boolean;
  plusOnesCount: number;
}

export type MailServiceConfig = Pick<Config, "publicOrigin" | "apiOrigin"> & {
  mail?: Pick<Config["mail"], "calendarRsvp" | "user">;
};

/** The public links an email may carry, derived from config like GET /event/calendar.ics does. */
export function eventLinks(config: Pick<Config, "publicOrigin" | "apiOrigin">): EventLinks & { uidDomain: string } {
  return {
    siteUrl: config.publicOrigin,
    webcalUrl: `${config.apiOrigin.replace(/^https?:/, "webcal:")}/event/calendar.ics`,
    uidDomain: new URL(config.publicOrigin).hostname,
  };
}

/**
 * Guest email (ADR-012). Each method returns how the send went instead of
 * throwing, so a mail problem never fails the admin action or RSVP around it.
 * Nothing here logs: callers log ids and the returned status only.
 */
export class MailService {
  private readonly links: ReturnType<typeof eventLinks>;
  /** The mailbox calendar replies go to, when calendar RSVP is on (ADR-013). */
  private readonly organizer: string | null;

  constructor(
    private readonly mailer: Mailer | null = defaultMailer(),
    private readonly events: Pick<EventStore, "get"> = new EventRepository(),
    config: MailServiceConfig = defaultConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.links = eventLinks(config);
    this.organizer = config.mail?.calendarRsvp && config.mail.user ? config.mail.user : null;
  }

  get enabled(): boolean {
    return this.mailer !== null;
  }

  /**
   * The invitation link, sent the moment it is issued or rotated: the token exists nowhere else.
   * With calendar RSVP on, it is also a calendar invitation for this guest (ADR-013).
   */
  async sendInvitation(input: {
    to: string | null;
    givenName: string;
    inviteUrl: string;
    invitationId: string;
    guestName: string;
  }): Promise<EmailStatus> {
    if (!this.mailer) return "not_configured";
    if (!input.to) return "no_address";
    const event = await this.events.get();
    if (!event) return "failed";
    const calendarRequest = this.organizer
      ? buildInviteRequest({
          event,
          invitationId: input.invitationId,
          uidDomain: this.links.uidDomain,
          siteUrl: this.links.siteUrl,
          organizer: { email: this.organizer, name: "GRAD '26" },
          attendee: { email: input.to, name: input.guestName },
          now: this.now(),
        })
      : undefined;
    return this.deliver(
      invitationEmail({
        to: input.to,
        givenName: input.givenName,
        inviteUrl: input.inviteUrl,
        event,
        siteUrl: this.links.siteUrl,
        calendarRequest,
      }),
    );
  }

  /** The calendar invite for an address the guest typed. The address is used for this send only. */
  async sendCalendarInvite(input: { to: string; locale: MailLocale }): Promise<CalendarEmailResult> {
    if (!this.mailer) return "not_configured";
    const event = await this.events.get();
    if (!event) return "no_event";
    const ics = buildIcs(event, { uidDomain: this.links.uidDomain, siteUrl: this.links.siteUrl });
    return this.deliver(calendarInviteEmail({ to: input.to, locale: input.locale, event, ics, links: this.links }));
  }

  /**
   * Used by the worker's job, which retries: unlike the others this throws on an
   * SMTP failure, so the queue backs off and tries again.
   */
  async sendRsvpConfirmation(input: RsvpConfirmationInput): Promise<"sent" | "not_configured" | "no_event"> {
    if (!this.mailer) return "not_configured";
    const event = await this.events.get();
    if (!event) return "no_event";
    await this.mailer.send(rsvpConfirmationEmail({ ...input, event, links: this.links }));
    return "sent";
  }

  private async deliver(message: MailMessage): Promise<"sent" | "failed"> {
    try {
      await this.mailer!.send(message);
      return "sent";
    } catch {
      return "failed";
    }
  }
}
