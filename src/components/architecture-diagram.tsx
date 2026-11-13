"use client";

import { useId, useRef } from "react";

// Flow colours, as in the source diagram (docs/AI in Software Architecture.pdf).
const DET = "#3a78c9"; // deterministic: code decides
const NONDET = "#d0453b"; // non-deterministic: a model decides
const NO_ACCESS = "#b23db0";

type Fill = { fill: string; stroke: string };
const PROVIDER: Fill = { fill: "#eef7f3", stroke: "#cfe7de" };
const LAB: Fill = { fill: "#e8f1fb", stroke: "#c9dcf2" };
const STORE: Fill = { fill: "#fbf0e1", stroke: "#e2c49a" };
const MODEL: Fill = { fill: "#eef7f3", stroke: "#a9d3c4" };
const OTHER: Fill = { fill: "#f1edf8", stroke: "#c9bde3" };

const serif = { fontFamily: "var(--font-serif)" };

function Box({ x, y, w, h, title, sub, tone, size = 20 }: {
  x: number; y: number; w: number; h: number; title: string; sub?: string; tone: Fill; size?: number;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={tone.fill} stroke={tone.stroke} />
      <text x={x + w / 2} y={y + h / 2 + (sub ? -2 : 7)} textAnchor="middle" fill="var(--ink)" fontSize={size} style={serif}>
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 18} textAnchor="middle" fill="var(--muted)" fontSize={12}>
          {sub}
        </text>
      )}
    </g>
  );
}

/** A database: a box with an elliptic top, like the source's cylinders. */
function Cylinder({ x, y, w, h, title, sub }: { x: number; y: number; w: number; h: number; title: string; sub: string }) {
  const r = 9;
  return (
    <g>
      <path
        d={`M${x},${y + r} L${x},${y + h - r} A${w / 2},${r} 0 0 0 ${x + w},${y + h - r} L${x + w},${y + r}`}
        fill={STORE.fill} stroke={STORE.stroke} />
      <ellipse cx={x + w / 2} cy={y + r} rx={w / 2} ry={r} fill="#fff" stroke={STORE.stroke} />
      <text x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" fill="var(--ink)" fontSize={17} style={serif}>{title}</text>
      <text x={x + w / 2} y={y + h / 2 + 25} textAnchor="middle" fill="var(--muted)" fontSize={11}>{sub}</text>
    </g>
  );
}

/** An agent badge (A1…A4): green on premises, red in the cloud. */
function Agent({ cx, cy, label, cloud = false }: { cx: number; cy: number; label: string; cloud?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={17} fill={cloud ? "#f8dcd9" : "#dcefe6"} stroke={cloud ? NONDET : "var(--sage-deep)"} strokeWidth={1.3} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={cloud ? NONDET : "var(--sage-deep)"}>
        {label}
      </text>
    </g>
  );
}

function Person({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g fill="#fff" stroke="var(--muted)" strokeWidth={1.3}>
      <circle cx={cx} cy={cy} r={8} />
      <path d={`M${cx - 14},${cy + 26} Q${cx - 14},${cy + 11} ${cx},${cy + 11} Q${cx + 14},${cy + 11} ${cx + 14},${cy + 26}`} />
    </g>
  );
}

/** The numbered pill that ties a zone to its description below the diagram. */
function Num({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={14} fill="#fff" stroke="var(--blue)" />
      <text x={x} y={y + 6} textAnchor="middle" fontSize={18} fontStyle="italic" fill="var(--blue)" style={serif}>{n}</text>
    </g>
  );
}

function Line({ d, color, id, both = false, label, at, anchor = "start" }: {
  d: string; color: string; id: string; both?: boolean; label?: string; at?: [number, number]; anchor?: "start" | "middle" | "end";
}) {
  const m = `url(#${id}-${color.slice(1)})`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={1.7} strokeDasharray="7 5" markerEnd={m} markerStart={both ? m : undefined} />
      {label && at && (
        <text x={at[0]} y={at[1]} textAnchor={anchor} fontSize={13} fill={color}>{label}</text>
      )}
    </g>
  );
}

