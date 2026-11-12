# Reference AI: Homepage, Deck-Based RAG, Deck Styling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Rename the app to Reference AI.
- Add a homepage explaining RAG and Agents.
- Index the training HTML decks as the RAG knowledge base, re-ingesting a deck when it changes.
- Restyle the app in the decks' look, with animated three.js hero scenes.

**Architecture:**
- `src/lib/decks.ts` turns each deck's HTML into one chunk per slide.
- `scripts/ingest.ts` hashes each deck, then skips, replaces or prunes it. It runs before `bun dev`.
- The UI gets a shared header, deck tokens and fonts, and a `SceneHero` component that runs scenes ported from the deck kit.

**Tech stack:** Next.js 16, React 19, Tailwind v4, Drizzle + pgvector, Bun, `node-html-parser`, `three@0.160.0`.

**Spec:** `docs/superpowers/specs/2026-11-12-reference-ai-home-decks-design.md`

**Testing policy:** **no unit tests** (project rule). Each task is verified with `bunx tsc --noEmit`, curl, psql reads or a browser check, as stated in the task.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/decks.ts` (new) | Deck config (`DECK_FILES`, `decksDir`), slide extraction, slide → chunks |
| `scripts/ingest.ts` (rewrite) | Hash-based skip/replace/prune ingestion of the decks; `--soft` mode |
| `drizzle/0003_*.sql` (generated + hand-edited) | `documents.source`, `content_hash`, unique filename, cascade, PDF cleanup |
| `src/lib/retrieval.ts`, `src/lib/agent-tools.ts`, `src/lib/agent.ts`, `src/components/chat.tsx` | Slide citations |
| `src/app/globals.css`, `src/app/layout.tsx` | Deck tokens, fonts, metadata |
| `src/components/site-header.tsx` (new) | Shared nav |
| `src/components/scenes/kit.ts`, `rag-scene.ts`, `agent-loop-scene.ts` (new) | three.js scene kit + two scenes, ported from the decks |
| `src/components/scene-hero.tsx` (new) | Hero band running a scene (client-only, visibility-gated, disposable) |
| `src/app/page.tsx` (rewrite), `src/app/chat/page.tsx` (new) | Homepage; chat moves to `/chat` |
| `src/app/overview/page.tsx`, `src/components/agent-runs.tsx` | Shared header, hero, token colors |
| Docs, `package.json`, `.serena/project.yml`, `.env.local.example` | Rename, `DECKS_DIR`, scripts |

---

### Task 1: Dependencies, rename and PDF removal

**Files:** `package.json`, `bun.lock`, `.serena/project.yml`, `Simple RAG overview.pdf`, `data/`

- [ ] Remove the PDF and its tooling, and add the new dependencies:

```bash
git rm -q "Simple RAG overview.pdf"
rm -f "data/Simple RAG overview.pdf"; rmdir data 2>/dev/null || true
bun remove pdf-parse
bun add node-html-parser three@0.160.0
bun add -d @types/three@0.160.0
```

- [ ] Rename in `package.json` (`"name": "reference-ai-application"`), then run `bun install` so that `bun.lock` follows. In `.serena/project.yml`, set `project_name: "reference-ai-application"`.

- [ ] In `package.json` scripts:
  - add `"predev": "bun scripts/ingest.ts --soft"`
  - keep `"ingest": "bun scripts/ingest.ts"`
  - `bootstrap` stays `bun db:setup && bun db:embeddings-setup && bun ingest`

- [ ] Verify: `grep -n "pdf-parse\|reference-rag" package.json bun.lock` returns nothing.

### Task 2: Schema + migration

**Files:** `src/lib/schema.ts`, `drizzle/0003_*.sql`

- [ ] In `schema.ts`, change `documents` and `chunks`:

```ts
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull().unique(),
  title: text("title"),
  source: text("source").notNull().default("deck"),
  contentHash: text("content_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  // … unchanged
});
```

- [ ] Run `bun db:generate`. Edit the generated `drizzle/0003_*.sql` so that its **first** statements are:

```sql
-- Hand-written: the PDF source is retired (decks are the knowledge base); clear it before the unique constraint.
DELETE FROM "chunks" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "filename" ILIKE '%.pdf');--> statement-breakpoint
DELETE FROM "documents" WHERE "filename" ILIKE '%.pdf';--> statement-breakpoint
```

- [ ] `bun db:migrate`. Verify with `psql "$DATABASE_URL" -c '\d documents'` that `source`, `content_hash` and the unique key are present, and that `select count(*) from documents` returns 0.

### Task 3: Deck extraction (`src/lib/decks.ts`)

- [ ] Create `src/lib/decks.ts`:

```ts
/**
 * The training HTML decks are the RAG knowledge base. Each deck is one document; each slide is one chunk
 * (split further only if it is longer than CHUNK_SIZE). Used by scripts/ingest.ts.
 */
