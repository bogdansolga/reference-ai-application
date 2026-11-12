import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull().unique(),
  title: text("title"),
  source: text("source").notNull().default("deck"), // where the document came from (the training decks)
  contentHash: text("content_hash"), // sha256 of the extracted chunks; unchanged decks are not re-embedded
  createdAt: timestamp("created_at").defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  // embedding vector(1024) is added via SQL migration (pgvector not natively supported by Drizzle)
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
});

// --- Agent demo ---

/** Written by the agent's save_note tool, read by list_notes. */
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** A conversation with the agent; each turn is one agent_runs row. */
export const agentSessions = pgTable("agent_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One row per agent run (= one turn of a session). `events` is the exact SSE event list,
 * replayed by the UI. `answer` + `summary` are what later turns of the session see.
 */
export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => agentSessions.id, { onDelete: "cascade" })
    .notNull(),
  request: text("request").notNull(),
  answer: text("answer"),
  summary: text("summary"),
  status: text("status").$type<"done" | "error" | "aborted">().notNull(),
  events: jsonb("events").$type<{ type: string; [key: string]: unknown }[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
