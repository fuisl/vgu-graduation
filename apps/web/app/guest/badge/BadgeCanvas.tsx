"use client";

import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, CatmullRomCurve3, DoubleSide, MathUtils, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from "three";
import { BADGE_ASCII, BADGE_MARK, FACE, FACE_TEXT_WIDTH, fitText, type BadgeCard, type PassArt } from "./card";

const ANCHOR_Y = 2.6;
const CARD_ATTACH_Y = 1.18;
/** The brand's one breakpoint (responsive.md): above it the badge hangs to the right of the text. */
const WIDE = 960;

// Brand palette (packages/design-tokens/src/brand.css). Three.js and canvas cannot read CSS
// variables, so the hex values are mirrored here; keep them in sync with the tokens.
const BRAND = {
  blue: "#1f4bb0", // --brand-blue
  blueDeep: "#16378a", // --brand-blue-deep
  blueSoft: "#e8eefb", // --brand-blue-soft
  white: "#ffffff", // --brand-white
  ink: "#0b1a3a", // --brand-ink
  mutedOnBlue: "#b9c8ee", // --brand-muted-on-blue
  mutedOnWhite: "#5b6784", // --brand-muted-on-white
  lineOnWhite: "#d9e0f0", // --brand-line-on-white
};

/** The page's font stacks (`--font-sans`, `--font-mono`), read from the DOM by NameBadge. */
export type BadgeFonts = { sans: string; mono: string };

/** Prints the card face (layout in `card.ts`). Synchronous, so the first frame is never blocked on an image. */
function paintFace(ctx: CanvasRenderingContext2D, card: BadgeCard, art: PassArt | null, fonts: BadgeFonts) {
  const { width: w, height: h, inset: x } = FACE;
  const right = w - x;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BRAND.white;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BRAND.lineOnWhite;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);

  ctx.fillStyle = BRAND.blue;
  ctx.font = `500 29px ${fonts.mono}`;
  ctx.fillText(BADGE_MARK.left, x, FACE.markY);
  ctx.textAlign = "right";
  ctx.fillText(BADGE_MARK.right, right, FACE.markY);

  if (art) {
    // The pass QR, module by module on whole pixels, in ink on the white card.
    const { x: qx, y: qy, size } = FACE.qr;
    const cell = size / art.size;
    ctx.fillStyle = BRAND.ink;
    for (let row = 0; row < art.size; row += 1) {
      for (let column = 0; column < art.size; column += 1) {
        if (art.bits[row * art.size + column] !== "1") continue;
        const left = Math.round(qx + column * cell);
        const top = Math.round(qy + row * cell);
        ctx.fillRect(left, top, Math.round(qx + (column + 1) * cell) - left, Math.round(qy + (row + 1) * cell) - top);
      }
    }
  } else {
    ctx.textAlign = "center";
    ctx.font = `39px ${fonts.mono}`;
    BADGE_ASCII.forEach((line, index) => {
      ctx.fillStyle = index === 3 ? BRAND.blue : BRAND.mutedOnWhite;
      ctx.fillText(line, w / 2, FACE.asciiY + index * FACE.asciiStep);
    });
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const sans = (size: number) => `500 ${size}px ${fonts.sans}`;
  const mono = (size: number) => `${size}px ${fonts.mono}`;
  const measure = (font: (size: number) => string) => (text: string, size: number) => {
    ctx.font = font(size);
    return ctx.measureText(text).width;
  };
  const name = fitText(measure(sans), card.givenName, FACE_TEXT_WIDTH, FACE.nameMax, FACE.nameMin);
  ctx.fillStyle = BRAND.ink;
  ctx.font = sans(name.size);
  ctx.fillText(name.text, x, FACE.nameBaseline);
  if (card.fullName) {
    const full = fitText(measure(mono), card.fullName, FACE_TEXT_WIDTH, FACE.fullNameMax, FACE.fullNameMin);
    ctx.fillStyle = BRAND.mutedOnWhite;
    ctx.font = mono(full.size);
    ctx.fillText(full.text, x, FACE.fullNameBaseline);
  }

  ctx.strokeStyle = BRAND.lineOnWhite;
  ctx.beginPath();
  ctx.moveTo(x, FACE.ruleY);
  ctx.lineTo(right, FACE.ruleY);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.fillStyle = BRAND.blue;
  ctx.font = `27px ${fonts.mono}`;
  ctx.fillText(card.role, x, FACE.rowY[0]);
  ctx.fillText(card.place, x, FACE.rowY[1]);
  ctx.textAlign = "right";
  if (card.date) ctx.fillText(card.date, right, FACE.rowY[0]);
  if (card.status) ctx.fillText(card.status, right, FACE.rowY[1]);

  ctx.textAlign = "left";
  ctx.fillStyle = BRAND.mutedOnWhite;
  ctx.font = `24px ${fonts.mono}`;
  ctx.fillText(card.tagline, x, FACE.taglineY);
}

function bandTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Band texture canvas unavailable");
  ctx.fillStyle = BRAND.white;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = BRAND.blue;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 37px "SFMono-Regular", Consolas, monospace`;
  ctx.fillText("GRADUATION '26", 256, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function BadgeFace({ card, art, fonts }: { card: BadgeCard; art: PassArt | null; fonts: BadgeFonts }) {
  const { context, texture } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = FACE.width;
    canvas.height = FACE.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Badge texture canvas unavailable");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return { context, texture };
  }, []);
  // Paint before the first frame (layout effect), then once more when the page's fonts are ready.
  useLayoutEffect(() => {
    let live = true;
    const paint = () => {
      if (!live) return;
      paintFace(context, card, art, fonts);
      texture.needsUpdate = true;
    };
    paint();
    document.fonts?.ready.then(paint, () => {});
    return () => { live = false; };
  }, [context, texture, card, art, fonts]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[0, 0, .014]}>
    <planeGeometry args={[1.98, 2.82]} />
    <meshPhysicalMaterial map={texture} side={DoubleSide} roughness={.5} metalness={0} clearcoat={.6} clearcoatRoughness={.2} toneMapped={false} emissive={BRAND.white} emissiveMap={texture} emissiveIntensity={.5} />
  </mesh>;
}

function BadgeModel(props: { card: BadgeCard; art: PassArt | null; fonts: BadgeFonts }) {
  return <group scale={.8}>
    <RoundedBox args={[2, 2.84, .024]} radius={.01} smoothness={4}>
      <meshPhysicalMaterial color={BRAND.mutedOnBlue} metalness={.4} roughness={.3} clearcoat={1} clearcoatRoughness={.1} />
    </RoundedBox>
    <mesh position={[-.985, 0, .019]}>
      <boxGeometry args={[.008, 2.77, .004]} />
      <meshBasicMaterial color={BRAND.blueSoft} transparent opacity={.42} />
    </mesh>
    <BadgeFace {...props} />
    <mesh position={[0, 1.48, .015]}>
      <torusGeometry args={[.12, .033, 12, 32]} />
      <meshStandardMaterial color={BRAND.blueDeep} metalness={.3} roughness={.35} />
    </mesh>
    <mesh position={[0, 1.44, .03]}>
      <boxGeometry args={[.28, .1, .02]} />
      <meshStandardMaterial color={BRAND.blue} metalness={.3} roughness={.4} />
    </mesh>
  </group>;
}

// Follows the Vercel "3D event badge" build: a few rope-jointed rigid bodies
// settle under gravity into a hanging band, and dragging the card just moves
// it kinematically until release hands it back to physics.
function Band({ visible, ...face }: { visible: boolean; card: BadgeCard; art: PassArt | null; fonts: BadgeFonts }) {
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const [dragged, setDragged] = useState<Vector3 | false>(false);
  const [hovered, setHovered] = useState(false);
  const { size, viewport } = useThree();
  const anchorX = size.width > WIDE ? viewport.width * .36 : 0;

  const geometry = useMemo(() => new MeshLineGeometry(), []);
  const texture = useMemo(bandTexture, []);
  const material = useMemo(() => {
    const line = new MeshLineMaterial({
      color: BRAND.white, map: texture, useMap: 1, lineWidth: 1.2, sizeAttenuation: 1,
      resolution: new Vector2(1, 1), repeat: new Vector2(-3, 1),
    });
    line.toneMapped = false; // keep the white print at the exact brand hex
    return line;
  }, [texture]);
  useEffect(() => { material.resolution.set(size.width, size.height); }, [material, size.width, size.height]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); texture.dispose(); }, [geometry, material, texture]);
  // A hidden tab drops any gesture in progress, so the card is not left kinematic.
  useEffect(() => { if (!visible) { setDragged(false); setHovered(false); } }, [visible]);

  const curve = useMemo(() => {
    const result = new CatmullRomCurve3([new Vector3(), new Vector3(), new Vector3(), new Vector3()]);
    result.curveType = "chordal";
    return result;
  }, []);
  const vec = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);
  const tmp = useMemo(() => new Vector3(), []);
  const ang = useMemo(() => new Vector3(), []);
  const rot = useMemo(() => new Vector3(), []);
  const j1Lerped = useRef<Vector3 | null>(null);
  const j2Lerped = useRef<Vector3 | null>(null);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], .6]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], .6]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], .6]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, CARD_ATTACH_Y, 0]]);

  useEffect(() => {
    document.body.style.cursor = dragged ? "grabbing" : hovered ? "grab" : "auto";
    return () => { document.body.style.cursor = "auto"; };
  }, [dragged, hovered]);

  useFrame((state, delta) => {
    if (!fixed.current) return;
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, .5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      for (const body of [card, j1, j2, j3, fixed]) body.current?.wakeUp();
      card.current.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    for (const [body, lerped] of [[j1, j1Lerped], [j2, j2Lerped]] as const) {
      const position = body.current.translation();
      tmp.set(position.x, position.y, position.z);
      if (!lerped.current) lerped.current = tmp.clone();
      const distance = MathUtils.clamp(lerped.current.distanceTo(tmp), .1, 1);
      lerped.current.lerp(tmp, delta * (10 + distance * 40));
    }
    const j3Position = j3.current.translation();
    const fixedPosition = fixed.current.translation();
    curve.points[0].set(j3Position.x, j3Position.y, j3Position.z);
    curve.points[1].copy(j2Lerped.current!);
    curve.points[2].copy(j1Lerped.current!);
    curve.points[3].set(fixedPosition.x, fixedPosition.y, fixedPosition.z);
    geometry.setPoints(curve.getPoints(32));
    ang.copy(card.current.angvel());
    rot.copy(card.current.rotation());
    // The blog's fixed correction: twist the card gently back to face the camera.
    // Clamped so the one-off large delta on the very first physics frame (still
    // loading WASM/environment while the clock keeps running) can't hand the
    // rope a burst of catch-up substeps that spins the card into a bad pose.
    card.current.setAngvel({
      x: MathUtils.clamp(ang.x, -10, 10),
      y: MathUtils.clamp(ang.y - rot.y * .25, -10, 10),
      z: MathUtils.clamp(ang.z, -10, 10),
    }, false);
  });

  const release = () => setDragged(false);
  return <>
    <RigidBody ref={fixed} type="fixed" position={[anchorX, ANCHOR_Y, 0]} colliders={false} />
    <RigidBody ref={j1} position={[anchorX + .5, ANCHOR_Y, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={j2} position={[anchorX + 1, ANCHOR_Y, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={j3} position={[anchorX + 1.5, ANCHOR_Y, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={card} position={[anchorX + 2, ANCHOR_Y, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2} type={dragged ? "kinematicPosition" : "dynamic"}>
      <CuboidCollider args={[.8, 1.136, .01]} />
      <group
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerUp={(event) => { (event.target as HTMLElement).releasePointerCapture(event.pointerId); release(); }}
        // On phones the page scrolls vertically over the badge (touch-action: pan-y), which cancels the gesture.
        onPointerCancel={release}
        onLostPointerCapture={release}
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture(event.pointerId);
          const origin = card.current.translation();
          setDragged(new Vector3(event.point.x - origin.x, event.point.y - origin.y, event.point.z - origin.z));
        }}
      ><BadgeModel {...face} /></group>
    </RigidBody>
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  </>;
}

/**
 * Closer on phones, so the card is legible in a shorter stage; the CSS badge (`badge.css`) hangs
 * at the matching size. When the tab comes back, the clock's hidden time is drained so physics
 * resumes with one ordinary frame, not a burst of catch-up steps.
 */
function Rig({ visible }: { visible: boolean }) {
  const camera = useThree((state) => state.camera);
  const clock = useThree((state) => state.clock);
  const width = useThree((state) => state.size.width);
  useLayoutEffect(() => {
    camera.position.z = width > WIDE ? 8 : 7;
    camera.updateProjectionMatrix();
  }, [camera, width]);
  useEffect(() => { if (visible) clock.getDelta(); }, [visible, clock]);
  return null;
}

/** The interactive badge. Mounted by NameBadge only once the CSS badge has painted and the gate allows it. */
export function BadgeCanvas({ card, art, fonts, onReady, visible }: {
  card: BadgeCard;
  art: PassArt | null;
  fonts: BadgeFonts;
  onReady: (ready: boolean) => void;
  visible: boolean;
}) {
  return <Canvas
    className="name-badge__canvas"
    frameloop={visible ? "always" : "never"}
    dpr={[1, 1.5]}
    camera={{ position: [0, 0, 8], fov: 32, near: .1, far: 30 }}
    gl={{ alpha: true, antialias: true }}
    onCreated={({ gl, clock }) => {
      gl.setClearColor(0x000000, 0);
      // Loading the physics WASM module and baking the environment map can
      // block the main thread for a couple of seconds before the first frame
      // renders, but the clock keeps running the whole time. Without this,
      // Rapier's first step sees that whole gap as one huge delta and tries
      // to catch up dozens of substeps at once, which can snap the rope into
      // an unstable, permanently frozen pose. Draining it here means the
      // first real frame only sees the (small) time since this line ran.
      clock.getDelta();
      // A lost context is usually recoverable (GPU process restart, driver
      // reset): preventDefault lets the browser restore it in place. Fall
      // back to the CSS badge meanwhile instead of leaving a blank
      // canvas, and bring the 3D badge back once it's actually rendering.
      gl.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        onReady(false);
      });
      gl.domElement.addEventListener("webglcontextrestored", () => onReady(true));
      onReady(true);
    }}
  >
    <Rig visible={visible} />
    <ambientLight intensity={1.4} />
    <Physics gravity={[0, -40, 0]} timeStep={1 / 60} interpolate paused={!visible}>
      <Band visible={visible} card={card} art={art} fonts={fonts} />
    </Physics>
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={2} color={BRAND.white} position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[8, .1, 1]} />
      <Lightformer form="rect" intensity={2.4} color={BRAND.blueSoft} position={[-3, 2, 4]} rotation={[0, .55, 0]} scale={[.16, 6, 1]} />
      <Lightformer form="rect" intensity={1.4} color={BRAND.mutedOnBlue} position={[3, -1, 3]} rotation={[0, -.5, 0]} scale={[.1, 4, 1]} />
      <Lightformer form="rect" intensity={6} color={BRAND.white} position={[-6, 0, 8]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[10, 2, 1]} />
    </Environment>
  </Canvas>;
}
