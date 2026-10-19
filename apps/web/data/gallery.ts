import type { GalleryResponse, WishesResponse } from "@grad/contract";
import { mediaDerivativeUrl } from "../lib/api/browser-origin";

export interface GalleryItem {
  id: string;
  type: "POLAROID" | "WISH";
  /** The wish's author; null for a photo, which the gallery labels "Guest" in the page's language (#9). */
  sender: string | null;
  /** Who it is for, labelled by the gallery: photos are for everyone, wishes for the graduating class. */
  audience: "everyone" | "class";
  content: string;
  timestamp: string;
  /** Photos only: the API's `publicId`, used to request a print (#74). */
  publicId?: string;
}

export function buildGalleryItems(
  photos: GalleryResponse | undefined,
  wishes: WishesResponse | undefined,
  mediaOrigin?: string,
): GalleryItem[] {
  const photoItems: GalleryItem[] = (photos?.items ?? []).map((photo) => ({
    id: `photo-${photo.publicId}`,
    type: "POLAROID",
    sender: null,
    audience: "everyone",
    content: mediaDerivativeUrl(photo.publicId, "display", mediaOrigin),
    timestamp: photo.createdAt,
    publicId: photo.publicId,
  }));

  const wishItems: GalleryItem[] = (wishes?.items ?? []).map((wish) => ({
    id: `wish-${wish.id}`,
    type: "WISH",
    sender: wish.authorName,
    audience: "class",
    content: wish.body,
    timestamp: wish.createdAt,
  }));

  return [...photoItems, ...wishItems].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}
