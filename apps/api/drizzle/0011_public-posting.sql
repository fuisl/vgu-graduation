-- Public posting (ADR-019): people without an invitation may post wishes (live
-- at once) and photos (held as moderation_status 'pending' until an admin
-- approves them). Their rows have no invitation.
ALTER TABLE "photos" DROP CONSTRAINT "photos_moderation_status_check";--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "invitation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "wishes" ALTER COLUMN "invitation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_moderation_status_check" CHECK ("photos"."moderation_status" IN ('pending', 'visible', 'hidden', 'removed'));