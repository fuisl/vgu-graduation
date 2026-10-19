"use client";

import { BrandEyebrow, Cta, PillGroup, PillToggle, Section } from "@grad/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sliceTranslator, type MessageSlice, type SliceTranslator } from "../../lib/i18n/format";
import "./ascii-live.css";
import { GpuAscii, gpuSupported, measureLevels, resolveCharset, type CharsetId } from "./asciify-runtime.js";

type LiveSettings = {
  charset: CharsetId;
  columns: number;
  color: boolean;
  mirror: boolean;
  threshold: number;
};

const INITIAL_SETTINGS: LiveSettings = {
  charset: "classic",
  columns: 96,
  color: false,
  mirror: true,
  threshold: 0,
};

type T = SliceTranslator<keyof MessageSlice<"ascii.">>;

/** Charset names are `ascii.charset.<id>` messages (#9). */
const CHARSETS: CharsetId[] = ["classic", "custom", "blocks", "braille", "halfblock"];

/** An error whose message is already in the guest's language. */
class LiveError extends Error {}

function cameraError(cause: unknown, t: T) {
  if (!(cause instanceof DOMException)) return t("ascii.error.start");
  if (cause.name === "NotAllowedError") return t("ascii.error.denied");
  if (cause.name === "NotFoundError") return t("ascii.error.noCamera");
  if (cause.name === "NotReadableError") return t("ascii.error.inUse");
  return t("ascii.error.start");
}

