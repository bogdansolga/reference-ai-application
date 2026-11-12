"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { SceneHero } from "@/components/scene-hero";
import { SiteHeader } from "@/components/site-header";
import Markdown from "react-markdown";

// ---------- Types mirroring the SSE events from /api/agent ----------

type ToolKind = "read" | "write";

interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface Segments {
  system: number;
  tools: number;
  history: number;
  user: number;
  assistantToolCalls: number;
  toolResults: number;
  overhead: number;
}

interface ContextInfo {
  segments: Segments | null;
  promptTokens: number;
  contextWindow: number;
  percentUsed: number;
}

type Usage = { promptTokens: number; completionTokens: number };
type Timings = { ttftSec: number | null; totalSec: number; genTps: number | null };

interface HistoryInfo {
  turns: { request: string; mode: "summary" | "full"; tokens: number; fullTokens: number }[];
  tokens: number;
  fullTokens: number;
}

interface ModelStep {
  type: "model";
  step: number;
  request: { messages: WireMessage[] };
  done: boolean;
  message?: WireMessage;
  usage?: Usage;
  timings?: Timings;
  context?: ContextInfo;
}

interface ToolCallView {
  id: string;
  name: string;
  args: unknown;
  done: boolean;
  result?: unknown;
  durationMs?: number;
}

interface ToolsStep {
  type: "tools";
  step: number;
  calls: ToolCallView[];
}

type Step = ModelStep | ToolsStep;

interface SummaryStep {
  request: { messages: WireMessage[] };
  done: boolean;
  summary?: string | null;
  usage?: Usage;
  timings?: Timings;
  error?: string;
}

/** One turn of a session = one agent run. */
interface Turn {
  key: string;
  dbId?: number;
  request: string;
  status: "running" | "done" | "error" | "aborted";
  elapsedMs: number;
  history: HistoryInfo | null;
  steps: Step[];
  answer?: string | null;
  reason?: string;
  summary?: SummaryStep;
  error?: { message: string; hint?: string };
}

type AgentEvent = { type: string; [key: string]: unknown };

interface StoredRun {
  id: number;
  request: string;
  status: "done" | "error" | "aborted";
  events: AgentEvent[];
}

interface SessionRow {
  id: number;
  title: string;
  createdAt: string;
  turns: number;
}

// ---------- Visual vocabulary ----------

const SEGMENTS: { key: keyof Segments; label: string; color: string; help: string }[] = [
  { key: "system", label: "System prompt", color: "#6366f1", help: "Instructions, re-sent on every call" },
  { key: "tools", label: "Tool definitions", color: "#a855f7", help: "JSON schemas of all tools, re-sent on every call" },
  { key: "history", label: "Earlier turns", color: "#ec4899", help: "Previous turns of this session, re-sent as summaries or as request + answer" },
  { key: "user", label: "User message", color: "#0ea5e9", help: "This turn's request" },
  { key: "assistantToolCalls", label: "Assistant tool calls", color: "#f59e0b", help: "This turn's earlier model steps that asked for tools" },
  { key: "toolResults", label: "Tool results", color: "#10b981", help: "What the tools returned, kept for every later call of this turn" },
  { key: "overhead", label: "Template overhead", color: "#9ca3af", help: "Chat-template tokens: role markers plus the instruction text the template wraps around the tool definitions" },
];

