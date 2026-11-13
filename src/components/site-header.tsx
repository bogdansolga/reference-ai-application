"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/rag", label: "RAG" },
  { href: "/agent", label: "Agent" },
  { href: "/architecture", label: "Architecture" },
];

/** The shared header: the brand and the two sections (RAG, Agent), the current one highlighted. */
export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
      <Link href="/" className="font-serif text-2xl leading-none text-[var(--ink)] shrink-0">
        Reference <em className="text-[var(--blue)]">AI</em>
      </Link>
      <nav className="ml-auto flex flex-wrap justify-end gap-1 text-sm">
        {NAV.map(({ href, label }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                active
                  ? "bg-[var(--sky)] text-[var(--blue)] font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--blue)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      </div>
    </header>
  );
}
