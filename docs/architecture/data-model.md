# Initial Data Model
The schema lives in `apps/api/src/db/schema.ts` (Drizzle); migrations in `apps/api/drizzle/`. Status columns are text with CHECK constraints.

Core concepts:
- `User`: internal graduate/admin.
- `AdminAccount`: admin access by lowercased GitHub handle (#119). `status` is `pending` (filed by a first sign-in), `approved`, `rejected` or `revoked`, with `decided_by`/`decided_at` for the owner's last decision. Checked on every `/admin` request. Owners (`apps/api/src/modules/admin/owners.ts`) are always admins and can't be changed from the dashboard.
- `Guest`: external invited person. `name` is the full display name; `given_name` (what the guest is called by), `family_name` (nullable) and `name_reviewed` follow the name rules below (#170).
- `Invitation`: personalized pass with high-entropy bearer token; store a hash where practical.
- `InvitationInviter`: many-to-many relation for joint invitations.
- `RSVP`: attendance state.
- `RsvpAccessibility`: optional accessibility needs stated with an RSVP (#176), one row per RSVP while anything is set. Sensitive; see below.
- `Photo`: original + derivatives, contributor and moderation state, and `is_public` for the curated public gallery (#75).
- `Wish`: message with moderation/display state, and `is_public` for the curated public set (#75).
- `PrintJob`: one requested print of a photo (#72), queued durably for the venue printer daemon.
- `GuideItem`: one place or thing to do around campus for the guest guide-book (#140); `InvitationGuideItem` picks a subset per invitation.
- `TranslationSegment`: one finalized source-language sentence (`en` or `vi`) from the translation service, never revised, with a gapless per-session `sequence` (unique with `session_id`) so clients refetch missed segments by sequence.
- `TranslationText`: one translation of a segment into `de`, `en` or `vi` (unique per segment and language). `status` is `draft` (fast, replaceable), `final` or `failed` (shown as "translation unavailable"; `text` may then be null). `provider` records which backend produced it, since local-GPU and cloud providers are swappable.
- `Job`: worker queue row (`queued` → `running` → `succeeded`/`failed`) with attempts and `run_at`, polled with `FOR UPDATE SKIP LOCKED`. Payloads hold ids only.
- `Audit`: append-only admin/service action log (actor, action, target). No tokens or guest PII in metadata.

Photo and wish lifecycle: content is shown without pre-review. `moderation_status` is `visible`, `hidden` (reversible) or `removed` (takedown on request). Photos also carry `processing_status` (`pending` until derivatives exist) and a random `public_id` used in derivative URLs; originals are keyed separately and never served.

Wishes (#61): a guest posts one with their invitation credential (`POST /wishes`); `author_name` defaults to the guest's name and the body is 1 to 1000 characters after trimming (contract and CHECK). One invitation may post at most five wishes per ten minutes (`429` with `Retry-After`), on top of Traefik's per-IP limit. `GET /wishes` is public and lists `visible` wishes only, newest first; `GET /admin/wishes` lists every state so a hidden wish can be restored; `POST /admin/wishes/{id}/moderate` sets any of the three states and writes a `wish.moderate` audit row (`from`/`to` only) when the state actually changes. Every state change also sets `updated_at`.

`updated_at` on `photos` and `wishes` is maintained by a database trigger (`set_updated_at`, migration `0003`) on every `UPDATE`, whatever the writer passes. The live display feed polls on it (`use-cases.md` §6.2), so a writer can't forget it.

Moderation queue (#64): there is no approval step (owner decision 2026-09-30), so the "queue" is the admin listings of every state. `GET /admin/media` (filters `status`, `processing`, `isPublic`) and `GET /admin/wishes` (filters `status`, `isPublic`) list everything, newest first; `GET /admin/media/{publicId}/{variant}` previews any processed photo, hidden ones included, for admins only and never cached. Photo moderation now matches wishes: setting the state an item already has is a no-op and writes no audit row. Moderation and public-flag responses carry `revalidateTags`, the web cache tags that went stale (`CACHE_TAGS` in `packages/contract/src/common.ts`: `gallery`, `gallery-public`, `wishes`, `wishes-public`). The API cannot reach the Vercel cache, so the admin UI's Server Action calls `revalidateTag` for each.

The admin UI for this is `/admin/moderation` (#64, #75): photos and wishes tabs, filters (New, Processing for photos, Visible, Public, Hidden, Removed), Show / Hide / Remove and a Public toggle on each card, applied optimistically and rolled back if the API refuses. The Server Actions live in `apps/web/app/admin/queue-actions.ts` and map `revalidateTags` to the web's tags with `webTagsToRevalidate` (`apps/web/lib/api/cache-tags.ts`; the listings fetch under the same `CACHE_TAGS` strings). Previews of any state go through `GET /admin/preview/{publicId}/{variant}` on the web app, which streams the admin derivative endpoint with the session as a Bearer header (`private, no-store`), so the session token never reaches browser code.

## Given and family name (#170)

`guests` and `users` (graduates) carry `given_name` (not null), `family_name` (nullable) and `name_reviewed` next to the full `name`. `GET /invitations/me` exposes `guest.givenName`, which the header chip uses. Admins set both fields on create (`guestGivenName`/`guestFamilyName`, or `givenName`/`familyName` for graduates) and edit them with `PATCH /admin/invitations/{id}` and `PATCH /admin/graduates/{id}`; explicit names are stored as reviewed.

When only a full name is known, it is split by `splitPersonName` (`packages/contract/src/names.ts`) and left `name_reviewed = false` for an admin to check. Migration `0005` backfills existing rows with the same rules in SQL (`split_person_name`), and a `BEFORE INSERT` trigger applies them to any row inserted without a given name. The rules, on the NFC-normalised name with whitespace collapsed:

1. One word: the given name; no family name ("Madonna").
2. Two words whose last word is one of the 16 most common Vietnamese family names: a Vietnamese name written in Western order ("Mai Tran": given "Mai", family "Tran").
3. The first word is a common Vietnamese family name (about 40 of them, with or without diacritics, any case): Vietnamese order, called by the last word ("Nguyễn Văn An": family "Nguyễn", given "An").
4. Otherwise Western order: first word given, last word family ("John Smith": given "John"; "Ann Nguyen": given "Ann").

Middle names are not stored separately; `name` keeps the full form. The two surname lists live in `names.ts` and the migration and must stay in sync.

In the admin (`/admin/graduates`, `/admin/invitations`), the create forms prefill given and family name live from the full name with `splitPersonName`; the admin can overwrite them, and a submitted given name is sent explicitly, so it is stored as reviewed (without JS the fields stay empty and the API's unreviewed split applies). Unreviewed rows carry a "Check name" badge and a "Names to check" filter (`?names=review`); "Looks right" sends `{ nameReviewed: true }`. Each graduate and invitation has an edit page (`/admin/graduates/{id}`, `/admin/invitations/{id}`) whose PATCH carries only the fields that changed; a change to any of the three name fields sends all three, so the API never re-splits a reviewed name, and saving an unreviewed name unchanged confirms it.

## Accessibility needs (#176)

A guest may add structured needs to their RSVP: `wheelchair`, `stepFreeAccess`, hearing (`captions` for captions or live translation, `seatNearSpeakers`), vision (`largePrint`, `visionAssistance`), seating (`seatNearFront`, `aisleSeat`), `companion` (a companion or assistant who sits with them) and a free-text `note` of at most 500 characters. They live in `rsvp_accessibility`, one row per RSVP and only while something is set: sending all flags false and no note deletes the row, and deleting the RSVP cascades.

This is health-adjacent personal data, so:

- **Who reads it.** The guest themselves through `GET /rsvp` and the `PUT /rsvp` response (both `no-store`), and admins through `GET /admin/rsvp/accessibility` (with counts over attending guests on active invitations). It is deliberately not part of `GET /invitations/me`, which the web layer caches, nor of `GET /admin/rsvp` or `GET /admin/invitations`.
- **Writes.** `PUT /rsvp` with `accessibility` omitted keeps what is stored, so an RSVP form that doesn't show the section can't wipe it; `null` clears it.
- **Logs and audit.** Never logged (the logger also redacts any `accessibility` field) and never put in audit metadata.
- **Admin view.** `/admin/accessibility` ("Access needs") shows the counts grouped for the venue staff (mobility, hearing, vision, seating and companions), the attending guests with their needs, party size and note, and, collapsed, those who declined. It renders per request (`Cache-Control: no-store`), keeps nothing in the URL, carries a "sensitive, delete after the event" notice, and prints without the admin chrome for the venue team.
- **Retention.** Covered by the guest-data decision in `docs/product/principles.md` §8 (the organizing team owns it; deletion on request is a manual admin action), with one narrowing decided 2026-10-19: these needs only matter for the ceremony, so they are not part of the four-year archive. The team deletes them after the event (`DELETE FROM rsvp_accessibility;`, in the event runbook), or per guest on request. A guest can clear their own at any time by sending `accessibility: null`.

## Curated public gallery (#75)

`photos.is_public` and `wishes.is_public` (default false) mark the subset moderators chose for the after-ceremony public archive. `POST /admin/media/{publicId}/public` and `POST /admin/wishes/{id}/public` with `{ "isPublic": true | false }` set it; flagging needs a visible (and, for photos, processed) item, un-flagging always works, and each change writes a `photo.public` or `wish.public` audit row (`from`/`to`). `GET /gallery/public` and `GET /wishes/public` list only items that are visible **and** public, with the same item shape, pagination and caching as `GET /gallery` and `GET /wishes`; images still come from the derivative endpoint and originals are never exposed. Hiding or removing a public item keeps its flag but drops it from the public listings until it is visible again.

`GET /gallery` and `GET /wishes` stay public as decided on 2026-09-30. If the owner later closes them to guests only, anonymous pages should switch to the curated listings, which is what they exist for.

## Print queue (#72)

`print_jobs` is the durable queue for the venue printer daemon (experimental), separate from the worker's `jobs` table because the daemon pulls over HTTP. A job references the photo by row id and records who asked (`requested_by_admin` or `requested_by_invitation_id`), `copies` (1 to 5), `attempts`, `lease_expires_at`, `error` and `completed_at`.

- `POST /print/jobs` queues a job for a visible, processed photo. Admins may ask for up to five copies. Guests may ask only when `PRINT_GUEST_REQUESTS_ENABLED=true` (default off): one copy, at most three jobs per invitation per hour (`429` with `Retry-After`), counted under a row lock on the invitation.
- `GET /internal/print/jobs/next` (service token `printer`) claims the oldest `queued` job with `FOR UPDATE SKIP LOCKED`, marks it `printing` with a five-minute lease and returns the derivative's `imageUrl` (`/media/{publicId}/display`). A job whose photo was hidden or removed since is failed instead (`print.skip`).
- `POST /internal/print/jobs/{id}/done` records `done` or `failed` (with the daemon's error, at most 500 characters). A late report on a job whose lease ran out is still accepted, so a printed job is not printed again.
- Leases that run out put the job back to `queued`; after three claims without a report it is `failed`. This is settled before every claim and admin listing, so no timer is needed and nothing is lost while the API or the daemon is down: the queue just waits.
- `GET /admin/print/jobs` lists jobs newest first with counts by status; `POST /admin/print/jobs/{id}/retry` puts a failed job back.
- Admin UI (#74): "Print…" on a visible, processed photo in `/admin/moderation` queues 1 to 5 copies; `/admin/print` shows the counts and jobs, polls every 5 seconds while the tab is visible (backing off with jitter up to a minute after failures), retries failed jobs, and says "Printer offline or queue waiting" when a job has sat queued for two minutes with nothing printing. Guest print requests are not in the web UI yet.
- Audit: `print.create`, `print.complete`, `print.skip`, `print.retry`. Metadata carries ids, copies and results only.

## Guest guide-book (#140)

`guide_items` is the catalogue: `title`, `category` (`photo-spot`, `food-drink`, `explore`, `relax`, `practical`), a short `description`, an optional https `map_url`, an optional `time_hint`, `sort_order` and `active`. Migration `0005` seeds ten draft items for the Ben Cat campus, each marked `TODO(owner)` in the SQL for review; their descriptions are generic on purpose.

`invitation_guide_items` holds the items the graduates picked for one invitation. `GET /invitations/me/guide` returns the picked items that are still active (`tailored: true`), or every active item when there are none (`tailored: false`), with `Cache-Control: private, max-age=300`. Admins manage the catalogue with `GET`/`POST /admin/guide/items` and `PATCH`/`DELETE /admin/guide/items/{id}`, and the picks with `GET`/`PUT /admin/invitations/{id}/guide` (an empty list means the defaults). Deactivating an item hides it everywhere but keeps the picks; deleting it removes them. Every write is audited (`guide.item.create`, `guide.item.update`, `guide.item.delete`, `invitation.guide.set`).

In the admin, `/admin/guide` lists the catalogue in sort order with add, edit (sort order is a number field: lower comes first), one-tap show/hide and delete behind a confirm step. Each invitation's page (`/admin/invitations/{id}`) has the picks as select-item cards, each marked when the guest sees it now; "Use the defaults" sends an empty list. A guest's open guide follows a change within its five-minute cache.

Never put sensitive data in public slugs, analytics, client logs or URLs beyond the necessary invitation credential.
