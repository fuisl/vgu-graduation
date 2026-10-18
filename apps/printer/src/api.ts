import {
  completePrintJobRequestSchema,
  nextPrintJobResponseSchema,
  type CompletePrintJobRequest,
  type PrintJob,
} from "@grad/contract";

/** Variant the daemon prints: the large "display" derivative (`GET /media/{id}/display`). */
export const PRINT_VARIANT = "display";

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
  /** The oldest queued job, which the API marks `printing`, or null when the queue is empty. */
  next(): Promise<PrintJob | null>;
  /** The photo's display derivative. 404 (hidden, removed, not processed) is a permanent ApiError. */
  fetchDerivative(photoPublicId: string): Promise<Buffer>;
  /**
   * Reports a job's outcome. Resolves `settled` when the API accepted it, or
   * already had it (404/409: reported before a crash, or the job is gone).
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

  async function call(what: string, path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.auth !== false) headers.set("authorization", `Bearer ${options.serviceToken}`);
    try {
      return await doFetch(`${options.apiUrl}${path}`, {
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

    async fetchDerivative(photoPublicId) {
      const what = `GET /media/{id}/${PRINT_VARIANT}`;
      // Public endpoint: no credential, so the service token never leaves for it.
      const res = await call(what, `/media/${encodeURIComponent(photoPublicId)}/${PRINT_VARIANT}`, { auth: false });
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
