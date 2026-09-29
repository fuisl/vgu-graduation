import type { ApiResult } from "../../../lib/api/result";

/** Inline error for a failed admin list/read. The 401 case never reaches here (it redirects to sign-in). */
export function LoadError({ what, result }: { what: string; result: ApiResult<unknown> }) {
  const detail =
    result.status !== "error"
      ? null
      : result.kind === "network"
        ? "The API could not be reached."
        : result.kind === "validation"
          ? "The API sent an unexpected response."
          : `${result.message}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ""}.`;
  return (
    <div className="admin-notice admin-notice--error" role="alert">
      <p>
        Could not load {what}. {detail} Reload the page to try again.
      </p>
    </div>
  );
}
