CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD COLUMN "sync_state" jsonb;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD COLUMN "ledger_version" integer;--> statement-breakpoint
-- Accounts that already finished a sync walked their whole history (the first sync was a
-- full walk), so their backfill is complete. Without this the new code would walk it again.
UPDATE "broker_accounts"
SET "sync_state" = '{"ORDER":{"backfillDone":true,"resume":null},"DIVIDEND":{"backfillDone":true,"resume":null},"TRANSACTION":{"backfillDone":true,"resume":null}}'::jsonb
WHERE "last_synced_at" IS NOT NULL AND "sync_state" IS NULL;
