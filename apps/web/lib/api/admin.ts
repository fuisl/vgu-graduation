import {
  adminAccessibilityResponseSchema,
  adminAccessSchema,
  adminAccountSchema,
  adminAccountsResponseSchema,
  adminGuideItemSchema,
  adminGuideItemsResponseSchema,
  adminInvitationGuideResponseSchema,
  adminInvitationsResponseSchema,
  adminMediaResponseSchema,
  adminPrintJobsResponseSchema,
  adminRsvpListResponseSchema,
  adminWishesResponseSchema,
  createPrintJobResponseSchema,
  createInvitationResponseSchema,
  errorResponseSchema,
  eventSchema,
  graduateSchema,
  graduatesResponseSchema,
  moderateMediaResponseSchema,
  moderateWishResponseSchema,
  retryPrintJobResponseSchema,
  revokeInvitationResponseSchema,
  rotateInvitationResponseSchema,
  setMediaPublicResponseSchema,
  setWishPublicResponseSchema,
  updateInvitationResponseSchema,
  type AdminAccess,
  type AdminAccessibilityResponse,
  type AdminAccount,
  type AdminAccountDecision,
  type AdminAccountsResponse,
  type AdminGuideItem,
  type AdminGuideItemsResponse,
  type AdminInvitationGuideResponse,
  type AdminInvitationRow,
  type AdminInvitationsResponse,
  type AdminMediaQuery,
  type AdminMediaResponse,
  type AdminPrintJobsQuery,
  type AdminPrintJobsResponse,
  type AdminRsvpListResponse,
  type AdminWishesQuery,
  type AdminWishesResponse,
  type CreateGraduateRequest,
  type CreateGuideItemRequest,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type CreatePrintJobRequest,
  type CreatePrintJobResponse,
  type EventConfig,
  type Graduate,
  type GraduatesResponse,
  type MediaVariant,
  type ModerateMediaResponse,
  type ModerateWishResponse,
  type ModerationStatus,
  type RetryPrintJobResponse,
  type RevokeInvitationResponse,
  type RotateInvitationResponse,
  type SetMediaPublicResponse,
  type SetWishPublicResponse,
  type UpdateEventRequest,
  type UpdateGraduateRequest,
  type UpdateGuideItemRequest,
  type UpdateInvitationRequest,
} from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, empty, errorResult, ok } from "./result";

/**
 * Admin BFF calls. Every call forwards the admin session token as
 * `Authorization: Bearer` and is never cached (§4.1 "Admin views: no cache").
 * The token is only ever placed in that header: never in a URL, a cache tag or
 * an error message.
 *
 * A 401 from the API surfaces as `{ status: "error", kind: "http", httpStatus: 401 }`
 * so callers can send the admin back to sign in.
 */

interface SafeParser<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

interface AdminRequest<T> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  schema: SafeParser<T>;
  /** Statuses that mean "nothing there" rather than an error (e.g. 404 on GET /event, 204 on a DELETE). */
  emptyOn?: number[];
}

/** `token` is null only for public endpoints, which never receive the admin credential. */
async function adminRequest<T>(token: string | null, path: string, request: AdminRequest<T>): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (request.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await apiFetch(path, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      cache: { mode: "no-store" },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (request.emptyOn?.includes(response.status)) return empty();

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (response.ok) return errorResult("validation", "The API response was not valid JSON");
  }

  if (!response.ok) {
    // The API's `{ error, message }` bodies never contain credentials; show them to the admin as-is.
    const parsedError = errorResponseSchema.safeParse(body);
    const message = parsedError.success ? parsedError.data.message : "The API returned an unexpected error";
    return errorResult("http", message, response.status);
  }

  const parsed = request.schema.safeParse(body);
  if (!parsed.success) {
    return errorResult("validation", "The API response did not match the expected shape");
  }
  return ok(parsed.data);
}

/** GET /admin/graduates: every graduate, sorted by name. */
export function listGraduates(token: string): Promise<ApiResult<GraduatesResponse>> {
  return adminRequest(token, "/admin/graduates", { schema: graduatesResponseSchema });
}

/** POST /admin/graduates: 409 when the email already exists. */
export function createGraduate(token: string, input: CreateGraduateRequest): Promise<ApiResult<Graduate>> {
  return adminRequest(token, "/admin/graduates", { method: "POST", body: input, schema: graduateSchema });
}

