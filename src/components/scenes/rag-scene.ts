// The RAG deck's title scene (elegant-topics.js SCENES.rag): documents are retrieved into a store, and go with the
// question to the model.
import * as THREE from "three";
import { C, V, ball, box, database, link, place, stream, tint, wireMat, type Build } from "./kit";

export const ragScene: Build = (g) => {
  const blue = C("blue");
  const deep = C("sage-deep");
  [0, 1, 2].forEach((i) =>
    place(g, box(0.95, 1.25, 0.04, i === 2 ? C("sky") : C("sage-pill"), deep).mesh, -2.7 + i * 0.14, 0.05 + i * 0.1, i * 0.1),
  );
  place(g, database(tint(), blue), -0.4, -0.45).scale.setScalar(1.25);
  place(g, ball(0.55, C("ink")), 2.3, 0.1);
  const shell = place(
    g,
    new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.95, 1)), wireMat(blue, 0.45)),
    2.3,
    0.1,
  );
  const a = stream(g, link(g, V(-2, 0.1), V(-1, 0.1), deep), 2, deep); // documents → store
  const b = stream(g, link(g, V(0.2, 0.1), V(1.3, 0.1), blue), 2, blue); // retrieved context → model
  const c = stream(g, link(g, V(2.3, 1.7), V(2.3, 1.1), C("ochre"), 0, 0.5), 1, C("ochre"), 0.3); // the question
  return (t) => {
    a(t);
    b(t);
    c(t);
    shell.rotation.y = t * 0.25;
  };
};
