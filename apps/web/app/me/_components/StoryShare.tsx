"use client";

import { useEffect, useRef, useState } from "react";
import { Cta } from "@grad/ui";
import { drawFrame, buildLayers, type StoryFonts, type StoryLayers } from "../../../lib/share/draw";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { FPS, LOOP_SECONDS, STORY_HEIGHT, STORY_WIDTH, pickVideoType, type StoryContent } from "../../../lib/share/story";

type Video = { status: "unsupported" } | { status: "waiting" } | { status: "recording" } | { status: "ready"; file: File; url: string } | { status: "failed" };

const VIDEO_NAME = "grad26-story.mp4";
const IMAGE_NAME = "grad26-story.png";

/** The site's fonts as canvas font-family lists (next/font names them per build). */
function readFonts(): StoryFonts {
  const style = getComputedStyle(document.documentElement);
  const sans = style.getPropertyValue("--font-inter-tight").trim() || "'Inter Tight', Arial, sans-serif";
  const mono = style.getPropertyValue("--font-geist-mono").trim() || "ui-monospace, Menlo, monospace";
  return { sans, mono };
}

/** Records one loop of the card to MP4 on a canvas the page never shows. */
async function recordLoop(layers: StoryLayers, type: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  drawFrame(ctx, layers, 0);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("recording failed"));
  });
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const seconds = (now - start) / 1000;
      drawFrame(ctx, layers, Math.min(seconds, LOOP_SECONDS));
      if (seconds >= LOOP_SECONDS) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  return new Blob(chunks, { type: "video/mp4" });
}

function canShareFile(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

function download(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
}

/**
 * "Share that you're coming": the story card (lib/share/story.ts) as a looping preview, then an
 * MP4 the phone's share sheet hands to Instagram or Facebook. The video is recorded in the
 * background once the card is on screen, because sharing needs a fresh tap and recording takes
 * a few seconds. Browsers that can't record MP4 (Firefox) share the still picture instead.
 * Nothing leaves the browser except through the share sheet or a download the guest starts.
 */
export function StoryShare({ content, labels, messages }: {
  content: StoryContent;
  /** Translated figure words (Entrance, Parking); names stay as drawn. */
  labels: Record<string, string>;
  messages: MessageSlice<"share.">;
}) {
  const t = sliceTranslator(messages);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<StoryLayers | null>(null);
  const [video, setVideo] = useState<Video>({ status: "waiting" });
  const [note, setNote] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  // Draw the static layers once the site fonts are ready.
  useEffect(() => {
    let cancelled = false;
    const fonts = readFonts();
    Promise.all([document.fonts.load(`500 64px ${fonts.sans}`), document.fonts.load(`400 24px ${fonts.mono}`)])
      .catch(() => undefined)
      .then(() => buildLayers(content, fonts, (label) => labels[label] ?? label))
      .then((built) => {
        if (!cancelled) setLayers(built);
      })
      .catch(() => {
        if (!cancelled) setVideo({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [content, labels]);

  // The preview loops on screen; reduced motion shows one still frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!layers || !ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawFrame(ctx, layers, 0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      drawFrame(ctx, layers, (now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layers]);

  // Record the video the first time the card is on screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!layers || !canvas) return;
    const type = typeof MediaRecorder === "undefined" ? null : pickVideoType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
    if (!type || typeof canvas.captureStream !== "function") {
      setVideo({ status: "unsupported" });
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setVideo({ status: "recording" });
      recordLoop(layers, type)
        .then((blob) => {
          if (cancelled) return;
          const file = new File([blob], VIDEO_NAME, { type: "video/mp4" });
          url = URL.createObjectURL(file);
          setCanShare(canShareFile(file));
          setVideo({ status: "ready", file, url });
        })
        .catch(() => {
          if (!cancelled) setVideo({ status: "failed" });
        });
    }, { threshold: 0.3 });
    observer.observe(canvas);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [layers]);

  async function imageFile(): Promise<File | null> {
    const canvas = canvasRef.current;
    if (!canvas || !layers) return null;
    // A still always shows the walkers part-way along, whatever frame the preview is on.
    const still = document.createElement("canvas");
    still.width = STORY_WIDTH;
    still.height = STORY_HEIGHT;
    const ctx = still.getContext("2d");
    if (!ctx) return null;
    drawFrame(ctx, layers, LOOP_SECONDS * 0.3);
    const blob = await new Promise<Blob | null>((resolve) => still.toBlob(resolve, "image/png"));
    return blob ? new File([blob], IMAGE_NAME, { type: "image/png" }) : null;
  }

  async function share(file: File) {
    setNote(null);
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // The guest closed the share sheet: nothing to say.
      if ((error as DOMException)?.name !== "AbortError") setNote(t("share.failed"));
    }
  }

  async function shareImage() {
    const file = await imageFile();
    if (!file) return setNote(t("share.failed"));
    if (canShareFile(file)) return share(file);
    const url = URL.createObjectURL(file);
    download(url, IMAGE_NAME);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const ready = video.status === "ready" ? video : null;
  const videoOff = video.status === "unsupported" || video.status === "failed";

  return (
    <div className="story-share">
      <canvas
        ref={canvasRef}
        className="story-share__preview"
        width={STORY_WIDTH}
        height={STORY_HEIGHT}
        role="img"
        aria-label={content.description}
      />
      <div className="story-share__body">
        <p>{t("share.lead")}</p>
        <div className="story-share__actions">
          {videoOff ? null : ready && canShare ? (
            <Cta tone="on-white" onClick={() => share(ready.file)}>{t("share.shareVideo")}</Cta>
          ) : ready ? (
            <Cta tone="on-white" onClick={() => download(ready.url, VIDEO_NAME)}>{t("share.saveVideo")}</Cta>
          ) : (
            <Cta tone="on-white" disabled>{t("share.preparing")}</Cta>
          )}
          {ready && canShare ? (
            <Cta tone="on-white" variant="secondary" onClick={() => download(ready.url, VIDEO_NAME)}>{t("share.saveVideo")}</Cta>
          ) : null}
          <Cta tone="on-white" variant={videoOff ? "primary" : "secondary"} onClick={shareImage} disabled={!layers}>
            {t("share.picture")}
          </Cta>
        </div>
        <p className="story-share__hint">{videoOff ? t("share.hintPicture") : t("share.hint")}</p>
        <p className="story-share__hint" role="status">{note}</p>
      </div>
    </div>
  );
}
