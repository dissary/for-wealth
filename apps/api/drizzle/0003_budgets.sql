CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"month" date NOT NULL,
	"limit" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_user_id_category_id_month_unique" UNIQUE("user_id","category_id","month"),
	CONSTRAINT "budgets_limit_range" CHECK ("budgets"."limit" between 1 and 100000000000),
	CONSTRAINT "budgets_month_first_day" CHECK (extract(day from "budgets"."month") = 1),
	CONSTRAINT "budgets_month_from_2000" CHECK ("budgets"."month" >= '2000-01-01')
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_category_id_categories_fk" FOREIGN KEY ("user_id","category_id") REFERENCES "public"."categories"("user_id","id") ON DELETE no action ON UPDATE no action;