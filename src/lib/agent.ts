/**
 * A minimal tool-using agent, written out by hand so every step is visible.
 *
 * The whole "agent" is a loop:
 *   1. send the conversation + tool definitions to the model
 *   2. if the model asks for tools → run them, append the results, go to 1
 *   3. otherwise the model's text is the final answer
 *
 * Every step is reported through `emit` so the UI can show it live.
 */
import { fill, prompts } from "@/lib/prompts";
import { agentTools, toolDefinitions, toolKinds } from "@/lib/agent-tools";
import { chatModel, llmApiKey, llmBaseURL } from "@/lib/llm-config";

export const MAX_STEPS = 5;
export const CONTEXT_WINDOW = Number(process.env.AGENT_CONTEXT_WINDOW) || 32768;

export const SYSTEM_PROMPT = prompts.agentSystem;

// --- OpenAI chat-completions wire types (only what we use) ---
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ContextBreakdown {
  segments: {
    system: number;
    tools: number;
    history: number; // earlier turns of the session (summaries or full)
    user: number;
    assistantToolCalls: number;
    toolResults: number;
    overhead: number;
  } | null; // null if /tokenize failed
  promptTokens: number;
  contextWindow: number;
  percentUsed: number;
}

/** A finished earlier turn of the same session. */
export interface HistoryTurn {
  request: string;
  answer: string;
  summary: string | null;
}

export interface HistoryInfo {
  turns: { request: string; mode: "summary" | "full"; tokens: number; fullTokens: number }[];
  tokens: number; // what the history costs as sent
  fullTokens: number; // what it would cost as full request + answer pairs
}

type Timings = { ttftSec: number | null; totalSec: number; genTps: number | null };
type Usage = { promptTokens: number; completionTokens: number };

export type AgentEvent =
  | {
      type: "run_start";
      model: string;
      maxSteps: number;
      contextWindow: number;
      systemPrompt: string;
      tools: typeof toolDefinitions;
      toolKinds: Record<string, "read" | "write">;
      history: HistoryInfo | null;
    }
  | { type: "model_call_start"; step: number; request: unknown }
  | { type: "model_call_end"; step: number; message: Message; usage: Usage; timings: Timings; context: ContextBreakdown }
  | { type: "tool_start"; step: number; id: string; name: string; args: unknown }
  | { type: "tool_end"; step: number; id: string; name: string; result: unknown; durationMs: number }
  | { type: "final"; answer: string | null; reason?: "max_steps" }
  | { type: "summary_start"; request: unknown }
  | { type: "summary_end"; summary: string | null; usage?: Usage; timings?: Timings; error?: string }
  | { type: "error"; message: string; hint?: string };

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${llmApiKey}`,
};


/**
 * Earlier turns as chat messages (context compaction).
 * Each turn is sent either as its one-sentence summary (one assistant message) or as its
 * request + final answer, whichever costs fewer tokens: for short exchanges a summary
 * can be longer than the original. Tool calls/results of earlier turns are never re-sent.
 */
async function buildHistory(history: HistoryTurn[]): Promise<{ messages: Message[]; info: HistoryInfo | null }> {
  if (history.length === 0) return { messages: [], info: null };
  const summaryText = (t: HistoryTurn) => fill(prompts.agentHistorySummary, { summary: t.summary ?? "" });
  const counts = await Promise.all(
    history.map(async (t) => {
      const [full, summary] = await Promise.all([
        countTokens(`${t.request}\n${t.answer}`),
        t.summary ? countTokens(summaryText(t)) : Promise.resolve(Infinity),
      ]);
      return { full, summary };
    }),
  ).catch(() => null); // tokenizer down → send full turns

  const messages: Message[] = [];
  const turns: HistoryInfo["turns"] = [];
  history.forEach((t, i) => {
    const c = counts?.[i];
    const useSummary = !!c && c.summary < c.full;
    if (useSummary) messages.push({ role: "assistant", content: summaryText(t) });
    else messages.push({ role: "user", content: t.request }, { role: "assistant", content: t.answer });
    turns.push({
      request: t.request,
      mode: useSummary ? "summary" : "full",
      tokens: c ? (useSummary ? c.summary : c.full) : 0,
      fullTokens: c?.full ?? 0,
    });
  });
  const info = counts
    ? {
        turns,
        tokens: turns.reduce((n, t) => n + t.tokens, 0),
        fullTokens: turns.reduce((n, t) => n + t.fullTokens, 0),
      }
    : null;
  return { messages, info };
}

/** One non-streaming call to oMLX chat completions. */
async function callModel(body: Record<string, unknown>, signal: AbortSignal) {
  const started = performance.now();
  const res = await fetch(`${llmBaseURL}/chat/completions`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`oMLX returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const usage = data.usage ?? {};
  return {
    message: data.choices[0].message as Message,
    usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 },
    timings: {
      ttftSec: usage.time_to_first_token ?? null,
      totalSec: usage.total_time ?? (performance.now() - started) / 1000,
      genTps: usage.generation_tokens_per_second ?? null,
    },
  };
}

