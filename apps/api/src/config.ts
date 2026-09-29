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
  /** Ed25519 private key for signing pass payloads (#35), PKCS#8 PEM or its base64. */
  PASS_SIGNING_KEY: z.string().optional(),
  /** Identifies the public key verifiers use; bump it when rotating PASS_SIGNING_KEY. */
  PASS_KEY_ID: z.string().default("pass-1"),
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
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;

export const config = loadConfig();
