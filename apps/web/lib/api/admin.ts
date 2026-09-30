import {
  adminAccessSchema,
  adminAccountSchema,
  adminAccountsResponseSchema,
  adminInvitationsResponseSchema,
  adminRsvpListResponseSchema,
  createInvitationResponseSchema,
  errorResponseSchema,
  eventSchema,
  graduateSchema,
  graduatesResponseSchema,
  revokeInvitationResponseSchema,
  rotateInvitationResponseSchema,
  type AdminAccess,
  type AdminAccount,
  type AdminAccountDecision,
  type AdminAccountsResponse,
  type AdminInvitationsResponse,
  type AdminRsvpListResponse,
  type CreateGraduateRequest,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type EventConfig,
  type Graduate,
  type GraduatesResponse,
  type RevokeInvitationResponse,
  type RotateInvitationResponse,
  type UpdateEventRequest,
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
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  schema: SafeParser<T>;
  /** Statuses that mean "nothing there" rather than an error (e.g. 404 on GET /event). */
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

/** POST /admin/invitations/:id/rotate: invalidates the old link, returns the new one once. */
export function rotateInvitation(token: string, id: string): Promise<ApiResult<RotateInvitationResponse>> {
  return adminRequest(token, `/admin/invitations/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
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
