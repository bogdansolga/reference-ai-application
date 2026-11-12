import { AgentRuns } from "@/components/agent-runs";
import { CONTEXT_WINDOW, MAX_STEPS, SYSTEM_PROMPT, countTokens } from "@/lib/agent";
import { toolDefinitions, toolKinds } from "@/lib/agent-tools";

// Token counts come from the live oMLX tokenizer, so render per request.
export const dynamic = "force-dynamic";

export default async function AgentPage() {
  // The fixed part of every prompt: what each model call carries before the user says anything.
  const fixedCost = await Promise.all([
    countTokens(SYSTEM_PROMPT),
    countTokens(JSON.stringify(toolDefinitions)),
  ])
    .then(([system, tools]) => ({ system, tools }))
    .catch(() => null); // oMLX down → the page still renders, without the numbers

  return (
    <AgentRuns
      systemPrompt={SYSTEM_PROMPT}
      tools={toolDefinitions}
      toolKinds={toolKinds}
      maxSteps={MAX_STEPS}
      contextWindow={CONTEXT_WINDOW}
      fixedCost={fixedCost}
    />
  );
}
