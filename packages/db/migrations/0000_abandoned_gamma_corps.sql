CREATE TYPE "public"."brief_kind" AS ENUM('tomorrow_plan', 'morning', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('action_required', 'awaiting_reply', 'fyi', 'scheduling', 'financial', 'personal', 'newsletter_promo', 'spam_noise');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound', 'system');--> statement-breakpoint
CREATE TYPE "public"."loop_status" AS ENUM('open', 'closed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."loop_type" AS ENUM('awaiting_reply_from_operator', 'awaiting_reply_from_them', 'commitment_made', 'deadline_pending');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('gmail', 'imap', 'whatsapp', 'calendar');--> statement-breakpoint
CREATE TABLE "api_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"related_item_id" uuid,
	"input_summary" jsonb NOT NULL,
	"token_usage" jsonb,
	"cost_estimate" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "brief_kind" NOT NULL,
	"for_date" date NOT NULL,
	"content_md" text NOT NULL,
	"items_considered" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"model" text NOT NULL,
	"category" "category" NOT NULL,
	"urgency" smallint NOT NULL,
	"requires_action" boolean NOT NULL,
	"action_summary" text DEFAULT '' NOT NULL,
	"deadline_at" timestamp with time zone,
	"confidence" real NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"source" "source" PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"handles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"importance" smallint DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source" NOT NULL,
	"source_item_id" text NOT NULL,
	"thread_id" uuid,
	"direction" "direction" NOT NULL,
	"sender_identity" uuid,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"subject" text,
	"body_text" text,
	"body_snippet" text,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_loops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "loop_type" NOT NULL,
	"description" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" "loop_status" DEFAULT 'open' NOT NULL,
	"resolved_by_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "source" NOT NULL,
	"source_thread_id" text NOT NULL,
	"title" text,
	"last_activity_at" timestamp with time zone,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_calls" ADD CONSTRAINT "api_calls_related_item_id_items_id_fk" FOREIGN KEY ("related_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifications" ADD CONSTRAINT "classifications_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sender_identity_entities_id_fk" FOREIGN KEY ("sender_identity") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_loops" ADD CONSTRAINT "open_loops_resolved_by_item_id_items_id_fk" FOREIGN KEY ("resolved_by_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_calls_related_item_idx" ON "api_calls" USING btree ("related_item_id");--> statement-breakpoint
CREATE INDEX "api_calls_created_idx" ON "api_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "briefs_for_date_idx" ON "briefs" USING btree ("for_date");--> statement-breakpoint
CREATE INDEX "classifications_item_idx" ON "classifications" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "classifications_category_idx" ON "classifications" USING btree ("category");--> statement-breakpoint
CREATE INDEX "entities_importance_idx" ON "entities" USING btree ("importance");--> statement-breakpoint
CREATE UNIQUE INDEX "items_source_item_uq" ON "items" USING btree ("source","source_item_id");--> statement-breakpoint
CREATE INDEX "items_timestamp_idx" ON "items" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "items_thread_idx" ON "items" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "items_sender_idx" ON "items" USING btree ("sender_identity");--> statement-breakpoint
CREATE INDEX "open_loops_status_idx" ON "open_loops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "open_loops_due_idx" ON "open_loops" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "open_loops_item_idx" ON "open_loops" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_source_thread_uq" ON "threads" USING btree ("source","source_thread_id");--> statement-breakpoint
CREATE INDEX "threads_last_activity_idx" ON "threads" USING btree ("last_activity_at");