const TOOL_STYLE: Record<ToolKind, { box: string; badge: string }> = {
  read: { box: "border-l-amber-500 bg-amber-50", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  write: { box: "border-l-red-600 bg-red-50", badge: "bg-red-100 text-red-800 border-red-300" },
};

const EXAMPLES_NEW = [
  "What is 17% of 2,340 and what time is it?",
  "What are the main steps of RAG?",
  "Search the docs for embeddings, for chunking and for vector databases, then compare them",
  "Save a note: review the HNSW index settings before the workshop",
  "What notes have I saved?",
];

const EXAMPLES_FOLLOW_UP = [
  "Now double that number.",
  "Which of those steps involve embeddings?",
  "Summarize what we discussed and save it as a note.",
];

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

// ---------- Event → turn state (pure, used for live turns and stored-turn replay) ----------

function reduceTurn(turn: Turn, ev: AgentEvent): Turn {
  const t: Turn = { ...turn, elapsedMs: Math.max(turn.elapsedMs, Number(ev.atMs) || 0) };
  const step = ev.step as number;
  switch (ev.type) {
    case "run_start":
      // Turns stored before the per-turn breakdown existed have `turns` as a count; skip their note.
      return { ...t, history: Array.isArray((ev.history as HistoryInfo | null)?.turns) ? (ev.history as HistoryInfo) : null };
    case "model_call_start":
      return {
        ...t,
        steps: [...t.steps, { type: "model", step, request: ev.request as ModelStep["request"], done: false }],
      };
    case "model_call_end":
      return {
        ...t,
        steps: t.steps.map((s) =>
          s.type === "model" && s.step === step
            ? {
                ...s,
                done: true,
                message: ev.message as WireMessage,
                usage: ev.usage as Usage,
                timings: ev.timings as Timings,
                context: ev.context as ContextInfo,
              }
            : s,
        ),
      };
    case "tool_start": {
      const call: ToolCallView = { id: ev.id as string, name: ev.name as string, args: ev.args, done: false };
      const steps = [...t.steps];
      const last = steps[steps.length - 1];
      if (last?.type === "tools" && last.step === step) steps[steps.length - 1] = { ...last, calls: [...last.calls, call] };
      else steps.push({ type: "tools", step, calls: [call] });
      return { ...t, steps };
    }
    case "tool_end":
      return {
        ...t,
        steps: t.steps.map((s) =>
          s.type === "tools" && s.step === step
            ? {
                ...s,
                calls: s.calls.map((c) =>
                  c.id === ev.id ? { ...c, done: true, result: ev.result, durationMs: ev.durationMs as number } : c,
                ),
              }
            : s,
        ),
      };
    case "final":
      // The turn stays "running" until it is saved, so the next turn sees it as history.
      return { ...t, answer: ev.answer as string | null, reason: ev.reason as string | undefined };
    case "summary_start":
      return { ...t, summary: { request: ev.request as SummaryStep["request"], done: false } };
    case "summary_end":
      return {
        ...t,
        summary: t.summary && {
          ...t.summary,
          done: true,
          summary: ev.summary as string | null,
          usage: ev.usage as Usage | undefined,
          timings: ev.timings as Timings | undefined,
          error: ev.error as string | undefined,
        },
      };
    case "error":
      return { ...t, status: "error", error: { message: ev.message as string, hint: ev.hint as string | undefined } };
    case "run_saved":
      return { ...t, dbId: ev.id as number, status: t.status === "running" ? (t.answer ? "done" : "error") : t.status };
    default:
      return t;
  }
}

function fromStored(row: StoredRun): Turn {
  const base: Turn = {
    key: `db-${row.id}`,
    dbId: row.id,
    request: row.request,
    status: "running",
    elapsedMs: 0,
    history: null,
    steps: [],
  };
  return { ...row.events.reduce(reduceTurn, base), status: row.status };
}

// ---------- SSE reader ----------

async function readEvents(res: Response, onEvent: (ev: AgentEvent) => void) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const type = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (type && data) onEvent({ type, ...JSON.parse(data) });
    }
  }
}

// ---------- Page component ----------

