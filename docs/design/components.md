# Component Foundations

The shared UI package begins deliberately small. Components earn their place through reuse.

## Primitives
- `Container`: canonical horizontal gutter and max-width behavior.
- `Eyebrow`: technical metadata/section label; monospace and restrained.
- `Rule`: structural divider.
- `Button`: solid and outline actions with a minimum 44px target.

## Rules
Prefer composition over card proliferation. Components expose semantic variants, not arbitrary styling knobs. Product-specific behavior stays outside primitives. Every interactive primitive must remain keyboard-accessible and respect reduced motion.
