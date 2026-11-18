import { DEFAULT_PRINT_LAYOUT, printLayoutSchema } from "@grad/contract";
import { z } from "zod";

/** An env boolean: true/false/1/0/yes/no (z.coerce.boolean would read "false" as true). */
function bool(fallback: boolean) {
  return z
    .enum(["true", "false", "1", "0", "yes", "no", ""])
    .optional()
    .transform((value) => (value === undefined || value === "" ? fallback : ["true", "1", "yes"].includes(value)));
}

/**
 * Printer daemon configuration, from the environment only. The venue overlay
 * in fuisl/vgu-graduation-deployment (workloads/venue/printer) sets these.
 */
const envSchema = z.object({
  /** Base URL of apps/api, e.g. https://api.grad26.fuisloy.dev or the in-cluster Service. */
  API_URL: z.string().url().optional(),
  /** The printer's service token (the API's SERVICE_TOKEN_PRINTER). Never logged. */
  SERVICE_TOKEN: z.string().optional(),
  /**
   * `cups` prints with `lp`; `dry-run` writes each job's image to DRY_RUN_DIR
   * instead; `photobooth` hands it to the venue's thermal Receipt Photobooth
   * (POST {PHOTOBOOTH_URL}/api/tickets), which prints it in a layout.
   */
  PRINT_MODE: z.enum(["cups", "dry-run", "photobooth"]).default("cups"),
  /** Receipt Photobooth base URL on the venue LAN, e.g. https://localhost:8000. Required in photobooth mode. */
  PHOTOBOOTH_URL: z.string().url().optional(),
  /**
   * Accept the booth's self-signed certificate. Applies to requests to the
   * booth only (its own connection pool), never to the API or anything else.
   */
  PHOTOBOOTH_INSECURE_TLS: bool(false),
  /** Layout for jobs that don't choose one. */
  PHOTOBOOTH_DEFAULT_LAYOUT: printLayoutSchema.default(DEFAULT_PRINT_LAYOUT),
  /** Caption for jobs that don't set one (the booth's layouts print it under the photo). */
  PHOTOBOOTH_CAPTION: z.string().max(120).default("GRAD '26 · VGU"),
  /** Off by default: the booth's QR points at its LAN address, which guests can't reach. */
  PHOTOBOOTH_INCLUDE_QR: bool(false),
  /** The booth's quote of the day on receipt-style layouts. */
  PHOTOBOOTH_INCLUDE_QUOTE: bool(true),
  /** Per booth request; it composes and prints before answering (a polaroid takes ~4 s). */
  PHOTOBOOTH_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  DRY_RUN_DIR: z.string().default("./dry-run-output"),
  /** CUPS queue name (`lp -d`); unset uses the CUPS default printer. */
  PRINTER_NAME: z.string().optional(),
  /** Extra `lp -o` options, comma-separated, e.g. `media=4x6,fit-to-page`. */
  LP_OPTIONS: z.string().default("fit-to-page"),
  LP_PATH: z.string().default("lp"),
  LP_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Journal and spool directory; must survive restarts for the no-double-print guarantee. */
  STATE_DIR: z.string().default("/var/lib/grad-printer"),
  /** Wait between polls while the queue is empty. */
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3_000),
  /** Cap for the exponential backoff after errors. */
  BACKOFF_MAX_MS: z.coerce.number().int().positive().default(60_000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /**
   * A claimed job is only sent to the printer while at least this much of its
   * lease (PRINT_LEASE_SECONDS, 5 min) is left; covers clock skew between the
   * venue host and the API, and the report's round trip.
   */
  LEASE_MARGIN_MS: z.coerce.number().int().min(0).default(30_000),
  /** Settled journal entries older than this are deleted (they only guard against re-delivery). */
  JOURNAL_RETENTION_HOURS: z.coerce.number().positive().default(72),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  // Names only, never values: SERVICE_TOKEN is a credential.
  const missing: string[] = (["API_URL", "SERVICE_TOKEN"] as const).filter((key) => !parsed[key]);
  if (parsed.PRINT_MODE === "photobooth" && !parsed.PHOTOBOOTH_URL) missing.push("PHOTOBOOTH_URL");
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    apiUrl: parsed.API_URL!.replace(/\/+$/, ""),
    serviceToken: parsed.SERVICE_TOKEN!,
    mode: parsed.PRINT_MODE,
    dryRunDir: parsed.DRY_RUN_DIR,
    printerName: parsed.PRINTER_NAME || undefined,
    lpOptions: parsed.LP_OPTIONS.split(",").map((o) => o.trim()).filter(Boolean),
    lpPath: parsed.LP_PATH,
    lpTimeoutMs: parsed.LP_TIMEOUT_MS,
    stateDir: parsed.STATE_DIR,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    backoffMaxMs: parsed.BACKOFF_MAX_MS,
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    leaseMarginMs: parsed.LEASE_MARGIN_MS,
    journalRetentionMs: parsed.JOURNAL_RETENTION_HOURS * 3_600_000,
    photobooth: {
      url: (parsed.PHOTOBOOTH_URL ?? "").replace(/\/+$/, ""),
      insecureTls: parsed.PHOTOBOOTH_INSECURE_TLS,
      defaultLayout: parsed.PHOTOBOOTH_DEFAULT_LAYOUT,
      caption: parsed.PHOTOBOOTH_CAPTION,
      includeQr: parsed.PHOTOBOOTH_INCLUDE_QR,
      includeQuote: parsed.PHOTOBOOTH_INCLUDE_QUOTE,
      timeoutMs: parsed.PHOTOBOOTH_TIMEOUT_MS,
    },
    logLevel: parsed.LOG_LEVEL,
  };
}

export type Config = ReturnType<typeof loadConfig>;
