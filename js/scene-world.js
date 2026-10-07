// QazTracker Vision — 3D farm scene: static world (ground, roads, buildings, fence, trees)
// and the animated fixtures of one farm site (barrier, turnstile, doors, terminal screens, LEDs).
import * as THREE from 'three';
import {
  Kit, rng, noise2, smooth, clamp, ACCENT, softShadowTexture,
} from './scene-kit.js';
import { sedanParts, baleParts, createCows, createSheep } from './scene-actors.js';

const PI = Math.PI;

// Site origins in world space. Both farms share one layout (a standard project),
// the south farm sits further along the same road.
export const SITE_ORIGINS = {
  north: new THREE.Vector3(0, 0, 0),
  south: new THREE.Vector3(400, 0, 0),
};

// Site-local layout (metres ≈ units). Camera looks from +X/+Z.
export const L = {
  fence: { x0: -52, x1: 52, z0: -40, z1: 36 },
  road: { z: 54, w: 8, laneE: 55.8, laneW: 52.2 },
  gateX: -24,
  barrierZ: 37.6,
  r2: { z: 4, x0: -27.5, x1: 42 },
  truckLaneZ: 4.4,
  barn: { x0: -36, x1: 8, z0: -24, z1: -10 },
  milkPark: { x: 18, z: -5.0 },
  feedPark: { x: 30, z: -5.6 },
  pen: { x0: -34, x1: -12, z0: -8.5, z1: -1 },
  feed: { cx: 30, z0: -34, z1: -12, r: 8 },
  office: { x0: 27, x1: 37, z0: 16, z1: 23, doorX: 30 },
  laneX: 9.6,
  barnDoor: { x: -2, z: -9.3 },
};

// Per-site layout. Both farms share the standard project (gate, checkpoint, barn, feed store), but the south farm
// has its office on the west side of the yard, a sheep shed instead of the cow pen and a small machinery hangar.
export const LAYOUTS = {
  north: L,
  south: { ...L, office: { x0: -44, x1: -34, z0: 15.5, z1: 22.5, doorX: -41, walkZ: 24.6 }, sheep: true },
};

export const THEMES = {
  north: {
    id: 'north', snow: true,
    yard: '#DCE3EB', yardRoad: '#BFC8D4', road: '#9DA9B8', walk: '#CCD4DE', pad2: '#D6DDE6', pen: '#D8DEE6',
    marking: '#FFFFFF', snowC: '#F8FAFD', wall: '#F1F3F6', wallWarm: '#F2EFE9', plinth: '#C3CAD3',
    green: '#23885A', greenDark: '#1A6A45', roof: '#23885A', curtain: '#E2E9F0', glass: '#3F566A',
    steel: '#B7C0CA', steelLight: '#E7EBEF', silo: '#DCE1E7', siloBand: '#AFB8C2', hangar: '#DDE3E9',
    pole: '#8C97A4', wood: '#9A7455', door: '#F4F6F8', rail: '#97A3AF', panel: '#D5DDE6',
    hay: '#D9B864', trunk: '#76584A', pine: '#2D6A4D', pine2: '#27603F', tree: 'pine',
    cars: ['#3B5B92', '#B8BEC6', '#7A2E35', '#EDEFF2'],
    sign: 'Ферма «Север»',
  },
  south: {
    id: 'south', snow: false,
    yard: '#E4D8BD', yardRoad: '#D3CAB7', road: '#B6B0A7', walk: '#E0D7C6', pad2: '#D9CDB2', pen: '#CDB993',
    marking: '#FFFFFF', snowC: '#F8FAFD', wall: '#F3F2EE', wallWarm: '#F4EFE6', plinth: '#C9C2B4',
    green: '#23885A', greenDark: '#1A6A45', roof: '#23885A', curtain: '#E9ECEA', glass: '#3F566A',
    steel: '#B9C0C7', steelLight: '#E8EBEE', silo: '#E1E3E3', siloBand: '#B4B9BD', hangar: '#E1E5E8',
    pole: '#8E8F94', wood: '#9A7455', door: '#F4F6F8', rail: '#9A9FA6', panel: '#DDDFDF',
    hay: '#DDBB66', trunk: '#7A5B45', poplar: '#5C9A47', poplar2: '#4E8A3E', round: '#6FAA52', tree: 'poplar',
    cars: ['#3B5B92', '#C9CDD2', '#F2F2F0', '#2F3A44'],
    sign: 'Ферма «Юг»',
  },
};

// ---------------------------------------------------------------- shared world
export function buildWorld(mats) {
  const group = new THREE.Group();
  group.name = 'world';
  // Ground: one big plane, snow in the north blending into steppe towards the south farm.
  const X0 = -1500, X1 = 1900, Z0 = -1400, Z1 = 1400;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 240, 200);
  geo.rotateX(-PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), s1 = new THREE.Color('#FAFCFF'), s2 = new THREE.Color('#EBF0F7');
  const g1 = new THREE.Color('#D9C996'), g2 = new THREE.Color('#C8B37C'), g3 = new THREE.Color('#BDBF7F');
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n1 = noise2(x * 0.018, z * 0.018), n2 = noise2(x * 0.06 + 10, z * 0.06 - 4);
    const w = smooth((x - 135) / 160);
    tmpA.copy(s1).lerp(s2, clamp(n1 * 0.9 + n2 * 0.25 - 0.35, 0, 1));
    tmpB.copy(g1).lerp(g2, clamp(n1 * 1.1 - 0.25, 0, 1)).lerp(g3, clamp(n2 * 1.4 - 0.75, 0, 1) * 0.8);
    c.copy(tmpA).lerp(tmpB, w);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // Long public road joining both farms (vertex-coloured asphalt).
  const RX0 = -760, RX1 = 1320, rz = L.road.z;
  const rgeo = new THREE.PlaneGeometry(RX1 - RX0, L.road.w, 104, 1);
  rgeo.rotateX(-PI / 2);
  rgeo.translate((RX0 + RX1) / 2, 0.03, rz);
  const rp = rgeo.attributes.position, rc = new Float32Array(rp.count * 3);
  const aN = new THREE.Color(THEMES.north.road), aS = new THREE.Color(THEMES.south.road);
  for (let i = 0; i < rp.count; i++) {
    c.copy(aN).lerp(aS, smooth((rp.getX(i) - 135) / 160));
    rc[i * 3] = c.r; rc[i * 3 + 1] = c.g; rc[i * 3 + 2] = c.b;
  }
  rgeo.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  const road = new THREE.Mesh(rgeo, mats.matte);
  road.receiveShadow = true;
  group.add(road);

  const k = new Kit();
  // markings
  for (let x = RX0 + 2; x < RX1; x += 8) k.flat(3.6, 0.22, '#FFFFFF', { x, y: 0.06, z: rz });
  k.flat(RX1 - RX0, 0.2, '#F4F6F8', { x: (RX0 + RX1) / 2, y: 0.055, z: rz - 3.55 });
  k.flat(RX1 - RX0, 0.2, '#F4F6F8', { x: (RX0 + RX1) / 2, y: 0.055, z: rz + 3.55 });
  // power line along the far side of the road
  let prev = null;
  for (let x = -330; x <= 900; x += 34) {
    const z = 63.5;
    k.cyl(0.15, 0.2, 7.4, '#8B6E55', { x, z, seg: 7 });
    k.box(2.6, 0.14, 0.16, '#7A5F49', { x, y: 6.9, z });
    if (prev !== null) {
      for (const dz of [-1.1, 0, 1.1]) k.beam([prev, 7.05, z + dz], [x, 7.05, z + dz], 0.025, '#59606A', { seg: 3 });
    }
    prev = x;
  }
  // distant fields: stubble rows in the snow, irrigated rows in the steppe
  const fieldRows = (x0, x1, z0, z1, step, color) => {
    for (let z = z0; z < z1; z += step) k.flat(x1 - x0, step * 0.42, color, { x: (x0 + x1) / 2, y: 0.012, z });
  };
  fieldRows(-190, -95, -175, -95, 2.6, '#E7E6E2');
  fieldRows(80, 170, -190, -110, 2.6, '#E8E7E3');
  fieldRows(-160, -60, 95, 170, 2.8, '#E8E7E3');
  fieldRows(250, 340, -185, -95, 2.4, '#C4BE82');
  fieldRows(470, 570, -190, -100, 2.6, '#B3B873');
  fieldRows(250, 350, 95, 170, 2.8, '#CBB384');
  group.add(k.build(mats, { cast: false }));
  return { group, ground };
}

