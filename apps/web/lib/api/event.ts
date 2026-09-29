import { eventSchema, type EventConfig } from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, errorResult, ok } from "./result";

/**
 * GET /event: public, revalidated every 5 minutes (§4.1 table). Shared by every
 * page that shows the date or venue; nothing else may hard-code them.
 */
export async function getEvent(): Promise<ApiResult<EventConfig>> {
  let response: Response;
  try {
    response = await apiFetch("/event", {
      cache: { mode: "revalidate", seconds: 300, tags: ["event"] },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (!response.ok) {
    return errorResult("http", "The API returned an unexpected error", response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The API response was not valid JSON");
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return errorResult("validation", "The API response did not match the expected shape");
  }

  return ok(parsed.data);
}
