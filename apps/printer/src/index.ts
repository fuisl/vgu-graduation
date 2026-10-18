import { createHttpApi } from "./api.js";
import { Backoff } from "./backoff.js";
import { loadConfig } from "./config.js";
import { PrintDaemon } from "./daemon.js";
import { Journal } from "./journal.js";
import { createLogger, summarize } from "./log.js";
import { createCupsPrinter, createDryRunPrinter } from "./printer.js";

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const printer =
    config.mode === "dry-run"
      ? createDryRunPrinter(config.dryRunDir)
      : createCupsPrinter({
          lpPath: config.lpPath,
          printerName: config.printerName,
          lpOptions: config.lpOptions,
          timeoutMs: config.lpTimeoutMs,
        });

  const daemon = new PrintDaemon({
    api: createHttpApi({ apiUrl: config.apiUrl, serviceToken: config.serviceToken, timeoutMs: config.requestTimeoutMs }),
    printer,
    journal: new Journal(config.stateDir),
    stateDir: config.stateDir,
    logger,
    pollIntervalMs: config.pollIntervalMs,
    backoff: new Backoff(1_000, config.backoffMaxMs),
    journalRetentionMs: config.journalRetentionMs,
    leaseMarginMs: config.leaseMarginMs,
  });
  await daemon.init();

  // SIGTERM (pod shutdown) lets the job in hand finish, then exits.
  const stop = new AbortController();
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      logger.info("shutting down after the current job", { signal: sig });
      stop.abort();
    });
  }
  logger.info("printer configured", { mode: config.mode, printer: config.printerName ?? "(CUPS default)" });
  await daemon.run(stop.signal);
}

main().catch((err) => {
  createLogger("error").error("printer daemon failed to start", { error: summarize(err) });
  process.exit(1);
});