/** The simplified diagram. `id` keeps the marker ids unique, as it is drawn twice (inline and enlarged). */
function Diagram({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 1200 800" className="w-full h-full" role="img"
      aria-label="AI in software architecture: cloud and AI providers above, on-premises applications, databases, local LLMs, messaging and logging below; people reach the cloud from the browser and on-premises apps from a CLI or app; cloud assistants have no direct access to on-premises systems">
      <defs>
        {[DET, NONDET, NO_ACCESS].map((c) => (
          <marker key={c} id={`${id}-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill={c} />
          </marker>
        ))}
      </defs>

      {/* 1. cloud & AI providers */}
      <rect x={20} y={20} width={1160} height={200} rx={18} fill="#f3f6fa" stroke="var(--line)" />
      <text x={48} y={66} fontSize={30} fill="var(--ink)" style={serif}>Cloud &amp; AI providers</text>
      <text x={48} y={94} fontSize={16} fill={NONDET}>Security &amp; privacy?</text>
      <Num x={62} y={140} n={1} />
      <text x={330} y={50} fontSize={11} fill="var(--muted)" letterSpacing="0.14em">HYPERSCALERS</text>
      <Box x={330} y={58} w={240} h={50} title="Microsoft" tone={PROVIDER} />
      <Agent cx={545} cy={83} label="A" cloud />
      <Box x={590} y={58} w={240} h={50} title="Amazon" tone={PROVIDER} />
      <Box x={850} y={58} w={240} h={50} title="Google" tone={PROVIDER} />
      <text x={330} y={138} fontSize={11} fill="var(--muted)" letterSpacing="0.14em">MODEL LABS</text>
      <Box x={460} y={146} w={250} h={58} title="OpenAI" sub="GPT" tone={LAB} />
      <Box x={740} y={146} w={250} h={58} title="Anthropic" sub="Opus · Sonnet · Haiku" tone={LAB} />

      {/* the boundary */}
      <text x={48} y={262} fontSize={14} fill={DET}>— deterministic (code)</text>
      <text x={48} y={286} fontSize={14} fill={NONDET}>— probabilistic (a model)</text>
      <Line d="M245,224 L245,356" color={NO_ACCESS} id={id} both label="No direct access" at={[258, 296]} />

      {/* 2. how people reach AI */}
      <Num x={498} y={300} n={2} />
      <Person cx={620} cy={240} />
      <Line d="M620,268 L620,280" color={DET} id={id} />
      <rect x={545} y={284} width={150} height={34} rx={10} fill="#f8dcd9" stroke="#e7b3ad" />
      <text x={620} y={306} textAnchor="middle" fontSize={15} fill="var(--ink)">Browser</text>
      <Person cx={905} cy={240} />
      <Line d="M905,268 L905,280" color={DET} id={id} />
      <rect x={825} y={284} width={160} height={34} rx={10} fill="#dcefe6" stroke="#a9d3c4" />
      <text x={905} y={306} textAnchor="middle" fontSize={15} fill="var(--ink)">CLI / app</text>
      <Line d="M585,284 L548,104" color={NONDET} id={id} />

      {/* 3. on premises */}
      <rect x={20} y={360} width={1160} height={360} rx={18} fill="#f7fafd" stroke="var(--line)" />
      <text x={48} y={406} fontSize={30} fill="var(--ink)" style={serif}>On premises</text>
      <text x={48} y={434} fontSize={16} fill="var(--sage-deep)">Security &amp; privacy++</text>
      <Line d="M620,318 L620,398" color={DET} id={id} />
      <Line d="M905,318 L905,398" color={DET} id={id} />

      <rect x={500} y={400} width={230} height={104} rx={14} fill="var(--sky)" stroke="var(--accent-border)" strokeWidth={1.4} />
      <text x={640} y={440} textAnchor="middle" fontSize={26} fill="var(--ink)" style={serif}>App 1</text>
      <Agent cx={540} cy={470} label="A1" />
      <Num x={710} y={420} n={3} />
      <rect x={790} y={400} width={250} height={104} rx={14} fill="var(--sky)" stroke="var(--accent-border)" strokeWidth={1.4} />
      <text x={915} y={440} textAnchor="middle" fontSize={26} fill="var(--ink)" style={serif}>App 2</text>
      <Agent cx={855} cy={475} label="A2" />
      <Agent cx={915} cy={475} label="A3" />
      <Agent cx={975} cy={475} label="A4" />
      <text x={1058} y={444} fontSize={13} fill="var(--muted)">eval design</text>
      <text x={1058} y={462} fontSize={13} fill="var(--muted)">&amp; hill-climbing</text>

      <text x={300} y={462} fontSize={14} fontWeight={700} fill="var(--ink)">CRUD</text>
      <text x={300} y={480} fontSize={12} fill="var(--muted)">
        Create, Read, Update, <tspan fill={NONDET} fontWeight={600}>Delete</tspan>
      </text>

      {/* app 1 → a cloud model's API: the prompt leaves the premises */}
      <Line d="M528,456 L400,110" color={NONDET} id={id} both label="cloud model API" at={[434, 232]} anchor="end" />

      {/* 4. local building blocks */}
      <Num x={62} y={560} n={4} />
      <rect x={90} y={556} width={420} height={144} rx={14} fill="#fff" stroke="var(--line)" />
      <text x={110} y={584} fontSize={18} fill="var(--ink)" style={serif}>Databases</text>
      <Cylinder x={110} y={600} w={120} h={82} title="SQL" sub="records" />
      <Cylinder x={240} y={600} w={120} h={82} title="Vector" sub="embeddings" />
      <Cylinder x={370} y={600} w={120} h={82} title="others" sub="files, graphs…" />

      <rect x={530} y={556} width={380} height={144} rx={14} fill="#fff" stroke="var(--line)" />
      <text x={550} y={584} fontSize={18} fill="var(--ink)" style={serif}>LLMs</text>
      <Box x={550} y={604} w={105} h={74} title="Qwen" sub="chat" tone={MODEL} size={18} />
      <Box x={670} y={604} w={105} h={74} title="BGE" sub="embeddings" tone={MODEL} size={18} />
      <Box x={790} y={604} w={105} h={74} title="others" sub="vision, rerank…" tone={MODEL} size={18} />

      <rect x={930} y={556} width={230} height={144} rx={14} fill="#fff" stroke="var(--line)" />
      <text x={950} y={584} fontSize={18} fill="var(--ink)" style={serif}>Others</text>
      <Box x={950} y={604} w={95} h={74} title="Messaging" tone={OTHER} size={15} />
      <Box x={1055} y={604} w={90} h={74} title="Logging" tone={OTHER} size={15} />

      {/* app 1's flows: red where the agent decides, blue where code does */}
      <Line d="M526,486 L180,598" color={NONDET} id={id} both />
      <Line d="M600,504 L310,598" color={DET} id={id} />
      <Line d="M552,488 L600,602" color={NONDET} id={id} both />
      <Line d="M650,504 L718,602" color={DET} id={id} />
      <rect x={366} y={522} width={78} height={24} rx={12} fill="#fff" stroke={NONDET} />
      <text x={405} y={539} textAnchor="middle" fontSize={13} fontWeight={600} fill={NONDET}>Agent</text>
      <rect x={668} y={522} width={64} height={24} rx={12} fill="#fff" stroke={DET} />
      <text x={700} y={539} textAnchor="middle" fontSize={13} fontWeight={600} fill={DET}>RAG</text>

      {/* 5. the web */}
      <rect x={250} y={740} width={820} height={44} rx={22} fill="#f8dcd9" stroke="#e7b3ad" />
      <text x={660} y={769} textAnchor="middle" fontSize={20} fill="var(--ink)" style={serif}>Web</text>
      <Num x={220} y={762} n={5} />
      {/* an agent searching the web: probabilistic, and its result is unvalidated */}
      <Line d="M993,478 C1185,500 1185,710 1050,738" color={NONDET} id={id} both />
      <text x={1078} y={735} fontSize={12} fill={NONDET}>web search</text>
      <text x={1078} y={750} fontSize={12} fill={NONDET}>· unvalidated</text>
    </svg>
  );
}

/** The diagram, inline; a click opens it enlarged in a modal dialog (Esc, the button or the backdrop closes it). */
export function ArchitectureDiagram() {
  const id = useId().replace(/:/g, "");
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="group block w-full deck-card p-4 cursor-zoom-in text-left overflow-x-auto"
        aria-label="Enlarge the architecture diagram"
      >
        <div style={{ minWidth: 720 }}>
          <Diagram id={`${id}-inline`} />
        </div>
        <span className="mt-2 block text-center text-sm text-[var(--muted)] group-hover:text-[var(--blue)]">
          Click to enlarge
        </span>
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[96vw] max-w-[1600px] h-[92vh] rounded-2xl border border-[var(--line)] bg-white p-0 backdrop:bg-[rgba(20,38,61,0.55)] backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-3">
            <span className="kicker">AI in software architecture</span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-full border border-[var(--accent-border)] px-4 py-1.5 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--sky)]"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="h-full" style={{ minWidth: 900 }}>
              <Diagram id={`${id}-large`} />
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
