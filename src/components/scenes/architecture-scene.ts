/**
 * The architecture overview as a light 3D scene: a cloud plate set back and up, an on-premises plate in front,
 * glass blocks for the components, and dashed flows with travelling dots (blue = code, red = a model decides).
 * Text is not drawn in 3D: `labels` are anchors that the React wrapper projects to crisp HTML. Browser-only.
 */
import * as THREE from "three";
import { C, V, ball, database, glassBox, link, stream, type Update } from "./kit";

export type LabelTone = "plate" | "item" | "num" | "red" | "blue" | "magenta" | "sage" | "note";
/** `below`: hang the label under its anchor (for the front row, so it never hides what it names). */
export type Label = { at: THREE.Vector3; text: string; sub?: string; tone: LabelTone; subTone?: "red" | "sage"; below?: boolean };

const WHITE = new THREE.Color("#ffffff");
const RED = new THREE.Color("#d0453b");
const MAGENTA = new THREE.Color("#b23db0");
const LILAC = new THREE.Color("#b8a9d6");
const PINK = new THREE.Color("#e9a7a0");
const PEACH = new THREE.Color("#e2c49a");

/** A deck colour washed towards white, for the glass. */
const wash = (c: THREE.Color, k: number) => c.clone().lerp(WHITE, k);

function plate(g: THREE.Group, w: number, d: number, at: THREE.Vector3, c: THREE.Color) {
  const { mesh } = glassBox(w, 0.12, d, wash(c, 0.55), 0.55, C("blue"), 0.28);
  mesh.position.copy(at);
  g.add(mesh);
}

/** A block standing on a plate (y = the plate's top), its label floating above it. */
function block(
  g: THREE.Group, labels: Label[], x: number, top: number, z: number,
  [w, h, d]: [number, number, number], c: THREE.Color, text: string, sub?: string, below = false,
) {
  const { mesh } = glassBox(w, h, d, c, 0.8, C("blue"), 0.4);
  mesh.position.set(x, top + h / 2, z);
  g.add(mesh);
  // the label sits on the block's front face, like signage, so it never covers the row behind
  labels.push(
    below
      ? { at: V(x, top, z + d / 2 + 0.15), text, sub, tone: "item", below }
      : { at: V(x, top + Math.min(h, 0.5) * 0.25, z + d / 2 + 0.02), text, sub, tone: "item" },
  );
}

function flow(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, lift: number, n = 3, speed = 0.22): Update {
  return stream(g, link(g, a, b, c, lift, 0.75), n, c, speed, 0.07);
}

