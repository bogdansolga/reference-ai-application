# Agent Tools Demo — Design

**Date:** 2026-11-11
**Status:** Approved in brainstorming, pending spec review

## Goal

A new `/agent` page that demonstrates how an LLM agent uses tools. The user submits a simple request and the page shows the execution history live: every model call, the exact prompt sent, every tool call and result, and how the context window fills up.

It runs fully locally on oMLX: Qwen3-4B-Instruct-2507-4bit generates and calls tools, and BAAI/bge-m3 powers `search_documents`.

## Scope

**Phase A (this spec):** agentic RAG with three read-only tools, run history in browser memory.

**Phase C (later, separate spec):**
- `save_note` / `list_notes` tools (a write tool and a read tool, with a `notes` table)
- persist runs to the DB (a `runs` table) so history survives a refresh

The tool registry and the event model are designed so phase C only adds entries and storage, with no restructuring.

**Out of scope:**
- multi-turn agent conversations (each run is one independent request)
- token-level streaming of the final answer
- authentication

## Architecture

```
src/app/agent/page.tsx        → page shell, renders <AgentRuns />
src/components/agent-runs.tsx → client: input, example chips, run cards, live trace, context bars
src/app/api/agent/route.ts    → POST {request} → SSE stream of agent events
src/lib/agent.ts              → runAgent(userText, emit, signal): explicit loop + token accounting
src/lib/agent-tools.ts        → tool registry: name, description, JSON schema, execute()
src/lib/llm-config.ts         → shared oMLX base URL + API key resolution
```

- `llm-config.ts` exports the resolved `baseURL` (`CHAT_BASE_URL` → `EMBEDDING_BASE_URL` → `http://localhost:8000/v1`) and `apiKey` (`CHAT_API_KEY` → `EMBEDDING_API_KEY`). `src/app/api/chat/route.ts` is refactored to use it, so both routes resolve the server the same way.
- Following CLAUDE.md, there are no service or repository layers: the route calls `runAgent` directly.
- Navigation: add an "Agent demo" link beside the existing "Overview" link in the chat header (`src/components/chat.tsx`) and on the overview page.

## Tools (`agent-tools.ts`)

Each tool is one object: `{ name, description, parameters (JSON Schema), execute(args) => Promise<unknown> }`. The registry exports the list, and the OpenAI-format `tools` array is derived from it.

| Tool | Parameters | Behavior |
|---|---|---|
| `search_documents` | `query: string`, `limit?: integer (1–5, default 3)` | `embedQuery(query)` → `searchSimilar(embedding, limit)` → `[{ filename, chunkIndex, similarity (2 dp), content }]` |
| `calculator` | `expression: string` | A small recursive-descent parser for numbers, `+ - * / % ^`, unary minus and parentheses. **No `eval`/`Function`.** Returns `{ expression, result }`. Invalid input throws, and the error becomes `{ error }` for the model. |
| `current_time` | none | `{ iso, local, timeZone }`, using the server's local timezone |

## Agent loop (`agent.ts`)

```
messages = [system, user]
for step in 1..MAX_STEPS (5):
    emit model_call_start { step, request: { model, messages, tools, temperature } }
    response = POST {baseURL}/chat/completions (non-streaming, temperature 0.2, signal)
    context = accountContext(messages, tools, response.usage)
    emit model_call_end { step, message, usage, timings, context }
    if message has no tool_calls → emit final { answer: message.content }; return
    messages.push(message)                      // assistant turn with tool_calls
    run all tool_calls in parallel:
        emit tool_start { step, id, name, args }
        result = parse args JSON → execute(args) // any failure → { error: string }
        emit tool_end { step, id, name, result, durationMs }
        messages.push({ role: "tool", tool_call_id: id, content: JSON.stringify(result) })
emit final { answer: null, reason: "max_steps" }
```

- **System prompt** (shown on the page): use `search_documents` for questions about the training material, `calculator` for any arithmetic and `current_time` for dates and times. Otherwise answer directly. Cite filenames when using retrieved content.
- `MAX_STEPS = 5`, `temperature = 0.2`, model = `CHAT_MODEL` (default `Qwen3-4B-Instruct-2507-4bit`).
- The loop stops when the client aborts (an `AbortSignal` comes from the request).

## Event protocol (`POST /api/agent`)

- Request body: `{ "request": string }`. An empty or missing value returns 400.
- Response: `text/event-stream`. Each event is `event: <type>\ndata: <json>\n\n`.

