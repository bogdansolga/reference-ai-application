/**
 * The decks' 3D scene kit, ported from the training repo
 * (decks/html/kit/elegant-3d.js, elegant-dividers.js, elegant-topics.js; three.js 0.160).
 * Re-port by hand when the kit's look changes. Browser-only: import it dynamically.
 */
import * as THREE from "three";

export type Update = (t: number) => void;
export type Build = (g: THREE.Group) => Update;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
export const C = (name: string) => new THREE.Color(css(name) || "#0e4c92");
export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

// --- elegant-dividers.js primitives ---
export const glassMat = (c: THREE.Color, opacity = 0.82) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.05, transparent: true, opacity });
export const wireMat = (c: THREE.Color, opacity: number) =>
  new THREE.LineBasicMaterial({ color: c, transparent: true, opacity });

/** A glass block with its edges drawn. */
export function glassBox(
  w: number, h: number, d: number, c: THREE.Color, opacity: number, edge: THREE.Color, edgeOpacity: number,
) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, glassMat(c, opacity));
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat(edge, edgeOpacity)));
  return { mesh };
}
export function dashedLine(curve: THREE.Curve<THREE.Vector3>, c: THREE.Color, opacity: number) {
  const l = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(50)),
    new THREE.LineDashedMaterial({ color: c, dashSize: 0.14, gapSize: 0.09, transparent: true, opacity }),
  );
  l.computeLineDistances();
  return l;
}
export const dot = (c: THREE.Color, r = 0.055) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0 }));
export const arc = (a: THREE.Vector3, b: THREE.Vector3, lift: number) =>
  new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, lift, 0.15)), b);
/** A database: three stacked glass discs with rims. */
export function database(c: THREE.Color, rim: THREE.Color) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 48), glassMat(c, 0.85));
    d.position.y = i * 0.25;
    d.add(new THREE.LineSegments(new THREE.EdgesGeometry(d.geometry, 30), wireMat(rim, 0.55)));
    g.add(d);
  }
  return g;
}

// --- elegant-topics.js helpers ---
export const ball = (r: number, c: THREE.Color) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, 32, 32), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.1 }));
export const place = <T extends THREE.Object3D>(g: THREE.Group, obj: T, x: number, y: number, z = 0): T => {
  obj.position.set(x, y, z);
  g.add(obj);
  return obj;
};
export const box = (w: number, h: number, d: number, c: THREE.Color, edge: THREE.Color, opacity = 0.8) =>
  glassBox(w, h, d, c, opacity, edge, 0.55);
export const tint = () => C("sky").clone().lerp(C("blue"), 0.5);
export function disc(r: number, c: THREE.Color, edge: THREE.Color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 48), glassMat(c, 0.85));
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), wireMat(edge, 0.55)));
  return m;
}
/** Dots travelling a curve, evenly spaced; returns the per-frame update. */
export function stream(
  g: THREE.Group, curve: THREE.Curve<THREE.Vector3>, n: number, c: THREE.Color, speed = 0.22, r = 0.06,
): Update {
  const dots = Array.from({ length: n }, () => {
    const d = dot(c, r);
    g.add(d);
    return d;
  });
  return (t) =>
    dots.forEach((d, i) => {
      const f = (t * speed + i / n) % 1;
      d.position.copy(curve.getPoint(f));
      d.material.opacity = t > 0.8 ? Math.min(1, Math.min(f, 1 - f) * 8) * 0.9 : 0;
    });
}
export function link(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, lift = 0, opacity = 0.5) {
  const curve: THREE.Curve<THREE.Vector3> = lift ? arc(a, b, lift) : new THREE.LineCurve3(a, b);
  g.add(dashedLine(curve, c, opacity));
  return curve;
}

// --- elegant-3d.js: the waving sky→sage→blue surface under every scene ---
function waveSurface(scene: THREE.Scene) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { t: { value: 0 }, sky: { value: C("sky") }, sage: { value: C("sage") }, blue: { value: C("blue") } },
    vertexShader: `uniform float t; varying float h; varying vec2 vUv;
      void main(){ vec3 p=position;
        p.y=sin(p.x*0.55+t*0.35)*0.32+cos(p.z*0.8-t*0.25)*0.24+sin((p.x+p.z)*0.3+t*0.2)*0.32;
        h=p.y; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform vec3 sky, sage, blue; varying float h; varying vec2 vUv;
      void main(){ float k=smoothstep(-0.7,0.8,h);
        vec3 c=mix(sky,sage,smoothstep(0.0,0.55,k)); c=mix(c,blue,smoothstep(0.5,1.0,k));
        float edge=smoothstep(0.0,0.22,vUv.x)*smoothstep(1.0,0.78,vUv.x)*smoothstep(0.0,0.35,vUv.y)*smoothstep(1.0,0.65,vUv.y);
        float lines=smoothstep(0.96,1.0,abs(sin(vUv.y*90.0)));
        gl_FragColor=vec4(c,edge*(0.4+lines*0.22)); }`,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(30, 12, 180, 90).rotateX(-Math.PI / 2), mat);
  surface.position.set(0, -2.9, -2);
  scene.add(surface);
  return mat;
}

/**
 * base() + dividerStage() + the topicScenes wrapper: camera drift, the group's entrance and gentle rocking,
 * self-lit glass. The group sits in the right part of the canvas, whatever its aspect.
 */
export function runScene(canvas: HTMLCanvasElement, build: Build, { flat = false, scale = 0.95 } = {}) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  const CAM = new THREE.Vector3(0, 0.6, 12);
  const TARGET = new THREE.Vector3(0, 0.2, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 5);
  scene.add(key);

  const mat = waveSurface(scene);
  const group = new THREE.Group();
  scene.add(group);
  const update = build(group);
  // the deck colours stay clear on white: the glass lights itself, not only from the scene lights
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && "emissive" in m) {
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.22;
    }
  });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(17.5)) * CAM.z * camera.aspect;
    group.position.set(Math.min(halfWidth * 0.55, 6), 0.1, 0);
  }

  let t0 = 0;
  return {
    resize,
    start() {
      resize();
      t0 = performance.now();
      renderer.setAnimationLoop((now) => {
        const t = still ? 2.5 : Math.max(0, (now - t0) / 1000); // a frame's timestamp can precede start()
        camera.position.copy(CAM);
        if (!still) {
          camera.position.x += Math.sin(t * 0.12) * 0.5;
          camera.position.y += Math.sin(t * 0.09) * 0.18;
        }
        camera.lookAt(TARGET);
        mat.uniforms.t.value = t;
        group.scale.setScalar(scale * (0.86 + 0.14 * ease(t / 0.9)));
        if (!flat) group.rotation.y = -0.35 + Math.sin(t * 0.17) * 0.14;
        update(t);
        renderer.render(scene, camera);
        if (still) renderer.setAnimationLoop(null); // reduced motion: one still frame
      });
    },
    stop() {
      renderer.setAnimationLoop(null);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      renderer.dispose();
    },
  };
}
