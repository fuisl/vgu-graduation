import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpApi, type PrintApi } from "./api.js";
import { Backoff } from "./backoff.js";
import { AMBIGUOUS_ERROR, PrintDaemon } from "./daemon.js";
import { Journal } from "./journal.js";
import { createLogger } from "./log.js";
import { createDryRunPrinter, type PrintRequest, type Printer } from "./printer.js";
import { FakePrintApi } from "./test/fake-api.js";

const JOB_A = "6f1c2b9e-0d7a-4b8e-9c55-1a2b3c4d5e6f";
const JOB_B = "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b";

class RecordingPrinter implements Printer {
  calls: PrintRequest[] = [];
  images: string[] = [];
  failWith: Error | null = null;
  async print(request: PrintRequest) {
    if (this.failWith) throw this.failWith;
    this.calls.push(request);
    this.images.push(await readFile(request.file, "utf8"));
  }
}

let fake: FakePrintApi;
let baseUrl: string;
let stateDir: string;
let logLines: string[];

beforeEach(async () => {
  fake = new FakePrintApi();
  baseUrl = await fake.start();
  stateDir = await mkdtemp(path.join(os.tmpdir(), "grad-printer-"));
  logLines = [];
});

afterEach(async () => {
  await fake.stop();
  await rm(stateDir, { recursive: true, force: true });
});

function api(token = fake.token): PrintApi {
  return createHttpApi({ apiUrl: baseUrl, serviceToken: token, timeoutMs: 2_000 });
}

async function daemon(printer: Printer, client: PrintApi = api()) {
  const d = new PrintDaemon({
    api: client,
    printer,
    journal: new Journal(stateDir),
    stateDir,
    logger: createLogger("debug", (line) => logLines.push(line)),
    pollIntervalMs: 1,
    backoff: new Backoff(1, 5, () => 0),
    journalRetentionMs: 60_000,
    sleep: async () => {},
  });
  await d.init();
  return d;
}

/** Ticks until the daemon reports idle (or gives up), swallowing errors like the run loop does. */
async function drain(d: PrintDaemon, max = 20) {
  for (let i = 0; i < max; i += 1) {
    try {
      if ((await d.tick()) === "idle") return;
    } catch {
      // the run loop would back off here
    }
  }
  throw new Error("daemon did not settle");
}

