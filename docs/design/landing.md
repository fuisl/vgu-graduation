# Landing teaser — GRAD '26

The public root route (`/`) is a quiet teaser for the November ceremony, and the one place in the product where the visual system permits a continuous 3D moment. Invitation and documentation routes stay separate and don't inherit this palette or motion. This page documents the approved aesthetic as shipped — treat it as the reference for future changes, not a changelog.

## Palette

- Near-black surface: `#070A12`. Header/body text a near-white `#ECF0F9`/`#D8E1F2`; the header wordmark is pure white (`#fff`).
- A restrained blue-violet radial glow sits behind everything (`.landing::before`), independent of the sculpture's own halo.
- This palette — including the sculpture's ASCII shader gradient (violet shadow → blue midtone → icy cyan highlight) — belongs to the landing page only. It does not change `packages/design-tokens`; see `docs/design/tokens.md`.

## Background layers

Four independent, always-on layers sit behind the content, all `pointer-events:none` and `z-index:-1`:

1. **Aurora** (`.landing-aurora`) — three large, softly-blurred radial-gradient blobs (reusing the sculpture halo's blue-violet hues), each drifting and scaling on its own slow loop: 46s, 58s, 39s, all `ease-in-out`, unsynced so they never repeat in an obvious pattern.
2. **Grid** (`.landing-field`) — a 64px line grid at 0.25 opacity, masked to an ellipse so it fades at the edges, panning one full tile over 48s (`linear`, seamless loop).
3. **Twinkle field** (`TwinkleField.tsx`) — 26 dots at deterministic positions from a seeded PRNG (the same low-discrepancy technique the sculpture's point clouds use — not literal per-render randomness), each flickering independently on its own delay/duration.
4. **Parallax** (`BackgroundMotion.tsx`) — a side-effect-only client component that writes `--scroll-y`, `--pointer-x`, `--pointer-y` onto the document root (rAF-throttled). The aurora and grid consume these via CSS `calc()` in their `transform`, eased through a shared 0.5s `ease-out` transition: aurora shifts opposite scroll at -0.05x and nudges toward the cursor at 16px; the grid shifts less, at -0.025x and 6px. Cursor tracking only attaches on `(hover: hover) and (pointer: fine)` devices (no touch jitter), and the whole component no-ops under `prefers-reduced-motion: reduce`.

All motion here is intentionally small and slow — it should read as "the page is alive," not as an animated background competing with the sculpture for attention. Fully disabled under reduced motion: aurora/grid animation and transform, and twinkle-dot animation, all switched off.

## Header

- Left: the `VGU` wordmark (`BrandName.tsx`). Its resting state — both on first paint (server-rendered, before hydration) and whenever the page hasn't scrolled — is the full name, "Vietnamese-German University," with the acronym letters V/G/U bold and embedded in place rather than swapped for the short form. Scrolling past 8px compacts it to just "VGU"; hovering while compacted re-expands it, so the full name can still be peeked without scrolling back up.
- Both directions use a per-character decode rather than a slide or fade: each character opens its slot, then cycles through 2-3 ascii-noise glyphs (`!<>-_/\[]{}=+*^?#%@$&:.`) over ~80ms before settling on its real letter, staggered 9ms apart across the string. Collapsing is instant, no decode — only the reveal direction decodes.
- Right: `GRAD '26`, bold, wider tracking.
- No footer, no kicker line above the sculpture — both were removed; the header and the sculpture/message block are the only two structural pieces on the page.

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

## ASCII rendering

The scene renders normally, then gets sampled into a fixed ASCII grid by a GPU shader (`asciiShader` in `Sculpture.tsx`): each cell averages a 3×3 neighborhood and tracks its peak brightness, blends the two, and indexes into an 8-glyph ramp (space, then `.:-=+*#`, sparsest to densest). Color follows that same blended lightness through a 3-stop gradient (violet shadow → blue midtone → icy cyan highlight) — color follows lighting, not screen position.

- Device pixel ratio capped at 1.25; grid cell size adapts for phones (6×8px) vs. desktop (7×9px).
- The render loop pauses entirely when the document is hidden (`frameloop="never"`).
- A static ASCII motif ships in server-rendered HTML and stays visible whenever the canvas isn't: reduced motion, no WebGL, a render error, or WebGL context loss.

## Reference captures

`docs/design/reference/landing-desktop.png` and `landing-mobile.png` exist but predate this pass — the sculpture set, wordmark, and background layers have all changed since they were captured. Recapture both from a local production build before treating them as current.
