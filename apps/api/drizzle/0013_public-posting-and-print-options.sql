-- Public posting (ADR-019): wishes and photos may have no invitation; photos
-- from people without one are held as moderation_status 'pending' until an
-- admin approves them. Print options (photobooth bridge): per-job layout,
-- ASCII and caption.
ALTER TABLE "photos" DROP CONSTRAINT "photos_moderation_status_check";--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "invitation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wishes" ALTER COLUMN "invitation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_moderation_status_check" CHECK ("photos"."moderation_status" IN ('pending', 'visible', 'hidden', 'removed'));