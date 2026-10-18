import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError, createHttpApi } from "./api.js";
import { Backoff } from "./backoff.js";
import { loadConfig } from "./config.js";
import { Journal } from "./journal.js";
import { summarize } from "./log.js";
import { createCupsPrinter, lpArgs } from "./printer.js";

describe("loadConfig", () => {
  it("requires API_URL and SERVICE_TOKEN and names them without values", () => {
    expect(() => loadConfig({})).toThrow("Missing required environment variables: API_URL, SERVICE_TOKEN");
    expect(() => loadConfig({ API_URL: "https://api.example.test" })).toThrow(/SERVICE_TOKEN$/);
  });

  it("parses defaults, trims the API URL and splits lp options", () => {
    const config = loadConfig({
      API_URL: "https://api.example.test/",
      SERVICE_TOKEN: "t",
      LP_OPTIONS: "media=4x6, fit-to-page,,",
    });
    expect(config.apiUrl).toBe("https://api.example.test");
    expect(config.mode).toBe("cups");
    expect(config.lpOptions).toEqual(["media=4x6", "fit-to-page"]);
    expect(config.printerName).toBeUndefined();
  });

  it("accepts dry-run mode and rejects unknown modes", () => {
    expect(loadConfig({ API_URL: "http://x.test", SERVICE_TOKEN: "t", PRINT_MODE: "dry-run" }).mode).toBe("dry-run");
    expect(() => loadConfig({ API_URL: "http://x.test", SERVICE_TOKEN: "t", PRINT_MODE: "laser" })).toThrow();
  });
});

describe("lp", () => {
  const request = { jobId: "job-1", file: "/spool/job-1.jpg", copies: 2 };

  it("builds lp arguments without a shell", () => {
    expect(lpArgs(request, { printerName: "Selphy", lpOptions: ["media=4x6", "fit-to-page"] })).toEqual([
      "-d", "Selphy", "-n", "2", "-t", "grad26-job-1", "-o", "media=4x6", "-o", "fit-to-page", "--", "/spool/job-1.jpg",
    ]);
    expect(lpArgs(request, { lpOptions: [] })).toEqual(["-n", "2", "-t", "grad26-job-1", "--", "/spool/job-1.jpg"]);
  });

  it("runs the configured lp binary with a timeout and surfaces failures", async () => {
    const calls: unknown[] = [];
    const ok = createCupsPrinter({
      lpPath: "/usr/bin/lp",
      lpOptions: [],
      timeoutMs: 1234,
      exec: async (file, args, options) => {
        calls.push([file, args, options]);
        return { stdout: "request id is Selphy-12 (1 file(s))", stderr: "" };
      },
    });
    await ok.print(request);
    expect(calls).toEqual([["/usr/bin/lp", lpArgs(request, { lpOptions: [] }), { timeout: 1234 }]]);

    const failing = createCupsPrinter({
      lpPath: "lp",
      lpOptions: [],
      timeoutMs: 10,
      exec: async () => {
        throw new Error("lp failed: lp: No default destination.");
      },
    });
    await expect(failing.print(request)).rejects.toThrow("No default destination");
  });
});

describe("Backoff", () => {
  it("doubles up to the cap and resets", () => {
    const b = new Backoff(100, 1_000, () => 1);
    expect([b.next(), b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([100, 200, 400, 800, 1_000, 1_000]);
    b.reset();
    expect(b.next()).toBe(100);
  });

  it("applies full jitter", () => {
    const b = new Backoff(100, 1_000, () => 0.5);
    expect(b.next()).toBe(50);
  });
});

describe("Journal", () => {
  it("round-trips entries, lists unfinished ones and prunes old reported ones", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "grad-journal-"));
    let now = new Date("2026-11-20T02:00:00Z");
    const journal = new Journal(dir, () => now);
    await journal.init();
    await journal.put({ id: "a", photoPublicId: "p", copies: 1, phase: "reported", outcome: "done" });
    now = new Date("2026-11-20T03:00:00Z");
    await journal.put({ id: "b", photoPublicId: "p", copies: 1, phase: "printed" });

    expect((await journal.get("a"))?.outcome).toBe("done");
    expect(await journal.get("missing")).toBeNull();
    expect((await journal.unfinished()).map((e) => e.id)).toEqual(["b"]);
    expect(await journal.prune(30 * 60_000)).toBe(1);
    expect(await journal.get("a")).toBeNull();
    // No temp files are left behind by the atomic writes.
    expect((await readdir(path.join(dir, "journal"))).sort()).toEqual(["b.json"]);
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses ids that could escape the journal directory", async () => {
    const journal = new Journal(os.tmpdir());
    await expect(journal.get("../etc/passwd")).rejects.toThrow(/plain identifier/);
  });
});

describe("HTTP client", () => {
  it("classifies network errors as retryable without leaking the URL", async () => {
    const api = createHttpApi({
      apiUrl: "http://127.0.0.1:9",
      serviceToken: "t",
      timeoutMs: 500,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const err = await api.fetchDerivative("secret-public-id").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).retryable).toBe(true);
    expect((err as ApiError).message).not.toContain("secret-public-id");
  });

  it("treats 204 from next as an empty queue and rejects off-contract bodies", async () => {
    const empty = createHttpApi({ apiUrl: "http://x", serviceToken: "t", timeoutMs: 500, fetchImpl: async () => new Response(null, { status: 204 }) });
    expect(await empty.next()).toBeNull();
    const odd = createHttpApi({ apiUrl: "http://x", serviceToken: "t", timeoutMs: 500, fetchImpl: async () => Response.json({ job: { id: 1 } }) });
    await expect(odd.next()).rejects.toThrow(/did not match the contract/);
  });
});

describe("summarize", () => {
  it("keeps error text to one bounded line and drops query strings", () => {
    expect(summarize(new Error("bad\nthing at https://x.test/a?token=abc"))).toBe("bad thing at https://x.test/a?…");
    expect(summarize("x".repeat(400)).length).toBe(300);
  });
});
