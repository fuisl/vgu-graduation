"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { BackgroundMotion } from "../background/BackgroundMotion";
import { TwinkleField } from "../background/TwinkleField";
import { GridCells } from "../background/GridCells";
import { BrandName } from "../logo/BrandName";
import { DecodeText } from "../landing-title/DecodeText";
import { ArrowUpRight } from "../icons/ArrowUpRight";
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

  return (
    <main className="landing-page">
      <style dangerouslySetInnerHTML={{ __html: `
        .w-wrapper { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; overflow-y: auto; width: 100%; box-sizing: border-box; }
        .w-container { width: 100%; max-width: 640px; margin: 0 auto; }
        .w-header { text-align: center; margin-bottom: 32px; }
        .w-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 500; color: #ECF0F9; margin: 12px 0 0 0; letter-spacing: -0.02em; }
        .w-form { background: rgba(7, 10, 18, 0.75); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(150, 168, 211, 0.14); padding: 32px; display: flex; flex-direction: column; gap: 28px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        .w-field { display: flex; flex-direction: column; width: 100%; }
        .w-label { font-family: var(--font-mono, monospace); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: #8790A7; margin-bottom: 10px; }

        .w-viewfinder-container { position: relative; width: 100%; aspect-ratio: 4/3; background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(150, 168, 211, 0.2); overflow: hidden; display: flex; align-items: center; justify-content: center; }
        .w-viewfinder-video { width: 100%; height: 100%; object-fit: cover; transform: ${facingMode === "user" ? "scaleX(-1)" : "none"}; }

        /* STRICT Odometer Wheel Counter CSS */
        .w-film-counter-window {
          position: absolute; top: 12px; right: 12px; z-index: 10;
          background: rgba(0,0,0,0.7); color: #8da5e3;
          border: 1px solid #8da5e3; backdrop-filter: blur(4px); box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
          font-family: var(--font-mono, monospace); font-size: 12px;
          height: 24px;
          padding: 0 10px;
          min-width: 36px;
          overflow: hidden;
          display: flex; justify-content: center; align-items: flex-start;
          box-sizing: content-box;
        }
        .w-film-counter-track { display: flex; flex-direction: column; align-items: center; width: 100%; }
        .counter-num {
          height: 24px;
          line-height: 24px;
          display: flex; align-items: center; justify-content: center; font-weight: bold;
          margin: 0; padding: 0;
        }

        .w-flip-btn { position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,0.6); color: #ECF0F9; border: 1px solid rgba(150,168,211,0.3); padding: 5px 10px; font-family: var(--font-mono, monospace); font-size: 10px; cursor: pointer; backdrop-filter: blur(4px); z-index: 10; transition: border-color 0.2s; }
        .w-flip-btn:hover { border-color: #8da5e3; }
        .w-camera-error { color: #f87171; font-family: var(--font-mono, monospace); font-size: 12px; text-align: center; padding: 20px; background: rgba(0,0,0,0.8); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

        /* Perfect Circle Shutter Button */
        .w-shutter-container { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; align-items: center; justify-content: center; }
        .w-shutter-btn { width: 50px; height: 50px; min-width: 50px; min-height: 50px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); border: 2.5px solid #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; backdrop-filter: blur(4px); transition: transform 0.1s ease, background-color 0.2s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.5); box-sizing: border-box; flex-shrink: 0; }
        .w-shutter-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.45); transform: scale(1.05); }
        .w-shutter-btn:active:not(:disabled) { transform: scale(0.95); }
        .w-shutter-btn:disabled { opacity: 0.4; cursor: not-allowed; border-color: rgba(255,255,255,0.3); }
        .w-shutter-inner { width: 34px; height: 34px; min-width: 34px; min-height: 34px; border-radius: 50%; background: #fff; transition: background-color 0.2s; box-sizing: border-box; flex-shrink: 0; }

        .w-assign-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .w-btn-link { font-family: var(--font-mono, monospace); font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #8da5e3; background: none; border: none; cursor: pointer; padding: 0; transition: color 0.2s ease; }
        .w-btn-link:hover { color: #fff; }
        .w-assign-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .w-assign-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(150, 168, 211, 0.14); cursor: pointer; transition: all 0.2s ease; text-align: left; }
        .w-assign-card:hover { background: rgba(0, 0, 0, 0.45); border-color: rgba(150, 168, 211, 0.3); }
        .w-assign-card.selected { background: rgba(141, 165, 227, 0.12); border-color: #8da5e3; }
        .w-avatar { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #27272a; color: #a1a1aa; font-size: 9px; font-weight: bold; flex-shrink: 0; }
        .w-assign-card.selected .w-avatar { background: #8da5e3; color: #070a12; }
        .w-name { font-family: var(--font-mono, monospace); font-size: 0.8rem; color: #8790A7; }
        .w-assign-card.selected .w-name { color: #ECF0F9; }

        .w-empty-film { text-align: center; padding: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; background: rgba(7, 10, 18, 0.9); width: 100%; height: 100%; position: absolute; inset: 0; z-index: 20; }
      `}} />

      <section className="landing" aria-label="Polaroid submission">
        <BackgroundMotion />
        <div className="landing-aurora" aria-hidden="true">
          <span className="landing-aurora-blob" />
          <span className="landing-aurora-blob" />
          <span className="landing-aurora-blob" />
        </div>
        <div className="landing-field" aria-hidden="true"><GridCells /></div>
        <TwinkleField />

        <header className="landing-header">
          <Link className="landing-brand" href="/" aria-label="GRAD '26 home"><BrandName /></Link>
          <nav className="landing-nav" aria-label="Main navigation">
            <Link href="/gallery">Gallery</Link>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5}}>
              <span style={{fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'monospace'}}>Disposable</span>
            </div>
            <Link className="landing-signin" href="/guest/prototype">Guest Preview <ArrowUpRight /></Link>
          </nav>
        </header>

        <div className="w-wrapper">
          <div className="w-container">

            <div className="w-header">
              <div className="landing-event-meta mono" style={{justifyContent: 'center', marginBottom: '12px'}}>
                <p><DecodeText text="1-TAKE / POLAROID" delay={80} /></p>
                <span className="landing-event-signal" aria-hidden="true" style={{background: '#f87171', boxShadow: '0 0 8px #f87171'}} />
              </div>
              <h1 className="w-title"><DecodeText text="Snap a memory." delay={200} duration={800} /></h1>
            </div>

            <form onSubmit={handleCaptureAndSubmit} className="w-form">

              <div className="w-field">
                <label className="w-label"><DecodeText text="01 // VIEWFINDER" delay={300} /></label>
                <div className="w-viewfinder-container">
                  {cameraError ? (
                    <div className="w-camera-error">{cameraError}</div>
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-viewfinder-video"
                    />
                  )}

                  {/* Mechanical Odometer Wheel Counter */}
                  <div className="w-film-counter-window">
                    <div
                      className="w-film-counter-track"
                      style={{
                        transform: isRolling ? 'translateY(-24px)' : 'translateY(0)',
                        transition: isRolling ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
                      }}
                    >
                      <div className="counter-num">{photosRemaining ?? "--"}</div>
                      <div className="counter-num">{photosRemaining === null ? "--" : Math.max(photosRemaining - 1, 0)}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFacingMode(prev => prev === "user" ? "environment" : "user")}
                    className="w-flip-btn"
                  >
                    Flip ({facingMode === "user" ? "Selfie" : "Rear"})
                  </button>

                  <div className="w-shutter-container">
                    <button
                      type="submit"
                      disabled={isSubmitting || !!cameraError || photosRemaining === 0}
                      className="w-shutter-btn"
                      title="Snap photo"
                    >
                      <div className="w-shutter-inner" />
                    </button>
                  </div>

                  {photosRemaining === 0 && (
                    <div className="w-empty-film">
                      <span className="w-label" style={{ color: '#f87171' }}>Film Roll Empty (0/36)</span>
                      <p className="w-name" style={{ color: '#ECF0F9', fontSize: '14px', margin: 0 }}>You have used all exposures.</p>
                    </div>
                  )}

                </div>
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <p className="w-name" style={{ lineHeight: 1.6 }}>
                  By uploading, your photo may be shown on the event display and gallery, and kept in the four-year graduation archive. Contact an organizer to have something removed.
                </p>
                {uploadError ? <p role="alert" className="w-name" style={{ color: "#f0a3a3" }}>{uploadError}</p> : null}
                {uploadSuccess ? <p role="status" className="w-name" style={{ color: "#9fc8a6" }}>{uploadSuccess}</p> : null}
              </div>

            </form>

          </div>
        </div>
      </section>
    </main>
  );
}
