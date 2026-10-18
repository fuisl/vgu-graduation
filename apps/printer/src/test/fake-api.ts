import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { CompletePrintJobRequest, PrintJob } from "@grad/contract";

/**
 * A small in-memory stand-in for apps/api's print endpoints, served over real
 * HTTP so the daemon's client is exercised end to end:
 *   GET  /internal/print/jobs/next      (service token)
 *   POST /internal/print/jobs/{id}/done (service token)
 *   GET  /media/{publicId}/display      (public)
 * `failNext` queues status codes to answer instead, per route.
 */
export class FakePrintApi {
  readonly token = "printer-test-token";
  queue: PrintJob[] = [];
  /** Jobs handed out and not yet reported, like the API's `printing` state. */
  printing = new Map<string, PrintJob>();
  reports: { id: string; body: CompletePrintJobRequest }[] = [];
  images = new Map<string, Buffer>();
  failNext: Record<"next" | "done" | "media", number[]> = { next: [], done: [], media: [] };
  authHeaders: (string | undefined)[] = [];
  mediaAuthHeaders: (string | undefined)[] = [];
  private server: Server | null = null;

  addJob(job: Partial<PrintJob> & { id: string; photoPublicId: string }, image: Buffer = Buffer.from("jpeg-bytes")) {
    const full: PrintJob = { copies: 1, status: "queued", createdAt: new Date().toISOString(), ...job };
    this.queue.push(full);
    this.images.set(full.photoPublicId, image);
    return full;
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
    return `http://127.0.0.1:${port}`;
  }

  async stop() {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private json(status: number, value: unknown) {
    return { status, body: JSON.stringify(value), type: "application/json" };
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
      const job = this.queue.shift() ?? null;
      if (job) this.printing.set(job.id, { ...job, status: "printing" });
      return this.json(200, { job: job && { ...job, status: "printing" } });
    }

    const done = url.pathname.match(/^\/internal\/print\/jobs\/([^/]+)\/done$/);
    if (req.method === "POST" && done) {
      const forced = this.failNext.done.shift();
      if (forced) return this.json(forced, { error: "Forced", message: "forced" });
      const id = decodeURIComponent(done[1]!);
      const body = JSON.parse(await readBody(req)) as CompletePrintJobRequest;
      if (!this.printing.has(id)) return this.json(409, { error: "Conflict", message: "Job is not printing" });
      this.printing.delete(id);
      this.reports.push({ id, body });
      return this.json(200, { id, status: body.result });
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
