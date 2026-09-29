import QRCode from "qrcode";
import { encodePassQr, type PassResponse } from "@grad/contract";

/**
 * The pass QR as an SVG string, rendered server-side from exactly `encodePassQr(pass)`.
 * Error correction "M" (~15%) keeps the ~300-character text at a modest module count
 * (easier to scan on a phone screen than "H"); 4-module quiet zone; fixed black on
 * white so it scans regardless of the page theme.
 */
export async function renderPassQrSvg(pass: PassResponse): Promise<string> {
  return QRCode.toString(encodePassQr(pass), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
