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
import { logger } from "@/lib/core/utils/logger";
import { embedDocument } from "../src/lib/embeddings";

const soft = process.argv.includes("--soft");
const EMBEDDING_BATCH_SIZE = 20;

// --- Direct pool for the script (not the app's pool) ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, max: 3 });

async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    out.push(...(await Promise.all(texts.slice(i, i + EMBEDDING_BATCH_SIZE).map((t) => embedDocument(t)))));
  }
  return out;
}

async function ingest() {
  logger.info(`=== Deck ingestion (${decksDir}) ===`);
  if (!existsSync(decksDir)) throw new Error(`DECKS_DIR not found: ${decksDir}`);

  const tally = { new: 0, updated: 0, unchanged: 0, pruned: 0, chunks: 0 };

  for (const filename of DECK_FILES) {
    const path = join(decksDir, filename);
    if (!existsSync(path)) {
      logger.warn(`  ! ${filename}: missing, keeping its indexed version`);
      continue;
    }
    const { deckTitle, chunks } = deckChunks(filename, readFileSync(path, "utf8"));
    if (chunks.length === 0) {
      logger.warn(`  ! ${filename}: 0 slides extracted (markup changed?), keeping its indexed version`);
      continue;
    }
    const hash = createHash("sha256").update(chunks.map((c) => c.content).join("\n\n")).digest("hex");
    const { rows } = await pool.query("SELECT content_hash FROM documents WHERE filename = $1", [filename]);
    if (rows[0]?.content_hash === hash) {
      tally.unchanged++;
      logger.log(`  = ${filename}: unchanged`);
      continue;
    }

    // Embed before the transaction opens: a failure leaves the previous version in place.
    const embeddings = await embedAll(chunks.map((c) => c.content));
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
          `INSERT INTO chunks (document_id, content, chunk_index, embedding, metadata)
           VALUES ($1, $2, $3, $4::vector, $5)`,
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
    logger.log(`  ${rows.length ? "~" : "+"} ${filename}: ${chunks.length} slides indexed`);
  }

  const pruned = await pool.query("DELETE FROM documents WHERE NOT (filename = ANY($1)) RETURNING filename", [
    DECK_FILES,
  ]);
  tally.pruned = pruned.rowCount ?? 0;
  pruned.rows.forEach((r) => logger.log(`  - ${r.filename}: pruned`));

  logger.log(
    `new ${tally.new} · updated ${tally.updated} · unchanged ${tally.unchanged} · pruned ${tally.pruned} · chunks ${tally.chunks}`,
  );
}

ingest()
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    if (soft) {
      logger.warn(`[ingest] skipped: ${message}. Starting anyway; run \`bun ingest\` once oMLX, the DB and the decks are available.`);
    } else {
      logger.error("Ingestion failed", err);
      process.exitCode = 1;
    }
  })
  .finally(() => pool.end());