export function buildArchitecture(g: THREE.Group) {
  const labels: Label[] = [];
  const blue = C("blue");
  const sage = C("sage");
  const sky = C("sky");
  const det = wash(blue, 0.25);

  // 1. cloud & AI providers: set back and up
  const CLOUD_TOP = 3.46;
  plate(g, 13, 4.8, V(0, 3.4, -5.4), sky);
  labels.push({ at: V(-6.7, 3.5, -3.2), text: "Cloud & AI providers", sub: "Security & privacy?", subTone: "red", tone: "plate" });
  labels.push({ at: V(-5.9, 3.55, -3.5), text: "1", tone: "num" });
  for (const [x, name] of [[-4, "Microsoft"], [0, "Amazon"], [4, "Google"]] as const) {
    block(g, labels, x, CLOUD_TOP, -6.9, [3, 0.45, 1.1], wash(sage, 0.45), name);
  }
  block(g, labels, -2, CLOUD_TOP, -4.3, [3.2, 0.6, 1.3], wash(blue, 0.78), "OpenAI", "GPT");
  block(g, labels, 2, CLOUD_TOP, -4.3, [3.2, 0.6, 1.3], wash(blue, 0.78), "Anthropic", "Opus · Sonnet · Haiku");
  const copilot = ball(0.24, RED);
  copilot.position.set(-2.9, CLOUD_TOP + 0.7, -6.9);
  g.add(copilot);
  labels.push({ at: V(-2.9, CLOUD_TOP + 1.05, -6.9), text: "A", sub: "Copilot", tone: "red" });

  // 3–4. on premises: in front, lower
  const PREM_TOP = 0.06;
  plate(g, 15.4, 7.4, V(0, 0, 1.4), sage);
  labels.push({ at: V(-7.9, 0.1, 4.9), text: "On premises", sub: "Security & privacy++", subTone: "sage", tone: "plate" });

  // the boundary: no direct access from the cloud to on premises
  link(g, V(-7.1, 0.25, -2.2), V(-6.4, 3.3, -3.2), MAGENTA, 0, 0.9);
  labels.push({ at: V(-6.75, 1.8, -2.7), text: "No direct access", tone: "magenta" });

  // 2. people: a browser and a CLI / app, between the two plates
  labels.push({ at: V(-1.1, 2.6, -2.9), text: "2", tone: "num" });
  const browser = V(0.6, 1.9, -2.9);
  const cli = V(4.6, 1.9, -2.9);
  for (const [p, c, name] of [[browser, PINK, "Browser"], [cli, sage, "CLI / app"]] as const) {
    const { mesh } = glassBox(1.5, 0.32, 0.6, wash(c, 0.35), 0.85, C("blue"), 0.4);
    mesh.position.copy(p);
    g.add(mesh);
    const person = ball(0.16, wash(C("muted"), 0.3));
    person.position.set(p.x, p.y + 0.62, p.z);
    g.add(person);
    labels.push({ at: V(p.x, p.y - 0.42, p.z), text: name, tone: "item" });
  }

  // App 1 (agent A1 + RAG) and App 2 (agents A2–A4)
  const APP_Z = -0.5;
  for (const [x, w, name] of [[-0.8, 2.8, "App 1"], [4, 3.2, "App 2"]] as const) {
    const { mesh } = glassBox(w, 0.95, 1.5, wash(blue, 0.8), 0.8, C("blue"), 0.45);
    mesh.position.set(x, PREM_TOP + 0.475, APP_Z);
    g.add(mesh);
    labels.push({ at: V(x + 0.3, PREM_TOP + 0.62, APP_Z + 0.76), text: name, tone: "item" });
  }
  labels.push({ at: V(6.7, PREM_TOP + 0.8, APP_Z), text: "eval design", sub: "& hill-climbing", tone: "note" });
  labels.push({ at: V(-2.6, 1.4, APP_Z), text: "3", tone: "num" });
  const a1 = ball(0.22, C("sage-deep"));
  a1.position.set(-1.7, PREM_TOP + 1.2, APP_Z - 0.2);
  g.add(a1);
  labels.push({ at: V(-1.7, PREM_TOP + 1.55, APP_Z - 0.2), text: "A1", tone: "sage" });
  [3.1, 4, 4.9].forEach((x, i) => {
    const a = ball(0.2, C("sage-deep"));
    a.position.set(x, PREM_TOP + 1.18, APP_Z - 0.2);
    g.add(a);
    labels.push({ at: V(x, PREM_TOP + 1.5, APP_Z - 0.2), text: `A${i + 2}`, tone: "sage" });
  });

  // building blocks: databases, local LLMs, others
  const ROW_Z = 3.2;
  labels.push({ at: V(-7.6, 1.0, ROW_Z), text: "4", tone: "num" });
  for (const [x, name] of [[-6.6, "SQL"], [-5.1, "Vector"], [-3.6, "others"]] as const) {
    const db = database(wash(PEACH, 0.3), PEACH);
    db.scale.setScalar(0.95);
    db.position.set(x, PREM_TOP + 0.12, ROW_Z);
    g.add(db);
    labels.push({ at: V(x, PREM_TOP, ROW_Z + 0.6), text: name, tone: "item", below: true });
  }
  for (const [x, name, sub] of [[-1.9, "Qwen", "chat"], [-0.3, "BGE", "embeddings"], [1.3, "others", ""]] as const) {
    block(g, labels, x, PREM_TOP, ROW_Z, [0.85, 0.85, 0.85], wash(sage, 0.5), name, sub || undefined, true);
  }
  block(g, labels, 4, PREM_TOP, ROW_Z, [1.5, 0.55, 0.9], wash(LILAC, 0.55), "Messaging", undefined, true);
  block(g, labels, 5.8, PREM_TOP, ROW_Z, [1.5, 0.55, 0.9], wash(LILAC, 0.55), "Logging", undefined, true);

  // 5. the web: a wide, flat slab below and in front of everything
  const web = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.08, 96),
    new THREE.MeshStandardMaterial({ color: wash(PINK, 0.4), transparent: true, opacity: 0.8, roughness: 0.3 }),
  );
  web.scale.set(3.4, 1, 0.7);
  web.position.set(0.5, -0.8, 5.9);
  g.add(web);
  labels.push({ at: V(0.5, -0.65, 6.1), text: "Web", tone: "item" });
  labels.push({ at: V(-4.9, -0.65, 5.9), text: "5", tone: "num" });

  // flows: blue where code decides, red where a model does
  const app1Top = V(-0.4, PREM_TOP + 0.98, APP_Z - 0.3);
  const app1Front = (x: number) => V(x, PREM_TOP + 0.5, APP_Z + 0.78);
  const a1At = a1.position.clone();
  const updates: Update[] = [
    flow(g, browser.clone().setY(1.72), app1Top, det, 0),
    flow(g, cli.clone().setY(1.72), V(4, PREM_TOP + 0.98, APP_Z - 0.3), det, 0),
    flow(g, browser.clone().add(V(-0.4, 0.2, 0)), V(-2.9, CLOUD_TOP + 0.55, -6.9), RED, 0.6),
    flow(g, cli.clone().add(V(-0.4, 0.2, 0)), V(2, CLOUD_TOP + 0.6, -3.7), RED, 0.5),
    flow(g, a1At, V(-2.4, CLOUD_TOP + 0.6, -3.7), RED, 1.2, 4, 0.18),
    flow(g, a1At, V(-6.6, PREM_TOP + 0.75, ROW_Z - 0.4), RED, 1.1),
    flow(g, app1Front(-1.4), V(-1.9, PREM_TOP + 0.5, ROW_Z - 0.45), RED, 0.4),
    flow(g, app1Front(-0.4), V(-5.1, PREM_TOP + 0.75, ROW_Z - 0.4), det, 0.6),
    flow(g, app1Front(0.2), V(-0.3, PREM_TOP + 0.5, ROW_Z - 0.45), det, 0.3),
    // an agent searching the web: probabilistic, and its result is unvalidated
    flow(g, V(3.1, PREM_TOP + 1.18, APP_Z - 0.2), V(2.6, -0.74, 5.3), RED, 0, 4, 0.18),
  ];
  labels.push({ at: V(-3.6, 1.65, 1.2), text: "Agent · CRUD", tone: "red" });
  labels.push({ at: V(0.55, 0.95, 1.5), text: "RAG", tone: "blue" });
  labels.push({ at: V(-3.2, 3.3, -2.4), text: "cloud model API", tone: "red" });
  labels.push({ at: V(2.85, 0.35, 2.6), text: "web search · unvalidated", tone: "red" });

  const update: Update = (t) => updates.forEach((u) => u(t));
  return { update, labels };
}