/** The studio below the site header; the page (a server component) renders the header and footer around it. */
export function AsciiLive({ messages }: { messages: MessageSlice<"ascii."> }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef(INITIAL_SETTINGS);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [grid, setGrid] = useState({ columns: 0, rows: 0 });
  const [fps, setFps] = useState(0);
  const [engineMissing, setEngineMissing] = useState(false);

  settingsRef.current = settings;

  useEffect(() => {
    try {
      gpuSupported();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "ASCIIFY_NOT_INSTALLED") setEngineMissing(true);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
    setGrid({ columns: 0, rows: 0 });
    setFps(0);
  }, []);

  const startCamera = useCallback(async (nextCameraId = cameraId) => {
    setStarting(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new LiveError(t("ascii.error.insecure"));
      if (!gpuSupported()) throw new LiveError(t("ascii.error.webgl"));

      streamRef.current?.getTracks().forEach((track) => track.stop());
      const opened = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: nextCameraId ? { exact: nextCameraId } : undefined,
          facingMode: nextCameraId ? undefined : "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      streamRef.current = opened;
      setStream(opened);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((device) => device.kind === "videoinput"));
      opened.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (streamRef.current === opened) stopCamera();
      }, { once: true });
    } catch (cause) {
      setError(cause instanceof LiveError ? cause.message : cameraError(cause, t));
      stopCamera();
    } finally {
      setStarting(false);
    }
  }, [cameraId, stopCamera, t]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => setError(t("ascii.error.playback")));
  }, [stream, t]);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    let renderer: GpuAscii;
    try {
      renderer = new GpuAscii(canvasRef.current);
    } catch {
      setError(t("ascii.error.renderer"));
      return;
    }

    // White ink on the blue stage, read from the brand token so it never drifts.
    const ink = (stageRef.current && getComputedStyle(stageRef.current).getPropertyValue("--brand-white").trim()) || "#ffffff";
    let frame = 0;
    let frameCount = 0;
    let fpsStarted = performance.now();
    let lastLevelsAt = 0;
    let levels: [number, number] = [0, 1];

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const video = videoRef.current;
      if (!video || document.hidden || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;

      const current = settingsRef.current;
      if (now - lastLevelsAt > 400) {
        levels = measureLevels(video, video.videoWidth, video.videoHeight);
        lastLevelsAt = now;
      }
      const size = renderer.render(video, video.videoWidth, video.videoHeight, {
        columns: current.columns,
        fontAspectRatio: 1.6,
        threshold: current.threshold,
        gamma: 1,
        contrast: 1,
        charset: resolveCharset(current.charset, ".:-=+*#%@", "off"),
        color: current.color,
        key: null,
        ink,
        scale: Math.min(2, window.devicePixelRatio || 1),
        mirror: current.mirror,
        levels,
      });
      setGrid((previous) => previous.columns === size.columns && previous.rows === size.rows ? previous : size);

      frameCount += 1;
      if (now - fpsStarted >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - fpsStarted)));
        frameCount = 0;
        fpsStarted = now;
      }
    };

    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, [stream, t]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const changeCamera = (nextCameraId: string) => {
    setCameraId(nextCameraId);
    if (stream) void startCamera(nextCameraId);
  };

  const startButton = (tone: "on-blue" | "on-white") =>
    <Cta tone={tone} onClick={() => void startCamera()} disabled={starting}>{starting ? t("ascii.starting") : t("ascii.start")}</Cta>;

  return <>
    <main className="ascii-live">
      <Section tone="blue" density="compact">
        <div className="ascii-live-header">
          <div>
            <BrandEyebrow>{t("ascii.eyebrow")}</BrandEyebrow>
            <h1>ASCII Live</h1>
          </div>
          <p className="ascii-live-privacy">{t("ascii.privacy")}</p>
        </div>
      </Section>

      <Section tone="white" density="compact">
        {error && <p className="ascii-live-error" role="alert">{error}</p>}

        {engineMissing && <div className="ascii-live-workspace ascii-live-workspace--single" role="region" aria-label={t("ascii.missing.label")}>
          <div className="ascii-live-stage">
            <div className="ascii-live-empty">
              <span aria-hidden="true">.:+*#@</span>
              <h2>{t("ascii.missing.title")}</h2>
              <p>{t("ascii.missing.body")}</p>
            </div>
          </div>
        </div>}

        {!engineMissing && <div className="ascii-live-workspace" role="region" aria-label={t("ascii.studio")}>
          <div className="ascii-live-stage" ref={stageRef}>
            <video ref={videoRef} muted playsInline aria-hidden="true" />
            <canvas ref={canvasRef} aria-label={t("ascii.canvas")} />
            {!stream && <div className="ascii-live-empty">
              <span aria-hidden="true">.:+*#@</span>
              <h2>{t("ascii.off.title")}</h2>
              <p>{t("ascii.off.body")}</p>
              {startButton("on-blue")}
            </div>}
            {stream && <div className="ascii-live-readout" aria-live="polite">{grid.columns} × {grid.rows} / {fps} FPS</div>}
          </div>

          <aside className="ascii-live-controls" aria-label={t("ascii.controls")}>
            <div className="ascii-live-control-heading">
              <span>01</span><h2>{t("ascii.capture")}</h2>
            </div>
            {cameras.length > 1 && <label>
              {t("ascii.camera")}
              <select value={cameraId} onChange={(event) => changeCamera(event.target.value)}>
                <option value="">{t("ascii.defaultCamera")}</option>
                {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || t("ascii.cameraN", { n: index + 1 })}</option>)}
              </select>
            </label>}
            <label className="ascii-live-check">
              <input type="checkbox" checked={settings.mirror} onChange={(event) => setSettings((value) => ({ ...value, mirror: event.target.checked }))} />
              {t("ascii.mirror")}
            </label>

            <div className="ascii-live-control-heading">
              <span>02</span><h2>{t("ascii.charsetHeading")}</h2>
            </div>
            <PillGroup as="toggle" label={t("ascii.charsetHeading")} tone="on-white">
              {CHARSETS.map((id) => <PillToggle key={id} pressed={settings.charset === id} onClick={() => setSettings((value) => ({ ...value, charset: id }))}>{t(`ascii.charset.${id}`)}</PillToggle>)}
            </PillGroup>

            <div className="ascii-live-control-heading">
              <span>03</span><h2>{t("ascii.image")}</h2>
            </div>
            <label>
              <span>{t("ascii.columns")} <output>{settings.columns}</output></span>
              <input type="range" min="48" max="160" step="8" value={settings.columns} onChange={(event) => setSettings((value) => ({ ...value, columns: Number(event.target.value) }))} />
            </label>
            <label>
              <span>{t("ascii.threshold")} <output>{settings.threshold}</output></span>
              <input type="range" min="0" max="128" step="4" value={settings.threshold} onChange={(event) => setSettings((value) => ({ ...value, threshold: Number(event.target.value) }))} />
            </label>
            <label className="ascii-live-check">
              <input type="checkbox" checked={settings.color} onChange={(event) => setSettings((value) => ({ ...value, color: event.target.checked }))} />
              {t("ascii.color")}
            </label>

            <div className="ascii-live-actions">
              {stream
                ? <Cta tone="on-white" onClick={stopCamera}>{t("ascii.stop")}</Cta>
                : startButton("on-white")}
            </div>
            <p className="ascii-live-engine">{t("ascii.engine")}</p>
          </aside>
        </div>}
      </Section>
    </main>
  </>;
}
