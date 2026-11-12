# Claude Code Context

This file provides context for Claude Code when working on this project.

## What This Is

**Reference AI**: a training showcase of two AI patterns, RAG and AI Agents, running fully locally on oMLX. The RAG knowledge base is the AI training HTML decks. Educational app — clarity over production features.

Repository: [bogdansolga/reference-ai-application](https://github.com/bogdansolga/reference-ai-application) (renamed from `reference-rag-application`; GitHub redirects the old URL).

## Tech Stack

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**
- **Vercel AI SDK** (`ai@^7`, `@ai-sdk/openai@^4`, `@ai-sdk/react@^4`)
- **Drizzle ORM** + **PostgreSQL** + **pgvector**
- **Tailwind CSS v4** (`@tailwindcss/postcss`), styled in the training decks' look (Instrument Serif + Inter via `next/font`)
- **three.js 0.160** for the hero scenes (ported from the decks' kit)
- **node-html-parser** for deck slide extraction
- **Bun** runtime

## Project Structure

```
src/app/page.tsx              → Homepage: RAG vs Agents, complementarity, levels of autonomy
src/app/rag/layout.tsx        → RAG section: header + hero + tabs (Chat | How it works), stays mounted across tabs
src/app/rag/chat/page.tsx     → RAG chat (renders <Chat />; the conversation lives at module level, survives tab switches)
src/app/rag/overview/page.tsx → RAG "How it works": system diagram, phases, considerations, DB choice
src/app/agent/layout.tsx      → Agent section: header + hero + tabs (Demo | How it works)
src/app/agent/demo/page.tsx   → agent demo (renders <AgentRuns />)
src/app/agent/overview/page.tsx → agent "How it works": the loop, context window, prompt + tools, SDK version
next.config.ts                → redirects: /rag → /rag/chat, /agent → /agent/demo, /chat and /overview (old) → /rag/*
src/app/layout.tsx            → Root layout (fonts, metadata)
src/instrumentation.ts        → server start: pre-loads the prompts
src/app/globals.css           → Tailwind v4 + CSS vars + prose styles
src/app/api/chat/route.ts     → POST: embed query → vector search → stream LLM response
src/app/api/search/route.ts   → GET ?q=: direct vector search, returns chunks + scores
src/app/api/agent/route.ts    → POST {request, sessionId?}: runs one turn (new session if no id), streams SSE, saves it;
                                GET: sessions; GET ?session=ID: its turns; DELETE ?session=ID
src/lib/db.ts                 → Drizzle client + pg Pool (globalThis HMR-safe)
src/lib/schema.ts             → documents, chunks, notes, agent_sessions, agent_runs tables (Drizzle)
src/lib/embeddings.ts         → embedQuery(), embedDocument() via local oMLX (bge-m3)
src/lib/retrieval.ts          → searchSimilar() pgvector cosine, formatContext()
src/lib/llm-config.ts         → oMLX base URL, API key, chat model (shared by chat + agent)
src/lib/prompts.ts            → loads src/prompts/*.md once at startup; fill() for {{placeholders}}
src/lib/decks.ts              → DECK_FILES, DECKS_DIR, slide extraction → one chunk per slide
src/lib/core/utils/logger.ts  → server logger (use it, never console.*)
src/prompts/*.md              → every LLM prompt (agent system/summary, chat system/context)
src/lib/agent.ts              → runAgent(): hand-written tool loop, session history + compaction, turn summary,
                                /tokenize context accounting
src/lib/agent-tools.ts        → tool registry (name, kind read|write, JSON schema, execute)
src/components/chat.tsx       → Client component: useChat, streaming, sources
src/components/agent-runs.tsx → Client component: sessions, collapsible turns, live trace, context charts
src/components/site-header.tsx → shared header / nav (Home · RAG · Agent)
src/components/section-tabs.tsx → the tabs under a section's hero
src/components/section-head.tsx → deck-style section heading (kicker, serif title, lede)
src/components/scene-hero.tsx → animated deck-style hero band (client-only three.js, disposed on unmount)
src/components/scenes/*       → kit.ts (ported deck scene kit), rag-scene.ts, agent-loop-scene.ts
scripts/ingest.ts             → deck ingestion: hash-based skip / replace / prune (--soft for predev)
scripts/setup-db.sh           → DB creation + Drizzle migrations
scripts/add-pgvector.sh       → pgvector extension + HNSW index
scripts/migrations/add-pgvector.sql → Raw SQL for vector column + index
```

## Critical Patterns

### AI SDK v6 (NOT v3/v4)

The API changed significantly in v6. Do NOT use deprecated patterns:

```typescript
// CORRECT (v6)
const { messages, sendMessage, status } = useChat();
void sendMessage({ text: inputValue });
const text = message.parts.filter(p => p.type === "text").map(p => p.text).join("");
// status: "ready" | "submitted" | "streaming"

// WRONG (old API — do not use)
// const { input, handleInputChange, handleSubmit, isLoading } = useChat();
// message.content  ← does not exist in v6
```

### pgvector

- Vector column added via raw SQL migration, NOT Drizzle schema (Drizzle lacks native pgvector support)
- Insert: cast with `$1::vector`
- Search: `ORDER BY embedding <=> $1::vector` (cosine distance)
- Similarity: `1 - (embedding <=> $1::vector)`
- HNSW index with `vector_cosine_ops`

### Message Text Extraction (server-side)

Messages arriving at API routes may have `content` (string) or `parts` (array). Always handle both:

```typescript
const userText =
  lastUserMessage.content ??
  lastUserMessage.parts
    ?.filter((p: { type: string }) => p.type === "text")
    .map((p: { text: string }) => p.text)
    .join("") ?? "";
```

### Agent demo

- The agent loop in `src/lib/agent.ts` is intentionally hand-written against oMLX `/v1/chat/completions` (not AI SDK `stopWhen`) so the page can show the exact request per step. Keep it that way.
- Sessions: each turn is one `agent_runs` row in an `agent_sessions` conversation. Earlier turns are re-sent as request + final answer only (never their tool traffic). After each answer a separate summary call writes a one-sentence summary; later turns get that summary instead of the full turn **only when it is shorter** (short exchanges are sent in full).
- Tools: `search_documents`, `calculator`, `current_time`, `list_notes` (read) and `save_note` (write).
- Add tools as entries in `agentTools` (`src/lib/agent-tools.ts`) with `kind: "read"` or `"write"`; the UI colors read tools amber and write tools red.
- No unit tests in this project; verify with `curl -N` against `/api/agent` and a browser check.

### Prompts, decks, logging

- Never hard-code a prompt: add a Markdown file to `src/prompts/` and a key in `prompts` (`src/lib/prompts.ts`). Prompts load once per server process; restart `bun dev` after editing one.
- The decks are indexed, not shown: a slide is a chunk with metadata `{filename, deckTitle, slide, slideTitle}`; `citation()` in `retrieval.ts` formats it. Change the deck list in `DECK_FILES`.
- Log with `logger` from `@/lib/core/utils/logger` (copied from the sibling finances-manager), never `console.*`.

### Architecture Rules

- **No auth** — local training showcase
- **No service/repository layers** — API routes access Drizzle directly
- **Minimal files** — each file has one clear purpose
- **Light theme** — CSS custom properties in globals.css

## Database

- Tables: `documents` (one per deck: unique `filename`, `source`, `content_hash`) and `chunks` (one per slide: content + `embedding vector(1024)` + slide metadata; cascade-deleted with their document)
- Agent demo: `notes` (written by `save_note`, read by `list_notes`), `agent_sessions`, and `agent_runs` (`session_id`, `answer`, `summary`, `events` jsonb = the turn's exact SSE event list; the UI replays it through the same reducer as live turns)
- pgvector setup: `scripts/migrations/add-pgvector.sql`
- Connection pool: `src/lib/db.ts` with `globalThis` caching for HMR

## Environment Variables

```
DATABASE_URL    → PostgreSQL connection string (required)
EMBEDDING_BASE_URL   → default: http://localhost:8000/v1 (oMLX)
EMBEDDING_API_KEY    → oMLX API key (~/.omlx/settings.json → auth.api_key)
EMBEDDING_MODEL      → default: bge-m3
EMBEDDING_DIMENSIONS → default: 1024 (used by db:embeddings-setup; must match model)
CHAT_MODEL           → default: Qwen3-4B-Instruct-2507-4bit (on oMLX)
CHAT_BASE_URL / CHAT_API_KEY → optional, default to the EMBEDDING_* values
AGENT_CONTEXT_WINDOW → default: 32768 (oMLX max_context_window; for the agent's % bar)
DECKS_DIR            → folder of the training HTML decks (default: …/oman-lng-ai-acceleration-training/decks/html/ai-intro-integ)
```

## Scripts

```
bun dev              → predev re-indexes changed decks (soft), then the dev server (Turbopack)
bun run build        → production build
bun db:setup         → create DB + migrations
bun db:embeddings-setup → pgvector extension + index
bun ingest           → index the decks (unchanged decks skipped)
bun bootstrap        → all setup in order
```

## When Modifying

- **Schema changes**: edit `src/lib/schema.ts`, then `bun db:generate` + `bun db:migrate`. pgvector columns stay in raw SQL.
- **New routes**: create under `src/app/api/<name>/route.ts`, import from `@/lib/*`
- **New pages**: create under `src/app/<name>/page.tsx`
- **Theme**: edit CSS custom properties in `src/app/globals.css` (deck palette: --ink, --blue, --sky, --sage…; helpers .serif-title, .kicker, .deck-card)
