# Motion

Motion communicates state, spatial continuity, physical behavior or narrative progression.

Token classes: fast (micro feedback), default (UI transitions), slow (narrative transitions). Cinematic/WebGL motion is feature-specific and must degrade gracefully.

Always respect `prefers-reduced-motion`. Do not autoplay distracting loops around reading or RSVP tasks.

See `docs/design/landing.md` for a worked example of feature-specific cinematic/WebGL motion kept deliberately restrained and fully gated behind reduced-motion.
