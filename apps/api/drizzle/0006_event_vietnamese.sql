-- #9 (ADR-010): Vietnamese versions of the event's prose fields. Nullable and additive:
-- null means "show the English field", so nothing changes until an admin fills them in.
ALTER TABLE "event_config" ADD COLUMN "name_vi" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "venue_address_vi" text;--> statement-breakpoint
ALTER TABLE "event_config" ADD COLUMN "arrival_info_vi" text;--> statement-breakpoint
-- Translate the placeholders from 0001 only while they are still in place.
-- TODO(owner): replace with the official Vietnamese event name and address in the admin event form.
UPDATE "event_config" SET "name_vi" = 'Lễ tốt nghiệp GRAD ''26'
WHERE "id" = 1 AND "name_vi" IS NULL AND "name" = 'GRAD ''26 Graduation Ceremony';--> statement-breakpoint
UPDATE "event_config" SET "venue_address_vi" = 'Trường Đại học Việt Đức (địa chỉ đầy đủ sẽ được xác nhận)'
WHERE "id" = 1 AND "venue_address_vi" IS NULL AND "venue_address" = 'Vietnamese-German University (full address to be confirmed)';
