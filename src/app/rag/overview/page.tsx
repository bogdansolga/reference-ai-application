import Link from "next/link";
import { SectionHead } from "@/components/section-head";

// ---------- System components diagram (deck style: glass cards, dashed links, numbered step pills) ----------

const SAGE = "var(--sage-deep)"; // ingestion
const BLUE = "var(--blue)"; // querying

function Node({ x, y, w, h, title, sub, hub = false }: {
  x: number; y: number; w: number; h: number; title: string; sub: string; hub?: boolean;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={16} fill={hub ? "url(#hub)" : "url(#card)"}
        stroke={hub ? "var(--accent-border)" : "var(--line)"} strokeWidth={hub ? 1.5 : 1} />
      <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fill="var(--ink)" fontSize={hub ? 30 : 24}
        style={{ fontFamily: "var(--font-serif)" }}>{title}</text>
      <text x={x + w / 2} y={y + h / 2 + 20} textAnchor="middle" fill="var(--muted)" fontSize={13}>{sub}</text>
    </g>
  );
}

/** A flow between two components (dashed when an answer comes back), with a numbered pill and a short label. */
function Flow({ d, color, step, at, label, labelSide = "right", back = false }: {
  d: string; color: string; step?: string; at: [number, number]; label: string;
  labelSide?: "left" | "right" | "below"; back?: boolean;
}) {
  const [cx, cy] = at;
  const half = !step ? 0 : step.length > 2 ? 22 : 13;
  const gap = half + 7;
  const tx = labelSide === "right" ? cx + gap : labelSide === "left" ? cx - gap : cx;
  const ty = labelSide === "below" ? cy + 34 : cy + 5;
  const anchor = labelSide === "right" ? "start" : labelSide === "left" ? "end" : "middle";
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray={back ? "6 5" : undefined}
        markerEnd={`url(#arrow-${color === SAGE ? "sage" : "blue"})`} opacity={0.85} />
      {step && (
        <>
          <rect x={cx - half} y={cy - 13} width={half * 2} height={26} rx={13} fill="#fff" stroke={color} />
          <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize={17} fontStyle="italic"
            style={{ fontFamily: "var(--font-serif)" }}>{step}</text>
        </>
      )}
      <text x={tx} y={ty} textAnchor={anchor} fill="var(--muted)" fontSize={13}>{label}</text>
    </g>
  );
}

