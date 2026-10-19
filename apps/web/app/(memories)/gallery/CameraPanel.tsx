"use client";

/* The capture under review is a local blob: URL; a Next image proxy cannot serve it. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { MessageKeys, SliceTranslator } from "../../../lib/i18n/format";
import { cameraProblem } from "./locket-logic";
import type { Access } from "./use-access";
import "./camera.css";

type T = SliceTranslator<MessageKeys<"camera.">>;

/**
 * What the viewfinder shows. `off` covers "not yet" (checking the invitation, signed out,
 * roll used up, tab hidden); `starting` is the wait for getUserMedia, which is when the
 * browser's permission prompt is up.
 */
type CameraState = "off" | "starting" | "live" | "denied" | "none" | "busy";

type Still = { blob: Blob; url: string };

/** Longest edge of a library photo after the square crop; the API makes its own derivatives. */
const LIBRARY_MAX_EDGE = 2048;

function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode"));
    }, "image/jpeg", 0.85);
  });
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * A library photo, square-cropped and re-encoded like a camera shot. Re-encoding also drops
 * the file's metadata (location, device) before anything leaves the phone. If this browser
 * cannot decode the file (HEIC on some desktops), it is sent as is and the API decides.
 */
async function squareFromFile(file: File, canvas: HTMLCanvasElement): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side <= 0) return file;
    const edge = Math.min(side, LIBRARY_MAX_EDGE);
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, edge, edge);
    return await jpegBlob(canvas);
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The locket camera (#149, camera-first redesign): a square live viewfinder that opens on
 * entry, a big shutter, flip, then Retake or Send. Sending hands the capture to the outbox
 * (`onSend`) and the camera is ready again at once. The stream stops whenever the tab is
 * hidden or the page unmounts, so the camera light goes off with it.
 */
export function CameraPanel({
  t,
  access,
  shotsRemaining,
  onSend,
}: {
  t: T;
  access: Access;
  shotsRemaining: number | null;
  onSend: (blob: Blob) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const focusAfter = useRef<"shutter" | "review" | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [visible, setVisible] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [still, setStill] = useState<Still | null>(null);
  const [note, setNote] = useState("");

  const signedOut = access === "signed-out";
  // While /api/me answers, the controls show (no layout shift) but the camera waits.
  const mayShoot = access === "signed-in" || access === "unknown";
  const rollEmpty = shotsRemaining === 0;
  const reviewing = still !== null;

  // Hidden tab: stop the camera (battery, and the privacy light); back: start it again.
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!mayShoot || rollEmpty || !visible) {
      setCamera("off");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamera("none");
      return;
    }
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCamera("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode, width: { ideal: 1440 }, height: { ideal: 1440 } }, audio: false })
      .then((next) => {
        if (cancelled) {
          stopStream(next);
          return;
        }
        stream = next;
        if (video) video.srcObject = next;
        setCamera("live");
        // Offer Flip only when there is a second camera to flip to.
        navigator.mediaDevices
          .enumerateDevices?.()
          .then((devices) => {
            if (!cancelled) setCanFlip(devices.filter((device) => device.kind === "videoinput").length > 1);
          })
          .catch(() => undefined);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCamera(cameraProblem(error));
      });
    return () => {
      cancelled = true;
      stopStream(stream);
      if (video) video.srcObject = null;
    };
  }, [mayShoot, rollEmpty, visible, facingMode, attempt]);

  // The still under review owns its object URL.
  useEffect(() => () => {
    if (still) URL.revokeObjectURL(still.url);
  }, [still]);

  // Focus follows the step, so a keyboard or screen-reader user never lands on a removed control.
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === "review") reviewRef.current?.querySelector<HTMLButtonElement>("button:last-of-type")?.focus();
    if (target === "shutter") {
      // Back at the shutter, or at the fallback actions when the browser camera is blocked.
      (shutterRef.current ?? viewfinderRef.current?.querySelector<HTMLElement>("button, a[href]"))?.focus();
    }
  }, [still]);

  const review = (blob: Blob) => {
    setNote("");
    focusAfter.current = "review";
    setStill({ blob, url: URL.createObjectURL(blob) });
  };

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || camera !== "live" || reviewing) return;

    // A square, centre-cropped, like the viewfinder shows it.
    const size = Math.min(video.videoWidth, video.videoHeight);
    if (size <= 0) {
      setNote(t("camera.error.starting"));
      return;
    }
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNote(t("camera.error.capture"));
      return;
    }
    if (facingMode === "user") {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, size, size);
    try {
      review(await jpegBlob(canvas));
    } catch {
      setNote(t("camera.error.capture"));
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canvasRef.current) return;
    review(await squareFromFile(file, canvasRef.current));
  };

  const retake = () => {
    focusAfter.current = "shutter";
    setStill(null);
  };

  const send = () => {
    if (!still) return;
    onSend(still.blob);
    focusAfter.current = "shutter";
    setStill(null);
  };

  const onReviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      retake();
    }
  };

  const mirrored = facingMode === "user" && !reviewing;
  const blocked = camera === "denied" || camera === "none" || camera === "busy";
  const showShutter = !signedOut && !rollEmpty && !blocked && !reviewing;

  // The phone's own camera app and the photo library: the way in when the browser camera is not.
  const fallback = (primary: "camera" | "retry") => (
    <div className="cam-actions">
      {primary === "retry" ? (
        <Cta tone="on-blue" onClick={() => setAttempt((count) => count + 1)}>{t("camera.retryCamera")}</Cta>
      ) : (
        <Cta tone="on-blue" onClick={() => cameraInputRef.current?.click()}>{t("camera.usePhoneCamera")}</Cta>
      )}
      <Cta tone="on-blue" variant="secondary" onClick={() => libraryInputRef.current?.click()}>{t("camera.chooseLibrary")}</Cta>
    </div>
  );

  return (
    <div className="cam">
      <div className="cam-viewfinder" ref={viewfinderRef} role="group" aria-label={t("camera.viewfinder")}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          className={`cam-video${mirrored ? " is-mirrored" : ""}${camera === "live" && !reviewing ? "" : " is-idle"}`}
        />

        {reviewing ? <img src={still.url} alt={t("camera.reviewAlt")} className="cam-still" /> : null}

        {signedOut ? (
          <div className="cam-message">
            <p className="cam-message__title">{t("camera.signedOut.title")}</p>
            <p className="cam-message__body">{t("camera.signedOut.body")}</p>
            <div className="cam-actions">
              <Cta tone="on-blue" href="/me">{t("camera.signedOut.link")}</Cta>
            </div>
          </div>
        ) : rollEmpty && !reviewing ? (
          <div className="cam-message">
            <p className="cam-message__title">{t("camera.empty")}</p>
            <p className="cam-message__body">{t("camera.emptyBody")}</p>
          </div>
        ) : reviewing ? null : camera === "starting" ? (
          <p className="cam-hint" role="status">{t("camera.prompting")}</p>
        ) : camera === "denied" ? (
          <div className="cam-message" role="alert">
            <p className="cam-message__title">{t("camera.denied.title")}</p>
            <p className="cam-message__body">{t("camera.denied.body")}</p>
            {fallback("camera")}
          </div>
        ) : camera === "none" ? (
          <div className="cam-message" role="alert">
            <p className="cam-message__title">{t("camera.none.title")}</p>
            <p className="cam-message__body">{t("camera.none.body")}</p>
            {fallback("camera")}
          </div>
        ) : camera === "busy" ? (
          <div className="cam-message" role="alert">
            <p className="cam-message__title">{t("camera.busy.title")}</p>
            <p className="cam-message__body">{t("camera.busy.body")}</p>
            {fallback("retry")}
          </div>
        ) : null}
      </div>

      {reviewing ? (
        <div className="cam-controls cam-controls--review" ref={reviewRef} role="group" aria-label={t("camera.review")} onKeyDown={onReviewKeyDown}>
          <Cta tone="on-blue" variant="secondary" onClick={retake}>{t("camera.retake")}</Cta>
          <Cta tone="on-blue" onClick={send} icon={<PaperPlanePixel />}>{t("camera.send")}</Cta>
        </div>
      ) : showShutter ? (
        <div className="cam-controls">
          <p className="cam-count">{shotsRemaining === null ? null : t.plural("camera.shots", shotsRemaining)}</p>
          <button
            ref={shutterRef}
            type="button"
            className="cam-shutter"
            onClick={() => void capture()}
            disabled={camera !== "live"}
            aria-label={t("camera.take")}
          >
            <span className="cam-shutter__inner" aria-hidden="true" />
          </button>
          <div className="cam-side">
            {canFlip ? (
              <button
                type="button"
                className="cam-flip"
                onClick={() => setFacingMode((mode) => (mode === "user" ? "environment" : "user"))}
                aria-label={facingMode === "user" ? t("camera.flipToRear") : t("camera.flipToSelfie")}
              >
                {t("camera.flip")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {note ? <p className="cam-note" role="alert">{note}</p> : null}
      {signedOut ? null : <p className="cam-public">{t("camera.public")}</p>}

      <canvas ref={canvasRef} hidden />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void onFile(event)} />
      <input ref={libraryInputRef} type="file" accept="image/*" hidden onChange={(event) => void onFile(event)} />
    </div>
  );
}
