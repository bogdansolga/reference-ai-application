# Reference AI: Rename, Homepage, Deck-Based RAG and Deck Styling — Design

**Date:** 2026-11-12
**Status:** Approved for planning

## Goal

The app now showcases two AI patterns, RAG and AI Agents, so it moves from "reference-rag" to "reference-ai". This change:

1. renames the project inside the repo and in the UI;
2. adds a homepage that explains both patterns, how they complement each other, and why RAG is a level-1-autonomy agent;
3. makes the training HTML decks the RAG knowledge base, and keeps them in sync as the decks are refined;
4. restyles the whole app in the decks' look.

## Decisions (from alignment)

| Topic | Decision |
|---|---|
| Rename scope | Repo contents + UI. The DB name (`rag_training`), local folder, git remote and Claude memory path are **not** changed. The user renames the folder and repo (commands given at the end). |
| Decks | 5-context-engineering, 6-agents-claude-code, 9-vector-databases, 10-rag-introduction |
| Decks' role | **RAG source only.** No slide viewer, no copies in the app. |
| Freshness | Re-ingest on change (content hash). Runs automatically before `bun dev`. |
| Chunking | One chunk per slide |
| Styling | The app takes the decks' look, everywhere |
| `Simple RAG overview.pdf` | No longer needed: removed, together with PDF ingestion (see §5) |

## 1. Rename

- `reference-rag-application` → `reference-ai-application` in `package.json`, `bun.lock`, `.serena/project.yml`, `README.md`, `docs/SETUP.md`, `CLAUDE.md`, `docs/superpowers/specs/*` and `docs/handoffs/*`.
- **Exception:** the Claude memory path (`~/.claude/projects/-Users-…-reference-rag-application/…`) stays literal, because it is the real path until the folder is renamed.
- UI brand "RAG Training Showcase" → **"Reference AI"** (`layout.tsx` metadata, header, docs). Metadata description: "RAG and AI Agents, side by side, running locally".
- Not changed: `rag_training` in `scripts/setup-db.sh` and `.env.local.example`, and the git remote.
- At the end, print these for the user to run:
  - `gh repo rename reference-ai-application`
  - `git remote set-url origin …`
  - `mv` of the folder

## 2. Routes and shared header

| Route | Content |
|---|---|
| `/` | **New homepage** (`src/app/page.tsx`, server component, static) |
| `/chat` | RAG chat, moved from `/` (`src/app/chat/page.tsx` renders `<Chat />`) |
| `/agent` | unchanged |
| `/overview` | unchanged content (RAG architecture) |

- New `src/components/site-header.tsx`: the brand "Reference AI" (links to `/`), and nav links Home · RAG Chat · Agent · RAG Overview. The current route is highlighted (client component, `usePathname`).
- It replaces the hand-rolled headers in `chat.tsx`, `overview/page.tsx` and `agent-runs.tsx`.
- Page-specific badges (e.g. "Architecture Overview") are dropped. The active nav item already shows where you are.

## 3. Homepage content

All copy is written in the app. It is not pulled from the decks.

1. **Hero.** Kicker "Reference AI". Title "Two ways to put an LLM to *work*". Lede: an LLM alone knows only its training data and can only talk; RAG gives it your *knowledge*, and an agent gives it *actions*. Everything here runs locally on oMLX.
2. **Two pattern cards** (side by side; stacked on narrow screens):
   - **RAG: grounding.** What: retrieve relevant chunks, add them to the prompt, generate a grounded answer with citations. Loop: question → embed → vector search → prompt + context → answer. The path is fixed by code. Use it for questions over your own documents. Links: *Try the RAG chat* (`/chat`), *How it is built* (`/overview`).
   - **Agents: acting.** What: the model decides which tools to call, reads their results and repeats until done. Loop: request → model → tool calls → results → model → … → answer, up to 5 steps. Use it for multi-step tasks, calculations, and reading or writing data. Link: *Watch the agent work* (`/agent`).
3. **How they complement each other.** Three short points:
   - RAG answers "what do we know?"; agents answer "what should be done next?".
   - They compose: the agent's `search_documents` tool *is* RAG, called only when the model decides it needs knowledge.
   - Tradeoff: RAG is predictable, cheap and always one retrieval. An agent is flexible, but spends more calls and tokens, and needs guardrails (read vs. write tools).
