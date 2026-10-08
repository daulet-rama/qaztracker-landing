// QazTracker Vision — 3D farm scene: shared kit.
// Materials, a geometry batcher that merges static parts into a few draw calls,
// canvas-drawn textures (pins, labels, soft shadows) and small math helpers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ACCENT = '#1E7B4C';
export const ACCENT_LIGHT = '#2E9A63';
export const ALARM = '#E5484D';
export const FONT_STACK = '"Onest", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// ---------------------------------------------------------------- math helpers
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
export const EASE = {
  inout: (t) => smooth(t),
  in: (t) => { t = clamp(t, 0, 1); return t * t * 0.6 + t * 0.4; },
  out: (t) => { t = clamp(t, 0, 1); return (1 - (1 - t) * (1 - t)) * 0.6 + t * 0.4; },
  linear: (t) => clamp(t, 0, 1),
};

// Deterministic pseudo random (mulberry32) so the farm is identical on every load.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise, good enough for ground tint patches.
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Rounded polyline on the ground plane (y = 0): straight runs joined by quadratic corners.
// points: [[x, z], ...]
export function roundedPath(points, radius = 4) {
  const path = new THREE.CurvePath();
  const P = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  if (P.length === 2) { path.add(new THREE.LineCurve3(P[0], P[1])); return path; }
  let cur = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const inLen = a.distanceTo(b), outLen = b.distanceTo(c);
    const r = Math.min(radius, inLen * 0.5, outLen * 0.5);
    const p1 = b.clone().add(a.clone().sub(b).normalize().multiplyScalar(r));
    const p2 = b.clone().add(c.clone().sub(b).normalize().multiplyScalar(r));
    if (cur.distanceTo(p1) > 1e-3) path.add(new THREE.LineCurve3(cur.clone(), p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  const last = P[P.length - 1];
  if (cur.distanceTo(last) > 1e-3) path.add(new THREE.LineCurve3(cur, last.clone()));
  return path;
}

// ---------------------------------------------------------------- materials
const RIB_CHUNK = `
#include <color_fragment>
{
  float ribCoord = abs(vRibN.x) >= abs(vRibN.z) ? vRibPos.z : vRibPos.x;
  float rr = abs(fract(ribCoord * 1.35) - 0.5);
  float groove = smoothstep(0.34, 0.47, rr);
  float lip = smoothstep(0.20, 0.30, rr) * (1.0 - smoothstep(0.30, 0.36, rr));
  diffuseColor.rgb *= (1.0 - 0.13 * groove) * (1.0 + 0.06 * lip);
}`;

export function createMaterials() {
  const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0 });
  const ribbed = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
  ribbed.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRibPos;\nvarying vec3 vRibN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRibPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRibN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRibPos;\nvarying vec3 vRibN;')
      .replace('#include <color_fragment>', RIB_CHUNK);
  };
  ribbed.customProgramCacheKey = () => 'qt-ribbed';
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.25, envMapIntensity: 1.2 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.6, envMapIntensity: 1.0 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const fence = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  });
  const canopy = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
  });
  const cloud = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: '#EAF7F0', emissiveIntensity: 0.32 });
  return { matte, ribbed, glass, metal, glow, fence, canopy, cloud };
}

const NO_CAST = new Set(['fence', 'canopy', 'glow', 'cloud']);

// ---------------------------------------------------------------- geometry batching
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _c = new THREE.Color();

