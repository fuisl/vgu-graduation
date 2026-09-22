# Landing teaser — GRAD ’26

The public root route is a quiet teaser for the November ceremony. It is the one place where the visual system permits a continuous 3D moment. Invitation and documentation routes remain separate.

## Approved visual direction

- Near-black surface: `#070A12`, with a restrained blue-violet radial field.
- ASCII characters use violet in shadow (`#856BD1`), blue in midtone (`#709EF5`), and icy cyan in highlight (`#C7F5FF`). These are the shader’s nominal RGB values. Color follows the sculpture’s lighting, not its screen position. This palette belongs to the landing sculpture only; it does not change the shared design tokens.
- Copy stays still, editorial, and small in scale. The primary line is exactly **“Coming soon in November.”** It has no year or signup action.
- The framing reads `VGU / CSE` and `GRAD ’26`, with a small university footer. The focal point is the sculpture, with generous dark space around it.

## Sculpture behavior

The five deterministic point sets have the same count and cycle in this order: gradient-descent landscape with a descent path, laptop, connected data pipeline, cell tower with signal rings, and candlestick/order-book market structure. Each form holds for five seconds and reforms over 1.5 seconds. The object rotates continuously while the surrounding typography stays fixed.

The scene is sampled into a fixed ASCII grid by a GPU shader. Light and shadow determine both glyph density and color. The implementation caps device pixel ratio at 1.25, uses smaller cells on phones, and pauses when the document is hidden. A static ASCII motif is in server-rendered HTML and remains visible for reduced motion, missing WebGL, render errors, or context loss.

## Reference captures

Desktop and phone captures: `docs/design/reference/landing-desktop.png` and `docs/design/reference/landing-mobile.png`. Capture both from the local production build after visual QA.
