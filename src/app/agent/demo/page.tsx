import { AgentRuns } from "@/components/agent-runs";
import { CONTEXT_WINDOW } from "@/lib/agent";
import { toolKinds } from "@/lib/agent-tools";

export default function AgentDemoPage() {
  return <AgentRuns toolKinds={toolKinds} contextWindow={CONTEXT_WINDOW} />;
}
