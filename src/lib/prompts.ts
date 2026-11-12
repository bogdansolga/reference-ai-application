/**
 * The app's LLM prompts, kept as Markdown files in src/prompts/ so they can be read and edited as text.
 * They are read once, when this module is first loaded (pre-loaded at server start by src/instrumentation.ts),
 * never per request. Restart the dev server after editing one.
 *
 * Placeholders are written {{name}} and filled with fill().
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(process.cwd(), "src", "prompts");

const load = (name: string) => readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8").trim();

export const prompts = {
  /** The agent's system prompt: its tools and when to use them. */
  agentSystem: load("agent-system"),
  /** System prompt of the summary call that compresses a finished turn into one sentence. */
  agentSummary: load("agent-summary"),
  /** The exchange handed to the summary call. {{request}}, {{answer}} */
  agentSummaryInput: load("agent-summary-input"),
  /** How a summarized earlier turn is re-sent to the agent. {{summary}} */
  agentHistorySummary: load("agent-history-summary"),
  /** The RAG chat's system prompt. {{context}} */
  chatSystem: load("chat-system"),
  /** The retrieved-context block of the RAG chat prompt. {{sources}} */
  chatContext: load("chat-context"),
  /** Used as {{context}} when retrieval found nothing. */
  chatNoContext: load("chat-no-context"),
} as const;

/** Replace each {{name}} in a prompt template; a placeholder without a value is an error, not a silent gap. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Prompt placeholder {{${key}}} has no value`);
    return values[key];
  });
}
