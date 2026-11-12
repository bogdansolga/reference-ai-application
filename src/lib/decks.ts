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

export interface Slide {
  n: number;
  title: string;
  lines: string[];
}
export interface DeckChunk {
  content: string;
  metadata: Record<string, unknown>;
}

const BLOCK = new Set([
  "div", "p", "li", "ul", "ol", "h1", "h2", "h3", "h4", "table", "thead", "tbody", "section", "blockquote", "pre",
]);
const NUMBERING = /^([0-9]+|[ivx]+)\.?$/i; // the "1." / "ii." badges on cards and steps

/**
 * Replace each SVG before parsing: icons are dropped, a figure becomes one "Figure: <aria-label> — <labels>" line.
 * (Figure SVGs close camelCase tags in lowercase, e.g. </radialgradient>, which would derail the HTML parser.)
 */
function flattenSvgs(html: string): string {
  return html.replace(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi, (_, attrs: string, body: string) => {
    if (/class="[^"]*\bic\b/.test(attrs)) return "";
    const aria = /aria-label="([^"]*)"/.exec(attrs)?.[1];
    const labels = [...body.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, " ").trim())
      .filter(Boolean);
    const parts = [aria, labels.join(" · ")].filter(Boolean);
    return parts.length ? `<p>Figure: ${parts.join(" — ")}</p>` : "";
  });
}

/** Text of a node, one line per block element; table rows as "a | b". */
function textOf(node: Node): string {
  if (node.nodeType === 3) return node.text; // text node, entities decoded
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? "";
  if (tag === "script" || tag === "canvas" || tag === "style") return "";
  if (el.classList?.contains("foot")) return ""; // copyright footer
  if (tag === "tr") return "\n" + el.querySelectorAll("th, td").map((c) => c.text.trim()).join(" | ") + "\n";
  const inner = el.childNodes.map(textOf).join("");
  return BLOCK.has(tag) ? `\n${inner}\n` : inner;
}

/** Deck title + its slides (Q&A skipped), in order; `n` is the slide's position in the deck. */
export function extractDeck(html: string): { title: string; slides: Slide[] } {
  const root = parse(flattenSvgs(html));
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
