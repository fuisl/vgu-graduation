import { putRsvpResponseSchema, type PutRsvpRequest, type Rsvp } from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, errorResult, ok } from "./result";

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
  return "The API rejected the request";
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
    return errorResult("network", "Could not reach the API");
  }

  if (!response.ok) {
    const message = response.status === 400 ? await errorMessage(response) : "The API returned an unexpected error";
    return errorResult("http", message, response.status);
  }

  const parsed = putRsvpResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    return errorResult("validation", "The API response did not match the expected shape");
  }
  return ok(parsed.data);
}
