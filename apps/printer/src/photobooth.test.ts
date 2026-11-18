import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent, type FormData } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApi } from "./api.js";
import { Backoff } from "./backoff.js";
import { loadConfig } from "./config.js";
import { AMBIGUOUS_ERROR, PrintDaemon } from "./daemon.js";
import { Journal } from "./journal.js";
import { createLogger } from "./log.js";
import {
  classifyFetchError,
  createPhotoboothPrinter,
  probePhotobooth,
  ticketFields,
  type BoothFetch,
  type PhotoboothSettings,
} from "./photobooth.js";
import { PrintNotSentError } from "./printer.js";
import { FakePrintApi } from "./test/fake-api.js";

const JOB_A = "6f1c2b9e-0d7a-4b8e-9c55-1a2b3c4d5e6f";
const PUBLIC_ID = "secret-public-id-a";

const settings: PhotoboothSettings = {
  url: "https://localhost:8000",
  insecureTls: false,
  defaultLayout: "polaroid",
  caption: "GRAD '26 · VGU",
  includeQr: false,
  includeQuote: true,
  timeoutMs: 1_000,
};

type Scripted = { status: number; body?: unknown } | { throws: unknown };

const printed = (): Scripted => ({
  status: 201,
  body: { token: "booth-keepsake-token", serial: 7, layout: "polaroid", print: { printed: true, dry_run: false, seconds: 3.75 } },
});

function connectError(code: string) {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`connect ${code} 127.0.0.1:8000`), { code }) });
}

/** A scripted stand-in for the booth's POST /api/tickets; unscripted calls print. */
class FakeBooth {
  script: Scripted[] = [];
  calls: { url: string; fields: Record<string, string>; photo: string | null; dispatcher: unknown }[] = [];
  /** Requests that the booth answered with a successful print. */
  get prints() {
    return this.calls.filter((_, i) => this.outcomes[i] === "printed").length;
  }
  private outcomes: string[] = [];

  fetch: BoothFetch = async (url, init) => {
    const fields: Record<string, string> = {};
    let photo: string | null = null;
    for (const [key, value] of (init.body as FormData | undefined)?.entries() ?? []) {
      if (typeof value === "string") fields[key] = value;
      else photo = Buffer.from(await value.arrayBuffer()).toString();
    }
    this.calls.push({ url, fields, photo, dispatcher: init.dispatcher });
    const next = this.script.shift() ?? printed();
    if ("throws" in next) {
      this.outcomes.push("threw");
      throw next.throws;
    }
    const body = next.body === undefined ? "" : JSON.stringify(next.body);
    const ok = (next.body as { print?: { printed?: boolean } } | undefined)?.print?.printed === true;
    this.outcomes.push(next.status === 201 && ok ? "printed" : "other");
    return new Response(body, { status: next.status, headers: { "content-type": "application/json" } });
  };
}

describe("photobooth config", () => {
  const base = { API_URL: "https://api.example.test", SERVICE_TOKEN: "t" };

  it("requires PHOTOBOOTH_URL in photobooth mode and has safe defaults", () => {
    expect(() => loadConfig({ ...base, PRINT_MODE: "photobooth" })).toThrow("Missing required environment variables: PHOTOBOOTH_URL");
    const config = loadConfig({ ...base, PRINT_MODE: "photobooth", PHOTOBOOTH_URL: "https://localhost:8000/" });
    expect(config.mode).toBe("photobooth");
    expect(config.photobooth).toEqual({
      url: "https://localhost:8000",
      insecureTls: false,
      defaultLayout: "polaroid",
      caption: "GRAD '26 · VGU",
      includeQr: false,
      includeQuote: true,
      timeoutMs: 60_000,
    });
  });

  it("parses booleans literally and validates the layout", () => {
    const config = loadConfig({
      ...base,
      PRINT_MODE: "photobooth",
      PHOTOBOOTH_URL: "https://localhost:8000",
      PHOTOBOOTH_INSECURE_TLS: "true",
      PHOTOBOOTH_INCLUDE_QUOTE: "false",
      PHOTOBOOTH_INCLUDE_QR: "0",
      PHOTOBOOTH_DEFAULT_LAYOUT: "boarding",
    });
    expect(config.photobooth).toMatchObject({ insecureTls: true, includeQuote: false, includeQr: false, defaultLayout: "boarding" });
    expect(() => loadConfig({ ...base, PHOTOBOOTH_DEFAULT_LAYOUT: "poster" })).toThrow();
    expect(() => loadConfig({ ...base, PHOTOBOOTH_INSECURE_TLS: "maybe" })).toThrow();
  });
});