// ---------------------------------------------------------------- one farm site
export function buildSite(siteId, ctx) {
  const T = THEMES[siteId];
  const LS = LAYOUTS[siteId];
  const OF = LS.office;
  const { mats } = ctx;
  const SNOW = T.snowC;
  const snow = T.snow;
  const k = new Kit();
  const ao = [];
  const group = new THREE.Group();
  group.name = 'site-' + siteId;
  const R = rng(siteId === 'north' ? 1107 : 2903);
  const anchors = {};
  const parts = {};
  const objects = [];
  const inst = { pines: [], poplars: [], rounds: [], bales: [], posts: [], banks: [] };

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // soft contact shadow under buildings (on top of the real shadow map, so every object sits on the ground)
  const shadowRect = (x, z, w, d, a = 0.32) => ao.push({ x, z, w, d, a: a + 0.1 });
  const bank = (x, z, sx, sz, sy = 0.55, ry = 0) => { if (snow) inst.banks.push({ x, z, sx, sz, sy, ry }); };

  // ---------------------------------------------------------- ground layers
  const F = L.fence;
  k.flat(F.x1 - F.x0, F.z1 - F.z0, T.yard, { x: (F.x0 + F.x1) / 2, y: 0.015, z: (F.z0 + F.z1) / 2 });
  const road = (x0, z0, x1, z1, color = T.yardRoad, y = 0.03) =>
    k.flat(Math.abs(x1 - x0), Math.abs(z1 - z0), color, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2 });
  road(-27.5, 0.5, -20.5, 50);                // driveway + R1
  road(L.r2.x0, 0.5, L.r2.x1, 7.5);           // R2
  road(6, -11, 21, 0.5);                      // milk pad
  road(26.5, -12, 33.5, 0.5);                 // feed road
  road(40.5, -20.5, 50, 0.5, T.pad2);         // tractor yard by the hay
  road(40.5, -35, 50, -20.5, T.pad2, 0.025);  // hay storage
  road(16, 40, 36, 48.5, T.road);             // staff parking
  road(23, 48.5, 29, 50, T.road);
  const walk = (x0, z0, x1, z1, w = 2.2) =>
    k.flat(Math.abs(x1 - x0) + w, Math.abs(z1 - z0) + w, T.walk, { x: (x0 + x1) / 2, y: 0.04, z: (z0 + z1) / 2 });
  walk(L.laneX, 39.5, L.laneX, 42);
  walk(L.laneX, 42, 33, 42);
  walk(L.laneX, 10.2, L.laneX, 32.5);
  walk(-2, 10.2, L.laneX, 10.2);
  walk(-2, -9.8, -2, 0.5);
  const WZ = OF.walkZ ?? 26;
  if (OF.doorX > L.laneX) walk(L.laneX, WZ, OF.doorX, WZ);
  else {
    walk(OF.doorX, WZ, L.laneX, WZ);
    // zebra where the office path crosses the driveway
    for (let i = 0; i < 5; i++) k.flat(0.55, 2.3, T.marking, { x: -26.6 + i * 1.3, y: 0.055, z: WZ });
  }
  walk(OF.doorX, OF.z1 + 0.8, OF.doorX, WZ);
  walk(-46, 49.2, 16, 49.2, 1.6);
  // markings
  k.flat(7, 0.4, T.marking, { x: L.gateX, y: 0.055, z: 39.3 });
  for (let i = 0; i < 6; i++) k.flat(2.6, 0.5, T.marking, { x: -2, y: 0.055, z: 1.3 + i * 1.1 });
  for (let i = 0; i <= 5; i++) k.flat(0.16, 5.4, T.marking, { x: 16.5 + i * 3.9, y: 0.055, z: 43.4 });
  // pen ground
  k.flat(22, 7.5, T.pen, { x: -23, y: 0.025, z: -4.75 });
  // painted loading boxes (milk pad, feed store)
  const boxLines = (cx, cz, w, d, color = '#E9C35B') => {
    k.flat(w, 0.18, color, { x: cx, y: 0.058, z: cz - d / 2 });
    k.flat(w, 0.18, color, { x: cx, y: 0.058, z: cz + d / 2 });
    k.flat(0.18, d, color, { x: cx - w / 2, y: 0.058, z: cz });
    k.flat(0.18, d, color, { x: cx + w / 2, y: 0.058, z: cz });
  };
  boxLines(L.milkPark.x, L.milkPark.z + 0.2, 4.0, 10.6);
  boxLines(L.feedPark.x, L.feedPark.z + 0.2, 4.0, 9.6);
  // bus stop on the road side (the stranger arrives here)
  {
    const bx = -6, bz = 47.4;
    for (const px of [bx - 1.5, bx + 1.5]) k.rbox(0.14, 2.4, 0.14, T.pole, { x: px, z: bz, r: 0.04 });
    k.rbox(3.4, 0.14, 1.5, T.green, { x: bx, y: 2.4, z: bz + 0.35, r: 0.05 });
    if (snow) k.rbox(2.6, 0.14, 0.9, SNOW, { x: bx, y: 2.54, z: bz + 0.35, r: 0.06 });
    k.rbox(3.0, 1.7, 0.06, '#CFE3DA', { x: bx, y: 0.5, z: bz - 0.05, mat: 'canopy' });
    k.rbox(2.4, 0.12, 0.5, T.wood, { x: bx, y: 0.55, z: bz + 0.3, r: 0.04 });
    k.flat(4.2, 2.2, T.walk, { x: bx, y: 0.045, z: bz + 0.6 });
  }

  // ---------------------------------------------------------- barn (коровник)
  {
    const { x0, x1, z0, z1 } = L.barn;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0, H = 4.4, rise = 2.6;
    k.rbox(W + 0.3, 0.85, D + 0.3, T.plinth, { x: cx, z: cz, r: 0.12 });
    k.rbox(W, H - 0.8, D, T.green, { x: cx, y: 0.8, z: cz, r: 0.1, mat: 'ribbed' });
    k.rbox(W - 3, 1.15, D + 0.1, T.curtain, { x: cx, y: 2.25, z: cz, r: 0.05 });
    for (let x = x0 + 0.2; x <= x1 - 0.1; x += W / 4) k.rbox(0.42, H - 0.7, D + 0.16, T.wall, { x, y: 0.75, z: cz, r: 0.08 });
    k.rbox(0.42, H - 0.7, D + 0.16, T.wall, { x: x1 - 0.2, y: 0.75, z: cz, r: 0.08 });
    const a = Math.atan2(rise, D / 2);
    const slab = (D / 2 + 0.9) / Math.cos(a);
    for (const s of [1, -1]) {
      k.push({ x: cx, y: H + rise + 0.05, z: cz, rx: s * a });
      k.rbox(W + 1.6, 0.32, slab, T.roof, { y: -0.32, z: s * slab / 2, r: 0.12, mat: 'ribbed' });
      // snow cap on the upper part of the slope: the green roof stays visible along the eaves and the gables
      if (snow) { const sl = slab * 0.56; k.rbox(W - 0.8, 0.22, sl, SNOW, { y: 0.02, z: s * (sl / 2 - 0.1), r: 0.16 }); }
      k.pop();
    }
    for (const gx of [x0 + 0.16, x1 - 0.16]) k.prism([[-D / 2, 0], [D / 2, 0], [0, rise]], 0.3, T.green, { x: gx, y: H, z: cz, ry: PI / 2, mat: 'ribbed' });
    k.rbox(W - 2, 0.55, 1.5, T.wall, { x: cx, y: H + rise - 0.1, z: cz, r: 0.1 });
    k.rbox(W - 1.6, 0.16, 1.9, T.greenDark, { x: cx, y: H + rise + 0.42, z: cz, r: 0.07 });
    if (snow) k.rbox(W - 3.2, 0.12, 0.9, SNOW, { x: cx, y: H + rise + 0.56, z: cz, r: 0.05 });
    k.rbox(W, 0.22, 0.5, T.greenDark, { x: cx, y: H + rise + 0.05, z: cz, r: 0.08 });
    // big doors and personnel door on the front (+z) face
    for (const dx of [-28, -18.5]) {
      k.rbox(3.6, 3.15, 0.16, T.wall, { x: dx, y: 0.45, z: z1 + 0.02, r: 0.06 });
      const ang = Math.atan2(2.7, 3.2);
      for (const sgn of [1, -1]) k.box(4.0, 0.16, 0.08, T.greenDark, { x: dx, y: 1.95, z: z1 + 0.13, rz: sgn * ang, center: true });
      k.rbox(4.0, 0.2, 0.24, T.greenDark, { x: dx, y: 3.6, z: z1 + 0.08, r: 0.05 });
    }
    k.rbox(1.3, 2.3, 0.14, '#B5865F', { x: L.barnDoor.x, y: 0.5, z: z1 + 0.03, r: 0.05 });
    k.rbox(1.5, 0.14, 0.18, T.greenDark, { x: L.barnDoor.x, y: 2.82, z: z1 + 0.06 });
    k.rbox(2.1, 0.12, 1.1, T.green, { x: L.barnDoor.x, y: 3.15, z: z1 + 0.5, r: 0.04 });
    // Face ID terminal DS-K1T321MWX at the milk block door
    k.rbox(0.44, 0.66, 0.1, '#1F242B', { x: L.barnDoor.x + 1.15, y: 1.25, z: z1 + 0.08, r: 0.05 });
    anchors.barnTerm = V(L.barnDoor.x + 1.15, 1.6, z1 + 0.15);
    parts.barnScreen = screenMesh(0.32, 0.42, anchors.barnTerm, 0);
    shadowRect(cx, cz, W + 5, D + 5, 0.38);
    // milk room annex + tank
    k.rbox(7.3, 0.5, 10.3, T.plinth, { x: 11.5, z: -17, r: 0.1 });
    k.rbox(7, 3.6, 10, T.wall, { x: 11.5, y: 0.4, z: -17, r: 0.12 });
    k.rbox(7.6, 0.36, 10.6, T.green, { x: 11.5, y: 4.0, z: -17, r: 0.12 });
    if (snow) k.rbox(5.4, 0.22, 8.2, SNOW, { x: 11.5, y: 4.34, z: -17, r: 0.1 });
    k.rbox(1.4, 2.4, 0.12, T.steel, { x: 11.5, y: 0.5, z: -11.97, r: 0.04 });
    k.rbox(0.1, 1.0, 2.2, T.glass, { x: 15.02, y: 1.7, z: -16, mat: 'glass' });
    k.rbox(0.1, 1.0, 2.2, T.glass, { x: 15.02, y: 1.7, z: -19.6, mat: 'glass' });
    shadowRect(11.5, -17, 9.5, 12.5, 0.3);
    // horizontal milk tank on legs
    for (const lx of [9.9, 14.1]) for (const lz of [-8.75, -7.25]) k.rbox(0.2, 1.0, 0.2, T.steel, { x: lx, z: lz, r: 0.05 });
    k.cyl(1.15, 1.15, 5.0, T.steelLight, { x: 12, y: 2.05, z: -8, rz: PI / 2, center: true, seg: 22, mat: 'metal' });
    k.sphere(1.15, T.steelLight, { x: 9.5, y: 2.05, z: -8, sx: 0.32, mat: 'metal', ws: 18, hs: 12 });
    k.sphere(1.15, T.steelLight, { x: 14.5, y: 2.05, z: -8, sx: 0.32, mat: 'metal', ws: 18, hs: 12 });
    k.rbox(3.6, 0.08, 0.7, '#98A3AE', { x: 12, y: 3.2, z: -8 });
    if (snow) k.rbox(3.4, 0.14, 0.9, SNOW, { x: 12, y: 3.24, z: -8, r: 0.06 });
    k.beam([11.5, 1.2, -11.9], [11.5, 1.2, -9.0], 0.09, T.steel);
    shadowRect(12, -8, 7.5, 3.6, 0.28);
    // silos
    for (const sz of [-20.5, -14.2]) {
      const sx = -41.5;
      k.cyl(2.5, 2.6, 0.45, T.plinth, { x: sx, z: sz, seg: 24 });
      k.cyl(2.3, 2.3, 9, T.silo, { x: sx, y: 0.4, z: sz, seg: 26, mat: 'metal' });
      for (const by of [2.6, 5.2, 7.8]) k.cyl(2.36, 2.36, 0.16, T.siloBand, { x: sx, y: by, z: sz, seg: 26 });
      k.cone(2.42, 1.7, T.silo, { x: sx, y: 9.4, z: sz, seg: 26, mat: 'metal' });
      if (snow) k.cone(2.0, 1.42, SNOW, { x: sx, y: 9.72, z: sz, seg: 26 });
      k.beam([sx + 1.2, 10.2, sz], [-36.2, 6.4, sz], 0.18, T.steel);
      shadowRect(sx, sz, 6.4, 6.4, 0.3);
    }
    // water tower (Рожновский)
    {
      const wx = -47, wz = -32;
      k.cyl(0.85, 1.0, 10, T.wall, { x: wx, z: wz, seg: 16 });
      k.cyl(2.4, 2.4, 3.2, T.green, { x: wx, y: 10, z: wz, seg: 22 });
      k.cyl(2.46, 2.46, 0.22, T.wall, { x: wx, y: 11.4, z: wz, seg: 22 });
      k.cone(2.6, 1.3, T.greenDark, { x: wx, y: 13.2, z: wz, seg: 22 });
      if (snow) k.cone(2.15, 1.05, SNOW, { x: wx, y: 13.48, z: wz, seg: 22 });
      shadowRect(wx, wz, 4.5, 4.5, 0.3);
    }
    // pen: wooden rails and hay ring feeders. North: cows in an open pen. South: a low sheep shed (кошара)
    // on the west half and a small paddock with sheep on the east half.
    const P = L.pen;
    const px0 = LS.sheep ? -22.6 : P.x0;
    const penEdges = [[[px0, P.z0], [P.x1, P.z0]], [[P.x1, P.z0], [P.x1, P.z1]], [[P.x1, P.z1], [px0, P.z1]], [[px0, P.z1], [px0, P.z0]]];
    for (const [[ax, az], [bx, bz]] of penEdges) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i <= n; i++) k.cyl(0.1, 0.11, 1.35, T.wood, { x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, seg: 6 });
      for (const ry of [0.6, 1.1]) k.beam([ax, ry, az], [bx, ry, bz], 0.06, T.wood, { seg: 5 });
    }
    for (const fx of LS.sheep ? [-17.2] : [-29, -19]) {
      k.torus(1.05, 0.08, T.green, { x: fx, y: 0.95, z: -4.8, rx: PI / 2, ts: 5, rs: 20 });
      for (let i = 0; i < 6; i++) { const an = i / 6 * PI * 2; k.cyl(0.05, 0.05, 0.95, T.greenDark, { x: fx + Math.cos(an) * 1.05, z: -4.8 + Math.sin(an) * 1.05, seg: 4 }); }
      k.push({ x: fx, z: -4.8, ry: PI / 2 }); baleParts(k, T.hay, snow); k.pop();
    }
    if (LS.sheep) {
      // кошара: adobe walls, flat green roof with a small slope, open front with posts
      const sx0 = -34.4, sx1 = -23.2, sz0 = -8.6, sz1 = -1.4, sh = 2.3;
      const scx = (sx0 + sx1) / 2, scz = (sz0 + sz1) / 2, sw = sx1 - sx0, sd = sz1 - sz0;
      k.rbox(sw + 0.3, 0.3, sd + 0.3, T.plinth, { x: scx, z: scz, r: 0.08 });
      k.rbox(sw, sh, 0.32, '#E6D5B5', { x: scx, y: 0.25, z: sz0 + 0.16, r: 0.06 });
      k.rbox(0.32, sh, sd, '#E6D5B5', { x: sx0 + 0.16, y: 0.25, z: scz, r: 0.06 });
      k.rbox(0.32, sh, sd, '#E6D5B5', { x: sx1 - 0.16, y: 0.25, z: scz, r: 0.06 });
      k.rbox(sw - 0.6, 1.1, 0.26, '#DCC7A0', { x: scx, y: 0.25, z: sz1 - 0.2, r: 0.05 });
      for (const ppx of [sx0 + 2.8, scx, sx1 - 2.8]) k.rbox(0.26, sh, 0.26, T.wood, { x: ppx, y: 0.25, z: sz1 - 0.2, r: 0.05 });
      k.rbox(sw + 1.0, 0.3, sd + 1.0, T.roof, { x: scx, y: sh + 0.25, z: scz + 0.15, r: 0.1, rx: 0.06, mat: 'ribbed' });
      k.rbox(sw + 1.1, 0.12, 0.3, T.greenDark, { x: scx, y: sh + 0.33, z: sz1 + 0.6, r: 0.04 });
      k.rbox(4.2, 1.0, 0.1, '#7A5B45', { x: scx - 1.8, y: 0.25, z: sz1 - 0.04, r: 0.03 });
      shadowRect(scx, scz, sw + 3, sd + 3, 0.3);
    }
  }

  // ---------------------------------------------------------- feed store (склад кормов)
  {
    const { cx, z0, z1, r } = L.feed, len = z1 - z0, cz = (z0 + z1) / 2;
    k.rbox(2 * r + 0.4, 0.45, len + 0.4, T.plinth, { x: cx, z: cz, r: 0.1 });
    k.cyl(r, r, len, T.hangar, { x: cx, y: 0.4, z: cz, rx: PI / 2, center: true, open: true, thetaStart: PI / 2, theta: PI, seg: 30, mat: 'ribbed' });
    for (const rz of [z1 - 0.2, cz + 5.4, cz, cz - 5.4, z0 + 0.2]) k.torus(r + 0.06, 0.1, T.green, { x: cx, y: 0.4, z: rz, arc: PI, ts: 4, rs: 30 });
    if (snow) k.cyl(r + 0.12, r + 0.12, len - 0.6, SNOW, { x: cx, y: 0.4, z: cz, rx: PI / 2, center: true, open: true, thetaStart: PI - 0.95, theta: 1.9, seg: 20 });
    const semi = [];
    for (let i = 0; i <= 24; i++) { const an = PI - i / 24 * PI; semi.push([Math.cos(an) * (r - 0.05), Math.sin(an) * (r - 0.05)]); }
    k.prism(semi, 0.3, T.wall, { x: cx, y: 0.4, z: z1 - 0.15 });
    k.prism(semi, 0.3, T.wall, { x: cx, y: 0.4, z: z0 + 0.15 });
    k.rbox(7.4, 5.7, 0.3, T.green, { x: cx, y: 0.35, z: z1 + 0.05, r: 0.08 });
    k.rbox(6.6, 5.1, 0.1, '#2A3037', { x: cx, y: 0.42, z: z1 + 0.22 });
    k.rbox(7.1, 0.55, 0.55, T.greenDark, { x: cx, y: 5.25, z: z1 + 0.42, r: 0.12 });
    shadowRect(cx, cz, 2 * r + 5, len + 5, 0.36);
    // hay storage: two layers of round bales
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 6; iz++) inst.bales.push({ x: 42.2 + ix * 1.9, y: 0, z: -33.6 + iz * 1.9, ry: PI / 2 });
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 5; iz++) inst.bales.push({ x: 43.15 + ix * 1.9, y: 1.32, z: -32.65 + iz * 1.9, ry: PI / 2 });
    shadowRect(45.5, -28.8, 9.5, 13.5, 0.2);
  }

  // ---------------------------------------------------------- office (контора)
  {
    const { x0, x1, z0, z1, doorX } = OF;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0, H = 3.6, rise = 1.9;
    k.rbox(W + 0.3, 0.5, D + 0.3, T.plinth, { x: cx, z: cz, r: 0.1 });
    k.rbox(W, H - 0.4, D, T.wallWarm, { x: cx, y: 0.4, z: cz, r: 0.1 });
    const wxs = doorX - x0 < W / 2 ? [x0 + 6.4, x0 + 8.6] : [x0 + 1.3, x0 + 6.4, x0 + 8.6];
    for (const wx of wxs) {
      k.rbox(1.3, 1.3, 0.1, T.glass, { x: wx, y: 1.45, z: z1 + 0.02, r: 0.04, mat: 'glass' });
      k.rbox(1.5, 0.12, 0.22, T.wall, { x: wx, y: 1.36, z: z1 + 0.06 });
    }
    for (const wz of [z0 + 1.8, z0 + 5.2]) {
      k.rbox(0.1, 1.3, 1.3, T.glass, { x: x1 + 0.02, y: 1.45, z: wz, r: 0.04, mat: 'glass' });
      k.rbox(0.22, 0.12, 1.5, T.wall, { x: x1 + 0.06, y: 1.36, z: wz });
    }
    k.rbox(1.55, 2.55, 0.08, T.green, { x: doorX, y: 0.42, z: z1 + 0.01, r: 0.03 });
    k.rbox(2.4, 0.3, 1.3, T.plinth, { x: doorX, z: z1 + 0.6, r: 0.08 });
    k.rbox(2.1, 0.14, 1.3, T.green, { x: doorX, y: 3.05, z: z1 + 0.6, r: 0.05 });
    const a = Math.atan2(rise, D / 2), slab = (D / 2 + 0.7) / Math.cos(a);
    for (const s of [1, -1]) {
      k.push({ x: cx, y: H + rise + 0.05, z: cz, rx: s * a });
      k.rbox(W + 1.2, 0.3, slab, T.roof, { y: -0.3, z: s * slab / 2, r: 0.1, mat: 'ribbed' });
      if (snow) { const sl = slab * 0.56; k.rbox(W - 0.6, 0.22, sl, SNOW, { y: 0.02, z: s * (sl / 2 - 0.1), r: 0.14 }); }
      k.pop();
    }
    for (const gx of [x0 + 0.15, x1 - 0.15]) k.prism([[-D / 2, 0], [D / 2, 0], [0, rise]], 0.3, T.wallWarm, { x: gx, y: H, z: cz, ry: PI / 2 });
    k.rbox(0.7, 1.7, 0.7, '#B98A6E', { x: x0 + 7.5, y: 4.6, z: z0 + 2.6, r: 0.08 });
    if (snow) k.rbox(0.8, 0.18, 0.8, SNOW, { x: x0 + 7.5, y: 6.3, z: z0 + 2.6, r: 0.08 });
    shadowRect(cx, cz, W + 4, D + 4, 0.34);
    // ZKTeco terminal (wall-mounted) next to the door
    k.rbox(0.46, 0.68, 0.1, '#1E2329', { x: doorX + 1.25, y: 1.25, z: z1 + 0.06, r: 0.05 });
    anchors.officeTerm = V(doorX + 1.25, 1.6, z1 + 0.13);
    parts.officeScreen = screenMesh(0.34, 0.42, anchors.officeTerm, 0);
  }

  // ---------------------------------------------------------- checkpoint (проходная) + processor
  {
    // booth
    k.rbox(5.2, 0.4, 7.2, T.plinth, { x: 4.5, z: 36, r: 0.08 });
    k.rbox(5, 2.95, 7, T.wall, { x: 4.5, y: 0.35, z: 36, r: 0.12 });
    k.rbox(2.4, 1.2, 0.1, T.glass, { x: 3.4, y: 1.45, z: 39.52, r: 0.04, mat: 'glass' });
    k.rbox(0.1, 1.2, 1.8, T.glass, { x: 7.02, y: 1.45, z: 38.2, r: 0.04, mat: 'glass' });
    k.rbox(0.1, 2.25, 1.0, T.greenDark, { x: 7.03, y: 0.42, z: 33.9, r: 0.04 });
    k.rbox(5.8, 0.42, 7.8, T.green, { x: 4.5, y: 3.25, z: 36, r: 0.12 });
    if (snow) k.rbox(4.1, 0.22, 6.0, SNOW, { x: 4.5, y: 3.65, z: 36, r: 0.1 });
    k.rbox(4.4, 0.5, 0.1, T.green, { x: 4.5, y: 2.55, z: 39.55, r: 0.04 });
    shadowRect(4.5, 36, 7.5, 9.5, 0.34);
    // glass canopy over the pedestrian lane
    for (const [px, pz] of [[7.25, 32.75], [12.75, 32.75], [7.25, 39.25], [12.75, 39.25]]) k.rbox(0.24, 3.3, 0.24, T.green, { x: px, z: pz, r: 0.06 });
    for (const pz of [32.75, 39.25]) k.rbox(5.9, 0.22, 0.24, T.green, { x: 10, y: 3.3, z: pz, r: 0.05 });
    for (const px of [7.25, 12.75]) k.rbox(0.24, 0.22, 6.7, T.green, { x: px, y: 3.3, z: 36, r: 0.05 });
    k.rbox(5.8, 0.08, 6.8, '#CFEBDD', { x: 10, y: 3.46, z: 36, mat: 'canopy' });
    // railings left/right of the turnstile
    for (const [a, b] of [[7.3, 8.75], [11.05, 12.7]]) {
      for (const ry of [0.55, 1.05]) k.beam([a, ry, 36], [b, ry, 36], 0.045, T.steel, { mat: 'metal' });
      k.cyl(0.05, 0.05, 1.08, T.steel, { x: a, z: 36, seg: 6, mat: 'metal' });
      k.cyl(0.05, 0.05, 1.08, T.steel, { x: b, z: 36, seg: 6, mat: 'metal' });
    }
    // turnstile cabinet
    k.rbox(0.42, 1.0, 1.05, T.steelLight, { x: 10.85, z: 36, r: 0.08, mat: 'metal' });
    k.rbox(0.46, 0.06, 1.09, '#3A4450', { x: 10.85, y: 1.0, z: 36, r: 0.02 });
    // face terminals on stands: entry (faces +z, outside), exit (faces -z, inside)
    for (const [tz, dir] of [[37.15, 1], [34.85, -1]]) {
      k.cyl(0.06, 0.07, 1.25, '#59626D', { x: 10.85, z: tz, seg: 8 });
      k.rbox(0.48, 0.74, 0.12, '#1F242B', { x: 10.85, y: 1.2, z: tz, r: 0.05 });
    }
    anchors.cpIn = V(10.85, 1.6, 37.22);
    anchors.cpOut = V(10.85, 1.6, 34.78);
    parts.cpInScreen = screenMesh(0.36, 0.46, anchors.cpIn, 0);
    parts.cpOutScreen = screenMesh(0.36, 0.46, anchors.cpOut, PI);
    anchors.turnstile = V(10.62, 1.0, 36);
    // processor cabinet on the booth wall (faces the road)
    k.rbox(0.95, 1.15, 0.38, '#D2D8DF', { x: 5.9, y: 1.0, z: 39.68, r: 0.06 });
    k.rbox(0.8, 0.95, 0.04, '#B9C1CA', { x: 5.9, y: 1.1, z: 39.88, r: 0.02 });
    k.rbox(0.36, 0.08, 0.05, '#2E3742', { x: 5.78, y: 1.75, z: 39.9 });
    k.box(0.08, 1.0, 0.08, '#9AA4AE', { x: 6.25, y: 0, z: 39.62 });
    k.cyl(0.03, 0.03, 0.7, '#59626D', { x: 5.6, y: 2.12, z: 39.66, seg: 5 });
    anchors.processor = V(6.15, 1.95, 39.92);
    anchors.processorTop = V(5.6, 2.8, 39.66);
    parts.led = ledMesh(anchors.processor);
  }

  // ---------------------------------------------------------- gate (въезд): pillars, barrier, ANPR, guard booth, sign
  {
    const gx = L.gateX;
    for (const px of [gx - 4.6, gx + 4.6]) {
      k.rbox(0.9, 2.8, 0.9, T.wall, { x: px, z: 36, r: 0.12 });
      k.rbox(1.06, 0.26, 1.06, T.green, { x: px, y: 2.8, z: 36, r: 0.08 });
      if (snow) k.rbox(0.92, 0.2, 0.92, SNOW, { x: px, y: 3.04, z: 36, r: 0.08 });
    }
    k.rbox(0.72, 1.15, 0.72, T.wall, { x: gx - 4.7, z: L.barrierZ, r: 0.1 });
    k.rbox(0.76, 0.2, 0.76, T.green, { x: gx - 4.7, y: 0.72, z: L.barrierZ, r: 0.05 });
    k.rbox(0.3, 0.9, 0.3, T.steel, { x: gx + 4.4, z: L.barrierZ, r: 0.06 }); // arm rest
    // ANPR cameras: one inside the gate reads incoming front plates, one outside reads leaving vehicles
    for (const [pz, dir] of [[31.4, 1], [41.4, -1]]) {
      k.cyl(0.13, 0.16, 4.7, T.pole, { x: gx + 4.9, z: pz, seg: 10 });
      k.rbox(2.9, 0.16, 0.16, T.pole, { x: gx + 3.5, y: 4.45, z: pz, r: 0.04 });
      const hz = pz + dir * 0.32;
      k.rbox(0.44, 0.38, 0.95, '#F4F6F8', { x: gx + 2.6, y: 3.92, z: hz, r: 0.1 });
      k.rbox(0.52, 0.06, 1.08, T.steelLight, { x: gx + 2.6, y: 4.32, z: hz + dir * 0.04 });
      k.cyl(0.13, 0.13, 0.06, '#1B2531', { x: gx + 2.6, y: 4.11, z: hz + dir * 0.49, rx: PI / 2, center: true, seg: 12 });
      k.rbox(0.3, 0.16, 0.2, '#E5484D', { x: gx + 2.6, y: 3.78, z: hz + dir * 0.46, r: 0.05, mat: 'glow' });
    }
    anchors.anprIn = V(gx + 2.6, 4.1, 32.2);
    anchors.anprOut = V(gx + 2.6, 4.1, 40.6);
    anchors.gateRing = V(gx, 0.1, L.barrierZ + 1.2);
    // guard booth
    const bx = -33, bz = 31.8;
    k.rbox(3.6, 0.35, 3.6, T.plinth, { x: bx, z: bz, r: 0.08 });
    k.rbox(3.4, 2.7, 3.4, T.wall, { x: bx, y: 0.3, z: bz, r: 0.12 });
    k.rbox(3.48, 0.95, 3.48, T.glass, { x: bx, y: 1.35, z: bz, r: 0.1, mat: 'glass' });
    k.rbox(0.1, 2.0, 0.9, T.greenDark, { x: bx + 1.73, y: 0.35, z: bz - 0.9, r: 0.03 });
    k.rbox(4.0, 0.36, 4.0, T.green, { x: bx, y: 2.95, z: bz, r: 0.12 });
    if (snow) k.rbox(2.6, 0.22, 2.6, SNOW, { x: bx, y: 3.29, z: bz, r: 0.1 });
    shadowRect(bx, bz, 5.4, 5.4, 0.3);
    // farm sign by the road
    for (const px of [-35.2, -28.8]) k.cyl(0.12, 0.12, 3.3, T.pole, { x: px, z: 47, seg: 8 });
    k.rbox(7.0, 1.55, 0.24, T.green, { x: -32, y: 1.75, z: 47, r: 0.12 });
    if (snow) k.rbox(6.8, 0.16, 0.36, SNOW, { x: -32, y: 3.3, z: 47, r: 0.07 });
    parts.sign = signMesh(T.sign, V(-32, 2.52, 47.13));
  }

  // ---------------------------------------------------------- props: feed bags on pallets, a container, grass
  for (const [px, pz, n] of [[37.2, -9.0, 3], [37.2, -6.6, 2], [23.0, -9.2, 3]]) {
    k.rbox(1.9, 0.18, 1.4, '#A7825F', { x: px, z: pz, r: 0.03 });
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      k.rbox(0.82, 0.38, 1.2, '#EFEDE6', { x: px - 0.43 + col * 0.86, y: 0.18 + row * 0.38, z: pz, r: 0.16 });
    }
    if (snow) k.rbox(1.6, 0.1, 1.2, SNOW, { x: px, y: 0.18 + Math.ceil(n / 2) * 0.38, z: pz, r: 0.05 });
  }
  if (!LS.sheep) {
    const cx = -44.5, cz = 22;
    k.rbox(2.6, 2.7, 6.2, '#3A6EA5', { x: cx, z: cz, r: 0.08, mat: 'ribbed' });
    k.rbox(2.7, 0.12, 6.3, '#2F5C8A', { x: cx, y: 2.68, z: cz, r: 0.04 });
    if (snow) k.rbox(2.0, 0.2, 5.4, SNOW, { x: cx, y: 2.78, z: cz, r: 0.09 });
    shadowRect(cx, cz, 4.4, 8, 0.3);
  } else {
    // small machinery hangar where the north farm has its office
    const hx = 32, hz0 = 15.2, hz1 = 24, hr = 3.4, hl = hz1 - hz0, hcz = (hz0 + hz1) / 2;
    k.rbox(2 * hr + 0.4, 0.35, hl + 0.4, T.plinth, { x: hx, z: hcz, r: 0.08 });
    k.cyl(hr, hr, hl, T.hangar, { x: hx, y: 0.3, z: hcz, rx: PI / 2, center: true, open: true, thetaStart: PI / 2, theta: PI, seg: 22, mat: 'ribbed' });
    for (const rz of [hz1 - 0.15, hcz, hz0 + 0.15]) k.torus(hr + 0.05, 0.08, T.green, { x: hx, y: 0.3, z: rz, arc: PI, ts: 4, rs: 24 });
    const semi = [];
    for (let i = 0; i <= 16; i++) { const an = PI - i / 16 * PI; semi.push([Math.cos(an) * (hr - 0.05), Math.sin(an) * (hr - 0.05)]); }
    k.prism(semi, 0.24, T.wall, { x: hx, y: 0.3, z: hz1 - 0.12 });
    k.prism(semi, 0.24, T.wall, { x: hx, y: 0.3, z: hz0 + 0.12 });
    k.rbox(3.6, 2.7, 0.1, '#DCE2E8', { x: hx, y: 0.32, z: hz1 + 0.02 });
    k.rbox(3.9, 0.22, 0.2, T.greenDark, { x: hx, y: 3.0, z: hz1 + 0.06, r: 0.05 });
    shadowRect(hx, hcz, 2 * hr + 3.5, hl + 3.5, 0.3);
    // арык along the back row of poplars and the west row
    k.flat(200, 1.1, '#A7BCC6', { x: 0, y: 0.03, z: -46.6 });
    k.flat(200, 0.35, '#8FA8B4', { x: 0, y: 0.034, z: -46.6 });
    k.flat(1.1, 92, '#A7BCC6', { x: -55.4, y: 0.03, z: -2 });
    k.flat(0.35, 92, '#8FA8B4', { x: -55.4, y: 0.034, z: -2 });
  }
  // fuel tank on a stand and a hay cart parked in the yard
  {
    const fx = 42.2, fz = 15.5;
    for (const dx of [-1.2, 1.2]) k.rbox(0.25, 1.0, 1.6, T.steel, { x: fx + dx, z: fz, r: 0.05 });
    k.cyl(0.95, 0.95, 3.6, '#E9C35B', { x: fx, y: 1.75, z: fz, rz: PI / 2, center: true, seg: 18 });
    k.cyl(0.97, 0.97, 0.35, T.green, { x: fx, y: 1.75, z: fz, rz: PI / 2, center: true, seg: 18 });
    if (snow) k.rbox(2.8, 0.14, 0.9, SNOW, { x: fx, y: 2.68, z: fz, r: 0.06 });
    shadowRect(fx, fz, 5, 3.4, 0.25);
    const hx = 24.5, hz = 14.2;
    k.rbox(4.2, 0.3, 2.2, '#A7825F', { x: hx, y: 0.75, z: hz, r: 0.05 });
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.15, 1.15]) k.cyl(0.42, 0.42, 0.24, '#2B3038', { x: hx + dx, y: 0.42, z: hz + dz, rx: PI / 2, center: true, seg: 12 });
    k.beam([hx + 2.1, 0.85, hz], [hx + 3.6, 0.55, hz], 0.07, '#5B636D');
    for (const dx of [-1.0, 1.0]) { k.push({ x: hx + dx, y: 1.05, z: hz, ry: 0 }); baleParts(k, T.hay, snow); k.pop(); }
    shadowRect(hx, hz, 6, 4, 0.22);
  }
  if (!snow) {
    for (const [gx, gz, gw, gd] of [[-40, -2, 14, 9], [40, 26, 10, 8], [-8, 22, 12, 7], [-44, 30, 9, 6], [20, 18, 6, 9]]) {
      k.rbox(gw, 0.04, gd, '#C9C58E', { x: gx, y: 0.012, z: gz, r: 1.8, seg: 2 });
    }
  }

  // ---------------------------------------------------------- parked staff cars
  T.cars.forEach((color, i) => {
    const cxp = [18.45, 22.35, 30.15, 34.05][i];
    k.push({ x: cxp, z: 44.9, ry: PI / 2 }); sedanParts(k, color, { snow }); k.pop();
  });

  // ---------------------------------------------------------- street lamps
  for (const [lx, lz, ry] of [[-14, 8.6, 0], [16, 8.6, 0], [38.5, 8.6, 0], [-29.2, 22, -PI / 2], [-29.2, 46.4, -PI / 2]]) {
    k.cyl(0.09, 0.12, 6.2, '#7D8894', { x: lx, z: lz, seg: 8 });
    k.push({ x: lx, y: 6.0, z: lz, ry });
    k.rbox(1.4, 0.1, 0.12, '#7D8894', { x: 0, z: -0.65, ry: PI / 2 });
    k.rbox(0.36, 0.16, 0.7, '#EEF1F4', { z: -1.35, r: 0.06 });
    k.pop();
  }

  // ---------------------------------------------------------- perimeter fence + cameras
  {
    const segs = [
      [[F.x0, F.z1], [L.gateX - 4.6, F.z1]],
      [[L.gateX + 4.6, F.z1], [2, F.z1]],
      [[12.75, F.z1], [F.x1, F.z1]],
      [[F.x1, F.z1], [F.x1, F.z0]],
      [[F.x1, F.z0], [F.x0, F.z0]],
      [[F.x0, F.z0], [F.x0, F.z1]],
    ];
    for (const [[ax, az], [bx, bz]] of segs) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3.2));
      const ang = Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      for (let i = 0; i <= n; i++) inst.posts.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n });
      k.box(len, 2.05, 0.04, T.panel, { x: mx, y: 0.2, z: mz, ry: -ang, mat: 'fence' });
      k.box(len, 0.09, 0.09, T.rail, { x: mx, y: 2.3, z: mz, ry: -ang });
      k.box(len, 0.07, 0.07, T.rail, { x: mx, y: 0.2, z: mz, ry: -ang });
      if (snow) {
        for (let d = 2; d < len - 2; d += 6 + R() * 6) {
          const t = d / len, side = R() < 0.5 ? -1 : 1;
          const nx = -Math.sin(ang) * side * 0.9, nz = Math.cos(ang) * side * 0.9;
          bank(ax + (bx - ax) * t + nx, az + (bz - az) * t + nz, 1.6 + R() * 2.2, 0.8 + R() * 0.3, 0.35 + R() * 0.25, -ang);
        }
      }
    }
    const cams = [
      { id: 'perimeter-cam', x: F.x1 + 0.9, z: 22, yaw: PI / 2 + 0.1, h: 5.2 },
      { x: F.x1 + 0.9, z: F.z0 - 0.9, yaw: -PI * 0.75, h: 5.0 },
      { x: F.x0 - 0.9, z: F.z0 - 0.9, yaw: -PI * 0.25, h: 5.0 },
    ];
    for (const c of cams) {
      k.cyl(0.12, 0.15, c.h, T.pole, { x: c.x, z: c.z, seg: 10 });
      k.push({ x: c.x, y: c.h - 0.35, z: c.z, ry: c.yaw });
      k.rbox(0.18, 0.4, 0.18, '#E9EDF1', { y: 0, r: 0.05 });
      k.cyl(0.17, 0.17, 0.75, '#F4F6F8', { x: 0.42, y: 0.12, rz: PI / 2, center: true, seg: 12 });
      k.rbox(0.9, 0.05, 0.44, T.steelLight, { x: 0.45, y: 0.33, r: 0.02 });
      k.cyl(0.12, 0.12, 0.04, '#17202A', { x: 0.81, y: 0.12, rz: PI / 2, center: true, seg: 12 });
      k.pop();
      if (c.id) {
        const fx = Math.cos(c.yaw), fz = -Math.sin(c.yaw);
        anchors.perimCam = V(c.x + fx * 0.8, c.h - 0.23, c.z + fz * 0.8);
      }
    }
    // the virtual line on the ground along the east fence + camera view wedge
    parts.vline = vlineMesh(F.x1 - 1.0, 16, -32);
    parts.wedge = wedgeMesh(V(F.x1 + 0.9, 0.05, 22), F.x1 - 7.5, F.x1 + 1.0, -32);
    anchors.vlineMid = V(F.x1 - 1.0, 0.1, -8);
  }

  // ---------------------------------------------------------- snow banks along roads (north)
  if (snow) {
    const along = (x0, z0, x1, z1, gap = 3.2) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      for (let d = 0; d < len; d += gap + R() * gap) {
        const t = d / len;
        bank(x0 + (x1 - x0) * t + (R() - 0.5) * 0.5, z0 + (z1 - z0) * t + (R() - 0.5) * 0.5, 1.4 + R() * 1.8, 0.9 + R() * 0.4, 0.4 + R() * 0.35, -ang);
      }
    };
    along(-140, 49.0, -36, 49.0); along(-20, 49.6, 22, 49.6); along(30, 49.6, 150, 49.6);
    along(-140, 59.1, 150, 59.1);
    along(-28.4, 37.5, -28.4, 48.5); along(-19.6, 39.5, -19.6, 48.5);
    along(-28.3, 8.5, -28.3, 34.5); along(-19.7, 8.5, -19.7, 34.5, 4);
    along(-19.5, 8.3, 40, 8.3, 4.5);
    along(36.6, 40.3, 36.6, 48.0);
    for (const [x, z, s] of [[-45, 28, 2.6], [-46, 20, 2.0], [46, 30, 2.4], [44, 23, 1.8], [-6, 26, 1.6], [24, 31, 2.2], [47, -6, 2.4], [-46, -2, 2.2]]) {
      bank(x, z, s * 1.4, s, 0.6 + s * 0.25, R() * PI);
    }
  }

  // ---------------------------------------------------------- trees
  if (T.tree === 'pine') {
    for (let x = -96; x <= 96; x += 5.2 + R() * 2) inst.pines.push({ x, z: -52 - R() * 3, s: 0.9 + R() * 0.45 });
    for (let x = -92; x <= 92; x += 6 + R() * 3) inst.pines.push({ x, z: -60 - R() * 4, s: 1.0 + R() * 0.5 });
    for (let i = 0; i < 18; i++) inst.pines.push({ x: -62 - R() * 26, z: -40 + R() * 75, s: 0.85 + R() * 0.5 });
    for (let i = 0; i < 12; i++) inst.pines.push({ x: 74 + R() * 24, z: -48 + R() * 52, s: 0.85 + R() * 0.5 });
    for (let x = -100; x <= 100; x += 8 + R() * 5) inst.pines.push({ x, z: 69 + R() * 5, s: 0.85 + R() * 0.4 });
    for (const [x, z] of [[40.5, 26.5], [22.5, 29], [-44, 4], [-40, 12], [-8, 28.5]]) inst.pines.push({ x, z, s: 0.8 + R() * 0.25 });
  } else {
    for (let x = -100; x <= 100; x += 6.2) inst.poplars.push({ x: x + R(), z: 62.5, s: 0.9 + R() * 0.3 });
    for (let x = -96; x <= 96; x += 5.6) inst.poplars.push({ x: x + R(), z: -50 - R() * 1.5, s: 0.95 + R() * 0.35 });
    for (let z = -44; z <= 30; z += 6.5) inst.poplars.push({ x: -58 - R(), z, s: 0.9 + R() * 0.3 });
    for (let i = 0; i < 14; i++) inst.rounds.push({ x: 66 + R() * 30, z: -45 + R() * 60, s: 0.8 + R() * 0.5 });
    for (let i = 0; i < 10; i++) inst.rounds.push({ x: -70 - R() * 25, z: -30 + R() * 60, s: 0.8 + R() * 0.5 });
    for (const [x, z] of [[40.5, 26.5], [22.5, 29], [-44, 4], [-47, 10], [-6, 31.5], [41, 18]]) inst.rounds.push({ x, z, s: 0.75 + R() * 0.25 });
  }

  // ---------------------------------------------------------- build static meshes
  const staticGroup = k.build(mats);
  staticGroup.name = 'static';
  group.add(staticGroup);
  group.add(aoMesh(ao, ctx.aoTexture));
  for (const m of buildInstances(inst, T, mats)) group.add(m);

  // cows in the pen (north) or sheep in the paddock (south): instanced, gently animated by the scene
  const herd = LS.sheep ? createSheep(mats, 9) : createCows(mats, 5);
  herd.userData.spots = LS.sheep
    ? [[-21.0, -7.2, 0.3], [-20.2, -3.0, 2.8], [-18.6, -6.6, -0.6], [-15.2, -2.6, 3.4], [-14.1, -7.4, 1.1], [-19.2, -2.0, 2.2], [-13.4, -4.7, 2.9], [-15.6, -7.6, 0.2], [-21.4, -4.9, 0.9]]
    : [[-31.5, -6.6, 0.4], [-27, -3.0, 2.6], [-23.6, -6.4, -0.3], [-16.5, -3.4, 3.4], [-14.2, -6.9, 1.2]];
  herd.userData.scale = LS.sheep ? 1.05 : 1.2;
  group.add(herd);
  parts.cows = herd;

  // ---------------------------------------------------------- animated fixtures
  parts.barrier = barrierArm(new THREE.Vector3(L.gateX - 4.7, 1.0, L.barrierZ));
  parts.turnstile = turnstile(anchors.turnstile);
  parts.feedDoor = rollDoor(new THREE.Vector3(L.feed.cx, 5.4, L.feed.z1 + 0.3), 6.6, 4.95, T);
  parts.officeDoor = hingedDoor(new THREE.Vector3(OF.doorX - 0.62, 0.45, OF.z1 + 0.06), 1.24, 2.3, T);
  for (const key of ['barrier', 'turnstile', 'feedDoor', 'officeDoor', 'officeScreen', 'cpInScreen', 'cpOutScreen', 'barnScreen', 'led', 'vline', 'wedge', 'sign']) {
    if (parts[key]) group.add(parts[key].object || parts[key]);
  }
  anchors.feedTerm = V(34.3, 1.6, -11.18);
  {
    const fk = new Kit();
    fk.cyl(0.06, 0.07, 1.25, '#59626D', { x: 34.3, z: -11.3, seg: 8 });
    fk.rbox(0.48, 0.74, 0.12, '#1F242B', { x: 34.3, y: 1.2, z: -11.3, r: 0.05 });
    group.add(fk.build(mats));
    parts.feedScreen = screenMesh(0.36, 0.46, anchors.feedTerm, 0);
    group.add(parts.feedScreen.object);
  }
  finishFixtures({ parts }, mats);

  // cloud (Облако в Казахстане) and the uplink anchors
  // behind the milk block, above the back tree line: on the home view it floats in the free sky
  // to the right of the barn instead of sitting on a roof
  anchors.cloud = V(10, 13, -36);
  anchors.cloudBottom = V(10.2, 10, -35.4);
  const ck = new Kit();
  for (const [x, y, z, r] of [[0, 0, 0, 2.6], [2.6, -0.5, 0.3, 2.0], [-2.6, -0.6, 0.2, 1.9], [1.0, 1.3, -0.4, 2.0], [-1.2, 0.9, 0.6, 1.7], [4.3, -1.0, 0, 1.3], [-4.2, -1.1, 0.1, 1.2]]) {
    ck.sphere(r, '#EAF6EF', { x, y, z, mat: 'cloud', ws: 18, hs: 12 });
  }
  ck.rbox(10.5, 1.4, 3.6, '#CFE3D8', { y: -2.1, r: 0.7, seg: 2, mat: 'cloud' });
  // server badge facing the default camera
  ck.push({ y: -0.4, ry: 0.74 });
  ck.rbox(2.3, 2.5, 0.5, '#FFFFFF', { y: -1.25, z: 2.55, r: 0.22, mat: 'cloud' });
  for (let i = 0; i < 3; i++) {
    ck.rbox(1.7, 0.5, 0.12, '#00AFCA', { y: -0.95 + i * 0.66, z: 2.82, r: 0.08 });
    ck.sphere(0.08, '#D9FBFF', { x: 0.55, y: -0.7 + i * 0.66, z: 2.9, mat: 'glow', ws: 6, hs: 4 });
  }
  ck.pop();
  ck.torus(3.6, 0.07, '#00AFCA', { y: -2.75, rx: PI / 2, mat: 'glow', ts: 4, rs: 48 });
  const cloud = ck.build(mats, { cast: false, receive: false });
  cloud.position.copy(anchors.cloud);
  cloud.scale.setScalar(1.2);
  cloud.name = 'cloud';
  group.add(cloud);
  parts.cloud = cloud;

  // ---------------------------------------------------------- pickable objects
  const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1));
  objects.push(
    { id: 'gate', kind: 'gate', name: 'Въезд', subtitle: 'Камера номеров DS-TCG406-E и шлагбаум',
      box: box(-35, 0, 29.8, -18.6, 4.8, 42.2), pin: V(-24, 6.4, 37.6), icon: 'gate', tour: [-22, 38, 70] },
    { id: 'checkpoint', kind: 'checkpoint', name: 'Проходная', subtitle: 'Турникет и 2 терминала Face ID DS-K1T343MX',
      box: box(2, 0, 32.4, 13, 3.9, 39.9), pin: V(9.5, 6.6, 36), icon: 'checkpoint', tour: [8, 36, 62] },
    { id: 'barn', kind: 'barn', name: 'Коровник', subtitle: 'Терминал Face ID DS-K1T321MWX у молочного блока',
      box: box(-36.2, 0, -24.2, 15.2, 7.5, -9.8), pin: V(-14, 10.6, -17), icon: 'barn', tour: [-3, -8, 70] },
    { id: 'feed', kind: 'feed', name: 'Склад кормов', subtitle: 'Терминал Face ID DS-K1T320MFWX',
      box: box(21.8, 0, -34.2, 38.2, 8.5, -11.2), pin: V(30, 11.4, -21), icon: 'feed', tour: [31, -12, 70] },
    { id: 'office', kind: 'office', name: 'Контора', subtitle: 'Терминал ZKTeco MB10-VL',
      box: box(OF.x0 - 0.2, 0, OF.z0 - 0.2, OF.x1 + 0.2, 6.4, OF.z1 + 1.2), pin: V((OF.x0 + OF.x1) / 2, 9.2, (OF.z0 + OF.z1) / 2), icon: 'office', tour: [OF.doorX + 1, OF.z1 + 1.5, 62] },
    { id: 'perimeter', kind: 'perimeter', name: 'Периметр', subtitle: 'Забор и камеры DS-2CD1043G2-LIU',
      box: box(F.x0, 0, F.z0, F.x1, 2.5, F.z1), pin: null, icon: 'camera',
      proxies: [box(F.x0 - 0.6, 0, F.z1 - 0.6, F.x1 + 0.6, 2.6, F.z1 + 0.6), box(F.x0 - 0.6, 0, F.z0 - 0.6, F.x1 + 0.6, 2.6, F.z0 + 0.6),
        box(F.x0 - 0.6, 0, F.z0, F.x0 + 0.6, 2.6, F.z1), box(F.x1 - 0.6, 0, F.z0, F.x1 + 0.6, 2.6, F.z1)] },
    { id: 'perimeter-cam', kind: 'perimeter', name: 'Камера периметра', subtitle: 'DS-2CD1043G2-LIU · контроль линии',
      box: box(F.x1 + 0.2, 0, 21, F.x1 + 2.2, 5.6, 23), pin: V(F.x1 + 0.9, 8.0, 22), icon: 'camera',
      // when selected (or shown by the tour) the camera frames the pole together with the line it watches
      frameBox: box(F.x1 - 12, 0, -12, F.x1 + 2.2, 6, 25), tour: [48, 3, 92] },
    { id: 'processor', kind: 'processor', name: 'Процессор', subtitle: 'Мини-ПК на объекте · связь с облаком',
      box: box(5.3, 0.9, 39.4, 6.5, 2.3, 40.1), pin: V(5.9, 5.0, 39.8), icon: 'processor', pinSmall: true,
      proxies: [box(4.6, 0.4, 39.0, 7.2, 2.9, 40.8)], tour: [6, 39, 56] },
  );
  for (const o of objects) o.site = siteId;

  return { id: siteId, theme: T, group, anchors, parts, objects };
}

