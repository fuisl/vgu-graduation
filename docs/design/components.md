# Component Foundations

The shared UI package begins deliberately small. Components earn their place through reuse. Live showcase of the brand primitives, site shell and guest chip: `/design-system`.

## Brand primitives

Exported from `@grad/ui` (`packages/ui/src`), styled in `packages/design-tokens/src/brand.css` under `[data-theme="brand"]`, brand tokens only. Render them inside `BrandTheme`.

### `BrandTheme`
Root of the theme: `<div data-theme="brand">`. Every guest-facing route wraps its page in it. Admin and docs do not.

### `Section`
Full-bleed band. Content sits in `.brand-section-inner`, capped at 1200px (`--brand-content`). Text colours follow the tone.
- `tone`: `"blue"` (hero, feature bands, calls to action), `"white"` (reading, forms, lists) or `"blue-deep"` (the footer band).
- `density`: `"airy"` (default, about 6rem desktop / 4rem mobile) or `"compact"` (about 3rem / 2rem) for forms, the invitation, RSVP, the gallery and the footer.
- `narrow`: a reading-width inner column, for forms and short text.
- `id`, `aria-labelledby`: label the landmark by its heading.

Pages alternate blue and white bands. Do not nest a `Section` in a `Section`.

### `BrandEyebrow`
Mono uppercase label. Colour follows the surrounding tone. `ellipsis` appends ` ...`. It has no built-in bottom margin; the layout spaces it. Use one above a section heading or for a metadata line ("When", "Venue and time").

