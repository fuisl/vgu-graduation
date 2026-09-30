import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
  // In production a dead idle connection means restart (k8s brings the pod back).
  // Under Vitest, test cleanup drops scratch databases WITH (FORCE), which kills
  // idle pooled connections on purpose; exiting there fails the whole run at random.
  if (process.env.VITEST) return;
  process.exit(-1);
});

/** Drizzle over the shared pool; the raw `pool` remains for hand-written SQL. */
export const db = drizzle(pool, { schema });
