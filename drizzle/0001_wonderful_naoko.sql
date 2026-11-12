CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"request" text NOT NULL,
	"status" text NOT NULL,
	"events" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
