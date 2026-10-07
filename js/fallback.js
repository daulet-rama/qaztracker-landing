/*
 * Запасная сцена без WebGL: изометрическая SVG-иллюстрация фермы.
 * Она же показывается сразу при загрузке, пока грузится 3D (постер), и умеет то же, что 3D-сцена:
 * objects, setSite, select, openDoor, zoomBy, rotateBy, resetView, setPaused, dispose.
 * Если simulate = true, сама ведёт демо-сценарий (~90 с по кругу) и шлёт события через onEvent.
 */

const NS = "http://www.w3.org/2000/svg";
const C30 = Math.cos(Math.PI / 6);
const S30 = 0.5;
const K = 6; // пикселей SVG на метр
const CX = 55; // центр фермы для поворота вида
const CZ = 45;
const VIEW = norm([1, 1, 1]);
const LIGHT = norm([0.35, 1, 0.75]);
const LOOP_MS = 90000;

const PALETTES = {
  north: {
    ground: "#f2f6f9", inside: "#eef3f7", groundLine: "#e1e9ef", road: "#d6dfe6", roadEdge: "#c8d3db", mark: "#ffffff", path: "#e2e9ef",
    wall: "#eef1f1", wallWarm: "#ece5d8", roof: "#f8fbfd", roofTrim: "#2f7d4a", hangar: "#f3f7fa", silo: "#dfe5e8", siloTop: "#f8fbfd",
    tree: "#2e5c49", treeLight: "#3d7059", treeSnow: "#f4f8fa", trunk: "#6f5543", fence: "#8d9ca6", shadow: "rgba(46, 80, 110, 0.17)",
    hay: "#e9dcb4", pen: "#e7edf2", drift: "#ffffff", glass: "#5f7d92", sky: "#e8eff4",
  },
  south: {
    ground: "#efe4cb", inside: "#eadcbe", groundLine: "#e2d3b2", road: "#dccdab", roadEdge: "#cfbe9a", mark: "#f6efdd", path: "#e4d6b6",
    wall: "#f5efe3", wallWarm: "#efe3cf", roof: "#3f8659", roofTrim: "#2b6643", hangar: "#c7cdcf", silo: "#d6d9d5", siloTop: "#c3c8c4",
    tree: "#6f8f45", treeLight: "#87a656", treeSnow: null, trunk: "#7a5c40", fence: "#9b8d74", shadow: "rgba(120, 86, 40, 0.2)",
    hay: "#e3c57d", pen: "#e2d3b3", drift: "#e6d6b3", glass: "#5d7a88", sky: "#f1e9da",
  },
};

const OBJECTS = [
  { id: "gate", kind: "gate", name: "Въезд для машин" },
  { id: "checkpoint", kind: "checkpoint", name: "Проходная" },
  { id: "barn", kind: "barn", name: "Коровник и молочный блок" },
  { id: "feed", kind: "feed", name: "Склад кормов" },
  { id: "office", kind: "office", name: "Контора" },
  { id: "perimeter", kind: "perimeter", name: "Периметр" },
  { id: "perimeter-cam", kind: "perimeter", name: "Камера на заборе" },
  { id: "processor", kind: "processor", name: "Процессор объекта" },
  { id: "milk-truck", kind: "vehicle", name: "Молоковоз" },
  { id: "feed-truck", kind: "vehicle", name: "Кормовоз КамАЗ" },
  { id: "tractor", kind: "vehicle", name: "Трактор Беларус" },
  { id: "unknown-car", kind: "vehicle", name: "Легковой автомобиль" },
  { id: "worker-1", kind: "person", name: "Ерлан Касымов" },
  { id: "worker-2", kind: "person", name: "Айгуль Нурланова" },
];
/* номера по ферме: 15 — Северо-Казахстанская область, 13 — Туркестанская */
const PLATES = {
  north: { "milk-truck": "512 AMK 15", "unknown-car": "401 NAN 15" },
  south: { "milk-truck": "638 ADS 13", "unknown-car": "905 KMR 13" },
};

/* ---------- математика ---------- */
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function rot(p, r) {
  const x = p[0] - CX, z = p[2] - CZ;
  switch (r & 3) {
    case 1: return [CX + z, p[1], CZ - x];
    case 2: return [CX - x, p[1], CZ - z];
    case 3: return [CX - z, p[1], CZ + x];
    default: return [p[0], p[1], p[2]];
  }
}
function proj(p) { return [(p[0] - p[2]) * C30 * K, (p[0] + p[2]) * S30 * K - p[1] * K]; }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function f1(n) { return Math.round(n * 10) / 10; }
function ptsStr(pts) { return pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" "); }
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

/* ---------- геометрия: грани с внешней нормалью ---------- */
function face(pts, color, n, extra) { return Object.assign({ pts, color, n: norm(n) }, extra || {}); }
function upNormal(pts) {
  let n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}
function box(x, z, w, d, h, y0, color, top) {
  const y1 = y0 + h;
  return [
    face([[x, y1, z], [x + w, y1, z], [x + w, y1, z + d], [x, y1, z + d]], top || color, [0, 1, 0]),
    face([[x + w, y0, z], [x + w, y0, z + d], [x + w, y1, z + d], [x + w, y1, z]], color, [1, 0, 0]),
    face([[x, y0, z + d], [x + w, y0, z + d], [x + w, y1, z + d], [x, y1, z + d]], color, [0, 0, 1]),
    face([[x, y0, z], [x + w, y0, z], [x + w, y1, z], [x, y1, z]], color, [0, 0, -1]),
    face([[x, y0, z], [x, y0, z + d], [x, y1, z + d], [x, y1, z]], color, [-1, 0, 0]),
  ];
}
/* дом с двускатной крышей, конёк вдоль X */
function gable(x, z, w, d, h, r, wall, roof) {
  const zc = z + d / 2, y1 = h + r;
  const f = box(x, z, w, d, h, 0, wall).slice(1);
  const o = 0.6; // свес
  const back = [[x - o, h - 0.3, z - o], [x + w + o, h - 0.3, z - o], [x + w + o, y1, zc], [x - o, y1, zc]];
  const front = [[x - o, h - 0.3, z + d + o], [x + w + o, h - 0.3, z + d + o], [x + w + o, y1, zc], [x - o, y1, zc]];
  f.push(face(back, roof, upNormal(back), { roof: true }));
  f.push(face(front, roof, upNormal(front), { roof: true }));
  f.push(face([[x + w, h, z], [x + w, h, z + d], [x + w, y1 - 0.05, zc]], wall, [1, 0, 0]));
  f.push(face([[x, h, z], [x, h, z + d], [x, y1 - 0.05, zc]], wall, [-1, 0, 0]));
  return f;
}
/* ангар с полукруглой крышей вдоль X */
function arch(x, z, w, d, hw, wall, roof) {
  const n = 9, rr = d / 2, zc = z + rr;
  const f = box(x, z, w, d, hw, 0, wall).slice(1);
  const prof = [];
  for (let i = 0; i <= n; i++) { const a = Math.PI * (i / n); prof.push([zc - Math.cos(a) * rr, hw + Math.sin(a) * rr * 0.8]); }
  for (let i = 0; i < n; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
    const q = [[x, y0, z0], [x + w, y0, z0], [x + w, y1, z1], [x, y1, z1]];
    f.push(face(q, roof, upNormal(q), { roof: true }));
  }
  f.push(face(prof.map(([pz, py]) => [x + w, py, pz]), wall, [1, 0, 0]));
  f.push(face(prof.map(([pz, py]) => [x, py, pz]), wall, [-1, 0, 0]));
  return f;
}
function cyl(cx, cz, r, h, y0, color, top, n = 14) {
  const f = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2, m = (a + b) / 2;
    f.push(face([[cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r], [cx + Math.cos(b) * r, y0 + h, cz + Math.sin(b) * r], [cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r]], color, [Math.cos(m), 0, Math.sin(m)]));
  }
  const ring = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r]); }
  f.push(face(ring, top || color, [0, 1, 0]));
  return f;
}
function cone(cx, cz, r, h, y0, color, n = 14) {
  const f = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    const q = [[cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r], [cx, y0 + h, cz]];
    f.push(face(q, color, upNormal(q)));
  }
  return f;
}
/* горизонтальный цилиндр вдоль Z (цистерна молоковоза едет по Z) */
function hcylZ(cx, cy, z, r, len, color, n = 12) {
  const f = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2, m = (a + b) / 2;
    const ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r * 0.9, bx = cx + Math.cos(b) * r, by = cy + Math.sin(b) * r * 0.9;
    f.push(face([[ax, ay, z], [bx, by, z], [bx, by, z + len], [ax, ay, z + len]], color, [Math.cos(m), Math.sin(m), 0]));
  }
  const ring = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9]); }
  f.push(face(ring.map(([px, py]) => [px, py, z + len]), color, [0, 0, 1]));
  f.push(face(ring.map(([px, py]) => [px, py, z]), color, [0, 0, -1]));
  return f;
}
/* «наклейка» на стену: окно, дверь, терминал (чуть снаружи стены); s = сторона нормали */
function decalZ(x, y, z, w, h, color, extra, s = 1) { return face([[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]], color, [0, 0, s], Object.assign({ decal: true }, extra)); }
function decalX(x, y, z, d, h, color, extra, s = 1) { return face([[x, y, z], [x, y, z + d], [x, y + h, z + d], [x, y + h, z]], color, [s, 0, 0], Object.assign({ decal: true }, extra)); }
function rotN(n, r) {
  switch (r & 3) {
    case 1: return [n[2], n[1], -n[0]];
    case 2: return [-n[0], n[1], -n[2]];
    case 3: return [-n[2], n[1], n[0]];
    default: return n;
  }
}