| Event | Payload |
|---|---|
| `run_start` | `{ model, maxSteps, contextWindow, systemPrompt, tools }` |
| `model_call_start` | `{ step, request }`: the exact request body sent to oMLX |
| `model_call_end` | `{ step, message, usage: { promptTokens, completionTokens }, timings: { ttftSec, totalSec, genTps }, context }` |
| `tool_start` | `{ step, id, name, args }` |
| `tool_end` | `{ step, id, name, result, durationMs }` |
| `final` | `{ answer: string \| null, reason?: "max_steps" }` |
| `error` | `{ message, hint? }`: the stream closes after this |

The client reads the stream with `fetch` + `ReadableStream` reader + a minimal SSE parser and does not use `useChat`.

## Context accounting

For each model call, `accountContext` counts segments with oMLX `POST /tokenize` (`{ model, prompt }` → `{ count }`), running them in parallel:

| Segment | Text tokenized |
|---|---|
| `system` | system message content |
| `tools` | `JSON.stringify(tools)` |
| `user` | user message content |
| `assistantToolCalls` | each assistant message's tool names + arguments JSON, concatenated |
| `toolResults` | each `tool` message content, concatenated |
| `overhead` | `usage.prompt_tokens − sum(above)`, clamped at ≥ 0 |

`context` payload: `{ segments: { system, tools, user, assistantToolCalls, toolResults, overhead }, promptTokens, contextWindow, percentUsed }`.

`contextWindow` comes from `AGENT_CONTEXT_WINDOW` (default `32768`, oMLX's default `max_context_window`).

The accounting finishes before `model_call_end` is emitted, so the UI never shows partial bars.

## UI (`/agent`, single-column layout "B")

- **Top:**
  - page title
  - a collapsible "What the agent can do" panel (system prompt + the three tool schemas exactly as sent)
  - example chips: *"What is 17% of 2,340 and what time is it?"*, *"What are the main steps of RAG?"* and *"Hi!"*
  - a request input + "Run agent" button, disabled while a run is in progress
- **Run cards,** newest first, kept in React state for the session only:
  - **Header:** `#n`, the request text, chips for the tools used, and totals (model calls · prompt+completion tokens · peak % of context · wall time). The newest card is expanded and older ones are collapsed (click to toggle).
  - **Model call step** (blue): a spinner while pending. When done: the stacked context bar (system, tools, user, assistant tool calls, tool results, overhead), exact counts in a legend/tooltip, `prompt / completion` tokens, TTFT, gen tok/s and `% of context`. Collapsibles: **▸ Prompt** (messages array, each message labeled by role) and **▸ Response** (raw assistant message).
  - **Tool step** (amber): `name(args)` → result (long results truncated with expand) + duration. Parallel calls from one step are grouped together.
  - **Final** (green): the answer rendered with `react-markdown`. A `max_steps` ending is shown explicitly.
  - **Error** (red): the message + hint.
- **Bottom:** an "In production" callout with a 5-line AI SDK snippet (`streamText({ model, tools, stopWhen: stepCountIs(5) })`).
- **Styling:** light theme, using the existing CSS custom properties in `globals.css` and the existing font scale.

## Error handling

- **Tool execution errors and malformed tool-argument JSON:** the tool result becomes `{ "error": "..." }` and is returned to the model. The loop continues.
- **oMLX non-2xx or unreachable:** an `error` event with the hint "Is oMLX running? `curl localhost:8000/health`", and the stream closes.
- **`/tokenize` failure:** the counts for that call fall back to `null`. The UI shows the totals from `usage` without a bar, and the run continues.
- **Client abort:** the `AbortSignal` cancels the in-flight fetch and stops the loop.

## Verification

There are no unit tests (project decision). Verification is:

1. `bunx tsc --noEmit` passes.
2. An end-to-end check with `curl -N -X POST localhost:3000/api/agent` for each example prompt:
   - The arithmetic + time prompt sends `calculator` and `current_time` tool events and a correct final answer.
   - The RAG prompt sends a `search_documents` event and the answer cites `Simple RAG overview.pdf`.
   - "Hi!" gives one model call with no tools.
   - For every `model_call_end`, the segment sum + overhead = `promptTokens`, and overhead is small and positive. If overhead is clamped to 0, the standalone segment counts overshoot the templated prompt. That's a bug to investigate, not something to accept.
3. A browser check of `/agent`: the steps appear live, the context bars render, the prompt/response collapsibles work, older runs collapse and the nav links work.
4. Update `CLAUDE.md` (project structure + `AGENT_CONTEXT_WINDOW`), plus `README.md` and `docs/SETUP.md` where they list pages.
