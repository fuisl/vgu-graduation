import { galleryResponseSchema, type GalleryResponse } from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, errorResult, ok } from "./result";

/** GET /gallery — public photo listing, revalidated on the API's 60-second cadence. */
export async function getGallery(): Promise<ApiResult<GalleryResponse>> {
  let response: Response;
  try {
    response = await apiFetch("/gallery?limit=100", {
      cache: { mode: "revalidate", seconds: 60, tags: ["gallery"] },
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

  const parsed = galleryResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");
  return ok(parsed.data);
}
