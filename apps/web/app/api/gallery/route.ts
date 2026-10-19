import { NextResponse } from "next/server";
import { buildGalleryItems } from "../../../data/gallery";
import { getGallery } from "../../../lib/api/gallery";
import { getWishes } from "../../../lib/api/wishes";
import { publicApiOrigin } from "../../../lib/calendar/links";

export async function GET() {
  const [photos, wishes] = await Promise.all([getGallery(), getWishes()]);

  if (photos.status !== "ok" && wishes.status !== "ok") {
    return NextResponse.json(
      { error: "Service Unavailable", message: "The gallery is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const items = buildGalleryItems(
    photos.status === "ok" ? photos.data : undefined,
    wishes.status === "ok" ? wishes.data : undefined,
    publicApiOrigin(),
  );

  // First paint only: the page then catches up from the API's live feed (ADR-014), so the
  // edge keeps this a few seconds to absorb a crowd opening the gallery at once, no longer.
  return NextResponse.json(
    { items, partial: photos.status !== "ok" || wishes.status !== "ok" },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
  );
}
