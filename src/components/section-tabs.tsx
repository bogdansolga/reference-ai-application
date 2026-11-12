"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The tabs under a section's hero (e.g. Chat | How it works); the current page is underlined. */
export function SectionTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="border-b border-[var(--border)] bg-white">
      <div className="max-w-6xl mx-auto px-6 flex gap-6">
        {tabs.map(({ href, label }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`py-3 -mb-px border-b-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-[var(--blue)] text-[var(--blue)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--blue)]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
