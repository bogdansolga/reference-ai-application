"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Label, LabelTone } from "./scenes/architecture-scene";

const TONE: Record<LabelTone, string> = {
  plate: "text-right",
  item: "px-2 py-0.5 rounded-md bg-white/85 border border-[var(--line)] font-serif text-[14px] leading-tight text-[var(--ink)] text-center",
  num: "w-7 h-7 rounded-full bg-white border border-[var(--blue)] font-serif italic text-lg leading-[26px] text-center text-[var(--blue)]",
  red: "px-2 py-0.5 rounded-full bg-white/90 border border-[#d0453b] text-xs font-semibold text-[#d0453b]",
  blue: "px-2 py-0.5 rounded-full bg-white/90 border border-[#3a78c9] text-xs font-semibold text-[#3a78c9]",
  magenta: "px-2 py-0.5 rounded-full bg-white/90 border border-[#b23db0] text-xs font-semibold text-[#b23db0]",
  note: "text-xs leading-tight text-[var(--muted)] text-left",
  sage: "px-1.5 rounded-full bg-[var(--sage-pill)] border border-[var(--sage-border)] text-[11px] font-semibold text-[var(--sage-deep)]",
};

function LabelView({ l }: { l: Label }) {
  if (l.tone === "plate") {
    return (
      <div className={TONE.plate}>
        <div className="font-serif text-2xl leading-none text-[var(--ink)] whitespace-nowrap">{l.text}</div>
        {l.sub && (
          <div className={`text-sm whitespace-nowrap ${l.subTone === "red" ? "text-[#d0453b]" : "text-[var(--sage-deep)]"}`}>
            {l.sub}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`${TONE[l.tone]} whitespace-nowrap`}>
      {l.text}
      {l.sub && <div className="font-sans text-[10px] leading-tight text-[var(--muted)]">{l.sub}</div>}
    </div>
  );
}

/** One live scene: a canvas plus its HTML labels, kept in place by projecting each label's 3D anchor every frame. */
function Scene({ large = false, onOpen }: { large?: boolean; onOpen?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [THREE, { OrbitControls }, { buildArchitecture }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        import("./scenes/architecture-scene"),
      ]);
      if (disposed || !canvas.current || !box.current) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      const el = canvas.current;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(5, 9, 6);
      scene.add(key);

      const group = new THREE.Group();
      scene.add(group);
      const built = buildArchitecture(group);
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && "emissive" in m) {
          m.emissive.copy(m.color);
          m.emissiveIntensity = 0.32;
        }
      });
      setLabels(built.labels);

      const target = new THREE.Vector3(0, 0.6, 0);
      const controls = new OrbitControls(camera, el);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = large;
      controls.minDistance = 12;
      controls.maxDistance = 60;
      controls.minAzimuthAngle = -0.5;
      controls.maxAzimuthAngle = 1.1;
      controls.minPolarAngle = 0.45;
      controls.maxPolarAngle = 1.35;
      let lastTouch = -1e9;
      controls.addEventListener("start", () => (lastTouch = performance.now()));
      controls.addEventListener("end", () => (lastTouch = performance.now()));

      // fit the whole layout (about 17 × 11 units seen from the front-top) on every resize, keeping the view's direction
      const dir = new THREE.Vector3(0.42, 0.9, 1).normalize() // a three-quarter view;
      function resize() {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const d = Math.max(9.4 / (tan * camera.aspect), 8.3 / tan);
        const current = camera.position.clone().sub(target);
        camera.position.copy(target).add((current.lengthSq() ? current.normalize() : dir).multiplyScalar(d));
        camera.updateProjectionMatrix();
      }
      camera.position.copy(target).add(dir);
      resize();

      const v = new THREE.Vector3();
      const t0 = performance.now();
      function frame(now: number) {
        const t = still ? 2.5 : Math.max(0, (now - t0) / 1000);
        // a gentle sway while nobody is turning the view
        if (!still && now - lastTouch > 2500) group.rotation.y = Math.sin(t * 0.12) * 0.07;
        built.update(t);
        controls.update();
        renderer.render(scene, camera);
        const nodes = layer.current?.children;
        if (nodes) {
          group.updateMatrixWorld();
          built.labels.forEach((l, i) => {
            const n = nodes[i] as HTMLElement | undefined;
            if (!n) return;
            v.copy(l.at).applyMatrix4(group.matrixWorld).project(camera);
            const x = ((v.x + 1) / 2) * el.clientWidth;
            const y = ((1 - v.y) / 2) * el.clientHeight;
            n.style.transform = `translate(${x}px, ${y}px) translate(${l.tone === "plate" ? "-100%" : "-50%"}, ${l.below ? "0" : "-100%"})`;
            n.style.opacity = v.z > 1 ? "0" : "1";
          });
        }
      }
      const io = new IntersectionObserver(([e]) => {
        renderer.setAnimationLoop(e.isIntersecting ? frame : null);
      });
      io.observe(el);
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      cleanup = () => {
        io.disconnect();
        ro.disconnect();
        renderer.setAnimationLoop(null);
        controls.dispose();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
          mats.forEach((x) => x.dispose());
        });
        renderer.dispose();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [large]);

  // a click (not a drag) on the inline scene opens the enlarged one
  const down = useRef<[number, number] | null>(null);
  return (
    <div
      ref={box}
      className={`relative overflow-hidden ${large ? "h-full" : "h-[420px] md:h-[600px] cursor-grab active:cursor-grabbing"}`}
      onPointerDown={(e) => (down.current = [e.clientX, e.clientY])}
      onClick={(e) => {
        const d = down.current;
        if (onOpen && d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 5) onOpen();
      }}
    >
      {failed ? (
        <div className="h-full grid place-items-center text-[var(--muted)]">
          <p>
            3D needs WebGL. <Link href="/architecture" className="text-[var(--blue)] underline">See the flat diagram</Link>.
          </p>
        </div>
      ) : (
        <>
          <canvas ref={canvas} className="absolute inset-0 w-full h-full touch-none" />
          <div ref={layer} className="pointer-events-none absolute inset-0 select-none">
            {labels.map((l) => (
              <div key={`${l.tone}-${l.text}-${l.at.x}`} className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
                <LabelView l={l} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The architecture diagram as a light 3D scene: drag to turn it, click to enlarge (where it also zooms). */
export function Architecture3D() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };
  return (
    <>
      <div className="deck-card overflow-hidden">
        <Scene onOpen={show} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-2.5 text-sm text-[var(--muted)]">
          <span>
            <span className="text-[#3a78c9] font-semibold">— deterministic (code)</span> ·{" "}
            <span className="text-[#d0453b] font-semibold">— probabilistic (a model)</span>
          </span>
          <span>Drag to turn · click to enlarge</span>
        </div>
      </div>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[96vw] max-w-[1700px] h-[92vh] rounded-2xl border border-[var(--line)] bg-white p-0 backdrop:bg-[rgba(20,38,61,0.55)] backdrop:backdrop-blur-sm"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-3">
            <span className="kicker">AI in software architecture · drag to turn, scroll to zoom</span>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-full border border-[var(--accent-border)] px-4 py-1.5 text-sm font-semibold text-[var(--blue)] hover:bg-[var(--sky)]"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1">{open && <Scene large />}</div>
        </div>
      </dialog>
    </>
  );
}
