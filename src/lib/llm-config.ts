/**
 * Where the chat/agent LLM lives: the local oMLX server (OpenAI-compatible).
 * Defaults to the same server and key as the embeddings.
 */
export const llmBaseURL =
  process.env.CHAT_BASE_URL ||
  process.env.EMBEDDING_BASE_URL ||
  "http://localhost:8000/v1";

export const llmApiKey =
  process.env.CHAT_API_KEY || process.env.EMBEDDING_API_KEY || "";

export const chatModel =
  process.env.CHAT_MODEL || "Qwen3-4B-Instruct-2507-4bit";
