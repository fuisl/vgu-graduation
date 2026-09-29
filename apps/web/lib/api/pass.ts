import { passResponseSchema, type PassResponse } from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, empty, errorResult, ok } from "./result";

/**
 * GET /pass — the signed pass for the invitation. The API sends `private, no-store`
 * and the response is personal, so it is never cached. The token is only sent as
 * the bearer header; it is never logged or embedded in the result.
 */
export async function getPass(token: string): Promise<ApiResult<PassResponse>> {
  let response: Response;
  try {
    response = await apiFetch("/pass", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "no-store" },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (response.status === 401 || response.status === 404) return empty();
  if (!response.ok) return errorResult("http", "The API returned an unexpected error", response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The API response was not valid JSON");
  }
  const parsed = passResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");
  return ok(parsed.data);
}
