/**
 * Tools the demo agent can call.
 *
 * Each tool = a name, a description and a JSON Schema the model reads, plus an
 * execute() function our code runs when the model asks for it. The model never
 * runs anything itself; it only emits a request like {name, arguments}.
 */
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { embedQuery } from "@/lib/embeddings";
import { citation, searchSimilar } from "@/lib/retrieval";
import { notes } from "@/lib/schema";

export interface AgentTool {
  name: string;
  /** read = no side effects; write = changes state (shown in red in the UI) */
  kind: "read" | "write";
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

const searchDocuments: AgentTool = {
  name: "search_documents",
  kind: "read",
  description:
    "Semantic search over the AI training decks (context engineering, AI agents, vector databases, RAG). Returns the most relevant slides.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to search for" },
      limit: { type: "integer", minimum: 1, maximum: 5, description: "Number of chunks (default 3)" },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("query is required");
    const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 5);
    const results = await searchSimilar(await embedQuery(query), limit);
    return results.map((r) => ({
      source: citation(r),
      similarity: Number(r.similarity.toFixed(2)),
      content: r.content,
    }));
  },
};

const calculator: AgentTool = {
  name: "calculator",
  kind: "read",
  description:
    "Evaluate an arithmetic expression. Supports + - * / % ^ and parentheses, e.g. \"0.17 * 2340\".",
  parameters: {
    type: "object",
    properties: { expression: { type: "string", description: "Arithmetic expression" } },
    required: ["expression"],
  },
  async execute(args) {
    const expression = String(args.expression ?? "");
    return { expression, result: evaluate(expression) };
  },
};

const currentTime: AgentTool = {
  name: "current_time",
  kind: "read",
  description: "Get the current date and time.",
  parameters: { type: "object", properties: {} },
  async execute() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString("en-GB"),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
};

const saveNote: AgentTool = {
  name: "save_note",
  kind: "write",
  description:
    "Save a short note to the user's notebook (persists in the database). Use only when the user asks to save, remember or note something.",
  parameters: {
    type: "object",
    properties: { content: { type: "string", description: "The note text" } },
    required: ["content"],
  },
  async execute(args) {
    const content = String(args.content ?? "").trim();
    if (!content) throw new Error("content is required");
    if (content.length > 2000) throw new Error("note is too long (max 2000 characters)");
    const [note] = await db.insert(notes).values({ content }).returning();
    return { saved: true, id: note.id, content: note.content, createdAt: note.createdAt };
  },
};

const listNotes: AgentTool = {
  name: "list_notes",
  kind: "read",
  description: "List the most recent notes from the user's notebook, newest first.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 20, description: "How many notes (default 10)" },
    },
  },
  async execute(args) {
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    const rows = await db.select().from(notes).orderBy(desc(notes.id)).limit(limit);
    return { count: rows.length, notes: rows.map((n) => ({ id: n.id, content: n.content, createdAt: n.createdAt })) };
  },
};

export const agentTools: AgentTool[] = [searchDocuments, calculator, currentTime, saveNote, listNotes];

/** Tool name → read/write, for the UI only (not sent to the model). */
export const toolKinds = Object.fromEntries(agentTools.map((t) => [t.name, t.kind]));

/** The `tools` array exactly as sent to the OpenAI-compatible API. */
export const toolDefinitions = agentTools.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

/**
 * Tiny recursive-descent arithmetic parser (no eval):
 *   expr   = term (("+" | "-") term)*
 *   term   = power (("*" | "/" | "%") power)*
 *   power  = unary ("^" power)?
 *   unary  = "-" unary | primary
 *   primary = number | "(" expr ")"
 */
function evaluate(input: string): number {
  const tokens = input.match(/\d+(?:\.\d+)?|\.\d+|[-+*/%^()]|\S/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const primary = (): number => {
    const tok = next();
    if (tok === "(") {
      const value = expr();
      if (next() !== ")") throw new Error("missing closing parenthesis");
      return value;
    }
    if (tok !== undefined && /^(\d|\.\d)/.test(tok)) return Number(tok);
    throw new Error(tok === undefined ? "unexpected end of expression" : `unexpected "${tok}"`);
  };
  const unary = (): number => (peek() === "-" ? (next(), -unary()) : primary());
  const power = (): number => {
    const base = unary();
    return peek() === "^" ? (next(), base ** power()) : base;
  };
  const term = (): number => {
    let value = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const rhs = power();
      value = op === "*" ? value * rhs : op === "/" ? value / rhs : value % rhs;
    }
    return value;
  };
  const expr = (): number => {
    let value = term();
    while (peek() === "+" || peek() === "-") {
      value = next() === "+" ? value + term() : value - term();
    }
    return value;
  };

  if (tokens.length === 0) throw new Error("empty expression");
  const result = expr();
  if (pos < tokens.length) throw new Error(`unexpected "${tokens[pos]}"`);
  if (!Number.isFinite(result)) throw new Error("result is not a finite number");
  return result;
}
