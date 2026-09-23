"use client";

import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { MeshLineGeometry, MeshLineMaterial } from "meshline";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, CatmullRomCurve3, DoubleSide, MathUtils, RepeatWrapping, SRGBColorSpace, Vector2, Vector3 } from "three";

const NAME = "YOUR NAME HERE";

function badgeArtwork() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1454;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Badge texture canvas unavailable");
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0b111d";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(170,193,233,.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = "#bdcce6";
  ctx.font = "30px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("VGU / 26", 70, 108);
  ctx.textAlign = "right";
  ctx.fillText("GUEST", w - 70, 108);
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
  ctx.font = "36px monospace";
  ctx.shadowColor = "rgba(139,174,230,.38)";
  ctx.shadowBlur = 14;
  art.forEach((line, index) => {
    ctx.fillStyle = index === 3 ? "#d9e8ff" : "#95aed5";
    ctx.fillText(line, w / 2, 345 + index * 90);
  });
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#eef4ff";
  ctx.font = "48px monospace";
  ctx.fillText(NAME, w / 2, 1060);
  ctx.strokeStyle = "rgba(172,191,225,.55)";
  ctx.beginPath(); ctx.moveTo(70, 1130); ctx.lineTo(w - 70, 1130); ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "#b6c8e6";
  ctx.font = "29px monospace";
  ctx.fillText("NOV 2026", 70, 1195);
  ctx.fillText("VGU CAMPUS", 70, 1235);
  ctx.textAlign = "right";
  ctx.fillText("PASS / 001", w - 70, 1195);
  ctx.fillText("PREVIEW", w - 70, 1235);
  ctx.textAlign = "left";
  ctx.fillStyle = "#7289ae";
  ctx.font = "26px monospace";
  ctx.fillText("SAME PEOPLE. A BRIGHTER YOU.", 70, 1370);
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
  ctx.fillStyle = "#253149";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#d5e2f7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 37px monospace";
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
    <meshPhysicalMaterial map={artwork} side={DoubleSide} roughness={.48} metalness={.12} clearcoat={.35} clearcoatRoughness={.35} />
  </mesh>;
}

function BadgeModel() {
  return <group>
    <RoundedBox args={[2, 2.84, .024]} radius={.01} smoothness={4}>
      <meshPhysicalMaterial color="#53627d" metalness={.38} roughness={.52} />
    </RoundedBox>
    <BadgeFace />
    <mesh position={[0, 1.48, .015]}>
      <torusGeometry args={[.12, .033, 12, 32]} />
      <meshStandardMaterial color="#a8b7d1" metalness={.9} roughness={.25} />
    </mesh>
    <mesh position={[0, 1.44, .03]}>
      <boxGeometry args={[.28, .1, .02]} />
      <meshStandardMaterial color="#53647d" metalness={.8} roughness={.3} />
    </mesh>
  </group>;
}

