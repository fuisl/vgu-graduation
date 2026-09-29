CREATE TABLE "audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_inviters" (
	"invitation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_inviters_invitation_id_user_id_pk" PRIMARY KEY("invitation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"max_plus_ones" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_max_plus_ones_check" CHECK ("invitations"."max_plus_ones" >= 0),
	CONSTRAINT "invitations_status_check" CHECK ("invitations"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" IN ('queued', 'running', 'succeeded', 'failed')),
	CONSTRAINT "jobs_attempts_check" CHECK ("jobs"."attempts" >= 0 AND "jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"invitation_id" uuid NOT NULL,
	"original_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"moderation_status" text DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "photos_size_bytes_check" CHECK ("photos"."size_bytes" > 0),
	CONSTRAINT "photos_processing_status_check" CHECK ("photos"."processing_status" IN ('pending', 'ready', 'failed')),
	CONSTRAINT "photos_moderation_status_check" CHECK ("photos"."moderation_status" IN ('visible', 'hidden', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "rsvp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"attending" boolean NOT NULL,
	"plus_ones_count" integer DEFAULT 0 NOT NULL,
	"dietary_requirements" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvp_invitation_id_unique" UNIQUE("invitation_id"),
	CONSTRAINT "rsvp_plus_ones_count_check" CHECK ("rsvp"."plus_ones_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "translation_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"source_language" text NOT NULL,
	"source_text" text NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_segments_session_sequence_key" UNIQUE("session_id","sequence"),
	CONSTRAINT "translation_segments_time_check" CHECK ("translation_segments"."end_ms" >= "translation_segments"."start_ms")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'graduate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('graduate', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "wishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invitation_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"moderation_status" text DEFAULT 'visible' NOT NULL,
	"displayed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wishes_body_length_check" CHECK (char_length("wishes"."body") BETWEEN 1 AND 1000),
	CONSTRAINT "wishes_moderation_status_check" CHECK ("wishes"."moderation_status" IN ('visible', 'hidden', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "invitation_inviters" ADD CONSTRAINT "invitation_inviters_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_inviters" ADD CONSTRAINT "invitation_inviters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishes" ADD CONSTRAINT "wishes_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_target" ON "audit" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_invitation_inviters_user" ON "invitation_inviters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_guest_id" ON "invitations" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_poll" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "idx_photos_gallery" ON "photos" USING btree ("moderation_status","processing_status","created_at");--> statement-breakpoint
CREATE INDEX "idx_photos_invitation" ON "photos" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "idx_wishes_listing" ON "wishes" USING btree ("moderation_status","created_at");--> statement-breakpoint
CREATE INDEX "idx_wishes_invitation" ON "wishes" USING btree ("invitation_id");