# Archive and yearbook

The mission includes a four-year memory archive (`product/vision.md`). This page
says what the archive is, how to export it, how to bring it back on a spare
machine from git plus backups, how to prove a restore worked, how long it is kept
and what the yearbook is (#77).

## 1. What the archive is

| Part | Where it lives | In an archive export |
| --- | --- | --- |
| Database | CloudNativePG `grad-db`, database `grad` (locally: compose Postgres, `grad26`) | `db.dump` (`pg_dump` custom format) and `db-counts.tsv` |
| Originals | Garage bucket `grad-originals`: full-resolution uploads, never served | `buckets/grad-originals/` |
| Derivatives | Garage bucket `grad-derivatives`: the resized, metadata-stripped variants the site serves | `buckets/grad-derivatives/` |
| Offsite copy | nightly `rclone` mirror of the buckets, encrypted client-side, on nhientruong04's server (ADR-005, `architecture/target/data-and-storage.md` §5.3) | the export itself is copied there too |
| Code and configuration | this repository and `fuisl/vgu-graduation-deployment` (manifests, SOPS secrets) | `ARCHIVE.txt` records the app commit and latest migration |

Not in it: `grad-backups` (Postgres base backups and WAL; the dump replaces them),
the age private key (held offline per ADR-008; it is what decrypts both the
SOPS secrets and an encrypted export), Vercel settings (recorded in
`architecture/target/networking-and-setup.md` §8.3) and raw invitation tokens,
which are never stored anywhere (only their hashes).

Because every piece is either in git or in this export, the archive can be
re-hosted anywhere without redesign (`architecture/target/use-cases.md` §6.3).

## 2. Retention and privacy

Decided 2026-09-27 (#82, `product/principles.md` §8) and applied here:

- **Owner.** The organizing team owns the archive and is responsible for it. Only
  the owners (`fuisl`, `nhientruong04`) hold exports.
- **Retention.** Four years from the ceremony date. There is no automatic expiry:
  at the end of the period an owner deletes the buckets, the database, the offsite
  copy and every export, and records that in the runbook. TODO(owner): decide
  whether a curated public yearbook (section 6) outlives the four years.
- **Contents are personal data.** An export holds guest names, emails, phone
  numbers, RSVPs and notes (including anything sensitive a guest typed, such as
  accessibility needs), every photo and every wish. Keep plaintext exports only on
  the machine that made them; anything that leaves it is encrypted with age
  (`ARCHIVE_AGE_RECIPIENT`). The scripts refuse to write an export inside the
  repository, never print object keys or row contents, and set private file modes.
- **Takedown reaches the archive.** A takedown (event runbook) deletes the photo or
  wish from the database, both buckets and the offsite mirror. Exports made before
  it still hold the item, so after a takedown make a new export and delete the
  older ones. Keep at most two exports at a time (the newest and the one before).
- **Consent.** Guests were told at upload that items may be kept in the four-year
  archive (`product/principles.md` §8); nothing beyond that notice is assumed, so
  the yearbook uses only the publicly displayed set (section 6).

## 3. Export

Scripts live in `scripts/` and share `scripts/archive-lib.sh`; each has `--help`.

```sh
# Local compose stack (pnpm services:up): grad26 plus the two media buckets.
ARCHIVE_AGE_RECIPIENT=age1... scripts/archive-export.sh --out ~/grad26-archives
```

The result is `grad26-archive-<UTC time>.tar.age`, or a directory if no recipient
is given. Inside: `ARCHIVE.txt` (format, source, app commit, latest migration,
Postgres version), `db.dump`, `db-counts.tsv`, `objects.tsv` (bucket, key, size,
SHA-256, content type per object), the objects under `buckets/`, and `SHA256SUMS`.

From the home cluster, run the same script from an owner's workstation with
kubeconfig access; nothing is exposed beyond a temporary port-forward:

```sh
kubectl -n garage port-forward svc/garage 3900:3900 &          # S3 on localhost only
# S3_* from the api's Secret, kept in this shell only (never written to disk):
export S3_ENDPOINT=http://localhost:3900 S3_REGION=garage
export S3_ACCESS_KEY_ID="$(kubectl -n grad get secret api-s3 -o jsonpath='{.data.S3_ACCESS_KEY_ID}' | base64 -d)"
export S3_SECRET_ACCESS_KEY="$(kubectl -n grad get secret api-s3 -o jsonpath='{.data.S3_SECRET_ACCESS_KEY}' | base64 -d)"
ARCHIVE_PG_EXEC="kubectl -n grad exec -i grad-db-1 -c postgres --" ARCHIVE_PG_USER=postgres \
ARCHIVE_AGE_RECIPIENT=age1... scripts/archive-export.sh --db grad --out ~/grad26-archives
```

When to export: after the ceremony once uploads stop, after every takedown, and
once a year as part of the yearly check (section 5). Copy each encrypted export to
the offsite disk and to one owner's machine.

If the node itself is lost, the buckets come back from the offsite mirror
(`rclone copy offsite-crypt:<bucket> garage:<bucket>`, with the same rclone
config the mirror uses) and the database from the newest export. Status
(2026-10-19): the offsite mirror CronJob and Postgres backups are designed but
not deployed yet (`architecture/target/data-and-storage.md` §5.1 and §5.3), so
until they are, archive exports are the only off-node copy of the database.

## 4. Re-host on a spare machine

This is the "restore on a spare machine from git plus backups" path, using this
repository's docker-compose stack and migrations. It needs Docker, git, Node 24,
pnpm (via corepack), curl and age, and about twice the archive's size in disk.

1. Clone this repository and check out `main` (or any commit at least as new as
   `app_commit` in the export's `ARCHIVE.txt`; migrations only move forward).
2. `cp .env.example .env`; for a machine others can reach, change
   `POSTGRES_PASSWORD`, the Garage keys and `ADMIN_SESSION_SECRET` first.
3. `pnpm install`, then `pnpm services:up`. This starts Postgres and Garage and
   creates the empty `grad-originals`, `grad-derivatives` and `grad-backups`
   buckets. Do not run `pnpm db:migrate` yet: the restore wants an empty database.
4. Restore and verify, applying this checkout's newer migrations afterwards:

   ```sh
   ARCHIVE_AGE_IDENTITY=~/keys/archive.agekey \
     scripts/archive-restore.sh --db grad26 --migrate ~/grad26-archives/grad26-archive-<time>.tar.age
   ```

   It refuses a database that already has tables and buckets that are not empty,
   so it cannot overwrite live data.
5. Set the remaining `.env` values the API needs in production mode if you run it
   that way (`PASS_SIGNING_KEY`, `SERVICE_TOKEN_*`): decrypt them from the
   deployment repository's SOPS files with the age key, or generate new ones. A
   new `PASS_SIGNING_KEY` only means old passes no longer verify.
6. `pnpm build`, then start the API (`pnpm --filter @grad/api start`) and the web
   app (`pnpm --filter @grad/web start`, with `API_ORIGIN` pointing at the API).
   Or deploy `apps/web` to Vercel again per `operations/deployment.md`.
7. Check the result by hand (section 5, last list).

Re-hosting on Kubernetes instead: bootstrap a cluster from the deployment
repository (its README), keep `api-service` and `worker` at zero replicas, and
run the same restore against it with
`ARCHIVE_PG_EXEC="kubectl -n grad exec -i grad-db-1 -c postgres --" ARCHIVE_PG_USER=postgres ARCHIVE_RESTORE_ROLE=grad ARCHIVE_GARAGE_CONTAINER=""`
and the S3 port-forward from section 3 (the buckets come from
`scripts/garage-bootstrap.sh` there). Then scale the API back up; its init
container applies newer migrations.

## 5. Restore verification

`archive-restore.sh` exits non-zero unless all of these hold:

- every file matches the export's `SHA256SUMS` (it checks before touching anything);
- row counts per table match `db-counts.tsv`;
- every object, after upload, is read back and matches its recorded size and SHA-256;
- every `photos.original_key` has its original in the archive;
- with `--migrate`, this checkout's migrations apply cleanly on top.

`scripts/archive-drill.sh` rehearses the whole round trip on the local compose
stack without touching dev data: it seeds a scratch database and scratch buckets,
exports, restores into a second scratch database and bucket prefix with
`--migrate`, compares the row contents of the guest-content tables, checks that a
restore into a non-empty database is refused, and deletes everything it made.
Run it after changing the scripts or the schema. Last run: 2026-10-19, passed
(3 photos, 2 wishes, 7 objects, 14 tables), also with an age-encrypted export, a
deliberately corrupted export (refused) and `ARCHIVE_RESTORE_ROLE=grad`.

By hand, after a real restore: the gallery shows as many photos as there are
visible, ready rows; three random photos open at both sizes; the wishes list
matches; an admin can sign in and sees the guest list.

Yearly, for the four years: decrypt the newest export on a spare machine and run
section 4 end to end. Record the date and result in the runbook.

## 6. Yearbook (v1 scope)

Decided 2026-10-19. The yearbook is built from the archive, after the ceremony,
and contains only what was already public on the site.

**Content.** Photos that are `visible` and `ready` at export time, after an admin
hide pass, and `visible` wishes with their author names as displayed. Event facts
(name, date, venue). Nothing else: no guest list, emails, phone numbers, RSVPs,
notes, invitation data or hidden and removed items. A dedicated "public" curation
flag (`use-cases.md` §6.3) would need a schema change and is not part of v1; the
hide pass is the curation.

**Formats.**

1. **Static HTML export.** A self-contained folder (`index.html`, a photo grid in
   upload order with a simple cohort timeline by hour of the day, a wishes page)
   that opens from disk or any static host, with no scripts from elsewhere and no
   API. Images are the `display` derivatives, so originals never leave the archive.
   Styling uses the blue-and-white brand tokens (`design/tokens.md`); any
   illustration follows `design/figures.md`.
2. **Print-ready PDF.** The same pages printed through headless Chromium with print
   CSS: A4 portrait, 10 mm margins, four photos per page, wishes set as text,
   fonts embedded. `display` derivatives are enough at this size; a later edition
   can swap in originals for full-page photos.

**Not in v1:** per-guest editions, a printing service, video, 3D and anything
needing a login. The generator itself is not built yet: it is a script that reads
a restored archive (section 4), and it is planned for after the ceremony.
TODO(owner): cover text, title and who signs off the hide pass before the yearbook
is generated.
