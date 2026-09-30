import os from "node:os";
import { config } from "./config.js";
import { pool } from "./db/index.js";
import { JobQueue } from "./worker/queue.js";
import { runWorker, type JobHandlers, type WorkerLogger } from "./worker/worker.js";

/**
 * Worker entrypoint: the API image started with `node dist/worker.js`
 * (docs/architecture/target/applications-and-repository.md §4.3).
 */

/** Longest we wait for the job in progress before exiting anyway (k8s sends SIGKILL after 30s). */
const SHUTDOWN_TIMEOUT_MS = 25_000;

/** Registered as modules add job types (#59 derivatives, #72 print dispatch). */
const handlers: JobHandlers = {};

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

/** Structured JSON lines, matching the API's log shape. Fields carry ids only, never payloads. */
function jsonLogger(level: string): WorkerLogger {
  const min = LEVELS.indexOf(level as (typeof LEVELS)[number]);
  const write = (lvl: (typeof LEVELS)[number], fields: Record<string, unknown>, msg: string) => {
    if (level === "silent" || LEVELS.indexOf(lvl) < min) return;
    process.stdout.write(`${JSON.stringify({ level: lvl, time: Date.now(), ...fields, msg })}\n`);
  };
  return {
    info: (fields, msg) => write("info", fields, msg),
    error: (fields, msg) => write("error", fields, msg),
  };
}

async function main() {
  const logger = jsonLogger(config.logLevel);
  const workerId = `${os.hostname()}:${process.pid}`;
  const controller = new AbortController();

  const shutdown = (signal: string) => {
    if (controller.signal.aborted) return;
    logger.info({ signal }, "shutting down");
    controller.abort();
    setTimeout(() => {
      logger.error({}, "shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info({ workerId, jobTypes: Object.keys(handlers) }, "worker started");
  await runWorker({
    queue: new JobQueue(pool),
    handlers,
    workerId,
    logger,
    signal: controller.signal,
  });
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[apps/api] Worker crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