function Band({ onReady, active }: { onReady: () => void; active: boolean }) {
  const fixed = useRef<RapierRigidBody>(null!);
  const j1 = useRef<RapierRigidBody>(null!);
  const j2 = useRef<RapierRigidBody>(null!);
  const j3 = useRef<RapierRigidBody>(null!);
  const card = useRef<RapierRigidBody>(null!);
  const [dragged, setDragged] = useState<Vector3 | null>(null);
  const [hovered, setHovered] = useState(false);
  const pointerId = useRef<number | null>(null);
  const captureTarget = useRef<HTMLElement | null>(null);
  const smoothedJ1 = useRef<Vector3 | null>(null);
  const smoothedJ2 = useRef<Vector3 | null>(null);
  const { size, gl } = useThree();
  const geometry = useMemo(() => new MeshLineGeometry(), []);
  const texture = useMemo(bandTexture, []);
  const material = useMemo(() => new MeshLineMaterial({
    color: "#ffffff", map: texture, useMap: 1, lineWidth: 1.25, sizeAttenuation: 1,
    resolution: new Vector2(1, 1), repeat: new Vector2(2, 1),
  }), [texture]);
  const curve = useMemo(() => {
    const result = new CatmullRomCurve3([new Vector3(), new Vector3(), new Vector3(), new Vector3()]);
    result.curveType = "chordal";
    return result;
  }, []);
  const ready = useRef(false);
  const point = useMemo(() => new Vector3(), []);
  const direction = useMemo(() => new Vector3(), []);
  const dragTarget = useMemo(() => new Vector3(), []);
  const tether = useMemo(() => new Vector3(), []);
  const jointTarget = useMemo(() => new Vector3(), []);
  const velocity = useMemo(() => new Vector3(), []);
  const rotation = useMemo(() => new Vector3(), []);
  const cancelDrag = useCallback(() => {
    const id = pointerId.current;
    if (id === null) return;
    pointerId.current = null;
    const target = captureTarget.current;
    captureTarget.current = null;
    if (target?.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    else if (gl.domElement.hasPointerCapture(id)) gl.domElement.releasePointerCapture(id);
    setDragged(null);
    setHovered(false);
  }, [gl]);
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], .66]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], .66]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], .66]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.48, 0]]);

  useEffect(() => {
    gl.domElement.style.cursor = dragged ? "grabbing" : hovered ? "grab" : "auto";
    return () => { gl.domElement.style.cursor = "auto"; };
  }, [gl, dragged, hovered]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) cancelDrag(); };
    window.addEventListener("blur", cancelDrag);
    window.addEventListener("pointerup", cancelDrag);
    gl.domElement.addEventListener("pointercancel", cancelDrag);
    gl.domElement.addEventListener("lostpointercapture", cancelDrag);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", cancelDrag);
      window.removeEventListener("pointerup", cancelDrag);
      gl.domElement.removeEventListener("pointercancel", cancelDrag);
      gl.domElement.removeEventListener("lostpointercapture", cancelDrag);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cancelDrag, gl]);
  useEffect(() => {
    if (!active) {
      cancelDrag();
      smoothedJ1.current = null;
      smoothedJ2.current = null;
    }
  }, [active, cancelDrag]);
  useEffect(() => { material.resolution.set(size.width, size.height); }, [material, size.width, size.height]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); texture.dispose(); }, [geometry, material, texture]);

  useFrame((state, delta) => {
    if (!active || !fixed.current || !j1.current || !j2.current || !j3.current || !card.current) return;
    if (dragged) {
      point.set(state.pointer.x, state.pointer.y, .5).unproject(state.camera);
      direction.copy(point).sub(state.camera.position).normalize();
      point.add(direction.multiplyScalar(state.camera.position.length()));
      dragTarget.set(
        MathUtils.clamp(point.x - dragged.x, -1.7, 1.7),
        MathUtils.clamp(point.y - dragged.y, -1.35, 1.4),
        MathUtils.clamp(point.z - dragged.z, -.8, .8),
      );
      // The dragged body is kinematic, so Rapier cannot pull it back when the
      // pointer outruns the rope. Keep the attachment within its full length.
      tether.set(dragTarget.x, dragTarget.y - 1.62, dragTarget.z);
      if (tether.length() > 2) tether.setLength(2);
      for (const body of [card.current, j1.current, j2.current, j3.current]) body.wakeUp();
      card.current.setNextKinematicTranslation({ x: tether.x, y: tether.y + 1.62, z: tether.z });
    }
    // Vercel's final sandbox smooths the middle joints by distance. Clamp the
    // frame interval too, since a background tab can return with a large delta.
    const step = Math.min(delta, 1 / 30);
    const j1Position = j1.current.translation();
    const j2Position = j2.current.translation();
    if (!smoothedJ1.current) smoothedJ1.current = new Vector3(j1Position.x, j1Position.y, j1Position.z);
    if (!smoothedJ2.current) smoothedJ2.current = new Vector3(j2Position.x, j2Position.y, j2Position.z);
    for (const [smoothed, position] of [[smoothedJ1.current, j1Position], [smoothedJ2.current, j2Position]] as const) {
      jointTarget.set(position.x, position.y, position.z);
      const distance = MathUtils.clamp(smoothed.distanceTo(jointTarget), .1, 1);
      smoothed.lerp(jointTarget, Math.min(1, step * (10 + distance * (50 - 10))));
    }
    const j3Position = j3.current.translation();
    const fixedPosition = fixed.current.translation();
    curve.points[0].set(j3Position.x, j3Position.y, j3Position.z);
    curve.points[1].copy(smoothedJ2.current);
    curve.points[2].copy(smoothedJ1.current);
    curve.points[3].set(fixedPosition.x, fixedPosition.y, fixedPosition.z);
    geometry.setPoints(curve.getPoints(32));
    velocity.set(card.current.angvel().x, card.current.angvel().y, card.current.angvel().z);
    rotation.set(card.current.rotation().x, card.current.rotation().y, card.current.rotation().z);
    // Match the blog's fixed 0.25 front-facing correction. Delta-scaled
    // correction was the main source of violent spins after tab switches.
    card.current.setAngvel({
      x: MathUtils.clamp(velocity.x, -8, 8),
      y: MathUtils.clamp(velocity.y - rotation.y * .25, -8, 8),
      z: MathUtils.clamp(velocity.z, -8, 8),
    }, false);
    if (!ready.current) { ready.current = true; onReady(); }
  });

  return <>
    <RigidBody ref={fixed} type="fixed" position={[0, 3.1, 0]} colliders={false} />
    <RigidBody ref={j1} position={[.12, 2.45, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={j2} position={[.18, 1.8, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={j3} position={[.1, 1.15, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2}><BallCollider args={[.08]} /></RigidBody>
    <RigidBody ref={card} position={[0, -.45, 0]} colliders={false} canSleep angularDamping={2} linearDamping={2} type={dragged ? "kinematicPosition" : "dynamic"}>
      <CuboidCollider args={[1, 1.42, .012]} />
      <group
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerDown={(event) => {
          if (!card.current) return;
          event.stopPropagation();
          (event.target as HTMLElement).setPointerCapture(event.pointerId);
          pointerId.current = event.pointerId;
          captureTarget.current = event.target as HTMLElement;
          const position = card.current.translation();
          setDragged(new Vector3(event.point.x - position.x, event.point.y - position.y, event.point.z - position.z));
        }}
        onPointerUp={(event) => { event.stopPropagation(); cancelDrag(); }}
        onPointerMissed={cancelDrag}
      ><BadgeModel /></group>
    </RigidBody>
    <mesh geometry={geometry} material={material} frustumCulled={false} />
  </>;
}

export function BadgeCanvas({ onReady, onError, visible }: { onReady: () => void; onError: () => void; visible: boolean }) {
  const [resumePending, setResumePending] = useState(true);
  useEffect(() => {
    if (!visible) { setResumePending(true); return; }
    // Let the render clock advance twice before Rapier resumes. Its fixed-step
    // loop otherwise catches up to 0.5 s of hidden-tab time in one frame.
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setResumePending(false)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [visible]);
  const active = visible && !resumePending;
  return <Canvas
    className="guest-badge-canvas"
    frameloop={visible ? "always" : "never"}
    dpr={[1, 1.5]}
    camera={{ position: [0, 0, 8], fov: 32, near: .1, far: 30 }}
    gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
    onCreated={({ gl }) => {
      gl.setClearColor(0x000000, 0);
      gl.domElement.addEventListener("webglcontextlost", onError, { once: true });
    }}
  >
    <ambientLight intensity={2.2} />
    <directionalLight position={[-3, 5, 6]} intensity={3} color="#cddfff" />
    <directionalLight position={[3, -2, 4]} intensity={1.4} color="#809de0" />
    <Suspense fallback={null}>
      <Physics gravity={[0, -40, 0]} timeStep={1 / 60} interpolate paused={!active}>
        <Band onReady={onReady} active={active} />
      </Physics>
    </Suspense>
  </Canvas>;
}
