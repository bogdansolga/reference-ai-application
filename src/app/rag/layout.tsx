import { SceneHero } from "@/components/scene-hero";
import { SectionTabs } from "@/components/section-tabs";
import { SiteHeader } from "@/components/site-header";

// Shared by /rag/chat and /rag/overview: it stays mounted across the tabs, so the scene keeps running
// and the chat keeps its conversation while you look at the overview.
export default function RagLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <SiteHeader />
      <SceneHero
        scene="rag"
        kicker="RAG · Grounding"
        title={<>Retrieval Augmented <em>Generation</em></>}
        lede="Answers grounded in the AI training decks: ask in the chat, or see how the pipeline is built."
      />
      <SectionTabs
        tabs={[
          { href: "/rag/chat", label: "Chat" },
          { href: "/rag/overview", label: "How it works" },
        ]}
      />
      {children}
    </div>
  );
}
