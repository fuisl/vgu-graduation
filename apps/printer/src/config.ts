import { z } from "zod";

/**
 * Printer daemon configuration, from the environment only. The venue overlay
 * in fuisl/vgu-graduation-deployment (workloads/venue/printer) sets these.
 */
const envSchema = z.object({
  /** Base URL of apps/api, e.g. https://api.grad26.fuisloy.dev or the in-cluster Service. */
  API_URL: z.string().url().optional(),
  /** The printer's service token (the API's SERVICE_TOKEN_PRINTER). Never logged. */
  SERVICE_TOKEN: z.string().optional(),
  /** `cups` prints with `lp`; `dry-run` writes each job's image to DRY_RUN_DIR instead. */
  PRINT_MODE: z.enum(["cups", "dry-run"]).default("cups"),
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
  /** Settled journal entries older than this are deleted (they only guard against re-delivery). */
  JOURNAL_RETENTION_HOURS: z.coerce.number().positive().default(72),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  // Names only, never values: SERVICE_TOKEN is a credential.
  const missing = (["API_URL", "SERVICE_TOKEN"] as const).filter((key) => !parsed[key]);
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
    journalRetentionMs: parsed.JOURNAL_RETENTION_HOURS * 3_600_000,
    logLevel: parsed.LOG_LEVEL,
  };
}

export type Config = ReturnType<typeof loadConfig>;
