# Responsive System

Design mobile-first. Avoid device-specific layouts when fluid CSS is sufficient.

- Horizontal gutter uses `--gutter: clamp(1rem, 4vw, 3rem)`.
- Reading content uses `--content`; immersive/editorial surfaces may use `--wide`.
- Use fluid typography for major display text, with explicit minimum and maximum sizes.
- Touch targets are at least 44px.
- Do not hide essential event information behind hover interactions.
- 3D/graphics must have a lightweight fallback and respect reduced motion.
