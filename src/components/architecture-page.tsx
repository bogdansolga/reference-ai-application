import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHead } from "@/components/section-head";
import { SiteHeader } from "@/components/site-header";

// The three things the overview is for.
const INTENTS = [
  {
    num: "i.",
    h: "Cloud and local LLMs",
    p: "Frontier models live with the cloud and AI providers; smaller open models (Qwen, BGE) run on premises. Most real systems use both, and choose per call based on what the data may leave the building.",
  },
  {
    num: "ii.",
    h: "Deterministic or probabilistic",
    p: "Blue calls are code: same input, same output, testable as usual. Red calls are a model's choice: they can differ on every run, so they need evals, guardrails and logs.",
  },
  {
    num: "iii.",
    h: "Where RAG and agents sit",
    p: "RAG is a mostly blue path inside an app: embed, search, add to the prompt. An agent is the red part: the model picks the next tool call, up to writing and deleting data.",
  },
];

// One card per numbered zone in the diagram.
const ZONES: { n: number; h: string; body: React.ReactNode }[] = [
  {
    n: 1,
    h: "Cloud & AI providers",
    body: (
      <>
        Hyperscalers (Microsoft, Amazon, Google) host models and ship their own assistants, such as Copilot (the red{" "}
        <b>A</b>). Model labs (OpenAI, Anthropic) train the frontier models. The quality is the highest, and so is the
        open question: <b>security and privacy?</b> It is answered by contracts (retention, zero data retention, no
        training on your data, data residency), not by the architecture.
      </>
    ),
  },
  {
    n: 2,
    h: "How people reach AI",
    body: (
      <>
        From a <b>browser</b>, people chat with a cloud assistant: it sees only what they paste, upload or connect. From a{" "}
        <b>CLI or app</b> (an AI harness such as Claude Code, Codex or Pi), the agent runs on their machine, next to
        the code and internal systems, while its model usually still runs in the cloud.
      </>
    ),
  },
  {
    n: 3,
    h: "Applications with agents",
    body: (
      <>
        <b>App 1</b> mixes both kinds of calls: deterministic RAG retrieval (BGE embeddings, vector search) and an agent
        (A1) that decides, through a local or a cloud model, which records to create, read, update or{" "}
        <span className="text-[#d0453b] font-semibold">delete</span>. <b>App 2</b> runs several agents; their quality
        is kept in check by <b>eval design and hill-climbing</b>: a fixed set of test cases, scored on every change.
      </>
    ),
  },
  {
    n: 4,
    h: "Local building blocks",
    body: (
      <>
        Databases (SQL for records, a vector database for embeddings), local LLMs (Qwen to chat, BGE to embed) and the
        usual platform services: messaging between components and logging, which is also the audit trail of what the
        agents did. All of it stays on premises: <b>security and privacy++</b>.
      </>
    ),
  },
  {
    n: 5,
    h: "The Web",
    body: (
      <>
        Outside both zones, reached by an agent's web search or fetch tool (the red call from A2). Two things to keep
        in mind about that call:
        <span className="mt-2 block">
          <b>1. Its answer is not validated.</b> The agent decides what to search and which results to read, so the
          call is non-deterministic, and what comes back can be biased, outdated or simply wrong. Nobody has checked
          it; it can even carry instructions that steer the model (prompt injection). Treat it like user input, not
          like data.
        </span>
        <span className="mt-2 block">
          <b>2. The model does not learn it.</b> The result lives only in the agent's session: it is in the context
          window for this conversation, and may be saved to a database or a log. It never becomes part of the
          LLM&apos;s knowledge: the weights do not change, and the next session starts without it unless you store it
          and retrieve it again (RAG).
        </span>
      </>
    ),
  },
];

