CREATE TABLE "export_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"row_key" text NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"external_id" text,
	"payload" jsonb NOT NULL,
	"report_id" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD COLUMN "export_state" jsonb;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD COLUMN "export_check" jsonb;--> statement-breakpoint
ALTER TABLE "export_rows" ADD CONSTRAINT "export_rows_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_rows_identity" ON "export_rows" USING btree ("account_id","row_key");--> statement-breakpoint
CREATE INDEX "export_rows_account_action_idx" ON "export_rows" USING btree ("account_id","action");