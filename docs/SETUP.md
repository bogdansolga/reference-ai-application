# Setup Guide

Step-by-step guide for setting up and running the Reference AI application.

## Prerequisites

- **Bun** (v1.1+) — [Install Bun](https://bun.sh/)
- **PostgreSQL** (v15+) with the [pgvector](https://github.com/pgvector/pgvector) extension installed
- **oMLX** (Apple Silicon) — local OpenAI-compatible server for chat + embeddings, see below

## 1. Install Dependencies

```bash
bun install
```

## 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your settings:

```bash
DATABASE_URL=postgresql://your_user@localhost:5432/rag_training
EMBEDDING_BASE_URL=http://localhost:8000/v1  # local oMLX server (default)
EMBEDDING_API_KEY=sk-omlx-...      # from ~/.omlx/settings.json → auth.api_key
EMBEDDING_MODEL=bge-m3             # optional, this is the default
EMBEDDING_DIMENSIONS=1024          # optional, must match the model
CHAT_MODEL=Qwen3-4B-Instruct-2507-4bit  # optional, served by the same oMLX server/key
```

### Local models with oMLX (BAAI/bge-m3 + Qwen3-4B)

Embeddings run locally on Apple Silicon via [oMLX](https://github.com/jundot/omlx), which exposes an OpenAI-compatible `/v1/embeddings` endpoint on port 8000.

1. Install oMLX (`.dmg` from the GitHub releases → Applications) and launch it once; the server auto-starts and creates `~/.omlx/`.
2. Download [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) into the oMLX model directory:

   ```bash
   cd ~/.omlx/models
   uvx --from huggingface_hub hf download BAAI/bge-m3 --local-dir bge-m3 \
     --include config.json pytorch_model.bin "tokenizer*" special_tokens_map.json \
       sentencepiece.bpe.model modules.json "1_Pooling/*" "*sentence*.json"
   ```

3. oMLX embedding models need safetensors, but the official repo only ships `pytorch_model.bin`. Convert it (lossless, fp32):

   ```bash
   uv run --no-project --with torch --with safetensors --with numpy python -c '
   import torch; from safetensors.torch import save_file
   d = "'$HOME'/.omlx/models/bge-m3"
   sd = torch.load(f"{d}/pytorch_model.bin", map_location="cpu", weights_only=True)
   save_file({k: v.contiguous() for k, v in sd.items()}, f"{d}/model.safetensors", metadata={"format": "pt"})'
   rm ~/.omlx/models/bge-m3/pytorch_model.bin
   ```

4. Restart and verify:

   ```bash
   ~/.omlx/bin/omlx restart
   curl -s localhost:8000/v1/embeddings -H "Authorization: Bearer $EMBEDDING_API_KEY" \
     -H 'Content-Type: application/json' -d '{"model":"bge-m3","input":"hello"}' | head -c 200
   ```

Download the chat model too (MLX format, loads as-is):

```bash
cd ~/.omlx/models
uvx --from huggingface_hub hf download mlx-community/Qwen3-4B-Instruct-2507-4bit --local-dir Qwen3-4B-Instruct-2507-4bit
~/.omlx/bin/omlx restart
```

bge-m3 returns 1024-dim, L2-normalized vectors (CLS pooling) and supports 100+ languages and inputs up to 8192 tokens.
```

## 3. Set Up the Database

You can run all steps at once:

```bash
bun bootstrap
```

Or step by step:

```bash
# Create database and run Drizzle migrations
bun db:setup

# Enable pgvector extension and create HNSW index
bun db:embeddings-setup
```

## 4. Point to the Training Decks

The knowledge base is the "AI Introduction & Integration" HTML decks (context engineering, AI agents, vector databases, RAG). Set their folder in `.env.local`:

```bash
DECKS_DIR=/path/to/oman-lng-ai-acceleration-training/decks/html/ai-intro-integ
```

The deck list is `DECK_FILES` in `src/lib/decks.ts`.

## 5. Index the Decks

```bash
bun ingest
```

This will:
- Read each deck from `DECKS_DIR` and extract one chunk per slide (title, text, card details, figure labels)
- Skip a deck whose content hash is unchanged, so only refined decks are re-embedded
- Embed changed decks via BAAI/bge-m3 on the local oMLX server and replace their chunks in one transaction
- Remove documents that are no longer in the deck list

`bun dev` runs this automatically first (`predev`, in soft mode: if oMLX, the DB or the decks are unavailable it warns and starts anyway).

## 6. Start the Application

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Pages

| URL | Description |
|-----|-------------|
| `/` | Homepage — RAG and Agents, how they complement each other, levels of autonomy |
| `/rag/chat` | RAG chat — ask questions about the training decks |
| `/rag/overview` | How the RAG pipeline is built: system diagram, ingestion and querying phases |
| `/agent/demo` | Tool-using agent demo — live trace of model calls, prompts, tool calls and context usage |
| `/agent/overview` | How the agent works: the loop, the context window, its prompt and tools |

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Re-index changed decks, then start the dev server with Turbopack |
| `bun run build` | Production build |
| `bun start` | Start production server |
| `bun db:setup` | Create database + run Drizzle migrations |
| `bun db:embeddings-setup` | Enable pgvector extension + create HNSW index |
| `bun db:generate` | Generate Drizzle migrations from schema changes |
| `bun db:migrate` | Run pending Drizzle migrations |
| `bun db:studio` | Open Drizzle Studio (visual DB editor) |
| `bun ingest` | Index the training decks (skips unchanged ones) |
| `bun bootstrap` | Run all setup steps in order |

## Troubleshooting

### "pgvector extension not found"
Install pgvector for your PostgreSQL version. On macOS with Homebrew:
```bash
brew install pgvector
```

### "Port 3000 is in use"
Next.js will automatically use the next available port. Check the terminal output for the actual URL.

### Embedding errors
Make sure oMLX is running (`curl localhost:8000/health`), `bge-m3` appears in `/v1/models`, and `EMBEDDING_API_KEY` matches `auth.api_key` in `~/.omlx/settings.json`. If you switch embedding models, re-create the `embedding` column with the new `EMBEDDING_DIMENSIONS` and re-ingest.

### Empty responses from chat
Make sure `DECKS_DIR` points to the decks and `bun ingest` has run. The chat uses vector search to find relevant context — without ingested documents, there's nothing to retrieve.
