# Component Foundations

> **Being replaced (2026-10-01):** the blue-and-white redesign supersedes this for guest-facing pages. See [redesign-2026-10.md](redesign-2026-10.md) and epic #142. Admin and docs are unchanged.

The shared UI package begins deliberately small. Components earn their place through reuse.

## Primitives
- `Container`: canonical horizontal gutter and max-width behavior.
- `Eyebrow`: technical metadata/section label; monospace and restrained.
- `Rule`: structural divider.
- `Button`: solid and outline actions with a minimum 44px target.

## Brand primitives (redesign #142)
Exported from `@grad/ui`, styled in `packages/design-tokens/src/brand.css` under `[data-theme="brand"]`, brand tokens only. Render inside `BrandTheme`. Live showcase: `/design-system`.
- `Section`: `tone="blue" | "white" | "blue-deep"`, `density="airy" | "compact"`, `narrow`. Content capped at 1200px.
- `BrandEyebrow`: mono label; no built-in bottom margin.
- `Cta`: `tone` (the surface: `on-blue` | `on-white`) and `variant`.
  - `variant="primary"` (default): filled box with arrow tile, one per view.
  - `variant="secondary"`: outlined (transparent fill, 1px border, text follows the surface), 44px minimum, no tile. For supporting actions such as "Back to gallery", "Close", calendar options.
  - `href` renders an anchor, otherwise a button (`type`, `onClick`). `aria-label` names icon-only labels. `tabIndex` is passed through.
  - `external` (with `href`): `target="_blank" rel="noopener noreferrer"`, a visually hidden "(opens in a new tab)" and the arrow (also on secondary).
  - `disabled`: outlined and muted on both variants. A disabled link renders without `href` and with `aria-disabled="true"`.
- `PillGroup` / `PillItem` / `PillToggle`: segmented control, `tone="on-blue" | "on-white"`.
  - Navigation (default): `<PillGroup label>` renders a `nav`; `PillItem` links take `current` (`aria-current="page"`).
  - Toggle: `<PillGroup as="toggle" label>` renders a `role="group"`; `PillToggle` buttons take `pressed` (`aria-pressed`) and `onClick`. Wraps on narrow screens. Use `aria-label` on a `PillToggle` when its text is a single letter.

## Rules
Prefer composition over card proliferation. Components expose semantic variants, not arbitrary styling knobs. Product-specific behavior stays outside primitives. Every interactive primitive must remain keyboard-accessible and respect reduced motion.
