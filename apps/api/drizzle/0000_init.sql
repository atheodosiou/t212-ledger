CREATE TYPE "public"."broker_environment" AS ENUM('DEMO', 'LIVE');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'INTEREST', 'FEE', 'TRANSFER', 'CORPORATE_ACTION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."raw_source" AS ENUM('ORDER', 'DIVIDEND', 'TRANSACTION');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('IDLE', 'QUEUED', 'RUNNING', 'FAILED');--> statement-breakpoint
CREATE TABLE "broker_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"environment" "broker_environment" NOT NULL,
	"api_key_enc" text NOT NULL,
	"api_secret_enc" text NOT NULL,
	"account_currency" text DEFAULT 'EUR' NOT NULL,
	"sync_status" "sync_status" DEFAULT 'IDLE' NOT NULL,
	"sync_progress" jsonb,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"raw_event_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"source_type" text NOT NULL,
	"ticker" text,
	"isin" text,
	"instrument_name" text,
	"instrument_currency" text,
	"quantity" numeric(28, 10),
	"price" numeric(28, 10),
	"fx_rate" numeric(28, 10),
	"cash_amount" numeric(20, 6) NOT NULL,
	"fees" numeric(20, 6) DEFAULT '0' NOT NULL,
	"gross_amount" numeric(20, 6),
	"broker_realised_pnl" numeric(20, 6),
	"note" text
);
--> statement-breakpoint
CREATE TABLE "raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "raw_source" NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_raw_event_id_raw_events_id_fk" FOREIGN KEY ("raw_event_id") REFERENCES "public"."raw_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_events" ADD CONSTRAINT "raw_events_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broker_accounts_user_idx" ON "broker_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_raw_idx" ON "ledger_entries" USING btree ("raw_event_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_time_idx" ON "ledger_entries" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_ticker_idx" ON "ledger_entries" USING btree ("account_id","ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_events_identity" ON "raw_events" USING btree ("account_id","source","external_id");