const DEFAULT_BROWSER_API_ORIGIN = "https://api.grad26.fuisloy.dev";

/** Browser-visible API origin used only for Path B photo uploads and derivative images. */
export function browserApiOrigin(raw: string | undefined = process.env.NEXT_PUBLIC_API_ORIGIN): string {
  const fallback = process.env.NODE_ENV === "development" ? "http://localhost:4000" : DEFAULT_BROWSER_API_ORIGIN;
  const value = raw?.trim();
  if (!value) return fallback;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

export function mediaDerivativeUrl(publicId: string, variant: "thumb" | "display", origin = browserApiOrigin()) {
  return `${origin}/media/${encodeURIComponent(publicId)}/${variant}`;
}
