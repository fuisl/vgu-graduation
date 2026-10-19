import nodemailer from "nodemailer";
import type { Config } from "../../config.js";

export interface MailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

/** One guest email. Every field is personal or a credential: never log a message. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}

/** Sends one message, resolving once the SMTP server accepted it. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** An admin waits on the invitation email, so a slow server fails the send instead of the request. */
const SMTP_TIMEOUT_MS = 15_000;

/** A mail catcher on this machine (Mailpit in local development) is the only server allowed without TLS. */
function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * The SMTP mailer (ADR-012): submission on 587 with STARTTLS required, as the
 * configured account. Null when mail is off. One pooled connection, so a burst of
 * invitations reuses a session instead of logging in to Gmail per message.
 */
export function createMailer(config: Config["mail"]): Mailer | null {
  if (!config.enabled) return null;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465 && !isLoopback(config.host),
    auth: { user: config.user, pass: config.password },
    pool: true,
    maxConnections: 1,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    // nodemailer's own logger would print envelopes (addresses): keep it off.
    logger: false,
    debug: false,
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
  };
}

/**
 * The error a failed send is reduced to before anything stores or logs it. SMTP
 * replies can quote the recipient address, so only nodemailer's error code survives.
 */
export function mailErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Z_]{2,40}$/.test(code) ? code : "SEND_FAILED";
}
