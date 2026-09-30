"use client";

import { useState, useRef, useEffect } from "react";
import { DecodeText } from "../landing-title/DecodeText";
import { MemoriesShell } from "../memories/MemoriesShell";
import { browserApiOrigin } from "../../lib/api/browser-origin";

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The captured photo could not be encoded"));
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

export default function PolaroidPage() {
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
          setCameraError("Camera blocked. HTTPS or localhost is required.");
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
        setCameraError("Camera access denied. Please check permissions.");
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
  }, [photosRemaining, facingMode]);

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
      setUploadError("The camera is still starting. Please wait a moment and try again.");
      setIsSubmitting(false);
      return;
    }
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setUploadError("This browser could not capture the photo.");
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
      if (!response.ok) {
        const detail = body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : "The photo could not be uploaded. Please try again.";
        throw new Error(detail);
      }

      if (!isUploadMediaResponse(body)) throw new Error("The upload response was invalid. Please try again.");

      setIsRolling(true);
      setTimeout(() => {
        setIsRolling(false);
        setPhotosRemaining(body.shotsRemaining);
      }, 400);
      setUploadSuccess(
        body.processingStatus === "ready"
          ? "Photo added to the gallery."
          : "Photo received. It will appear after processing.",
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The photo could not be uploaded. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const mirrored = facingMode === "user";

  return (
    <MemoriesShell current="polaroid" label="Disposable camera">
      <div className="memories-wrapper">
        <div className="memories-container">
          <div className="memories-heading">
            <div className="landing-event-meta mono">
              <p><DecodeText text="1-TAKE / POLAROID" delay={80} /></p>
              <span className="landing-event-signal" aria-hidden="true" />
            </div>
            <h1 className="memories-title"><DecodeText text="Snap a memory." delay={200} duration={800} /></h1>
          </div>

          <form onSubmit={handleCaptureAndSubmit} className="memories-panel">
            <div className="memories-field">
              <p className="memories-label" id="viewfinder-label">01 / Viewfinder</p>
              <div className="memories-viewfinder" role="group" aria-labelledby="viewfinder-label">
                {cameraError ? (
                  <div className="memories-viewfinder-message" role="alert">{cameraError}</div>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Camera preview"
                    className={`memories-viewfinder-video${mirrored ? " is-mirrored" : ""}`}
                  />
                )}

                {/* Mechanical odometer: rolls to the new count after each shot */}
                <div
                  className="memories-viewfinder-overlay memories-viewfinder-overlay--right memories-counter"
                  aria-label={photosRemaining === null ? "Shots remaining unknown until your first photo" : `${photosRemaining} shots remaining`}
                  role="img"
                >
                  <div className={`memories-counter-track${isRolling ? " is-rolling" : ""}`} aria-hidden="true">
                    <div className="memories-counter-num">{photosRemaining ?? "--"}</div>
                    <div className="memories-counter-num">{photosRemaining === null ? "--" : Math.max(photosRemaining - 1, 0)}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                  className="memories-button memories-viewfinder-overlay memories-viewfinder-overlay--left"
                  aria-label={`Switch to ${mirrored ? "rear" : "selfie"} camera`}
                >
                  Flip ({mirrored ? "Selfie" : "Rear"})
                </button>

                <div className="memories-shutter">
                  <button
                    type="submit"
                    disabled={isSubmitting || !!cameraError || photosRemaining === 0}
                    className="memories-shutter-button"
                    aria-label={isSubmitting ? "Uploading photo" : "Take photo"}
                  >
                    <span className="memories-shutter-inner" aria-hidden="true" />
                  </button>
                </div>

                {photosRemaining === 0 && (
                  <div className="memories-film-empty">
                    <span className="memories-label memories-status--error">
                      Film roll empty
                    </span>
                    <p className="memories-status">You have used all exposures.</p>
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} hidden />
              <p className="memories-help">
                Your photo is public: it may be shown on the event display and gallery, and kept in the four-year
                graduation archive. Contact an organizer to have something removed.
              </p>
              {uploadError ? <p role="alert" className="memories-status memories-status--error memories-status--left">{uploadError}</p> : null}
              {uploadSuccess ? <p role="status" className="memories-status memories-status--success memories-status--left">{uploadSuccess}</p> : null}
            </div>
          </form>
        </div>
      </div>
    </MemoriesShell>
  );
}