/* ---------- модель фермы ---------- */
function buildWorld(P, site) {
  const objs = [];
  const add = (o) => { objs.push(o); return o; };
  const snow = site === "north";

  // Проходная на линии забора
  add({
    id: "checkpoint", center: [40, 0, 78], foot: [[34, 72], [46, 84]], h: 4.2,
    faces: [
      ...box(34, 72, 12, 12, 4.2, 0, P.wall, P.roof),
      ...box(33.6, 71.6, 12.8, 12.8, 0.35, 4.2, P.roofTrim, P.roof),
      decalZ(38.4, 0, 84.03, 3.2, 2.6, "#33443c", { tag: "door-checkpoint" }),
      decalZ(35, 1.4, 84.03, 2.4, 1.6, P.glass),
      decalZ(42.6, 1.4, 84.03, 2.4, 1.6, P.glass),
      decalZ(37.1, 1.2, 84.04, 0.6, 1.0, "#1b2420", { term: true }),
      decalZ(41.9, 1.2, 84.04, 0.6, 1.0, "#1b2420", { term: true }),
      decalX(46.03, 1.4, 74, 3, 1.6, P.glass),
      ...box(38.6, 85, 0.4, 1.2, 1.0, 0, "#9aa7ae"),
      ...box(41, 85, 0.4, 1.2, 1.0, 0, "#9aa7ae"),
    ],
    pin: [40, 7.5, 78],
  });
  // Процессор — шкафчик на стене проходной
  add({
    id: "processor", center: [46.3, 2.2, 80.5], foot: [[46, 79.5], [46.8, 81.5]], h: 3,
    faces: [...box(46.05, 79.6, 0.7, 1.8, 1.4, 1.6, "#cfd8dc", "#e8eef0")],
    led: [46.8, 2.7, 81.2],
    pin: [46.6, 5.8, 80.6],
  });
  // Въезд: будка охраны, столб с ANPR-камерой, шлагбаум
  add({
    id: "gate", center: [22, 0, 81], foot: [[10, 74], [28, 86]], h: 3,
    faces: [
      ...box(10, 74, 4, 4, 2.8, 0, P.wall, P.roof),
      ...box(9.8, 73.8, 4.4, 4.4, 0.25, 2.8, P.roofTrim, P.roof),
      decalZ(10.6, 1.1, 78.03, 2.8, 1.2, P.glass),
      decalX(14.03, 0, 75, 1.4, 2.1, "#33443c"),
      ...box(15.6, 80.4, 1.2, 1.2, 1.2, 0, "#e9ecee"),
      ...box(15.9, 84.6, 0.35, 0.35, 5.2, 0, "#7d8a92"),
      ...box(15.7, 84.2, 0.8, 1.6, 0.6, 5.0, "#2b3833", "#dfe6ea"),
    ],
    barrier: { pivot: [17, 1.15, 81], end: [28, 1.15, 81] },
    beam: { from: [16.1, 5.2, 84.4], to: [[20, 0.4, 89], [27, 0.4, 89]] },
    pin: [16, 9, 84.6],
  });
  // Коровник и молочный блок
  add({
    id: "barn", center: [66, 0, 16], foot: [[40, 8], [92, 24]], h: 9,
    faces: [
      ...gable(40, 8, 52, 16, 4.6, 4.2, P.wallWarm, P.roof),
      decalZ(46, 0, 24.05, 4, 3.4, "#7a6450"),
      decalZ(84, 0, 24.05, 4, 3.4, "#7a6450"),
      ...[54, 60, 66, 72, 78].map((wx) => decalZ(wx, 2.4, 24.05, 3, 1.2, P.glass)),
      decalX(92.05, 0, 13, 6, 3.6, "#7a6450"),
    ],
    pin: [66, 13.5, 16],
  });
  add({ id: "barn", part: true, center: [99, 0, 11], foot: [[96, 8], [102, 14]], h: 16, faces: [...cyl(99, 11, 3, 13, 0, P.silo, P.siloTop), ...cone(99, 11, 3.2, 2.6, 13, P.siloTop)] });
  add({ id: "barn", part: true, center: [99, 0, 19], foot: [[96, 16], [102, 22]], h: 16, faces: [...cyl(99, 19, 3, 11, 0, P.silo, P.siloTop), ...cone(99, 19, 3.2, 2.4, 11, P.siloTop)] });
  add({ id: "barn", part: true, center: [34, 0, 13], foot: [[31, 9], [37, 17]], h: 4, faces: [...box(31, 9, 6, 8, 0.6, 0, "#b8c3c9"), ...hcylZ(34, 2.2, 9.5, 1.7, 7, "#dfe6ea")] });
  // загон и коровы
  add({ id: "barn", part: true, flat: true, center: [62, 0, 28], foot: [[44, 25], [80, 32]], h: 0, faces: [face([[44, 0.02, 25], [80, 0.02, 25], [80, 0.02, 32], [44, 0.02, 32]], P.pen, [0, 1, 0])] });
  const cowSpots = [[48, 27.5], [53, 29.5], [59, 27], [65, 29], [71, 27.8], [76, 30]];
  cowSpots.forEach(([cx, cz], i) => {
    const body = i % 2 ? "#f4f1ec" : "#5b4a3f";
    add({ id: "barn", part: true, center: [cx + 1, 0, cz], foot: [[cx, cz - 0.5], [cx + 2.6, cz + 0.5]], h: 1.6,
      faces: [...box(cx, cz - 0.45, 2.2, 0.9, 0.85, 0.55, body), ...box(cx + 2.1, cz - 0.3, 0.6, 0.6, 0.5, 1.0, i % 2 ? "#3a302a" : "#f4f1ec"), ...box(cx + 0.2, cz - 0.4, 0.2, 0.8, 0.55, 0, "#3a302a"), ...box(cx + 1.8, cz - 0.4, 0.2, 0.8, 0.55, 0, "#3a302a")] });
  });
  // Склад кормов
  add({
    id: "feed", center: [77, 0, 56], foot: [[62, 46], [92, 66]], h: 12,
    faces: [
      ...arch(62, 46, 30, 20, 2.2, P.wall, P.hangar),
      decalZ(72, 0, 66.05, 8, 4.2, "#6c7a80", { tag: "door-feed" }),
      decalZ(80.8, 1.2, 66.06, 0.6, 1.0, "#1b2420", { term: true }),
    ],
    pin: [77, 13.8, 56],
  });
  for (let i = 0; i < 6; i++) {
    const hx = 96 + (i % 3) * 3.2, hz = 50 + Math.floor(i / 3) * 6;
    add({ id: "feed", part: true, center: [hx, 0, hz], foot: [[hx - 1.4, hz - 1.4], [hx + 1.4, hz + 1.4]], h: 1.6, faces: cyl(hx, hz, 1.3, 1.5, 0, P.hay, shade(P.hay, 1.06), 10) });
  }
  // Контора
  add({
    id: "office", center: [10, 0, 52], foot: [[4, 46], [16, 58]], h: 7,
    faces: [
      ...gable(4, 46, 12, 12, 3.6, 2.6, P.wall, P.roof),
      decalX(16.05, 0, 50.5, 2.4, 2.4, "#33443c", { tag: "door-office" }),
      decalX(16.06, 1.2, 53.4, 0.5, 0.8, "#1b2420", { term: true }),
      decalZ(6, 1.4, 58.05, 2.6, 1.4, P.glass),
      decalZ(11, 1.4, 58.05, 2.6, 1.4, P.glass),
    ],
    pin: [10, 9, 52],
  });
  // Машины
  add({
    id: "milk-truck", mover: true, center: [21.5, 0, 15], foot: [[20, 9], [23, 21]], h: 3.4,
    faces: [
      ...box(20, 9, 3, 2.6, 2.7, 0.5, "#f4f6f7", "#ffffff"),
      decalZ(20.3, 1.9, 8.98, 2.4, 1.0, "#3e5664", null, -1),
      ...box(20.2, 11.8, 2.6, 8.6, 0.5, 0.4, "#59646a"),
      ...hcylZ(21.5, 2.2, 11.9, 1.35, 8.3, "#eef2f4"),
      decalX(22.87, 1.75, 12.2, 7.7, 0.35, "#2f8a4c"),
    ],
  });
  add({
    id: "feed-truck", center: [70, 0, 70], foot: [[64, 68.5], [76, 71.5]], h: 3.4,
    faces: [
      ...box(73.4, 68.5, 2.6, 3, 2.8, 0.5, "#e2852f", "#f09a45"),
      decalX(76.03, 1.9, 68.8, 2.4, 0.9, "#3e5664"),
      ...box(64.4, 68.6, 8.8, 2.8, 2.4, 0.6, "#5f7f5a", "#6f9068"),
    ],
  });
  add({
    id: "tractor", center: [55, 0, 50], foot: [[53, 48.5], [58, 51.5]], h: 3,
    faces: [
      ...box(53.2, 48.8, 4.2, 2.4, 1.2, 0.8, "#c8443a", "#d9564b"),
      ...box(53.4, 49, 1.8, 2, 1.6, 2.0, "#c8443a", "#e7ecee"),
      decalX(55.23, 2.3, 49.2, 1.6, 1, "#3e5664"),
      ...box(53.4, 51.2, 1.6, 0.45, 1.6, 0, "#222a26"),
      ...box(56.2, 51.2, 1.1, 0.4, 1.1, 0, "#222a26"),
    ],
  });
  add({
    id: "unknown-car", mover: true, center: [22, 0, 106], foot: [[20.6, 104], [23.4, 108.5]], h: 1.6,
    faces: [
      ...box(20.6, 104, 2.4, 4.6, 0.75, 0.3, "#9ba5ab", "#b3bcc1"),
      ...box(20.9, 105.2, 1.8, 2.3, 0.6, 1.05, "#8d979d", "#c6d0d5"),
      decalZ(21.0, 1.1, 105.18, 1.6, 0.5, "#3e5664", null, -1),
    ],
  });
  return objs;
}