// ---------------------------------------------------------------- fixture builders
function screenMesh(w, h, pos, ry) {
  const mat = new THREE.MeshBasicMaterial({ color: '#3D7FA3', toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.copy(pos);
  mesh.rotation.y = ry;
  mesh.userData.idle = new THREE.Color('#3D7FA3');
  return { object: mesh, mesh, material: mat };
}

function ledMesh(pos) {
  const mat = new THREE.MeshBasicMaterial({ color: '#2BD67B', toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat);
  mesh.position.copy(pos);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({
    color: '#2BD67B', transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    map: haloTexture(),
  }));
  halo.position.set(0, 0, 0.04);
  mesh.add(halo);
  return { object: mesh, mesh, material: mat, halo };
}

let _halo = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _halo = new THREE.CanvasTexture(c);
  return _halo;
}

function vlineMesh(x, z0, z1) {
  const len = Math.abs(z1 - z0);
  const geo = new THREE.PlaneGeometry(0.42, len, 1, 1);
  geo.rotateX(-PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color('#2BD67B') }, uTime: { value: 0 }, uAlpha: { value: 0.75 }, uLen: { value: len } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uAlpha; uniform float uLen; varying vec2 vUv;
      void main(){ float d = step(0.45, fract(vUv.y * uLen / 1.6 - uTime * 0.6)); float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
      gl_FragColor = vec4(uColor, uAlpha * d * edge); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.07, (z0 + z1) / 2);
  mesh.renderOrder = 3;
  return { object: mesh, mesh, material: mat };
}

function wedgeMesh(apex, xa, xb, zEnd) {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([apex.x, 0, apex.z, xa, 0, zEnd, xb, 0, zEnd]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.5, 0, 0, 1, 1, 1]), 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#2BD67B') }, uAlpha: { value: 0.16 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; void main(){ gl_FragColor = vec4(uColor, uAlpha * (1.0 - vUv.y * 0.85)); }',
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.06;
  mesh.renderOrder = 2;
  return { object: mesh, mesh, material: mat };
}

