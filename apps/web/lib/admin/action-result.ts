import type { ApiResult } from "../api/result";

/**
 * Plain-language failure text for an API result in a Server Action, as in
 * app/admin/actions.ts. API error bodies never carry credentials or PII.
 */
export function failureMessage(result: ApiResult<unknown>): string {
  if (result.status !== "error") return "Something went wrong. Try again.";
  if (result.kind === "network") return "Could not reach the API. Check the connection and try again.";
  if (result.kind === "validation") return "The API sent an unexpected response. Reload the page to check what was saved.";
  return result.message;
}
