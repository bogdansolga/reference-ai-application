import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { runAgent, type AgentEvent, type HistoryTurn } from "@/lib/agent";
import { logger } from "@/lib/core/utils/logger";
import { db } from "@/lib/db";
import { agentRuns, agentSessions } from "@/lib/schema";

type StoredEvent = { type: string; [key: string]: unknown };

/**
 * POST { request, sessionId? } → Server-Sent Events:
 * session, run_start, model_call_start, model_call_end, tool_start, tool_end, final,
 * summary_start, summary_end | error, then run_saved once the turn is stored.
 * Without sessionId a new session is created.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userText = typeof body.request === "string" ? body.request.trim() : "";
  if (!userText) {
    return Response.json({ error: "Missing 'request'" }, { status: 400 });
  }

  // Continue an existing session, or start a new one.
  let session: { id: number; title: string };
  let isNew = false;
  if (body.sessionId != null) {
    const [found] = await db.select().from(agentSessions).where(eq(agentSessions.id, Number(body.sessionId)));
    if (!found) return Response.json({ error: "Unknown session" }, { status: 404 });
    session = found;
  } else {
    [session] = await db.insert(agentSessions).values({ title: userText.slice(0, 80) }).returning();
    isNew = true;
  }

  // Earlier finished turns of this session, oldest first.
  const history: HistoryTurn[] = (
    await db
      .select({ request: agentRuns.request, answer: agentRuns.answer, summary: agentRuns.summary })
      .from(agentRuns)
      .where(and(eq(agentRuns.sessionId, session.id), eq(agentRuns.status, "done"), isNotNull(agentRuns.answer)))
      .orderBy(asc(agentRuns.id))
  ).map((r) => ({ request: r.request, answer: r.answer!, summary: r.summary }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const events: StoredEvent[] = [];
      const t0 = Date.now();
      const send = (event: StoredEvent) => {
        const { type, ...data } = event;
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected; keep running so the turn is still recorded
        }
      };
      const emit = (event: AgentEvent) => {
        const stamped = { ...event, atMs: Date.now() - t0 }; // ms since run start
        events.push(stamped);
        send(stamped);
      };

      send({ type: "session", id: session.id, title: session.title, isNew });

      let result = { answer: null as string | null, summary: null as string | null };
      try {
        result = await runAgent(userText, history, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          emit({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
            hint: "Is oMLX running? curl localhost:8000/health",
          });
        }
      }

      // Persist the turn (its full event list) so the page can replay it after a refresh.
      const finished = events.some((e) => e.type === "final");
      const status = req.signal.aborted ? "aborted" : finished && result.answer ? "done" : "error";
      try {
        const [row] = await db
          .insert(agentRuns)
          .values({
            sessionId: session.id,
            request: userText,
            status,
            events,
            answer: result.answer,
            summary: result.summary,
          })
          .returning({ id: agentRuns.id, createdAt: agentRuns.createdAt });
        send({ type: "run_saved", id: row.id, createdAt: row.createdAt });
      } catch (err) {
        logger.error("Failed to save agent run", err);
      }

      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * GET              → sessions, newest first, with their turn counts
 * GET ?session=ID  → that session's turns (stored runs), oldest first
 */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session");
  if (sessionId) {
    const runs = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.sessionId, Number(sessionId)))
      .orderBy(asc(agentRuns.id));
    return Response.json({ runs });
  }
  const sessions = await db
    .select({
      id: agentSessions.id,
      title: agentSessions.title,
      createdAt: agentSessions.createdAt,
      turns: count(agentRuns.id),
    })
    .from(agentSessions)
    .leftJoin(agentRuns, eq(agentRuns.sessionId, agentSessions.id))
    .groupBy(agentSessions.id)
    .orderBy(desc(agentSessions.id))
    .limit(50);
  return Response.json({ sessions });
}

/** DELETE ?session=ID → delete that session and its turns (notes are kept). */
export async function DELETE(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("session");
  if (!sessionId) return Response.json({ error: "Missing 'session'" }, { status: 400 });
  await db.delete(agentSessions).where(eq(agentSessions.id, Number(sessionId)));
  return new Response(null, { status: 204 });
}
