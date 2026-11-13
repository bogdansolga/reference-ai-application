import type { Metadata } from "next";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { ArchitecturePage } from "@/components/architecture-page";

export const metadata: Metadata = { title: "Architecture · Reference AI" };

export default function Page() {
  return <ArchitecturePage view="/architecture" diagram={<ArchitectureDiagram />} />;
}
