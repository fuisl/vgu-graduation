/** The explicit page states every BFF call resolves to, per docs/architecture/target/applications-and-repository.md §4.1. */
export type ApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "empty" }
  | { status: "error"; kind: "network" | "http" | "validation"; message: string; httpStatus?: number };

export function ok<T>(data: T): ApiResult<T> {
  return { status: "ok", data };
}

export function empty(): ApiResult<never> {
  return { status: "empty" };
}

export function errorResult(
  kind: "network" | "http" | "validation",
  message: string,
  httpStatus?: number
): ApiResult<never> {
  return { status: "error", kind, message, httpStatus };
}
