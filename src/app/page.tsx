import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

// The agents deck's five levels of autonomy, with where this app's two demos sit.
const LEVELS: { n: number; name: string; text: string; here?: { label: string; tone: "sage" | "blue" } }[] = [
  { n: 1, name: "AI as an assistant", text: "it suggests; people decide", here: { label: "RAG chat", tone: "sage" } },
  { n: 2, name: "Partial automation", text: "it does chosen tasks; people oversee every step", here: { label: "Agent demo", tone: "blue" } },
  { n: 3, name: "Conditional autonomy in a defined scope", text: "it works alone, inside a defined scope" },
  { n: 4, name: "High autonomy", text: "rare human intervention, on reviews and exceptions" },
  { n: 5, name: "Full autonomy", text: "the emerging AI-native domain" },
];

const COMPLEMENT = [
  {
    num: "i.",
    h: "Knowing and doing",
    p: "RAG answers “what do we know?”. An agent answers “what should be done next?”, and then does it.",
  },
  {
    num: "ii.",
    h: "They compose",
    p: "The agent's search_documents tool is RAG: the same embed-and-search, called only when the model decides it needs knowledge.",
  },
  {
    num: "iii.",
    h: "Predictable or flexible",
    p: "RAG is cheap and predictable: one retrieval, one answer. An agent adapts, but spends more calls and tokens, and needs guardrails such as read vs. write tools.",
  },
];

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {steps.map((s, i) => (
        // static list with repeats ("model" appears twice in the agent loop): the position is the identity
        <span key={`${i}-${s}`} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-[var(--muted)]">→</span>}
          <span className="px-2.5 py-1 rounded-full bg-white border border-[var(--line)]">{s}</span>
        </span>
      ))}
    </div>
  );
}

function PatternCard({
  kicker,
  title,
  what,
  flow,
  flowNote,
  when,
  links,
  hi = false,
}: {
  kicker: string;
  title: React.ReactNode;
  what: string;
  flow: string[];
  flowNote: string;
  when: string;
  links: { href: string; label: string }[];
  hi?: boolean;
}) {
  return (
    <article className={`deck-card ${hi ? "hi" : ""} p-7 flex flex-col gap-4`}>
      <div className="kicker">{kicker}</div>
      <h2 className="serif-title text-4xl">{title}</h2>
      <p className="text-lg leading-relaxed">{what}</p>
      <div className="space-y-2">
        <Flow steps={flow} />
        <p className="text-sm text-[var(--muted)]">{flowNote}</p>
      </div>
      <p className="text-[var(--muted)]">
        <b className="text-[var(--ink)] font-semibold">Use it for</b> {when}
      </p>
      <div className="mt-auto flex flex-wrap gap-3 pt-2">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              i === 0
                ? "px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90"
                : "px-4 py-2 rounded-full border border-[var(--accent-border)] text-[var(--blue)] text-sm font-semibold hover:bg-white"
            }
          >
            {l.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-6 py-14 space-y-20">
        {/* 1. Hero */}
        <section className="space-y-5">
          <div className="kicker">Reference AI</div>
          <h1 className="serif-title text-6xl md:text-7xl">
            Two ways to put an LLM to <em>work</em>
          </h1>
          <p className="text-xl text-[var(--muted)] leading-relaxed">
            On its own, an LLM knows only its training data, and it can only talk. RAG gives it your{" "}
            <em className="text-[var(--ink)]">knowledge</em>; an agent gives it <em className="text-[var(--ink)]">actions</em>.
            Both run here, fully locally, on oMLX.
          </p>
        </section>

        {/* 2. The two patterns */}
        <section className="grid md:grid-cols-2 gap-6">
          <PatternCard
            kicker="Pattern 1 · Grounding"
            title={<>Retrieval-augmented <em>generation</em></>}
            what="Retrieve the passages relevant to a question, add them to the prompt, and generate an answer grounded in them, with citations."
            flow={["question", "embed", "vector search", "prompt + context", "answer"]}
            flowNote="The path is fixed by code: every question is retrieved for, exactly once."
            when="questions over your own documents: private, current, attributable knowledge."
            links={[
              { href: "/chat", label: "Try the RAG chat" },
              { href: "/overview", label: "How it is built" },
            ]}
          />
          <PatternCard
            hi
            kicker="Pattern 2 · Acting"
            title={<>AI <em>agents</em></>}
            what="The model decides which tools to call, reads their results and repeats until the task is done."
            flow={["request", "model", "tool calls", "results", "model", "…", "answer"]}
            flowNote="The path is chosen by the model, step by step (up to 5 model calls here)."
            when="multi-step tasks: look things up, calculate, read and write data."
            links={[{ href: "/agent", label: "Watch the agent work" }]}
          />
        </section>

        {/* 3. Complementarity */}
        <section className="space-y-6">
          <div className="space-y-2">
            <div className="kicker">Better together</div>
            <h2 className="serif-title text-5xl">
              How they <em>complement</em> each other
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {COMPLEMENT.map((c) => (
              <div key={c.num} className="deck-card p-6 space-y-2">
                <span className="font-serif italic text-3xl text-[var(--blue)]">{c.num}</span>
                <h3 className="font-semibold text-lg">{c.h}</h3>
                <p className="text-[var(--muted)] leading-relaxed">{c.p}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Levels of autonomy */}
        <section className="space-y-6">
          <div className="space-y-2">
            <div className="kicker">Evolution</div>
            <h2 className="serif-title text-5xl">
              Levels of <em>autonomy</em>
            </h2>
            <p className="text-lg text-[var(--muted)] max-w-3xl leading-relaxed">
              <b className="text-[var(--ink)] font-semibold">RAG is a level-1 agent:</b> conversational, augmented chat.
              The code always retrieves; the model only answers. Give the model the choice of tools and it climbs to
              level 2.
            </p>
          </div>
          <ol className="space-y-2.5">
            {LEVELS.map((l) => (
              <li
                key={l.n}
                className={`deck-card px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-1 ${
                  l.here ? (l.here.tone === "blue" ? "hi" : "") : "opacity-50"
                }`}
              >
                <span className="font-serif italic text-3xl text-[var(--blue)] w-8">{l.n}.</span>
                <span className="font-semibold text-lg">{l.name}</span>
                <span className="text-[var(--muted)]">{l.text}</span>
                <span className="ml-auto">
                  {l.here ? (
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        l.here.tone === "sage"
                          ? "bg-[var(--sage-pill)] text-[var(--sage-deep)] border border-[var(--sage-border)]"
                          : "bg-white text-[var(--blue)] border border-[var(--accent-border)]"
                      }`}
                    >
                      {l.here.label}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--muted)]">beyond this demo</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-[var(--muted)]">
            Each step up needs a sharper definition of Ready and Done, and stronger guardrails.
          </p>
        </section>

        {/* 5. Footer */}
        <footer className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
          Knowledge base: the AI training decks (context engineering, agents, vector databases, RAG), re-indexed
          when they change.
        </footer>
      </main>
    </div>
  );
}