function signMesh(text, pos) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = ACCENT; g.fillRect(0, 0, 512, 112);
  g.fillStyle = '#FFFFFF';
  g.font = '600 46px "Unbounded", "Onest", "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 1.38), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.position.copy(pos);
  mesh.userData.redraw = () => {
    g.fillStyle = ACCENT; g.fillRect(0, 0, 512, 112); g.fillStyle = '#FFFFFF'; g.fillText(text, 256, 60); tex.needsUpdate = true;
  };
  return { object: mesh, mesh };
}

function barrierArm(pivot) {
  const k = new Kit();
  const L = 8.9, n = 8;
  for (let i = 0; i < n; i++) {
    const seg = L / n;
    k.rbox(seg, 0.2, 0.16, i % 2 ? '#F4F6F8' : '#E5484D', { x: 0.35 + seg * (i + 0.5), y: -0.1, r: 0.04 });
  }
  k.cyl(0.24, 0.24, 0.3, '#EEF1F4', { rx: PI / 2, center: true, seg: 14 });
  k.sphere(0.09, '#FF6B6B', { x: L + 0.35, y: 0.0, mat: 'glow', ws: 8, hs: 6 });
  const g = new THREE.Group();
  g.position.copy(pivot);
  g.userData.kit = k;
  return g;
}

