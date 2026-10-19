import QRCode from "qrcode";
import { encodePassQr, type PassResponse } from "@grad/contract";

/** The same symbol for the SVG and the module matrix: one place for the text and the options. */
const QR_OPTIONS = { errorCorrectionLevel: "M" } as const;

/**
 * The pass QR as an SVG string, rendered server-side from exactly `encodePassQr(pass)`.
 * Error correction "M" (~15%) keeps the ~300-character text at a modest module count
 * (easier to scan on a phone screen than "H"); 4-module quiet zone; fixed black on
 * white so it scans regardless of the page theme.
 */
export async function renderPassQrSvg(pass: PassResponse): Promise<string> {
  return QRCode.toString(encodePassQr(pass), {
    ...QR_OPTIONS,
    type: "svg",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/**
 * The same QR as a module matrix (no quiet zone), for the name badge's WebGL card, which draws it
 * module by module (`app/guest/badge/BadgeCanvas.tsx`). `bits` is `size * size` "0"/"1", row by row.
 */
export function passQrModules(pass: PassResponse): { size: number; bits: string } {
  const { size, data } = QRCode.create(encodePassQr(pass), QR_OPTIONS).modules;
  return { size, bits: Array.from(data, (module) => (module ? "1" : "0")).join("") };
}
