import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Entities from docs/architecture/data-model.md plus `jobs` and `audit`
 * (docs/architecture/target/data-and-storage.md §5.1). Migrations are
 * generated from this file with `pnpm --filter @grad/api db:generate` and
 * committed under apps/api/drizzle/.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Graduates and admins (internal). Graduates do not sign in; admin sign-in access lives in `admin_accounts`. */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role", { enum: ["graduate", "admin"] })
      .notNull()
      .default("graduate"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_role_check", sql`${t.role} IN ('graduate', 'admin')`)],
);

/**
 * Admin access by GitHub handle (#119). A first sign-in files a `pending` row;
 * an owner (modules/admin/owners.ts) approves, rejects or later revokes it.
 * Checked on every /admin request, so a revoke applies immediately.
 */
export const adminAccounts = pgTable(
  "admin_accounts",
  {
    /** Lowercased: GitHub logins are case-insensitive. */
    githubHandle: text("github_handle").primaryKey(),
    status: text("status", { enum: ["pending", "approved", "rejected", "revoked"] })
      .notNull()
      .default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("admin_accounts_status_check", sql`${t.status} IN ('pending', 'approved', 'rejected', 'revoked')`),
    check("admin_accounts_handle_lower_check", sql`${t.githubHandle} = lower(${t.githubHandle})`),
  ],
);

/** External invited people. Contains PII: never log rows from this table. */
export const guests = pgTable("guests", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A personalised pass. Only the SHA-256 hash of the 128-bit bearer token is stored, never the token. */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    guestId: uuid("guest_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    maxPlusOnes: integer("max_plus_ones").notNull().default(0),
    status: text("status", { enum: ["active", "revoked"] })
      .notNull()
      .default("active"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("invitations_max_plus_ones_check", sql`${t.maxPlusOnes} >= 0`),
    check("invitations_status_check", sql`${t.status} IN ('active', 'revoked')`),
    index("idx_invitations_guest_id").on(t.guestId),
  ],
);

/** Joint invitations: many graduates can invite the same guest. */
export const invitationInviters = pgTable(
  "invitation_inviters",
  {
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.userId] }),
    index("idx_invitation_inviters_user").on(t.userId),
  ],
);

