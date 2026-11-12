import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";
import { embedQuery } from "@/lib/embeddings";
import { chatModel, llmApiKey, llmBaseURL } from "@/lib/llm-config";
import { fill, prompts } from "@/lib/prompts";
import { formatContext, searchSimilar } from "@/lib/retrieval";

// Chat runs on the same local oMLX server as embeddings (OpenAI-compatible API).
const chatProvider = createOpenAI({ baseURL: llmBaseURL, apiKey: llmApiKey });

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the latest user message text for embedding
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  if (!lastUserMessage) {
    return new Response("No user message found", { status: 400 });
  }

  // Extract text from message (AI SDK v6 uses parts array, fallback to content for compatibility)
  const userText =
    lastUserMessage.content ??
    lastUserMessage.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("") ??
    "";

  if (!userText) {
    return new Response("Empty user message", { status: 400 });
  }

  // 1. Embed the user's query
  const queryEmbedding = await embedQuery(userText);

  // 2. Search for similar chunks
  const results = await searchSimilar(queryEmbedding, 5);

  // 3. Build system prompt with retrieved context
  const context = formatContext(results);
  const systemPrompt = fill(prompts.chatSystem, {
    context: context ? fill(prompts.chatContext, { sources: context }) : prompts.chatNoContext,
  });

  // 4. Prepare source citations header
  const sources = results.map((r) => ({
    filename: r.filename,
    chunkIndex: r.chunkIndex,
    similarity: parseFloat(r.similarity.toFixed(2)),
  }));

  // 5. Stream LLM response
  const result = streamText({
    model: chatProvider.chat(chatModel), // /v1/chat/completions (oMLX has no Responses API)
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Sources": JSON.stringify(sources),
    },
  });
}