4. **Levels of autonomy** (wording aligned with the agents deck), as five compact steps:
   - L1 AI as an assistant
   - L2 Partial automation
   - L3 Conditional autonomy in a defined scope
   - L4 High autonomy
   - L5 Full autonomy

   Markers:
   - **RAG chat: L1.** It is conversational augmented chat: the code always retrieves, and the model only answers. It suggests, people decide.
   - **Agent demo: L2.** The model chooses the tools, and people see and oversee every step.
   - L3–L5 are greyed, labelled "beyond this demo".

   A one-line note: each step up needs sharper definitions of Ready and Done and stronger guardrails.
5. **Footer line:** "Knowledge base: the AI training decks (context engineering, agents, vector databases, RAG), re-indexed when they change."

## 4. Styling: the decks' look

- **Fonts:** Instrument Serif (400, plus italic) for headings and Inter (400/500/600) for body, through `next/font/google` (self-hosted at build time, with no runtime Google request). They are exposed as `--font-serif` and `--font-sans`.
- **Tokens:** `globals.css` keeps the existing variable names, so the pages restyle with few edits, and adds the deck tokens:

| Variable | Value | Deck source |
|---|---|---|
| `--foreground` / `--ink` | `#14263d` | `--ink` |
| `--muted` | `#5d6f84` | `--muted` |
| `--primary` / `--blue` | `#0e4c92` | `--blue` |
| `--border` / `--line` | `#e4eaf1` | `--line` |
| `--card` | `#f6f9fd` | `--card-end` |
| `--input` | `#f6f9fd` | |
| `--accent` / `--accent-border` | `#e8f1fb` / `#c9dcf2` | `--sky` |
| `--sage`, `--sage-deep`, `--sage-panel`, `--sage-border` | `#5fb49c`, `#2f7d67`, `#eef7f3`, `#cfe7de` | same |
| `--user-bubble` | `#0e4c92` | |

- **Type:**
  - Page titles (`h1`) and section titles (`h2`) use the serif. `em` inside them is italic blue, the decks' signature.
  - Kicker labels are small caps, `letter-spacing .16em`, in sage-deep.
  - Body text is Inter.
- **Cards:** white background, 1px `--line` border, a soft gradient to `--card`, and a 12–16px radius. The highlighted card (`hi`) has a sky background.
- **Unchanged:** the agent's semantic colors (amber read tools, red write tools, pink earlier turns, slate summary, grey dashed errors) and the context-segment palette.
- **Hard-coded colors:** any hard-coded indigo (`#4f46e5`) in `chat.tsx`, `overview/page.tsx` or `agent-runs.tsx` is replaced by `var(--primary)`.

## 5. Decks as the RAG knowledge base

### Sources and configuration

- New env var **`DECKS_DIR`**. Default: `/Users/bsolga/Documents/oman-lng/oman-lng-ai-acceleration-training/decks/html/ai-intro-integ`. Documented in `.env.local.example` and `CLAUDE.md`.
- New `src/lib/decks.ts` exports `DECK_FILES` (the 4 filenames above), `decksDir` and `extractSlides(html)`.
- **PDF ingestion is removed.** `Simple RAG overview.pdf` was the only PDF, and it is no longer needed.
  - Deleted: the root copy (git-tracked) and the `data/` copy, along with the `pdf-parse` dependency and the PDF branch of `scripts/ingest.ts`.
  - The docs no longer tell users to add PDFs to `data/`. `data/` is removed if it is left empty.

### Slide extraction (`extractSlides`)

- Parser: `node-html-parser` (one new dependency, no DOM).
- For each `section.slide`, in order (1-based `slide` = position in the deck):
  - `title` = the `data-title` attribute (HTML entities decoded)
  - skip slides titled `Q&A`
  - text, in document order: `.kicker`, `h1/h2` (title), `.lede`, then for each card `.h`, `p`, `li`, and `.more` text (hidden expand text included); tables as `cell | cell` rows; notes and quotes as paragraphs
  - drop every `<svg>` (icons and figures) and `<script>`; collapse whitespace; one line per block element
- Deck title = the `<title>` of the HTML file (e.g. "Retrieval Augmented Generation (RAG) Introduction").
- **Chunk text:** `Deck: <deck title> · Slide <n>: <slide title>\n<extracted lines>`.
  - If a slide's chunk is longer than 2000 characters, it is split with the existing size/overlap splitter, and each part keeps the prefix line.
  - Slides with no text beyond the prefix are skipped.
- **Chunk metadata:** `{ filename, source: "deck", deckTitle, slide, slideTitle }`.

### Change detection and pruning