export const rsvp = pgTable(
  "rsvp",
  {
    id: id(),
    invitationId: uuid("invitation_id")
      .notNull()
      .unique()
      .references(() => invitations.id, { onDelete: "cascade" }),
    attending: boolean("attending").notNull(),
    plusOnesCount: integer("plus_ones_count").notNull().default(0),
    dietaryRequirements: text("dietary_requirements"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("rsvp_plus_ones_count_check", sql`${t.plusOnesCount} >= 0`)],
);

/**
 * Guest photos. The original lives in `grad-originals` under `originalKey`
 * and is never served; derivatives are addressed by the random `publicId`
 * so URLs cannot be guessed. Photos are shown without pre-review: admins
 * hide (reversible) or remove (takedown) after the fact.
 */
export const photos = pgTable(
  "photos",
  {
    id: id(),
    publicId: text("public_id").notNull().unique(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "restrict" }),
    originalKey: text("original_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    processingStatus: text("processing_status", { enum: ["pending", "ready", "failed"] })
      .notNull()
      .default("pending"),
    moderationStatus: text("moderation_status", { enum: ["visible", "hidden", "removed"] })
      .notNull()
      .default("visible"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("photos_size_bytes_check", sql`${t.sizeBytes} > 0`),
    check(
      "photos_processing_status_check",
      sql`${t.processingStatus} IN ('pending', 'ready', 'failed')`,
    ),
    check(
      "photos_moderation_status_check",
      sql`${t.moderationStatus} IN ('visible', 'hidden', 'removed')`,
    ),
    index("idx_photos_gallery").on(t.moderationStatus, t.processingStatus, t.createdAt),
    index("idx_photos_invitation").on(t.invitationId),
  ],
);

/** Wishes for the graduates, with moderation and event-display state. */
export const wishes = pgTable(
  "wishes",
  {
    id: id(),
    invitationId: uuid("invitation_id")
      .notNull()
      .references(() => invitations.id, { onDelete: "restrict" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    moderationStatus: text("moderation_status", { enum: ["visible", "hidden", "removed"] })
      .notNull()
      .default("visible"),
    displayedAt: timestamp("displayed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("wishes_body_length_check", sql`char_length(${t.body}) BETWEEN 1 AND 1000`),
    check(
      "wishes_moderation_status_check",
      sql`${t.moderationStatus} IN ('visible', 'hidden', 'removed')`,
    ),
    index("idx_wishes_listing").on(t.moderationStatus, t.createdAt),
    index("idx_wishes_invitation").on(t.invitationId),
  ],
);

/**
 * One finalized sentence from the translation service (experimental), in the
 * source language, never revised once stored. `sequence` is gapless per
 * session so clients can refetch what they missed after a disconnect.
 */
export const translationSegments = pgTable(
  "translation_segments",
  {
    id: id(),
    sessionId: text("session_id").notNull(),
    sequence: integer("sequence").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    sourceLanguage: text("source_language", { enum: ["en", "vi"] }).notNull(),
    sourceText: text("source_text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("translation_segments_session_sequence_key").on(t.sessionId, t.sequence),
    check("translation_segments_time_check", sql`${t.endMs} >= ${t.startMs}`),
    check("translation_segments_source_language_check", sql`${t.sourceLanguage} IN ('en', 'vi')`),
  ],
);

/**
 * One translation of a segment into one language. A `draft` (fast, rough) can
 * be replaced by a `final`; `failed` renders as "translation unavailable" and
 * never blocks other languages. `provider` records which ASR/LLM backend made
 * it (local GPU or cloud), since providers are swappable.
 */
export const translationTexts = pgTable(
  "translation_texts",
  {
    id: id(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => translationSegments.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["de", "en", "vi"] }).notNull(),
    text: text("text"),
    status: text("status", { enum: ["draft", "final", "failed"] }).notNull(),
    provider: text("provider"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("translation_texts_segment_language_key").on(t.segmentId, t.language),
    check("translation_texts_language_check", sql`${t.language} IN ('de', 'en', 'vi')`),
    check("translation_texts_status_check", sql`${t.status} IN ('draft', 'final', 'failed')`),
    check("translation_texts_text_check", sql`${t.status} = 'failed' OR ${t.text} IS NOT NULL`),
  ],
);

/**
 * The single public event configuration (#33), one row with `id = 1`. Admins
 * edit it (#42), so confirming the date (#83) needs no deploy. `sequence`
 * increases on every edit so subscribed calendar feeds (`GET /event/calendar.ics`)
 * pick up changes. Nothing else may hard-code the date or venue.
 */
export const eventConfig = pgTable(
  "event_config",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timeZone: text("time_zone").notNull(),
    timeConfirmed: boolean("time_confirmed").notNull().default(false),
    venueName: text("venue_name").notNull(),
    venueAddress: text("venue_address").notNull(),
    venueMapUrl: text("venue_map_url").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    arrivalInfo: text("arrival_info"),
    sequence: integer("sequence").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("event_config_single_row_check", sql`${t.id} = 1`),
    check("event_config_time_check", sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Work queue polled by the worker with `FOR UPDATE SKIP LOCKED` (no broker).
 * Payloads carry ids, never tokens or guest PII.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["queued", "running", "succeeded", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("jobs_status_check", sql`${t.status} IN ('queued', 'running', 'succeeded', 'failed')`),
    check("jobs_attempts_check", sql`${t.attempts} >= 0 AND ${t.maxAttempts} > 0`),
    index("idx_jobs_poll").on(t.status, t.runAt),
  ],
);

/** Append-only record of admin and service actions. Never store tokens or guest PII in `metadata`. */
export const audit = pgTable(
  "audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** GitHub handle for admins, `service:<name>` for service tokens. */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_audit_created_at").on(t.createdAt),
    index("idx_audit_target").on(t.targetType, t.targetId),
  ],
);