### `Cta`
The call to action. `tone` is the surface it sits on: `"on-blue"` renders a white box, `"on-white"` a blue box.
- `variant="primary"` (default): filled box with an arrow tile (`ArrowUpRightPixel`). One per view.
- `variant="secondary"`: outlined (transparent fill, 1px border, text follows the surface), 44px minimum, no tile. For supporting actions such as "Back to gallery", "Close" and calendar options.
- `href` renders an anchor, otherwise a button (`type`, `onClick`). `aria-label` names icon-only labels. `tabIndex` is passed through.
- `external` (with `href`): `target="_blank" rel="noopener noreferrer"`, a visually hidden "(opens in a new tab)" and the arrow (also on secondary).
- `icon`: replaces the arrow in the tile. The only other icon is `PaperPlanePixel`, for send actions (the venue page's "Send invite").
- `disabled`: outlined and muted on both variants. A disabled link renders without `href` and with `aria-disabled="true"`.

### `PillGroup`, `PillItem`, `PillToggle`
Segmented control. `tone` is the surface: `"on-blue"` (default) is a deep-blue container with a white active pill; `"on-white"` is a soft-blue container with a solid blue active pill.
- Navigation (default): `<PillGroup label>` renders a `nav`; `PillItem` links take `current` (`aria-current="page"`).
- Toggle: `<PillGroup as="toggle" label>` renders a `role="group"`; `PillToggle` buttons take `pressed` (`aria-pressed`) and `onClick`. It wraps on narrow screens. Give a `PillToggle` an `aria-label` when its text is a single letter.

The gallery filters, card size and layout, and the `/ascii-live` character set are `on-white` toggles. The site header navigation is the only `on-blue` navigation.

### `ArrowUpRightPixel`
Pixel-style up-right arrow on a 7x7 grid, decorative (`aria-hidden`). Used by `Cta` and the signed-in guest chip; rarely needed directly.

### `PaperPlanePixel`
Pixel-style paper plane for send actions, decorative (`aria-hidden`): the "send" icon from [pixelarticons](https://pixelarticons.com) (MIT). Pass it to `Cta`'s `icon`. It is drawn 1.25em because its pixels are finer than the arrow's. Do not add other icons to `Cta` without design review.

## Site shell (`apps/web/app/site`)

App-level, not in `@grad/ui`. Every brand page renders `<SiteHeader current="…" />` first and `<SiteFooter />` last, inside `BrandTheme`.

- **`SiteHeader`**: a blue, non-sticky bar, 72px high. Left: the compact "F" mark (`BrandLogo variant="compact"`) linking to `/`. Centre: a `PillGroup` labelled "Main" with the four links from `nav.ts` (`SITE_NAV`: Home, Venue, Gallery, Wishes). `current` (`"home" | "venue" | "gallery" | "wishes"`) marks the active page; omit it on pages that are not in the list. Right: the `action` slot, which defaults to `GuestChip`. The disposable camera (`/polaroid`) is a secondary action on Gallery and Wishes, not a fifth link. It is a server component; only the mobile sheet is client code.
- **`MobileMenu`**: at 960px and below, the centre links and the action are replaced by a "Menu" text button that opens a full-screen blue dialog (`role="dialog"`, `aria-modal`): the "F" mark, a "Close" button, the four links as large rows (the current one in the accent colour) and the action at the bottom. Escape or Close returns focus to the Menu button, focus is trapped inside the sheet, body scroll is locked while open, and it closes when the viewport grows past 960px or a link is chosen.
- **`GuestChip`**: the two-state right-hand pill. Signed out: a `Cta` "Guest portal" to `/me` (`SignedOutChip` in `SiteAction.tsx`), which explains how to open an invitation. Signed in: `SignedInChip`, a pill with the guest's blobatar, given name and the arrow tile, linking to the guest profile `/me` (#139), which links on to the invitation. It renders signed out on the server and until `GET /api/me` answers, so there is no layout shift and the page never waits on it. `/api/me` reads the `HttpOnly` invitation cookie server-side and returns only `{signedIn, givenName, avatarSeed}` (the seed is the guest id, never the token), always with status 200 and `Cache-Control: private, no-store`. `givenName` is the guest's `givenName` from `GET /invitations/me` (#170), so "Nguyễn Văn An" shows "An" and "John Smith" shows "John".
- **`GuestAvatar`** (`guest-avatar/`): the animated blobatar (`@blobatar/react`). Pass a stable non-secret `seed`; pass `label` only when no visible name sits beside it. Eyes follow the pointer (see `motion.md`); `followTouch` (the large profile avatar only) also follows the last touch on phones (`touch-gaze.ts`). The idle animation pauses while the tab is hidden. **`StillAvatar`** is the same face as a static `<img>` with no motion code, for small faces in lists (who invited the guest).
- **`SiteFooter`**: a `Section tone="blue-deep" density="compact"` band: the full wordmark (`BrandLogo variant="full"`, the only place it appears), a "Footer" nav with the same four links plus "Memories" (the curated archive, footer only), "VGU graduation · Class of 2026" and a "Grad '26" label. The credit line ends with a "Credits" link to `/about` (#7). An "Accessibility" link (`/accessibility`, #176) sits beside the Credits link.
- **`TextSizeControl`** (`text-size/`): a toggle `PillGroup` labelled "Text size" with Default, Large and Largest (#176). It sets `data-text-size` on `<html>`, which `globals.css` maps to a root font size of 100%, 118.75% or 137.5%; every brand size is in rem, so type, spacing and controls scale together, and fixed-pixel chrome (the 72px header, 44px targets) stays put. The choice is remembered per device in `localStorage` (`grad26.textSize`) and applied before first paint by an inline script in the root layout. It sits on `/accessibility` (on blue) and the guest profile (on white). Checked at 360px on every brand page at the largest step: no horizontal scroll (the landing hero's mono block stacks). No overlay widget (`anti-patterns.md`).

## Guest pages (`/me`, `/guide`, `/accessibility`)

- **`/me`, the guest profile (#139):** a blue band with the large animated blobatar (seeded by guest id), the given name, the full name and the RSVP state, one primary `Cta` to the invitation; then a white compact band with "Invited by" (still avatars), "Your day" quick links as large rows (invitation, venue, guide-book, live captions, gallery, wishes, disposable camera, accessibility), the text size control and the pass (`PassBadge`, reused from `/invite`). The header chip links here in both states. Without a cookie it explains how to open an invitation; a revoked, expired or unreachable invitation gets the matching notice (`GuestNotice`), with public links only. Personal, so `noindex` and `no-referrer`.
- **`/guide`, the guide-book (#140):** linked from the profile and the invitation, not the top nav. A blue band says who tailored it (the inviting graduates) or that these are the defaults; the white band has category filter pills (`PillGroup as="toggle" tone="on-white"`, only categories with items) and one card per place with category, title, description, time hint and an "Open in Maps" secondary `Cta` (external). Filtering is client-side, so a loaded page keeps working offline; the BFF revalidates the guide every 300s and serves the cached copy while the API is unreachable. Loading, empty, error and signed-out states.
- **`/accessibility` (#176):** venue access, live captions, how to ask for help, the organizer contact from `GET /event`, and the text size control on a blue band. Venue facts are drafts (`TODO(owner)`).
- **`BrandLogo`** (`logo/BrandLogo.tsx`): the Fuisloy pixel logo. `variant="full" | "compact"`, `tone="on-blue" | "on-white"` names the surface it sits on (the on-blue files turn the dark blocks white). Size it from the parent.

## Legacy primitives

Kept for admin and non-brand pages; not for brand pages.
- `Container`: horizontal gutter and max-width behaviour (`--wide`). Brand sections use `Section`'s inner width instead.
- `Eyebrow`: neutral mono label (use `BrandEyebrow` on brand pages).
- `Rule`: structural divider.
- `Button`: solid and outline actions with a minimum 44px target (use `Cta` on brand pages).

## Rules
Prefer composition over card proliferation. Components expose semantic variants, not arbitrary styling knobs. Product-specific behaviour stays outside primitives. Every interactive primitive must remain keyboard-accessible and respect reduced motion. A new primitive needs design review (`docs/design/llm-reference.md`).

### Browser UI colour (`ThemeColorSync`)

`SiteHeader` renders `<meta name="theme-color" content="#1F4BB0">` (React hoists it into `<head>`) and `ThemeColorSync`, which keeps the browser's toolbar tinted like the section under the top edge while scrolling. It reads the background of the first opaque element at the viewport's top edge, at most once per frame and only when it changes, and writes it to the meta tag (Chrome on Android, Safari 15–18) and to `body.style.backgroundColor` inline (Safari 26 ignores `theme-color` and tints from the page, re-reading only inline body styles). Both are reset when a brand page unmounts, so admin and docs keep their own colours. Nothing to do per page: any page with `SiteHeader` gets it.
