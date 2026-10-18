import {
  completePrintJobRequestSchema,
  nextPrintJobResponseSchema,
  type ClaimedPrintJob,
  type CompletePrintJobRequest,
} from "@grad/contract";

/**
 * An HTTP or network failure talking to the API. `retryable` is true for network
 * errors, timeouts, 408/429 and 5xx: the daemon backs off and tries again.
 * Messages name the endpoint, never the URL, because derivative URLs carry the
 * photo's unguessable publicId.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface PrintApi {
  /** Claims the oldest queued job under a lease (the API marks it `printing`), or null when the queue is empty. */
  next(): Promise<ClaimedPrintJob | null>;
  /**
   * The job's image from its `imageUrl` (the public `display` derivative). Sent
   * without the service token. 4xx (hidden, removed, not processed) is a permanent ApiError.
   */
  fetchImage(imageUrl: string): Promise<Buffer>;
  /**
   * Reports a job's outcome. `accepted`: recorded, or the same result repeated
   * (the API answers 200 to both). `settled`: nothing more to do, the API
   * already finished the job differently (409) or does not know it (404).
   */
  complete(jobId: string, body: CompletePrintJobRequest): Promise<"accepted" | "settled">;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function createHttpApi(options: {
  apiUrl: string;
  serviceToken: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): PrintApi {
  const doFetch = options.fetchImpl ?? fetch;

  async function call(
    what: string,
    path: string,
    { auth, absolute, ...init }: RequestInit & { auth?: boolean; absolute?: boolean } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (auth !== false) headers.set("authorization", `Bearer ${options.serviceToken}`);
    try {
      return await doFetch(absolute ? path : `${options.apiUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
      throw new ApiError(`${what}: ${reason}`, null, true);
    }
  }

  function fail(what: string, res: Response): never {
    throw new ApiError(`${what} returned ${res.status}`, res.status, isRetryableStatus(res.status));
  }

  return {
    async next() {
      const what = "GET /internal/print/jobs/next";
      const res = await call(what, "/internal/print/jobs/next");
      if (res.status === 204) return null;
      if (!res.ok) fail(what, res);
      const parsed = nextPrintJobResponseSchema.safeParse(await res.json().catch(() => undefined));
      if (!parsed.success) throw new ApiError(`${what}: response did not match the contract`, res.status, true);
      return parsed.data.job;
    },

    async fetchImage(imageUrl) {
      const what = "GET job image";
      let url: URL;
      try {
        url = new URL(imageUrl);
      } catch {
        throw new ApiError(`${what}: not a URL`, null, false);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new ApiError(`${what}: not http(s)`, null, false);
      // Public endpoint: no credential, so the service token never leaves for it.
      const res = await call(what, url.toString(), { auth: false, absolute: true });
      if (!res.ok) fail(what, res);
      return Buffer.from(await res.arrayBuffer());
    },

    async complete(jobId, body) {
      const what = "POST /internal/print/jobs/{id}/done";
      const payload = completePrintJobRequestSchema.parse(body);
      const res = await call(what, `/internal/print/jobs/${encodeURIComponent(jobId)}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return "accepted";
      if (res.status === 404 || res.status === 409) return "settled";
      fail(what, res);
    },
  };
}
