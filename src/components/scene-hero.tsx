"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type SceneName = "rag" | "agent";

/**
 * A deck-style title band: the deck's animated 3D scene on the right, text on the left over a white fade.
 * three.js loads only in the browser; the scene runs while the band is visible and is disposed on unmount.
 */
export function SceneHero({
  scene,
  kicker,
  title,
  lede,
  height = 340,
}: {
  scene: SceneName;
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  height?: number;
}) {
  const band = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const [{ runScene }, build] = await Promise.all([
          import("./scenes/kit"),
          scene === "rag"
            ? import("./scenes/rag-scene").then((m) => m.ragScene)
            : import("./scenes/agent-loop-scene").then((m) => m.agentLoopScene),
        ]);
        if (disposed || !canvas.current || !band.current) return;
        const api = runScene(canvas.current, build);
        const seen = new IntersectionObserver(([e]) => (e.isIntersecting ? api.start() : api.stop()));
        seen.observe(band.current);
        const sized = new ResizeObserver(() => api.resize());
        sized.observe(band.current);
        cleanup = () => {
          seen.disconnect();
          sized.disconnect();
          api.dispose();
        };
      } catch {
        if (!disposed) setFailed(true); // no WebGL: the text stays, over a static gradient
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [scene]);

  return (
    <section
      ref={band}
      className="relative overflow-hidden border-b border-[var(--border)] shrink-0"
      style={{
        height,
        background: failed
          ? "linear-gradient(100deg, #fff 35%, var(--sky) 70%, color-mix(in srgb, var(--blue) 25%, var(--sky)))"
          : "#fff",
      }}
    >
      {!failed && <canvas ref={canvas} className="absolute inset-0 w-full h-full" aria-hidden="true" />}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, #fff 0%, color-mix(in srgb, #fff 90%, transparent) 30%, transparent 58%)",
        }}
      />
      <div className="relative z-10 h-full max-w-6xl mx-auto px-6 flex flex-col justify-center gap-3">
        <div className="kicker">{kicker}</div>
        <h1 className="serif-title text-5xl md:text-6xl max-w-2xl">{title}</h1>
        {lede && <p className="text-[var(--muted)] text-lg max-w-xl leading-relaxed">{lede}</p>}
      </div>
    </section>
  );
}