describe("photobooth client", () => {
  let dir: string;
  let file: string;
  let booth: FakeBooth;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "grad-booth-"));
    file = path.join(dir, "job.jpg");
    await writeFile(file, "jpeg-bytes");
    booth = new FakeBooth();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("maps job options onto the booth's form, with daemon defaults for the rest", () => {
    expect(ticketFields({ jobId: JOB_A, file, copies: 1 }, settings)).toEqual({
      layout: "polaroid",
      orientation: "portrait",
      caption: "GRAD '26 · VGU",
      dither: "atkinson",
      ascii_mode: "false",
      include_quote: "true",
      include_qr: "false",
      strip_size: "half",
      do_print: "true",
      keep_original: "false",
    });
    expect(
      ticketFields({ jobId: JOB_A, file, copies: 1, options: { layout: "boarding", ascii: true, caption: "Class of 2026" } }, settings),
    ).toMatchObject({ layout: "boarding", ascii_mode: "true", caption: "Class of 2026" });
    expect(ticketFields({ jobId: JOB_A, file, copies: 1, options: { caption: "  " } }, settings).caption).toBe("GRAD '26 · VGU");
  });

  it("posts the photo once per copy with do_print and reports each confirmed copy", async () => {
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    const confirmed: number[] = [];
    await printer.print({ jobId: JOB_A, file, copies: 2, options: { layout: "strip" }, onCopyPrinted: async (n) => void confirmed.push(n) });
    expect(booth.calls).toHaveLength(2);
    expect(booth.calls[0]).toMatchObject({ url: "https://localhost:8000/api/tickets", photo: "jpeg-bytes", dispatcher: undefined });
    expect(booth.calls[0]!.fields).toMatchObject({ layout: "strip", do_print: "true" });
    expect(Object.keys(booth.calls[0]!.fields)).not.toContain("guest");
    expect(Object.keys(booth.calls[0]!.fields)).not.toContain("email");
    expect(confirmed).toEqual([1, 2]);
  });

  it("starts after copies an earlier attempt already printed", async () => {
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    await printer.print({ jobId: JOB_A, file, copies: 3, alreadyPrinted: 2 });
    expect(booth.calls).toHaveLength(1);
  });

  it("uses a dedicated dispatcher that skips certificate checks only when asked", async () => {
    const printer = createPhotoboothPrinter({ ...settings, insecureTls: true }, { fetchImpl: booth.fetch });
    await printer.print({ jobId: JOB_A, file, copies: 1 });
    expect(booth.calls[0]!.dispatcher).toBeInstanceOf(Agent);
  });

  it("4xx is a final failure with the booth's short reason", async () => {
    booth.script.push({ status: 400, body: { detail: "layout must be one of receipt, boarding, polaroid, photo, strip" } });
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    const err = await printer.print({ jobId: JOB_A, file, copies: 1 }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PrintNotSentError);
    expect((err as Error).message).toBe("Photobooth rejected the job (400): layout must be one of receipt, boarding, polaroid, photo, strip");
  });

  it("unreachable booth, TLS refusal and gateway 5xx are retryable (nothing was sent)", async () => {
    expect(classifyFetchError(connectError("ECONNREFUSED"))).toBeInstanceOf(PrintNotSentError);
    expect(classifyFetchError(connectError("EHOSTUNREACH"))).toBeInstanceOf(PrintNotSentError);
    const tls = classifyFetchError(connectError("DEPTH_ZERO_SELF_SIGNED_CERT"));
    expect(tls).toBeInstanceOf(PrintNotSentError);
    expect(tls.message).toContain("PHOTOBOOTH_INSECURE_TLS");

    booth.script.push({ status: 503, body: { detail: "busy" } });
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    await expect(printer.print({ jobId: JOB_A, file, copies: 1 })).rejects.toBeInstanceOf(PrintNotSentError);
  });

  it("a timeout or dropped connection after sending is final: it may have printed", async () => {
    const timeout = classifyFetchError(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(timeout).not.toBeInstanceOf(PrintNotSentError);
    expect(timeout.message).toMatch(/timed out after the job was sent/);
    expect(classifyFetchError(connectError("ECONNRESET"))).not.toBeInstanceOf(PrintNotSentError);

    booth.script.push({ status: 500, body: { detail: "Internal Server Error" } });
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    const err = await printer.print({ jobId: JOB_A, file, copies: 1 }).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(PrintNotSentError);
  });

  it("reads the booth's print outcome: no rows sent is retryable, a partial print is final, dry run counts", async () => {
    const printer = createPhotoboothPrinter(settings, { fetchImpl: booth.fetch });
    booth.script.push({
      status: 201,
      body: { print: { printed: false, error: "printing stopped after 0 of 1100 dot rows (192.168.1.8:9100) — [Errno 61] Connection refused" } },
    });
    await expect(printer.print({ jobId: JOB_A, file, copies: 1 })).rejects.toBeInstanceOf(PrintNotSentError);

    booth.script.push({ status: 201, body: { print: { printed: false, error: "printing stopped after 480 of 1100 dot rows — broken pipe" } } });
    const partial = await printer.print({ jobId: JOB_A, file, copies: 1 }).catch((e: unknown) => e);
    expect(partial).not.toBeInstanceOf(PrintNotSentError);
    expect((partial as Error).message).toMatch(/^Photobooth printer error: printing stopped after 480/);

    booth.script.push({ status: 201, body: { print: { printed: false, dry_run: true } } });
    await expect(printer.print({ jobId: JOB_A, file, copies: 1 })).resolves.toBeUndefined();

    booth.script.push({ status: 201, body: "not the booth" });
    await expect(printer.print({ jobId: JOB_A, file, copies: 1 })).rejects.toThrow(/unexpected response/);
  });

  it("probes /api/status without throwing", async () => {
    const ok: BoothFetch = async () => Response.json({ printer: { enabled: true, reachable: true, latency_ms: 4 } });
    expect(await probePhotobooth(settings, ok)).toEqual({ reachable: true, printerEnabled: true, printerReachable: true, latencyMs: 4 });
    const down: BoothFetch = async () => {
      throw connectError("ECONNREFUSED");
    };
    expect(await probePhotobooth(settings, down)).toEqual({ reachable: false, error: "ECONNREFUSED" });
  });
});

