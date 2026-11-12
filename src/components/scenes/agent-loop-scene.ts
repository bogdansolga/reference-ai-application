// The Agents deck's title scene (elegant-topics.js SCENES.loop): analyse, plan, execute around a terminal.
import * as THREE from "three";
import { C, V, box, dashedLine, disc, dot, place, tint, type Build } from "./kit";

export const agentLoopScene: Build = (g) => {
  const blue = C("blue");
  const deep = C("sage-deep");
  const R = 1.9;
  const ring = new THREE.EllipseCurve(0, 0, R, R).getPoints(90).map((p) => V(p.x, p.y));
  const curve = new THREE.CatmullRomCurve3(ring.slice(0, -1), true);
  g.add(dashedLine(curve, blue, 0.5));
  // analyse, plan, execute
  [90, 210, 330].forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    place(g, disc(0.42, i ? C("sky") : tint(), blue), R * Math.cos(a), R * Math.sin(a), 0.1).rotation.x = Math.PI / 2;
  });
  // the terminal
  place(g, box(1.7, 1.1, 0.1, C("ink"), blue, 0.9).mesh, 0, 0);
  [0.25, 0, -0.25].forEach((y, i) =>
    place(g, box(1.2 - i * 0.3, 0.07, 0.02, C("sky"), blue, 0.95).mesh, -0.1 - i * 0.15, y, 0.07),
  );
  const d = dot(deep, 0.11);
  g.add(d);
  return (t) => {
    d.position.copy(curve.getPoint((t * 0.09) % 1));
    d.material.opacity = t > 0.6 ? 1 : 0;
  };
};
