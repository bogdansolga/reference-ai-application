import type { Metadata } from "next";
import { Architecture3D } from "@/components/architecture-3d";
import { ArchitecturePage } from "@/components/architecture-page";

export const metadata: Metadata = { title: "Architecture 3D · Reference AI" };

/** The same page with the diagram as a light 3D scene. */
export default function Page() {
  return <ArchitecturePage view="/architecture/3d" diagram={<Architecture3D />} />;
}