/** PATCH /admin/graduates/:id: names or email; 404 unknown, 409 email taken. */
export function updateGraduate(token: string, id: string, input: UpdateGraduateRequest): Promise<ApiResult<Graduate>> {
  return adminRequest(token, `/admin/graduates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    schema: graduateSchema,
  });
}

/** GET /admin/invitations: newest first; never contains tokens. */
export function listInvitations(token: string): Promise<ApiResult<AdminInvitationsResponse>> {
  return adminRequest(token, "/admin/invitations", { schema: adminInvitationsResponseSchema });
}

/** POST /admin/invitations: the response carries the raw token and invite URL exactly once. */
export function createInvitation(
  token: string,
  input: CreateInvitationRequest
): Promise<ApiResult<CreateInvitationResponse>> {
  return adminRequest(token, "/admin/invitations", {
    method: "POST",
    body: input,
    schema: createInvitationResponseSchema,
  });
}

/** PATCH /admin/invitations/:id: guest names, contact and maxPlusOnes; 404 unknown, 409 below the confirmed plus-ones. */
export function updateInvitation(
  token: string,
  id: string,
  input: UpdateInvitationRequest
): Promise<ApiResult<AdminInvitationRow>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    schema: updateInvitationResponseSchema,
  });
}

/** POST /admin/invitations/:id/rotate: invalidates the old link, returns the new one once, optionally emailing it. */
export function rotateInvitation(
  token: string,
  id: string,
  options: { sendEmail?: boolean } = {}
): Promise<ApiResult<RotateInvitationResponse>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
    ...(options.sendEmail ? { body: { sendEmail: true } } : {}),
    schema: rotateInvitationResponseSchema,
  });
}

/** POST /admin/invitations/:id/revoke: idempotent. */
export function revokeInvitation(token: string, id: string): Promise<ApiResult<RevokeInvitationResponse>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    schema: revokeInvitationResponseSchema,
  });
}

/** GET /admin/rsvp: every invitation with its answer (null until the guest responds). */
export function listRsvps(token: string): Promise<ApiResult<AdminRsvpListResponse>> {
  return adminRequest(token, "/admin/rsvp", { schema: adminRsvpListResponseSchema });
}

/**
 * GET /admin/rsvp/accessibility (#176): stated needs and the event counts.
 * Sensitive: rendered for admins only, never logged, never cached.
 */
export function getAccessibilityNeeds(token: string): Promise<ApiResult<AdminAccessibilityResponse>> {
  return adminRequest(token, "/admin/rsvp/accessibility", { schema: adminAccessibilityResponseSchema });
}

/** GET /admin/guide/items (#140): the whole catalogue in sortOrder, inactive items included. */
export function listGuideItems(token: string): Promise<ApiResult<AdminGuideItemsResponse>> {
  return adminRequest(token, "/admin/guide/items", { schema: adminGuideItemsResponseSchema });
}

/** POST /admin/guide/items: 201 with the item. */
export function createGuideItem(token: string, input: CreateGuideItemRequest): Promise<ApiResult<AdminGuideItem>> {
  return adminRequest(token, "/admin/guide/items", { method: "POST", body: input, schema: adminGuideItemSchema });
}

/** PATCH /admin/guide/items/:id: edit, deactivate or reorder; 404 unknown. */
export function updateGuideItem(
  token: string,
  id: string,
  input: UpdateGuideItemRequest
): Promise<ApiResult<AdminGuideItem>> {
  return adminRequest(token, `/admin/guide/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    schema: adminGuideItemSchema,
  });
}

/** DELETE /admin/guide/items/:id: 204 is `empty`; also removes every pick of the item. */
export function deleteGuideItem(token: string, id: string): Promise<ApiResult<never>> {
  return adminRequest(token, `/admin/guide/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: { safeParse: () => ({ success: false }) },
    emptyOn: [204],
  });
}

/** GET /admin/invitations/:id/guide: the picks and what the guest sees now; 404 unknown invitation. */
export function getInvitationGuide(token: string, id: string): Promise<ApiResult<AdminInvitationGuideResponse>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}/guide`, {
    schema: adminInvitationGuideResponseSchema,
  });
}

