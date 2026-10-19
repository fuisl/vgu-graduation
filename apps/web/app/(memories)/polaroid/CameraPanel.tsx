"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { browserApiOrigin } from "../../../lib/api/browser-origin";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import "./polaroid.css";

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode"));
    }, "image/jpeg", 0.85);
  });
}

/** What a failed POST /media means for the guest, by status, in their language (#9). Never echoes server detail. */
function uploadErrorId(status: number) {
  if (status === 401) return "camera.error.signedOut" as const;
  if (status === 404) return "camera.error.invalid" as const;
  if (status === 410) return "camera.error.expired" as const;
  if (status === 409) return "camera.error.rollFull" as const;
  if (status === 413) return "camera.error.tooLarge" as const;
  return "camera.error.upload" as const;
}

/** An upload failure whose message is already in the guest's language. */
class UploadError extends Error {}

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

export function CameraPanel({ messages }: { messages: MessageSlice<"camera."> }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  // Counter States
  const [photosRemaining, setPhotosRemaining] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  // Keep camera running as long as there is film
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        // [FIX APPLIED]: Check if API exists before calling it to prevent undefined crashes
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraError(t("camera.error.insecure"));
          return;
        }

        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode, width: { ideal: 1080 }, height: { ideal: 1440 } },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
        }
      } catch (err) {
        console.error("Camera access denied or failed", err);
        setCameraError(t("camera.error.denied"));
      }
    };

    if (photosRemaining !== 0) {
      void startCamera();
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [photosRemaining, facingMode, t]);

  const handleCaptureAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photosRemaining === 0 || !videoRef.current || !canvasRef.current || cameraError) return;

    setIsSubmitting(true);
    setUploadError("");
    setUploadSuccess("");

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Maintain aspect ratio while standardizing size
    const size = Math.min(video.videoWidth, video.videoHeight);
    if (size <= 0) {
      setUploadError(t("camera.error.starting"));
      setIsSubmitting(false);
      return;
    }
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setUploadError(t("camera.error.capture"));
      setIsSubmitting(false);
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

    try {
      const file = await jpegBlob(canvas);
      const form = new FormData();
      form.append("file", file, "graduation-photo.jpg");

      const response = await fetch(`${browserApiOrigin()}/media`, {
        method: "POST",
        credentials: "include",
        body: form,
      });

      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new UploadError(t(uploadErrorId(response.status)));

      if (!isUploadMediaResponse(body)) throw new UploadError(t("camera.error.upload"));

      setIsRolling(true);
      setTimeout(() => {
        setIsRolling(false);
        setPhotosRemaining(body.shotsRemaining);
      }, 400);
      setUploadSuccess(body.processingStatus === "ready" ? t("camera.added") : t("camera.received"));
    } catch (error) {
      setUploadError(error instanceof UploadError ? error.message : t("camera.error.upload"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const mirrored = facingMode === "user";

  return (
    <form onSubmit={handleCaptureAndSubmit} className="mem-panel cam-panel">
      <div className="mem-field">
        <p className="mem-label" id="viewfinder-label">{t("camera.viewfinder")}</p>
        <div className="cam-viewfinder" role="group" aria-labelledby="viewfinder-label">
          {cameraError ? (
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

          <button
            type="button"
            onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
            className="cam-flip cam-overlay cam-overlay--left"
            aria-label={mirrored ? t("camera.switchToRear") : t("camera.switchToSelfie")}
          >
            {mirrored ? t("camera.flipSelfie") : t("camera.flipRear")}
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

          {photosRemaining === 0 && (
            <div className="cam-film-empty">
              <span className="mem-label cam-film-empty__label">{t("camera.empty")}</span>
              <p className="cam-film-empty__text">{t("camera.emptyBody")}</p>
            </div>
          )}
        </div>
        <canvas ref={canvasRef} hidden />
        <p className="mem-help">{t("camera.public")}</p>
        {uploadError ? <p role="alert" className="mem-status mem-status--error">{uploadError}</p> : null}
        {uploadSuccess ? <p role="status" className="mem-status mem-status--success">{uploadSuccess}</p> : null}
      </div>
    </form>
  );
}
