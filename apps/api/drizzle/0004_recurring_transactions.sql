CREATE TYPE "public"."frequency" AS ENUM('monthly', 'weekly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"note" text,
	"varies" boolean NOT NULL,
	"frequency" "frequency" NOT NULL,
	"day" integer,
	"weekday" integer,
	"month" integer,
	"start_date" date NOT NULL,
	"next_due_date" date NOT NULL,
	"last_due_date" date,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_transactions_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "recurring_transactions_amount_range" CHECK ("recurring_transactions"."amount" between 1 and 100000000000),
	CONSTRAINT "recurring_transactions_note_length" CHECK (char_length("recurring_transactions"."note") <= 200),
	CONSTRAINT "recurring_transactions_schedule" CHECK (coalesce(case "recurring_transactions"."frequency"
        when 'monthly' then "recurring_transactions"."day" between 1 and 31 and "recurring_transactions"."weekday" is null and "recurring_transactions"."month" is null
        when 'weekly' then "recurring_transactions"."weekday" between 1 and 7 and "recurring_transactions"."day" is null and "recurring_transactions"."month" is null
        when 'yearly' then "recurring_transactions"."month" between 1 and 12 and "recurring_transactions"."day" between 1 and 31 and "recurring_transactions"."weekday" is null
      end, false)),
	CONSTRAINT "recurring_transactions_start_date_from_2000" CHECK ("recurring_transactions"."start_date" >= '2000-01-01'),
	CONSTRAINT "recurring_transactions_next_due_date_from_start" CHECK ("recurring_transactions"."next_due_date" >= "recurring_transactions"."start_date"),
	CONSTRAINT "recurring_transactions_last_due_date_before_next" CHECK ("recurring_transactions"."last_due_date" is null or "recurring_transactions"."last_due_date" < "recurring_transactions"."next_due_date")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "estimate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_category_id_categories_fk" FOREIGN KEY ("user_id","category_id") REFERENCES "public"."categories"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_recurring_transaction_id_fk" FOREIGN KEY ("user_id","recurring_transaction_id") REFERENCES "public"."recurring_transactions"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_transaction_id_due_date_unique" UNIQUE("recurring_transaction_id","due_date");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_due_date_with_recurring" CHECK (("transactions"."recurring_transaction_id" is null) = ("transactions"."due_date" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_estimate_from_recurring" CHECK (not "transactions"."estimate" or "transactions"."recurring_transaction_id" is not null);