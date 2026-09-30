import {
  createWishRequestSchema,
  createWishResponseSchema,
  wishesResponseSchema,
  type CreateWishRequest,
  type CreateWishResponse,
  type WishesResponse,
} from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, errorResult, ok } from "./result";

async function responseMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    // Fall through to the status-based message.
  }
  return "The API rejected the request";
}

/** GET /wishes — public listing, revalidated on the API's 30-second cadence. */
export async function getWishes(): Promise<ApiResult<WishesResponse>> {
  let response: Response;
  try {
    response = await apiFetch("/wishes?limit=100", {
      cache: { mode: "revalidate", seconds: 30, tags: ["wishes"] },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (!response.ok) return errorResult("http", "The API returned an unexpected error", response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The API response was not valid JSON");
  }

  const parsed = wishesResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");
  return ok(parsed.data);
}

/** POST /wishes — forwards the invitation bearer credential and never caches it. */
export async function createWish(token: string, request: CreateWishRequest): Promise<ApiResult<CreateWishResponse>> {
  const parsedRequest = createWishRequestSchema.safeParse(request);
  if (!parsedRequest.success) return errorResult("validation", "Please enter a valid name and message");

  let response: Response;
  try {
    response = await apiFetch("/wishes", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(parsedRequest.data),
      cache: { mode: "no-store" },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (!response.ok) return errorResult("http", await responseMessage(response), response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The API response was not valid JSON");
  }

  const parsed = createWishResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");
  return ok(parsed.data);
}