const FAQ: { q: string; a: React.ReactNode; myth?: boolean }[] = [
  {
    myth: true,
    q: "“Copilot or Claude in the browser can work with our internal systems.”",
    a: (
      <>
        Not easily. A browser assistant runs in the provider's cloud and has <b>no direct access</b> to systems on
        premises: it knows only what you paste or upload. Reaching internal data needs a deliberate integration (a
        connector or an MCP server exposed to the provider), with its own security review, network path and
        permissions.
      </>
    ),
  },
  {
    myth: true,
    q: "“A local AI harness (Claude Code, Pi, Codex…) keeps our data local.”",
    a: (
      <>
        Only the harness is local. Each file it reads, each command output and each tool result goes into the prompt,
        and the prompt is sent to the model provider. You are trusting the provider's data policy: retention, zero data
        retention (ZDR) if your plan has it, and no training on your data. Point the harness at a local model to keep
        the data in-house, and accept a weaker model.
      </>
    ),
  },
  {
    myth: true,
    q: "“A local model means no data ever leaves.”",
    a: (
      <>
        Inference stays local, but the agent's tools may not: web search, a cloud API, a telemetry endpoint. Check every
        tool and every outbound call, not only the model.
      </>
    ),
  },
  {
    myth: true,
    q: "“Once the agent has read it on the Web, the model knows it.”",
    a: (
      <>
        It knows it only for this session: the page is in the context window, not in the model. The weights never
        change at run time, so the next conversation starts without it. To keep what was found, store it (a note, a
        database, the vector index) and retrieve it again when needed, after checking it: a web result is unvalidated.
      </>
    ),
  },
  {
    q: "Is a local model as good as a frontier model?",
    a: (
      <>
        Not today, on hard multi-step tasks. Small models (this app's Qwen3-4B) answer well over retrieved context and
        follow simple tool loops; frontier models plan better and recover from errors. Measure on your own tasks
        (evals) before choosing, and mix them: local for the sensitive or high-volume calls, cloud for the hard ones.
      </>
    ),
  },
  {
    myth: true,
    q: "“The system prompt says never delete, so the agent won't.”",
    a: (
      <>
        A prompt is a request to a probabilistic model, not a guardrail. Enforce it in code: give the agent read-only
        tools by default, separate write tools (this app colours them red), require human approval for destructive
        actions and log every call.
      </>
    ),
  },
  {
    myth: true,
    q: "“Temperature 0 makes the model deterministic.”",
    a: (
      <>
        It makes it less random, not deterministic: batching, hardware and model updates still change outputs. Design as
        if every red call can return something new, and keep the decisions that must be repeatable in blue code.
      </>
    ),
  },
  {
    myth: true,
    q: "“RAG removes hallucinations.”",
    a: (
      <>
        It reduces them: the model answers from retrieved passages, with citations you can check. It can still miss
        the right passage, or misread it. Evaluate retrieval and answers separately.
      </>
    ),
  },
  {
    q: "Is RAG an agent?",
    a: (
      <>
        A level-1 one at most: the code always retrieves, exactly once, and the model only writes the answer. When the
        model chooses whether and what to search, as this app's agent does with <code>search_documents</code>, RAG has
        become one of an agent's tools.
      </>
    ),
  },
  {
    q: "Does a vector database replace our SQL database?",
    a: (
      <>
        No. A vector database finds text by meaning; SQL holds records, transactions and constraints. They sit side by
        side, and pgvector (used here) puts both in one PostgreSQL.
      </>
    ),
  },
  {
    myth: true,
    q: "“On premises means secure.”",
    a: (
      <>
        It removes the third party, not the risks: an agent with CRUD access can still be steered by injected content
        from the Web, or delete the wrong rows. Least privilege, approvals and audit logs apply on premises too.
      </>
    ),
  },
];

const VIEWS = [
  { href: "/architecture", label: "2D" },
  { href: "/architecture/3d", label: "3D" },
];

/** The architecture page's content; the two routes differ only in the diagram (flat SVG or 3D scene). */
export function ArchitecturePage({ diagram, view }: { diagram: ReactNode; view: string }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-6 py-14 space-y-20">
        <section className="space-y-5">
          <div className="kicker">Architecture · The big picture</div>
          <h1 className="serif-title text-6xl md:text-7xl">
            AI in software <em>architecture</em>
          </h1>
          <p className="text-xl text-[var(--muted)] leading-relaxed">
            A zoomed-out view: where the models run (in the cloud or on premises), which calls are code and which are a
            model's choice, and where <Link href="/rag/chat" className="text-[var(--blue)] hover:underline">RAG</Link>{" "}
            and <Link href="/agent/demo" className="text-[var(--blue)] hover:underline">agents</Link> fit in.
          </p>
        </section>

        <section className="space-y-6">
          <nav className="flex justify-center gap-2 text-sm" aria-label="Diagram view">
            {VIEWS.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                aria-current={v.href === view ? "page" : undefined}
                className={`min-w-14 px-4 py-1.5 rounded-full border text-center ${
                  v.href === view
                    ? "bg-[var(--sky)] border-[var(--accent-border)] text-[var(--blue)] font-semibold"
                    : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--blue)]"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          {diagram}
          <div className="grid md:grid-cols-3 gap-5">
            {INTENTS.map((c) => (
              <div key={c.num} className="deck-card p-6 space-y-2">
                <span className="font-serif italic text-3xl text-[var(--blue)]">{c.num}</span>
                <h3 className="font-semibold text-lg">{c.h}</h3>
                <p className="text-[var(--muted)] leading-relaxed">{c.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHead kicker="Reading the diagram" lede="Each number matches a zone in the diagram.">
            Zone by <em>zone</em>
          </SectionHead>
          <ol className="space-y-3">
            {ZONES.map((z) => (
              <li key={z.n} className="deck-card px-6 py-5 flex gap-5">
                <span className="font-serif italic text-3xl text-[var(--blue)] w-8 shrink-0 leading-none pt-1">{z.n}.</span>
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg">{z.h}</h3>
                  <p className="text-[var(--muted)] leading-relaxed [&_b]:text-[var(--ink)] [&_b]:font-semibold">{z.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="deck-card hi mt-5 px-6 py-5">
            <b className="font-semibold">This app is an App 1.</b>{" "}
            <span className="text-[var(--muted)]">
              Its RAG chat is the blue path (bge-m3 embeddings, pgvector search, a fixed prompt), and its agent demo is
              A1: a local Qwen model deciding which tools to call, with <code>save_note</code> as its one write tool.
              Everything runs on premises, on oMLX.
            </span>
          </div>
        </section>

        <section>
          <SectionHead kicker="FAQ" lede="Common questions, and the misconceptions that come up most in trainings.">
            Questions &amp; <em>misconceptions</em>
          </SectionHead>
          <div className="space-y-2.5">
            {FAQ.map((f) => (
              <details key={f.q} className="deck-card group px-6 py-4 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                      f.myth
                        ? "bg-[#f8dcd9] text-[#a3342b]"
                        : "bg-[var(--sage-pill)] text-[var(--sage-deep)]"
                    }`}
                  >
                    {f.myth ? "Myth" : "Question"}
                  </span>
                  <span className="font-semibold text-lg flex-1">{f.q}</span>
                  <span className="text-[var(--blue)] text-xl transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[var(--muted)] leading-relaxed [&_b]:text-[var(--ink)] [&_b]:font-semibold">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
          Adapted from the “AI in Software Architecture” overview diagram.
        </footer>
      </main>
    </div>
  );
}