/* спрайты в экранных координатах: деревья, люди, лиса */
function treesFor(site) {
  const r = rng(site === "north" ? 7 : 11);
  const pts = [];
  for (let x = -14; x <= 124; x += 8 + r() * 5) pts.push([x, -10 - r() * 8]);
  for (let z = 4; z <= 92; z += 9 + r() * 6) pts.push([120 + r() * 6, z]);
  for (let z = 4; z <= 70; z += 10 + r() * 6) pts.push([-10 - r() * 6, z]);
  for (let x = 54; x <= 124; x += 9 + r() * 8) pts.push([x, 116 + r() * 6]);
  for (let x = -40; x <= 6; x += 10 + r() * 8) pts.push([x, 116 + r() * 6]);
  return pts.map(([x, z]) => ({ x, z, s: 0.8 + r() * 0.5 }));
}

function treeSvg(P, site, x, z, s, R) {
  const p = rot([x, 0, z], R);
  const [sx, sy] = proj(p);
  const k = K * s;
  if (site === "north") {
    const tiers = [[0, 3.4, 2.6], [2.2, 3.0, 2.1], [4.2, 2.4, 1.5]];
    let out = `<rect x="${f1(sx - 0.25 * k)}" y="${f1(sy - 1.3 * k)}" width="${f1(0.5 * k)}" height="${f1(1.4 * k)}" fill="${P.trunk}"/>`;
    for (const [y0, h, w] of tiers) {
      const by = sy - (1.1 + y0) * k, ty = by - h * k;
      out += `<polygon points="${f1(sx - w * k)},${f1(by)} ${f1(sx)},${f1(ty)} ${f1(sx)},${f1(by)}" fill="${P.treeLight}"/>`;
      out += `<polygon points="${f1(sx)},${f1(by)} ${f1(sx)},${f1(ty)} ${f1(sx + w * k)},${f1(by)}" fill="${P.tree}"/>`;
      if (P.treeSnow) out += `<polygon points="${f1(sx - w * 0.42 * k)},${f1(ty + h * 0.42 * k)} ${f1(sx)},${f1(ty)} ${f1(sx + w * 0.42 * k)},${f1(ty + h * 0.42 * k)} ${f1(sx)},${f1(ty + h * 0.3 * k)}" fill="${P.treeSnow}"/>`;
    }
    return { depth: p[0] + p[2], svg: out, sx, sy };
  }
  const h = 7.5 * k, w = 1.5 * k;
  let out = `<rect x="${f1(sx - 0.25 * k)}" y="${f1(sy - 1.6 * k)}" width="${f1(0.5 * k)}" height="${f1(1.7 * k)}" fill="${P.trunk}"/>`;
  out += `<path d="M${f1(sx)},${f1(sy - 1.2 * k)} C${f1(sx - w * 1.3)},${f1(sy - 2.5 * k)} ${f1(sx - w)},${f1(sy - h)} ${f1(sx)},${f1(sy - h - 0.6 * k)} Z" fill="${P.treeLight}"/>`;
  out += `<path d="M${f1(sx)},${f1(sy - 1.2 * k)} C${f1(sx + w * 1.3)},${f1(sy - 2.5 * k)} ${f1(sx + w)},${f1(sy - h)} ${f1(sx)},${f1(sy - h - 0.6 * k)} Z" fill="${P.tree}"/>`;
  return { depth: p[0] + p[2], svg: out, sx, sy };
}