function SystemDiagram() {
  return (
    <svg viewBox="0 0 1000 540" className="w-full" style={{ minWidth: 720 }} role="img"
      aria-label="Components of this app's RAG pipeline: training decks, the app, the embedding model, the vector database and the language model, with ingestion steps 1 to 4 and querying steps 5 to 10">
      <defs>
        <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="var(--card)" />
        </linearGradient>
        <radialGradient id="hub" cx=".5" cy=".4" r=".75">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="var(--sky)" />
        </radialGradient>
        {(["sage", "blue"] as const).map((k) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill={k === "sage" ? SAGE : BLUE} />
          </marker>
        ))}
      </defs>

      {/* components */}
      <Node x={400} y={20} w={200} h={70} title="User" sub="asks in the RAG chat" />
      <Node x={20} y={205} w={210} h={90} title="Training decks" sub="4 HTML decks · DECKS_DIR" />
      <Node x={320} y={200} w={360} h={100} title="Reference AI" sub="Next.js · AI SDK · scripts/ingest.ts" hub />
      <Node x={20} y={420} w={250} h={90} title="Embedding model" sub="bge-m3 on oMLX · 1024 dims" />
      <Node x={375} y={420} w={250} h={90} title="Vector database" sub="PostgreSQL + pgvector · HNSW" />
      <Node x={720} y={420} w={260} h={90} title="Language model" sub="Qwen3-4B on oMLX" />

      {/* ingestion (sage) */}
      <Flow d="M230,250 L318,250" color={SAGE} step="1–2" at={[274, 250]} label="read · chunk" labelSide="below" />
      <Flow d="M340,300 C340,360 150,360 130,418" color={SAGE} step="3" at={[242, 360]} label="embed slides" labelSide="left" />
      <Flow d="M440,300 L440,418" color={SAGE} step="4" at={[440, 330]} label="store" labelSide="left" />

      {/* querying (blue) */}
      <Flow d="M480,90 L480,198" color={BLUE} step="5" at={[480, 140]} label="ask" labelSide="left" />
      <Flow d="M380,300 C380,390 250,380 230,418" color={BLUE} step="6" at={[312, 378]} label="embed question" />
      <Flow d="M500,300 L500,418" color={BLUE} step="7" at={[500, 345]} label="search" />
      <Flow d="M600,418 L600,302" color={BLUE} at={[606, 385]} label="top 5 slides" back />
      <Flow d="M650,300 C650,370 810,360 830,418" color={BLUE} step="8" at={[732, 364]} label="prompt + context" />
      <Flow d="M940,418 C940,300 810,262 684,262" color={BLUE} step="9" at={[908, 326]} label="stream" back />
      <Flow d="M520,198 L520,92" color={BLUE} step="10" at={[520, 140]} label="answer + sources" back />

      {/* legend */}
      <g transform="translate(790,20)">
        <rect width={190} height={78} rx={14} fill="#fff" stroke="var(--line)" />
        <line x1={18} y1={28} x2={50} y2={28} stroke={SAGE} strokeWidth={2} />
        <text x={60} y={33} fontSize={14} fill="var(--ink)">Ingestion · 1–4</text>
        <line x1={18} y1={54} x2={50} y2={54} stroke={BLUE} strokeWidth={2} />
        <text x={60} y={59} fontSize={14} fill="var(--ink)">Querying · 5–10</text>
      </g>
    </svg>
  );
}

// ---------- Content ----------

const INGESTION = [
  { step: 1, title: "Read the decks", desc: "The AI training HTML decks are read from DECKS_DIR. A deck whose content hash has not changed is skipped, so only refined decks are re-indexed." },
  { step: 2, title: "One chunk per slide", desc: "Each slide becomes one chunk (title, text, card details, figure labels), with its deck, slide number and title as metadata for citations." },
  { step: 3, title: "Embed the slides", desc: "Each chunk is sent to BAAI/bge-m3, running locally on oMLX, and comes back as a 1024-dimensional vector." },
  { step: 4, title: "Store the vectors", desc: "PostgreSQL + pgvector, with an HNSW index for fast cosine-similarity search." },
];

const QUERYING = [
  { step: 5, title: "Ask a question", desc: "In the Chat tab of this section." },
  { step: 6, title: "Embed the question", desc: "The same embedding model turns the question into a 1024-dim vector." },
  { step: 7, title: "Similarity search", desc: "The 5 closest slides by cosine distance, via the HNSW index." },
  { step: 8, title: "Augment the prompt", desc: "The retrieved slides go into the system prompt, each with its citation." },
  { step: 9, title: "Stream the answer", desc: "Qwen3-4B-Instruct (local, oMLX) answers from that context, streamed to the UI." },
  { step: 10, title: "Show the sources", desc: "Each answer lists its deck, slide and similarity score." },
];

const CONSIDERATIONS = [
  {
    h: "Ingestion",
    items: [
      ["chunk size and overlap", "Choosing the right"],
      ["source formats", "Handling diverse"],
      ["metadata", "Deciding what to extract as"],
      ["re-ingestion", "Managing"],
      ["embedding consistency", "Ensuring"],
    ],
  },
  {
    h: "Querying",
    items: [
      ["latency vs. accuracy", "Balancing"],
      ["ambiguous questions", "Handling"],
      ["caching", "Question-embedding"],
      ["token limits", "Effective prompts within"],
      ["re-ranking", "Deciding on"],
    ],
  },
];

