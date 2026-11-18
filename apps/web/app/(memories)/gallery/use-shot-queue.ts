import { useCallback, useEffect, useRef, useState } from "react";
import { browserApiOrigin } from "../../../lib/api/browser-origin";
import { uploadFailure, type UploadFailure } from "../../../lib/memories/camera-upload";
import { previewDataUrl, rememberOwnPost } from "../../../lib/memories/own-posts";
import { parseUploadResponse } from "../wall/wall-logic";
import { isOffline } from "./local-items";

/**
 * The camera's outbox (on /wall). A sent photo goes to the top of the feed at once and stays
 * there with its state until the gallery lists it:
 * - `sending` while POST /media runs;
 * - `queued` when the phone is offline: it sends by itself when the browser is back online;
 * - `failed` when trying again can work (network, rate limit, a busy or broken server): Retry;
 * - `rejected` when the same photo would be refused again (roll full, too large, unsupported): Remove;
 * - `sent` once the API has it. It is then remembered as an own post (`lib/memories/own-posts.ts`),
 *   so the live feed carries it as "developing" (or "waiting for approval" when the API says it is
 *   `pending` review, ADR-019) and this outbox copy steps aside.
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
  /** Once sent: `pending` while it waits for an organizer's approval (a visitor without an invitation). */
  review?: "pending" | "visible";
};

export type ShotEvent =
  | { type: "sending" }
  | { type: "sent"; review: "pending" | "visible" }
  | { type: "queued" }
  | { type: "failed"; failure: UploadFailure };

type Outcome =
  | { ok: true; publicId: string; shotsRemaining: number | null; review: "pending" | "visible" }
  | { ok: false; failure: UploadFailure; status?: number };

/**
 * POST /media, browser-direct (Path B). The invitation cookie rides along when there is one; a
 * visitor without one can post too, and their photo comes back `pending` until an organizer
 * approves it (ADR-019).
 */
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
  const upload = parseUploadResponse(body);
  if (!upload) return { ok: false, failure: uploadFailure("invalid-response") };
  return { ok: true, publicId: upload.publicId, shotsRemaining: upload.shotsRemaining, review: upload.reviewStatus };
}

let counter = 0;
const nextKey = () => `shot-${Date.now().toString(36)}-${(counter += 1)}`;

export function useShotQueue({
  onEvent,
  onShotsRemaining,
}: {
  onEvent: (event: ShotEvent) => void;
  onShotsRemaining: (count: number) => void;
}) {
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  const callbacks = useRef({ onEvent, onShotsRemaining });
  callbacks.current = { onEvent, onShotsRemaining };

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
      const { publicId, review } = outcome;
      // The live feed shows this shot from a small preview: "developing" while the API processes it
      // (ADR-014), or "waiting for approval" until an organizer approves it (ADR-019).
      void previewDataUrl(shot.blob).then((preview) =>
        rememberOwnPost({
          kind: "photo",
          publicId,
          preview,
          createdAt: new Date().toISOString(),
          savedAt: Date.now(),
          ...(review === "pending" ? { review: "pending" as const } : {}),
        }),
      );
      patch(shot.key, { status: "sent", publicId, review, failure: undefined });
      if (outcome.shotsRemaining !== null) callbacks.current.onShotsRemaining(outcome.shotsRemaining);
      callbacks.current.onEvent({ type: "sent", review });
      return;
    }
    const { failure, status } = outcome;
    const offline = failure.message === "camera.error.offline";
    patch(shot.key, { status: offline ? "queued" : failure.keep ? "failed" : "rejected", failure });
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