function personSvg(color, k = K) {
  // человек в зимней куртке: тело, голова, шапка; центр у ног (0,0)
  return `<ellipse cx="0" cy="0" rx="${f1(0.55 * k)}" ry="${f1(0.25 * k)}" fill="rgba(30,50,70,.18)"/>`
    + `<rect x="${f1(-0.42 * k)}" y="${f1(-1.45 * k)}" width="${f1(0.84 * k)}" height="${f1(1.25 * k)}" rx="${f1(0.32 * k)}" fill="${color}"/>`
    + `<rect x="${f1(-0.3 * k)}" y="${f1(-0.35 * k)}" width="${f1(0.6 * k)}" height="${f1(0.38 * k)}" rx="2" fill="#2b3530"/>`
    + `<circle cx="0" cy="${f1(-1.75 * k)}" r="${f1(0.33 * k)}" fill="#e7c3a1"/>`
    + `<path d="M${f1(-0.36 * k)},${f1(-1.8 * k)} a${f1(0.36 * k)},${f1(0.36 * k)} 0 0 1 ${f1(0.72 * k)},0 z" fill="#2f3f4a"/>`;
}

function foxSvg(k = K) {
  return `<ellipse cx="0" cy="0" rx="${f1(0.9 * k)}" ry="${f1(0.25 * k)}" fill="rgba(30,50,70,.16)"/>`
    + `<path d="M${f1(-1 * k)},${f1(-0.5 * k)} q${f1(0.9 * k)},${f1(-0.7 * k)} ${f1(1.7 * k)},${f1(-0.1 * k)} l${f1(0.5 * k)},${f1(-0.5 * k)} l${f1(0.1 * k)},${f1(0.6 * k)} q${f1(-0.2 * k)},${f1(0.4 * k)} ${f1(-0.7 * k)},${f1(0.3 * k)} z" fill="#d9772e"/>`
    + `<path d="M${f1(-1 * k)},${f1(-0.5 * k)} q${f1(-0.9 * k)},${f1(0.1 * k)} ${f1(-1.2 * k)},${f1(-0.5 * k)} q${f1(0.6 * k)},${f1(0.7 * k)} ${f1(1.2 * k)},${f1(0.7 * k)} z" fill="#e8955a"/>`;
}

/* ---------- сценарий демо (~90 с) ---------- */
const WORKER_COLORS = ["#f08a24", "#d9483b", "#f2c230", "#d9483b", "#f08a24"];
function buildScript() {
  return [
    { t: 3000, walk: { id: "w-a", color: WORKER_COLORS[0] } },
    { t: 6000, face: { person: "Ерлан Касымов", point: "Проходная · вход", objectId: "checkpoint", result: "allowed" } },
    { t: 9500, walk: { id: "w-b", color: WORKER_COLORS[1] } },
    { t: 12500, face: { person: "Айгуль Нурланова", point: "Проходная · вход", objectId: "checkpoint", result: "allowed" } },
    { t: 15000, move: { id: "milk-truck", to: "gate-out", ms: 3000 } },
    { t: 18500, plate: { vehicleId: "milk-truck", vehicle: "молоковоз", result: "allowed", direction: "in" } },
    { t: 19200, barrier: true },
    { t: 20200, move: { id: "milk-truck", to: "park", ms: 5000 } },
    { t: 25500, barrier: false },
    { t: 27000, walk: { id: "w-x", color: "#5c6770" } },
    { t: 30000, face: { person: "Неизвестное лицо", point: "Проходная · вход", objectId: "checkpoint", result: "denied" } },
    { t: 30600, alarm: { kind: "unknown_face", where: "Проходная · вход", objectId: "checkpoint" } },
    { t: 30800, unwalk: "w-x" },
    { t: 35000, move: { id: "unknown-car", to: "gate-out", ms: 3000 } },
    { t: 38500, plate: { vehicleId: "unknown-car", vehicle: "легковой автомобиль", result: "not_in_list", direction: "in" } },
    { t: 42500, move: { id: "unknown-car", to: "home", ms: 3500 } },
    { t: 47000, face: { person: "Данияр Абенов", point: "Склад кормов", objectId: "feed", result: "allowed" } },
    { t: 47300, door: { objectId: "feed", state: "open" } },
    { t: 53000, door: { objectId: "feed", state: "closed" } },
    { t: 55000, fox: true },
    { t: 58500, alarm: { kind: "line_crossing", where: "Периметр · восточная сторона", objectId: "perimeter-cam" } },
    { t: 62000, unfox: true },
    { t: 64000, walk: { id: "w-c", color: WORKER_COLORS[2] } },
    { t: 67000, face: { person: "Сауле Темирбекова", point: "Проходная · выход", objectId: "checkpoint", result: "allowed" } },
    { t: 70000, move: { id: "milk-truck", to: "gate-in", ms: 5000 } },
    { t: 75500, plate: { vehicleId: "milk-truck", vehicle: "молоковоз", result: "allowed", direction: "out" } },
    { t: 76000, barrier: true },
    { t: 76800, move: { id: "milk-truck", to: "away", ms: 3500 } },
    { t: 81000, barrier: false },
    { t: 82000, face: { person: "Ерлан Касымов", point: "Проходная · выход", objectId: "checkpoint", result: "allowed" } },
    { t: 86000, face: { person: "Айгуль Нурланова", point: "Контора", objectId: "office", result: "allowed" } },
    { t: 86300, door: { objectId: "office", state: "open" } },
    { t: 89000, door: { objectId: "office", state: "closed" } },
  ];
}
/* позиции машин: смещение (dx, dz) от исходной модели и видимость */
const MOVES = {
  "milk-truck": { park: [0, 0, 1], "gate-out": [0, 74, 1], "gate-in": [0, 52, 1], away: [0, 98, 0], start: [0, 98, 0] },
  "unknown-car": { home: [0, 8, 0], "gate-out": [0, -18, 1], start: [0, 8, 0] },
};

