# Initial Data Model
The schema lives in `apps/api/src/db/schema.ts` (Drizzle); migrations in `apps/api/drizzle/`. Status columns are text with CHECK constraints.

Core concepts:
- `User`: internal graduate/admin.
- `Guest`: external invited person.
- `Invitation`: personalized pass with high-entropy bearer token; store a hash where practical.
- `InvitationInviter`: many-to-many relation for joint invitations.
- `RSVP`: attendance state.
- `Photo`: original + derivatives, contributor and moderation state.
- `Wish`: message with moderation/display state.
- `TranslationSegment`: one finalized source-language sentence (`en` or `vi`) from the translation service, never revised, with a gapless per-session `sequence` (unique with `session_id`) so clients refetch missed segments by sequence.
- `TranslationText`: one translation of a segment into `de`, `en` or `vi` (unique per segment and language). `status` is `draft` (fast, replaceable), `final` or `failed` (shown as "translation unavailable"; `text` may then be null). `provider` records which backend produced it, since local-GPU and cloud providers are swappable.
- `Job`: worker queue row (`queued` → `running` → `succeeded`/`failed`) with attempts and `run_at`, polled with `FOR UPDATE SKIP LOCKED`. Payloads hold ids only.
- `Audit`: append-only admin/service action log (actor, action, target). No tokens or guest PII in metadata.

Photo and wish lifecycle: content is shown without pre-review. `moderation_status` is `visible`, `hidden` (reversible) or `removed` (takedown on request). Photos also carry `processing_status` (`pending` until derivatives exist) and a random `public_id` used in derivative URLs; originals are keyed separately and never served.

Never put sensitive data in public slugs, analytics, client logs or URLs beyond the necessary invitation credential.