import { parse, type HTMLElement, type Node } from "node-html-parser";

export const decksDir =
  process.env.DECKS_DIR ??
  "/Users/bsolga/Documents/oman-lng/oman-lng-ai-acceleration-training/decks/html/ai-intro-integ";

export const DECK_FILES = [
  "5-context-engineering.html",
  "6-agents-claude-code.html",
  "9-vector-databases.html",
  "10-rag-introduction.html",
];

const CHUNK_SIZE = 2000; // characters, ~500 tokens
const CHUNK_OVERLAP = 200;

export interface Slide { n: number; title: string; lines: string[] }
export interface DeckChunk { content: string; metadata: Record<string, unknown> }

const BLOCK = new Set(["div", "p", "li", "ul", "ol", "h1", "h2", "h3", "h4", "table", "thead", "tbody", "section", "blockquote", "pre"]);
const NUMBERING = /^([0-9]+|[ivx]+)\.?$/i; // the "1." / "ii." badges on cards and steps

/** Text of a node, one line per block element; table rows as "a | b"; icon SVGs dropped, figure labels kept. */
function textOf(node: Node): string {
  if (node.nodeType === 3) return node.text; // text node, entities decoded
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? "";
  if (tag === "script" || tag === "canvas" || tag === "style") return "";
  if (el.classList?.contains("foot")) return ""; // copyright footer
  if (tag === "svg") {
    if (el.classList.contains("ic")) return ""; // icon
    const labels = el.querySelectorAll("text").map((t) => t.text.trim()).filter(Boolean);
    return labels.length ? `\nFigure: ${labels.join(" · ")}\n` : "";
  }
  if (tag === "tr") return "\n" + el.querySelectorAll("th, td").map((c) => c.text.trim()).join(" | ") + "\n";
  const inner = el.childNodes.map(textOf).join("");
  return BLOCK.has(tag) ? `\n${inner}\n` : inner;
}

/** Deck title + its slides (Q&A skipped), in order. */
export function extractDeck(html: string): { title: string; slides: Slide[] } {
  const root = parse(html);
  const title = root.querySelector("title")?.text.trim() ?? "Untitled deck";
  const slides: Slide[] = [];
  root.querySelectorAll("section.slide").forEach((section, i) => {
    const slideTitle = (section.getAttribute("data-title") ?? "").trim();
    if (/^q\s*&\s*a$/i.test(slideTitle)) return;
    const lines = textOf(section)
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l && !NUMBERING.test(l));
    slides.push({ n: i + 1, title: slideTitle, lines });
  });
  return { title, slides };
}

function split(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const parts: string[] = [];
  for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    parts.push(text.slice(start, start + CHUNK_SIZE).trim());
  }
  return parts.filter(Boolean);
}

