import { SceneHero } from "@/components/scene-hero";
import { SectionTabs } from "@/components/section-tabs";
import { SiteHeader } from "@/components/site-header";
import { MAX_STEPS } from "@/lib/agent";

// Shared by /agent/demo and /agent/overview: it stays mounted across the tabs, so the scene keeps running.
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader />
      <SceneHero
        scene="agent"
        kicker="AI Agents · Acting"
        title={<>A tool-using <em>agent</em></>}
        lede={`The model decides which tools to call; our code runs them and feeds the results back, up to ${MAX_STEPS} model calls per turn. Follow-up questions continue the session.`}
      />
      <SectionTabs
        tabs={[
          { href: "/agent/demo", label: "Demo" },
          { href: "/agent/overview", label: "How it works" },
        ]}
      />
      {children}
    </div>
  );
}
