"use client";

import "./sculpture.css";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage,
  LinearFilter, NearestFilter, NoBlending, Points, ShaderMaterial,
  SRGBColorSpace, Vector2, WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { POINT_COUNT, sequenceAt, SHADES, SHAPES, SHAPE_NAMES } from "./shapes";
import { ShapeCodeBackdrop } from "./CodeBackdrop";

const GLYPHS = " .:-=+*#%@";

const passVertexShader = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function monoFontFamily() {
  return getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "monospace";
}

/**
 * Glyph atlas rasterised at the device-pixel size of one grid cell (css cell x devicePixelRatio),
 * so each glyph is sampled ~1:1 instead of being minified from a 48x64 bitmap (#6).
 */
function glyphTexture(cssCellWidth: number, cssCellHeight: number, ratio: number) {
  const canvas = document.createElement("canvas");
  const cellWidth = Math.max(8, Math.round(cssCellWidth * ratio));
  const cellHeight = Math.max(10, Math.round(cssCellHeight * ratio));
  canvas.width = GLYPHS.length * cellWidth;
  canvas.height = cellHeight;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `700 ${Math.round(cellHeight * 0.9)}px ${monoFontFamily()}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, index) => context.fillText(glyph, index * cellWidth + cellWidth / 2, cellHeight / 2));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

const cellFragmentShader = `uniform sampler2D tDiffuse;
  uniform vec2 uGrid;
  varying vec2 vUv;
  void main() {
    vec2 center = (floor(vUv * uGrid) + 0.5) / uGrid;
    vec3 source = vec3(0.0);
    vec3 peak = vec3(0.0);
    vec2 cellSize = 1.0 / uGrid;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec3 sampleColor = texture2D(tDiffuse, center + vec2(float(x), float(y)) * cellSize * 0.29).rgb;
        source += sampleColor;
        peak = max(peak, sampleColor);
      }
    }
    float coverage = dot(source / 9.0, vec3(0.212656, 0.715158, 0.072186));
    float highlight = dot(peak, vec3(0.212656, 0.715158, 0.072186));
    float lightness = pow(clamp(coverage * 2.35 + highlight * 0.23, 0.0, 1.0), 0.78);
    gl_FragColor = vec4(lightness, 0.0, 0.0, 1.0);
  }`;

const drawFragmentShader = `uniform sampler2D tCells;
    uniform sampler2D tGlyphs;
    uniform vec2 uGrid;
    uniform float uGlyphCount;
    varying vec2 vUv;
    void main() {
      vec2 cell = floor(vUv * uGrid);
      vec2 center = (cell + 0.5) / uGrid;
      float lightness = texture2D(tCells, center).r;
      float index = floor(lightness * (uGlyphCount - 0.01));
      vec2 local = fract(vUv * uGrid);
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

/** Two-stage character renderer adapted from ASCIIGen's GPU pipeline. */
class AsciiEnginePass extends Pass {
  private readonly cells = new WebGLRenderTarget(80, 50, {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
  });
  private readonly cellMaterial = new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uGrid: { value: new Vector2(80, 50) } },
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

  setGrid(columns: number, rows: number) {
    this.cells.setSize(columns, rows);
    this.cellMaterial.uniforms.uGrid.value.set(columns, rows);
    this.drawMaterial.uniforms.uGrid.value.set(columns, rows);
  }

  render(renderer: Parameters<Pass["render"]>[0], writeBuffer: Parameters<Pass["render"]>[1], readBuffer: Parameters<Pass["render"]>[2]) {
    this.cellMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.cells);
    this.cellQuad.render(renderer);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.drawQuad.render(renderer);
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

function AsciiPass({ onFirstFrame }: { onFirstFrame: () => void }) {
  const { gl, scene, camera, size } = useThree();
  const seen = useRef(false);
  const phone = size.width < 500;
  const cellWidth = phone ? 6 : 7;
  const cellHeight = phone ? 8 : 9;
  const ratio = gl.getPixelRatio();
  const composer = useMemo(() => {
    const effect = new EffectComposer(gl);
    effect.addPass(new RenderPass(scene, camera));
    const pass = new AsciiEnginePass(glyphTexture(cellWidth, cellHeight, ratio));
    effect.addPass(pass);
    return { effect, pass };
  }, [gl, scene, camera, cellWidth, cellHeight, ratio]);

  useEffect(() => {
    composer.effect.setSize(size.width, size.height);
    composer.pass.setGrid(
      Math.max(24, Math.floor(size.width / cellWidth)),
      Math.max(20, Math.floor(size.height / cellHeight)),
    );
  }, [composer, size]);

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

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.position.set(0, size.width < 500 ? 2 : 1.75, size.width < 500 ? 4.8 : 4.1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width]);
  return null;
}

function ParticleScene({ onShape, onDepart }: { onShape: (index: number) => void; onDepart: () => void }) {
  const points = useRef<Points>(null);
  const elapsed = useRef(0);
  const previous = useRef(-1);
  const departing = useRef(false);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    const positions = new Float32Array(SHAPES[0]);
    result.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    result.setAttribute("color", new BufferAttribute(new Float32Array(SHADES[0]), 3).setUsage(DynamicDrawUsage));
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
    const from = SHAPES[state.index];
    const to = SHAPES[state.next];
    const fromShades = SHADES[state.index];
    const toShades = SHADES[state.next];
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
    <pointsMaterial color="#ffffff" vertexColors size={0.09} sizeAttenuation transparent opacity={0.94} depthWrite={false} />
  </points>;
}

class WebGLErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function Sculpture() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fontReady, setFontReady] = useState(false);
  const [shapeIndex, setShapeIndex] = useState(0);
  const [departing, setDeparting] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReady(false);
      setEnabled(!preference.matches && !!window.WebGLRenderingContext);
    };
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

  return <div className="sculpture" aria-label={`Animated ASCII sculpture: ${SHAPE_NAMES[shapeIndex]}`} role="img">
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
    {enabled && fontReady && !failed && <WebGLErrorBoundary onError={() => setFailed(true)}>
      <Canvas
        className="sculpture-canvas"
        frameloop={visible ? "always" : "never"}
        dpr={[1, 2]}
        camera={{ position: [0, 2.0, 4.8], fov: 40, near: 0.1, far: 30 }}
        gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.addEventListener("webglcontextlost", () => setFailed(true), { once: true });
        }}
      >
        <CameraRig />
        <ParticleScene onShape={(index) => { setShapeIndex(index); setDeparting(false); }} onDepart={() => setDeparting(true)} />
        <AsciiPass onFirstFrame={() => setReady(true)} />
      </Canvas>
    </WebGLErrorBoundary>}
  </div>;
}
