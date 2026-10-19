import { describe, expect, it } from "vitest";
import { lookupMessage } from "../i18n/dictionary";
import { uploadFailure, type UploadProblem } from "./camera-upload";

describe("uploadFailure (QA P1-2)", () => {
  it("keeps the capture when trying again can work", () => {
    for (const problem of ["offline", "network", "invalid-response", 500, 502, 503] as UploadProblem[]) {
      expect(uploadFailure(problem).keep).toBe(true);
    }
    expect(uploadFailure("offline").message).toBe("camera.error.offline");
    expect(uploadFailure(503).message).toBe("camera.error.busy");
  });

  it("drops it when the same photo or invitation will be refused again", () => {
    expect(uploadFailure(401)).toEqual({ message: "camera.error.signedOut", keep: false });
    expect(uploadFailure(404)).toEqual({ message: "camera.error.invalid", keep: false });
    expect(uploadFailure(410)).toEqual({ message: "camera.error.expired", keep: false });
    expect(uploadFailure(409)).toEqual({ message: "camera.error.rollFull", keep: false });
    expect(uploadFailure(413)).toEqual({ message: "camera.error.tooLarge", keep: false });
    expect(uploadFailure(415)).toEqual({ message: "camera.error.unsupported", keep: false });
  });

  it("speaks plainly in both languages, never about the API", () => {
    for (const problem of ["offline", "network", 401, 409, 413, 415, 503] as UploadProblem[]) {
      for (const locale of ["en", "vi"] as const) {
        const text = lookupMessage(locale, uploadFailure(problem).message);
        expect(text).not.toMatch(/\bAPI\b|HTTP|token|bearer/i);
      }
    }
  });
});