describe("PrintDaemon in photobooth mode", () => {
  let fake: FakePrintApi;
  let baseUrl: string;
  let stateDir: string;
  let logLines: string[];
  let clock: number;
  let booth: FakeBooth;

  beforeEach(async () => {
    clock = Date.parse("2026-11-20T03:00:00Z");
    fake = new FakePrintApi();
    fake.now = () => clock;
    baseUrl = await fake.start();
    stateDir = await mkdtemp(path.join(os.tmpdir(), "grad-printer-booth-"));
    logLines = [];
    booth = new FakeBooth();
  });

  afterEach(async () => {
    await fake.stop();
    await rm(stateDir, { recursive: true, force: true });
  });

  function api() {
    return createHttpApi({ apiUrl: baseUrl, serviceToken: fake.token, timeoutMs: 2_000 });
  }

  async function daemon(sleep: () => Promise<void> = async () => {}) {
    const logger = createLogger("debug", (line) => logLines.push(line));
    const d = new PrintDaemon({
      api: api(),
      printer: createPhotoboothPrinter(settings, { fetchImpl: booth.fetch, logger }),
      journal: new Journal(stateDir),
      stateDir,
      logger,
      pollIntervalMs: 1,
      backoff: new Backoff(1, 5, () => 0),
      journalRetentionMs: 60_000,
      leaseMarginMs: 30_000,
      now: () => clock,
      sleep,
    });
    await d.init();
    return d;
  }

  async function drain(d: PrintDaemon, max = 20) {
    for (let i = 0; i < max; i += 1) {
      try {
        if ((await d.tick()) === "idle") return;
      } catch {
        // the run loop backs off here
      }
    }
    throw new Error("daemon did not settle");
  }

  it("prints with the job's options and reports done", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID, options: { layout: "boarding", ascii: true } }, Buffer.from("img"));
    await drain(await daemon());
    expect(booth.calls).toHaveLength(1);
    expect(booth.calls[0]!.fields).toMatchObject({ layout: "boarding", ascii_mode: "true", caption: "GRAD '26 · VGU" });
    expect(booth.calls[0]!.photo).toBe("img");
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("uses the defaults for a job without options", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    await drain(await daemon());
    expect(booth.calls[0]!.fields).toMatchObject({ layout: "polaroid", ascii_mode: "false", include_qr: "false" });
  });

  it("reports a 4xx as failed with a short message, without retrying", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    booth.script.push({ status: 400, body: { detail: "could not read that image" } });
    await drain(await daemon());
    expect(booth.calls).toHaveLength(1);
    expect(fake.reports).toEqual([
      { id: JOB_A, body: { result: "failed", error: "Photobooth rejected the job (400): could not read that image" } },
    ]);
  });

  it("retries an unreachable booth with backoff and prints exactly once", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    booth.script.push({ throws: connectError("ECONNREFUSED") }, { status: 503 }, { throws: connectError("ENOTFOUND") });
    await drain(await daemon());
    expect(booth.calls).toHaveLength(4);
    expect(booth.prints).toBe(1);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("a crash after the request was sent is reported failed on restart, never re-sent", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    const journal = new Journal(stateDir);
    await journal.init();
    const job = (await api().next())!;
    await journal.put({
      id: job.id,
      photoPublicId: job.photoPublicId,
      copies: job.copies,
      imageUrl: job.imageUrl,
      attempt: job.attempt,
      leaseExpiresAt: job.leaseExpiresAt,
      options: job.options ?? null,
      phase: "submitting",
    });
    await drain(await daemon());
    expect(booth.calls).toEqual([]);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "failed", error: AMBIGUOUS_ERROR } }]);
  });

  it("a timeout while the booth works is reported failed, never re-sent", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    booth.script.push({ throws: new DOMException("The operation was aborted due to timeout", "TimeoutError") });
    await drain(await daemon());
    expect(booth.calls).toHaveLength(1);
    expect(fake.reports[0]!.body).toMatchObject({ result: "failed", error: expect.stringMatching(/timed out after the job was sent/) });
  });

  it("with several copies, a booth outage mid-job resumes at the next copy without reprinting", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID, copies: 3 });
    booth.script.push(printed(), { throws: connectError("ECONNREFUSED") });
    await drain(await daemon());
    expect(booth.prints).toBe(3);
    expect(booth.calls).toHaveLength(4);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("a final failure after some copies says how many came out", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID, copies: 2 });
    booth.script.push(printed(), { status: 201, body: { print: { printed: false, error: "printing stopped after 300 of 900 dot rows" } } });
    await drain(await daemon());
    expect(fake.reports).toEqual([
      {
        id: JOB_A,
        body: { result: "failed", error: "Printed 1 of 2 copies; Photobooth printer error: printing stopped after 300 of 900 dot rows" },
      },
    ]);
  });

  it("when the lease runs out after some copies, reports the partial print instead of dropping the claim", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID, copies: 2 });
    booth.script.push(printed(), { throws: connectError("ECONNREFUSED") });
    const d = await daemon();
    await expect(d.tick()).rejects.toBeInstanceOf(PrintNotSentError);
    expect((await new Journal(stateDir).get(JOB_A))).toMatchObject({ phase: "received", copiesPrinted: 1 });
    clock += 10 * 60_000; // the booth stayed away past the lease
    await drain(d);
    expect(booth.prints).toBe(1);
    expect(fake.reports).toEqual([
      {
        id: JOB_A,
        body: {
          result: "failed",
          error: "Printed 1 of 2 copies; the rest were not printed before the claim ran out. Re-queue for the missing copies.",
        },
      },
    ]);
  });

  it("never logs the service token, the photo's publicId or the booth's keepsake token", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: PUBLIC_ID });
    booth.script.push({ throws: connectError("ECONNREFUSED") });
    const stop = new AbortController();
    let sleeps = 0;
    const loop = await daemon(async () => {
      sleeps += 1;
      if (sleeps >= 3 || fake.reports.length > 0) stop.abort();
    });
    await loop.run(stop.signal);
    const logs = logLines.join("\n");
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
    expect(logs).toContain("Photobooth unreachable (ECONNREFUSED)");
    expect(logs).not.toContain(fake.token);
    expect(logs).not.toContain(PUBLIC_ID);
    expect(logs).not.toContain("booth-keepsake-token");
  });
});
