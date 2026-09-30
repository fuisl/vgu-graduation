import type { GalleryResponse, WishesResponse } from "@grad/contract";
import { mediaDerivativeUrl } from "../lib/api/browser-origin";

export interface GalleryItem {
  id: string;
  type: "POLAROID" | "WISH";
  sender: string;
  receivers: string[];
  content: string;
  timestamp: string;
}

export function buildGalleryItems(
  photos: GalleryResponse | undefined,
  wishes: WishesResponse | undefined,
  mediaOrigin?: string,
): GalleryItem[] {
  const photoItems: GalleryItem[] = (photos?.items ?? []).map((photo) => ({
    id: `photo-${photo.publicId}`,
    type: "POLAROID",
    sender: "Guest",
    receivers: ["Everyone"],
    content: mediaDerivativeUrl(photo.publicId, "display", mediaOrigin),
    timestamp: photo.createdAt,
  }));

  const wishItems: GalleryItem[] = (wishes?.items ?? []).map((wish) => ({
    id: `wish-${wish.id}`,
    type: "WISH",
    sender: wish.authorName,
    receivers: ["Graduating class"],
    content: wish.body,
    timestamp: wish.createdAt,
  }));

  return [...photoItems, ...wishItems].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}
