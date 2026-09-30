# Component Foundations

> **Being replaced (2026-10-01):** the blue-and-white redesign supersedes this for guest-facing pages. See [redesign-2026-10.md](redesign-2026-10.md) and epic #142. Admin and docs are unchanged.

The shared UI package begins deliberately small. Components earn their place through reuse.

## Primitives
- `Container`: canonical horizontal gutter and max-width behavior.
- `Eyebrow`: technical metadata/section label; monospace and restrained.
- `Rule`: structural divider.
- `Button`: solid and outline actions with a minimum 44px target.

## Rules
Prefer composition over card proliferation. Components expose semantic variants, not arbitrary styling knobs. Product-specific behavior stays outside primitives. Every interactive primitive must remain keyboard-accessible and respect reduced motion.