const DATABASES = [
  { name: "Dedicated vector DB", eg: "Qdrant, Pinecone, Weaviate", pros: "Purpose-built for similarity search; optimised indexing", cons: "Additional infrastructure to manage" },
  { name: "Postgres + pgvector", eg: "this project", pros: "One database for everything; familiar SQL", cons: "May not scale to very large vector workloads", here: true },
  { name: "Elasticsearch / OpenSearch", eg: "hybrid search", pros: "Text and vector search combined", cons: "More complex setup; heavier resources" },
];

function Steps({ steps, tone }: { steps: { step: number; title: string; desc: string }[]; tone: "sage" | "blue" }) {
  return (
    <div className={`grid gap-4 ${steps.length > 4 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {steps.map(({ step, title, desc }) => (
        <div key={step} className="deck-card p-5 flex gap-4">
          <span
            className={`font-serif italic text-4xl leading-none w-10 shrink-0 ${
              tone === "sage" ? "text-[var(--sage-deep)]" : "text-[var(--blue)]"
            }`}
          >
            {step}
          </span>
          <div className="space-y-1">
            <p className="font-semibold">{title}</p>
            <p className="text-[var(--muted)] leading-relaxed">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RagOverviewPage() {
  return (
    <>
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-20">
        <section>
          <SectionHead
            kicker="Architecture"
            lede={<>Five components, two flows: ingestion fills the vector database ahead of time, querying reads it at question time. <em>&quot;There are no solutions, there are only tradeoffs.&quot;</em></>}
          >
            System <em>components</em>
          </SectionHead>
          <div className="deck-card p-6 md:p-8 overflow-x-auto">
            <SystemDiagram />
          </div>
        </section>

        <section>
          <SectionHead kicker="Phase 1 · Ahead of time" lede="Turn the decks into searchable, vectorised chunks in the database.">
            <em>Ingestion</em>
          </SectionHead>
          <Steps steps={INGESTION} tone="sage" />
        </section>

        <section>
          <SectionHead kicker="Phase 2 · At question time" lede="Retrieve the relevant slides and generate an answer grounded in them.">
            <em>Querying</em>
          </SectionHead>
          <Steps steps={QUERYING} tone="blue" />
        </section>

        <section>
          <SectionHead kicker="Tradeoffs">
            Key <em>considerations</em>
          </SectionHead>
          <div className="grid md:grid-cols-2 gap-5">
            {CONSIDERATIONS.map((c, i) => (
              <div key={c.h} className={`deck-card ${i ? "hi" : ""} p-6 space-y-3`}>
                <h3 className="serif-title text-3xl">{c.h}</h3>
                <ul className="space-y-2 text-[var(--muted)]">
                  {c.items.map(([key, lead]) => (
                    <li key={key} className="flex gap-2">
                      <span className="text-[var(--sage)]">—</span>
                      <span>
                        {lead} <b className="font-semibold text-[var(--ink)]">{key}</b>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHead kicker="Storage">
            Database <em>selection</em>
          </SectionHead>
          <div className="deck-card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Option", "Pros", "Cons"].map((h) => (
                    <th key={h} className="px-5 py-3 kicker">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DATABASES.map((d) => (
                  <tr key={d.name} className={`border-b border-[var(--line)] last:border-0 ${d.here ? "bg-[var(--sky)]" : ""}`}>
                    <td className="px-5 py-4">
                      <div className="font-semibold">{d.name}</div>
                      <div className={`text-sm ${d.here ? "text-[var(--blue)] font-semibold" : "text-[var(--muted)]"}`}>{d.eg}</div>
                    </td>
                    <td className="px-5 py-4 text-[var(--muted)]">{d.pros}</td>
                    <td className="px-5 py-4 text-[var(--muted)]">{d.cons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="border-t border-[var(--border)] pt-6 flex flex-wrap items-center gap-3">
          <span className="text-[var(--muted)] mr-2">See it working:</span>
          <Link href="/rag/chat" className="px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90">
            Try the RAG chat
          </Link>
          <Link href="/agent/overview" className="px-4 py-2 rounded-full border border-[var(--accent-border)] text-[var(--blue)] text-sm font-semibold hover:bg-[var(--sky)]">
            RAG as an agent tool
          </Link>
        </footer>
      </main>
    </>
  );
}
