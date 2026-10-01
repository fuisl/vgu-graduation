# Landing and sculpture

The public root route (`/`) is an event-first page on the blue-and-white brand theme ([redesign-2026-10.md](redesign-2026-10.md)). This page documents `/` as shipped, plus the technical detail of the sculpture, the ASCII renderer and the experimental routes that share them. Treat it as the reference for future changes, not a changelog.

## Composition

`/` renders inside `BrandTheme` with `SiteHeader current="home"` and `SiteFooter`. Styles are route-local in `apps/web/app/landing.css`, brand tokens only. Sections, in order:

1. **Blue hero** (`Section tone="blue"`, airy). The sculpture fills the stage (`.home-visual`, 320 to 520px high, at most 820px wide, centred). Below it the `Graduation ’26` headline in display size, and beside it the event line (mono, uppercase: date and venue name, from `getEvent`) and the single primary `Cta` "Your invitation" to `/invite`. At 960px and below the headline drops to the h1 size and the foot stacks.
2. **White "When and where"**. A `BrandEyebrow`, the heading "Join us on the day", then three columns (one column below 960px): **When** (date, time, and a note when `timeConfirmed` is false), **Where** (venue name, address and a secondary external "Directions" `Cta` to the map URL) and the calendar action (a primary "Add to calendar" `Cta` to the webcal feed, and a link to `/venue` for all calendar options and arrival details). If the event API fails, a status line links to `/venue`.
3. **Blue gallery teaser**. "Latest photos": the latest six `thumb` derivatives in a grid (three columns, two below 960px), then "Open gallery". Empty state: "First photos appear on ceremony day." Unavailable state: "Photos are temporarily unavailable." (with `role="status"`).
4. **White wishes teaser**. "Words for the class of 2026": the latest three wishes as soft-blue quote panels (body clamped to five lines, author in mono), then a "Leave a wish" `Cta` and a "Read all wishes" link. Empty and unavailable states as above.
5. **Footer** (`SiteFooter`, deep blue).

The page is server-rendered and `force-dynamic`; the event, gallery and wishes calls run in parallel and each section degrades on its own when the API is down. The earlier ASCII graduation chapter (text wall and stock image), the aurora, twinkle field, grid cells, pointer parallax and glow text-shadows, the animated VGU logo and the "Coming soon in November" sweep were removed.

## Headline

`DecodeText` (`apps/web/app/landing-title/`) is used on the `Graduation ’26` headline only. It decodes once per page mount (80ms delay, 900ms), each letter position passing through ASCII noise glyphs (`#%&@*+=:./\<>[]`) before settling. Block and Braille glyphs were dropped because they fall back to another font whose oversized ink spilled outside the letters. Updates step at about 30fps. Every changing glyph is an absolutely positioned visual layer over an invisible original glyph, so the real typeface alone determines width and line height; each character layer uses `contain: paint` so nothing draws outside its cell. The `h1` carries `aria-label="Graduation ’26"` and the decoded copy is `aria-hidden`; hidden pages cancel the work and reduced motion shows plain text. Noise glyphs use `--brand-muted-on-blue`. The component also supports a repeating `sweep` variant; nothing uses it.

## Sculpture as the motif

The sculpture is white line art on blue: the ASCII shader's ramp runs from `--brand-blue-deep` through `--brand-muted-on-blue` to white, and dim cells are lifted by an alpha floor so they do not sink into the blue surface. It is the only signature visual in the brand language. Its code backdrop and static fallback use the same colours. All rules are in `apps/web/app/sculpture/sculpture.css`, brand tokens only.

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

`CodeBackdrop.tsx` displays two short PyTorch-style fragments for each of the six shapes, in the same order as the sculpture cycle. The right fragment sits lower and starts typing 250ms after the left; both finish during the shape's hold. As soon as morphing begins, both retract character by character faster than they appeared, completing before the next shape arrives. The text sits behind the canvas in `--brand-muted-on-blue` at low opacity (16%), with function calls a little brighter (white at 30%); each side fades toward the sculpture's centre with a mask. It is decorative and hidden from assistive technology. Reduced motion and unavailable WebGL show the complete static fragments instead of typing.

## ASCII rendering

