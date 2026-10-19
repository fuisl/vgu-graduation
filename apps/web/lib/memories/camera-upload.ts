import type { MessageKeys } from "../i18n/format";

/**
 * What a failed guest-camera upload (POST /media) means for the guest (QA P1-2), in plain words
 * by status, never the API's own message. `keep` says whether the capture stays on the page
 * with "Retry upload": yes when trying again can work (offline, the network, a busy or broken
 * server), no when the same photo will be refused again or the guest cannot upload at all.
 */
export type UploadFailure = { message: MessageKeys<"camera.error.">; keep: boolean };

export type UploadProblem = number | "offline" | "network" | "invalid-response";

export function uploadFailure(problem: UploadProblem): UploadFailure {
  switch (problem) {
    case "offline":
      return { message: "camera.error.offline", keep: true };
    case "network":
      return { message: "camera.error.network", keep: true };
    case "invalid-response":
      return { message: "camera.error.upload", keep: true };
    case 401:
      return { message: "camera.error.signedOut", keep: false };
    case 403:
    case 404:
      return { message: "camera.error.invalid", keep: false };
    case 410:
      return { message: "camera.error.expired", keep: false };
    case 409:
      return { message: "camera.error.rollFull", keep: false };
    case 413:
      return { message: "camera.error.tooLarge", keep: false };
    case 415:
      return { message: "camera.error.unsupported", keep: false };
    case 503:
      return { message: "camera.error.busy", keep: true };
    default:
      return { message: "camera.error.upload", keep: true };
  }
}
