/**
 * Embedding utilities for RAG pipeline.
 *
 * Default: BAAI/bge-m3 (1024 dimensions) served locally by oMLX, which exposes an
 * OpenAI-compatible /v1/embeddings endpoint. Any OpenAI-compatible endpoint works —
 * point EMBEDDING_BASE_URL at it. The vector(N) column in Postgres must match the
 * model's dimension (see EMBEDDING_DIMENSIONS in scripts/add-pgvector.sh).
 */
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "bge-m3";

const embeddingProvider = createOpenAI({
  baseURL: process.env.EMBEDDING_BASE_URL || "http://localhost:8000/v1",
  apiKey: process.env.EMBEDDING_API_KEY,
});

const model = embeddingProvider.embeddingModel(EMBEDDING_MODEL);

export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: query });
  return embedding;
}

export async function embedDocument(content: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: content });
  return embedding;
}
