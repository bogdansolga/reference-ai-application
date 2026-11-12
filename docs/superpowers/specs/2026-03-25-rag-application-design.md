# RAG Training Showcase Application — Design Spec

## Purpose

A minimal, educational RAG (Retrieval Augmented Generation) application that demonstrates the full RAG pipeline end-to-end. Intended as a training showcase for students learning RAG architecture, design, and integration. Every layer is optimized for readability and clarity over production features.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`) |
| Chat Model | `gpt-5.4-nano` (configurable via `CHAT_MODEL` env var) |
| Embedding Model | `text-embedding-3-small` (1536 dimensions) |
| Database | PostgreSQL + pgvector extension |
| ORM | Drizzle ORM |
| UI | Tailwind CSS + shadcn/ui |
| PDF Processing | `pdf-parse` |
| Runtime | Bun |

## Architecture

Two main flows:

### Ingestion Pipeline (offline, run once)

A standalone script (`scripts/ingest.ts`) processes the bootstrap data:

1. Scan `/data` directory for PDF files
2. For each PDF:
   - Extract text via `pdf-parse`
   - Insert metadata row into `documents` table
   - Split text into ~500-token chunks with ~50-token overlap
   - Batch-generate embeddings via OpenAI `text-embedding-3-small` (~20 at a time)
   - Insert chunks with embeddings into `chunks` table
3. Log summary: document count, chunk count, embeddings generated

Bootstrap data source: PDF training materials from `/Volumes/Media/Documents/Training courses/AI/AI Introduction & Integration` (copied into `/data` at setup time).

### Query Pipeline (runtime)

```
User question
    → embedQuery(question)                    # 1536-dim vector
    → SELECT ... ORDER BY embedding <=> $1    # cosine similarity, top 5
    → Build prompt with retrieved chunks      # context augmentation
    → streamText({ model, messages })         # streaming LLM response
    → Return response + source citations      # document name, chunk index, score
```

## Project Structure

```
reference-ai-application/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Chat UI (single page)
│   │   ├── layout.tsx              # Root layout
│   │   └── api/
│   │       ├── chat/route.ts       # RAG chat endpoint (POST)
│   │       └── search/route.ts     # Direct vector search (GET)
│   ├── lib/
│   │   ├── db.ts                   # Drizzle client + pg connection pool
│   │   ├── schema.ts              # documents + chunks table definitions
│   │   ├── embeddings.ts          # embedQuery() and embedDocument() helpers
│   │   └── retrieval.ts           # vector search + context building
│   └── components/
│       └── chat.tsx               # Client-side chat component (useChat hook)
├── scripts/
│   ├── ingest.ts                  # PDF ingestion pipeline
│   ├── setup-db.sh               # Database creation + schema setup
│   └── add-pgvector.sh           # pgvector extension + HNSW index setup
├── data/                          # PDF source documents (gitignored)
├── drizzle.config.ts
├── .env.local                     # OPENAI_API_KEY, DATABASE_URL, CHAT_MODEL
└── package.json
```

8 source files + ingestion script. Each file has a single clear purpose.

## Data Model

### documents table

| Column | Type | Description |
|--------|------|-------------|
| id | serial, PK | Auto-incrementing ID |
| filename | text, NOT NULL | Original PDF filename |
| title | text | Human-readable document title |
| created_at | timestamp | Insertion timestamp |

### chunks table

| Column | Type | Description |
|--------|------|-------------|
| id | serial, PK | Auto-incrementing ID |
| document_id | integer, FK → documents.id | Parent document |
| content | text, NOT NULL | Chunk text content |
| chunk_index | integer, NOT NULL | Position within document |
| embedding | vector(1536), NOT NULL | OpenAI embedding (added via SQL migration) |
| metadata | jsonb | Optional metadata |

**Index:** HNSW on `chunks.embedding` using `vector_cosine_ops` for fast cosine similarity search.

**Note:** The `vector(1536)` column and HNSW index are added via raw SQL migration (matching apex-platform patterns), since Drizzle doesn't natively support pgvector types.

## API Routes

### POST /api/chat

The core RAG endpoint:

1. Receive user message (+ conversation history)
2. Embed the latest user message via `embedQuery()`
3. Search `chunks` table for top 5 similar chunks using cosine distance (`<=>` operator)
4. Build system prompt with retrieved context and source metadata
5. Stream LLM response via Vercel AI SDK `streamText()`
6. Include source citations via data stream annotations (`streamText` with custom data parts) so the client receives them alongside the streamed text

### GET /api/search

Direct vector similarity search for exploration/debugging:

- Query param: `q` (search text)
- Returns: matching chunks with similarity scores, document metadata
- Useful for students to inspect retrieval quality independently of the LLM

## UI Design

Single-page dark-themed chat interface using Tailwind CSS + shadcn/ui:

- Centered chat layout (max-width 640px)
- User messages right-aligned, assistant messages left-aligned
- Streaming markdown rendering for assistant responses
- Source citations below each assistant message (document name, chunk index, similarity score)
- Input bar at bottom with text field + send button
- Welcome state with brief description of available topics
- No sidebar, navigation, auth, or settings

### Components

- `chat.tsx` — Client component using `useChat()` hook from `@ai-sdk/react`. Handles message state, streaming display, source citation rendering.
- `page.tsx` — Server component. Layout wrapper, renders Chat component with page title.
- shadcn/ui components: `button`, `input`, `card`, `scroll-area`

## Configuration

### Environment Variables (.env.local)

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/rag_training
OPENAI_API_KEY=sk-proj-...
CHAT_MODEL=gpt-5.4-nano           # optional, defaults to gpt-5.4-nano
EMBEDDING_MODEL=text-embedding-3-small  # optional, defaults to text-embedding-3-small
```

