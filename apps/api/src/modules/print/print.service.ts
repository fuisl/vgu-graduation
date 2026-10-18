import {
  type AdminPrintJob,
  type AdminPrintJobsQuery,
  type AdminPrintJobsResponse,
  type ClaimedPrintJob,
  type CompletePrintJobRequest,
  type CreatePrintJobRequest,
  PRINT_GUEST_RATE_LIMIT,
  PRINT_LEASE_SECONDS,
  PRINT_MAX_ATTEMPTS,
  type PrintJob,
} from "@grad/contract";
import { type Config, config as defaultConfig } from "../../config.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { MediaRepository } from "../media/media.repository.js";
import { type ClaimedJob, PrintRepository, type StoredPrintJob } from "./print.repository.js";

/** Who asks for a print: an approved admin, or a guest by invitation credential. */
export type PrintRequester = { kind: "admin"; handle: string } | { kind: "guest"; token: string };

export type CreatePrintResult =
  | { status: "ok"; job: PrintJob }
  | { status: "guest_disabled" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "too_many_copies" }
  | { status: "photo_not_found" }
  | { status: "photo_not_printable" }
  | { status: "rate_limited"; retryAfterSeconds: number };

export type CompletePrintResult =
  | { status: "ok"; job: PrintJob }
  | { status: "conflict"; current: PrintJob["status"] }
  | { status: "not_found" };

export type RetryPrintResult =
  | { status: "ok"; job: AdminPrintJob }
  | { status: "conflict"; current: PrintJob["status"] }
  | { status: "not_found" };

/** Thrown for a cursor that is not a job id; the route answers 400. */
export class InvalidPrintCursorError extends Error {
  constructor() {
    super("Invalid cursor");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The actor of daemon calls in `audit`. */
export const PRINTER_ACTOR = "service:printer";

function toPrintJob(job: StoredPrintJob): PrintJob {
  return {
    id: job.id,
    photoPublicId: job.photoPublicId,
    copies: job.copies,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
  };
}

function toAdminPrintJob(job: StoredPrintJob): AdminPrintJob {
  return {
    ...toPrintJob(job),
    requestedBy: job.requestedByAdmin ? "admin" : "guest",
    attempts: job.attempts,
    error: job.error,
    leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}

type Repository = Pick<PrintRepository, "create" | "claim" | "complete" | "retry" | "list" | "counts" | "expireLeases">;

/** Print queue (#72, experimental): requests, the daemon's claim/report loop, and the admin view. */
export class PrintService {
  constructor(
    private readonly repository: Repository = new PrintRepository(),
    private readonly photos: Pick<MediaRepository, "findForPrint"> = new MediaRepository(),
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly config: Pick<Config, "apiOrigin" | "print"> = defaultConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** POST /print/jobs. Guests only when enabled, one copy, within the per-invitation limit. */
  async create(requester: PrintRequester, dto: CreatePrintJobRequest): Promise<CreatePrintResult> {
    let invitationId: string | undefined;
    if (requester.kind === "guest") {
      if (!this.config.print.guestRequestsEnabled) return { status: "guest_disabled" };
      const resolved = await this.invitations.resolveByToken(requester.token);
      if (resolved.status !== "ok") return { status: resolved.status };
      if (dto.copies > 1) return { status: "too_many_copies" };
      invitationId = resolved.invitation.id;
    }

    const photo = await this.photos.findForPrint(dto.photoPublicId);
    if (!photo) return { status: "photo_not_found" };
    if (!photo.printable) return { status: "photo_not_printable" };

    const result =
      requester.kind === "admin"
        ? await this.repository.create({ photoId: photo.id, copies: dto.copies, requestedByAdmin: requester.handle }, requester.handle)
        : await this.repository.create(
            { photoId: photo.id, copies: 1, requestedByInvitationId: invitationId },
            "guest",
            {
              max: PRINT_GUEST_RATE_LIMIT.max,
              since: new Date(this.now().getTime() - PRINT_GUEST_RATE_LIMIT.windowSeconds * 1000),
            },
          );
    if (result.status === "rate_limited") {
      return { status: "rate_limited", retryAfterSeconds: PRINT_GUEST_RATE_LIMIT.windowSeconds };
    }
    return { status: "ok", job: toPrintJob(result.job) };
  }

  /** GET /internal/print/jobs/next: claims the next job, with where to fetch the image. */
  async claimNext(): Promise<ClaimedPrintJob | null> {
    const job = await this.repository.claim(PRINT_LEASE_SECONDS, PRINT_MAX_ATTEMPTS, PRINTER_ACTOR);
    return job && this.toClaimed(job);
  }

  /** POST /internal/print/jobs/{id}/done. */
  async complete(id: string, report: CompletePrintJobRequest): Promise<CompletePrintResult> {
    const result = await this.repository.complete(id, report.result, report.error, PRINTER_ACTOR);
    if (result.status === "not_found") return result;
    if (result.status === "conflict") return { status: "conflict", current: result.job.status };
    return { status: "ok", job: toPrintJob(result.job) };
  }

  /** POST /admin/print/jobs/{id}/retry. */
  async retry(id: string, actor: string): Promise<RetryPrintResult> {
    const result = await this.repository.retry(id, actor);
    if (result.status === "not_found") return result;
    if (result.status === "conflict") return { status: "conflict", current: result.job.status };
    return { status: "ok", job: toAdminPrintJob(result.job) };
  }

  /** GET /admin/print/jobs: newest first, with counts by status. Expired leases are settled first. */
  async list(query: AdminPrintJobsQuery): Promise<AdminPrintJobsResponse> {
    if (query.cursor !== undefined && !UUID.test(query.cursor)) throw new InvalidPrintCursorError();
    await this.repository.expireLeases(PRINT_MAX_ATTEMPTS);
    const [rows, counts] = await Promise.all([this.repository.list(query), this.repository.counts()]);
    const items = rows.slice(0, query.limit).map(toAdminPrintJob);
    const nextCursor = rows.length > query.limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor, counts };
  }

  private toClaimed(job: ClaimedJob): ClaimedPrintJob {
    return {
      ...toPrintJob(job),
      imageUrl: `${this.config.apiOrigin}/media/${encodeURIComponent(job.photoPublicId)}/display`,
      variant: "display",
      attempt: job.attempts,
      leaseExpiresAt: job.leaseExpiresAt.toISOString(),
    };
  }
}
