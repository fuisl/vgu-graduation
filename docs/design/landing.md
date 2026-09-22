# Landing teaser — GRAD ’26

The public root route is a quiet teaser for the November ceremony. It is the one place where the visual system permits a continuous 3D moment. Invitation and documentation routes remain separate.

## Approved visual direction

- Near-black surface: `#070A12`, with a restrained blue-violet radial field.
- ASCII characters use violet in shadow (`#856BD1`), blue in midtone (`#709EF5`), and icy cyan in highlight (`#C7F5FF`). These are the shader’s nominal RGB values. Color follows the sculpture’s lighting, not its screen position. This palette belongs to the landing sculpture only; it does not change the shared design tokens.
- Copy stays still, editorial, and small in scale. The primary line is exactly **“Coming soon in November.”** It has no year or signup action. Object names remain in the accessible description, with no visible caption.
- The framing reads a white `VGU` wordmark and `GRAD ’26` in the header only; there is no footer and no kicker line above the sculpture. The focal point is the sculpture, with generous dark space around it. The wordmark's acronym letters (V, G, U) anchor the display name; on hover or on scroll it grows the rest of each word in place — "VGU" becomes "Vietnamese-German University" — with a brief per-character ascii-noise decode rather than a slide or fade.

## Sculpture behavior

The six deterministic point sets have the same count and cycle in this order: gradient-descent landscape with a descent path and three graph axes anchored to the surface's true bounding corner; a roughly-spherical 3D neural network of Fibonacci-distributed nodes and their connecting edges, chosen so the form stays legible from every rotation angle instead of going edge-on like a flat diagram; laptop; a chunky extruded lightning bolt (outline, depth walls, filled front/back caps, and an interior core) standing in for electrical/electronics work, in place of an earlier flat circuit-board attempt that read poorly while turning; database → transform → database pipeline with directional chevrons; and separated candlesticks with bodies, wicks, and a subdued order-book base. Each form holds for five seconds and reforms over 1.5 seconds. The object turns continuously around a fixed vertical axis while the surrounding typography stays fixed.

The scene is sampled into a fixed ASCII grid by a GPU shader. Light and shadow determine both glyph density and color. The implementation caps device pixel ratio at 1.25, uses smaller cells on phones, and pauses when the document is hidden. A static ASCII motif is in server-rendered HTML and remains visible for reduced motion, missing WebGL, render errors, or context loss.

## Reference captures

Desktop and phone captures: `docs/design/reference/landing-desktop.png` and `docs/design/reference/landing-mobile.png`. Capture both from the local production build after visual QA.