/** One chunk per slide, each starting with "Deck: … · Slide n: …"; slides with no text are skipped. */
export function deckChunks(filename: string, html: string): { deckTitle: string; chunks: DeckChunk[] } {
  const { title: deckTitle, slides } = extractDeck(html);
  const chunks: DeckChunk[] = [];
  for (const s of slides) {
    if (s.lines.length === 0) continue;
    const prefix = `Deck: ${deckTitle} · Slide ${s.n}: ${s.title}`;
    for (const part of split(s.lines.join("\n"))) {
      chunks.push({
        content: `${prefix}\n${part}`,
        metadata: { filename, source: "deck", deckTitle, slide: s.n, slideTitle: s.title },
      });
    }
  }
  return { deckTitle, chunks };
}
```

- [ ] Verify by printing the chunks of one deck:

```bash
bun -e 'import {deckChunks,decksDir} from "./src/lib/decks"; import {readFileSync} from "fs";
const r=deckChunks("6-agents-claude-code.html", readFileSync(decksDir+"/6-agents-claude-code.html","utf8"));
console.log(r.deckTitle, r.chunks.length); console.log(r.chunks.find(c=>c.metadata.slideTitle==="Levels of autonomy")?.content)'
```

Expected: about 14 chunks. The "Levels of autonomy" chunk lists Level 1 to Level 5 with their descriptions and no "1." lines.

### Task 4: Ingestion rewrite (`scripts/ingest.ts`)

- [ ] Replace the file with:

```ts
/**
 * Deck ingestion for Reference AI: indexes the training HTML decks, one chunk per slide.
 * Unchanged decks are skipped (content hash), changed decks are replaced in one transaction,
 * documents no longer listed in DECK_FILES are pruned.
 *
 * Usage: bun scripts/ingest.ts [--soft]
 *   --soft  (used by `predev`): when the decks folder, oMLX or the DB is unavailable, warn and exit 0
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { DECK_FILES, deckChunks, decksDir } from "../src/lib/decks";
import { embedDocument } from "../src/lib/embeddings";

const soft = process.argv.includes("--soft");
const EMBEDDING_BATCH_SIZE = 20;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 3 });

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    out.push(...(await Promise.all(texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => embedDocument(t)))));
  }
  return out;
}

async function ingest() {
  console.log(`=== Deck ingestion (${decksDir}) ===`);
  if (!existsSync(decksDir)) throw new Error(`DECKS_DIR not found: ${decksDir}`);

  const tally = { new: 0, updated: 0, unchanged: 0, pruned: 0, chunks: 0 };

  for (const filename of DECK_FILES) {
    const path = join(decksDir, filename);
    if (!existsSync(path)) {
      console.warn(`  ! ${filename}: missing, keeping its indexed version`);
      continue;
    }
    const { deckTitle, chunks } = deckChunks(filename, readFileSync(path, "utf8"));
    if (chunks.length === 0) {
      console.warn(`  ! ${filename}: 0 slides extracted (markup changed?), keeping its indexed version`);
      continue;
    }
    const hash = createHash("sha256").update(chunks.map((c) => c.content).join("\n\n")).digest("hex");
    const { rows } = await pool.query("SELECT content_hash FROM documents WHERE filename = $1", [filename]);
    if (rows[0]?.content_hash === hash) {
      tally.unchanged++;
      console.log(`  = ${filename}: unchanged`);
      continue;
    }

    const embeddings = await embedAll(chunks.map((c) => c.content)); // before the transaction: a failure changes nothing
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM documents WHERE filename = $1", [filename]); // chunks cascade
      const doc = await client.query(
        "INSERT INTO documents (filename, title, source, content_hash) VALUES ($1, $2, 'deck', $3) RETURNING id",
        [filename, deckTitle, hash],
      );
      for (let i = 0; i < chunks.length; i++) {
        await client.query(
          `INSERT INTO chunks (document_id, content, chunk_index, embedding, metadata) VALUES ($1, $2, $3, $4::vector, $5)`,
          [doc.rows[0].id, chunks[i].content, i, `[${embeddings[i].join(",")}]`, JSON.stringify(chunks[i].metadata)],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    if (rows.length) tally.updated++;
    else tally.new++;
    tally.chunks += chunks.length;
    console.log(`  ${rows.length ? "~" : "+"} ${filename}: ${chunks.length} slides indexed`);
  }

  const pruned = await pool.query("DELETE FROM documents WHERE NOT (filename = ANY($1)) RETURNING filename", [DECK_FILES]);
  tally.pruned = pruned.rowCount ?? 0;
  pruned.rows.forEach((r) => console.log(`  - ${r.filename}: pruned`));

  console.log(
    `new ${tally.new} · updated ${tally.updated} · unchanged ${tally.unchanged} · pruned ${tally.pruned} · chunks ${tally.chunks}`,
  );
}

ingest()
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (soft) {
      console.warn(`[ingest] skipped: ${message}. Starting anyway; run \`bun ingest\` once oMLX/DB/decks are available.`);
    } else {
      console.error("Ingestion failed:", message);
      process.exitCode = 1;
    }
  })
  .finally(() => pool.end());
```

- [ ] Verify:
  - Run `bun ingest`. Expected: `new 4 · … · chunks ~55`.
  - Run `bun ingest` again. Expected: `unchanged 4`, finishing in about a second.
  - Run `DECKS_DIR=/nonexistent bun scripts/ingest.ts --soft; echo $?`. Expected: a warning and exit `0`.
  - Without `--soft` the same command exits `1`.
  - **Change detection:** copy the deck folder into the scratchpad and edit one word in one slide of `10-rag-introduction.html`. Run with `DECKS_DIR=<copy> bun ingest`. Expected: `updated 1 · unchanged 3`. Run plain `bun ingest` again to restore the real index (`updated 1`).

### Task 5: Slide citations

- [ ] `src/lib/retrieval.ts`: add an exported helper and use it in `formatContext`:

```ts
/** "Deck title, slide n: Slide title" for deck chunks; the filename otherwise. */
export function citation(r: Pick<RetrievalResult, "filename" | "metadata">): string {
  const m = r.metadata ?? {};
  return m.slide ? `${m.deckTitle ?? r.filename}, slide ${m.slide}: ${m.slideTitle}` : r.filename;
}