function localMatrix(o) {
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

function prepGeometry(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  return g;
}

function paint(g, color) {
  _c.set(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// Kit: add primitives with a transform stack, then build() → one mesh per material.
// Coordinates: y in options is the BOTTOM of the primitive unless { center: true }.
// tag(name) … tag(null): primitives added in between are also copied (position + normal only) into a per-name
// geometry, so the scene can draw a hover glow over exactly that object. The built meshes do not change.
export class Kit {
  constructor() { this.buckets = new Map(); this.stack = [new THREE.Matrix4()]; this.tagName = null; this.tags = new Map(); }
  get top() { return this.stack[this.stack.length - 1]; }
  push(o = {}) { this.stack.push(this.top.clone().multiply(localMatrix(o))); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  tag(name) { this.tagName = name || null; return this; }
  add(geo, color, o = {}) {
    const g = paint(prepGeometry(geo), color);
    g.applyMatrix4(this.top.clone().multiply(localMatrix(o)));
    const key = o.mat || 'matte';
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
    if (this.tagName) {
      const c = new THREE.BufferGeometry();
      c.setAttribute('position', g.attributes.position.clone());
      c.setAttribute('normal', g.attributes.normal.clone());
      if (!this.tags.has(this.tagName)) this.tags.set(this.tagName, []);
      this.tags.get(this.tagName).push(c);
    }
    return this;
  }
  // merged copies of everything added under each tag: { name: BufferGeometry }
  tagGeometries() {
    const out = {};
    for (const [name, list] of this.tags) {
      if (!list.length) continue;
      out[name] = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
    }
    this.tags.clear();
    return out;
  }
  rbox(w, h, d, color, o = {}) {
    const r = o.r ?? Math.min(w, h, d) * 0.18;
    const g = new RoundedBoxGeometry(w, h, d, o.seg ?? 1, Math.max(0.001, r));
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, color, o);
  }
  box(w, h, d, color, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, color, o);
  }
  cyl(rt, rb, h, color, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16, 1, o.open ?? false, o.thetaStart ?? 0, o.theta ?? Math.PI * 2);
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, color, o);
  }
  sphere(r, color, o = {}) {
    const g = new THREE.SphereGeometry(r, o.ws ?? 16, o.hs ?? 10, 0, Math.PI * 2, 0, o.phi ?? Math.PI);
    return this.add(g, color, o);
  }
  cone(r, h, color, o = {}) {
    const g = new THREE.ConeGeometry(r, h, o.seg ?? 12, 1, o.open ?? false);
    if (!o.center) g.translate(0, h / 2, 0);
    return this.add(g, color, o);
  }
  capsule(r, len, color, o = {}) {
    const g = new THREE.CapsuleGeometry(r, len, o.cs ?? 4, o.rs ?? 10);
    if (!o.center) g.translate(0, len / 2 + r, 0);
    return this.add(g, color, o);
  }
  torus(r, tube, color, o = {}) {
    const g = new THREE.TorusGeometry(r, tube, o.ts ?? 6, o.rs ?? 24, o.arc ?? Math.PI * 2);
    return this.add(g, color, o);
  }
  // Cylinder between two points (pipes, wires, braces). p0/p1: [x, y, z] in the current frame.
  beam(p0, p1, r, color, o = {}) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const d = b.clone().sub(a); const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, o.seg ?? 6, 1, false);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a.x, a.y, a.z);
    return this.add(g, color, { mat: o.mat });
  }
  // Flat quad lying on the ground (y is height), size along x/z.
  flat(w, d, color, o = {}) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, o);
  }
  // Extruded 2D shape. pts: [[x, y], ...] in the XY plane, extruded along +z by depth (centered).
  prism(pts, depth, color, o = {}) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, o);
  }
  isEmpty() { return this.buckets.size === 0; }
  geometry(key = 'matte') {
    const list = this.buckets.get(key);
    if (!list || !list.length) return null;
    const geo = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    this.buckets.delete(key);
    return geo;
  }
  build(mats, { cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    for (const key of [...this.buckets.keys()]) {
      const geo = this.geometry(key);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[key] || mats.matte);
      mesh.castShadow = cast && !NO_CAST.has(key);
      mesh.receiveShadow = receive && key !== 'glow';
      mesh.name = key;
      if (key === 'fence' || key === 'canopy') mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }
}

