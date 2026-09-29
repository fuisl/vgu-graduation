import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { encodePassQr, type PassResponse } from "@grad/contract";
import { renderPassQrSvg } from "./qr";

const pass: PassResponse = {
  payload: {
    v: 1,
    invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
    guestName: "Nguyễn Thị Ánh Tuyết",
    validFrom: "2026-10-01T00:00:00.000Z",
    validUntil: "2026-12-31T00:00:00.000Z",
  },
  signature: "A".repeat(86),
  keyId: "2026-1",
};

describe("renderPassQrSvg", () => {
  it("renders a black-on-white SVG for a Vietnamese name", async () => {
    const svg = await renderPassQrSvg(pass);
    expect(svg).toContain("<svg");
    expect(svg).toContain("#000000");
    expect(svg).toContain("#ffffff");
  });

  it("encodes exactly encodePassQr(pass)", async () => {
    const text = encodePassQr(pass);
    expect(text.startsWith("GP1.2026-1.")).toBe(true);
    expect(await renderPassQrSvg(pass)).toBe(
      await QRCode.toString(text, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 4,
        color: { dark: "#000000", light: "#ffffff" },
      }),
    );
  });
});
