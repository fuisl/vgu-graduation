import QRCode from "qrcode";

/**
 * The guest-facing site origin for links printed on the display (QR codes):
 * PUBLIC_ORIGIN when set and valid, otherwise the request's own host (so a
 * preview deployment or a LAN address links back to itself).
 */
export function publicSiteOrigin(
  configured: string | undefined,
  host: string | null,
  forwardedProto: string | null,
): string {
  for (const candidate of [configured?.trim(), host ? `${forwardedProto?.split(",")[0]?.trim() || "https"}://${host}` : undefined]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Try the next candidate.
    }
  }
  return "https://grad26.fuisloy.dev";
}

/** "grad26.fuisloy.dev/wishes": a link as people type it, for under a QR code. */
export function displayLink(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

/**
 * A link QR as an SVG string, rendered on the server. Error correction "M",
 * a 4-module quiet zone, and fixed black on white like the pass QR, so it scans
 * from across a hall regardless of the surrounding theme.
 */
export async function renderLinkQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
