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

## Copy and languages

The guest site reads in English and Vietnamese (#9, `languages.md`, ADR-010). From now on, never hard-code guest-facing text in a component:

1. Add the English message to `apps/web/lib/i18n/messages/en.ts` under a `<surface>.<thing>` key, and the same key with natural, formal Vietnamese (full diacritics, "Quý khách") to `vi.ts`. `tsc` fails if the key sets differ; `lib/i18n/i18n.test.ts` also checks placeholders.
2. In a server component or page: `const i18n = await getI18n()` (`lib/i18n/server.ts`), then `i18n.t("key", { name })`, `i18n.t.plural("key", n)` for `.one`/`.other` pairs, and `formatRich` for a link inside a sentence. Pass `i18n` to `SiteHeader`, `SiteFooter` and other server components; metadata uses `generateMetadata` with `getI18n()`.
3. In a client component: take a `messages` prop typed `MessageSlice<"prefix.">`, pass `pickMessages(i18n.locale, "prefix.")` from the server, and format with `sliceTranslator(messages)` (wrap it in `useMemo` if an effect uses it). Never import a dictionary into client code, and never export values other than components from a `"use client"` file.
4. Dates: `Intl.DateTimeFormat(i18n.intl, …)`. Event prose: `localizeEvent(event, i18n.locale)`.
5. Cover aria-labels, alt text, titles, loading, empty and error states, and status messages. Map API errors to your own messages by status; do not show an API's English `message`.

Admin (`/admin/*`) is internal and stays English.

## How to pick tone and density

1. Is the guest reading or acting (forms, lists, RSVP)? White, and compact if it is a working surface.
2. Is it a headline moment or a call to action? Blue, airy.
3. Adjacent bands alternate. Never stack two bands of the same tone unless the density change is the point.

## Other rules

3D is reserved for hero storytelling, the personalised badge and deliberate cohort visualisations. Experimental features must not compromise event-critical flows.

Any explanatory illustration (a map, a cutaway, a how-it-works drawing) follows `figures.md` strictly: white line work on blue, dot-grid plate, one solid-white subject, mono labels on leaders. Copy FIG_001 on `/venue` and register the new figure number.

If a new visual pattern is required (a new primitive, colour, motif or motion), do not invent it silently: reuse the nearest established pattern or request human review. Add new primitives to `@grad/ui` and `components.md`, and to the `/design-system` showcase.
