CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"scopes" text[] NOT NULL,
	"provider_account_id" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "integrations_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"shopify_shop" text,
	"onboarding_completed_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "idx_integrations_user_provider" ON "integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE POLICY "integrations_user_policy" ON "integrations" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT auth.uid()) = "integrations"."user_id") WITH CHECK ((SELECT auth.uid()) = "integrations"."user_id");--> statement-breakpoint
CREATE POLICY "user_profiles_user_policy" ON "user_profiles" AS PERMISSIVE FOR ALL TO "authenticated" USING ((SELECT auth.uid()) = "user_profiles"."user_id") WITH CHECK ((SELECT auth.uid()) = "user_profiles"."user_id");