/** PUT /admin/invitations/:id/guide: replaces the picks; an empty list goes back to the defaults. */
export function putInvitationGuide(
  token: string,
  id: string,
  itemIds: string[]
): Promise<ApiResult<AdminInvitationGuideResponse>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}/guide`, {
    method: "PUT",
    body: { itemIds },
    schema: adminInvitationGuideResponseSchema,
  });
}

/**
 * GET /event, uncached for the admin editor so a save is visible immediately.
 * Public endpoint: the admin token is not sent. 404 (event not configured yet) is `empty`.
 */
export function getEventUncached(): Promise<ApiResult<EventConfig>> {
  return adminRequest(null, "/event", { schema: eventSchema, emptyOn: [404] });
}

/** PUT /admin/event: replaces the event configuration; responds with the saved document. */
export function updateEvent(token: string, input: UpdateEventRequest): Promise<ApiResult<EventConfig>> {
  return adminRequest(token, "/admin/event", { method: "PUT", body: input, schema: eventSchema });
}

/**
 * POST /admin/access: at sign-in, with a freshly minted session. Files a pending
 * request for a first-time handle; the answer says whether to let them in (#119).
 */
export function requestAdminAccess(token: string): Promise<ApiResult<AdminAccess>> {
  return adminRequest(token, "/admin/access", { method: "POST", schema: adminAccessSchema });
}

/** GET /admin/me: 403 once the account is no longer approved. */
export function getAdminMe(token: string): Promise<ApiResult<AdminAccess>> {
  return adminRequest(token, "/admin/me", { schema: adminAccessSchema });
}

/** GET /admin/accounts (owners only): every admin account and pending request. */
export function listAdminAccounts(token: string): Promise<ApiResult<AdminAccountsResponse>> {
  return adminRequest(token, "/admin/accounts", { schema: adminAccountsResponseSchema });
}

/** POST /admin/accounts/:handle/:decision (owners only): 409 when the decision doesn't apply. */
export function decideAdminAccount(
  token: string,
  handle: string,
  decision: AdminAccountDecision
): Promise<ApiResult<AdminAccount>> {
  return adminRequest(token, `/admin/accounts/${encodeURIComponent(handle)}/${decision}`, {
    method: "POST",
    schema: adminAccountSchema,
  });
}

type QueryValue = string | number | boolean | undefined;

/** `?a=1&b=x` from the defined values only; "" when there are none. Values are API filters and opaque cursors, never credentials. */
export function queryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/** GET /admin/media (#64): every photo in any state, newest first; filters `status`, `processing`, `isPublic`. */
export function listAdminMedia(token: string, query: Partial<AdminMediaQuery> = {}): Promise<ApiResult<AdminMediaResponse>> {
  return adminRequest(token, `/admin/media${queryString(query)}`, { schema: adminMediaResponseSchema });
}

/** GET /admin/wishes (#64): every wish in any state, newest first; filters `status`, `isPublic`. */
export function listAdminWishes(
  token: string,
  query: Partial<AdminWishesQuery> = {}
): Promise<ApiResult<AdminWishesResponse>> {
  return adminRequest(token, `/admin/wishes${queryString(query)}`, { schema: adminWishesResponseSchema });
}

/** POST /admin/media/:publicId/moderate: show, hide or remove. Audited by the API; `revalidateTags` names the stale listings. */
export function moderateMedia(
  token: string,
  publicId: string,
  status: ModerationStatus
): Promise<ApiResult<ModerateMediaResponse>> {
  return adminRequest(token, `/admin/media/${encodeURIComponent(publicId)}/moderate`, {
    method: "POST",
    body: { status },
    schema: moderateMediaResponseSchema,
  });
}

/** POST /admin/wishes/:id/moderate: show, hide or remove. Audited by the API. */
export function moderateWish(token: string, id: string, status: ModerationStatus): Promise<ApiResult<ModerateWishResponse>> {
  return adminRequest(token, `/admin/wishes/${encodeURIComponent(id)}/moderate`, {
    method: "POST",
    body: { status },
    schema: moderateWishResponseSchema,
  });
}

/** POST /admin/media/:publicId/public (#75): 409 unless the photo is visible and processed (un-flagging always works). */
export function setMediaPublic(token: string, publicId: string, isPublic: boolean): Promise<ApiResult<SetMediaPublicResponse>> {
  return adminRequest(token, `/admin/media/${encodeURIComponent(publicId)}/public`, {
    method: "POST",
    body: { isPublic },
    schema: setMediaPublicResponseSchema,
  });
}

/** POST /admin/wishes/:id/public (#75): 409 unless the wish is visible (un-flagging always works). */
export function setWishPublic(token: string, id: string, isPublic: boolean): Promise<ApiResult<SetWishPublicResponse>> {
  return adminRequest(token, `/admin/wishes/${encodeURIComponent(id)}/public`, {
    method: "POST",
    body: { isPublic },
    schema: setWishPublicResponseSchema,
  });
}

/** Path of the admin-only derivative preview (any moderation state, never cached). Proxied by app/admin/preview. */
export function adminMediaVariantPath(publicId: string, variant: MediaVariant): string {
  return `/admin/media/${encodeURIComponent(publicId)}/${variant}`;
}

/** POST /print/jobs with the admin session (#72): 1 to 5 copies of a visible, processed photo; 409 otherwise. */
export function createPrintJob(token: string, input: CreatePrintJobRequest): Promise<ApiResult<CreatePrintJobResponse>> {
  return adminRequest(token, "/print/jobs", { method: "POST", body: input, schema: createPrintJobResponseSchema });
}

/** GET /admin/print/jobs: newest first, with counts by status over the whole queue. */
export function listPrintJobs(
  token: string,
  query: Partial<AdminPrintJobsQuery> = {}
): Promise<ApiResult<AdminPrintJobsResponse>> {
  return adminRequest(token, `/admin/print/jobs${queryString(query)}`, { schema: adminPrintJobsResponseSchema });
}

/** POST /admin/print/jobs/:id/retry: re-queues a failed job (409 otherwise). Audited. */
export function retryPrintJob(token: string, id: string): Promise<ApiResult<RetryPrintJobResponse>> {
  return adminRequest(token, `/admin/print/jobs/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    schema: retryPrintJobResponseSchema,
  });
}