export function formatContext(results: RetrievalResult[]): string {
  return results
    .map((r, i) => `[Source ${i + 1}: ${citation(r)} (similarity: ${r.similarity.toFixed(2)})]:\n${r.content}`)
    .join("\n\n");
}
```

- [ ] `src/lib/agent-tools.ts` `search_documents`:
  - New description: `"Semantic search over the AI training decks (context engineering, AI agents, vector databases, RAG). Returns the most relevant slides."`
  - Each result maps to `{ source: citation(r), similarity, content }`, with `citation` imported from `@/lib/retrieval`.
- [ ] `src/lib/agent.ts` `SYSTEM_PROMPT`: replace the `search_documents` line with:
  `- search_documents: for any question about the training material (context engineering, agents, vector databases, RAG). Cite the deck and slide you used, e.g. "(RAG Introduction, slide 5)".`
  Replace "a training course on AI, Machine Learning and RAG" with "a training course on AI, Agents and RAG".
- [ ] `src/components/chat.tsx`: `Source` becomes `{ label: string; similarity: number }`. Build `label` from the search result: `r.metadata?.slide ? `${r.filename.replace(/\.html$/, "")} · slide ${r.metadata.slide}: ${r.metadata.slideTitle}` : r.filename`, and render the chip as `{source.label} ({source.similarity})`.
- [ ] Verify:
  - `curl -s "localhost:3000/api/search?q=levels%20of%20autonomy" | jq '.results[0] | {filename, metadata}'`. Expected: `6-agents-claude-code.html`, slide 5.
  - An agent turn (`curl -N -X POST localhost:3000/api/agent -d '{"request":"What are the four parts of a RAG system?"}' -H 'content-type: application/json'`) calls `search_documents`, and the final answer cites the RAG deck slide.

### Task 6: Tokens, fonts and metadata

- [ ] `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Reference AI",
  description: "RAG and AI Agents, side by side, running locally",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)] antialiased">{children}</body>
    </html>
  );
}
```

- [ ] `src/app/globals.css`: replace the `:root` block and the `body` rule with the deck palette. Keep every existing variable name, and add `@theme` font tokens plus the deck typography helpers:

```css
@theme {
  --font-serif: var(--font-instrument), Georgia, serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
}

:root {
  /* the training decks' palette (decks/html/assets/theme-elegant.css) */
  --ink: #14263d;
  --blue: #0e4c92;
  --line: #e4eaf1;
  --sky: #e8f1fb;
  --sage: #5fb49c;
  --sage-deep: #2f7d67;
  --sage-panel: #eef7f3;
  --sage-border: #cfe7de;
  --sage-pill: #ddf0e8;
  --ochre: #b4813a;

  --background: #ffffff;
  --foreground: var(--ink);
  --muted: #5d6f84;
  --border: var(--line);
  --input: #f6f9fd;
  --primary: var(--blue);
  --primary-foreground: #ffffff;
  --card: #f6f9fd;
  --accent: var(--sky);
  --accent-border: #c9dcf2;
  --user-bubble: var(--blue);
  --user-text: #ffffff;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 16px;
}

