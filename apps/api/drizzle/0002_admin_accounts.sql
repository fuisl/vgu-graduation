CREATE TABLE "admin_accounts" (
	"github_handle" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_accounts_status_check" CHECK ("admin_accounts"."status" IN ('pending', 'approved', 'rejected', 'revoked')),
	CONSTRAINT "admin_accounts_handle_lower_check" CHECK ("admin_accounts"."github_handle" = lower("admin_accounts"."github_handle"))
);
--> statement-breakpoint
-- The four collaborators decided 2026-09-28 (previously a hardcoded allowlist in apps/web).
INSERT INTO "admin_accounts" ("github_handle", "status", "decided_by", "decided_at")
VALUES
  ('fuisl', 'approved', 'seed', now()),
  ('nhientruong04', 'approved', 'seed', now()),
  ('dducwsxuaan', 'approved', 'seed', now()),
  ('andrwpham', 'approved', 'seed', now())
ON CONFLICT ("github_handle") DO NOTHING;
