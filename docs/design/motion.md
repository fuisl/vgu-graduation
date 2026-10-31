# Motion

Motion communicates state, spatial continuity, physical behavior or narrative progression. In the brand language it is small and purposeful; the sculpture is the only continuous, prominent motion.

Token classes: fast (micro feedback, `--motion-fast` 120ms), default (UI transitions, `--motion-default` 220ms), slow (narrative transitions, `--motion-slow` 480ms). Cinematic/WebGL motion is feature-specific and must degrade gracefully.

Always respect `prefers-reduced-motion`. Do not autoplay distracting loops around reading or RSVP tasks.

## What moves

| Element | Motion | Reduced motion |
| --- | --- | --- |
| ASCII sculpture (landing) | Six shapes, each held 5s and morphing over 1.5s; a slow wobble, per-point shimmer and gentle breathing. Details in `landing.md`. | Static server-rendered ASCII motif; no canvas animation. The render loop also stops when the tab is hidden. |
| `DecodeText` (landing headline only) | Decodes once per page mount, about 900ms, about 30fps. Never repeats. | Plain text. |
| Blueprint figures (FIG_001 on `/venue`) | Walker dots along the route to the subject (6s loop) and slow current dots on the river (14s loop; 12s on the share story card so its 6s video loops seamlessly); labels and leaders reveal once, staggered, the first time the figure is 35% in view. Rules in `figures.md`. | Dots hidden; labels shown immediately with no transition. |
| Guest chip blobatar | Idle animation, and the eyes follow the pointer (travel of 3 viewBox units). One window `pointermove` listener, throttled with `requestAnimationFrame`, aimed from the avatar's own position. It is the only pointer-driven motion on brand surfaces. | The gaze driver does not attach, and the library's motion stylesheet stills the idle animation. The gaze also needs a fine pointer, so on touch devices the chip keeps only the idle blink and glance. |
| Portal blobatar (guest notices on `/me` and `/guide`, #139) | As the chip, larger, plus on touch screens the eyes follow the last touch (the library's pursuit, driven by touch `pointerdown`/`pointermove`, rAF only while the eyes move) and hand back to the idle glance 2.5s later. The idle animation pauses while the tab is hidden. | No gaze (mouse or touch) and no idle animation: a still face. |
| Name badge (`/me`) | The guest's lanyard name tag drops in once and swings under Rapier physics; it can be dragged (on phones a vertical swipe scrolls the page instead). It loads after the page, and pauses in a hidden tab and while scrolled away. See `landing.md`, "Name badge". | The server-rendered CSS badge, hanging still in the same place. |
| ASCII portraits (`/about`) | Each portrait prints once, top to bottom, the first time a third of it is in view: rows sweep down and each glyph passes through ASCII noise for about 1.1s at about 30fps, then settles. Never repeats. | Static server-rendered portraits; no animation. |
| Mobile menu sheet | Fades and slides in from 8px above over `--motion-default`. | No animation. |
| Buttons, pills, arrow tile | Background, colour and arrow-tile transitions over `--motion-fast`. | `tokens.css` shortens all transitions and animations under reduced motion. |
| `/guest/prototype` badge | The name badge with demo data; as above. | CSS badge fallback. |

## Rules
- Every new animation needs a stated purpose (state, space, physical behavior or narrative) and a reduced-motion behaviour.
- No ambient background motion: no drifting blobs, twinkles, pulsing grids or pointer parallax (`anti-patterns.md`).
- Do not add a second decoded or typed text effect; `DecodeText` stays on the landing headline. The one exception is the `/about` portrait reveal (owner request in #7): it decodes ASCII art, never readable text, and plays once per portrait.
- Pause work in hidden tabs (`requestAnimationFrame` loops and timers).
- Prefer `opacity`, `transform` and colour transitions; do not animate layout.

See `docs/design/landing.md` for the worked example of feature-specific WebGL motion kept restrained and gated behind reduced motion.