/* deck typography: serif titles with an italic blue accent word, small-caps kickers */
.serif-title { font-family: var(--font-serif); font-weight: 400; letter-spacing: -0.01em; line-height: 1.02; }
.serif-title em { color: var(--blue); font-style: italic; }
.kicker { font: 600 12px/1 var(--font-sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--sage-deep); }
.deck-card { background: linear-gradient(180deg, #fff, var(--card)); border: 1px solid var(--line); border-radius: 14px; }
.deck-card.hi { background: var(--sky); border-color: var(--accent-border); }
```

Keep the `.prose` rules, and add `.prose h1, .prose h2, .prose h3 { font-family: var(--font-serif); font-weight: 400; }`.

- [ ] Verify: `bunx tsc --noEmit`. On `/agent`, the body font is Inter and the colors are navy/blue.

### Task 7: Shared header

- [ ] Create `src/components/site-header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "RAG Chat" },
  { href: "/agent", label: "Agent" },
  { href: "/overview", label: "RAG Overview" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="px-6 py-3 border-b border-[var(--border)] bg-white/90 backdrop-blur flex items-center gap-6 sticky top-0 z-20">
      <Link href="/" className="font-serif text-2xl leading-none text-[var(--ink)]">
        Reference <em className="text-[var(--blue)]">AI</em>
      </Link>
      <nav className="ml-auto flex flex-wrap gap-1 text-sm">
        {NAV.map(({ href, label }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                active ? "bg-[var(--sky)] text-[var(--blue)] font-semibold" : "text-[var(--muted)] hover:text-[var(--blue)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

### Task 8: Scene kit and scenes

- [ ] Create `src/components/scenes/kit.ts`. It is ported from `decks/html/kit/elegant-3d.js` (`base`, `waveSurface`), `elegant-dividers.js` (`dividerStage`, `glassMat`, `wireMat`, `glassBox`, `dashedLine`, `dot`, `arc`, `database`) and `elegant-topics.js` (helpers and the `topicScenes` wrapper). It adds:
  - `runScene(canvas, build)`, which returns `{ start, stop, dispose }`
  - placing the group in the right part of a band of any aspect ratio
  - colors read from the CSS variables

```ts
/**
 * The decks' 3D scene kit, ported from the training repo
 * (decks/html/kit/elegant-3d.js, elegant-dividers.js, elegant-topics.js; three.js 0.160).
 * Re-port by hand when the kit's look changes. Browser-only: import it dynamically.
 */
import * as THREE from "three";

export type Update = (t: number) => void;
export type Build = (g: THREE.Group) => Update;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
export const C = (name: string) => new THREE.Color(css(name) || "#0e4c92");
export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

export const glassMat = (c: THREE.Color, opacity = 0.82) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.05, transparent: true, opacity });
export const wireMat = (c: THREE.Color, opacity: number) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity });

export function glassBox(w: number, h: number, d: number, c: THREE.Color, opacity: number, edge: THREE.Color, edgeOpacity: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, glassMat(c, opacity));
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat(edge, edgeOpacity)));
  return { mesh };
}
export function dashedLine(curve: THREE.Curve<THREE.Vector3>, c: THREE.Color, opacity: number) {
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(50)),
    new THREE.LineDashedMaterial({ color: c, dashSize: 0.14, gapSize: 0.09, transparent: true, opacity }),
  );
  l.computeLineDistances();
  return l;
}
export const dot = (c: THREE.Color, r = 0.055) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0 }));
export const arc = (a: THREE.Vector3, b: THREE.Vector3, lift: number) =>
  new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, lift, 0.15)), b);
export function database(c: THREE.Color, rim: THREE.Color) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 48), glassMat(c, 0.85));
    d.position.y = i * 0.25;
    d.add(new THREE.LineSegments(new THREE.EdgesGeometry(d.geometry, 30), wireMat(rim, 0.55)));
    g.add(d);
  }
  return g;
}

// --- helpers of elegant-topics.js ---
export const ball = (r: number, c: THREE.Color) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, 32, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.1 }));
export const place = <T extends THREE.Object3D>(g: THREE.Group, obj: T, x: number, y: number, z = 0): T => {
  obj.position.set(x, y, z);
  g.add(obj);
  return obj;
};
export const box = (w: number, h: number, d: number, c: THREE.Color, edge: THREE.Color, opacity = 0.8) =>
  glassBox(w, h, d, c, opacity, edge, 0.55);
export const tint = () => C("sky").clone().lerp(C("blue"), 0.5);
export function disc(r: number, c: THREE.Color, edge: THREE.Color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 48), glassMat(c, 0.85));
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), wireMat(edge, 0.55)));
  return m;
}
/** Dots travelling a curve, evenly spaced; returns the per-frame update. */
export function stream(g: THREE.Group, curve: THREE.Curve<THREE.Vector3>, n: number, c: THREE.Color, speed = 0.22, r = 0.06): Update {
  const dots = Array.from({ length: n }, () => { const d = dot(c, r); g.add(d); return d; });
  return (t) => dots.forEach((d, i) => {
    const f = (t * speed + i / n) % 1;
    d.position.copy(curve.getPoint(f));
    d.material.opacity = t > 0.8 ? Math.min(1, Math.min(f, 1 - f) * 8) * 0.9 : 0;
  });
}
export function link(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, lift = 0, opacity = 0.5) {
  const curve: THREE.Curve<THREE.Vector3> = lift ? arc(a, b, lift) : new THREE.LineCurve3(a, b);
  g.add(dashedLine(curve, c, opacity));
  return curve;
}

/** The waving sky→sage→blue surface under every deck scene; returns its material, to animate. */
function waveSurface(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { t: { value: 0 }, sky: { value: C("sky") }, sage: { value: C("sage") }, blue: { value: C("blue") } },
    vertexShader: `uniform float t; varying float h; varying vec2 vUv;
      void main(){ vec3 p=position;
        p.y=sin(p.x*0.55+t*0.35)*0.32+cos(p.z*0.8-t*0.25)*0.24+sin((p.x+p.z)*0.3+t*0.2)*0.32;
        h=p.y; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 sky, sage, blue; varying float h; varying vec2 vUv;
      void main(){ float k=smoothstep(-0.7,0.8,h);
        vec3 c=mix(sky,sage,smoothstep(0.0,0.55,k)); c=mix(c,blue,smoothstep(0.5,1.0,k));
        float edge=smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.78,vUv.x)*smoothstep(0.0,0.35,vUv.y)*smoothstep(1.0,0.65,vUv.y);
        float lines=smoothstep(0.96,1.0,abs(sin(vUv.y*90.0)));
        gl_FragColor=vec4(c,edge*(0.4+lines*0.22)); }`,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(30, 12, 180, 90).rotateX(-Math.PI / 2), mat);
  surface.position.set(0, -2.9, -2);
  scene.add(surface);
  return mat;
}

/**
 * base() + dividerStage() + the topicScenes wrapper: camera drift, the group's entrance and gentle rocking,
 * self-lit glass. The group sits in the right part of the canvas whatever its aspect.
 */
export function runScene(canvas: HTMLCanvasElement, build: Build, { flat = false, scale = 0.75 } = {}) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  const CAM = new THREE.Vector3(0, 0.6, 12), TARGET = new THREE.Vector3(0, 0.2, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 5);
  scene.add(key);

  const mat = waveSurface(scene);
  const group = new THREE.Group();
  scene.add(group);
  const update = build(group);
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && "emissive" in m) { m.emissive.copy(m.color); m.emissiveIntensity = 0.22; } // the glass lights itself
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(17.5)) * CAM.z * camera.aspect;
    group.position.set(Math.min(halfWidth * 0.55, 6), 0.1, 0);
  }

  let t0 = 0;
  return {
    resize,
    start() {
      resize();
      t0 = performance.now();
      renderer.setAnimationLoop((now) => {
        const t = still ? 2.5 : Math.max(0, (now - t0) / 1000);
        camera.position.copy(CAM);
        if (!still) { camera.position.x += Math.sin(t * 0.12) * 0.5; camera.position.y += Math.sin(t * 0.09) * 0.18; }
        camera.lookAt(TARGET);
        mat.uniforms.t.value = t;
        group.scale.setScalar(scale * (0.86 + 0.14 * ease(t / 0.9)));
        if (!flat) group.rotation.y = -0.35 + Math.sin(t * 0.17) * 0.14;
        update(t);
        renderer.render(scene, camera);
        if (still) renderer.setAnimationLoop(null); // one still frame
      });
    },
    stop() { renderer.setAnimationLoop(null); },
    dispose() {
      renderer.setAnimationLoop(null);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      renderer.dispose();
    },
  };
}
```

- [ ] Create `src/components/scenes/rag-scene.ts`:

```ts
// The RAG deck's title scene (elegant-topics.js SCENES.rag): documents are retrieved, and go with the question to the model.
import * as THREE from "three";
import { C, V, ball, box, database, link, place, stream, tint, wireMat, type Build } from "./kit";

export const ragScene: Build = (g) => {
  const blue = C("blue"), deep = C("sage-deep");
  [0, 1, 2].forEach((i) =>
    place(g, box(0.95, 1.25, 0.04, i === 2 ? C("sky") : C("sage-pill"), deep).mesh, -2.7 + i * 0.14, 0.05 + i * 0.1, i * 0.1));
  place(g, database(tint(), blue), -0.4, -0.45).scale.setScalar(1.25);
  place(g, ball(0.55, C("ink")), 2.3, 0.1);
  const shell = place(g, new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.95, 1)), wireMat(blue, 0.45)), 2.3, 0.1);
  const a = stream(g, link(g, V(-2, 0.1), V(-1, 0.1), deep), 2, deep);
  const b = stream(g, link(g, V(0.2, 0.1), V(1.3, 0.1), blue), 2, blue);
  const c = stream(g, link(g, V(2.3, 1.7), V(2.3, 1.1), C("ochre"), 0, 0.5), 1, C("ochre"), 0.3);
  return (t) => { a(t); b(t); c(t); shell.rotation.y = t * 0.25; };
};
```

- [ ] Create `src/components/scenes/agent-loop-scene.ts`:

```ts
// The Agents deck's title scene (elegant-topics.js SCENES.loop): analyse, plan, execute around a terminal.
import * as THREE from "three";
import { C, V, box, dashedLine, disc, dot, place, tint, type Build } from "./kit";

export const agentLoopScene: Build = (g) => {
  const blue = C("blue"), deep = C("sage-deep"), R = 1.9;
  const ring = new THREE.EllipseCurve(0, 0, R, R).getPoints(90).map((p) => V(p.x, p.y));
  const curve = new THREE.CatmullRomCurve3(ring.slice(0, -1), true);
  g.add(dashedLine(curve, blue, 0.5));
  [90, 210, 330].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    place(g, disc(0.42, i ? C("sky") : tint(), blue), R * Math.cos(a), R * Math.sin(a), 0.1).rotation.x = Math.PI / 2;
  });
  place(g, box(1.7, 1.1, 0.1, C("ink"), blue, 0.9).mesh, 0, 0);
  [0.25, 0, -0.25].forEach((y, i) => place(g, box(1.2 - i * 0.3, 0.07, 0.02, C("sky"), blue, 0.95).mesh, -0.1 - i * 0.15, y, 0.07));
  const d = dot(deep, 0.11);
  g.add(d);
  return (t) => { d.position.copy(curve.getPoint((t * 0.09) % 1)); d.material.opacity = t > 0.6 ? 1 : 0; };
};
```

### Task 9: `SceneHero`

- [ ] Create `src/components/scene-hero.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type SceneName = "rag" | "agent";

/** A deck-style title band: an animated 3D scene on the right, text on the left over a white fade. */
export function SceneHero({ scene, kicker, title, lede, height = 340 }: {
  scene: SceneName; kicker: string; title: ReactNode; lede?: ReactNode; height?: number;
}) {
  const band = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [{ runScene }, build] = await Promise.all([
          import("./scenes/kit"),
          scene === "rag"
            ? import("./scenes/rag-scene").then((m) => m.ragScene)
            : import("./scenes/agent-loop-scene").then((m) => m.agentLoopScene),
        ]);
        if (disposed || !canvas.current || !band.current) return;
        const api = runScene(canvas.current, build);
        const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? api.start() : api.stop()));
        seen.observe(band.current);
        const sized = new ResizeObserver(() => api.resize());
        sized.observe(band.current);
        cleanup = () => { seen.disconnect(); sized.disconnect(); api.dispose(); };
      } catch {
        if (!disposed) setFailed(true); // no WebGL: text over a static gradient
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [scene]);

  return (
    <section
      ref={band}
      className="relative overflow-hidden border-b border-[var(--border)]"
      style={{
        height,
        background: failed ? "linear-gradient(100deg, #fff 35%, var(--sky) 70%, color-mix(in srgb, var(--blue) 25%, var(--sky)))" : "#fff",
      }}
    >
      {!failed && <canvas ref={canvas} className="absolute inset-0 w-full h-full" aria-hidden="true" />}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(90deg, #fff 0%, color-mix(in srgb, #fff 90%, transparent) 30%, transparent 58%)" }}
      />
      <div className="relative z-10 h-full max-w-6xl mx-auto px-6 flex flex-col justify-center gap-3">
        <div className="kicker">{kicker}</div>
        <h1 className="serif-title text-5xl md:text-6xl max-w-2xl">{title}</h1>
        {lede && <p className="text-[var(--muted)] text-lg max-w-xl leading-relaxed">{lede}</p>}
      </div>
    </section>
  );
}
```

### Task 10: Pages

- [ ] **`src/app/chat/page.tsx` (new):** `import { Chat } from "@/components/chat"; export default function ChatPage() { return <Chat />; }`
- [ ] **`src/components/chat.tsx`:**
  - Replace the `<header>…</header>` with `<SiteHeader />` followed by `<SceneHero scene="rag" kicker="RAG · Grounding" title={<>Ask the <em>decks</em></>} lede="Every answer is retrieved from the AI training decks, then generated with the slides as context." height={260} />`.
  - Drop the `Link` import.
  - Replace the empty-state block (🔍 …) with one muted line: "Try: *What are the four parts of a RAG system?*"
  - Change `type FormEvent` to `SubmitEvent` (`(e: React.SubmitEvent<HTMLFormElement>)`), matching agent-runs.
  - Placeholder: "Ask about context engineering, agents, vector databases or RAG…"
  - Error box: `bg-red-50 border-red-200 text-red-700` (it was a dark-theme leftover).
- [ ] **`src/app/overview/page.tsx`:**
  - Replace the `<header>` with `<SiteHeader />` + `<SceneHero scene="rag" kicker="RAG · Architecture" title={<>Retrieval-augmented <em>generation</em></>} lede={<>How this app's RAG pipeline is built. <em>"There are no solutions, there are only tradeoffs."</em></>} />`.
  - Remove the old `h1`/`p`.
  - Section `h2`s get `serif-title text-3xl`.
  - `Link` stays only if it is still used.
- [ ] **`src/components/agent-runs.tsx`:**
  - Replace the `<header>` with `<SiteHeader />` + `<SceneHero scene="agent" kicker="AI Agents · Acting" title={<>A tool-using <em>agent</em></>} lede={`The model decides which tools to call; our code runs them and feeds the results back, up to ${props.maxSteps} model calls per turn. Every step, prompt and token is shown below.`} />`.
  - Remove the `h1` + `p` block in `<main>`.
  - In `ModelStepView`: `border-l-indigo-500 bg-indigo-50/60` → `border-l-[var(--primary)] bg-[var(--accent)]/60`, and `text-indigo-700` → `text-[var(--primary)]`.
  - Find any other `indigo` with `grep -n indigo` and map it to the primary/accent tokens. Tool colors (amber/red), pink and slate stay.
  - Drop the `Link` import if it is unused.
- [ ] **`src/app/page.tsx` (homepage):** a server component with `<SiteHeader />` and the content from spec §3. Structure:

```tsx
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const LEVELS = [
  { n: 1, name: "AI as an assistant", text: "it suggests; people decide", here: "RAG chat" },
  { n: 2, name: "Partial automation", text: "it does chosen tasks; people oversee every step", here: "Agent demo" },
  { n: 3, name: "Conditional autonomy in a defined scope", text: "it works alone, inside a defined scope" },
  { n: 4, name: "High autonomy", text: "rare human intervention, on reviews and exceptions" },
  { n: 5, name: "Full autonomy", text: "the emerging AI-native domain" },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-6xl mx-auto px-6 py-14 space-y-16">
        {/* 1. hero: kicker "Reference AI", serif title "Two ways to put an LLM to <em>work</em>", lede */}
        {/* 2. two .deck-card columns (md:grid-cols-2): RAG (grounding) and Agents (acting, .hi), each with
              what / loop (as a flow of small pills joined by →) / when, and links to /chat + /overview or /agent */}
        {/* 3. "How they <em>complement</em> each other": three numbered points (i. ii. iii.) in a 3-column grid */}
        {/* 4. "Levels of <em>autonomy</em>": LEVELS as five steps; L1 and L2 carry a sage "RAG chat" / blue "Agent demo"
              marker; L3–5 at 50% opacity with "beyond this demo"; a note on Ready/Done + guardrails, plus the sentence
              "RAG is a level-1 agent: conversational, augmented chat. The code always retrieves; the model only answers." */}
        {/* 5. footer line about the knowledge base */}
      </main>
    </div>
  );
}
```

  Write the copy exactly as spec §3 gives it. Use `serif-title` for `h1`/`h2`, `kicker` for labels, and `deck-card` for cards.

- [ ] Verify: `bunx tsc --noEmit && bun run build`. In the browser:
  - `/` shows all 5 sections.
  - `/chat`, `/agent` and `/overview` show the shared header and the animated heroes.
  - At 390px width, the cards stack and nothing scrolls horizontally.
  - The console is free of WebGL errors after navigating back and forth.

### Task 11: Docs and rename sweep

- [ ] Replace `reference-rag-application` with `reference-ai-application`, except in the Claude memory path (`-personal-reference-rag-application`):

```bash
grep -rlI "reference-ai-application" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=.superpowers . \
  | xargs sed -i '' -E 's/([^-]|^)reference-ai-application/\1reference-ai-application/g'
```

- [ ] Replace "RAG Training Showcase" with "Reference AI" in `README.md`, `docs/SETUP.md` and `CLAUDE.md`.
- [ ] `CLAUDE.md`:
  - Project structure: add `src/app/chat/page.tsx`, `site-header.tsx`, `scene-hero.tsx`, `scenes/*` and `src/lib/decks.ts`. `page.tsx` is now the homepage.
  - Tech stack: add `three`.
  - Database: documents are decks with a `content_hash`.
  - Env: `DECKS_DIR`.
  - Scripts: `bun ingest` (hash-based), `predev`.
  - Remove the PDF mentions.
- [ ] `README.md` / `docs/SETUP.md`: replace the PDF ingestion steps with deck ingestion and `DECKS_DIR`, and update the page list.
- [ ] `.env.local.example`: add `DECKS_DIR=/path/to/oman-lng-ai-acceleration-training/decks/html/ai-intro-integ`.
- [ ] Verify: `grep -rnI "reference-rag" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=.superpowers .` returns only memory-path lines. `grep -rniI "pdf" src scripts CLAUDE.md README.md docs/SETUP.md` returns nothing relevant.

### Task 12: End-to-end verification

- [ ] `bunx tsc --noEmit` and `bun run build` pass.
- [ ] `bun dev`: predev prints `unchanged 4` and the server starts. With oMLX stopped, predev warns and the server still starts.
- [ ] The curl checks of Tasks 4–5 pass.
- [ ] Browser check of all four pages, including narrow width and reduced motion (DevTools → Rendering → emulate `prefers-reduced-motion`).
- [ ] No commits unless the user asks.
