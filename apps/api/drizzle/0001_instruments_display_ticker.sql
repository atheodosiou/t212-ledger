CREATE TABLE "instruments" (
	"ticker" text PRIMARY KEY NOT NULL,
	"short_name" text NOT NULL,
	"name" text,
	"isin" text,
	"currency" text,
	"type" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "display_ticker" text;