import { useCallback, useEffect, useRef, useState } from "react";
import { browserApiOrigin } from "../../../lib/api/browser-origin";
import { uploadFailure, type UploadFailure } from "../../../lib/memories/camera-upload";
import { previewDataUrl, rememberOwnPost } from "../../../lib/memories/own-posts";
import { isOffline } from "./local-items";

/**
 * The locket's outbox. A sent photo goes to the top of the feed at once and stays there with
 * its state until the gallery lists it:
 * - `sending` while POST /media runs;
 * - `queued` when the phone is offline: it sends by itself when the browser is back online;
 * - `failed` when trying again can work (network, a busy or broken server): Retry;
 * - `rejected` when the same photo would be refused again (signed out, roll full, too large): Remove;
 * - `sent` once the API has it. It is then remembered as an own post (`lib/memories/own-posts.ts`),
 *   so the live feed carries it as "developing" and this outbox copy steps aside.
 * The capture is kept in memory only, never in storage, and its object URL is revoked on removal or unmount.
 */
export type ShotStatus = "sending" | "queued" | "failed" | "rejected" | "sent";

export type Shot = {
  key: string;
  blob: Blob;
  url: string;
  status: ShotStatus;
  failure?: UploadFailure;
  publicId?: string;
};

export type ShotEvent =
  | { type: "sending" }
  | { type: "sent" }
  | { type: "queued" }
  | { type: "failed"; failure: UploadFailure };

type UploadMediaResponse = {
  publicId: string;
  processingStatus: "pending" | "ready" | "failed";
  shotsRemaining: number;
};

function isUploadMediaResponse(value: unknown): value is UploadMediaResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.publicId === "string"
    && (response.processingStatus === "pending" || response.processingStatus === "ready" || response.processingStatus === "failed")
    && typeof response.shotsRemaining === "number"
    && Number.isInteger(response.shotsRemaining)
    && response.shotsRemaining >= 0;
}

type Outcome =
  | { ok: true; publicId: string; shotsRemaining: number }
  | { ok: false; failure: UploadFailure; status?: number };

/** POST /media, browser-direct with the invitation cookie (Path B). Unchanged from the former CameraPanel. */
async function postShot(blob: Blob): Promise<Outcome> {
  const form = new FormData();
  form.append("file", blob, "graduation-photo.jpg");

  let response: Response;
  try {
    response = await fetch(`${browserApiOrigin()}/media`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    return { ok: false, failure: uploadFailure(isOffline() ? "offline" : "network") };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, failure: uploadFailure(response.status), status: response.status };
  if (!isUploadMediaResponse(body)) return { ok: false, failure: uploadFailure("invalid-response") };
  return { ok: true, publicId: body.publicId, shotsRemaining: body.shotsRemaining };
}

let counter = 0;
const nextKey = () => `shot-${Date.now().toString(36)}-${(counter += 1)}`;

export function useShotQueue({
  onEvent,
  onSignedOut,
  onShotsRemaining,
}: {
  onEvent: (event: ShotEvent) => void;
  onSignedOut: () => void;
  onShotsRemaining: (count: number) => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  const callbacks = useRef({ onEvent, onSignedOut, onShotsRemaining });
  callbacks.current = { onEvent, onSignedOut, onShotsRemaining };

  const patch = useCallback((key: string, next: Partial<Shot>) => {
    setShots((current) => {
      const updated = current.map((shot) => (shot.key === key ? { ...shot, ...next } : shot));
      shotsRef.current = updated;
      return updated;
    });
  }, []);

  const send = useCallback(async (shot: Shot) => {
    const { onEvent: emit } = callbacks.current;
    if (isOffline()) {
      patch(shot.key, { status: "queued", failure: uploadFailure("offline") });
      emit({ type: "queued" });
      return;
    }
    patch(shot.key, { status: "sending", failure: undefined });
    emit({ type: "sending" });
    const outcome = await postShot(shot.blob);
    if (outcome.ok) {
      const { publicId } = outcome;
      // The live feed shows this shot from a small preview, "developing", while the API processes it (ADR-014).
      void previewDataUrl(shot.blob).then((preview) =>
        rememberOwnPost({ kind: "photo", publicId, preview, createdAt: new Date().toISOString(), savedAt: Date.now() }),
      );
      patch(shot.key, { status: "sent", publicId, failure: undefined });
      callbacks.current.onShotsRemaining(outcome.shotsRemaining);
      callbacks.current.onEvent({ type: "sent" });
      return;
    }
    const { failure, status } = outcome;
    const offline = failure.message === "camera.error.offline";
    patch(shot.key, { status: offline ? "queued" : failure.keep ? "failed" : "rejected", failure });
    if (status === 401) callbacks.current.onSignedOut();
    if (status === 409) callbacks.current.onShotsRemaining(0);
    callbacks.current.onEvent(offline ? { type: "queued" } : { type: "failed", failure });
  }, [patch]);

  const add = useCallback((blob: Blob) => {
    const shot: Shot = { key: nextKey(), blob, url: URL.createObjectURL(blob), status: "sending" };
    setShots((current) => {
      const updated = [shot, ...current];
      shotsRef.current = updated;
      return updated;
    });
    void send(shot);
  }, [send]);

  const retry = useCallback((key: string) => {
    const shot = shotsRef.current.find((item) => item.key === key);
    if (shot && shot.status !== "sending" && shot.status !== "sent") void send(shot);
  }, [send]);

  const remove = useCallback((key: string) => {
    setShots((current) => {
      const gone = current.find((shot) => shot.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      const updated = current.filter((shot) => shot.key !== key);
      shotsRef.current = updated;
      return updated;
    });
  }, []);

  // Back online: everything that waited for signal goes out by itself.
  useEffect(() => {
    const flush = () => {
      for (const shot of shotsRef.current) if (shot.status === "queued") void send(shot);
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [send]);

  // Leaving the page drops the in-memory captures.
  useEffect(() => () => {
    for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
  }, []);

  return { shots, add, retry, remove };
}
