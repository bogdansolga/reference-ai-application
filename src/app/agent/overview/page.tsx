import Link from "next/link";
import { CapabilitiesPanel, ContextPrimer, SdkCallout } from "@/components/agent-runs";
import { SectionHead } from "@/components/section-head";
import { agentInfo } from "@/lib/agent";

// Token counts come from the live oMLX tokenizer, so render per request.
export const dynamic = "force-dynamic";

const LOOP = [
  { n: 1, h: "Send", p: "The system prompt, the tool definitions, earlier turns and the request go to the model." },
  { n: 2, h: "Decide", p: "The model answers, or asks for one or more tool calls (name + JSON arguments)." },
  { n: 3, h: "Execute", p: "Our code runs the tools (read tools look things up, write tools change data) and appends the results." },
  { n: 4, h: "Repeat", p: "The grown conversation goes back to the model, until it answers or the step limit is reached." },
];

export default async function AgentOverviewPage() {
  const info = await agentInfo();
  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-20">
      <section>
        <SectionHead
          kicker="The loop"
          lede={`The model decides; our code executes. One turn is at most ${info.maxSteps} model calls, and every call re-sends the whole conversation so far.`}
        >
          How the agent <em>works</em>
        </SectionHead>
        <div className="grid md:grid-cols-4 gap-4">
          {LOOP.map((s) => (
            <div key={s.n} className="deck-card p-5 space-y-1">
              <span className="font-serif italic text-4xl leading-none text-[var(--blue)]">{s.n}</span>
              <p className="font-semibold pt-1">{s.h}</p>
              <p className="text-[var(--muted)] leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead kicker="Context" lede="What fills the model's context window, and why a conversation gets more expensive with every step.">
          Watch the context <em>window</em>
        </SectionHead>
        <ContextPrimer contextWindow={info.contextWindow} fixedCost={info.fixedCost} toolCount={info.tools.length} />
      </section>

      <section>
        <SectionHead kicker="Capabilities" lede="Sent with every model call, exactly as below. Read tools are amber, write tools red.">
          Prompt and <em>tools</em>
        </SectionHead>
        <CapabilitiesPanel systemPrompt={info.systemPrompt} tools={info.tools} toolKinds={info.toolKinds} open />
      </section>

      <section>
        <SectionHead kicker="In production">
          The same agent, <em>shorter</em>
        </SectionHead>
        <SdkCallout />
      </section>

      <footer className="border-t border-[var(--border)] pt-6 flex flex-wrap items-center gap-3">
        <span className="text-[var(--muted)] mr-2">See it working:</span>
        <Link href="/agent/demo" className="px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90">
          Run the agent
        </Link>
        <Link href="/rag/overview" className="px-4 py-2 rounded-full border border-[var(--accent-border)] text-[var(--blue)] text-sm font-semibold hover:bg-[var(--sky)]">
          How RAG works
        </Link>
      </footer>
    </main>
  );
}
