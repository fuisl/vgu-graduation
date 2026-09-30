# Design Tokens

> **Being replaced (2026-10-01):** the blue-and-white redesign supersedes this for guest-facing pages. See [redesign-2026-10.md](redesign-2026-10.md) and epic #142. Admin and docs are unchanged.

Tokens are implemented in `packages/design-tokens`; code is authoritative for exact values.
Families: color, typography, spacing, radius, motion, layout, depth.
Use a small consistent scale. Prefer square/small radii, borders and spacing before shadows, and semantic accent colors. Do not use arbitrary values when a token fits. New token families require design review.

## Brand theme (redesign #142)

Implemented in `packages/design-tokens/src/brand.css`, exported as `@grad/design-tokens/brand.css` and loaded by `apps/web/app/layout.tsx` after `tokens.css`. It is **opt-in and scoped**: every rule lives under `[data-theme="brand"]`, with no `:root` rules and no `prefers-color-scheme` switch (one fixed theme). Admin and `apps/docs` never set the attribute, so they are unchanged. `tokens.css` is untouched; the brand layer reuses its `--space-*`, `--motion-*`, `--ease`, `--gutter`, `--content`, `--text-xs` and `--font-mono`.

Opt in with `<BrandTheme>` from `@grad/ui` (renders `<div data-theme="brand">`). Inside it, `--font-sans` becomes Inter Tight (`next/font/google`, Latin, Latin Extended and Vietnamese, `display: swap`, variable `--font-inter-tight`); Geist Mono stays for labels.

### Palette

| Token | Value | Use |
| --- | --- | --- |
| `--brand-blue` | `#1F4BB0` | Blue section surface, primary button on white, links on white |
| `--brand-blue-deep` | `#16378A` | Pill container, pressed states, footer band |
| `--brand-blue-soft` | `#E8EEFB` | Tinted panels, hover fills on white |
| `--brand-white` | `#FFFFFF` | Type on blue, white sections, active pill |
| `--brand-ink` | `#0B1A3A` | Body text on white |
| `--brand-muted-on-blue` | `#B9C8EE` | Secondary text and labels on blue |
| `--brand-muted-on-white` | `#5B6784` | Secondary text on white |
| `--brand-line-on-blue` | `rgba(255,255,255,.18)` | Hairlines on blue |
| `--brand-line-on-white` | `#D9E0F0` | Hairlines on white |
| `--brand-accent` | `#69E8D4` | Rare highlight, focus ring on blue (at most one per view) |
| `--brand-danger-on-white` / `-on-blue` | `#B42318` / `#FFC2B8` | Status text |
| `--brand-success-on-white` / `-on-blue` | `#0F7A3E` / `#8EF0B0` | Status text |

No single danger or success colour reaches 4.5:1 on both white and blue, so each has `-on-white` and `-on-blue` variants. `--brand-danger` and `--brand-success` are surface-following aliases: they resolve to the `-on-white` value by default and to the `-on-blue` value inside `Section tone="blue"`. The same mechanism provides `--brand-fg`, `--brand-muted` and `--brand-line`.

### Contrast (WCAG 2.x relative luminance)

| Foreground | Background | Ratio | Result |
| --- | --- | --- | --- |
| white | blue | 7.80 | AA, AAA |
| white | blue-deep | 10.78 | AA, AAA |
| ink | white | 17.17 | AA, AAA |
| ink | blue-soft | 14.76 | AA, AAA |
| muted-on-blue | blue | 4.67 | AA |
| muted-on-blue | blue-deep | 6.45 | AA |
| muted-on-white | white | 5.65 | AA |
| muted-on-white | blue-soft | 4.86 | AA |
| blue | white | 7.80 | AA, AAA |
| blue | blue-soft | 6.71 | AA, AAA |
| danger-on-white | white | 6.57 | AA |
| danger-on-blue | blue | 5.08 | AA |
| success-on-white | white | 5.42 | AA |
| success-on-blue | blue | 5.66 | AA |
| accent | blue | 5.24 | AA (focus ring, non-text 3:1) |
| accent | blue-deep | 7.24 | AA |
| accent | white | 1.49 | Fails: never use accent on white |

All brief values passed unchanged. `muted-on-blue` on `blue` is the tightest pair (4.67): use it for text only on `--brand-blue` or `--brand-blue-deep`, never on a lighter blue.

### Type, shape and rhythm

- Body `--brand-text-body` 16 to 18px (fluid), line height 1.5, `--brand-measure` 70ch.
- Fluid display sizes: `--brand-text-display`, `-h1`, `-h2`, `-h3`, `-lead`; display tracking `--brand-tracking-display` (-0.03em), weight 400 to 500, sentence case.
- Labels: Geist Mono, uppercase, `--text-xs`, `--brand-tracking-label` (0.08em).
- Radii: `--brand-radius-sm` 2px, `--brand-radius` 4px. No large radii.
- Content width: `--brand-content` 1200px, the maximum inside brand sections (`Section` renders `.brand-section-inner`; bands stay full-bleed, reading text stays at `--brand-measure`). The shared `Container` (`--wide`) is unchanged for non-brand pages.
- Section rhythm, two densities: `--brand-section-y` (airy, default, `clamp(4rem, 9vw, 6rem)`) and `--brand-section-y-compact` (`clamp(2rem, 5vw, 3rem)`) for forms, the invitation, RSVP and the gallery (`Section density="compact"`). Minimum target: `--brand-tap` 44px.
- `PillGroup tone`: `on-blue` (default) is a `--brand-blue-deep` container with white text and a white active pill (blue text on white: 7.80). `on-white` is a `--brand-blue-soft` container with `--brand-blue` text (6.71) and an active pill of solid `--brand-blue` with white text (7.80).
- `Section tone="blue-deep"` (used by the footer): text follows the blue tone; `--brand-muted-on-blue` on `--brand-blue-deep` is 6.45.
- Disabled `Cta`: transparent fill, 1px `--brand-line` border, `--brand-muted` label; disabled controls are exempt from contrast rules.
