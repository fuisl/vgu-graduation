"use client";

/* The kept capture is a local blob: URL; a Next image proxy cannot serve it. */
/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useEffect, useMemo } from "react";
import { Cta } from "@grad/ui";
import { browserApiOrigin } from "../../../lib/api/browser-origin";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { uploadFailure, type UploadFailure } from "../../../lib/memories/camera-upload";
import "./polaroid.css";

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode"));
    }, "image/jpeg", 0.85);
  });
}

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

/** Whether this visitor may shoot: `/api/me` decides before the camera asks for permission (QA P1-2). */
type Access = "checking" | "signed-in" | "signed-out" | "unknown";

/** A capture that has not reached the API yet, kept so the guest can retry instead of reshooting. */
type Pending = { blob: Blob; url: string };

export function CameraPanel({ messages }: { messages: MessageSlice<"camera."> }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [access, setAccess] = useState<Access>("checking");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [localError, setLocalError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Counter States
  const [photosRemaining, setPhotosRemaining] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  // Signed out? Say so before the shutter (and before the camera permission prompt).
  // If /api/me cannot be reached the camera still starts; the upload answer decides then.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { signedIn?: boolean } | null) => {
        if (body && typeof body.signedIn === "boolean") setAccess(body.signedIn ? "signed-in" : "signed-out");
        else setAccess("unknown");
      })
      .catch(() => {
        if (!controller.signal.aborted) setAccess("unknown");
      });
    return () => controller.abort();
  }, []);

  const mayShoot = access === "signed-in" || access === "unknown";

  // Keep camera running as long as there is film
  useEffect(() => {
    if (!mayShoot) return;
    let currentStream: MediaStream | null = null;
    let cancelled = false;

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError(t("camera.error.insecure"));
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
        }
      } catch {
        if (!cancelled) setCameraError(t("camera.error.denied"));
      }
    };

    if (photosRemaining !== 0) {
      void startCamera();
    }

    return () => {
      cancelled = true;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [mayShoot, photosRemaining, facingMode, t]);

  // The kept capture's object URL lives as long as it is shown.
  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.url);
  }, [pending]);

  const keep = (blob: Blob) => setPending({ blob, url: URL.createObjectURL(blob) });

  const upload = async (blob: Blob) => {
    setIsSubmitting(true);
    setFailure(null);
    setLocalError("");
    setUploadSuccess("");
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setFailure(uploadFailure("offline"));
        return;
      }
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
        setFailure(uploadFailure(navigator.onLine === false ? "offline" : "network"));
        return;
      }

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const next = uploadFailure(response.status);
        setFailure(next);
        if (!next.keep) setPending(null);
        if (response.status === 401) setAccess("signed-out");
        if (response.status === 409) setPhotosRemaining(0);
        return;
      }
      if (!isUploadMediaResponse(body)) {
        setFailure(uploadFailure("invalid-response"));
        return;
      }

      setPending(null);
      setIsRolling(true);
      setTimeout(() => {
        setIsRolling(false);
        setPhotosRemaining(body.shotsRemaining);
      }, 400);
      setUploadSuccess(body.processingStatus === "ready" ? t("camera.added") : t("camera.received"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // After an upload settles, its outcome is read out and the status region takes focus,
  // so a guest on a screen reader or keyboard never lands on a removed control.
  const settled = !isSubmitting && (failure !== null || uploadSuccess !== "");
  useEffect(() => {
    if (settled) statusRef.current?.focus();
  }, [settled]);

  const handleCaptureAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photosRemaining === 0 || !videoRef.current || !canvasRef.current || cameraError) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Maintain aspect ratio while standardizing size
    const size = Math.min(video.videoWidth, video.videoHeight);
    if (size <= 0) {
      setLocalError(t("camera.error.starting"));
      return;
    }
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setLocalError(t("camera.error.capture"));
      return;
    }

    // Crop center for a square polaroid look
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    if (facingMode === "user") {
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);

    let blob: Blob;
    try {
      blob = await jpegBlob(canvas);
    } catch {
      setLocalError(t("camera.error.capture"));
      return;
    }
    // A new shot replaces any capture still waiting to upload.
    keep(blob);
    await upload(blob);
  };

  const mirrored = facingMode === "user";
  const errorText = localError || (failure ? t(failure.message) : "");

  return (
    <form onSubmit={handleCaptureAndSubmit} className="mem-panel cam-panel">
      <div className="mem-field">
        <p className="mem-label" id="viewfinder-label">{t("camera.viewfinder")}</p>
        <div className="cam-viewfinder" role="group" aria-labelledby="viewfinder-label">
          {access === "signed-out" ? (
            <div className="cam-message cam-message--notice">
              <p className="cam-message__title">{t("camera.signedOut.title")}</p>
              <p className="cam-message__body">{t("camera.signedOut.body")}</p>
              <Cta tone="on-blue" href="/me">{t("camera.signedOut.link")}</Cta>
            </div>
          ) : cameraError ? (
            <div className="cam-message" role="alert">{cameraError}</div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label={t("camera.preview")}
              className={`cam-video${mirrored ? " is-mirrored" : ""}`}
            />
          )}

          {mayShoot ? (
            <>
              {/* Mechanical odometer: rolls to the new count after each shot */}
              <div
                className="cam-overlay cam-overlay--right cam-counter"
                aria-label={photosRemaining === null ? t("camera.shotsUnknown") : t.plural("camera.shots", photosRemaining)}
                role="img"
              >
                <div className={`cam-counter-track${isRolling ? " is-rolling" : ""}`} aria-hidden="true">
                  <div className="cam-counter-num">{photosRemaining ?? "--"}</div>
                  <div className="cam-counter-num">{photosRemaining === null ? "--" : Math.max(photosRemaining - 1, 0)}</div>
                </div>
              </div>

              {/* The visible text is the action, and the whole accessible name (QA P1-6). */}
              <button
                type="button"
                onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                className="cam-flip cam-overlay cam-overlay--left"
              >
                {mirrored ? t("camera.switchToRear") : t("camera.switchToSelfie")}
              </button>

              <div className="cam-shutter">
                <button
                  type="submit"
                  disabled={isSubmitting || !!cameraError || photosRemaining === 0}
                  className="cam-shutter-button"
                  aria-label={isSubmitting ? t("camera.uploading") : t("camera.take")}
                >
                  <span className="cam-shutter-inner" aria-hidden="true" />
                </button>
              </div>
            </>
          ) : null}

          {photosRemaining === 0 && (
            <div className="cam-film-empty">
              <span className="mem-label cam-film-empty__label">{t("camera.empty")}</span>
              <p className="cam-film-empty__text">{t("camera.emptyBody")}</p>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} hidden />
        <p className="mem-help">{t("camera.public")}</p>
        <div ref={statusRef} tabIndex={-1} className="cam-status">
          {errorText ? <p role="alert" className="mem-status mem-status--error">{errorText}</p> : null}
          {uploadSuccess ? <p role="status" className="mem-status mem-status--success">{uploadSuccess}</p> : null}
          {isSubmitting ? <p role="status" className="mem-status">{t("camera.uploading")}</p> : null}
        </div>
        {pending && (failure?.keep || isSubmitting) ? (
          <div className="cam-pending">
            <div className="mem-polaroid cam-pending__photo">
              <div className="mem-polaroid-frame">
                <img src={pending.url} alt={t("camera.pendingAlt")} className="mem-polaroid-img" />
              </div>
            </div>
            <Cta tone="on-white" variant="secondary" onClick={() => void upload(pending.blob)} disabled={isSubmitting}>
              {t("camera.retry")}
            </Cta>
          </div>
        ) : null}
      </div>
    </form>
  );
}
