"use client";

import { Chat as ChatSession, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Markdown from "react-markdown";

interface Source {
  label: string; // "10-rag-introduction · slide 5: Four parts of a RAG system"
  similarity: number;
}

interface SearchResult {
  filename: string;
  similarity: number;
  metadata: { slide?: number; slideTitle?: string } | null;
}

// ---------- Conversation state, kept outside the component ----------
// The /rag tabs swap the page under a shared layout, which unmounts <Chat />. Keeping the conversation and its
// sources at module level lets it survive Chat → How it works → Chat for the rest of the browser session.

const NO_SOURCES: Record<string, Source[]> = {};
let sources = NO_SOURCES;
const listeners = new Set<() => void>();
const sourcesStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  get: () => sources,
  getServer: () => NO_SOURCES,
  set(messageId: string, list: Source[]) {
    sources = { ...sources, [messageId]: list };
    listeners.forEach((fn) => fn());
  },
};

let lastQuery = "";
let ragChat: ChatSession<UIMessage> | null = null;

/** The one RAG conversation; after each answer, the sources come from /api/search for the same question. */
function getRagChat() {
  ragChat ??= new ChatSession<UIMessage>({
    onFinish: async ({ message }) => {
      if (!lastQuery) return;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(lastQuery)}`);
        const data = await res.json();
        sourcesStore.set(
          message.id,
          (data.results as SearchResult[]).map((r) => ({
            label: r.metadata?.slide
              ? `${r.filename.replace(/\.html$/, "")} · slide ${r.metadata.slide}: ${r.metadata.slideTitle}`
              : r.filename,
            similarity: parseFloat(r.similarity.toFixed(2)),
          })),
        );
      } catch {
        // the answer stands without its sources
      }
    },
  });
  return ragChat;
}

/** Extract text content from a UIMessage's parts array */
function getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

export function Chat() {
  const [inputValue, setInputValue] = useState("");
  const sourcesMap = useSyncExternalStore(sourcesStore.subscribe, sourcesStore.get, sourcesStore.getServer);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({ chat: getRagChat() });

  const isLoading = status !== "ready";

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      lastQuery = inputValue;
      void sendMessage({ text: inputValue });
      setInputValue("");
    }
  };

  // Follow new messages; the page itself scrolls, so stay put while the chat is empty (keeps the hero in view).
  useEffect(() => {
    if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    // Inside the /rag layout (header, hero, tabs): the page scrolls, the input stays pinned at the bottom.
    <div className="flex flex-col min-h-[calc(100vh-380px)]">
      {/* Messages area */}
      <div className="flex-1 px-6 py-6">
        {messages.length === 0 && (
          <p className="max-w-6xl mx-auto text-center pt-10 text-[var(--muted)]">
            Try: <em>What are the four parts of a RAG system?</em>
          </p>
        )}

        <div className="max-w-6xl mx-auto space-y-4">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-[var(--user-bubble)] text-[var(--user-text)] px-4 py-2.5 rounded-xl rounded-br-sm max-w-[80%] text-base">
                    {getMessageText(message)}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="bg-[var(--card)] border border-[var(--border)] px-5 py-4 rounded-xl text-base leading-relaxed prose max-w-none">
                    <Markdown>{getMessageText(message)}</Markdown>
                  </div>
                  {sourcesMap[message.id] &&
                    sourcesMap[message.id].length > 0 && (
                      <div className="mt-2 pl-2">
                        <p className="text-[11px] text-[var(--muted)] mb-1.5">
                          Sources:
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {sourcesMap[message.id].map((source, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] text-[var(--primary)] bg-[var(--accent)] px-2 py-0.5 rounded border border-[var(--accent-border)]"
                            >
                              {source.label}{" "}
                              <span className="text-[var(--muted)]">
                                ({source.similarity})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          ))}

          {status === "submitted" && (
            <div className="bg-[var(--card)] border border-[var(--border)] px-4 py-3 rounded-xl text-sm text-[var(--muted)]">
              Thinking...
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm text-red-700">
              {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="sticky bottom-0 px-6 py-4 border-t border-[var(--border)] bg-[var(--input)]">
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto flex gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about context engineering, agents, vector databases or RAG…"
            className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-lg px-4 py-3 text-base text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="bg-[var(--primary)] text-[var(--primary-foreground)] px-5 py-3 rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