/* ---------- сама сцена ---------- */
export function createFallbackScene(container, opts = {}) {
  const { onSelect = () => {}, onEvent = () => {}, reducedMotion = false } = opts;
  let site = "north";
  let R = 0;
  let zoom = 1;
  let focus = null; // [sx, sy] в координатах SVG
  let selected = null;
  let paused = false;
  let disposed = false;
  let simulate = Boolean(opts.simulate);
  const moverState = { "milk-truck": MOVES["milk-truck"].park, "unknown-car": MOVES["unknown-car"].start };
  const walkers = new Map();
  let fox = false;
  let barrierOpen = false;
  const doorsOpen = new Set();
  let doorTimers = [];
  let objectBoxes = new Map();
  let screenCenter = new Map();
  let viewAnim = 0;
  let curVB = null;
  let zoomBeforeSelect = null;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "farm-svg");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Схема демо-фермы");
  container.appendChild(svg);

  function render() {
    const P = PALETTES[site];
    const world = buildWorld(P, site);
    const R_ = R;
    const T = (p) => proj(rot(p, R_));
    objectBoxes = new Map();
    screenCenter = new Map();
    const grow = (id, x, y) => {
      const b = objectBoxes.get(id) || [Infinity, Infinity, -Infinity, -Infinity];
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
      objectBoxes.set(id, b);
    };
    let ground = "";
    const poly = (pts3, fill, extra = "") => `<polygon points="${ptsStr(pts3.map(T))}" fill="${fill}" ${extra}/>`;
    const quad = (x0, z0, x1, z1, y = 0) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    ground += poly(quad(-400, -400, 500, 500), P.ground);
    // снежные надувы / сухая трава
    const gr = rng(site === "north" ? 3 : 5);
    for (let i = 0; i < 26; i++) {
      const x = -40 + gr() * 190, z = -30 + gr() * 160;
      const c = T([x, 0, z]);
      ground += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(18 + gr() * 40)}" ry="${f1(6 + gr() * 12)}" fill="${P.drift}" opacity="${site === "north" ? 0.75 : 0.45}"/>`;
    }
    ground += poly(quad(0, 0, 110, 80), P.inside);
    // дороги
    ground += poly(quad(-400, 98, 500, 110), P.roadEdge) + poly(quad(-400, 99, 500, 109), P.road);
    for (let x = -120; x < 260; x += 9) ground += poly(quad(x, 103.7, x + 4.5, 104.3, 0.02), P.mark);
    ground += poly(quad(18, 10, 28, 99), P.roadEdge) + poly(quad(18.6, 10, 27.4, 99), P.road);
    ground += poly(quad(28, 36, 104, 44), P.roadEdge) + poly(quad(27.4, 36.6, 104, 43.4), P.road);
    for (let z = 16; z < 96; z += 8) ground += poly(quad(22.7, z, 23.3, z + 4, 0.02), P.mark);
    ground += poly(quad(37, 84, 43, 99), P.path);
    ground += poly(quad(62, 66, 92, 76), P.path);
    // линия пересечения у северного забора
    const ln = [T([62, 0.05, 2.2]), T([104, 0.05, 2.2])];
    ground += `<line class="cross-line" x1="${f1(ln[0][0])}" y1="${f1(ln[0][1])}" x2="${f1(ln[1][0])}" y2="${f1(ln[1][1])}" stroke="#c2372d" stroke-width="2" stroke-dasharray="6 5" opacity="${fox ? 0.9 : 0.28}"/>`;

    // тени
    let shadows = "";
    const ldx = -LIGHT[0] / LIGHT[1], ldz = -LIGHT[2] / LIGHT[1];
    for (const o of world) {
      if (o.flat || !o.h) continue;
      const [[x0, z0], [x1, z1]] = o.foot;
      const pts = [];
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
        pts.push(T([x, 0, z]));
        pts.push(T([x + ldx * o.h * 0.9, 0, z + ldz * o.h * 0.9]));
      }
      const cls = o.mover ? ` data-shadow="${o.id}"` : "";
      shadows += `<polygon${cls} points="${ptsStr(hull(pts))}" fill="${P.shadow}"/>`;
    }

    // рисуемые объекты
    const draw = [];
    for (const o of world) {
      const faces = [];
      const oc = rot(o.center, R_);
      for (const f of o.faces) {
        const pts = f.pts.map((p) => rot(p, R_));
        const n = rotN(f.n, R_);
        const fc = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
        if (dot(n, VIEW) <= 0.001) continue;
        const lum = Math.max(0, dot(n, LIGHT));
        const fill = f.term ? f.color : shade(f.color, 0.72 + 0.34 * lum);
        const sp = pts.map(proj);
        sp.forEach((q) => grow(o.id, q[0], q[1]));
        faces.push({ d: fc[0] + fc[1] * 0.2 + fc[2] + (f.decal ? 0.05 : 0), svg: `<polygon points="${ptsStr(sp)}" fill="${fill}" stroke="${fill}" stroke-width="0.6" stroke-linejoin="round"${f.tag ? ` data-tag="${f.tag}"` : ""}/>` + (f.term ? `<circle cx="${f1((sp[2][0] + sp[3][0]) / 2)}" cy="${f1(sp[3][1] + 3)}" r="1.6" fill="#4fd17f"/>` : "") });
      }
      faces.sort((a, b) => a.d - b.d);
      let extra = "";
      if (o.barrier) {
        const a = T(o.barrier.pivot), b = T(o.barrier.end);
        const ang = barrierOpen ? -72 : 0;
        extra += `<g class="arm" data-arm style="transform-origin:${f1(a[0])}px ${f1(a[1])}px; transform: rotate(${ang}deg)"><line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/><line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="#d2402f" stroke-width="4.5" stroke-dasharray="7 7" stroke-linecap="round"/></g>`;
        const s0 = T(o.beam.from), s1 = T(o.beam.to[0]), s2 = T(o.beam.to[1]);
        extra += `<polygon class="beam" data-beam points="${ptsStr([s0, s1, s2])}" fill="#4fd17f"/>`;
      }
      if (o.led) {
        const l = T(o.led);
        extra += `<circle class="led" cx="${f1(l[0])}" cy="${f1(l[1])}" r="2.4" fill="#36c46a"/>`;
      }
      const c = T([o.center[0], (o.h || 0) * 0.4, o.center[2]]);
      if (!o.part) screenCenter.set(o.id, c);
      const g = `<g data-part="${o.id}"${o.mover ? ` data-mover="${o.id}"` : ""}>${faces.map((f) => f.svg).join("")}${extra}</g>`;
      draw.push({ depth: oc[0] + oc[2], svg: g, id: o.id, part: o.part });
    }
    // забор: сегменты по 10 м
    const fenceSeg = (x0, z0, x1, z1) => {
      const a = rot([x0, 0, z0], R_), b = rot([x1, 0, z1], R_);
      const posts = [];
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        const p0 = T([x, 0, z]), p1 = T([x, 1.9, z]);
        posts.push(`<line x1="${f1(p0[0])}" y1="${f1(p0[1])}" x2="${f1(p1[0])}" y2="${f1(p1[1])}"/>`);
      }
      const r1 = [T([x0, 0.8, z0]), T([x1, 0.8, z1])], r2 = [T([x0, 1.75, z0]), T([x1, 1.75, z1])];
      const rail = (r) => `<line x1="${f1(r[0][0])}" y1="${f1(r[0][1])}" x2="${f1(r[1][0])}" y2="${f1(r[1][1])}"/>`;
      [r1[0], r1[1], r2[0], r2[1]].forEach((q) => grow("perimeter", q[0], q[1]));
      draw.push({ depth: (a[0] + b[0]) / 2 + (a[2] + b[2]) / 2, svg: `<g data-part="perimeter" stroke="${P.fence}" stroke-width="1.3" stroke-linecap="round">${posts.join("")}${rail(r1)}${rail(r2)}</g>` });
    };
    const runs = [[0, 0, 110, 0], [110, 0, 110, 80], [0, 0, 0, 80], [0, 80, 10, 80], [28, 80, 34, 80], [46, 80, 110, 80]];
    for (const [x0, z0, x1, z1] of runs) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 10));
      for (let i = 0; i < n; i++) fenceSeg(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n, z0 + ((z1 - z0) * (i + 1)) / n);
    }
    // камеры периметра на столбах
    const cams = [["perimeter-cam", 110, 0], ["perimeter", 0, 0], ["perimeter", 110, 80]];
    cams.forEach(([id, x, z]) => {
      const p = rot([x, 0, z], R_);
      const b0 = T([x, 0, z]), b1 = T([x, 5.6, z]), cm = T([x - 0.6, 5.6, z + 0.6]);
      grow(id, b0[0], b0[1]); grow(id, b1[0] - 6, b1[1] - 8); grow(id, b1[0] + 8, b1[1] + 4);
      const svgc = `<g data-part="${id}"><line x1="${f1(b0[0])}" y1="${f1(b0[1])}" x2="${f1(b1[0])}" y2="${f1(b1[1])}" stroke="#7d8a92" stroke-width="2.4"/><rect x="${f1(cm[0] - 6)}" y="${f1(cm[1] - 4)}" width="12" height="6.5" rx="2" fill="#f4f6f7" stroke="#aab4ba" stroke-width="0.8"/><circle cx="${f1(cm[0] - 4)}" cy="${f1(cm[1] - 0.8)}" r="1.6" fill="#24302b"/></g>`;
      draw.push({ depth: p[0] + p[2] + 0.5, svg: svgc, id });
      if (id === "perimeter-cam") screenCenter.set(id, T([x, 3, z]));
    });
    if (!screenCenter.has("perimeter")) screenCenter.set("perimeter", T([55, 1, 0]));

    // деревья
    for (const t of treesFor(site)) { const tr = treeSvg(P, site, t.x, t.z, t.s, R_); draw.push({ depth: tr.depth, svg: tr.svg }); }

    // люди
    const basePeople = [["worker-1", 30, 60, WORKER_COLORS[3]], ["worker-2", 56, 33.5, WORKER_COLORS[4]]];
    for (const [id, x, z, color] of basePeople) {
      const p = rot([x, 0, z], R_), s = proj(p);
      screenCenter.set(id, [s[0], s[1] - 8]);
      grow(id, s[0] - 5, s[1] - 14); grow(id, s[0] + 5, s[1] + 2);
      draw.push({ depth: p[0] + p[2], svg: `<g data-part="${id}" transform="translate(${f1(s[0])} ${f1(s[1])})">${personSvg(color)}</g>` });
    }
    for (const [wid, w] of walkers) {
      const p = rot([39.5 + w.lane, 0, w.z], R_), s = proj(p);
      draw.push({ depth: p[0] + p[2], svg: `<g data-walker="${wid}" transform="translate(${f1(s[0])} ${f1(s[1])})" style="opacity:${w.op}">${personSvg(w.color)}</g>` });
    }
    if (fox) {
      const p = rot([84, 0, fox === "in" ? 6 : -9], R_), s = proj(p);
      draw.push({ depth: p[0] + p[2], svg: `<g data-fox transform="translate(${f1(s[0])} ${f1(s[1])})">${foxSvg()}</g>` });
    }
    draw.sort((a, b) => a.depth - b.depth);

    // группируем по объектам, чтобы клик и рамка работали по всему объекту
    let body = "";
    for (const d of draw) body += d.svg;

    // кольца-импульсы
    let pulses = "";
    for (const id of ["checkpoint", "gate", "feed", "office", "perimeter-cam"]) {
      const c = screenCenter.get(id);
      if (!c) continue;
      const g = id === "perimeter-cam" ? c : T(id === "checkpoint" ? [40, 0.1, 86] : id === "gate" ? [22, 0.1, 82] : id === "feed" ? [76, 0.1, 68] : [17.5, 0.1, 52]);
      pulses += `<ellipse class="pulse" data-pulse="${id}" cx="${f1(g[0])}" cy="${f1(g[1])}" rx="34" ry="17"/>`;
    }

    // облако в Казахстане и линия связи от процессора
    const pr = T([46.8, 2.6, 80.6]);
    const fb = farmBounds();
    const cloudX = pr[0] + 80, cloudY = pr[1] - 200;
    const cloud = `<g class="cloud" data-part="processor"><path class="link-line" d="M${f1(pr[0])},${f1(pr[1])} C${f1(pr[0])},${f1(pr[1] - 110)} ${f1(cloudX)},${f1(cloudY + 90)} ${f1(cloudX)},${f1(cloudY + 16)}" fill="none" stroke="#1f7a3f" stroke-width="2" opacity=".7"/>`
      + `<g transform="translate(${f1(cloudX)} ${f1(cloudY)})"><path d="M-38,14 h76 a16,16 0 0 0 -4,-31 a24,24 0 0 0 -45,-6 a18,18 0 0 0 -27,37 z" fill="#ffffff" stroke="#d3e0e6" stroke-width="1.2"/><text x="0" y="6" text-anchor="middle" font-size="10.5" font-weight="600" fill="#1f7a3f" font-family="Onest, system-ui, sans-serif">облако в РК</text></g></g>`;

    // метки
    let pins = "";
    const pinFor = [["checkpoint", "Проходная"], ["gate", "Въезд"], ["feed", "Склад кормов"], ["office", "Контора"], ["barn", "Коровник"], ["processor", "Процессор"], ["perimeter-cam", "Камера"]];
    for (const [id, label] of pinFor) {
      const o = world.find((w) => w.id === id && w.pin);
      const pp = o ? T(o.pin) : id === "perimeter-cam" ? T([110, 8.5, 0]) : null;
      if (!pp) continue;
      const tw = label.length * 6.1 + 14;
      pins += `<g class="pin" data-pin="${id}" data-x="${f1(pp[0])}" data-y="${f1(pp[1])}" transform="translate(${f1(pp[0])} ${f1(pp[1])})">`
        + `<path d="M0,0 C-3,-6 -9,-9 -9,-16 a9,9 0 0 1 18,0 C9,-9 3,-6 0,0z" fill="${id === "processor" ? "#0b3d24" : "#1f7a3f"}"/><circle cx="0" cy="-16" r="3.6" fill="#fff"/>`
        + `<g transform="translate(13 -24)"><rect width="${f1(tw)}" height="17" rx="8.5" fill="rgba(255,255,255,.92)" stroke="rgba(15,33,24,.08)"/><text class="pin-label" x="7" y="12">${label}</text></g></g>`;
    }

    // снег
    let flakes = "";
    if (site === "north" && !reducedMotion) {
      const fr = rng(42);
      for (let i = 0; i < 90; i++) {
        const x = fb[0] - 200 + fr() * (fb[2] - fb[0] + 400), y = fb[1] - 160 + fr() * (fb[3] - fb[1] + 160);
        flakes += `<circle class="flake" cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.8 + fr() * 1.6)}" fill="#fff" opacity="${f1(0.6 + fr() * 0.4)}" style="animation-duration:${f1(7 + fr() * 8)}s; animation-delay:-${f1(fr() * 10)}s; --fall:${f1(260 + fr() * 200)}px"/>`;
      }
    }

    svg.innerHTML = `<defs><filter id="fb-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs>`
      + `<g class="ground">${ground}</g><g filter="url(#fb-blur)">${shadows}</g><g class="pulses">${pulses}</g><g class="bodies">${body}</g>${cloud}<g class="pins">${pins}</g><g class="sel"></g><g class="snow" pointer-events="none">${flakes}</g>`;
    // кликабельные объекты: прозрачные области поверх
    const hits = document.createElementNS(NS, "g");
    hits.setAttribute("class", "hits");
    for (const o of OBJECTS) {
      const b = objectBoxes.get(o.id);
      if (!b) continue;
      const pad = o.kind === "person" ? 4 : 2;
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", f1(b[0] - pad)); r.setAttribute("y", f1(b[1] - pad));
      r.setAttribute("width", f1(b[2] - b[0] + pad * 2)); r.setAttribute("height", f1(b[3] - b[1] + pad * 2));
      r.setAttribute("class", "obj-hit");
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "obj");
      g.setAttribute("data-id", o.id);
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", o.name);
      g.appendChild(r);
      hits.appendChild(g);
    }
    // большие объекты кладём под маленькие, чтобы мелкие (процессор, люди) оставались кликабельными
    const order = ["perimeter", "barn", "feed", "office", "checkpoint", "gate", "feed-truck", "tractor", "milk-truck", "unknown-car", "perimeter-cam", "processor", "worker-1", "worker-2"];
    [...hits.children].sort((a, b) => order.indexOf(a.dataset.id) - order.indexOf(b.dataset.id)).forEach((n) => hits.appendChild(n));
    svg.querySelector(".pins").before(hits);
    applyMovers(false);
    drawSelection();
    applyView(false);
  }

  function farmBounds() {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of [[0, 0, 0], [110, 0, 0], [110, 0, 80], [0, 0, 80], [0, 16, 0], [110, 16, 0], [22, 0, 100], [100, 16, 8]]) {
      const s = proj(rot(p, R));
      b = [Math.min(b[0], s[0]), Math.min(b[1], s[1]), Math.max(b[2], s[0]), Math.max(b[3], s[1])];
    }
    return b;
  }

  function moverDelta(id) {
    const st = moverState[id];
    if (!st) return null;
    const base = rot([0, 0, 0], R), moved = rot([st[0], 0, st[1]], R);
    const a = proj(base), b = proj(moved);
    return { x: b[0] - a[0], y: b[1] - a[1], op: st[2] };
  }
  function applyMovers(animate, ms = 3000) {
    for (const id of Object.keys(moverState)) {
      const d = moverDelta(id);
      const nodes = svg.querySelectorAll(`[data-mover="${id}"], [data-shadow="${id}"]`);
      nodes.forEach((n) => {
        n.style.transition = animate && !reducedMotion ? `transform ${ms}ms linear, opacity .6s ease` : "none";
        n.style.transform = `translate(${f1(d.x)}px, ${f1(d.y)}px)`;
        n.style.opacity = String(d.op);
      });
      const hit = svg.querySelector(`.obj[data-id="${id}"]`);
      if (hit) { hit.style.transition = nodes[0]?.style.transition || "none"; hit.style.transform = `translate(${f1(d.x)}px, ${f1(d.y)}px)`; hit.style.display = d.op ? "" : "none"; }
    }
  }

  function bboxOf(id) {
    const b = objectBoxes.get(id);
    if (!b) return null;
    const d = moverDelta(id);
    return d ? [b[0] + d.x, b[1] + d.y, b[2] + d.x, b[3] + d.y] : b;
  }

  function drawSelection() {
    const g = svg.querySelector(".sel");
    if (!g) return;
    g.innerHTML = "";
    if (!selected) return;
    const b = bboxOf(selected);
    if (!b) return;
    const pad = 8, x0 = b[0] - pad, y0 = b[1] - pad, x1 = b[2] + pad, y1 = b[3] + pad;
    const L = Math.min(16, (x1 - x0) / 3, (y1 - y0) / 3);
    const path = `M${f1(x0)},${f1(y0 + L)} V${f1(y0)} H${f1(x0 + L)} M${f1(x1 - L)},${f1(y0)} H${f1(x1)} V${f1(y0 + L)} M${f1(x1)},${f1(y1 - L)} V${f1(y1)} H${f1(x1 - L)} M${f1(x0 + L)},${f1(y1)} H${f1(x0)} V${f1(y1 - L)}`;
    const name = (OBJECTS.find((o) => o.id === selected) || {}).name || selected;
    const tw = name.length * 6.3 + 18;
    const cx = (x0 + x1) / 2;
    const k = curVB ? curVB[2] / (container.clientWidth || 1) : 1;
    g.innerHTML = `<path class="sel-bracket" d="${path}"/><g class="sel-label" data-x="${f1(cx)}" data-y="${f1(y0)}" data-ox="${f1(-tw / 2)}" transform="translate(${f1(cx)} ${f1(y0)}) scale(${k.toFixed(3)}) translate(${f1(-tw / 2)} -24)"><rect width="${f1(tw)}" height="18" rx="9"/><text x="9" y="12.5">${name}</text></g>`;
  }

  /* вид: масштаб и центр */
  function baseView() {
    const fb = farmBounds();
    const W = container.clientWidth || 1200, H = container.clientHeight || 700;
    const phone = W < 760;
    const availW = W * (phone ? 0.98 : 0.66), availH = H * (phone ? 0.52 : 0.62);
    const scale = Math.min(availW / (fb[2] - fb[0]), availH / (fb[3] - fb[1] + 60));
    const anchor = phone ? [0.5, 0.56] : [0.42, 0.53];
    return { fb, W, H, scale, anchor, center: [(fb[0] + fb[2]) / 2, (fb[1] + fb[3]) / 2 - 10] };
  }
  function targetVB() {
    const v = baseView();
    const s = v.scale * zoom;
    const c = focus || v.center;
    const w = v.W / s, h = v.H / s;
    return [c[0] - w * v.anchor[0], c[1] - h * v.anchor[1], w, h];
  }
  function setVB(vb) {
    curVB = vb;
    svg.setAttribute("viewBox", vb.map(f1).join(" "));
    const k = vb[2] / (container.clientWidth || 1);
    svg.querySelectorAll(".pin").forEach((p) => p.setAttribute("transform", `translate(${p.dataset.x} ${p.dataset.y}) scale(${k.toFixed(3)})`));
    const lab = svg.querySelector(".sel-label");
    if (lab) lab.setAttribute("transform", `translate(${lab.dataset.x} ${lab.dataset.y}) scale(${k.toFixed(3)}) translate(${lab.dataset.ox} -24)`);
  }
  function applyView(animate = true) {
    const to = targetVB();
    cancelAnimationFrame(viewAnim);
    if (!animate || reducedMotion || !curVB) { setVB(to); return; }
    const from = curVB.slice(), t0 = performance.now(), dur = 650;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setVB(from.map((v, i) => v + (to[i] - v) * e));
      if (t < 1) viewAnim = requestAnimationFrame(step);
    };
    viewAnim = requestAnimationFrame(step);
  }

  /* клики */
  function onClick(e) {
    const hit = e.target.closest?.(".obj, .pin");
    if (hit) {
      const id = hit.dataset.id || hit.dataset.pin;
      api.select(id);
      onSelect(id);
    } else if (e.target.closest?.(".farm-svg")) {
      api.select(null);
      onSelect(null);
    }
  }
  function onKey(e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("obj")) {
      e.preventDefault();
      const id = e.target.dataset.id;
      api.select(id);
      onSelect(id);
    }
  }
  svg.addEventListener("click", onClick);
  svg.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => applyView(false));
  ro.observe(container);

  /* эффекты */
  function pulse(id, ok) {
    const el = svg.querySelector(`[data-pulse="${id}"]`);
    if (!el) return;
    el.classList.remove("is-on", "pulse--ok", "pulse--bad");
    void el.getBoundingClientRect();
    el.classList.add("pulse--" + (ok ? "ok" : "bad"), "is-on");
  }
  function setBarrier(open) {
    barrierOpen = open;
    const arm = svg.querySelector("[data-arm]");
    if (arm) arm.style.transform = `rotate(${open ? -72 : 0}deg)`;
  }
  function scanBeam() {
    const b = svg.querySelector("[data-beam]");
    if (!b) return;
    b.classList.add("is-on");
    setTimeout(() => b.classList.remove("is-on"), 1300);
  }
  function setDoor(id, open) {
    if (open) doorsOpen.add(id); else doorsOpen.delete(id);
    const el = svg.querySelector(`[data-tag="door-${id}"]`);
    if (el) el.setAttribute("opacity", open ? "0.25" : "1");
  }

  /* симуляция */
  let simClock = 0, simIdx = 0, lastTick = 0, simTimer = 0;
  const script = buildScript();
  function emit(evt) { if (!disposed) onEvent(Object.assign({ time: new Date() }, evt)); }
  function runStep(s) {
    if (s.walk) { walkers.set(s.walk.id, { color: s.walk.color, z: 97, lane: walkers.size % 2 ? 1.2 : 0, op: 1 }); render(); setTimeout(() => { const w = walkers.get(s.walk.id); if (w) { w.z = 87; animWalker(s.walk.id, 87, 2600); } }, 30); }
    if (s.unwalk) { walkers.delete(s.unwalk); render(); }
    if (s.face) {
      pulse(s.face.objectId, s.face.result === "allowed");
      emit(Object.assign({ type: "face" }, s.face));
      if (s.face.objectId === "checkpoint") {
        const w = [...walkers.keys()].pop();
        if (w && s.face.result === "allowed") { animWalker(w, 74, 2200); setTimeout(() => { walkers.delete(w); render(); }, 2400); }
      }
    }
    if (s.plate) {
      scanBeam();
      const vehId = s.plate.vehicleId;
      pulse("gate", s.plate.result === "allowed");
      emit({ type: "plate", plate: PLATES[site][vehId], vehicle: s.plate.vehicle, objectId: "gate", result: s.plate.result, direction: s.plate.direction, vehicleId: vehId });
    }
    if ("barrier" in s) { setBarrier(s.barrier); emit({ type: "door", objectId: "gate", state: s.barrier ? "open" : "closed" }); }
    if (s.move) { moverState[s.move.id] = MOVES[s.move.id][s.move.to]; applyMovers(true, s.move.ms); }
    if (s.door) { setDoor(s.door.objectId, s.door.state === "open"); emit({ type: "door", objectId: s.door.objectId, state: s.door.state }); }
    if (s.alarm) { pulse(s.alarm.objectId === "perimeter-cam" ? "perimeter-cam" : s.alarm.objectId, false); emit(Object.assign({ type: "alarm" }, s.alarm)); }
    if (s.fox) { fox = "out"; render(); setTimeout(() => { if (fox) { fox = "in"; animFox(); } }, 60); }
    if (s.unfox) { fox = false; render(); }
  }
  function animWalker(id, z, ms) {
    const node = svg.querySelector(`[data-walker="${id}"]`);
    const w = walkers.get(id);
    if (!node || !w) return;
    const from = proj(rot([39.5 + w.lane, 0, w.z], R)), to = proj(rot([39.5 + w.lane, 0, z], R));
    w.z = z;
    node.style.transition = reducedMotion ? "none" : `transform ${ms}ms linear`;
    node.setAttribute("transform", `translate(${f1(from[0])} ${f1(from[1])})`);
    requestAnimationFrame(() => { node.style.transform = `translate(${f1(to[0] - from[0])}px, ${f1(to[1] - from[1])}px)`; });
  }
  function animFox() {
    const node = svg.querySelector("[data-fox]");
    if (!node) return;
    const a = proj(rot([84, 0, -9], R)), b = proj(rot([84, 0, 6], R));
    node.style.transition = reducedMotion ? "none" : "transform 3s linear";
    requestAnimationFrame(() => { node.style.transform = `translate(${f1(b[0] - a[0])}px, ${f1(b[1] - a[1])}px)`; });
    const line = svg.querySelector(".cross-line");
    if (line) line.setAttribute("opacity", "0.9");
  }
  function resetLoop() {
    simIdx = 0; simClock = 0;
    moverState["milk-truck"] = MOVES["milk-truck"].start;
    moverState["unknown-car"] = MOVES["unknown-car"].start;
    walkers.clear(); fox = false; barrierOpen = false;
    render();
  }
  function tick() {
    const now = performance.now();
    const dt = Math.min(1000, now - lastTick);
    lastTick = now;
    if (paused || disposed || !simulate) return;
    simClock += dt;
    while (simIdx < script.length && script[simIdx].t <= simClock) runStep(script[simIdx++]);
    if (simClock >= LOOP_MS) resetLoop();
  }
  function startSim() {
    if (simTimer) return;
    simulate = true;
    lastTick = performance.now();
    moverState["milk-truck"] = MOVES["milk-truck"].start;
    applyMovers(false);
    simTimer = setInterval(tick, 200);
  }

  const api = {
    objects: OBJECTS.map((o) => Object.assign({ site: "north" }, o)),
    async setSite(id) {
      if (id !== "north" && id !== "south") return;
      site = id;
      container.style.transition = reducedMotion ? "none" : "opacity .35s ease";
      container.style.opacity = "0.2";
      await new Promise((r) => setTimeout(r, reducedMotion ? 0 : 320));
      render();
      container.style.opacity = "1";
    },
    select(id) {
      selected = id && OBJECTS.some((o) => o.id === id) ? id : null;
      if (selected) {
        const b = bboxOf(selected);
        focus = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
        if (zoomBeforeSelect === null) zoomBeforeSelect = zoom;
        zoom = Math.max(zoom, 1.35);
      } else {
        focus = null;
        if (zoomBeforeSelect !== null) { zoom = zoomBeforeSelect; zoomBeforeSelect = null; }
      }
      drawSelection();
      applyView(true);
    },
    openDoor(id) {
      return new Promise((resolve, reject) => {
        if (!["checkpoint", "feed", "office"].includes(id)) { reject(new Error("no-door")); return; }
        const ms = 820 + ((doorTimers.length * 137) % 260);
        const t = setTimeout(() => {
          setDoor(id, true);
          pulse(id, true);
          emit({ type: "door", objectId: id, state: "open" });
          resolve({ ms });
          doorTimers.push(setTimeout(() => { setDoor(id, false); emit({ type: "door", objectId: id, state: "closed" }); }, 5000));
        }, ms);
        doorTimers.push(t);
      });
    },
    zoomBy(step) { zoom = Math.max(0.6, Math.min(3.2, zoom * Math.pow(1.25, step))); zoomBeforeSelect = null; applyView(true); },
    rotateBy(deg) {
      R = (R + (deg >= 0 ? 1 : 3)) & 3;
      const sel = selected;
      render();
      if (sel) { const b = bboxOf(sel); focus = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null; }
      else focus = null;
      applyView(false);
    },
    resetView() { zoom = 1; focus = null; zoomBeforeSelect = null; if (R !== 0) { R = 0; render(); } applyView(true); },
    setPaused(p) { paused = Boolean(p); container.closest(".world")?.classList.toggle("is-paused", paused); if (!paused) lastTick = performance.now(); },
    dispose() {
      disposed = true;
      clearInterval(simTimer);
      doorTimers.forEach(clearTimeout);
      cancelAnimationFrame(viewAnim);
      ro.disconnect();
      svg.removeEventListener("click", onClick);
      svg.removeEventListener("keydown", onKey);
      svg.remove();
    },
    startSimulation: startSim,
    get site() { return site; },
  };

  render();
  if (simulate) startSim();
  return api;
}