### Package Scripts

```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:setup": "scripts/setup-db.sh",
  "db:embeddings-setup": "scripts/add-pgvector.sh",
  "ingest": "bun scripts/ingest.ts",
  "bootstrap": "bun db:setup && bun db:embeddings-setup && bun ingest"
}
```

## pgvector Setup

Follows the apex-platform pattern:

1. `scripts/setup-db.sh` — Creates the database and runs Drizzle migrations
2. `scripts/add-pgvector.sh` — Runs SQL migration that:
   - Creates `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
   - Adds `embedding vector(1536)` column to chunks table
   - Creates HNSW index: `CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops)`
3. Vector values are cast on insert (matching apex-platform's repository pattern)
4. Cosine distance search uses the `<=>` operator

## Dependencies

### Production

- `next`, `react`, `react-dom` — Framework
- `ai`, `@ai-sdk/openai`, `@ai-sdk/react` — AI SDK
- `drizzle-orm`, `pg` — Database
- `pdf-parse` — PDF text extraction
- `tailwindcss` — Styling
- shadcn/ui components — UI primitives

### Development

- `drizzle-kit` — Migration tooling
- `typescript`, `@types/node`, `@types/pg` — Type checking

## Design Decisions

1. **No authentication** — Training showcase runs locally, auth would distract from RAG concepts.
2. **No repository layer** — API routes access Drizzle directly. Minimizes indirection for educational clarity.
3. **Fixed-size chunking** — Simple, predictable, easy to explain. Character-based approximation (~2000 chars / ~500 tokens) with ~200 char overlap. Avoids tokenizer dependency.
4. **Build-time ingestion** — Standalone script rather than upload UI. Makes the data pipeline transparent and inspectable.
5. **Two API routes** — `/api/chat` for the full RAG pipeline, `/api/search` for isolated retrieval inspection.
6. **pgvector via SQL migration** — Matches apex-platform patterns; Drizzle doesn't natively support vector types.

## Baseline References

- **Architecture patterns:** `/Volumes/NVMe/Development/IdeaProjects/n-ix/apex-platform` (pgvector setup, Drizzle config, AI SDK integration)
- **AI configuration:** `/Volumes/NVMe/Development/IdeaProjects/training/_reference/reference-typescript-project` (OpenAI API key, Vercel AI SDK patterns)
- **Bootstrap data:** `/Volumes/Media/Documents/Training courses/AI/AI Introduction & Integration` (~31 documents covering AI/ML, RAG, vector databases, prompt engineering)
