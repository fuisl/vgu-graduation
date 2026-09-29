import { config } from "./config.js";
import { pool } from "./db/index.js";
import { buildServer } from "./server.js";

/** Longest we wait for in-flight requests before exiting anyway (k8s sends SIGKILL after 30s). */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const server = buildServer();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ signal }, "shutting down");

    const forceExit = setTimeout(() => {
      server.log.error("shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      // Stop accepting connections, let in-flight requests finish, then release the database.
      await server.close();
      await pool.end();
      process.exit(0);
    } catch (err) {
      server.log.error(err, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await server.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`[apps/api] Running on http://${config.host}:${config.port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