export function AgentRuns(props: {
  systemPrompt: string;
  tools: ToolDefinition[];
  toolKinds: Record<string, ToolKind>;
  maxSteps: number;
  contextWindow: number;
  fixedCost: { system: number; tools: number } | null;
}) {
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const running = turns.some((t) => t.status === "running");

  const loadSessions = async () => {
    const res = await fetch("/api/agent");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { sessions: SessionRow[] } = await res.json();
    setSessions(data.sessions);
    return data.sessions;
  };

  const openSession = async (id: number) => {
    const res = await fetch(`/api/agent?session=${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { runs: StoredRun[] } = await res.json();
    const loaded = data.runs.map(fromStored);
    setSessionId(id);
    setTurns(loaded);
    setExpanded(new Set(loaded.length ? [loaded[loaded.length - 1].key] : []));
  };

  // On load: open the most recent session, if any.
  useEffect(() => {
    loadSessions()
      .then((list) => (list.length ? openSession(list[0].id) : undefined))
      .catch((err) => setLoadError(`Could not load sessions: ${err.message}`));
  }, []);

  const newSession = () => {
    setSessionId(null);
    setTurns([]);
    setExpanded(new Set());
  };

  const deleteSession = async () => {
    if (sessionId == null) return;
    await fetch(`/api/agent?session=${sessionId}`, { method: "DELETE" });
    const list = await loadSessions();
    if (list.length) await openSession(list[0].id);
    else newSession();
  };

  const updateTurn = (key: string, fn: (t: Turn) => Turn) =>
    setTurns((prev) => prev.map((t) => (t.key === key ? fn(t) : t)));

  const submit = async (text: string) => {
    const request = text.trim();
    if (!request || running) return;
    const key = `live-${Date.now()}`;
    setTurns((prev) => [...prev, { key, request, status: "running", elapsedMs: 0, history: null, steps: [] }]);
    setExpanded(new Set([key])); // collapse earlier turns, focus on the new one
    setInput("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, sessionId }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);
      await readEvents(res, (ev) => {
        if (ev.type === "session") setSessionId(ev.id as number);
        else updateTurn(key, (t) => reduceTurn(t, ev));
      });
      updateTurn(key, (t) =>
        t.status === "running" ? { ...t, status: "error", error: { message: "Stream ended unexpectedly" } } : t,
      );
    } catch (err) {
      updateTurn(key, (t) => ({
        ...t,
        status: "error",
        error: { message: err instanceof Error ? err.message : String(err) },
      }));
    }
    void loadSessions().catch(() => undefined); // refresh titles + turn counts
  };

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit(input);
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const examples = turns.length ? EXAMPLES_FOLLOW_UP : EXAMPLES_NEW;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader />
      <SceneHero
        scene="agent"
        kicker="AI Agents · Acting"
        title={<>A tool-using <em>agent</em></>}
        lede={`The model decides which tools to call; our code runs them and feeds the results back, up to ${props.maxSteps} model calls per turn. Follow-up questions continue the session.`}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <ContextPrimer contextWindow={props.contextWindow} fixedCost={props.fixedCost} toolCount={props.tools.length} />

        <CapabilitiesPanel {...props} />

        {/* Session bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
          <label htmlFor="session" className="text-sm font-semibold">Session</label>
          <select
            id="session"
            value={sessionId ?? ""}
            disabled={running}
            onChange={(e) => (e.target.value ? void openSession(Number(e.target.value)) : newSession())}
            className="min-w-0 flex-1 max-w-xl bg-[var(--input)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
          >
            {sessionId == null && <option value="">New session</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} · {s.title} ({s.turns} turn{s.turns === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={newSession}
            disabled={running || sessionId == null}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--input)] disabled:opacity-50"
          >
            + New session
          </button>
          {sessionId != null && (
            <button
              type="button"
              onClick={() => void deleteSession()}
              disabled={running}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] underline disabled:opacity-50 ml-auto"
            >
              Delete session
            </button>
          )}
        </div>
        {loadError && <p className="text-sm text-[var(--muted)]">{loadError}</p>}

        <SessionContextChart turns={turns} contextWindow={props.contextWindow} />

        {/* Conversation, oldest turn first */}
        <div className="space-y-3">
          {turns.length === 0 && (
            <p className="text-center text-[var(--muted)] py-6">
              New session. Ask something, then ask a follow-up that depends on the answer.
            </p>
          )}
          {turns.map((turn, i) => (
            <TurnCard
              key={turn.key}
              turn={turn}
              number={i + 1}
              expanded={expanded.has(turn.key)}
              onToggle={() => toggle(turn.key)}
              toolKinds={props.toolKinds}
              contextWindow={props.contextWindow}
            />
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3 sticky bottom-0 bg-[var(--background)] py-3 border-t border-[var(--border)]">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={turns.length ? "Ask a follow-up…" : "Ask something that needs a tool, or not…"}
              disabled={running}
              className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-3 text-base placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            <button
              type="submit"
              disabled={running || !input.trim()}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-3 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {running ? "Running…" : turns.length ? "Continue" : "Run agent"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-[var(--muted)]">{turns.length ? "Follow up:" : "Try:"}</span>
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={running}
                onClick={() => void submit(ex)}
                className="text-sm px-3 py-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent)] text-[var(--primary)] hover:opacity-80 disabled:opacity-50 text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        </form>

        <SdkCallout />
      </main>
    </div>
  );
}

// ---------- Context window: primer, session chart, per-turn panel, per-call bar ----------

function ContextPrimer(props: {
  contextWindow: number;
  fixedCost: { system: number; tools: number } | null;
  toolCount: number;
}) {
  const fixed = props.fixedCost ? props.fixedCost.system + props.fixedCost.tools : null;
  return (
    <section className="border-2 border-[var(--accent-border)] bg-[var(--accent)] rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-2">Watch the context window</h2>
      <div className="grid md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-3xl font-bold text-[var(--primary)]">{fmt(props.contextWindow)}</p>
          <p className="text-[var(--muted)]">
            tokens is the most this server lets one model call hold: everything sent <i>and</i> generated.
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-[var(--primary)]">{fixed != null ? `~${fmt(fixed)}` : "—"}</p>
          <p className="text-[var(--muted)]">
            tokens are spent before the user types anything: system prompt
            {props.fixedCost && ` (${fmt(props.fixedCost.system)})`} + {props.toolCount} tool definitions
            {props.fixedCost && ` (${fmt(props.fixedCost.tools)})`}, plus template overhead. Every tool costs context
            on <b>every</b> call.
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-[var(--primary)]">Stateless</p>
          <p className="text-[var(--muted)]">
            The model remembers nothing between calls. Each call re-sends the whole conversation, and tool results stay
            in it, so the context grows with every step.
          </p>
        </div>
        <div>
          <p className="text-3xl font-bold text-[var(--primary)]">Compaction</p>
          <p className="text-[var(--muted)]">
            A follow-up only &ldquo;remembers&rdquo; earlier turns because we re-send them. Each finished turn is
            summarized in one sentence, and the summary is sent instead when it is shorter. It is cheaper, but lossy.
          </p>
        </div>
      </div>
    </section>
  );
}

/** One stacked column: a prompt's composition, height scaled to `scaleMax`. */
function StackedColumn({ ctx, scaleMax, heightPx }: { ctx: ContextInfo; scaleMax: number; heightPx: number }) {
  return (
    <div
      className="w-14 flex flex-col-reverse rounded-t overflow-hidden"
      style={{ height: (ctx.promptTokens / scaleMax) * heightPx }}
    >
      {ctx.segments ? (
        SEGMENTS.map(({ key, label, color }) =>
          ctx.segments![key] > 0 ? (
            <div
              key={key}
              title={`${label}: ${fmt(ctx.segments![key])} tokens`}
              style={{ height: `${(ctx.segments![key] / ctx.promptTokens) * 100}%`, background: color }}
            />
          ) : null,
        )
      ) : (
        <div className="h-full bg-gray-300" title="breakdown unavailable" />
      )}
    </div>
  );
}

/** Across the session: what each turn's first model call had to carry. */
function SessionContextChart({ turns, contextWindow }: { turns: Turn[]; contextWindow: number }) {
  const points = turns
    .map((t, i) => ({ n: i + 1, ctx: t.steps.find((s): s is ModelStep => s.type === "model" && s.done)?.context, turn: t }))
    .filter((p): p is { n: number; ctx: ContextInfo; turn: Turn } => !!p.ctx);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.ctx.promptTokens));
  const last = points[points.length - 1];
  const saved = last.turn.history ? last.turn.history.fullTokens - last.turn.history.tokens : 0;

  return (
    <section className="border border-[var(--border)] rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="font-semibold">Session context: what each turn starts with</h3>
        <span className="text-xs text-[var(--muted)]">
          First model call of each turn · pink = earlier turns re-sent
          {saved > 0 && ` · compaction saved ${fmt(saved)} tokens in the latest turn`}
        </span>
      </div>
      <div className="flex items-end gap-4 overflow-x-auto pb-1">
        {points.map((p) => (
          <div key={p.n} className="flex flex-col items-center">
            <span className="text-sm font-semibold mb-1">{fmt(p.ctx.promptTokens)}</span>
            <StackedColumn ctx={p.ctx} scaleMax={max} heightPx={110} />
            <span className="text-xs text-[var(--muted)] mt-1">turn {p.n}</span>
            <span className="text-[11px] text-pink-700">{p.ctx.segments ? `${fmt(p.ctx.segments.history)} hist` : ""}</span>
          </div>
        ))}
        <p className="text-xs text-[var(--muted)] max-w-xs self-center">
          Largest turn start: {((max / contextWindow) * 100).toFixed(2)}% of the {fmt(contextWindow)}-token window.
          Without compaction, the pink part would grow by each full request + answer.
        </p>
      </div>
    </section>
  );
}

/** Per-turn view: how the prompt grew call by call, and how that compares to the window. */
function ContextPanel({ steps, contextWindow }: { steps: Step[]; contextWindow: number }) {
  const calls = steps.filter((s): s is ModelStep => s.type === "model" && s.done && !!s.context);
  if (calls.length === 0) return null;

  const prompts = calls.map((c) => c.context!.promptTokens);
  const peak = Math.max(...prompts);
  const totalProcessed = calls.reduce((n, c) => n + (c.usage?.promptTokens ?? 0) + (c.usage?.completionTokens ?? 0), 0);
  const first = calls[0].context!.segments;
  const fixedPerCall = first ? first.system + first.tools + first.overhead : null;
  const peakPct = (peak / contextWindow) * 100;
  const ttfts = calls.map((c) => c.timings?.ttftSec).filter((t): t is number => t != null);

  return (
    <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--background)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="font-semibold">Context window usage in this turn</h3>
        <span className="text-xs text-[var(--muted)]">Hover a block for its token count</span>
      </div>

      <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-end">
        <div className="flex items-end gap-1">
          {calls.map((c, i) => {
            const ctx = c.context!;
            const delta = i > 0 ? ctx.promptTokens - calls[i - 1].context!.promptTokens : null;
            return (
              <div key={c.step} className="flex items-end gap-1">
                {delta != null && (
                  <div className="text-xs text-emerald-700 font-semibold pb-10 w-14 text-center">
                    +{fmt(delta)}
                    <div className="text-[var(--muted)] font-normal">→</div>
                  </div>
                )}
                <div className="flex flex-col items-center w-20">
                  <span className="text-sm font-semibold mb-1">{fmt(ctx.promptTokens)}</span>
                  <StackedColumn ctx={ctx} scaleMax={peak} heightPx={150} />
                  <span className="text-xs text-[var(--muted)] mt-1">call {c.step}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-[var(--muted)]">Peak prompt</dt>
              <dd className="font-semibold">
                {fmt(peak)} tokens · {peakPct.toFixed(2)}% of window
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Tokens processed in total</dt>
              <dd className="font-semibold">
                {fmt(totalProcessed)}{" "}
                <span className="font-normal text-[var(--muted)]">
                  ({calls.length} call{calls.length === 1 ? "" : "s"} × the whole conversation)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Fixed cost re-sent per call</dt>
              <dd className="font-semibold">
                {fixedPerCall != null ? `${fmt(fixedPerCall)} tokens` : "—"}{" "}
                <span className="font-normal text-[var(--muted)]">system + tools + template</span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Time to first token</dt>
              <dd className="font-semibold">
                {ttfts.length > 1
                  ? `${ttfts[0].toFixed(2)}s → ${ttfts[ttfts.length - 1].toFixed(2)}s`
                  : ttfts.length === 1
                    ? `${ttfts[0].toFixed(2)}s`
                    : "—"}{" "}
                <span
                  className="font-normal text-[var(--muted)]"
                  title="oMLX caches the prompt prefix shared with earlier calls; only new tokens must be processed before the first output token"
                >
                  driven by new, uncached prompt tokens
                </span>
              </dd>
            </div>
          </dl>

          <div>
            <div className="relative h-5 rounded bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[var(--primary)]"
                style={{ width: `${Math.max(peakPct, 0.4)}%` }}
                title={`${fmt(peak)} tokens`}
              />
            </div>
            <div className="flex justify-between text-xs text-[var(--muted)] mt-1">
              <span>0</span>
              <span>Peak of this turn on the full window · {fmt(contextWindow - peak)} tokens of headroom</span>
              <span>{fmt(contextWindow)}</span>
            </div>
          </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-[var(--muted)]">
      {SEGMENTS.map(({ key, label, color, help }) => (
        <span key={key} title={help} className="inline-flex items-center gap-1">
          <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function ContextBar({ context, delta }: { context: ContextInfo; delta: number | null }) {
  const { segments, promptTokens } = context;
  if (!segments) {
    return <p className="text-xs text-[var(--muted)] mt-2">Token breakdown unavailable (tokenizer call failed).</p>;
  }
  return (
    <div className="mt-2">
      <div className="flex h-3 rounded overflow-hidden bg-[var(--border)]">
        {SEGMENTS.map(({ key, label, color }) =>
          segments[key] > 0 ? (
            <div
              key={key}
              title={`${label}: ${fmt(segments[key])} tokens`}
              style={{ width: `${(segments[key] / promptTokens) * 100}%`, background: color }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--muted)]">
        {SEGMENTS.filter(({ key }) => key !== "history" || segments.history > 0).map(({ key, label, color, help }) => (
          <span key={key} title={help} className="inline-flex items-center gap-1">
            <i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            {label} <b className="text-[var(--foreground)] font-medium">{fmt(segments[key])}</b>
          </span>
        ))}
        {delta != null && (
          <span className="text-emerald-700 font-semibold">+{fmt(delta)} tokens vs the previous call</span>
        )}
      </div>
    </div>
  );
}

/** What this turn re-sent from earlier turns, and what compaction saved. */
function HistoryNote({ history }: { history: HistoryInfo }) {
  const saved = history.fullTokens - history.tokens;
  return (
    <details className="border-l-4 border-l-pink-500 bg-pink-50 rounded-lg px-4 py-3">
      <summary className="cursor-pointer text-sm">
        <b>Earlier turns re-sent:</b> {history.turns.length} turn{history.turns.length === 1 ? "" : "s"} as{" "}
        {fmt(history.tokens)} tokens{" "}
        <span className="text-[var(--muted)]">
          (as full request + answer: {fmt(history.fullTokens)}
          {saved > 0 ? `, compaction saved ${fmt(saved)}` : ""})
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {history.turns.map((t, i) => (
          <li key={i} className="flex flex-wrap gap-x-2">
            <span className="text-[var(--muted)]">Turn {i + 1}:</span>
            <span className="truncate max-w-md">{t.request}</span>
            <span className={t.mode === "summary" ? "text-pink-700 font-semibold" : "text-[var(--muted)]"}>
              {t.mode === "summary"
                ? `sent as summary, ${fmt(t.tokens)} instead of ${fmt(t.fullTokens)} tokens`
                : `sent in full, ${fmt(t.tokens)} tokens (the summary would not be shorter)`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------- Turn card and steps ----------

function CapabilitiesPanel(props: { systemPrompt: string; tools: ToolDefinition[]; toolKinds: Record<string, ToolKind> }) {
  return (
    <details className="border border-[var(--border)] rounded-xl bg-[var(--card)]">
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        What the agent can do{" "}
        <span className="font-normal text-sm text-[var(--muted)]">
          (system prompt + {props.tools.length} tools, sent with every model call)
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">System prompt</p>
          <pre className="text-sm whitespace-pre-wrap bg-[var(--background)] border border-[var(--border)] rounded-lg p-3">
            {props.systemPrompt}
          </pre>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {props.tools.map((t) => {
            const kind = props.toolKinds[t.function.name] ?? "read";
            return (
              <div key={t.function.name} className={`border-l-4 rounded-lg p-3 ${TOOL_STYLE[kind].box}`}>
                <div className="flex items-center gap-2 mb-1">
                  <code className="font-semibold">{t.function.name}</code>
                  <KindBadge kind={kind} />
                </div>
                <p className="text-sm mb-2">{t.function.description}</p>
                <pre className="text-xs overflow-x-auto">{JSON.stringify(t.function.parameters, null, 2)}</pre>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function KindBadge({ kind }: { kind: ToolKind }) {
  return <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${TOOL_STYLE[kind].badge}`}>{kind}</span>;
}

function firstLine(text: string, max = 160) {
  const line = text.replace(/[*#_`>]/g, "").split("\n").find((l) => l.trim()) ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function TurnCard(props: {
  turn: Turn;
  number: number;
  expanded: boolean;
  onToggle: () => void;
  toolKinds: Record<string, ToolKind>;
  contextWindow: number;
}) {
  const { turn } = props;
  const modelSteps = turn.steps.filter((s): s is ModelStep => s.type === "model" && s.done);
  const toolsUsed = [...new Set(turn.steps.flatMap((s) => (s.type === "tools" ? s.calls.map((c) => c.name) : [])))];
  const promptTotal = modelSteps.reduce((n, s) => n + (s.usage?.promptTokens ?? 0), 0);
  const completionTotal = modelSteps.reduce((n, s) => n + (s.usage?.completionTokens ?? 0), 0);
  const peak = Math.max(0, ...modelSteps.map((s) => s.context?.percentUsed ?? 0));
  const promptOf = (step: number) => modelSteps.find((s) => s.step === step)?.context?.promptTokens;

  const agentLine =
    turn.status === "error"
      ? `⚠ ${turn.error?.message ?? "failed"}`
      : turn.status === "aborted"
        ? "aborted"
        : turn.summary?.summary
          ? turn.summary.summary
          : turn.answer
            ? firstLine(turn.answer)
            : turn.status === "running"
              ? "working…"
              : "no answer";

  return (
    <section className="border border-[var(--border)] rounded-xl">
      <button
        type="button"
        onClick={props.onToggle}
        className="w-full text-left px-4 py-3 hover:bg-[var(--input)] rounded-xl space-y-1"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[var(--muted)]">{props.expanded ? "▾" : "▸"}</span>
          <span className="text-xs font-semibold text-[var(--muted)]">TURN {props.number}</span>
          {toolsUsed.map((name) => (
            <code
              key={name}
              className={`text-xs px-2 py-0.5 rounded border ${TOOL_STYLE[props.toolKinds[name] ?? "read"].badge}`}
            >
              {name}
            </code>
          ))}
          <span className="ml-auto text-sm text-[var(--muted)]">
            {turn.status === "running" ? (
              <span className="animate-pulse">running…</span>
            ) : (
              <>
                {modelSteps.length} call{modelSteps.length === 1 ? "" : "s"} · {fmt(promptTotal)} in /{" "}
                {fmt(completionTotal)} out · peak {peak.toFixed(1)}% ctx · {(turn.elapsedMs / 1000).toFixed(1)}s
              </>
            )}
          </span>
        </div>
        <p className="pl-6">
          <span className="font-semibold text-sky-700">You:</span> {turn.request}
        </p>
        <p className="pl-6 text-[var(--muted)]">
          <span className="font-semibold text-emerald-700">Agent:</span> {agentLine}
          {turn.summary?.summary && (
            <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-600">
              summary
            </span>
          )}
        </p>
      </button>

      {props.expanded && (
        <div className="px-4 pb-4 space-y-3">
          {turn.history && <HistoryNote history={turn.history} />}
          <ContextPanel steps={turn.steps} contextWindow={props.contextWindow} />
          {turn.steps.map((s) => {
            if (s.type === "tools") return <ToolsStepView key={`t${s.step}`} step={s} toolKinds={props.toolKinds} />;
            const prev = promptOf(s.step - 1);
            const delta = prev != null && s.context ? s.context.promptTokens - prev : null;
            return <ModelStepView key={`m${s.step}`} step={s} delta={delta} />;
          })}
          {turn.answer !== undefined && (
            <div className="border-l-4 border-l-emerald-500 bg-emerald-50 rounded-lg px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-emerald-800 mb-1">Final answer</p>
              {turn.answer ? (
                <div className="prose max-w-none">
                  <Markdown>{turn.answer}</Markdown>
                </div>
              ) : (
                <p className="text-sm">No answer: stopped after reaching the step limit ({turn.reason}).</p>
              )}
            </div>
          )}
          {turn.summary && <SummaryStepView step={turn.summary} />}
          {turn.status === "aborted" && (
            <p className="text-sm text-[var(--muted)]">Turn was aborted (the browser disconnected).</p>
          )}
          {turn.status === "error" && turn.error && (
            <div className="border-2 border-dashed border-gray-400 bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-700 mb-1">⚠ Turn failed</p>
              <p className="text-sm font-mono">{turn.error.message}</p>
              {turn.error.hint && <p className="text-sm text-[var(--muted)] mt-1">{turn.error.hint}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryStepView({ step }: { step: SummaryStep }) {
  return (
    <div className="border-l-4 border-l-slate-500 bg-slate-50 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Summary call</span>
        <span className="text-sm text-[var(--muted)]">
          an extra model call that compresses this turn for later turns (no tools)
        </span>
        {!step.done && <span className="text-sm text-slate-700 animate-pulse">summarizing…</span>}
        {step.done && step.usage && (
          <span className="text-sm text-[var(--muted)]">
            {fmt(step.usage.promptTokens)} prompt / {fmt(step.usage.completionTokens)} completion tokens
          </span>
        )}
      </div>
      {step.done && (
        <p className="text-sm mt-2">
          {step.summary ? (
            <>
              → <i>{step.summary}</i>
            </>
          ) : (
            `→ no summary (${step.error ?? "empty response"}); later turns get the full answer`
          )}
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-[var(--primary)]">Prompt (exact messages sent)</summary>
        <div className="mt-2 space-y-2">
          {step.request.messages.map((m, i) => (
            <MessageView key={i} message={m} />
          ))}
        </div>
      </details>
    </div>
  );
}

function ModelStepView({ step, delta }: { step: ModelStep; delta: number | null }) {
  const toolCalls = step.message?.tool_calls ?? [];
  return (
    <div className="border-l-4 border-l-[var(--primary)] bg-[var(--accent)]/60 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Model call {step.step}</span>
        <span className="text-sm text-[var(--muted)]">
          sends {step.request.messages.length} message{step.request.messages.length === 1 ? "" : "s"}
        </span>
        {!step.done && <span className="text-sm text-[var(--primary)] animate-pulse">thinking…</span>}
        {step.done && step.usage && step.timings && (
          <span className="text-sm text-[var(--muted)]">
            {fmt(step.usage.promptTokens)} prompt / {fmt(step.usage.completionTokens)} completion tokens
            {step.timings.ttftSec != null && ` · first token ${step.timings.ttftSec.toFixed(2)}s`}
            {step.timings.genTps != null && ` · ${step.timings.genTps.toFixed(0)} tok/s`}
            {step.context && ` · ${step.context.percentUsed.toFixed(2)}% of ${fmt(step.context.contextWindow)} context`}
          </span>
        )}
      </div>

      {step.done && step.context && <ContextBar context={step.context} delta={delta} />}

      {step.done && (
        <p className="text-sm mt-2">
          →{" "}
          {toolCalls.length > 0 ? (
            <>
              decides to call{" "}
              {toolCalls.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <code>{c.function.name}</code>
                </span>
              ))}
            </>
          ) : (
            "answers directly (no tool calls)"
          )}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <details>
          <summary className="cursor-pointer text-sm text-[var(--primary)]">Prompt (exact messages sent)</summary>
          <div className="mt-2 space-y-2">
            {step.request.messages.map((m, i) => (
              <MessageView key={i} message={m} />
            ))}
          </div>
        </details>
        {step.message && (
          <details>
            <summary className="cursor-pointer text-sm text-[var(--primary)]">Response (raw assistant message)</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap bg-[var(--background)] border border-[var(--border)] rounded p-2">
              {JSON.stringify(step.message, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function MessageView({ message }: { message: WireMessage }) {
  const body =
    message.role === "assistant" && message.tool_calls?.length
      ? JSON.stringify(message.tool_calls, null, 2)
      : message.content ?? "";
  const isSummary = message.role === "assistant" && body.startsWith("[Summary of an earlier turn]");
  return (
    <div
      className={`border rounded p-2 ${isSummary ? "bg-pink-50 border-pink-200" : "bg-[var(--background)] border-[var(--border)]"}`}
    >
      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-1">
        {message.role}
        {message.tool_call_id && ` · ${message.tool_call_id}`}
        {message.role === "assistant" && message.tool_calls?.length ? " · tool_calls" : ""}
        {isSummary && " · compacted earlier turn"}
      </p>
      <Truncated text={body} />
    </div>
  );
}

function ToolsStepView({ step, toolKinds }: { step: ToolsStep; toolKinds: Record<string, ToolKind> }) {
  return (
    <div className="space-y-2 pl-6">
      {step.calls.length > 1 && (
        <p className="text-xs text-[var(--muted)]">{step.calls.length} tool calls, run in parallel</p>
      )}
      {step.calls.map((call) => {
        const kind = toolKinds[call.name] ?? "read";
        const isError = typeof call.result === "object" && call.result !== null && "error" in call.result;
        return (
          <div key={call.id} className={`border-l-4 rounded-lg px-4 py-3 ${TOOL_STYLE[kind].box}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">🔧</span>
              <code className="font-semibold">{call.name}</code>
              <KindBadge kind={kind} />
              <code className="text-sm">({JSON.stringify(call.args)})</code>
              {call.done ? (
                <span className="text-sm text-[var(--muted)]">{call.durationMs} ms</span>
              ) : (
                <span className="text-sm animate-pulse">running…</span>
              )}
              {isError && <span className="text-xs font-semibold text-gray-700">⚠ returned an error</span>}
            </div>
            {call.done && (
              <div className="mt-2">
                <Truncated text={JSON.stringify(call.result, null, 2)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Truncated({ text, limit = 500 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > limit;
  return (
    <div>
      <pre className="text-xs whitespace-pre-wrap break-words">{open || !long ? text : `${text.slice(0, limit)}…`}</pre>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="text-xs text-[var(--primary)] mt-1">
          {open ? "Show less" : `Show all (${fmt(text.length)} chars)`}
        </button>
      )}
    </div>
  );
}

function SdkCallout() {
  return (
    <aside className="border border-[var(--accent-border)] bg-[var(--accent)] rounded-xl p-4">
      <p className="font-semibold mb-1">In production</p>
      <p className="text-sm text-[var(--muted)] mb-2">
        This page runs the loop by hand so you can see every step. With the Vercel AI SDK the same agent is a few lines;
        the SDK runs the identical loop for you, and you pass the earlier turns as <code>messages</code>:
      </p>
      <pre className="text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 overflow-x-auto">{`const result = streamText({
  model: omlx.chat("Qwen3-4B-Instruct-2507-4bit"),
  system: SYSTEM_PROMPT,
  messages: [...earlierTurnsOrSummaries, { role: "user", content: request }],
  tools: { search_documents, calculator, current_time, save_note, list_notes },
  stopWhen: stepCountIs(5),
});`}</pre>
    </aside>
  );
}
