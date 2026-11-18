# Landing and sculpture

The public root route (`/`) is a story page on the blue-and-white brand theme ([redesign-2026-10.md](redesign-2026-10.md)): the sculpture, one line, then the journey. This page documents `/` as shipped, plus the technical detail of the sculpture, the ASCII renderer and the experimental routes that share them. Treat it as the reference for future changes, not a changelog.

## Composition

Owner brief (2026-11): tell a story; the menu holds where to go. The layout was approved by the owner from wireframes, and is inspired in structure only by the GitHub Universe highlights section: no assets or colours are copied. It builds on the 2026-10 brief ("Too much information and text is being displayed, and information is duplicated everywhere. Put it in the menubar."), which still holds: nothing the menubar holds is repeated here.

`/` renders inside `BrandTheme` with `SiteHeader current="home"` (no nav item is current; the mark is the way home) and `SiteFooter`. Styles are route-local, brand tokens only: `apps/web/app/landing.css` for the hero and `apps/web/app/journey/journey.css` for the band. Sections, in order:

1. **Blue hero** (`Section tone="blue"`, airy). The hero fills the viewport (`100svh`, including the strip behind the overlaid header); the sculpture stage (`.home-visual`, never taller than wide, at least 280px, 160px at 960px and below) takes the height left over by the `Graduation ’26` headline and one line in the owner's voice (`landing.lead`, shown only once it is written; see "Placeholders never render"). The band below starts below the fold. No date, venue, countdown or calendar action: the menubar holds the event essentials.
2. **`the-journey/`** (`Section tone="white" density="compact"`, labelled by its heading, no bottom padding so the rows meet the footer). The heading is `--brand-text-h2` (below the hero's headline at every width) and reads `the-journey/` in both languages. Below, see "The journey". It renders only when at least one entry is ready; until then the same band is **`start-here/`** (see "Placeholders never render").
3. **Footer** (`SiteFooter`, deep blue, minimal).

The page is server-rendered and `force-dynamic`; it makes no API call of its own (the header reads `GET /event` for its essentials), so the band does not depend on the API. Removed in 2026-11: "Start here" and its four entry points (My invitation, Venue and calendar, Open camera, Wishes), which remain in the menu (owner decision). Removed in the 2026-10 pass: the mono meta block (campus, city, date, live countdown), the hero's "Add to calendar", the "When and where" band, and the gallery and wishes teasers (the gallery and wishes pages are the home of that content; `/memories` stays linked from the footer and the gallery). Earlier removals: the ASCII graduation chapter, the aurora, twinkle field, grid cells, pointer parallax, glow text-shadows, the animated VGU logo and the "Coming soon in November" sweep.

**No JavaScript on a phone.** The menu sheet needs JavaScript, so until it loads (or without it) a phone reaches only the Wall from the bar, and Memories, Accessibility and Credits from the footer, plus the `start-here/` links while they show. `/me` is not reachable from `/` in that state; invitation links open `/invite` directly and are unaffected. This follows from the owner's decision to move the entry points to the menu.

## Placeholders never render

The site is public before the owner has written the landing's words or added its media, so no template text reaches a guest. A value is a placeholder when it is empty or contains a `[bracketed]` part (`"[Date, place]"`, `"[Length] · English and Vietnamese captions"`, `"02_[first_year].jpg"`); `isPlaceholder` and `readyEntries` in `apps/web/app/journey/view.ts` apply the rule, and `ready.test.ts` covers it. Real copy must therefore not contain square brackets.

- **Lead.** `landing.lead` renders only when it is not a placeholder; otherwise the hero is the sculpture and the headline alone.
- **Journey entries.** An entry is ready when its filename, title, date line and story are written. The film also needs its video `src` and its screen-reader description (`.alt`); a chapter keeps only the photos that have a `src` and a written description, and needs at least one. The band shows the ready entries only, so the "to come" plates never show in practice.
- **`start-here/`.** With no entry ready, the band is labelled `start-here/` (both languages) and lists five links in the journey's row style (stripe, a thumbnail box with the pixel arrow, title and one line; two columns from 961px): The Wall (`/wall`), Guest guide (`/guide`), Venue (`/venue`), Live captions (`/live`) and ASCII Live (`/ascii-live`). Words are `landing.explore.*`. It disappears by itself once the first entry is ready; nothing in the journey code changes.

## The journey

A list of entries, each a mono filename (`01_the_film.mp4`, `02_presto.jpg`, ...), that opens one at a time: the film is first and open on load, then the photo chapters. Everything is in `apps/web/app/journey/`, route-local because nothing else uses it: `entries.ts` (the data), `view.ts` (data plus the page's language), `selection.ts` (the state, pure), `JourneyList.tsx` (the one client component) and `journey.css`. The number of entries is a data change only.

- **One DOM, two layouts.** Each row button is followed by its panel, inside an `ol` (`display: contents` on the items). Up to 960px the panel opens in place under its row. From 961px the same grid puts the rows in the left column and the one open panel in the right, spanning all rows; two equal columns divided by the panel's left hairline.
- **Row.** A stripe on the left edge, a thumbnail and a mono filename, at least 72px high (112px on desktop). Open: solid `--brand-blue` stripe, `--brand-blue-soft` fill. Closed: `--brand-blue-soft` stripe. One blue only. The button has `aria-expanded` and `aria-controls` on both layouts, and its name is the filename and then the title. As in the wireframe, one entry is always open: pressing the open row leaves it open.
- **Panel.** The video or photo on a 16:9 plate; up to four flashback buttons (`aria-pressed`, the photo's thumbnail, or its number while there is no photo) when the chapter has several; the title (`h3`) with `←` and `Next →` (secondary `Cta`s, desktop only, wrapping round the ends); a mono date and place line; a dashed hairline; the story. Photos use `object-fit: contain` on the `--brand-blue-soft` plate, so they are never cropped.
- **Empty media.** Kept for a chapter whose other photos are missing in a custom setup; the landing itself filters empty media out (see "Placeholders never render"). With no path set, the plate is a quiet bordered `--brand-blue-soft` box with a mono label ("Film to come", "Photo 2 of 4 to come"), and the row's thumbnail is a white box labelled Video or Photo. The layout is the same with or without media.
- **Film.** A native `<video>` with `controls`, `preload="none"`, `playsInline`, a poster and caption tracks in English and Vietnamese (the page's language is the default track). Nothing autoplays. Moving to another entry pauses it. If it fails to load, the plate says so.
- **Poor networks.** Photos go through `next/image` from `public/journey/`, so a phone gets a phone-sized file. All photos are `loading="lazy"` except the open entry's current one; hidden panels load nothing. The poster is one fixed 828px-wide optimized image. Plates and thumbnails have a fixed shape, so nothing shifts as they arrive. The default caption file is a small request on load; the video itself loads only when the guest presses play.
- **Without JavaScript.** Every panel and photo is in the HTML. `@media (scripting: none)` stacks them all as one column on any screen and hides the controls that need script. A browser too old for that query shows the first entry only. Until the script has loaded, the rows do nothing and the film stays readable.
- **Focus and scrolling.** `←` and `Next →` live in the panel they hide, so focus moves to the same control in the new panel and a status message announces the new title. On a phone, the panel above a tapped row may close: the page scrolls by the same amount, instantly, so the row stays under the finger.
- **Motion.** None: state changes are instant.

### What the owner fills in

Words, in `apps/web/lib/i18n/messages/en.ts` and `vi.ts` (the same keys in both; each is a `[bracketed]` placeholder until written, marked `TODO(owner)`, and nothing that depends on it renders until then):

| Key | What it is |
| --- | --- |
| `landing.lead` | The one line under the headline |
| `landing.journey.film.title`, `.date`, `.story`, `.alt` | The film: title, length line, introduction, and a short description for screen readers |
| `landing.journey.presto.*`, `.careerFair.*`, `.germany.*`, `.friends.*`, `.study.*` | Each chapter: `.title`, `.date` (date and place), `.story`, and `.photo1` to `.photo4` (what each photo shows, as alt text). Titles, dates and descriptions are prefilled as suggestions from the photos; a chapter shows once its story is written |

A blank line in a story (`\n\n`) starts a new paragraph.

Media, in `apps/web/app/journey/entries.ts` (each `TODO(owner)` is there):

- **Photos and poster:** put the files in `apps/web/public/journey/` and write the path, `"/journey/my-photo.jpg"`, in `src` or `poster`. A chapter shows at most four photos. Next.js resizes them, so export them around 2000px wide.
- **Film:** `src` is the video's URL, on whichever host is chosen; hosting is undecided, and video files do not go in the repo.
- **Captions:** two WebVTT files in `apps/web/public/journey/`, on the site's own host, because a browser refuses caption files from another host unless that host allows it.
- **Chapters and filenames:** add or remove a block in `JOURNEY_ENTRIES`, with its keys in both languages. No component changes. Rename `file` to match your years; it stays plain ASCII in both languages.

## Add to calendar

`AddToCalendar` (`apps/web/app/calendar/`, QA P1-3) is the one calendar block, on `/venue` and the personal `/invite` (and its notices). The landing no longer carries it (2026-10). It takes the links from `buildCalendarLinks` (`lib/calendar/links.ts`, built from the localized event) and shows:

- **The action**, "Add to calendar": a `Cta` whose target depends on the device (`lib/calendar/platform.ts`). Android (user agent or `userAgentData.platform`) opens Google Calendar in a new tab, because `webcal://` does nothing in Android Chrome; Apple devices (iPhone, iPad, Mac) subscribe to the `webcal://` feed so a changed time follows; everything else downloads the `.ics` file. The server render and the first client render use the `.ics` file, so it works without JavaScript and hydrates without a mismatch. `emphasis="primary"` where it is the view's main action (`/venue`), `secondary` on `/invite`, where the RSVP is.
- **The options**, under a mono label ("Or choose your calendar"): Google Calendar and Outlook (external), Apple Calendar (`webcal://`) and "Download .ics file", all secondary `Cta`s that wrap.

`show="action"` renders the action alone and `show="options"` the options alone under an "Add to calendar" label; no page uses either since the 2026-10 landing pass. The venue page's "Get the calendar invite by email" form (`CalendarEmailForm.tsx`) renders under the calendar options only for a guest with an invitation, and only while `GET /mail/status` says mail is on (ADR-012); otherwise the page shows the calendar options alone.

## Headline

`DecodeText` (`apps/web/app/landing-title/`) is used on the `Graduation ’26` headline only. It decodes once per page mount (80ms delay, 900ms), each letter position passing through ASCII noise glyphs (`#%&@*+=:./\<>[]`) before settling. Block and Braille glyphs were dropped because they fall back to another font whose oversized ink spilled outside the letters. Updates step at about 30fps. Every changing glyph is an absolutely positioned visual layer over an invisible original glyph, so the real typeface alone determines width and line height; each character layer uses `contain: paint` so nothing draws outside its cell. The `h1` carries the headline as its `aria-label` (`landing.title`: "Graduation ’26", in Vietnamese "Tốt nghiệp ’26", #9) and the decoded copy is `aria-hidden`; diacritics decode like any letter; hidden pages cancel the work and reduced motion shows plain text. Noise glyphs use `--brand-muted-on-blue`. The component also supports a repeating `sweep` variant; nothing uses it.

## Sculpture as the motif

The sculpture is white line art on blue: the ASCII shader's ramp runs from `--brand-blue-deep` through `--brand-muted-on-blue` to white, and dim cells are lifted by an alpha floor so they do not sink into the blue surface. It is the only signature visual in the brand language. Its code backdrop and static fallback use the same colours. All rules are in `apps/web/app/sculpture/sculpture.css`, brand tokens only.

## Sculpture

### Shapes & cycle

Six deterministic point sets (5,200 points each, `apps/web/app/sculpture/shapes.ts`), cycling in this order, each holding 5s and morphing over 1.5s:

1. **Laptop** ("Software Engineering") — upright screen with a bright perimeter, keyboard deck.
2. **Gradient-descent landscape** ("Gradient Descent") — a bowl-shaped loss surface with a descent path and three graph axes, anchored to the surface's true bounding corner so the frame actually encloses the terrain (an early version floated disconnected from the surface — fixed by deriving the corner and extents from the surface formula itself, not eyeballed constants).
3. **Cell tower** ("Electrical Engineering") — a triangular lattice tower on a square base, a dish mounted partway up one leg, a domed antenna with signal arcs on top. Replaced two earlier attempts (a lightning bolt, and before that a flat circuit board) that either didn't fit the rest of the set thematically or read poorly while rotating.
4. **Pipeline** ("Data Engineering") — database → transform → database, with directional chevrons.
5. **Candlesticks** ("Quantitative Finance") — bodies, wicks, a subdued order-book base, and a bright diagonal trend arrow riding above the candle highs, making the uptrend an explicit visual annotation instead of an implicit read of the candle data.
6. **Light bulb** ("Innovation") — a big, nearly-full glass globe with a zigzag filament, pinching through a short neck to a small, clearly separate threaded screw base. Replaced an AI/neural-networks concept (a Fibonacci-distributed node sphere) that didn't fit "innovation" as a category once the bulb was chosen for it.

### Shading

Each point's brightness (`SHADES`, precomputed once per shape) drives glyph density and color in the ASCII shader — this renderer has no literal alpha transparency, so brightness is the only lever for effects like "glass" or "glow."

- Default: a fixed directional formula (`0.48 - x·0.29 + y·0.26 + z·0.25`) gives every shape a consistent bright/shaded side, as if lit from the upper-left.
- **Gradient descent** gets a bespoke terrain-normal formula instead — the generic linear formula doesn't read as a lit 3D surface for a bowl shape.
- **Five parts across four shapes** get physically-derived shading keyed to their own curved-surface center (a fresnel rim — bright at the silhouette, dim center-facing — paired with a directional shadow) rather than the flat generic formula: the bulb's glass (plus a sparse glow-shell aura floating just outside it), the cell tower's dome (its signal arcs shaded as a matching glow shell), the database drums (cylindrical fresnel), the laptop screen (a backlight bloom, brightest at center), and the candlestick trend arrow's tip (a fading spark of glow). Parts without a real curved surface — legs, braces, base plates, candle bodies — keep the generic formula; fresnel math doesn't mean anything on a flat face.

### Motion

- **Rotation**: a wobble, not a turntable — `rotation.y` and `rotation.x` each follow their own slow sine oscillation, so the object never turns fully away from the camera. (A continuous-turntable version was tried first and reverted back to this.)
- **Idle motion**: every point gets a small continuous sine-driven shimmer (unique phase per point), running every frame including during the 5s hold, not just during morphs, plus a gentle whole-object breathing scale (±1.5%). Both intentionally subtle so a held shape stays readable.
- **Morph**: all 5,200 points share one synchronized progress value, eased with symmetric smoothstep (`t²(3-2t)`), plus a `sin(πt)`-driven outward scatter that peaks at the transition's midpoint. Two alternatives were tried and reverted: a per-point staggered reform (via a golden-ratio Weyl sequence, each point on its own delayed timeline) read as unsynchronized rather than lively; a restrained ease-out-back curve (fast departure, ~4% overshoot, clean settle) went back to smoothstep alongside it. Current state: fully synced, symmetric easing.

### Code backdrop

`CodeBackdrop.tsx` displays two short PyTorch-style fragments for each of the six shapes, in the same order as the sculpture cycle. The right fragment sits lower and starts typing 250ms after the left; both finish during the shape's hold. As soon as morphing begins, both retract character by character faster than they appeared, completing before the next shape arrives. The text sits behind the canvas in `--brand-muted-on-blue` at low opacity (16%), with function calls a little brighter (white at 30%); each side fades toward the sculpture's centre with a mask. It is decorative and hidden from assistive technology. Reduced motion and unavailable WebGL show the complete static fragments instead of typing.

## ASCII rendering

The scene renders normally, then passes through a two-stage GPU character renderer in `Sculpture.tsx`, adapted from ASCIIGen's live WebGL2 pipeline. The first stage runs at character-grid resolution: each cell averages a 3×3 neighborhood, tracks peak brightness, and stores one calibrated lightness value. The full-resolution second stage draws a font atlas using a 10-glyph ramp (space, then `.:-=+*#%@`, sparsest to densest). This avoids repeating nine source samples for every output pixel. Color follows that same blended lightness through a 3-stop gradient (`#16378A` deep-blue shadow → `#B9C8EE` muted-blue midtone → `#FFFFFF` highlight, stops at 0 / 0.4 / 0.8; redesign #147) — color follows lighting, not screen position.

- Device pixel ratio (`app/sculpture/dpr.ts`, #78): the canvas follows the device up to 3 (2 on devices reporting 4 or fewer cores or 2 GB or less of memory), and `FrameBudget` steps it down (3, 2, 1.5, 1) whenever the mean frame time over 90 frames is above 25ms; it never steps back up. Only the glyph pass runs at that ratio: the particle scene and the cell pass render at most at 2x (points are scaled to match), so DPR 3 adds one cheap full-screen quad rather than a 3x scene.
- Cells are whole device pixels (css cell × DPR, rounded), the grid is centred with the remainder left clear, and the draw pass reads the glyph atlas texel for texel from `gl_FragCoord` with nearest filtering, so every cell and glyph sits on the pixel grid at any DPR. Below 1.5x the atlas uses weight 500 and a contrast curve on its alpha, so 6×8px glyphs keep their shape instead of blurring. (Before #78 the atlas was sampled upside down, which turned `@` and `%` into other shapes.) The canvas uses normal blending (no `mix-blend-mode`) and there is no halo; grid cell size adapts for phones (6×8px) vs. desktop (7×9px).
- The glyph atlas uses the same self-hosted Geist Mono face as the page and is created only after the font is ready, avoiding platform-dependent `monospace` substitutions.
- The render loop pauses entirely when the document is hidden (`frameloop="never"`).
- A static ASCII motif ships in server-rendered HTML and stays visible whenever the canvas isn't: reduced motion, no WebGL, a render error, or WebGL context loss.
- **Loading (QA P1-4).** three.js is not in the landing's first load. The page server-renders `SculptureFallback` (the first shape's code backdrop and the ASCII motif, the LCP element) inside `LazySculpture`, which loads `Sculpture` with `next/dynamic` (`ssr: false`) only after the `load` event, an idle callback (at most 2.5s) and the hero being in view. It never loads under reduced motion, Save-Data (`navigator.connection.saveData` or `prefers-reduced-data`), when a WebGL context cannot be created, or when the only context is software-rendered (SwiftShader, llvmpipe: refused through `failIfMajorPerformanceCaveat` or recognised by the renderer name; `sculpture-gate.ts`, #78). Such a renderer draws every frame on the CPU and, with software compositing, reads it back on the main thread. Headless screenshot tools therefore need a GPU-backed browser to capture the canvas (Playwright's `channel: "chromium"`, not the default headless shell, which only has SwiftShader). The motif is a copy of the one in `Sculpture.tsx`, and a test keeps the two identical. First Load JS for `/` went from 370 kB to 123 kB, in line with the other pages.
- **Start-up in short tasks (#78).** Starting the sculpture used to block the main thread in long tasks: all module evaluation and the six point sets in one, the first frame's shader compile in another (about 790ms in one task on Lighthouse mobile with a software renderer). Now `LazySculpture` evaluates three.js, the React bindings and `Sculpture` in one task each (`yieldToMain` in `yield.ts`: `scheduler.yield()`, or a zero timeout). `shapes.ts` builds no point set at import: `prepareShapes` builds the six forms one per task before the canvas mounts, and the data is unchanged. `AsciiPass` compiles the particle, cell and glyph shaders with `compileAsync` while the frame loop waits (`frameloop="never"` until they are ready). Each shader is compiled for the target it draws to, because the target is part of three's program key. With `KHR_parallel_shader_compile`, the GPU process links them off the main thread. Lighthouse mobile on `/` (GPU-backed Chrome, medians of 5 or 6 runs): TBT 170ms to 50ms, score 88 to 89, LCP unchanged at 3.7s. With a software renderer, TBT went from 630 to 860ms down to 20 to 30ms, because the static motif now stays.

### Live camera

`/ascii-live` uses the pinned private `asciify` dependency rather than a copied renderer. Camera access is explicit and user-initiated; frames remain in the browser and are passed directly from a hidden video element to ASCIIGen's two-pass WebGL2 renderer. Leaving the route or pressing Stop releases every media track. Users can change the character matcher, cell-grid density, dark-background cutoff, mirror state, and source-color mode without restarting capture. The route reports permission, device, playback, and WebGL failures in place and does not depend on the event backend.

The route sits on the blue-and-white brand theme (`BrandTheme`, `SiteHeader`, `SiteFooter`, redesign #142): a blue title band, then a white section holding a deep-blue stage and a white controls panel. Its rules live in `apps/web/app/ascii-live/ascii-live.css`, brand tokens only. Choices use the on-white pill look, Start and Stop use `Cta`, and the renderer's `ink` is white (read from `--brand-white`) so the output is white on blue; source-color mode still shows the camera's own colours.

## About page

`/about` (#7) credits the developers. It renders inside `BrandTheme` with `SiteHeader` (no current item) and `SiteFooter`; styles are route-local in `apps/web/app/about/about.css`, brand tokens only. Sections: a blue hero (eyebrow, h1, one-line lead), a white "The team" band with one entry per developer, and a blue "Built in the open" band with the page's single primary `Cta` to the source repository.

- **Content.** GitHub handle (linking to the profile in a new tab), roles and a one-line bio, from `app/about/team.ts`, which follows "Roles and area owners" in `docs/development/workflow.md`. No names, emails or other personal data. Bios are drafts marked `TODO(owner)`.
- **Portraits.** Each developer gets a `--brand-blue` plate with a small mono `$ cat <handle>.txt` prompt and a 48x29 ASCII portrait in white, drawn from their public GitHub avatar with the sculpture's ramp (space, then `.:-=+*#%@`), so it reads as the same white-on-blue line art as the motif rather than a second one. `apps/web/scripts/ascii-portraits.mjs` generates `app/about/portraits.generated.ts` by hand (the build never fetches avatars). The font size is the plate width over cols x 0.6 (container query units), so a portrait always fits its plate: about 10px at 360px wide, never a horizontal scroll. Plates are `aria-hidden`; the handle beside them names the person.
- **Motion.** `PortraitReveal` prints each portrait once on scroll-in (`motion.md`); reduced motion and no-JS keep the static server-rendered art. It is the page's only client code.
- **Navigation.** About is not in the menubar, which keeps to the event. It is reached from the "Credits" link in the footer.

## Reference captures

Captures of the landing live in `docs/design/reference/`: `landing-desktop.png` (1440px wide) and `landing-mobile.png` (390px wide), full page. They predate the journey band and are worth retaking once the owner's content is in. They are stills of a live, animated page (2026-10 menubar pass, full-viewport hero) against `apps/web/scripts/mock-live-api.mjs` (24 October, VGU Campus, Main Hall), in a software-rendered browser, so the sculpture shows its static motif.

## Name badge

The guest's name badge is the hero of the guest portal (`/me`): a lanyard name tag that drops in with the guest's name printed on it. It began as the `/guest/prototype` design (#152) and is now one reusable component in `apps/web/app/guest/badge/`; `/guest/prototype` shows it with demo data ("Your name", `PREVIEW`), and so does `/me` before an invitation is opened.

**What the card prints** (`card.ts`, built on the server by `lib/profile/badge.ts` in the page's language): the event mark (`VGU`, `GRAD / 26`) in the top corners; the pass QR in the middle (`GET /pass`, the signed pass, never the invitation token), or the static ASCII artwork without a pass; the given name large in Inter Tight (#170), shrunk to fit and then cut with an ellipsis; the full name in mono capitals below when it differs; a rule; the role (`GUEST`) and the date (`21 NOV 2026`, in the event's time zone) on one line, the campus below; and the owner's line `SAME PEOPLE. A BRIGHTER YOU.` at the foot. The data has no relation to the graduate, so the card prints none; who invited the guest is in the text beside it. Nothing else of the guest's is printed: no email, phone or token.

**Look.** A thin white card with blue and ink print and a narrow `--brand-muted-on-blue` metal edge, on a plain `--brand-blue` stage (`BadgeStage`, no aurora, twinkle, grid or parallax) that runs up behind the header, so the lanyard hangs from just under it. The two environment light strips are white, `--brand-blue-soft` and `--brand-muted-on-blue`. The single-colour white lanyard prints `GRADUATION '26` in blue, in the correct reading direction. Three.js cannot read CSS variables, so `BadgeCanvas.tsx` mirrors the token hex values in one `BRAND` map with a comment naming each token. The card texture prints with the page's own faces (`--font-sans`, `--font-mono` read from the DOM, repainted once `document.fonts` is ready), so Vietnamese names keep their diacritics; it is painted synchronously before the first frame, and the QR is drawn module by module from its matrix, so no image is ever decoded into the texture. From 961px the badge hangs at 86% of the stage width with the text on the left (camera at z 8); below that it is centred above the text (z 7, so the card is legible in a 420 to 560px stage).

**The CSS badge** (`BadgeFallback.tsx`, `badge.css`, brand tokens only) is a print of the same card: a white strap, a deep-blue clip and the white card, laid out in texture pixels (`--u`, one pixel of the 1024 x 1454 face, in container units of the stage), hanging exactly where the 3D card comes to rest. It is server-rendered, so it is the first paint, and it stays under reduced motion, Save-Data, on low-power devices (two or fewer cores, or 2 GB or less), without WebGL or with only a software renderer (the sculpture's gate, `sculpture-gate.ts`), after a render error, while the context is lost, and while the bundle loads. The pass QR streams into it through Suspense: the page starts `loadPassArt` and never awaits it, so neither the first paint nor the RSVP action waits on the pass. `BadgePlaceholder` is a blank card for `/me`'s loading state.

**Loading.** `NameBadge` mounts the canvas only after the `load` event, an idle callback (at most 2.5s) and the badge being on screen, then loads three.js, the React bindings and Rapier with `next/dynamic` (`ssr: false`), one module graph per task. The wrapper is one `role="img"` named for the guest ("Name badge for {name}, guest at GRAD '26."; the interactive version adds "Drag the badge to swing it."); the CSS badge inside is `aria-hidden`, and the page's heading is a visually hidden `h1`.

**Physics.** Three Rapier rope joints and a spherical card joint, following the Vercel badge reference: the bodies start level with the anchor and the card swings down into place (the drop). A fixed 1/60-second step, gravity `-40`, damping `2`, a `0.25` front-facing rotation correction with angular velocity clamped to ±10, and distance-based smoothing of the middle joints (speed range `10–50`). The canvas spans the stage so pointer drags can reach its edges. The clock is drained when the canvas is created and again when the badge becomes visible, so a long load or a background tab cannot hand Rapier a burst of catch-up steps. Physics and rendering pause in a hidden tab and while the badge is scrolled out of view; a hidden tab also drops any drag in progress. On phones the canvas is `touch-action: pan-y`, so a vertical swipe scrolls the page (and cancels a drag) while a sideways drag still swings the card.

## Share story card

Once a guest has said they are attending, the guest portal (`/me`) has a "Share that you're coming" band: a 1080 x 1920 story card for Instagram and Facebook (owner request, 2026-10-31). It is drawn on a canvas in the browser (`lib/share/story.ts`, `lib/share/draw.ts`, `app/me/_components/StoryShare.tsx`), in the page's language:

- **Layout, top to bottom:** the mono mark `GRAD '26` and `FIG_001` on the dot grid; a mono eyebrow ("VGU graduation · Class of 2026"); the title ("I'll be at GRAD '26") in Inter Tight, shrunk to one line (two smaller lines only as a last resort, `GRAD '26` never split); FIG_001 with its labels; then When (date, time), Where (venue, address) and Invited by (the inviting graduates) as rule, mono label and value rows; the public site host and `(C) 2026` at the foot.
- **What it never carries:** the guest's name, the invitation link or the pass. The site line is the public origin's host.
- **Motion:** the figure's walkers and river current on a 6-second loop (the current at 12s per pass with six dots, so the set repeats every 6s). The on-page preview loops; under reduced motion it is one still frame. The exported video always loops.
- **Sharing:** the MP4 (H.264, 30 fps) is recorded once, in the background, when the card first scrolls into view, because the share sheet needs a fresh tap. Where the browser can share files (phones), "Share video" opens the system share sheet, where Instagram and Facebook offer Story, Reel or post; elsewhere it is "Save video". "Share picture" shares or downloads a PNG of the same card. Browsers that can only record WebM (Firefox) get the picture only: Instagram and Facebook reject WebM.
- **Gates:** shown only when the RSVP is attending, the event loads, and the venue is the hall FIG_001 draws (`DRAWN_VENUE`, `figures.md`).


### Photos

The owner's originals live in `photos/<CHAPTER>/` at the repository root, which git ignores. The published copies are in `apps/web/public/journey/<chapter>/01.jpg` to `04.jpg`: auto-rotated, at most 2048px on the long side, sRGB JPEG at quality 80, with every metadata block removed (EXIF, including GPS, XMP and IPTC). A folder's `headline` image is photo 1, which is also the row thumbnail; the rest follow by date.
