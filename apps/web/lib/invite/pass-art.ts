import type { PassArt } from "../../app/guest/badge/card";
import { getPass } from "../api/pass";
import { passQrModules, renderPassQrSvg } from "./qr";

/**
 * The signed pass (GET /pass) as the name badge's QR: the SVG and its module matrix. Never throws
 * and never rejects; any failure is null, and the badge prints its ASCII artwork instead. The QR
 * encodes the signed pass (`encodePassQr`), never the invitation token, which is only sent as the
 * bearer header and never logged. Server only: the page starts it without awaiting it, so neither
 * the portal's first paint nor its actions wait on the pass.
 */
export async function loadPassArt(token: string): Promise<PassArt | null> {
  try {
    const pass = await getPass(token);
    if (pass.status !== "ok") return null;
    return { svg: await renderPassQrSvg(pass.data), ...passQrModules(pass.data) };
  } catch {
    return null;
  }
}