// ---------------------------------------------------------------- canvas textures
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Soft rounded-rectangle shadow (alpha only) — used as fake ambient occlusion under buildings.
export function softShadowTexture() {
  const S = 128, { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetX = 1000;
  roundRectPath(ctx, 28 - 1000, 28, S - 56, S - 56, 18);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Radial soft dot: snow flakes, packets, floor glow.
export function dotTexture(size = 64, inner = 0.0) {
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Rounded rectangle glow with soft edge (selection floor highlight).
export function glowRectTexture() {
  const S = 128, { c, ctx } = canvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 1000;
  roundRectPath(ctx, 24 - 1000, 24, S - 48, S - 48, 22);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Night: soft round pool of light on the ground (white, alpha in the colour; used with additive blending).
export function poolTexture(size = 128) {
  const { c, ctx } = canvas(size, size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.78)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Night: headlight beam on the road — bright near the lamps (u = 0), widening and fading forward (u = 1).
export function beamTexture() {
  const W = 128, H = 64, { c, ctx } = canvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), v = (y / (H - 1)) * 2 - 1;
      const half = 0.22 + 0.78 * u;                        // the beam widens with distance
      const side = clamp(1 - Math.abs(v) / half, 0, 1);
      const a = Math.pow(side, 0.8) * Math.pow(1 - u, 1.35) * smooth(u * 9);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * clamp(a, 0, 1));
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// Hover glow: drawn over an object's own geometry (additive, rim-weighted), so the object's materials never change.
export function glowOverlayMaterial(color = '#5CF0A8') {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = uAlpha * (0.07 + 0.93 * pow(f, 2.8)); gl_FragColor = vec4(uColor, a); }`,
  });
}

// ---- icons for map pins (drawn in a 48×48 box centred at 0,0, white strokes)
const ICONS = {
  gate(ctx) { // barrier
    ctx.fillRect(-15, -3, 5, 17);
    ctx.beginPath(); roundRectPath(ctx, -12, -6, 28, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
  },
  checkpoint(ctx) { // face in a frame
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    const L = 6;
    [[-12, -12, 1, 1], [12, -12, -1, 1], [-12, 12, 1, -1], [12, 12, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(0, -2, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 9, 7, Math.PI, 0); ctx.fill();
  },
  barn(ctx) {
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(0, -13); ctx.lineTo(14, -2); ctx.lineTo(14, 13); ctx.lineTo(-14, 13); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-5, 2, 10, 11); ctx.restore();
  },
  feed(ctx) { // arched hangar
    ctx.beginPath(); ctx.moveTo(-14, 12); ctx.lineTo(-14, 0); ctx.arc(0, 0, 14, Math.PI, 0); ctx.lineTo(14, 12); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-6, 1, 12, 11); ctx.restore();
  },
  office(ctx) {
    ctx.fillRect(-12, -10, 24, 23);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(-8, -6, 6, 5); ctx.fillRect(2, -6, 6, 5); ctx.fillRect(-3, 3, 6, 10); ctx.restore();
  },
  camera(ctx) {
    ctx.beginPath(); roundRectPath(ctx, -14, -8, 20, 12, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(14, -9); ctx.lineTo(14, 5); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(-6, 4, 4, 9); ctx.fillRect(-11, 11, 14, 3);
  },
  processor(ctx) {
    ctx.beginPath(); roundRectPath(ctx, -9, -9, 18, 18, 3); ctx.fill();
    ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const o = i * 5.5;
      ctx.beginPath(); ctx.moveTo(o, -10); ctx.lineTo(o, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o, 10); ctx.lineTo(o, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, o); ctx.lineTo(-14, o); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, o); ctx.lineTo(14, o); ctx.stroke();
    }
  },
  alert(ctx) {
    ctx.fillRect(-2.6, -12, 5.2, 15);
    ctx.beginPath(); ctx.arc(0, 9, 3, 0, Math.PI * 2); ctx.fill();
  },
};

// Teardrop map pin with an icon. Returns texture with anchor at the bottom tip.
export function pinTexture(color, icon) {
  const W = 128, H = 160, { c, ctx } = canvas(W, H);
  const cx = W / 2, cy = 60, r = 46;
  // soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,30,0.28)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, H - 6);
  ctx.bezierCurveTo(cx - 12, H - 34, cx - r, cy + 30, cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(cx + r, cy + 30, cx + 12, H - 34, cx, H - 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // inner disc
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r - 7, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1.25, 1.25);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  (ICONS[icon] || ICONS.processor)(ctx);
  ctx.restore();
  const t = toTexture(c);
  return { texture: t, aspect: W / H };
}

// Floating label: pill with an optional status dot, title and subtitle.
// tone: 'accent' | 'alarm' | 'neutral' | 'ok'
const TONES = {
  accent: { dot: ACCENT, chip: '#E6F3EC', chipText: ACCENT },
  ok: { dot: '#22A06B', chip: '#E3F6EC', chipText: '#16794A' },
  alarm: { dot: ALARM, chip: '#FDECEC', chipText: '#C4292F' },
  neutral: { dot: '#8A94A6', chip: '#EEF1F5', chipText: '#4A5568' },
};

export class LabelCanvas {
  constructor(maxW = 760, h = 132) {
    const { c, ctx } = canvas(maxW, h);
    this.c = c; this.ctx = ctx; this.texture = toTexture(c);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.w = maxW; this.h = h; this.usedW = maxW; this.usedH = h;
  }
  // Draws and returns {w, h} in canvas pixels actually used (texture is cropped through UV repeat).
  draw({ title, subtitle = '', tone = 'accent', chip = '' }) {
    const ctx = this.ctx, S = 2; // drawn at 2x
    const T = TONES[tone] || TONES.accent;
    ctx.clearRect(0, 0, this.w, this.h);
    const titleFont = `600 ${15 * S}px ${FONT_STACK}`;
    const subFont = `500 ${12 * S}px ${FONT_STACK}`;
    const chipFont = `600 ${11.5 * S}px ${FONT_STACK}`;
    ctx.font = titleFont; const tw = ctx.measureText(title).width;
    ctx.font = subFont; const sw = subtitle ? ctx.measureText(subtitle).width : 0;
    ctx.font = chipFont; const cw = chip ? ctx.measureText(chip).width + 16 * S : 0;
    const padX = 12 * S, dot = 9 * S, gap = 8 * S;
    const twoLines = !!subtitle;
    const lineW = Math.max(tw + (chip ? cw + gap : 0), sw);
    const w = Math.min(this.w - 8, Math.ceil(padX * 2 + dot + gap + lineW + 8));
    const h = twoLines ? 54 * S : 32 * S;
    const x = 4, y = 4;
    ctx.save();
    ctx.shadowColor = 'rgba(16,32,24,0.18)'; ctx.shadowBlur = 10 * S; ctx.shadowOffsetY = 3 * S;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRectPath(ctx, x, y, w - 8, h - 8 - 6 * S, 12 * S);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,123,76,0.16)'; ctx.lineWidth = S;
    roundRectPath(ctx, x, y, w - 8, h - 8 - 6 * S, 12 * S); ctx.stroke();
    const boxH = h - 8 - 6 * S;
    // pointer nub
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath(); ctx.moveTo(w / 2 - 7 * S, y + boxH - 1); ctx.lineTo(w / 2, y + boxH + 6 * S); ctx.lineTo(w / 2 + 7 * S, y + boxH - 1); ctx.closePath(); ctx.fill();
    // dot
    const cy1 = twoLines ? y + 17 * S : y + boxH / 2;
    ctx.fillStyle = T.dot;
    ctx.beginPath(); ctx.arc(x + padX + dot / 2, cy1, dot / 2, 0, Math.PI * 2); ctx.fill();
    // title
    ctx.fillStyle = '#132019'; ctx.font = titleFont; ctx.textBaseline = 'middle';
    const tx = x + padX + dot + gap;
    ctx.fillText(title, tx, cy1 + S);
    if (chip) {
      const chx = tx + tw + gap;
      ctx.font = chipFont;
      ctx.fillStyle = T.chip;
      roundRectPath(ctx, chx, cy1 - 10 * S, cw, 20 * S, 10 * S); ctx.fill();
      ctx.fillStyle = T.chipText;
      ctx.fillText(chip, chx + 8 * S, cy1 + S);
    }
    if (twoLines) {
      ctx.font = subFont; ctx.fillStyle = '#5B6777';
      ctx.fillText(subtitle, tx, y + 36.5 * S);
    }
    this.texture.needsUpdate = true;
    this.usedW = w; this.usedH = h;
    // crop via UV transform so the sprite only shows the used area
    this.texture.repeat.set(w / this.w, h / this.h);
    this.texture.offset.set(0, 1 - h / this.h);
    return { w: w / S, h: h / S };
  }
}
