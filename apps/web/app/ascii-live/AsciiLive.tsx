"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

const CHARSETS: Array<{ id: CharsetId; label: string }> = [
  { id: "classic", label: "Classic" },
  { id: "custom", label: "Ramp" },
  { id: "blocks", label: "Blocks" },
  { id: "braille", label: "Braille" },
  { id: "halfblock", label: "Half block" },
];

function cameraError(cause: unknown) {
  if (!(cause instanceof DOMException)) return "The camera could not be started.";
  if (cause.name === "NotAllowedError") return "Camera access was declined. Allow it in your browser settings, then try again.";
  if (cause.name === "NotFoundError") return "No camera was found on this device.";
  if (cause.name === "NotReadableError") return "The camera is already in use by another application.";
  return cause.message || "The camera could not be started.";
}

export function AsciiLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  settingsRef.current = settings;

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
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture needs HTTPS or localhost in a supported browser.");
      if (!gpuSupported()) throw new Error("This live renderer needs WebGL 2, which is unavailable in this browser.");

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
      setError(cause instanceof Error && !(cause instanceof DOMException) ? cause.message : cameraError(cause));
      stopCamera();
    } finally {
      setStarting(false);
    }
  }, [cameraId, stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => setError("The camera opened, but playback was blocked. Try starting it again."));
  }, [stream]);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;

    let renderer: GpuAscii;
    try {
      renderer = new GpuAscii(canvasRef.current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The ASCII renderer could not start.");
      return;
    }

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
        ink: "#a9c2ff",
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
  }, [stream]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const changeCamera = (nextCameraId: string) => {
    setCameraId(nextCameraId);
    if (stream) void startCamera(nextCameraId);
  };

  return <main className="ascii-live">
    <header className="ascii-live-header">
      <Link className="ascii-live-back" href="/" aria-label="Back to the GRAD '26 landing page">← GRAD ’26</Link>
      <div>
        <p className="ascii-live-kicker">Experimental / on-device</p>
        <h1>ASCII LIVE</h1>
      </div>
      <p className="ascii-live-privacy">Your camera stays in this browser. No frames are uploaded or saved.</p>
    </header>

    <section className="ascii-live-workspace" aria-label="Live ASCII camera studio">
      <div className="ascii-live-stage">
        <video ref={videoRef} muted playsInline aria-hidden="true" />
        <canvas ref={canvasRef} aria-label="Live camera rendered as ASCII art" />
        {!stream && <div className="ascii-live-empty">
          <span aria-hidden="true">.:+*#@</span>
          <h2>Camera is off</h2>
          <p>Permission is requested only after you press start.</p>
          <button type="button" onClick={() => void startCamera()} disabled={starting}>
            {starting ? "Starting…" : "Start camera"}
          </button>
        </div>}
        {stream && <div className="ascii-live-readout" aria-live="polite">{grid.columns} × {grid.rows} / {fps} FPS</div>}
      </div>

      <aside className="ascii-live-controls" aria-label="ASCII controls">
        <div className="ascii-live-control-heading">
          <span>01</span><h2>Capture</h2>
        </div>
        {cameras.length > 1 && <label>
          Camera
          <select value={cameraId} onChange={(event) => changeCamera(event.target.value)}>
            <option value="">Default camera</option>
            {cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label>}
        <label className="ascii-live-check">
          <input type="checkbox" checked={settings.mirror} onChange={(event) => setSettings((value) => ({ ...value, mirror: event.target.checked }))} />
          Mirror preview
        </label>

        <div className="ascii-live-control-heading">
          <span>02</span><h2>Character set</h2>
        </div>
        <div className="ascii-live-options" role="group" aria-label="Character set">
          {CHARSETS.map((option) => <button key={option.id} type="button" aria-pressed={settings.charset === option.id} onClick={() => setSettings((value) => ({ ...value, charset: option.id }))}>{option.label}</button>)}
        </div>

        <div className="ascii-live-control-heading">
          <span>03</span><h2>Image</h2>
        </div>
        <label>
          <span>Columns <output>{settings.columns}</output></span>
          <input type="range" min="48" max="160" step="8" value={settings.columns} onChange={(event) => setSettings((value) => ({ ...value, columns: Number(event.target.value) }))} />
        </label>
        <label>
          <span>Background cut <output>{settings.threshold}</output></span>
          <input type="range" min="0" max="128" step="4" value={settings.threshold} onChange={(event) => setSettings((value) => ({ ...value, threshold: Number(event.target.value) }))} />
        </label>
        <label className="ascii-live-check">
          <input type="checkbox" checked={settings.color} onChange={(event) => setSettings((value) => ({ ...value, color: event.target.checked }))} />
          Source color
        </label>

        <div className="ascii-live-actions">
          {stream
            ? <button type="button" onClick={stopCamera}>Stop camera</button>
            : <button type="button" onClick={() => void startCamera()} disabled={starting}>{starting ? "Starting…" : "Start camera"}</button>}
        </div>
        {error && <p className="ascii-live-error" role="alert">{error}</p>}
        <p className="ascii-live-engine">Rendered locally with the pinned ASCIIGen WebGL2 engine.</p>
      </aside>
    </section>
  </main>;
}
