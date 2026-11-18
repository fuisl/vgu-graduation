import { execFile } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrintOptions } from "@grad/contract";

export interface PrintRequest {
  jobId: string;
  /** Local path of the downloaded derivative (JPEG). */
  file: string;
  copies: number;
  /** The admin's per-job options; only the photobooth printer uses them. */
  options?: PrintOptions;
  /**
   * Copies already printed by an earlier attempt (photobooth mode prints one
   * copy per request); the printer starts after them. 0 when absent.
   */
  alreadyPrinted?: number;
  /** Called after each copy the printer confirms, with the total printed so far; awaited before the next copy. */
  onCopyPrinted?: (printed: number) => Promise<void>;
}

export interface Printer {
  /**
   * Resolves once the job is accepted (by CUPS, the photobooth, or written in
   * dry-run mode). Rejects with PrintNotSentError when nothing of the current
   * copy reached the printer (safe to retry), or any other error when the job
   * failed or may have partly printed (never retried).
   */
  print(request: PrintRequest): Promise<void>;
}

/**
 * The printer was never reached for the current copy (connection refused, no
 * route, TLS handshake failed, a gateway answered 502/503/504, or the booth
 * could not reach its printer before sending a single row). The daemon puts
 * the job back to `received` and retries with backoff; copies confirmed
 * before it are not printed again.
 */
export class PrintNotSentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintNotSentError";
  }
}

export type ExecFile = (
  file: string,
  args: string[],
  options: { timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync: ExecFile = (file, args, options) =>
  new Promise((resolve, reject) => {
    // No shell: arguments are passed as-is, so nothing in them is interpreted.
    execFile(file, args, { timeout: options.timeout, env: process.env }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr).trim().split("\n")[0];
        reject(new Error(detail ? `lp failed: ${detail}` : `lp failed: ${err.message}`));
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });

/** `lp` arguments for one job. Exported for tests. */
export function lpArgs(request: PrintRequest, options: { printerName?: string; lpOptions: string[] }): string[] {
  const args: string[] = [];
  if (options.printerName) args.push("-d", options.printerName);
  args.push("-n", String(request.copies));
  // The CUPS job title carries only our job id, so `lpstat -W all` can be matched to the queue.
  args.push("-t", `grad26-${request.jobId}`);
  for (const option of options.lpOptions) args.push("-o", option);
  args.push("--", request.file);
  return args;
}

/**
 * Prints through the CUPS client. The venue overlay points CUPS_SERVER at the
 * host's cupsd socket; the printer and its driver are configured there, once.
 */
export function createCupsPrinter(options: {
  lpPath: string;
  printerName?: string;
  lpOptions: string[];
  timeoutMs: number;
  exec?: ExecFile;
}): Printer {
  const run = options.exec ?? execFileAsync;
  return {
    async print(request) {
      await run(options.lpPath, lpArgs(request, options), { timeout: options.timeoutMs });
    },
  };
}

/**
 * Dry run: copies each job's image to `<dir>/<jobId>.jpg` with a JSON sidecar
 * instead of printing, so the whole flow can be exercised without a printer.
 */
export function createDryRunPrinter(dir: string): Printer {
  return {
    async print(request) {
      await mkdir(dir, { recursive: true });
      await copyFile(request.file, path.join(dir, `${request.jobId}.jpg`));
      await writeFile(
        path.join(dir, `${request.jobId}.json`),
        JSON.stringify(
          { jobId: request.jobId, copies: request.copies, options: request.options ?? null, printedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
    },
  };
}
