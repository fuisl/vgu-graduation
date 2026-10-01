# Responsive System

Design mobile-first. Avoid device-specific layouts when fluid CSS is sufficient.

- **One breakpoint: 960px.** At 960px and below the brand layouts collapse: multi-column grids become one column (gallery and wishes teasers use two or one), the landing hero foot stacks, and the header switches to the mobile variant. Route stylesheets use `@media (max-width: 960px)`.
- **Mobile header and sheet.** The centre pill navigation and the guest chip are hidden (`display: none`, so they leave the accessibility tree) and a "Menu" text button appears. It opens a full-screen blue sheet with the four links as large rows and the guest chip at the bottom; it traps focus, locks body scroll, closes on Escape, and closes if the viewport grows past 960px. The header mark shrinks from 36px to 32px.
- **Gutter:** `--gutter: clamp(1rem, 4vw, 3rem)`.
- **Content width:** brand sections cap content at `--brand-content` (1200px); bands stay full-bleed. Reading text uses `--brand-measure` (70ch). Non-brand pages use `--content` for reading and `--wide` for immersive surfaces.
- **Vertical rhythm:** `Section density="airy"` is `clamp(4rem, 9vw, 6rem)` and `"compact"` is `clamp(2rem, 5vw, 3rem)`, so both shrink on phones without a media query.
- **Type:** display and heading sizes are fluid `clamp()` tokens (`--brand-text-display`, `-h1`, `-h2`, `-h3`, `-lead`, `-body`) with explicit minimums and maximums. On the landing the headline drops from display to h1 size at 960px.
- **Touch targets are at least 44px** (`--brand-tap`): `Cta`, pills, the Menu button, sheet links and inline links.
- Do not hide essential event information behind hover interactions.
- 3D/graphics must have a lightweight fallback and respect reduced motion. The sculpture uses a smaller ASCII cell (6x8px) on phones and ships a static ASCII motif when the canvas is unavailable.
- Wrap long toggle groups (`PillGroup as="toggle"` wraps on narrow screens) instead of scrolling horizontally. No page-level horizontal scroll at 390px.