function turnstile(pos) {
  const k = new Kit();
  k.cyl(0.11, 0.11, 0.2, '#C7CED6', { center: true, seg: 10, mat: 'metal' });
  for (const deg of [60, 180, 300]) {
    const a = deg * PI / 180;
    k.beam([0, 0, 0], [Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05], 0.045, '#D9DEE4', { mat: 'metal', seg: 6 });
  }
  const tilt = new THREE.Group();
  tilt.position.copy(pos);
  tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.5, 0.866, 0).normalize());
  const spin = new THREE.Group();
  tilt.add(spin);
  tilt.userData.kit = k;
  tilt.userData.spin = spin;
  return tilt;
}

function rollDoor(top, w, h, T) {
  const k = new Kit();
  k.box(w, h, 0.14, '#DCE2E8', { y: -h });
  for (let y = 0.45; y < h; y += 0.45) k.box(w - 0.1, 0.05, 0.03, '#C3CBD4', { y: -y, z: 0.08 });
  k.box(w, 0.2, 0.18, T.greenDark, { y: -h });
  const g = new THREE.Group();
  g.position.copy(top);
  g.userData.kit = k;
  g.userData.h = h;
  return g;
}

function hingedDoor(hinge, w, h, T) {
  const k = new Kit();
  k.rbox(w, h, 0.1, '#B5865F', { x: w / 2, r: 0.03 });
  k.rbox(w - 0.36, h * 0.38, 0.04, T.glass, { x: w / 2, y: h * 0.52, z: 0.05, mat: 'glass' });
  k.sphere(0.06, '#9AA4AE', { x: w - 0.15, y: 1.05, z: 0.08, ws: 8, hs: 6 });
  const g = new THREE.Group();
  g.position.copy(hinge);
  g.userData.kit = k;
  return g;
}

