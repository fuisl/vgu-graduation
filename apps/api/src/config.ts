import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

// Load root or local .env if available
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

const DEV_ADMIN_SESSION_SECRET = "dev-only-change-me";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  DATABASE_URL: z.string().default("postgres://grad:grad_local_dev@localhost:5432/grad26"),
  PUBLIC_ORIGIN: z.string().default("http://localhost:3000"),
  API_ORIGIN: z.string().default("http://localhost:4000"),
  COOKIE_DOMAIN: z.string().default("localhost"),
  ADMIN_SESSION_SECRET: z.string().min(1).default(DEV_ADMIN_SESSION_SECRET),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_ORIGINALS: z.string().optional(),
  S3_BUCKET_DERIVATIVES: z.string().optional(),
  SERVICE_TOKEN_TRANSLATION: z.string().optional(),
  SERVICE_TOKEN_PRINTER: z.string().optional(),
  /**
   * Venue capture client's token for `WS /live/ingest` (ADR-007), separate from
   * the translation service's. Optional even in production: translation is
   * experimental, and unset just means ingest refuses everyone.
   */
  SERVICE_TOKEN_INGEST: z.string().optional(),
  /** Translation service's audio WebSocket on the cluster network, e.g. ws://translation:8000/ingest. Unset: ingest reports unavailable. */
  TRANSLATION_INGEST_URL: z.string().url().optional(),
  /** Concurrent `WS /live/translation` sockets; beyond it the handshake gets 503 and clients poll over HTTP. */
  LIVE_TRANSLATION_MAX_CLIENTS: z.coerce.number().int().positive().default(1000),
  /** Concurrent `WS /live/gallery` sockets (ADR-014); beyond it the handshake gets 503 and pages poll `GET /live/gallery/feed`. */
  LIVE_GALLERY_MAX_CLIENTS: z.coerce.number().int().positive().default(1000),
  /** Ed25519 private key for signing pass payloads (#35), PKCS#8 PEM or its base64. */
  PASS_SIGNING_KEY: z.string().optional(),
  /** Identifies the public key verifiers use; bump it when rotating PASS_SIGNING_KEY. */
  PASS_KEY_ID: z.string().default("pass-1"),
  /** Lets guests queue prints of photos themselves (#72, experimental). Off unless "true". */
  PRINT_GUEST_REQUESTS_ENABLED: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  /**
   * Guest email (ADR-012): SMTP submission with STARTTLS, Gmail by default. Mail is
   * on only when SMTP_USER and SMTP_PASSWORD (a Google app password) are both set;
   * unset, every email reports `not_configured` and the venue form stays hidden.
   */
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Sender as guests see it, e.g. `GRAD '26 <you@gmail.com>`. Defaults to SMTP_USER. Gmail rewrites any other address to SMTP_USER. */
  MAIL_FROM: z.string().optional(),
  /**
   * Calendar RSVP by email (ADR-013). "true" makes the invitation email a calendar
   * request (Yes/Maybe/No in Gmail, Outlook, Apple) and lets the worker read the
   * replies from the same mailbox over IMAP. Needs mail on; off otherwise.
   */
  MAIL_CALENDAR_RSVP: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  IMAP_HOST: z.string().default("imap.gmail.com"),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  /** The receiving server's name in Authentication-Results; only its verdict is trusted. */
  MAIL_AUTHSERV_ID: z.string().default("mx.google.com"),
  /** How often the worker checks the mailbox for calendar replies. */
  MAIL_REPLY_POLL_SECONDS: z.coerce.number().int().min(15).default(60),
});

/** Variables with no safe default: a deployed API must not boot without them. */
const REQUIRED_IN_PRODUCTION = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET_ORIGINALS",
  "S3_BUCKET_DERIVATIVES",
  "SERVICE_TOKEN_TRANSLATION",
  "SERVICE_TOKEN_PRINTER",
  "PASS_SIGNING_KEY",
] as const;

/**
 * Parses configuration from the environment only
 * (docs/architecture/target/applications-and-repository.md §4.3). Throws with
 * the names of missing variables, never their values.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const isProduction = parsed.NODE_ENV === "production";

  if (isProduction) {
    const missing: string[] = REQUIRED_IN_PRODUCTION.filter((key) => !parsed[key]);
    if (parsed.ADMIN_SESSION_SECRET === DEV_ADMIN_SESSION_SECRET) {
      missing.push("ADMIN_SESSION_SECRET");
    }
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === "development" ? "info" : "warn"),
    databaseUrl: parsed.DATABASE_URL,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    apiOrigin: parsed.API_ORIGIN,
    cookieDomain: parsed.COOKIE_DOMAIN,
    adminSessionSecret: parsed.ADMIN_SESSION_SECRET,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      bucketOriginals: parsed.S3_BUCKET_ORIGINALS,
      bucketDerivatives: parsed.S3_BUCKET_DERIVATIVES,
    },
    pass: {
      signingKey: parsed.PASS_SIGNING_KEY,
      keyId: parsed.PASS_KEY_ID,
    },
    serviceTokens: {
      translation: parsed.SERVICE_TOKEN_TRANSLATION,
      printer: parsed.SERVICE_TOKEN_PRINTER,
      ingest: parsed.SERVICE_TOKEN_INGEST,
    },
    translation: {
      ingestUrl: parsed.TRANSLATION_INGEST_URL,
      maxClients: parsed.LIVE_TRANSLATION_MAX_CLIENTS,
    },
    live: {
      galleryMaxClients: parsed.LIVE_GALLERY_MAX_CLIENTS,
    },
    print: {
      guestRequestsEnabled: parsed.PRINT_GUEST_REQUESTS_ENABLED,
    },
    mail: {
      enabled: Boolean(parsed.SMTP_USER && parsed.SMTP_PASSWORD),
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      user: parsed.SMTP_USER,
      password: parsed.SMTP_PASSWORD,
      from: parsed.MAIL_FROM || parsed.SMTP_USER,
      calendarRsvp: Boolean(parsed.SMTP_USER && parsed.SMTP_PASSWORD) && parsed.MAIL_CALENDAR_RSVP,
      imapHost: parsed.IMAP_HOST,
      imapPort: parsed.IMAP_PORT,
      authservId: parsed.MAIL_AUTHSERV_ID,
      replyPollMs: parsed.MAIL_REPLY_POLL_SECONDS * 1000,
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;

export const config = loadConfig();
