import type { ReactNode } from "react";

/** A deck-style section heading: kicker, serif title (an <em> word turns italic blue), optional lede. */
export function SectionHead({ kicker, children, lede }: { kicker: string; children: ReactNode; lede?: ReactNode }) {
  return (
    <div className="space-y-2 mb-6">
      <div className="kicker">{kicker}</div>
      <h2 className="serif-title text-5xl">{children}</h2>
      {lede && <p className="text-lg text-[var(--muted)] max-w-3xl leading-relaxed">{lede}</p>}
    </div>
  );
}
