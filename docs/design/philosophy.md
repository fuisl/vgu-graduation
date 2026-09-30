# Visual Philosophy

GRAD '26 combines engineering precision with the emotional weight of graduation. Everything a guest sees speaks one language: saturated royal blue and white, quiet grotesk type, small mono labels, and one signature visual. The decision record is [redesign-2026-10.md](redesign-2026-10.md).

## Character
Precise, quiet, technical, editorial, warm without becoming sentimental. Event-first: the date, the venue and the invitation come before anything decorative.

## Two languages
- **Brand (guest-facing):** the blue-and-white theme. It covers `/`, `/gallery`, `/wishes`, `/polaroid`, `/invite`, `/invite/demo`, `/venue`, the pass, `/ascii-live`, `/guest/prototype`, `/design-system` and the 404 page. See `tokens.md`.
- **Neutral (admin and docs):** the original neutral light/dark tokens in `tokens.css`. `/admin/*` and `apps/docs` never opt in to the brand theme and are deliberately quieter. Do not carry brand blue into them.

## References
- Cantor8 ([cantor8.io](https://www.cantor8.io)): proportion and restraint of blue and white, a minimal pill navigation, small mono labels, one signature visual. See `moodboard.md` for what we took and did not.
- Vercel Ship: composition, event identity, selective spectacle.
- Firecrawl: ASCII/pixel motifs, technical texture.
- Linear-like admin surfaces: hierarchy and utility.

References are inspiration, not templates. Never copy assets, copy or layout wholesale.

## Hierarchy
Prefer **typography → whitespace → border → surface → motion**. Blue is a surface, not only an accent: full-bleed blue bands (hero, feature bands, calls to action) alternate with white bands (reading, forms, lists).

## Core rule
**90% restraint. 10% spectacle.** The spectacle is one motif, the morphing ASCII sculpture, drawn as white line art on blue. There is no second motif. Nothing else in the brand language glows, blurs, drifts or sparkles.

## One fixed theme
There is no light/dark switch on brand surfaces; the blue sections are the "dark" moments. Brand colour pairs are chosen for contrast (`tokens.md`), and the accent colour never appears on white.
