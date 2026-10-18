import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ClaimedPrintJob, CompletePrintJobRequest, PrintJob, PrintJobStatus } from "@grad/contract";

interface FakeJob {
  job: PrintJob;
  status: PrintJobStatus;
  attempt: number;
  leaseExpiresAt: number | null;
}

/**
 * A small in-memory stand-in for apps/api's print queue (#72), served over real
 * HTTP so the daemon's client is exercised end to end. Mirrors the contract in
 * packages/contract/src/print.ts:
 *   GET  /internal/print/jobs/next      (service token) claims the oldest queued
 *        job (or one whose lease ran out) under a lease of `leaseMs`
 *   POST /internal/print/jobs/{id}/done (service token) accepted while printing or
 *        re-queued; the same result again is a 200 no-op, a different one 409,
 *        an unknown id 404
 *   GET  /media/{publicId}/display      (public) the job's `imageUrl`
 * `failNext` queues status codes to answer instead, per route. `now` is the
 * fake's clock, shared with the daemon in tests.
 */
export class FakePrintApi {
  readonly token = "printer-test-token";
  jobs: FakeJob[] = [];
  /** Accepted state changes, in order. */
  reports: { id: string; body: CompletePrintJobRequest }[] = [];
  /** Identical reports for a job already finished that way (200 no-ops). */
  repeats = 0;
  images = new Map<string, Buffer>();
  failNext: Record<"next" | "done" | "media", number[]> = { next: [], done: [], media: [] };
  authHeaders: (string | undefined)[] = [];
  mediaAuthHeaders: (string | undefined)[] = [];
  leaseMs = 300_000;
  now: () => number = () => Date.now();
  private server: Server | null = null;
  private baseUrl = "";

  addJob(job: Partial<PrintJob> & { id: string; photoPublicId: string }, image: Buffer = Buffer.from("jpeg-bytes")) {
    const full: PrintJob = { copies: 1, status: "queued", createdAt: new Date().toISOString(), ...job };
    this.jobs.push({ job: full, status: "queued", attempt: 0, leaseExpiresAt: null });
    this.images.set(full.photoPublicId, image);
    return full;
  }

  /** Puts a job back in the queue, as the API does when a lease runs out unreported. */
  requeue(id: string) {
    const entry = this.find(id);
    if (!entry) throw new Error(`no job ${id}`);
    entry.status = "queued";
    entry.leaseExpiresAt = null;
  }

  status(id: string) {
    return this.find(id)?.status;
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(({ status, body, type }) => {
        res.writeHead(status, { "content-type": type });
        res.end(body);
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    return this.baseUrl;
  }

  async stop() {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private find(id: string) {
    return this.jobs.find((j) => j.job.id === id);
  }

  private json(status: number, value: unknown) {
    return { status, body: JSON.stringify(value), type: "application/json" };
  }

  private claim(): ClaimedPrintJob | null {
    const now = this.now();
    for (const entry of this.jobs) {
      if (entry.status === "printing" && entry.leaseExpiresAt !== null && entry.leaseExpiresAt <= now) {
        entry.status = "queued";
      }
    }
    const next = this.jobs.find((j) => j.status === "queued");
    if (!next) return null;
    next.status = "printing";
    next.attempt += 1;
    next.leaseExpiresAt = now + this.leaseMs;
    return {
      ...next.job,
      status: "printing",
      imageUrl: `${this.baseUrl}/media/${encodeURIComponent(next.job.photoPublicId)}/display`,
      variant: "display",
      attempt: next.attempt,
      leaseExpiresAt: new Date(next.leaseExpiresAt).toISOString(),
    };
  }

  private async handle(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://fake");
    const media = url.pathname.match(/^\/media\/([^/]+)\/display$/);
    if (req.method === "GET" && media) {
      this.mediaAuthHeaders.push(req.headers.authorization);
      const forced = this.failNext.media.shift();
      if (forced) return this.json(forced, { error: "Forced", message: "forced" });
      const image = this.images.get(decodeURIComponent(media[1]!));
      if (!image) return this.json(404, { error: "Not Found", message: "No such photo" });
      return { status: 200, body: image, type: "image/jpeg" } as const;
    }

    this.authHeaders.push(req.headers.authorization);
    if (req.headers.authorization !== `Bearer ${this.token}`) {
      return this.json(401, { error: "Unauthorized", message: "Invalid service token" });
    }

    if (req.method === "GET" && url.pathname === "/internal/print/jobs/next") {
      const forced = this.failNext.next.shift();
      if (forced) return this.json(forced, { error: "Forced", message: "forced" });
      return this.json(200, { job: this.claim() });
    }

    const done = url.pathname.match(/^\/internal\/print\/jobs\/([^/]+)\/done$/);
    if (req.method === "POST" && done) {
      const forced = this.failNext.done.shift();
      if (forced) return this.json(forced, { error: "Forced", message: "forced" });
      const id = decodeURIComponent(done[1]!);
      const body = JSON.parse(await readBody(req)) as CompletePrintJobRequest;
      const entry = this.find(id);
      if (!entry) return this.json(404, { error: "Not Found", message: "No such job" });
      if (entry.status === "done" || entry.status === "failed") {
        if (entry.status !== body.result) return this.json(409, { error: "Conflict", message: "Job already finished" });
        this.repeats += 1;
      } else {
        // printing, or queued again after its lease ran out: a late report still counts.
        entry.status = body.result;
        entry.leaseExpiresAt = null;
        this.reports.push({ id, body });
      }
      return this.json(200, { ...entry.job, status: entry.status });
    }

    return this.json(404, { error: "Not Found", message: "No route" });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
