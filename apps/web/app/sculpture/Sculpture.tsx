"use client";

import "./sculpture.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage, Mesh,
  NearestFilter, NoBlending, PlaneGeometry, Points, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, WebGLRenderTarget,
} from "three";
import type { Camera, WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { POINT_COUNT, prepareShapes, sequenceAt, shapeData, SHAPE_NAMES } from "./shapes";
import { ShapeCodeBackdrop } from "./CodeBackdrop";
import { cellPixels, gridLayout, initialDpr, lowerDpr, SCENE_DPR_CAP } from "./dpr";
import { yieldToMain } from "./yield";

const GLYPHS = " .:-=+*#%@";

/** Point size in world units at the scene's own pixel ratio (see ParticleScene). */
const POINT_SIZE = 0.09;

const passVertexShader = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function monoFontFamily() {
  return getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "monospace";
}

/**
 * Glyph atlas with one atlas cell per screen cell, in whole device pixels, sampled texel for texel
 * by the draw pass (nearest filter, gl_FragCoord), so glyphs are never resampled (#6, #78).
 * Below 1.5x, a cell is only 6 to 9 pixels: the anti-aliased edges are pushed towards fully on or
 * off so dense glyphs keep their shape instead of turning into soft blobs.
 */
function glyphTexture(cellWidth: number, cellHeight: number, ratio: number) {
  const canvas = document.createElement("canvas");
  canvas.width = GLYPHS.length * cellWidth;
  canvas.height = cellHeight;
  const context = canvas.getContext("2d", { willReadFrequently: ratio < 1.5 })!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `${ratio < 1.5 ? 500 : 700} ${Math.round(cellHeight * 0.9)}px ${monoFontFamily()}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, index) => context.fillText(glyph, index * cellWidth + cellWidth / 2, cellHeight / 2));
  if (ratio < 1.5) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 3; i < data.length; i += 4) data[i] = Math.max(0, Math.min(255, (data[i] - 70) * 2.2));
    context.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  // Row 0 is the top of the glyph; the draw pass flips local y itself (glyphs were upside down before #78).
  texture.flipY = false;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  return texture;
}

const cellFragmentShader = `uniform sampler2D tDiffuse;
  uniform vec2 uGrid;
  uniform vec2 uCellUv;
  uniform vec2 uOffsetUv;
  varying vec2 vUv;
  void main() {
    vec2 center = uOffsetUv + (floor(vUv * uGrid) + 0.5) * uCellUv;
    vec3 source = vec3(0.0);
    vec3 peak = vec3(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec3 sampleColor = texture2D(tDiffuse, center + vec2(float(x), float(y)) * uCellUv * 0.29).rgb;
        source += sampleColor;
        peak = max(peak, sampleColor);
      }
    }
    float coverage = dot(source / 9.0, vec3(0.212656, 0.715158, 0.072186));
    float highlight = dot(peak, vec3(0.212656, 0.715158, 0.072186));
    float lightness = pow(clamp(coverage * 2.35 + highlight * 0.23, 0.0, 1.0), 0.78);
    gl_FragColor = vec4(lightness, 0.0, 0.0, 1.0);
  }`;

// Runs on the canvas framebuffer (the last pass), so gl_FragCoord is in device pixels.
const drawFragmentShader = `uniform sampler2D tCells;
    uniform sampler2D tGlyphs;
    uniform vec2 uGrid;
    uniform vec2 uCellPx;
    uniform vec2 uOffsetPx;
    uniform float uGlyphCount;
    void main() {
      vec2 p = gl_FragCoord.xy - uOffsetPx;
      vec2 cell = floor(p / uCellPx);
      if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
        gl_FragColor = vec4(0.0);
        return;
      }
      float lightness = texture2D(tCells, (cell + 0.5) / uGrid).r;
      float index = floor(lightness * (uGlyphCount - 0.01));
      vec2 local = (p - cell * uCellPx) / uCellPx;
      vec2 glyphUv = vec2((index + local.x) / uGlyphCount, 1.0 - local.y);
      float glyph = texture2D(tGlyphs, glyphUv).a;
      // Blue-and-white ramp (redesign #147): --brand-blue-deep #16378A -> --brand-muted-on-blue #B9C8EE -> white.
      vec3 shadow = vec3(0.0862, 0.2157, 0.5412);
      vec3 midtone = vec3(0.7255, 0.7843, 0.9333);
      vec3 highlightColor = vec3(1.0);
      // Stops at 0.0 / 0.4 / 0.8: bright cells reach pure white early, and dim cells start as
      // the deep blue but are lifted by the alpha floor below so they never melt into the #1F4BB0 background.
      vec3 color = lightness < 0.4 ? mix(shadow, midtone, lightness / 0.4) : mix(midtone, highlightColor, clamp((lightness - 0.4) / 0.4, 0.0, 1.0));
      float strength = glyph * (0.85 + 0.15 * lightness);
      gl_FragColor = vec4(color * strength, strength);
    }`;

/**
 * Two-stage character renderer adapted from ASCIIGen's GPU pipeline. The grid is laid out in
 * whole device pixels and centred on the canvas; the leftover (less than one cell) stays clear.
 */
class AsciiEnginePass extends Pass {
  private readonly cells = new WebGLRenderTarget(80, 50, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
  });
  private readonly cellMaterial = new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uGrid: { value: new Vector2(80, 50) },
      uCellUv: { value: new Vector2(1 / 80, 1 / 50) },
      uOffsetUv: { value: new Vector2(0, 0) },
    },
    vertexShader: passVertexShader,
    fragmentShader: cellFragmentShader,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly drawMaterial: ShaderMaterial;
  private readonly cellQuad = new FullScreenQuad(this.cellMaterial);
  private readonly drawQuad: FullScreenQuad;

  constructor(private readonly atlas: CanvasTexture) {
    super();
    this.needsSwap = true;
    this.drawMaterial = new ShaderMaterial({
      uniforms: {
        tCells: { value: this.cells.texture },
        tGlyphs: { value: atlas },
        uGrid: { value: new Vector2(80, 50) },
        uCellPx: { value: new Vector2(8, 10) },
        uOffsetPx: { value: new Vector2(0, 0) },
        uGlyphCount: { value: GLYPHS.length },
      },
      vertexShader: passVertexShader,
      fragmentShader: drawFragmentShader,
      transparent: true,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.drawQuad = new FullScreenQuad(this.drawMaterial);
  }

  /** Lays the grid out over a drawing buffer of `width` x `height` device pixels. */
  setLayout(width: number, height: number, cellWidth: number, cellHeight: number) {
    const { columns, rows, offsetX, offsetY } = gridLayout(width, height, cellWidth, cellHeight);
    this.cells.setSize(columns, rows);
    this.cellMaterial.uniforms.uGrid.value.set(columns, rows);
    this.cellMaterial.uniforms.uCellUv.value.set(cellWidth / width, cellHeight / height);
    this.cellMaterial.uniforms.uOffsetUv.value.set(offsetX / width, offsetY / height);
    this.drawMaterial.uniforms.uGrid.value.set(columns, rows);
    this.drawMaterial.uniforms.uCellPx.value.set(cellWidth, cellHeight);
    this.drawMaterial.uniforms.uOffsetPx.value.set(offsetX, offsetY);
  }

  render(renderer: Parameters<Pass["render"]>[0], writeBuffer: Parameters<Pass["render"]>[1], readBuffer: Parameters<Pass["render"]>[2]) {
    this.cellMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.cells);
    this.cellQuad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.drawQuad.render(renderer);
  }

  /**
   * Compiles both shaders ahead of the first frame (#78), each for the target it draws to (the
   * cell grid, then the screen), since the target is part of three's program key.
   */
  async compile(renderer: WebGLRenderer, camera: Camera) {
    const geometry = new PlaneGeometry(2, 2);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.cells);
      const cells = renderer.compileAsync(new Scene().add(new Mesh(geometry, this.cellMaterial)), camera);
      renderer.setRenderTarget(previous);
      await yieldToMain();
      renderer.setRenderTarget(null);
      const draw = renderer.compileAsync(new Scene().add(new Mesh(geometry, this.drawMaterial)), camera);
      renderer.setRenderTarget(previous);
      await Promise.all([cells, draw]);
    } finally {
      geometry.dispose();
    }
  }

  dispose() {
    this.cells.dispose();
    this.atlas.dispose();
    this.cellMaterial.dispose();
    this.drawMaterial.dispose();
    this.cellQuad.dispose();
    this.drawQuad.dispose();
  }
}

/**
 * `onWarm` fires once every shader the first frame uses has been compiled; the canvas's frame loop
 * waits for it. With KHR_parallel_shader_compile the GPU process links them while the main thread
 * stays free, where the first frame used to wait for them in one long task (#78).
 */
function AsciiPass({ onFirstFrame, onWarm }: { onFirstFrame: () => void; onWarm: () => void }) {
  const { gl, scene, camera, size } = useThree();
  const seen = useRef(false);
  const phone = size.width < 500;
  const ratio = gl.getPixelRatio();
  const [cellWidth, cellHeight] = cellPixels(phone ? 6 : 7, phone ? 8 : 9, ratio);
  const composer = useMemo(() => {
    const effect = new EffectComposer(gl);
    // The scene and the cell pass never need more than SCENE_DPR_CAP; the glyph pass draws at `ratio`.
    effect.setPixelRatio(Math.min(ratio, SCENE_DPR_CAP));
    effect.addPass(new RenderPass(scene, camera));
    const pass = new AsciiEnginePass(glyphTexture(cellWidth, cellHeight, ratio));
    effect.addPass(pass);
    return { effect, pass };
  }, [gl, scene, camera, cellWidth, cellHeight, ratio]);

  useEffect(() => {
    composer.effect.setSize(size.width, size.height);
    const buffer = gl.getDrawingBufferSize(new Vector2());
    composer.pass.setLayout(buffer.x, buffer.y, cellWidth, cellHeight);
  }, [composer, gl, size, cellWidth, cellHeight]);

  const warmed = useRef(false);
  useEffect(() => {
    // Once per canvas: a later composer (a lower DPR) needs the same programs.
    if (warmed.current) return;
    let cancelled = false;
    const warm = async () => {
      // The particle scene draws into the composer's buffer, not the screen.
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(composer.effect.readBuffer);
      const particles = gl.compileAsync(scene, camera);
      gl.setRenderTarget(previous);
      await yieldToMain();
      await Promise.all([particles, composer.pass.compile(gl, camera)]);
    };
    // If warming fails, the first frame compiles the shaders itself, as it did before.
    void warm().catch(() => undefined).then(() => {
      if (cancelled) return;
      warmed.current = true;
      onWarm();
    });
    return () => { cancelled = true; };
  }, [composer, gl, scene, camera, onWarm]);

  useEffect(() => () => {
    composer.pass.dispose();
    composer.effect.dispose();
  }, [composer]);

  useFrame((_, delta) => {
    composer.effect.render(delta);
    if (!seen.current) {
      seen.current = true;
      onFirstFrame();
    }
  }, 1);
  return null;
}

/**
 * Steps the pixel ratio down while frames are slow: after a short warm-up, if the mean frame time
 * over a window of 90 frames is above 25ms (under 40fps), call `onSlow`, then measure afresh.
 * It only ever lowers the ratio, so it cannot oscillate. Hidden tabs do not render, so they never count.
 */
function FrameBudget({ dpr, onSlow }: { dpr: number; onSlow: () => void }) {
  const frames = useRef(0);
  const total = useRef(0);
  useEffect(() => {
    frames.current = 0;
    total.current = 0;
  }, [dpr]);
  useFrame((_, delta) => {
    if (dpr <= 1) return;
    frames.current += 1;
    if (frames.current <= 30) return; // warm-up: shader compiles, the atlas upload
    total.current += Math.min(delta, 0.25);
    if (frames.current < 120) return;
    const mean = total.current / (frames.current - 30);
    frames.current = 0;
    total.current = 0;
    if (mean > 0.025) onSlow();
  });
  return null;
}

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    // The FOV is vertical, so a portrait canvas (the phone hero) would crop the sides; back off by 1/aspect.
    const back = Math.max(1, size.height / Math.max(1, size.width));
    camera.position.set(0, (size.width < 500 ? 2 : 1.75) * back, (size.width < 500 ? 4.8 : 4.1) * back);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function ParticleScene({ onShape, onDepart }: { onShape: (index: number) => void; onDepart: () => void }) {
  const points = useRef<Points>(null);
  // three sizes points in canvas pixels (size x renderer ratio), but the scene renders at most at
  // SCENE_DPR_CAP: scale down by the difference so a point covers the same share of a cell at any DPR.
  const ratio = useThree((state) => state.viewport.dpr);
  const pointSize = (POINT_SIZE * Math.min(ratio, SCENE_DPR_CAP)) / ratio;
  const elapsed = useRef(0);
  const previous = useRef(-1);
  const departing = useRef(false);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    const first = shapeData(0);
    result.setAttribute("position", new BufferAttribute(new Float32Array(first.points), 3).setUsage(DynamicDrawUsage));
    result.setAttribute("color", new BufferAttribute(new Float32Array(first.shades), 3).setUsage(DynamicDrawUsage));
    return result;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.05);
    const state = sequenceAt(elapsed.current);
    if (state.index !== previous.current) {
      previous.current = state.index;
      departing.current = false;
      onShape(state.index);
    } else if (state.morph > 0 && !departing.current) {
      departing.current = true;
      onDepart();
    }
    const position = geometry.attributes.position as BufferAttribute;
    const colors = geometry.attributes.color as BufferAttribute;
    const output = position.array as Float32Array;
    const outputColors = colors.array as Float32Array;
    const { points: from, shades: fromShades } = shapeData(state.index);
    const { points: to, shades: toShades } = shapeData(state.next);
    const t = state.morph > 0 ? state.morph * state.morph * (3 - 2 * state.morph) : 0;
    const scatter = state.morph > 0 ? Math.sin(Math.PI * t) * 0.36 : 0;
    const time = elapsed.current;
    // Runs every frame, held shapes included, so the sculpture keeps a faint living shimmer
    // rather than sitting perfectly still between morphs — motion beyond just the rotation.
    for (let i = 0; i < POINT_COUNT; i++) {
      const offset = i * 3;
      let x = from[offset] * (1 - t) + to[offset] * t;
      let y = from[offset + 1] * (1 - t) + to[offset + 1] * t;
      let z = from[offset + 2] * (1 - t) + to[offset + 2] * t;
      if (scatter > 0) {
        const angle = i * 2.399963;
        const radius = 0.4 + ((i * 37) % 101) / 101;
        x += Math.cos(angle) * radius * scatter;
        y += Math.sin(angle) * radius * scatter;
        z += Math.sin(angle * 1.7) * scatter;
      }
      const phase = i * 0.011;
      x += Math.sin(time * 1.7 + phase) * 0.016;
      y += Math.cos(time * 1.3 + phase * 1.7) * 0.016;
      z += Math.sin(time * 1.9 + phase * 2.3) * 0.016;
      output[offset] = x;
      output[offset + 1] = y;
      output[offset + 2] = z;
      for (let channel = 0; channel < 3; channel++) outputColors[offset + channel] = fromShades[offset + channel] * (1 - t) + toShades[offset + channel] * t;
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    if (points.current) {
      points.current.rotation.y = Math.sin(time * 0.52) * 0.42;
      points.current.rotation.x = -0.12 + Math.sin(time * 0.31) * 0.06;
      points.current.scale.setScalar(1 + Math.sin(time * 0.9) * 0.015);
    }
  });

  return <points ref={points} geometry={geometry}>
    <pointsMaterial color="#ffffff" vertexColors size={pointSize} sizeAttenuation transparent opacity={0.94} depthWrite={false} />
  </points>;
}

class WebGLErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** `label` is the `landing.sculpture` message, with `{name}` for the programme shown (a proper noun, not translated). */
export function Sculpture({ label }: { label: string }) {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [departing, setDeparting] = useState(false);
  const [dpr, setDpr] = useState(1);
  // The canvas mounts once the six forms are built (a task each), and runs frames once its shaders are compiled (#78).
  const [shapesReady, setShapesReady] = useState(false);
  const [warm, setWarm] = useState(false);
  const onWarm = useCallback(() => setWarm(true), []);

  useEffect(() => {
    let cancelled = false;
    void prepareShapes(yieldToMain).then(() => { if (!cancelled) setShapesReady(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReady(false);
      setWarm(false);
      setEnabled(!preference.matches && !!window.WebGLRenderingContext);
    };
    const hints = navigator as Navigator & { deviceMemory?: number };
    setDpr(initialDpr(window.devicePixelRatio, hints.hardwareConcurrency, hints.deviceMemory));
    update();
    preference.addEventListener("change", update);
    const visibility = () => setVisible(!document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ready = () => { if (!cancelled) setFontReady(true); };
    if (!document.fonts) ready();
    else void document.fonts.load(`700 58px ${monoFontFamily()}`).then(ready, ready);
    return () => { cancelled = true; };
  }, []);

  return <div className="sculpture" aria-label={label.replace("{name}", SHAPE_NAMES[shapeIndex] ?? "")} role="img">
    <ShapeCodeBackdrop index={shapeIndex} animate={enabled && ready && visible && !failed} departing={departing} />
    <pre className={`sculpture-fallback${ready && fontReady && enabled && !failed ? " is-hidden" : ""}`} aria-hidden="true">{`             .   :   .
       .  :  +  *  +  :  .
    . : + * # % @ % # * + : .
  . : + * # % @ @ @ % # * + : .
 . : + * # % @ @ @ @ % # * + : .
  . : + * # % @ @ @ % # * + : .
    . : + * # % @ % # * + : .
       .  :  +  *  +  :  .
             .   :   .`}</pre>
    {enabled && fontReady && shapesReady && !failed && <WebGLErrorBoundary onError={() => setFailed(true)}>
      <Canvas
        className="sculpture-canvas"
        frameloop={visible && warm ? "always" : "never"}
        dpr={dpr}
        camera={{ position: [0, 2.0, 4.8], fov: 40, near: 0.1, far: 30 }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.addEventListener("webglcontextlost", () => setFailed(true), { once: true });
        }}
      >
        <CameraRig />
        <ParticleScene onShape={(index) => { setShapeIndex(index); setDeparting(false); }} onDepart={() => setDeparting(true)} />
        <AsciiPass onFirstFrame={() => setReady(true)} onWarm={onWarm} />
        <FrameBudget dpr={dpr} onSlow={() => setDpr(lowerDpr)} />
      </Canvas>
    </WebGLErrorBoundary>}
  </div>;
}
