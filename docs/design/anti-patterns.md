# Visual Anti-patterns

Avoid generic glassmorphism, decorative neon glow, arbitrary gradients, excessive rounded cards, decorative emoji, shadows compensating for weak hierarchy, animation merely because possible, 3D as page furniture, inconsistent component variants, generic AI/SaaS copy, and literal copying of reference brands.

Specific to the blue-and-white language:
- **Accent never on white.** `--brand-accent` (`#69E8D4`) is 1.49:1 on white. Use it only on blue (focus ring, the current link in the mobile sheet, a live dot), and at most once per view.
- **No second motif.** The ASCII sculpture is the only signature visual. Do not add aurora, twinkle fields, grid cells, particles, pointer parallax, glow text-shadows or a second decorative graphic. These were removed from the old navy landing. The one exception is an explanatory figure in the blueprint style (`figures.md`): it explains something on the page, is never decoration, and follows that spec exactly.
- **No other illustration style.** Maps, cutaways and how-it-works drawings use the blueprint figure style in `figures.md` and nothing else: no flat vector scenes, no stock illustration, no photographic or 3D renders as diagrams.
- **No hex in route CSS.** Route-local stylesheets use `--brand-*`, `--space-*`, `--motion-*` and `--font-*` tokens. Raw hex is acceptable only where a canvas or shader cannot read CSS variables, and then it mirrors named tokens in one commented map (the ASCII sculpture shader, `BadgeCanvas.tsx`).
- **No second theme on brand surfaces.** No light/dark switch, no `prefers-color-scheme` rules inside `[data-theme="brand"]`.
- **No opacity for disabled.** A disabled `Cta` is outlined and muted, not faded.
- **No brand blue on admin or docs.** They keep the neutral tokens.
- **No large radii, drop shadows, blur or gradients** on brand surfaces. Radii are 2px and 4px.
- **One primary `Cta` per view.** Supporting actions use `variant="secondary"`.
- **Do not hide event facts behind hover or animation.** `DecodeText` is only for the landing headline, and the page stays readable without it.
- **Do not widen content past 1200px** inside brand sections, or body text past 70ch.

A quiet screen with strong typography and spacing is preferable to an over-decorated screen.