- **Schema (Drizzle migration):**
  - `documents` gains `source text not null default 'deck'` and `content_hash text`.
  - `filename` becomes unique.
  - `chunks.document_id` gets `ON DELETE CASCADE`.
  - The migration first deletes the existing PDF document and its chunks (that data is being removed anyway), so the unique constraint applies to a clean table.
- **`scripts/ingest.ts` (rewritten), for each deck:**
  1. Read the file. If it is missing, warn and continue.
  2. Extract the slides, then `hash = sha256(joined chunk texts)`.
  3. If a document with this filename has the same hash, **skip** it: no embedding calls.
  4. Otherwise, delete the old document (chunks cascade), insert the new document with the hash, embed the chunks (existing batching), and insert them.
  5. **Prune:** delete documents whose filename is not in `DECK_FILES`. This also removes the old PDF if the migration has not.
  6. Print a summary: `new n · updated n · unchanged n · pruned n · chunks n`.
- Each document is replaced in one transaction (delete + insert document + insert chunks), so a failed embedding never leaves a half-indexed deck. Embeddings are computed *before* the transaction opens.

### Auto-run

- `package.json`: `"predev": "bun scripts/ingest.ts --soft"`.
  - `--soft`: if `DECKS_DIR`, oMLX or the DB is unreachable, print a warning and exit 0, so `bun dev` still starts.
  - Without `--soft` (plain `bun ingest`, `bootstrap`), these failures exit 1.
- Not added to `prebuild`. Building must not depend on oMLX.

### Citations

- `search_documents` (agent) results include `slide` and `slideTitle` when present.
- The agent `SYSTEM_PROMPT` asks the model to cite as `deck title, slide n`.
- `/api/search`, and the chat's source chips, show `<filename> · slide <n>: <slideTitle>` for deck chunks.
- `formatContext` (chat RAG prompt) labels each chunk with the same citation.

## 6. Files touched

| New | Changed | Deleted |
|---|---|---|
| `src/app/chat/page.tsx` | `src/app/page.tsx` (homepage), `src/app/layout.tsx` (fonts, metadata), `src/app/globals.css` | `Simple RAG overview.pdf` (root), `data/Simple RAG overview.pdf` |
| `src/components/site-header.tsx` | `src/components/chat.tsx`, `src/components/agent-runs.tsx`, `src/app/overview/page.tsx` (header, colors) | `pdf-parse` dependency |
| `src/lib/decks.ts` | `scripts/ingest.ts`, `src/lib/schema.ts` + new `drizzle/0003_*.sql` | |
| | `src/lib/retrieval.ts`, `src/lib/agent-tools.ts`, `src/lib/agent.ts` (citations) | |
| | `package.json`, `bun.lock`, `.serena/project.yml`, `.env.local.example`, docs (README, SETUP, CLAUDE.md, specs, handoff) | |

## 7. Error handling

- A deck file is missing: warn and skip it. Its indexed version is kept, since pruning only removes filenames that are not in `DECK_FILES`. A temporarily unavailable folder therefore never wipes the knowledge base.
- `DECKS_DIR` is missing entirely: `--soft` warns and exits 0; otherwise exit 1. The index is unchanged.
- A deck parses to 0 slides (markup changed): warn loudly and keep the previous index for that deck, with no replacement.
- An embedding fails: the transaction for that deck is not started, the previous version stays, and the error is reported.

## 8. Verification (no unit tests; project rule)

1. `bunx tsc --noEmit` and `bun run build` pass.
2. `bun db:migrate`, then `bun ingest`: 4 new decks, about 50 chunks. A second `bun ingest` reports `unchanged 4` with no embedding calls.
3. Change detection: temporarily point `DECKS_DIR` at a scratch copy where one deck has one slide's text edited. Exactly that deck is `updated`.
4. Pruning: the PDF document no longer exists (`select filename from documents`).
5. `curl "localhost:3000/api/search?q=levels of autonomy"`: the top hit is `6-agents-claude-code.html · slide 5: Levels of autonomy`.
6. Agent: "What are the four parts of a RAG system?" calls `search_documents`, and the answer cites the RAG deck slide.
7. `bun dev` with oMLX stopped: predev warns and the dev server starts.
8. Browser check:
   - `/`: hero, pattern cards, complementarity section, autonomy ladder with the L1/L2 markers.
   - `/chat`, `/agent` and `/overview` use the new fonts and colors and the shared header, with the agent's tool colors unchanged.
   - Narrow-width layout.
9. `grep -ri "reference-rag"` finds only the Claude memory path references.
