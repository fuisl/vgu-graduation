import {
  getRsvpResponseSchema,
  putRsvpResponseSchema,
  type GuestRsvp,
  type PutRsvpRequest,
  type Rsvp,
} from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, empty, errorResult, ok } from "./result";

/**
 * GET /rsvp: the guest's own answer including accessibility needs (#176), or
 * null before they respond. Sensitive, so never cached (the API sends no-store
 * too), never logged. 401/404 are `empty` like getInvitation; anything else is
 * an error the form shows as "couldn't load what you saved".
 */
export async function getRsvp(token: string): Promise<ApiResult<GuestRsvp | null>> {
  let response: Response;
  try {
    response = await apiFetch("/rsvp", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "no-store" },
    });
  } catch {
    return errorResult("network", "Could not reach the server");
  }

  if (response.status === 401 || response.status === 404) return empty();
  if (!response.ok) return errorResult("http", "The server returned an unexpected error", response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The server response was not valid JSON");
  }
  const parsed = getRsvpResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The server response did not match the expected shape");
  return ok(parsed.data.rsvp);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body) {
      const { message } = body as { message: unknown };
      if (typeof message === "string" && message.length > 0) return message;
      if (Array.isArray(message) && typeof message[0] === "string") return message.join(" ");
    }
  } catch {
    // Non-JSON body: fall through to the generic message.
  }
  return "The request was rejected";
}

/**
 * PUT /rsvp — never cached. Unlike getInvitation, 404/410 stay errors carrying
 * the status so the form can say the invitation is no longer valid.
 */
export async function putRsvp(token: string, request: PutRsvpRequest): Promise<ApiResult<Rsvp>> {
  let response: Response;
  try {
    response = await apiFetch("/rsvp", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: { mode: "no-store" },
    });
  } catch {
    return errorResult("network", "Could not reach the server");
  }

  if (!response.ok) {
    const message = response.status === 400 ? await errorMessage(response) : "The server returned an unexpected error";
    return errorResult("http", message, response.status);
  }

  const parsed = putRsvpResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    return errorResult("validation", "The server response did not match the expected shape");
  }
  return ok(parsed.data);
}
