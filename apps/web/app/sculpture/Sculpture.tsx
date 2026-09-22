"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage,
  LinearFilter, Points, SRGBColorSpace, Vector2,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { POINT_COUNT, sequenceAt, SHADES, SHAPES, SHAPE_NAMES } from "./shapes";
import { ShapeCodeBackdrop } from "./CodeBackdrop";

const GLYPHS = " .:-=+*#";

function glyphTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = GLYPHS.length * 32;
  canvas.height = 32;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = "bold 29px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...GLYPHS].forEach((glyph, index) => context.fillText(glyph, index * 32 + 16, 16));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  return texture;
}

const asciiShader = {
  uniforms: {
    tDiffuse: { value: null },
    tGlyphs: { value: null },
    uGrid: { value: new Vector2(80, 50) },
  },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
    uniform sampler2D tGlyphs;
    uniform vec2 uGrid;
    varying vec2 vUv;
    void main() {
      vec2 cell = floor(vUv * uGrid);
      vec2 center = (cell + 0.5) / uGrid;
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
      float coverage = dot(source / 9.0, vec3(0.2126, 0.7152, 0.0722));
      float highlight = dot(peak, vec3(0.2126, 0.7152, 0.0722));
      float lightness = pow(clamp(coverage * 2.35 + highlight * 0.23, 0.0, 1.0), 0.78);
      float index = floor(lightness * 7.99);
      vec2 local = fract(vUv * uGrid);
      vec2 glyphUv = vec2((index + local.x) / 8.0, 1.0 - local.y);
      float glyph = texture2D(tGlyphs, glyphUv).a;
      vec3 shadow = vec3(0.52, 0.42, 0.82);
      vec3 midtone = vec3(0.44, 0.62, 0.96);
      vec3 highlightColor = vec3(0.78, 0.96, 1.0);
      vec3 color = lightness < 0.5 ? mix(shadow, midtone, lightness * 2.0) : mix(midtone, highlightColor, (lightness - 0.5) * 2.0);
      float strength = glyph * (0.72 + 0.28 * lightness);
      gl_FragColor = vec4(color * strength, strength);
    }`,
};

function AsciiPass({ onFirstFrame }: { onFirstFrame: () => void }) {
  const { gl, scene, camera, size } = useThree();
  const seen = useRef(false);
  const composer = useMemo(() => {
    const effect = new EffectComposer(gl);
    effect.addPass(new RenderPass(scene, camera));
    const pass = new ShaderPass(asciiShader);
    pass.uniforms.tGlyphs.value = glyphTexture();
    effect.addPass(pass);
    return { effect, pass };
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.effect.setSize(size.width, size.height);
    const cellWidth = size.width < 500 ? 6 : 7;
    const cellHeight = size.width < 500 ? 8 : 9;
    composer.pass.uniforms.uGrid.value.set(
      Math.max(24, Math.floor(size.width / cellWidth)),
      Math.max(20, Math.floor(size.height / cellHeight)),
    );
  }, [composer, size]);

  useEffect(() => () => {
    (composer.pass.uniforms.tGlyphs.value as CanvasTexture).dispose();
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

  return <div className="sculpture" aria-label={`Animated ASCII sculpture: ${SHAPE_NAMES[shapeIndex]}`} role="img">
    <div className="sculpture-halo" aria-hidden="true" />
    <ShapeCodeBackdrop index={shapeIndex} animate={enabled && ready && visible && !failed} departing={departing} />
    <pre className={`sculpture-fallback${ready && enabled && !failed ? " is-hidden" : ""}`} aria-hidden="true">{`             .   :   .
       .  :  +  *  +  :  .
    . : + * # % @ % # * + : .
  . : + * # % @ @ @ % # * + : .
 . : + * # % @ @ @ @ % # * + : .
  . : + * # % @ @ @ % # * + : .
    . : + * # % @ % # * + : .
       .  :  +  *  +  :  .
             .   :   .`}</pre>
    {enabled && !failed && <WebGLErrorBoundary onError={() => setFailed(true)}>
      <Canvas
        className="sculpture-canvas"
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.25]}
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