// Builds the meshes inside the fixture groups (needs materials).
export function finishFixtures(site, mats) {
  const { parts } = site;
  for (const key of ['barrier', 'turnstile', 'feedDoor', 'officeDoor']) {
    const g = parts[key];
    const kit = g.userData.kit;
    const built = kit.build(mats, { receive: false });
    if (key === 'turnstile') g.userData.spin.add(built); else g.add(built);
    delete g.userData.kit;
  }
}

// ---------------------------------------------------------------- instanced vegetation & props
function buildInstances(inst, T, mats) {
  const out = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const R = rng(T.id === 'north' ? 77 : 91);
  const make = (geo, list, fn, { cast = true, color = true } = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mats.matte, list.length);
    const c = new THREE.Color();
    list.forEach((it, i) => {
      fn(it, p, e, s);
      q.setFromEuler(e);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      if (color) { const v = 0.9 + R() * 0.14; c.setRGB(v, v, v); mesh.setColorAt(i, c); }
    });
    mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    out.push(mesh);
  };
  const tree = (it, P, E, S) => { P.set(it.x, 0, it.z); E.set(0, R() * PI * 2, 0); S.setScalar(it.s); };
  if (inst.pines.length) {
    const k = new Kit();
    k.cyl(0.24, 0.32, 1.3, T.trunk, { seg: 7 });
    const tiers = [[2.1, 2.7, 0.9], [1.65, 2.4, 2.25], [1.15, 2.1, 3.5]];
    tiers.forEach(([r, h, y], i) => {
      k.cone(r, h, i % 2 ? T.pine2 : T.pine, { y, seg: 9 });
      if (T.snow) k.cone(r * 0.6, h * 0.58, T.snowC, { y: y + h * 0.44 + 0.04, seg: 9 });
    });
    make(k.geometry('matte'), inst.pines, tree);
  }
  if (inst.poplars.length) {
    const k = new Kit();
    k.cyl(0.18, 0.26, 1.8, T.trunk, { seg: 7 });
    k.sphere(1.25, T.poplar, { y: 4.5, sy: 2.7, ws: 10, hs: 9 });
    k.sphere(0.9, T.poplar2, { y: 3.0, x: 0.3, sy: 1.6, ws: 8, hs: 6 });
    make(k.geometry('matte'), inst.poplars, tree);
  }
  if (inst.rounds.length) {
    const k = new Kit();
    k.cyl(0.2, 0.28, 1.6, T.trunk, { seg: 7 });
    k.sphere(2.0, T.round, { y: 3.3, sy: 0.92, ws: 12, hs: 9 });
    k.sphere(1.3, T.round, { y: 3.8, x: 0.9, z: 0.4, ws: 10, hs: 8 });
    make(k.geometry('matte'), inst.rounds, tree);
  }
  if (inst.bales.length) {
    const k = new Kit(); baleParts(k, T.hay, T.snow);
    make(k.geometry('matte'), inst.bales, (it, P, E, S) => { P.set(it.x, it.y, it.z); E.set(0, it.ry, 0); S.setScalar(1); });
  }
  if (inst.posts.length) {
    const k = new Kit(); k.cyl(0.08, 0.09, 2.5, '#8A95A2', { seg: 6 });
    if (T.snow) k.cyl(0.1, 0.1, 0.08, T.snowC, { y: 2.5, seg: 6 });
    make(k.geometry('matte'), inst.posts, (it, P, E, S) => { P.set(it.x, 0, it.z); E.set(0, 0, 0); S.setScalar(1); }, { color: false });
  }
  if (inst.banks.length) {
    const k = new Kit(); k.sphere(1, T.snowC, { phi: PI / 2, ws: 12, hs: 5 });
    make(k.geometry('matte'), inst.banks, (it, P, E, S) => { P.set(it.x, -0.05, it.z); E.set(0, it.ry, 0); S.set(it.sx, it.sy, it.sz); }, { cast: false });
  }
  return out;
}

function aoMesh(list, tex) {
  const geos = list.map(({ x, z, w, d, a }) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-PI / 2);
    g.translate(x, 0.022, z);
    const n = g.attributes.position.count;
    const al = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { al[i * 4 + 3] = a; }
    g.setAttribute('color', new THREE.BufferAttribute(al, 4));
    return g;
  });
  const merged = mergeAll(geos);
  const mat = new THREE.MeshBasicMaterial({
    color: '#1B2A3A', alphaMap: tex, transparent: true, depthWrite: false, vertexColors: true, toneMapped: false,
  });
  // vertex colour alpha drives intensity; rgb are zero but the base colour is multiplied, so lift rgb to 1
  const c = merged.attributes.color;
  for (let i = 0; i < c.count; i++) { c.setX(i, 1); c.setY(i, 1); c.setZ(i, 1); }
  const mesh = new THREE.Mesh(merged, mat);
  mesh.renderOrder = 1;
  mesh.name = 'ao';
  return mesh;
}

function mergeAll(geos) {
  let count = 0;
  for (const g of geos) count += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 4);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    col.set(g.attributes.color.array, o * 4);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 4));
  out.computeBoundingSphere();
  return out;
}

export function makeAoTexture() { return softShadowTexture(); }
