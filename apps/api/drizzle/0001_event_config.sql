CREATE TABLE "event_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"time_zone" text NOT NULL,
	"time_confirmed" boolean DEFAULT false NOT NULL,
	"venue_name" text NOT NULL,
	"venue_address" text NOT NULL,
	"venue_map_url" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"arrival_info" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_config_single_row_check" CHECK ("event_config"."id" = 1),
	CONSTRAINT "event_config_time_check" CHECK ("event_config"."ends_at" IS NULL OR "event_config"."ends_at" > "event_config"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
-- Placeholder until the official details are announced (#83). time_confirmed stays
-- false so pages say "to be confirmed"; admins replace these values in the admin UI.
INSERT INTO "event_config" ("id", "name", "starts_at", "time_zone", "time_confirmed", "venue_name", "venue_address", "venue_map_url")
VALUES (1, 'GRAD ''26 Graduation Ceremony', '2026-11-14T09:00:00+07:00', 'Asia/Ho_Chi_Minh', false, 'Ceremony Hall', 'Vietnamese-German University (full address to be confirmed)', 'https://maps.app.goo.gl/meCAgQyakBbWh8LDA')
ON CONFLICT ("id") DO NOTHING;
