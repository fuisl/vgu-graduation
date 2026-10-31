-- Guest self-registration (ADR-015): each graduate's join link code, issued on first request.
-- Nullable, so existing graduates have none until they or an admin ask for one.
ALTER TABLE "users" ADD COLUMN "join_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_join_code_unique" UNIQUE("join_code");