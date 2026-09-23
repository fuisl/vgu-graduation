"use client";

import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, CatmullRomCurve3, DoubleSide, MathUtils, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from "three";

const NAME = "YOUR NAME HERE";
const ANCHOR_Y = 2.6;
const CARD_ATTACH_Y = 1.18;

function badgeArtwork() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1454;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Badge texture canvas unavailable");
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(177,195,226,.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = "#dbe5f7";
  ctx.font = '500 29px "SFMono-Regular", Consolas, monospace';
  ctx.textBaseline = "middle";
  ctx.fillText("VGU", 70, 108);
  ctx.textAlign = "right";
  ctx.fillText("GRAD / 26", w - 70, 108);
  ctx.textAlign = "center";
  const art = [
    "         .  :  .         ",
    "      .  :  +  :  .      ",
    "   .  :  +  *  +  :  .   ",
    ".  :  +  *  #  *  +  :  .",
    "   .  :  +  *  +  :  .   ",
    "      .  :  +  :  .      ",
    "         .  :  .         ",
  ];
  ctx.font = '39px "SFMono-Regular", Consolas, monospace';
  ctx.shadowColor = "rgba(176,202,245,.25)";
  ctx.shadowBlur = 9;
  art.forEach((line, index) => {
    ctx.fillStyle = index === 3 ? "#e8f0ff" : "#a6bce0";
    ctx.fillText(line, w / 2, 350 + index * 91);
  });
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f4f7ff";
  ctx.textAlign = "left";
  ctx.font = '700 62px "SFMono-Regular", Consolas, monospace';
  ctx.fillText("GUEST", 70, 1050);
  ctx.fillStyle = "#b3c2df";
  ctx.font = '29px "SFMono-Regular", Consolas, monospace';
  ctx.fillText(NAME, 70, 1112);
  ctx.strokeStyle = "rgba(172,191,225,.38)";
  ctx.beginPath(); ctx.moveTo(70, 1170); ctx.lineTo(w - 70, 1170); ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "#b6c8e6";
  ctx.font = '27px "SFMono-Regular", Consolas, monospace';
  ctx.fillText("NOV 2026", 70, 1235);
  ctx.fillText("VGU CAMPUS", 70, 1274);
  ctx.textAlign = "right";
  ctx.fillText("PASS / 001", w - 70, 1235);
  ctx.fillText("PREVIEW", w - 70, 1274);
  ctx.textAlign = "left";
  ctx.fillStyle = "#7289ae";
  ctx.font = '24px "SFMono-Regular", Consolas, monospace';
  ctx.fillText("SAME PEOPLE. A BRIGHTER YOU.", 70, 1380);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function bandTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Band texture canvas unavailable");
  ctx.fillStyle = "#26344e";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#d5e2f7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 37px "SFMono-Regular", Consolas, monospace';
  ctx.fillText("GRADUATION '26", 256, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

function BadgeFace() {
  const artwork = useMemo(badgeArtwork, []);
  useEffect(() => () => artwork.dispose(), [artwork]);
  return <mesh position={[0, 0, .014]}>
    <planeGeometry args={[1.98, 2.82]} />
    <meshPhysicalMaterial map={artwork} side={DoubleSide} roughness={.38} metalness={.24} clearcoat={1} clearcoatRoughness={.14} />
  </mesh>;
}

function BadgeModel() {
  return <group scale={.8}>
    <RoundedBox args={[2, 2.84, .024]} radius={.01} smoothness={4}>
      <meshPhysicalMaterial color="#8498ba" metalness={.72} roughness={.22} clearcoat={1} clearcoatRoughness={.1} />
    </RoundedBox>
    <mesh position={[-.985, 0, .019]}>
      <boxGeometry args={[.008, 2.77, .004]} />
      <meshBasicMaterial color="#dce9ff" transparent opacity={.42} />
    </mesh>
    <BadgeFace />
    <mesh position={[0, 1.48, .015]}>
      <torusGeometry args={[.12, .033, 12, 32]} />
      <meshStandardMaterial color="#bdcae2" metalness={.9} roughness={.2} />
    </mesh>
    <mesh position={[0, 1.44, .03]}>
      <boxGeometry args={[.28, .1, .02]} />
      <meshStandardMaterial color="#53647d" metalness={.8} roughness={.3} />
    </mesh>
  </group>;
}

// Follows the Vercel "3D event badge" build: a few rope-jointed rigid bodies
// settle under gravity into a hanging band, and dragging the card just moves
// it kinematically until release hands it back to physics.
function Band() {
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const [dragged, setDragged] = useState<Vector3 | false>(false);
  const [hovered, setHovered] = useState(false);
  const { size, viewport } = useThree();
  const anchorX = size.width > 700 ? viewport.width * .36 : 0;

  const geometry = useMemo(() => new MeshLineGeometry(), []);
  const texture = useMemo(bandTexture, []);
  const material = useMemo(() => new MeshLineMaterial({
    color: "#ffffff", map: texture, useMap: 1, lineWidth: 1.2, sizeAttenuation: 1,
    resolution: new Vector2(1, 1), repeat: new Vector2(-3, 1),
  }), [texture]);
  useEffect(() => { material.resolution.set(size.width, size.height); }, [material, size.width, size.height]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); texture.dispose(); }, [geometry, material, texture]);

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
        onPointerUp={(event) => { (event.target as HTMLElement).releasePointerCapture(event.pointerId); setDragged(false); }}
        onPointerDown={(event) => {
          (event.target as HTMLElement).setPointerCapture(event.pointerId);
          const origin = card.current.translation();
          setDragged(new Vector3(event.point.x - origin.x, event.point.y - origin.y, event.point.z - origin.z));
        }}
      ><BadgeModel /></group>
    </RigidBody>
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  </>;
}

export function BadgeCanvas({ onReady, visible }: { onReady: (ready: boolean) => void; visible: boolean }) {
  return <Canvas
    className="guest-badge-canvas"
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
      // back to the DOM placeholder meanwhile instead of leaving a blank
      // canvas, and bring the 3D badge back once it's actually rendering.
      gl.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        onReady(false);
      });
      gl.domElement.addEventListener("webglcontextrestored", () => onReady(true));
      onReady(true);
    }}
  >
    <ambientLight intensity={1.4} />
    <Physics gravity={[0, -40, 0]} timeStep={1 / 60} interpolate paused={!visible}>
      <Band />
    </Physics>
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={2} color="#f4f8ff" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[8, .1, 1]} />
      <Lightformer form="rect" intensity={2.4} color="#dbe7ff" position={[-3, 2, 4]} rotation={[0, .55, 0]} scale={[.16, 6, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#99b7ef" position={[3, -1, 3]} rotation={[0, -.5, 0]} scale={[.1, 4, 1]} />
      <Lightformer form="rect" intensity={6} color="#ffffff" position={[-6, 0, 8]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[10, 2, 1]} />
    </Environment>
  </Canvas>;
}
