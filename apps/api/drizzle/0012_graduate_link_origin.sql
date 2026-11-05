-- Who added each inviter link and who created each invitation (ADR-017). Additive: two columns and
-- two checks. No token hash, join code or updated_at is written. Everything already there starts as
-- 'admin', the safe direction, and only what the audit table proves moves to 'graduate'.
--
-- The proof: JoinRepository.register writes the row and its audit row in one transaction, and both
-- take created_at from now(), which is the transaction's start time. So the timestamps are exactly
-- equal for the row that audit entry created, and differ for a link re-added later by other means.
-- A missing audit row, a different actor or any other doubt leaves the row as 'admin'.
ALTER TABLE "invitation_inviters" ADD COLUMN "added_by" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "created_by" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_inviters" ADD CONSTRAINT "invitation_inviters_added_by_check" CHECK ("invitation_inviters"."added_by" IN ('admin', 'graduate'));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_check" CHECK ("invitations"."created_by" IN ('admin', 'graduate'));;--> statement-breakpoint
UPDATE "invitation_inviters" AS link
SET "added_by" = 'graduate'
FROM "audit" AS entry
WHERE entry."action" IN ('invitation.join_create', 'invitation.join_add_inviter')
  AND entry."target_type" = 'invitation'
  AND entry."target_id" = link."invitation_id"::text
  AND entry."metadata"->>'inviterUserId' = link."user_id"::text
  AND entry."actor" IN ('join-link', 'graduate:' || link."user_id"::text)
  AND entry."created_at" = link."created_at";--> statement-breakpoint
UPDATE "invitations" AS invitation
SET "created_by" = 'graduate'
FROM "audit" AS entry
WHERE entry."action" = 'invitation.join_create'
  AND entry."target_type" = 'invitation'
  AND entry."target_id" = invitation."id"::text
  AND (entry."actor" = 'join-link' OR entry."actor" = 'graduate:' || (entry."metadata"->>'inviterUserId'))
  AND entry."created_at" = invitation."created_at";