describe("PrintDaemon", () => {
  it("prints a queued job with its copies and reports done", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a", copies: 2 }, Buffer.from("image-a"));
    const printer = new RecordingPrinter();
    await drain(await daemon(printer));

    expect(printer.calls).toHaveLength(1);
    expect(printer.calls[0]).toMatchObject({ jobId: JOB_A, copies: 2 });
    expect(printer.images).toEqual(["image-a"]);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
    // The spool file is cleaned up after printing.
    expect(await readdir(path.join(stateDir, "spool"))).toEqual([]);
  });

  it("is idle and prints nothing when the queue is empty", async () => {
    const printer = new RecordingPrinter();
    expect(await (await daemon(printer)).tick()).toBe("idle");
    expect(printer.calls).toEqual([]);
  });

  it("sends the service token to internal routes only, never to the public media route", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    await drain(await daemon(new RecordingPrinter()));
    expect(fake.authHeaders.every((h) => h === `Bearer ${fake.token}`)).toBe(true);
    expect(fake.mediaAuthHeaders).toEqual([undefined]);
  });

  it("reports failed without printing when the photo is no longer available", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    fake.images.delete("pub-a");
    const printer = new RecordingPrinter();
    await drain(await daemon(printer));
    expect(printer.calls).toEqual([]);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "failed", error: "Photo is not available to print (404)" } }]);
  });

  it("retries a derivative download that fails transiently, then prints once", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    fake.failNext.media.push(503, 502);
    const printer = new RecordingPrinter();
    await drain(await daemon(printer));
    expect(printer.calls).toHaveLength(1);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("reports failed with lp's message when CUPS rejects the job", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    const printer = new RecordingPrinter();
    printer.failWith = new Error("lp failed: lp: The printer or class does not exist.");
    await drain(await daemon(printer));
    expect(fake.reports).toEqual([
      { id: JOB_A, body: { result: "failed", error: "lp failed: lp: The printer or class does not exist." } },
    ]);
  });

  it("keeps retrying the report with backoff and never prints twice", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    fake.failNext.done.push(500, 503, 502);
    const printer = new RecordingPrinter();
    const d = await daemon(printer);
    await drain(d);
    expect(printer.calls).toHaveLength(1);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("after a crash between printing and reporting, a restart reports done without reprinting", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    // The API is unreachable for the report, then the process dies.
    fake.failNext.done.push(503);
    const first = new RecordingPrinter();
    const d1 = await daemon(first);
    await expect(d1.tick()).rejects.toThrow(/returned 503/);
    expect(first.calls).toHaveLength(1);

    const second = new RecordingPrinter();
    await drain(await daemon(second));
    expect(second.calls).toEqual([]);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("a crash mid-submission is reported failed, never reprinted", async () => {
    const journal = new Journal(stateDir);
    await journal.init();
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    // Simulate: the job was handed out and journalled as submitting when the process died.
    await api().next();
    await journal.put({ id: JOB_A, photoPublicId: "pub-a", copies: 1, phase: "submitting" });

    const printer = new RecordingPrinter();
    await drain(await daemon(printer));
    expect(printer.calls).toEqual([]);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "failed", error: AMBIGUOUS_ERROR } }]);
  });

  it("a crash before anything reached CUPS prints the job on restart", async () => {
    const journal = new Journal(stateDir);
    await journal.init();
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    await api().next();
    await journal.put({ id: JOB_A, photoPublicId: "pub-a", copies: 1, phase: "received" });

    const printer = new RecordingPrinter();
    await drain(await daemon(printer));
    expect(printer.calls).toHaveLength(1);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("a job handed out again after its report was lost is re-reported, not reprinted", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    const printer = new RecordingPrinter();
    const d = await daemon(printer);
    await drain(d);
    // The API lost the report and re-queues the same job (e.g. a stale `printing` sweep).
    fake.reports = [];
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    await drain(d);
    expect(printer.calls).toHaveLength(1);
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });

  it("treats a repeated report the API already settled (409) as done", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    const d = await daemon(new RecordingPrinter());
    await drain(d);
    const journal = new Journal(stateDir);
    // Pretend the report's acknowledgement was lost: back to `printed`.
    const entry = await journal.get(JOB_A);
    await journal.put({ ...entry!, phase: "printed" });
    await drain(d);
    expect((await journal.get(JOB_A))?.phase).toBe("reported");
    expect(fake.reports).toHaveLength(1);
  });

  it("works through several jobs in queue order", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" }, Buffer.from("a"));
    fake.addJob({ id: JOB_B, photoPublicId: "pub-b" }, Buffer.from("b"));
    const printer = new RecordingPrinter();
    await drain(await daemon(printer));
    expect(printer.images).toEqual(["a", "b"]);
    expect(fake.reports.map((r) => r.id)).toEqual([JOB_A, JOB_B]);
  });

  it("backs off on a wrong token and never logs it", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a" });
    const printer = new RecordingPrinter();
    const d = await daemon(printer, api("wrong-token-value"));
    const stop = new AbortController();
    let sleeps = 0;
    const loop = new PrintDaemon({
      api: api("wrong-token-value"),
      printer,
      journal: new Journal(stateDir),
      stateDir,
      logger: createLogger("debug", (line) => logLines.push(line)),
      pollIntervalMs: 1,
      backoff: new Backoff(1, 5, () => 0),
      journalRetentionMs: 60_000,
      sleep: async () => {
        sleeps += 1;
        if (sleeps >= 3) stop.abort();
      },
    });
    await expect(d.tick()).rejects.toThrow(/returned 401/);
    await loop.run(stop.signal);
    expect(printer.calls).toEqual([]);
    expect(logLines.some((l) => l.includes("backing off"))).toBe(true);
    expect(logLines.join("\n")).not.toContain("wrong-token-value");
    expect(logLines.join("\n")).not.toContain("pub-a");
  });

  it("dry-run mode writes the image and a sidecar instead of printing", async () => {
    fake.addJob({ id: JOB_A, photoPublicId: "pub-a", copies: 3 }, Buffer.from("dry-image"));
    const out = path.join(stateDir, "out");
    await drain(await daemon(createDryRunPrinter(out)));
    expect(await readFile(path.join(out, `${JOB_A}.jpg`), "utf8")).toBe("dry-image");
    expect(JSON.parse(await readFile(path.join(out, `${JOB_A}.json`), "utf8"))).toMatchObject({ jobId: JOB_A, copies: 3 });
    expect(fake.reports).toEqual([{ id: JOB_A, body: { result: "done" } }]);
  });
});
