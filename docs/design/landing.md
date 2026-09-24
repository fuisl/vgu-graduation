# Landing teaser — GRAD '26

The public root route (`/`) is a quiet teaser for the November ceremony. The `/guest/prototype` badge preview reuses its background layers and adds a focused, interactive 3D badge. Invitation and documentation routes stay separate and don't inherit this palette or motion. This page documents the approved aesthetic as shipped — treat it as the reference for future changes, not a changelog.

## Palette

- Near-black surface: `#070A12`. Header/body text a near-white `#ECF0F9`/`#D8E1F2`; the header wordmark is pure white (`#fff`).
- A restrained blue-violet radial glow sits behind everything (`.landing::before`), independent of the sculpture's own halo.
- This palette — including the sculpture's ASCII shader gradient (violet shadow → blue midtone → icy cyan highlight) — belongs to the landing experience and its guest badge prototype. It does not change `packages/design-tokens`; see `docs/design/tokens.md`.

## Background layers

Four independent, always-on layers sit behind the content, all `pointer-events:none` and `z-index:-1`:

1. **Aurora** (`.landing-aurora`) — three large, softly-blurred radial-gradient blobs (reusing the sculpture halo's blue-violet hues), each drifting and scaling on its own slow loop: 46s, 58s, 39s, all `ease-in-out`, unsynced so they never repeat in an obvious pattern.
2. **Grid** (`.landing-field`) — a stationary, very subtle 64px blue-gray line grid, masked to an ellipse so it fades at the edges. `GridCells.tsx` picks up to nine deterministic cells outside the central sculpture/message zone for independent opacity pulses from 0 to 5% over their original square. Each pulse spans 33% of its cycle, allowing more overlap. Positions snap to the grid and update on resize.
3. **Twinkle and ASCII field** (`TwinkleField.tsx`) — 26 dots at deterministic positions from a seeded PRNG (the same low-discrepancy technique the sculpture's point clouds use — not literal per-render randomness), each flickering independently on its own delay/duration. Five fixed ASCII glyphs briefly appear near the outer grid, leaving the sculpture and message area clear.
4. **Pointer parallax** (`BackgroundMotion.tsx`) — a side-effect-only client component that writes `--pointer-x` and `--pointer-y` onto the document root (rAF-throttled). Only the aurora consumes these through CSS, eased over 0.5s and nudged toward the cursor at 16px. Neither the grid nor aurora reacts to page scroll. Cursor tracking only attaches on `(hover: hover) and (pointer: fine)` devices, and the component no-ops under `prefers-reduced-motion: reduce`.

All motion here is intentionally small and slow — it should read as "the page is alive," not as an animated background competing with the sculpture for attention. Under reduced motion, aurora movement, cell pulses, twinkle-dot animation, and ASCII signals are switched off; the static grid remains.

## Header

- The header is a full-width segmented navigation bar inspired by the clear event hierarchy of GitHub Universe, translated into GRAD's dark, bordered visual system. It contains Gallery, ASCII live, and Guest preview; ASCII live opens the user-initiated camera renderer and the guest link leads to the placeholder badge prototype.
- Left: a procedural white ASCII treatment generated from the official transparent `apps/web/public/brand/vgu-logo.png` by `scripts/generate-vgu-logo.py`. The 36-frame GIF uses 21px monospace glyphs and a slow 2.9-second sweep across only the emblem while the wordmark remains stable. The generator uses 1.2× vertical pitch to prevent larger glyphs from cutting through adjacent rows. `BrandName.tsx` uses the GIF as a CSS mask, so `--brand-logo-color` can recolor the whole result. Reduced motion switches to the original static PNG mask. The logo remains stable while scrolling.
- Guest sign in is the single raised accent action: muted blue fill, hard offset shadow, and a locally drawn compact northeast arrow. It lifts another 2px on hover or keyboard focus.
- The "Coming soon in November." heading uses ASCIIGen's homepage decode rhythm (`WaveTitle.tsx`): the unresolved phrase flickers as character noise and locks into its final text from left to right in 760ms, then holds for 4.2s. Its pool deliberately balances three engine families—ASCII punctuation, blocks/quadrants, and Braille—rather than letting one large Unicode set dominate. Noise updates are capped near 30fps, deterministic within each frame, and rendered in Geist Mono while invisible original glyphs reserve the sans-serif title width, so neither decoding nor mixed-width symbols shift the layout. Words wrap together on narrow screens. The accessible heading remains constant; hiding the page cancels the loop, and reduced motion shows plain text.

## Hero structure

- `GRADUATION ’26` is the primary headline, set nearly edge-to-edge above the media stage. The year uses the landing's muted blue accent.
- The media stage is a transparent bordered two-column layout sized with the header and headline to fill one desktop viewport. The single desktop background grid uses `5vw` squares, producing exactly 20 columns: the header consumes one grid row, the headline consumes three, the media frame starts on row four, and its center divider lands on column ten. It does not draw another grid; the page-level grid continues through both panels. The WebGL composer also renders with transparent clear and fragment alpha so it does not cover that grid. The left column is an edge-to-edge placeholder for future pictures and recap media; inserted images and video fill the panel with `object-fit: cover`, matching the reference's crop behavior. Its label overlays the bottom of the media instead of consuming a separate row. The right column centers the live sculpture responsively. Its code backdrops sit slightly closer to the model with enough contrast to remain visible, followed by the animated coming-soon message.
- The right column begins with the compact event line: `November 2026 / VGU Campus, HCMC` and `Graduation ceremony`.
- On screens at or below 960px, the navigation and media columns stack while preserving the same reading order and normal document scrolling.

## Sculpture

### Shapes & cycle

Six deterministic point sets (5,200 points each, `apps/web/app/sculpture/shapes.ts`), cycling in this order, each holding 5s and morphing over 1.5s:

1. **Laptop** ("Software Engineering") — upright screen with a bright perimeter, keyboard deck.
2. **Gradient-descent landscape** ("Gradient Descent") — a bowl-shaped loss surface with a descent path and three graph axes, anchored to the surface's true bounding corner so the frame actually encloses the terrain (an early version floated disconnected from the surface — fixed by deriving the corner and extents from the surface formula itself, not eyeballed constants).
3. **Cell tower** ("Electrical Engineering") — a triangular lattice tower on a square base, a dish mounted partway up one leg, a domed antenna with signal arcs on top. Replaced two earlier attempts (a lightning bolt, and before that a flat circuit board) that either didn't fit the rest of the set thematically or read poorly while rotating.
4. **Pipeline** ("Data Engineering") — database → transform → database, with directional chevrons.
5. **Candlesticks** ("Quantitative Finance") — bodies, wicks, a subdued order-book base, and a bright diagonal trend arrow riding above the candle highs, making the uptrend an explicit visual annotation instead of an implicit read of the candle data.
6. **Light bulb** ("Innovation") — a big, nearly-full glass globe with a zigzag filament, pinching through a short neck to a small, clearly separate threaded screw base. Replaced an AI/neural-networks concept (a Fibonacci-distributed node sphere) that didn't fit "innovation" as a category once the bulb was chosen for it.

### Shading

Each point's brightness (`SHADES`, precomputed once per shape) drives glyph density and color in the ASCII shader — this renderer has no literal alpha transparency, so brightness is the only lever for effects like "glass" or "glow."

- Default: a fixed directional formula (`0.48 - x·0.29 + y·0.26 + z·0.25`) gives every shape a consistent bright/shaded side, as if lit from the upper-left.
- **Gradient descent** gets a bespoke terrain-normal formula instead — the generic linear formula doesn't read as a lit 3D surface for a bowl shape.
- **Five parts across four shapes** get physically-derived shading keyed to their own curved-surface center (a fresnel rim — bright at the silhouette, dim center-facing — paired with a directional shadow) rather than the flat generic formula: the bulb's glass (plus a sparse glow-shell aura floating just outside it), the cell tower's dome (its signal arcs shaded as a matching glow shell), the database drums (cylindrical fresnel), the laptop screen (a backlight bloom, brightest at center), and the candlestick trend arrow's tip (a fading spark of glow). Parts without a real curved surface — legs, braces, base plates, candle bodies — keep the generic formula; fresnel math doesn't mean anything on a flat face.

### Motion

- **Rotation**: a wobble, not a turntable — `rotation.y` and `rotation.x` each follow their own slow sine oscillation, so the object never turns fully away from the camera. (A continuous-turntable version was tried first and reverted back to this.)
- **Idle motion**: every point gets a small continuous sine-driven shimmer (unique phase per point), running every frame including during the 5s hold, not just during morphs, plus a gentle whole-object breathing scale (±1.5%). Both intentionally subtle so a held shape stays readable.
- **Morph**: all 5,200 points share one synchronized progress value, eased with symmetric smoothstep (`t²(3-2t)`), plus a `sin(πt)`-driven outward scatter that peaks at the transition's midpoint. Two alternatives were tried and reverted: a per-point staggered reform (via a golden-ratio Weyl sequence, each point on its own delayed timeline) read as unsynchronized rather than lively; a restrained ease-out-back curve (fast departure, ~4% overshoot, clean settle) went back to smoothstep alongside it. Current state: fully synced, symmetric easing.

### Code backdrop

`CodeBackdrop.tsx` displays two short PyTorch-style fragments for each of the six shapes, in the same order as the sculpture cycle. The right fragment sits lower and starts typing 250ms after the left; both finish during the shape's hold. As soon as morphing begins, both retract character by character faster than they appeared, completing before the next shape arrives. The text sits behind the canvas, with grid-level blue-gray contrast and a slightly brighter muted blue on function calls; each side fades toward the sculpture's center. It is decorative and hidden from assistive technology. Reduced motion and unavailable WebGL show the complete static fragments instead of typing.

## ASCII rendering

The scene renders normally, then passes through a two-stage GPU character renderer in `Sculpture.tsx`, adapted from ASCIIGen's live WebGL2 pipeline. The first stage runs at character-grid resolution: each cell averages a 3×3 neighborhood, tracks peak brightness, and stores one calibrated lightness value. The full-resolution second stage draws a font atlas using a 10-glyph ramp (space, then `.:-=+*#%@`, sparsest to densest). This avoids repeating nine source samples for every output pixel. Color follows that same blended lightness through a 3-stop gradient (violet shadow → blue midtone → icy cyan highlight) — color follows lighting, not screen position.

- Device pixel ratio capped at 1.25; grid cell size adapts for phones (6×8px) vs. desktop (7×9px).
- The glyph atlas uses the same self-hosted Geist Mono face as the page and is created only after the font is ready, avoiding platform-dependent `monospace` substitutions.
- The render loop pauses entirely when the document is hidden (`frameloop="never"`).
- A static ASCII motif ships in server-rendered HTML and stays visible whenever the canvas isn't: reduced motion, no WebGL, a render error, or WebGL context loss.

### Live camera

`/ascii-live` uses the pinned private `asciify` dependency rather than a copied renderer. Camera access is explicit and user-initiated; frames remain in the browser and are passed directly from a hidden video element to ASCIIGen's two-pass WebGL2 renderer. Leaving the route or pressing Stop releases every media track. Users can change the character matcher, cell-grid density, dark-background cutoff, mirror state, and source-color mode without restarting capture. The route reports permission, device, playback, and WebGL failures in place and does not depend on the event backend.

## Reference captures

`docs/design/reference/landing-desktop.png` and `landing-mobile.png` exist but predate this pass — the sculpture set, wordmark, and background layers have all changed since they were captured. Recapture both from a local production build before treating them as current.

## Guest badge prototype

`/guest/prototype` reuses the landing background. On laptops, the title and suspended badge occupy the right half of the screen; the left half stays quiet. On narrow screens, the title sits beside the lanyard and the badge stays centered. The thin, dark card has a static ASCII artwork placeholder and a compact, bold guest label. Its narrow metallic edge and the two white and blue environment light strips give it a restrained reflective highlight. The single-color lanyard prints `GRADUATION '26` in the correct reading direction. The server-rendered CSS badge mirrors the layout for reduced motion, loading, and WebGL failure.

The lanyard uses three Rapier rope joints and a spherical card joint, following the Vercel badge reference. Physics uses a fixed 1/60-second step, gravity `-40`, damping `2`, a `0.25` front-facing rotation correction, and distance-based smoothing of the middle joints (speed range `10–50`). The canvas spans the stage so pointer drags can reach the viewport edges. If a drag pulls beyond the rope's resting reach, the card eases back inside that reach before returning to dynamic physics. The lanyard print keeps a consistent scale while stretched. Tab hiding pauses physics and clears captured gestures; on return, two render frames advance before physics resumes so a background-tab delta cannot drive a burst of catch-up steps.
