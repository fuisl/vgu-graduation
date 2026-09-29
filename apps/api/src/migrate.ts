import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "./config.js";

/** Migrations ship next to dist/ in the image: apps/api/drizzle, generated from src/db/schema.ts. */
const DEFAULT_MIGRATIONS_FOLDER = path.resolve(__dirname, "../drizzle");

/** Advisory lock key; any process holding it is the only one migrating. */
const MIGRATION_LOCK_KEY = "grad26:migrate";

/**
 * Applies pending migrations. Safe to run concurrently and repeatedly: a
 * session-level advisory lock serializes runners, so a rollout that starts two
 * pods never races itself, and already-applied migrations are skipped.
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  // A connection the server drops while idle or closing (restart, DROP DATABASE ... FORCE)
  // emits an 'error' event that would otherwise crash the process. Real migration
  // failures still surface through the awaited queries below.
  pool.on("error", () => {});
  // The lock lives on this dedicated connection; it is released on unlock or if the process dies.
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    try {
      await migrate(drizzle(pool), { migrationsFolder });
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations(config.databaseUrl)
    .then(() => {
      console.log("[apps/api] Migrations applied");
    })
    .catch((err) => {
      console.error("[apps/api] Migration failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
