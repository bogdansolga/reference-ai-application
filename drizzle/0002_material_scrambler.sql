CREATE TABLE "agent_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "session_id" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "answer" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "summary" text;--> statement-breakpoint
-- Backfill (hand-written): each pre-session run becomes its own one-turn session
DO $$
DECLARE r record; sid integer;
BEGIN
  FOR r IN SELECT id, request, created_at FROM agent_runs WHERE session_id IS NULL ORDER BY id LOOP
    INSERT INTO agent_sessions (title, created_at) VALUES (left(r.request, 60), r.created_at) RETURNING id INTO sid;
    UPDATE agent_runs SET session_id = sid WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
UPDATE agent_runs SET answer = (
  SELECT e->>'answer' FROM jsonb_array_elements(events) e WHERE e->>'type' = 'final' LIMIT 1
);--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;