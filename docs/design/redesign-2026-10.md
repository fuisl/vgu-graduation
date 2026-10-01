# Redesign brief: blue and white (October 2026)

Status: **Implemented on `refactor/blue-white-redesign`; merged to main with #155.** This page is kept as the decision record. The permanent docs (`philosophy.md`, `tokens.md`, `components.md`, `landing.md`, `motion.md`, `anti-patterns.md`, `llm-reference.md`, `moodboard.md`, `responsive.md`) describe the language as shipped and supersede this brief where they disagree; the code is authoritative for exact values. Decisions were made by the project owner on 2026-10-01. Values marked *proposed* below were finalised in #143 and #153 (see `tokens.md`). Tracking epic: see "Work breakdown".

## What shipped

All on the integration branch `refactor/blue-white-redesign` (epic #142):

- #156 and #158 this brief and its handbook navigation entry
- #159 brand tokens, Inter Tight and the `packages/ui` primitives (#143, #144)
- #157 sculpture and code backdrop recoloured, blur fixed (#147, #6)
- #161 Fuisloy pixel logo and favicon replace the ASCII VGU logo
- #160 `/design-system` rebuilt as the blue-and-white showcase (#153)
- #162 site header, mobile menu sheet and footer (#145)
- #163 owner sign-off applied: content width, pill tone, density, footer band, disabled `Cta`
- #164 invitation, demo invitation, venue and pass (#150)
- #165 landing page (#148)
- #166 gallery, wishes and polaroid (#149)
- #167 two-state guest chip with animated blobatar (#146)
- #168 `/ascii-live` (#151)
- #169 `/guest/prototype` badge (#152)
- #171 consolidation: shared `Cta` and pill primitives, dead code removed (#155)

Outcomes of the open questions: the landing is event-first (hero, when and where, gallery teaser, wishes teaser, footer) and the ASCII graduation chapter was dropped; `DecodeText` stayed on the hero headline only; the footer is a deep-blue band; the invitation is a blue greeting band plus a compact white band that also holds the pass.

## Why

The web grew four visual families: the dark-navy landing experience (aurora, grid, twinkles, WebGL ASCII sculpture), the monochrome guest pages, the admin, and the docs. The owner wants one simple, elegant language across everything a guest sees, in the spirit of [cantor8.io](https://www.cantor8.io): a saturated royal blue and white in the right proportion, quiet grotesk type, small mono labels, one signature visual, and a minimal navigation.

Cantor8 is a reference for proportion and restraint, not a template: no copying its assets, copy or layout wholesale (`philosophy.md`, References).

## Decisions

| Topic | Decision |
| --- | --- |
| Scope | Landing and memories (`/`, `/gallery`, `/wishes`, `/polaroid`), guest pages (`/invite`, `/invite/demo`, `/venue`, the pass), plus `/ascii-live`, `/guest/prototype` and `/design-system`. **Admin (`/admin/*`) and the docs site (`apps/docs`) keep their current neutral look.** |
| Colour use | The Cantor8 mix: full-bleed **blue sections** (hero, feature bands, calls to action) alternate with **white sections** (reading, forms, lists). Blue is a surface, not only an accent. |
| Theme mode | **One fixed theme**, no light/dark switch on brand surfaces. The blue sections are the "dark" moments. Supersedes #10 (light theme). |
| Signature visual | **One motif: the morphing ASCII sculpture**, kept as is and recoloured to the new palette. The aurora blobs, twinkle field, grid cells and pointer parallax are removed. |
| Typography | **Inter Tight** for headlines and body (open licence, strong Vietnamese diacritics), **Geist Mono** kept for small uppercase labels (for example `SOFTWARE ENGINEERING ...`). |
| Navigation | Cantor8-style pills: logo left; one segmented pill of links in the centre, active item a white pill; one CTA pill on the right. Mobile: logo plus a Menu button opening a full-screen blue sheet. |
| Nav CTA | **Two states.** Signed out: `Your invitation ↗`. Signed in (invitation cookie): the guest's **blobatar** plus first name, linking to their invitation; the blobatar's eyes follow the cursor. The full guest profile stays in #139. |
| Logo | Temporary text wordmark **"Fuisloy"** until the owner supplies the new logo. The animated ASCII VGU logo GIF is retired on brand surfaces. |
| Rollout | **Big bang**: one integration branch, all sub-issues merged into it, reviewed and merged to `main` once. That is also one Vercel deploy (the Hobby plan rate-limits deploys). |

## Visual spec (*proposed values*)

### Palette

| Token (proposed) | Value | Use |
| --- | --- | --- |
| `--brand-blue` | `#1F4BB0` | Section surface, primary buttons on white, links on white |
| `--brand-blue-deep` | `#16378A` | Pill containers on blue, pressed states, footer band |
| `--brand-blue-soft` | `#E8EEFB` | Tinted panels and hover fills on white |
| `--brand-white` | `#FFFFFF` | Type on blue, white sections, active pill |
| `--brand-ink` | `#0B1A3A` | Body text on white (never pure black) |
| `--brand-muted-on-blue` | `#B9C8EE` | Secondary text and mono labels on blue |
| `--brand-muted-on-white` | `#5B6784` | Secondary text on white |
| `--brand-line-on-blue` | `rgba(255,255,255,.18)` | Hairlines on blue |
| `--brand-line-on-white` | `#D9E0F0` | Hairlines on white |
| `--brand-accent` | `#69E8D4` | Rare highlight only (a live dot, a focus ring on blue); at most one per view |
| `--brand-danger` / `--brand-success` | tuned to pass AA on both surfaces | Status text |

Contrast targets: body text AA (4.5:1) on its surface; white on `--brand-blue` must be verified (it is about 7:1 at the proposed value).

### Type

- Inter Tight, loaded with `next/font` (self-hosted at build, `display: swap`, Latin + Vietnamese subsets).
- Display: fluid, tight tracking (about -0.03em), weight 400–500, like the Cantor8 hero. Headlines are sentence case.
- Labels: Geist Mono, uppercase, `--text-xs`, tracking about 0.08em, often trailing ` ...`.
- Body: 16–18px, line height 1.5, max 70ch.

### Shape and components

- **Radius:** small (2–4px). No large rounded cards.
- **Pills:** a container in `--brand-blue-deep` with 4px inner padding; items are text; the active item is a white pill with blue text.
- **CTA with arrow tile:** a white box, blue text, and a square blue tile holding a pixel-style ↗ arrow (and the inverse on white). One primary CTA per view.
- **Sections:** full-bleed bands, `Section tone="blue" | "white"`, generous vertical rhythm, content in `Container`.
- **No** glass blur, glows, drop shadows, gradients or decorative emoji (`anti-patterns.md` still applies). Borders and spacing carry hierarchy.

### Motif and motion

- The ASCII sculpture keeps its six shapes, morph and wobble (`landing.md`). Only its colour ramp changes: from violet, blue and cyan to a ramp from `--brand-blue-deep` through `--brand-muted-on-blue` to white, so it reads as white line art on blue. The code backdrop is recoloured the same way. The blur and low-resolution issue in #6 is fixed in the same pass.
- Removed: aurora, twinkle field, grid cells, pointer parallax, glow text-shadows.
- Motion stays small and purposeful (`motion.md`). The blobatar's cursor-following eyes are the only new continuous motion, and they stop under `prefers-reduced-motion`.

### Nav detail

```
▐ Fuisloy        ┌ Home │ Venue │ Gallery │ Wishes ┐      ┌ Your invitation [↗] ┐
                 └──────┴───────┴─────────┴────────┘      └─────────────────────┘
signed in:                                                ┌ (◕‿◕) Linh      [↗] ┐
mobile:   ▐ Fuisloy                                                     [ Menu ]
```

- The centre links cover the guest-facing pages. The disposable camera lives under Gallery and Wishes as a secondary action, not a top-level link, to keep four items.
- The signed-in state reads the guest's name through the web BFF (the invitation cookie is `HttpOnly`, so the browser can't read it). The blobatar seed is a stable, non-secret value such as the guest id, never the token.
- The blobatar comes from `blobatar` and `@blobatar/react` (MIT, no dependencies, about 4 KB).

## Sign-off decisions (2026-10-01)

Owner sign-off on #153, applied in the "design-system sign-off fixes" PR:

| Topic | Decision |
| --- | --- |
| Content width | 1200px maximum inside brand sections (`--brand-content`). Bands stay full-bleed; reading text stays at 70ch. |
| Pills on white | `PillGroup tone="on-white"`: `--brand-blue-soft` container, blue text, active item solid `--brand-blue` with white text. The deep-blue container stays for blue surfaces. |
| Density | `Section density="airy"` (default, about 6rem desktop, 4rem mobile) and `"compact"` (about 3rem, 2rem) for forms, the invitation, RSVP and the gallery. |
| Logo | Compact "F" mark only in the header (desktop, mobile and the mobile sheet). The full wordmark appears only in the footer. |
| Footer | Deep-blue band (`Section tone="blue-deep"`) with the full logo (on-blue), the four links, "VGU graduation · Class of 2026", and a "Grad '26" label. The credits link is a `TODO(owner)` until a credits destination exists. |
| Mobile menu | Keep the text "Menu" pill. |
| Disabled `Cta` | Outlined: transparent fill, hairline border, muted label. Replaces `opacity: .6`. |
| Small fixes | `aria-disabled` (and no `href`) on a disabled `Cta` link; `BrandEyebrow` has no built-in bottom margin; `blue-deep` tone on `Section`. |

This resolves open question 4 (footer: blue-deep, with the content above).

## Open questions (decide during implementation, with the owner)

1. Landing structure below the hero: which sections (event facts, venue, gallery teaser, wishes teaser, credits) and in what order.
2. The graduation ASCII chapter (text wall and cap): keep and recolour, or drop under "one motif".
3. DecodeText entrance effects: keep only on the hero headline, or drop entirely.
4. Footer content (credits, links, the VGU mention) and whether the footer is blue or white.
5. Whether the pass and the invitation page keep their card layout or move to sections.

## Work breakdown

Epic **#142**. Sub-issues, in dependency order (GitHub records the "blocked by" links):

| # | Sub-issue | Depends on |
| --- | --- | --- |
| #143 | Brand tokens, palette and Inter Tight | nothing (start here) |
| #144 | `packages/ui` primitives: `Section`, `Cta`, `PillGroup`, `Eyebrow` | #143 |
| #145 | Site header, mobile menu sheet and footer | #144 |
| #146 | Guest chip with animated blobatar (two states) | #145 |
| #147 | Recolour the ASCII sculpture and code backdrop; fix the blur (#6) | #143 |
| #148 | Landing page `/` | #145, #147 |
| #149 | Gallery, guestbook and disposable camera | #145, #144 |
| #150 | Invitation, demo invitation, venue and pass | #145, #144 |
| #151 | `/ascii-live` | #145, #144 |
| #152 | `/guest/prototype` badge | #145, #143 |
| #153 | `/design-system` showcase (owner sign-off gate) | #144 |
| #154 | Rewrite the design docs | #143, #144 |
| #155 | Integration branch `refactor/blue-white-redesign`, QA and single release | all of the above |

Parallel tracks once #143 and #144 land: the header and chip; the sculpture and landing; the memories and guest pages; the experimental pages; the docs.

## Related issues

- #5 (minimal landing layout): superseded by this redesign.
- #6 (blurry ASCII background): fixed in the sculpture sub-issue.
- #10 (light theme): not planned; one fixed theme.
- #17 (web experience epic): sibling epic; About (#7) and language (#9) must use this language when built.
- #78 (mobile and accessibility pass): runs after the redesign lands.
- #139 (guest profile and avatar): the nav chip here uses the same blobatar component; the profile page stays in #139.
- #140 (guest guide-book): a future page that will be built in this language.