export async function runAgent(
  userText: string,
  history: HistoryTurn[],
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<{ answer: string | null; summary: string | null }> {
  const { messages: past, info: historyInfo } = await buildHistory(history);
  emit({
    type: "run_start",
    model: chatModel,
    maxSteps: MAX_STEPS,
    contextWindow: CONTEXT_WINDOW,
    systemPrompt: SYSTEM_PROMPT,
    tools: toolDefinitions,
    toolKinds,
    history: historyInfo,
  });

  // [system, ...earlier turns, this request, ...this turn's tool traffic]
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...past,
    { role: "user", content: userText },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    // 1. Ask the model. The request body is exactly what the UI shows as "Prompt".
    const request = {
      model: chatModel,
      messages: structuredClone(messages),
      tools: toolDefinitions,
      temperature: 0.2,
    };
    emit({ type: "model_call_start", step, request });
    const { message, usage, timings } = await callModel(request, signal);
    emit({
      type: "model_call_end",
      step,
      message,
      usage,
      timings,
      context: await accountContext(messages, past.length, usage.promptTokens),
    });

    // 2. No tool calls → the model is done.
    const toolCalls = message.role === "assistant" ? message.tool_calls ?? [] : [];
    if (toolCalls.length === 0) {
      const answer = message.role === "assistant" ? message.content : null;
      emit({ type: "final", answer });
      return { answer, summary: answer ? await summarize(userText, answer, emit, signal) : null };
    }

    // 3. Run the requested tools (in parallel) and append their results.
    messages.push(message);
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const t0 = performance.now();
        const name = call.function.name;
        const parsed = parseArgs(call.function.arguments);
        emit({ type: "tool_start", step, id: call.id, name, args: parsed.args });
        let result: unknown;
        try {
          if (parsed.error) throw new Error(parsed.error);
          const tool = agentTools.find((t) => t.name === name);
          if (!tool) throw new Error(`unknown tool "${name}"`);
          result = await tool.execute(parsed.args as Record<string, unknown>);
        } catch (err) {
          // Errors go back to the model as data, so it can recover.
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        const durationMs = Math.round(performance.now() - t0);
        emit({ type: "tool_end", step, id: call.id, name, result, durationMs });
        return { call, result };
      }),
    );
    for (const { call, result } of results) {
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  emit({ type: "final", answer: null, reason: "max_steps" });
  return { answer: null, summary: null };
}

/**
 * Extra model call that compresses the finished turn into one sentence.
 * Later turns of the session get this summary instead of the full exchange.
 */
async function summarize(
  userText: string,
  answer: string,
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<string | null> {
  const request = {
    model: chatModel,
    messages: [
      { role: "system", content: prompts.agentSummary },
      { role: "user", content: fill(prompts.agentSummaryInput, { request: userText, answer }) },
    ],
    temperature: 0,
    max_tokens: 80,
  };
  emit({ type: "summary_start", request });
  try {
    const { message, usage, timings } = await callModel(request, signal);
    const summary = (message.role === "assistant" && message.content?.trim()) || null;
    emit({ type: "summary_end", summary, usage, timings });
    return summary;
  } catch (err) {
    if (signal.aborted) throw err;
    emit({ type: "summary_end", summary: null, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** The model sends tool arguments as a JSON string, which may be malformed. */
function parseArgs(raw: string): { args: unknown; error?: string } {
  try {
    return { args: JSON.parse(raw || "{}") };
  } catch {
    return { args: raw, error: `arguments are not valid JSON: ${raw}` };
  }
}

/**
 * Split a prompt into its parts and count each with the model's own tokenizer.
 * Layout: [system, ...history (historyCount messages), user, ...this turn's tool traffic].
 * Whatever is left of prompt_tokens is chat-template overhead (role markers etc.).
 */
async function accountContext(
  messages: Message[],
  historyCount: number,
  promptTokens: number,
): Promise<ContextBreakdown> {
  const base = {
    promptTokens,
    contextWindow: CONTEXT_WINDOW,
    percentUsed: Number(((promptTokens / CONTEXT_WINDOW) * 100).toFixed(2)),
  };

  const textOf = (msgs: Message[]) =>
    msgs
      .map((m) => {
        if (m.role === "assistant" && m.tool_calls?.length) {
          return m.tool_calls.map((c) => `${c.function.name}${c.function.arguments}`).join("\n");
        }
        return m.content ?? "";
      })
      .join("\n");

  const history = messages.slice(1, 1 + historyCount);
  const current = messages.slice(1 + historyCount); // [user, ...tool traffic]
  try {
    const [system, tools, hist, user, assistantToolCalls, toolResults] = await Promise.all([
      countTokens(textOf(messages.slice(0, 1))),
      countTokens(JSON.stringify(toolDefinitions)),
      countTokens(textOf(history)),
      countTokens(textOf(current.slice(0, 1))),
      countTokens(textOf(current.filter((m) => m.role === "assistant"))),
      countTokens(textOf(current.filter((m) => m.role === "tool"))),
    ]);
    const counted = system + tools + hist + user + assistantToolCalls + toolResults;
    return {
      ...base,
      segments: {
        system,
        tools,
        history: hist,
        user,
        assistantToolCalls,
        toolResults,
        overhead: Math.max(promptTokens - counted, 0),
      },
    };
  } catch {
    return { ...base, segments: null };
  }
}

export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  const res = await fetch(`${llmBaseURL}/tokenize`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ model: chatModel, prompt: text }),
  });
  if (!res.ok) throw new Error(`tokenize failed: ${res.status}`);
  const data = await res.json();
  return data.count;
}
