# Reference AI

A training showcase of two AI patterns, side by side and fully local: **RAG** (grounding an LLM in your knowledge) and **AI Agents** (an LLM that calls tools in a loop). The knowledge base is the AI training HTML decks, re-indexed when they change.

## What It Does

1. **Indexes the training decks** — one chunk per slide, embedded with bge-m3 into PostgreSQL + pgvector; a deck is re-embedded only when its content hash changes
2. **Answers questions** — embeds user queries, searches for similar chunks via cosine similarity, streams LLM responses grounded in retrieved context
3. **Shows sources** — the deck and slide behind each answer, with similarity scores
4. **Runs a tool-using agent** — a live trace of every model call, prompt, tool call and the context window

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| AI | Vercel AI SDK + local oMLX (Qwen3-4B chat, BAAI/bge-m3 embeddings) |
| Database | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| Styling | Tailwind CSS v4, the decks' look (Instrument Serif + Inter), three.js hero scenes |
| Runtime | Bun |

## Quick Start

```bash
bun install
cp .env.local.example .env.local   # add your EMBEDDING_API_KEY (oMLX); DATABASE_URL is set by bun db:setup
bun bootstrap                       # set up DB, pgvector, and index the decks (DECKS_DIR)
bun dev                             # re-indexes changed decks, then starts at http://localhost:3000
```

See the **[Setup Guide](docs/SETUP.md)** for detailed instructions, prerequisites, and troubleshooting.

## Architecture

```
User Question
  → Embed query (BAAI/bge-m3 via local oMLX, 1024 dims)
  → Vector search (pgvector cosine similarity, top 5 chunks)
  → Augment prompt with retrieved context
  → Stream LLM response (Qwen3-4B-Instruct on oMLX)
  → Display with source citations
```

The app has a homepage and two sections:
- **/** — Homepage: RAG and Agents, how they complement each other, levels of autonomy
- **/rag/chat** and **/rag/overview** — RAG: chat over the training decks, and how the pipeline is built
- **/agent/demo** and **/agent/overview** — the tool-using agent: live trace of model calls, prompts, tool calls and context usage, and how it works

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| **[Setup Guide](docs/SETUP.md)** | Developers | Prerequisites, installation, configuration, troubleshooting |
| **[CLAUDE.md](CLAUDE.md)** | Claude Code / AI agents | Project context, critical patterns, architecture rules |
| **[RAG Overview](docs/rag-overview.md)** | Students / learners | Architecture diagrams, ingestion & querying phases, design tradeoffs |
| **[Design Spec](docs/superpowers/specs/2026-03-25-rag-application-design.md)** | Architects | Full design specification with data model, API design, and decisions |
| **[Agent Demo Spec](docs/superpowers/specs/2026-11-11-agent-tools-demo-design.md)** | Architects | Design of the tool-using agent demo page |
| **[Reference AI Spec](docs/superpowers/specs/2026-11-12-reference-ai-home-decks-design.md)** | Architects | Homepage, deck-based RAG, styling and hero scenes |

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Homepage
│   ├── rag/                  # layout (hero + tabs), chat/, overview/
│   ├── agent/                # layout (hero + tabs), demo/, overview/
│   └── api/
│       ├── agent/route.ts    # Agent loop, streamed as SSE
│       ├── chat/route.ts     # RAG chat endpoint
│       └── search/route.ts   # Vector search endpoint
├── lib/
│   ├── agent.ts              # Hand-written agent loop + token accounting
│   ├── agent-tools.ts        # Agent tools (search, calculator, time, save/list notes)
│   ├── llm-config.ts         # oMLX base URL / key / chat model
│   ├── prompts.ts            # Loads the prompts in src/prompts/*.md once, at startup
│   ├── decks.ts              # Deck list + slide extraction → chunks
│   ├── core/utils/logger.ts  # Server logger
│   ├── db.ts                 # Database connection
│   ├── schema.ts             # Table definitions
│   ├── embeddings.ts         # Embedding helpers
│   └── retrieval.ts          # Vector search + context formatting
└── components/
    ├── agent-runs.tsx        # Agent demo UI
    ├── chat.tsx              # Chat component
    ├── site-header.tsx       # Shared header
    ├── scene-hero.tsx        # Animated hero band
    └── scenes/               # three.js scenes ported from the decks' kit
├── prompts/                  # Every LLM prompt, as Markdown
└── instrumentation.ts        # Loads the prompts at server start

scripts/
├── ingest.ts                 # Deck ingestion (hash-based skip / replace / prune)
├── setup-db.sh               # Database setup
├── add-pgvector.sh           # pgvector setup
└── migrations/
    └── add-pgvector.sql      # Vector column + HNSW index
```

## License

Training showcase — intended for educational use.
