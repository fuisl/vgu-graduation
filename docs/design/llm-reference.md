# AI Design Reference

Before generating UI read `philosophy.md`, `tokens.md`, `components.md` and `anti-patterns.md`. Inspect an existing route of the same kind first (`/venue`, `/wishes`, `/invite` and `/design-system` are good models).

## Defaults for guest-facing pages

- **Theme:** wrap the page in `BrandTheme` (`@grad/ui`). One fixed blue-and-white theme; never add a light/dark switch. Admin (`/admin/*`) and docs keep the neutral tokens and must not use brand components.
- **Shell:** first `<SiteHeader current="home" | "venue" | "gallery" | "wishes" />` (omit `current` for pages not in the nav), last `<SiteFooter />`. Do not build another header, nav or footer.
- **Structure:** a page is a stack of full-bleed `Section` bands that alternate blue and white. Start with a blue band (eyebrow, h1, one lead line, optionally one primary `Cta`), then white bands for reading, forms and lists. Put a `BrandEyebrow` above each section heading and label each section with `aria-labelledby`.
- **Tone:** `blue` for heroes, feature bands and calls to action; `white` for anything the guest reads, fills in or scans; `blue-deep` only for the footer.
- **Density:** `airy` (default) for heroes and editorial bands; `compact` for forms, the invitation, RSVP, the gallery and other working surfaces. Add `narrow` for single-column forms and short text.
- **Actions:** `Cta` with the tone of the surface it sits on (`on-blue` or `on-white`). One `variant="primary"` per view; supporting actions use `variant="secondary"`; external links use `external`. Disabled `Cta` is outlined, never faded.
- **Choices:** a segmented filter or view switch is `PillGroup as="toggle" tone="on-white"` with `PillToggle pressed`. Navigation between pages is `PillGroup` with `PillItem current`, used in the header only.
- **Status text:** use the surface-following `--brand-danger` and `--brand-success`; they switch automatically on blue.
- **CSS:** route-local stylesheet, every rule scoped with `[data-theme="brand"]`, brand tokens only (`--brand-*`, `--space-*`, `--motion-*`, `--font-*`, `--text-*`). No hex, gradients, blur, shadows or large radii (radii are 2px and 4px). Content is 1200px (`--brand-content`) and text 70ch (`--brand-measure`). Canvas or WebGL code that cannot read CSS variables mirrors the token hex values in one commented map.
- **Type:** Inter Tight for headlines and body, sentence case, tight display tracking; Geist Mono uppercase for small labels (`BrandEyebrow`). Use the `--brand-text-*` sizes.
- **Mobile-first:** one breakpoint at 960px, 44px touch targets, no page-level horizontal scroll at 390px (`responsive.md`). Provide loading, error and empty states; a failed API call degrades one section, not the page.
- **Motion:** none by default. The sculpture is the only motif and `DecodeText` stays on the landing headline (`motion.md`). Preserve reduced motion.
- **Copy:** restrained, confident, warm, concise and slightly technical. Lead with event facts.

## How to pick tone and density

1. Is the guest reading or acting (forms, lists, RSVP)? White, and compact if it is a working surface.
2. Is it a headline moment or a call to action? Blue, airy.
3. Adjacent bands alternate. Never stack two bands of the same tone unless the density change is the point.

## Other rules

3D is reserved for hero storytelling, the personalised badge and deliberate cohort visualisations. Experimental features must not compromise event-critical flows.

Any explanatory illustration (a map, a cutaway, a how-it-works drawing) follows `figures.md` strictly: white line work on blue, dot-grid plate, one solid-white subject, mono labels on leaders. Copy FIG_001 on `/venue` and register the new figure number.

If a new visual pattern is required (a new primitive, colour, motif or motion), do not invent it silently: reuse the nearest established pattern or request human review. Add new primitives to `@grad/ui` and `components.md`, and to the `/design-system` showcase.
