"use server";

import {
  moderationStatusSchema,
  printJobStatusSchema,
  type AdminMediaResponse,
  type AdminPrintJob,
  type AdminPrintJobsResponse,
  type AdminWishesResponse,
  type CreatePrintJobResponse,
  type ModerationStatus,
  type PrintJobStatus,
} from "@grad/contract";
import { revalidateTag } from "next/cache";
import {
  createPrintJob,
  listAdminMedia,
  listAdminWishes,
  listPrintJobs,
  moderateMedia,
  moderateWish,
  retryPrintJob,
  setMediaPublic,
  setWishPublic,
} from "../../lib/api/admin";
import { webTagsToRevalidate } from "../../lib/api/cache-tags";
import type { ApiResult } from "../../lib/api/result";
import { mediaFilterQuery, QUEUE_PAGE_SIZE, wishFilterQuery, type QueueFilter } from "../../lib/admin/moderation";
import { PRINT_PAGE_SIZE } from "../../lib/admin/print-queue";
import { redirectIfUnauthorized, requireAdminSession } from "../../lib/admin/session";

/*
 * Moderation (#64, #75) and print (#74) actions, called from client components
 * with plain arguments rather than forms, so the queue can update optimistically
 * and roll back on `{ ok: false }`. Like actions.ts, each one re-verifies the
 * admin session and forwards it as a Bearer header; the API audits every write.
 * After a write, every tag the API names in `revalidateTags` is revalidated, so
 * a takedown leaves the cached gallery and wishes at once. Nothing here logs.
 */

export type QueueResult<T> = { ok: true; data: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Photo public ids are random base64url strings. */
const PUBLIC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CURSOR = /^[A-Za-z0-9_\-=.:+/]{1,512}$/;
const FILTERS: readonly QueueFilter[] = ["latest", "processing", "visible", "public", "hidden", "removed"];

function failure(result: ApiResult<unknown>): { ok: false; message: string } {
  if (result.status !== "error") return { ok: false, message: "Something went wrong. Try again." };
  if (result.kind === "network") return { ok: false, message: "Could not reach the API. Check the connection and try again." };
  if (result.kind === "validation") {
    return { ok: false, message: "The API sent an unexpected response. Reload the page to check what was saved." };
  }
  return { ok: false, message: result.message };
}

function done<T>(result: ApiResult<T>): QueueResult<T> {
  redirectIfUnauthorized(result);
  return result.status === "ok" ? { ok: true, data: result.data } : failure(result);
}

/** Revalidates the public listings a write made stale; returns the response unchanged. */
function revalidated<T extends { revalidateTags: readonly string[] }>(result: ApiResult<T>): QueueResult<T> {
  const outcome = done(result);
  if (outcome.ok) {
    for (const tag of webTagsToRevalidate(outcome.data.revalidateTags)) revalidateTag(tag);
  }
  return outcome;
}

const invalid = (message: string): { ok: false; message: string } => ({ ok: false, message });

function cursorOrUndefined(cursor: unknown): string | undefined | null {
  if (cursor === undefined || cursor === null || cursor === "") return undefined;
  return typeof cursor === "string" && CURSOR.test(cursor) ? cursor : null;
}

function filterOf(filter: unknown): QueueFilter | null {
  return FILTERS.find((candidate) => candidate === filter) ?? null;
}

function statusOf(status: unknown): ModerationStatus | null {
  const parsed = moderationStatusSchema.safeParse(status);
  return parsed.success ? parsed.data : null;
}

export async function loadMediaPageAction(filter: QueueFilter, cursor?: string): Promise<QueueResult<AdminMediaResponse>> {
  const { token } = await requireAdminSession();
  const view = filterOf(filter);
  const next = cursorOrUndefined(cursor);
  if (!view || next === null) return invalid("Unknown filter or page.");
  return done(await listAdminMedia(token, { ...mediaFilterQuery(view), limit: QUEUE_PAGE_SIZE.photos, cursor: next }));
}

export async function loadWishesPageAction(filter: QueueFilter, cursor?: string): Promise<QueueResult<AdminWishesResponse>> {
  const { token } = await requireAdminSession();
  const view = filterOf(filter);
  const next = cursorOrUndefined(cursor);
  if (!view || next === null) return invalid("Unknown filter or page.");
  return done(await listAdminWishes(token, { ...wishFilterQuery(view), limit: QUEUE_PAGE_SIZE.wishes, cursor: next }));
}

export async function moderateMediaAction(publicId: string, status: ModerationStatus) {
  const { token } = await requireAdminSession();
  const next = statusOf(status);
  if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId) || !next) return invalid("Unknown photo or action.");
  return revalidated(await moderateMedia(token, publicId, next));
}

export async function moderateWishAction(id: string, status: ModerationStatus) {
  const { token } = await requireAdminSession();
  const next = statusOf(status);
  if (typeof id !== "string" || !UUID.test(id) || !next) return invalid("Unknown wish or action.");
  return revalidated(await moderateWish(token, id, next));
}

export async function setMediaPublicAction(publicId: string, isPublic: boolean) {
  const { token } = await requireAdminSession();
  if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId) || typeof isPublic !== "boolean") {
    return invalid("Unknown photo or action.");
  }
  return revalidated(await setMediaPublic(token, publicId, isPublic));
}

export async function setWishPublicAction(id: string, isPublic: boolean) {
  const { token } = await requireAdminSession();
  if (typeof id !== "string" || !UUID.test(id) || typeof isPublic !== "boolean") return invalid("Unknown wish or action.");
  return revalidated(await setWishPublic(token, id, isPublic));
}

export async function requestPrintAction(publicId: string, copies: number): Promise<QueueResult<CreatePrintJobResponse>> {
  const { token } = await requireAdminSession();
  if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId)) return invalid("Unknown photo.");
  if (!Number.isInteger(copies) || copies < 1 || copies > 5) return invalid("Choose 1 to 5 copies.");
  return done(await createPrintJob(token, { photoPublicId: publicId, copies }));
}

export async function loadPrintJobsAction(
  status?: PrintJobStatus,
  cursor?: string
): Promise<QueueResult<AdminPrintJobsResponse>> {
  const { token } = await requireAdminSession();
  const parsed = status === undefined ? undefined : printJobStatusSchema.safeParse(status);
  const next = cursorOrUndefined(cursor);
  if ((parsed && !parsed.success) || next === null) return invalid("Unknown filter or page.");
  return done(await listPrintJobs(token, { status: parsed?.data, limit: PRINT_PAGE_SIZE, cursor: next }));
}

export async function retryPrintJobAction(id: string): Promise<QueueResult<AdminPrintJob>> {
  const { token } = await requireAdminSession();
  if (typeof id !== "string" || !UUID.test(id)) return invalid("Unknown print job.");
  return done(await retryPrintJob(token, id));
}