The scene renders normally, then passes through a two-stage GPU character renderer in `Sculpture.tsx`, adapted from ASCIIGen's live WebGL2 pipeline. The first stage runs at character-grid resolution: each cell averages a 3×3 neighborhood, tracks peak brightness, and stores one calibrated lightness value. The full-resolution second stage draws a font atlas using a 10-glyph ramp (space, then `.:-=+*#%@`, sparsest to densest). This avoids repeating nine source samples for every output pixel. Color follows that same blended lightness through a 3-stop gradient (`#16378A` deep-blue shadow → `#B9C8EE` muted-blue midtone → `#FFFFFF` highlight, stops at 0 / 0.4 / 0.8; redesign #147) — color follows lighting, not screen position.

- Device pixel ratio capped at 2; the glyph atlas is rasterised at the device-pixel size of one cell (css cell × DPR) and sampled ~1:1 so glyphs stay crisp on 1x and 2x (#6). The canvas uses normal blending (no `mix-blend-mode`) and there is no halo; grid cell size adapts for phones (6×8px) vs. desktop (7×9px).
- The glyph atlas uses the same self-hosted Geist Mono face as the page and is created only after the font is ready, avoiding platform-dependent `monospace` substitutions.
- The render loop pauses entirely when the document is hidden (`frameloop="never"`).
- A static ASCII motif ships in server-rendered HTML and stays visible whenever the canvas isn't: reduced motion, no WebGL, a render error, or WebGL context loss.

### Live camera

`/ascii-live` uses the pinned private `asciify` dependency rather than a copied renderer. Camera access is explicit and user-initiated; frames remain in the browser and are passed directly from a hidden video element to ASCIIGen's two-pass WebGL2 renderer. Leaving the route or pressing Stop releases every media track. Users can change the character matcher, cell-grid density, dark-background cutoff, mirror state, and source-color mode without restarting capture. The route reports permission, device, playback, and WebGL failures in place and does not depend on the event backend.

The route sits on the blue-and-white brand theme (`BrandTheme`, `SiteHeader`, `SiteFooter`, redesign #142): a blue title band, then a white section holding a deep-blue stage and a white controls panel. Its rules live in `apps/web/app/ascii-live/ascii-live.css`, brand tokens only. Choices use the on-white pill look, Start and Stop use `Cta`, and the renderer's `ink` is white (read from `--brand-white`) so the output is white on blue; source-color mode still shows the camera's own colours.

## Reference captures

Captures of the shipped landing live in `docs/design/reference/`: `landing-desktop.png` (1440px wide) and `landing-mobile.png` (390px wide), full page. They are stills of a live, animated page with no event API behind it, so the data sections show their unavailable states; the sculpture is whichever shape was showing when the capture was taken.

## Guest badge prototype

`/guest/prototype` follows the blue-and-white redesign (#152): it sits inside the brand theme with the shared `SiteHeader` and `SiteFooter`, and the stage is a plain `--brand-blue` section (no aurora, twinkle, grid or parallax). The badge is a thin white card with blue and ink print, a static ASCII artwork placeholder (kept instead of the `BrandLogo` mark so the texture stays synchronous and the first frame is never blocked on an image), and a narrow `--brand-muted-on-blue` metal edge. The two environment light strips are white, `--brand-blue-soft` and `--brand-muted-on-blue`. The single-colour white lanyard prints `GRADUATION '26` in blue, in the correct reading direction. Three.js cannot read CSS variables, so `BadgeCanvas.tsx` mirrors the token hex values in one `BRAND` map with a comment naming each token. The server-rendered CSS badge fallback (reduced motion, loading and WebGL failure) uses a white chip with blue text on the same stage; `prototype.css` uses brand tokens only.

The lanyard uses three Rapier rope joints and a spherical card joint, following the Vercel badge reference. Physics uses a fixed 1/60-second step, gravity `-40`, damping `2`, a `0.25` front-facing rotation correction, and distance-based smoothing of the middle joints (speed range `10–50`). The canvas spans the stage so pointer drags can reach the viewport edges. If a drag pulls beyond the rope's resting reach, the card eases back inside that reach before returning to dynamic physics. The lanyard print keeps a consistent scale while stretched. Tab hiding pauses physics and clears captured gestures; on return, two render frames advance before physics resumes so a background-tab delta cannot drive a burst of catch-up steps.
