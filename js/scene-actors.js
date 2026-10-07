// QazTracker Vision — 3D farm scene: vehicles, people and animals.
// Every model faces +X (forward) and stands on y = 0 with its footprint centred on the origin.
import * as THREE from 'three';
import { Kit } from './scene-kit.js';

const TIRE = '#2B3038';
const HUB = '#CDD4DC';
const GLASS = '#34495E';
const HEAD = '#FFF3D1';
const TAIL = '#E5484D';
const CHASSIS = '#3B424C';
const WHITE = '#F5F7F9';
const GREEN = '#23885A';
const SNOW = '#F8FAFD';

function wheel(k, x, z, r, w, hub = HUB) {
  k.cyl(r, r, w, TIRE, { x, y: r, z, rx: Math.PI / 2, center: true, seg: 16 });
  k.cyl(r * 0.52, r * 0.52, w + 0.05, hub, { x, y: r, z, rx: Math.PI / 2, center: true, seg: 10 });
}

function lights(k, x, y, zs, len = 0.4, tail = false) {
  for (const z of zs) k.rbox(0.08, 0.16, len, tail ? TAIL : HEAD, { x, y, z, r: 0.03, mat: 'glow' });
}

// ---------------------------------------------------------------- vehicles
export function sedanParts(k, color, { snow = false } = {}) {
  k.rbox(4.4, 0.74, 1.84, color, { y: 0.3, r: 0.3, seg: 2 });
  k.rbox(2.3, 0.62, 1.64, GLASS, { x: -0.25, y: 0.96, r: 0.24, seg: 2, mat: 'glass' });
  k.rbox(2.05, 0.12, 1.56, color, { x: -0.3, y: 1.5, r: 0.05 });
  k.rbox(0.06, 0.18, 0.56, WHITE, { x: 2.21, y: 0.42, r: 0.02 });
  lights(k, 2.18, 0.74, [-0.6, 0.6], 0.36);
  lights(k, -2.18, 0.76, [-0.62, 0.62], 0.34, true);
  for (const x of [1.38, -1.32]) for (const z of [-0.88, 0.88]) wheel(k, x, z, 0.35, 0.26);
  if (snow) {
    k.rbox(1.85, 0.16, 1.42, SNOW, { x: -0.3, y: 1.6, r: 0.08 });
    k.rbox(1.05, 0.1, 1.5, SNOW, { x: 1.55, y: 1.02, r: 0.05 });
  }
}

export function milkTruckParts(k) {
  k.rbox(9.2, 0.45, 1.9, CHASSIS, { y: 0.6, r: 0.1 });
  // cab
  k.rbox(2.25, 2.4, 2.45, GREEN, { x: 3.62, y: 0.82, r: 0.4, seg: 2 });
  k.rbox(2.27, 0.2, 2.47, WHITE, { x: 3.62, y: 1.5, r: 0.08 });
  k.rbox(0.12, 1.0, 2.1, GLASS, { x: 4.7, y: 2.0, r: 0.05, mat: 'glass' });
  k.rbox(0.95, 0.78, 2.5, GLASS, { x: 3.9, y: 2.08, r: 0.06, mat: 'glass' });
  k.rbox(1.9, 0.28, 2.32, WHITE, { x: 3.45, y: 3.18, r: 0.12 });
  k.rbox(0.12, 0.62, 1.5, '#1C2229', { x: 4.74, y: 1.05, r: 0.05 });
  k.rbox(0.34, 0.32, 2.5, '#D3D9E0', { x: 4.72, y: 0.6, r: 0.1 });
  k.rbox(0.05, 0.2, 0.62, WHITE, { x: 4.9, y: 0.66, r: 0.02 });
  lights(k, 4.82, 1.0, [-0.92, 0.92], 0.42);
  // tank
  k.cyl(1.25, 1.25, 5.9, WHITE, { x: -1.15, y: 2.25, rz: Math.PI / 2, center: true, seg: 26 });
  k.sphere(1.25, WHITE, { x: 1.8, y: 2.25, sx: 0.3, ws: 22, hs: 14 });
  k.sphere(1.25, WHITE, { x: -4.1, y: 2.25, sx: 0.3, ws: 22, hs: 14 });
  k.rbox(6.2, 0.44, 2.58, GREEN, { x: -1.15, y: 1.86, r: 0.14 });
  k.rbox(6.2, 0.1, 2.56, '#BFE3CF', { x: -1.15, y: 2.34, r: 0.04 });
  k.rbox(4.8, 0.08, 0.7, '#B7C0CA', { x: -1.2, y: 3.5 });
  k.cyl(0.32, 0.32, 0.18, '#D7DDE3', { x: -0.3, y: 3.4, seg: 14 });
  k.cyl(0.32, 0.32, 0.18, '#D7DDE3', { x: -2.4, y: 3.4, seg: 14 });
  k.rbox(0.5, 0.95, 1.8, '#C9D0D8', { x: -4.55, y: 0.75, r: 0.12 });
  lights(k, -4.82, 1.0, [-0.8, 0.8], 0.3, true);
  wheel(k, 3.35, -1.0, 0.56, 0.46); wheel(k, 3.35, 1.0, 0.56, 0.46);
  for (const x of [-2.5, -3.75]) { wheel(k, x, -1.0, 0.56, 0.46); wheel(k, x, 1.0, 0.56, 0.46); }
}

export function feedTruckParts(k) {
  const ORANGE = '#F08A2A', BODY = '#A9BCCF';
  k.rbox(8.0, 0.45, 1.9, CHASSIS, { y: 0.6, r: 0.1 });
  k.rbox(2.05, 2.45, 2.45, ORANGE, { x: 3.12, y: 0.82, r: 0.36, seg: 2 });
  k.rbox(2.07, 0.16, 2.47, WHITE, { x: 3.12, y: 1.45, r: 0.06 });
  k.rbox(0.12, 0.95, 2.1, GLASS, { x: 4.1, y: 2.05, r: 0.05, mat: 'glass' });
  k.rbox(0.9, 0.75, 2.5, GLASS, { x: 3.42, y: 2.12, r: 0.06, mat: 'glass' });
  k.rbox(0.12, 0.55, 1.4, '#22282F', { x: 4.14, y: 1.0, r: 0.04 });
  k.rbox(0.32, 0.32, 2.5, '#5B636D', { x: 4.14, y: 0.58, r: 0.1 });
  k.rbox(0.05, 0.2, 0.62, WHITE, { x: 4.32, y: 0.64, r: 0.02 });
  lights(k, 4.2, 0.98, [-0.9, 0.9], 0.4);
  // feed mixer body
  k.rbox(5.5, 1.95, 2.42, BODY, { x: -1.25, y: 1.0, r: 0.34, seg: 2 });
  k.rbox(5.6, 0.2, 2.5, '#7E96AE', { x: -1.25, y: 2.9, r: 0.08 });
  k.rbox(5.1, 0.12, 2.0, '#D8B85F', { x: -1.25, y: 2.93, r: 0.05 });
  k.rbox(5.52, 0.36, 2.44, GREEN, { x: -1.25, y: 1.45, r: 0.12 });
  k.beam([0.4, 1.7, 1.15], [1.0, 1.1, 1.85], 0.18, '#7E96AE');
  lights(k, -4.02, 0.98, [-0.8, 0.8], 0.3, true);
  wheel(k, 3.05, -1.0, 0.56, 0.46); wheel(k, 3.05, 1.0, 0.56, 0.46);
  for (const x of [-2.2, -3.45]) { wheel(k, x, -1.0, 0.56, 0.46); wheel(k, x, 1.0, 0.56, 0.46); }
}

export function tractorParts(k) {
  const RED = '#D8433A', RIM = '#E57A2C', LOADER = '#E5A532';
  k.rbox(3.2, 0.42, 1.0, CHASSIS, { x: 0.35, y: 0.5, r: 0.1 });
  k.rbox(2.0, 0.95, 1.02, RED, { x: 1.15, y: 0.82, r: 0.22, seg: 2 });
  k.rbox(0.08, 0.66, 0.8, '#2A3038', { x: 2.16, y: 0.94, r: 0.03 });
  lights(k, 2.18, 1.42, [-0.32, 0.32], 0.2);
  k.rbox(1.45, 1.8, 1.4, RED, { x: -0.72, y: 0.95, r: 0.14 });
  k.rbox(1.36, 1.2, 1.48, GLASS, { x: -0.72, y: 1.45, r: 0.06, mat: 'glass' });
  k.rbox(1.7, 0.16, 1.62, WHITE, { x: -0.72, y: 2.78, r: 0.07 });
  k.rbox(1.6, 0.12, 0.55, RED, { x: -0.9, y: 1.98, z: -1.05, r: 0.05 });
  k.rbox(1.6, 0.12, 0.55, RED, { x: -0.9, y: 1.98, z: 1.05, r: 0.05 });
  k.beam([1.55, 1.75, 0.32], [1.55, 2.85, 0.32], 0.06, '#3A414B');
  // front loader
  for (const z of [-0.62, 0.62]) k.beam([-0.25, 2.05, z], [2.75, 0.85, z], 0.09, LOADER, { seg: 6 });
  k.rbox(0.18, 0.95, 1.36, LOADER, { x: 2.82, y: 0.25, r: 0.05 });
  k.rbox(0.9, 0.07, 1.2, '#4A525C', { x: 3.25, y: 0.25 });
  // wheels
  wheel(k, -0.9, -1.0, 0.96, 0.56, RIM); wheel(k, -0.9, 1.0, 0.96, 0.56, RIM);
  wheel(k, 1.6, -0.8, 0.52, 0.32, RIM); wheel(k, 1.6, 0.8, 0.52, 0.32, RIM);
}

export function baleParts(k, color = '#D9B864', snow = false) {
  k.cyl(0.74, 0.74, 1.3, color, { rx: Math.PI / 2, center: true, y: 0.74, seg: 18 });
  k.cyl(0.5, 0.5, 1.32, '#C9A54E', { rx: Math.PI / 2, center: true, y: 0.74, seg: 14 });
  if (snow) k.rbox(0.9, 0.14, 1.22, SNOW, { y: 1.42, r: 0.07 });
}

// ---------------------------------------------------------------- people & animals
export function personParts(k, { jacket, pants = '#2A2F38', hat = '#E5E8EC', skin = '#E3BC97', cap = false }) {
  for (const z of [-0.13, 0.13]) {
    k.capsule(0.12, 0.42, pants, { z });
    k.rbox(0.32, 0.14, 0.2, '#262A30', { x: 0.04, z, r: 0.06 });
  }
  k.capsule(0.3, 0.44, jacket, { y: 0.5 });
  k.cyl(0.2, 0.25, 0.14, '#EDEFF2', { y: 1.43, seg: 12 });
  for (const s of [-1, 1]) k.capsule(0.095, 0.44, jacket, { y: 0.74, z: s * 0.36, rx: s * 0.1 });
  k.sphere(0.2, skin, { y: 1.68, ws: 14, hs: 10 });
  if (cap) {
    k.cyl(0.215, 0.215, 0.14, hat, { y: 1.76, seg: 14 });
    k.rbox(0.24, 0.04, 0.3, hat, { x: 0.18, y: 1.78, r: 0.02 });
  } else {
    k.sphere(0.216, hat, { y: 1.72, phi: Math.PI / 2, ws: 14, hs: 6 });
    k.cyl(0.222, 0.222, 0.08, hat, { y: 1.68, seg: 14 });
    k.sphere(0.07, '#FFFFFF', { y: 1.96, ws: 8, hs: 6 });
  }
}

export function cowParts(k) {
  const B = '#8C4A2C', W = '#F3EEE6';
  k.rbox(1.9, 0.92, 0.96, B, { y: 0.7, r: 0.32, seg: 2 });
  k.rbox(1.15, 0.2, 0.92, W, { y: 0.66, r: 0.1 });
  k.rbox(0.56, 0.5, 0.48, W, { x: 1.14, y: 1.12, r: 0.17 });
  k.rbox(0.2, 0.26, 0.36, '#D8B4A2', { x: 1.43, y: 1.1, r: 0.08 });
  for (const s of [-1, 1]) {
    k.beam([1.08, 1.58, s * 0.16], [1.02, 1.76, s * 0.34], 0.04, '#E9E1CD');
    k.rbox(0.08, 0.12, 0.22, B, { x: 1.04, y: 1.45, z: s * 0.32, r: 0.03 });
  }
  for (const x of [-0.66, 0.66]) for (const z of [-0.3, 0.3]) {
    k.rbox(0.2, 0.74, 0.2, B, { x, z, r: 0.06 });
    k.rbox(0.22, 0.12, 0.22, '#3B2E28', { x, z, r: 0.04 });
  }
  k.beam([-0.95, 1.4, 0], [-1.05, 0.72, 0], 0.04, B);
}

export function sheepParts(k) {
  const WOOL = '#F2EDE3', HEAD = '#3B3430';
  k.rbox(1.12, 0.66, 0.74, WOOL, { y: 0.4, r: 0.3, seg: 2 });
  k.rbox(0.5, 0.42, 0.62, WOOL, { x: 0.38, y: 0.72, r: 0.2, seg: 2 });
  k.rbox(0.34, 0.36, 0.3, HEAD, { x: 0.68, y: 0.78, r: 0.11 });
  for (const s of [-1, 1]) k.rbox(0.08, 0.06, 0.2, HEAD, { x: 0.6, y: 0.98, z: s * 0.2, r: 0.02 });
  for (const x of [-0.36, 0.36]) for (const z of [-0.2, 0.2]) k.rbox(0.1, 0.44, 0.1, HEAD, { x, z, r: 0.03 });
}

export function foxParts(k) {
  const O = '#E27838', W = '#F6EFE6', D = '#3A2F2A';
  k.rbox(0.9, 0.38, 0.34, O, { y: 0.34, r: 0.15 });
  k.rbox(0.36, 0.3, 0.3, O, { x: 0.55, y: 0.55, r: 0.1 });
  k.rbox(0.22, 0.14, 0.16, W, { x: 0.76, y: 0.55, r: 0.05 });
  k.sphere(0.035, D, { x: 0.88, y: 0.62, ws: 6, hs: 4 });
  for (const s of [-1, 1]) k.cone(0.07, 0.17, O, { x: 0.52, y: 0.82, z: s * 0.09, seg: 4 });
  for (const x of [-0.3, 0.3]) for (const z of [-0.11, 0.11]) k.rbox(0.08, 0.36, 0.08, D, { x, z, r: 0.03 });
  k.capsule(0.12, 0.42, O, { x: -0.72, y: 0.46, rz: Math.PI / 2 - 0.35, center: true });
  k.sphere(0.11, W, { x: -1.0, y: 0.36, ws: 8, hs: 6 });
}

// ---------------------------------------------------------------- actor wrappers
// root: placed and rotated by the simulation; body: local bob/sway; extras: optional sub-meshes.
function wrap(kit, mats, { scale = 1, cast = true } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const meshes = kit.build(mats, { cast, receive: false });
  body.add(meshes);
  body.scale.setScalar(scale);
  root.add(body);
  const box = new THREE.Box3().setFromObject(body);
  return { root, body, box };
}

// Bright winter jackets: people are the most visible spots of colour on the snow (as trucks and forklifts are
// in a warehouse view). The stranger stays dark grey for contrast.
export const PEOPLE = {
  'worker-1': { name: 'Ерлан Касымов', role: 'Скотник', jacket: '#F08A24', hat: '#F4F6F8' },
  'worker-2': { name: 'Айгуль Нурланова', role: 'Бухгалтер', jacket: '#D9483B', hat: '#F1E6D8' },
  'worker-3': { name: 'Данияр Абенов', role: 'Кормач', jacket: '#F2C230', hat: '#2F3540' },
  'worker-4': { name: 'Сауле Темирбекова', role: 'Оператор доения', jacket: '#D9483B', hat: '#F4F6F8' },
  'worker-5': { name: 'Бауыржан Оспанов', role: 'Ветеринар', jacket: '#F08A24', hat: '#2F3540' },
  'worker-6': { name: 'Нурлан Искаков', role: 'Водитель', jacket: '#F2C230', hat: '#D9483B' },
  guard: { name: 'Марат Сеитов', role: 'Охранник', jacket: '#2C3E35', hat: '#1F2A24', cap: true },
  stranger: { name: 'Неизвестный', role: 'Нет в базе сотрудников', jacket: '#4B5059', hat: '#2B2F35' },
};

export const VEHICLES = {
  'milk-truck': { name: 'Молоковоз', plate: '512 AMK 15', vehicle: 'молоковоз', length: 9.7 },
  'feed-truck': { name: 'Кормовоз КамАЗ', plate: '347 BKS 15', vehicle: 'кормовоз КамАЗ', length: 8.4 },
  tractor: { name: 'Трактор Беларус', plate: '1234 AT 15', vehicle: 'трактор Беларус', length: 5.9 },
  'unknown-car': { name: 'Легковой автомобиль', plate: '401 NAN 15', vehicle: 'легковой автомобиль', length: 4.4 },
};

// Number plates by farm: region 15 — North Kazakhstan, region 13 — Turkestan.
export const PLATES = {
  north: { 'milk-truck': '512 AMK 15', 'feed-truck': '347 BKS 15', tractor: '1234 AT 15', 'unknown-car': '401 NAN 15' },
  south: { 'milk-truck': '638 ADS 13', 'feed-truck': '271 BTA 13', tractor: '5821 AT 13', 'unknown-car': '905 KMR 13' },
};
export const plateOf = (id, site = 'north') => (PLATES[site] && PLATES[site][id]) || (VEHICLES[id] && VEHICLES[id].plate) || '';

export const PERSON_SCALE = 1.4;

export function createActors(mats) {
  const actors = {};
  // vehicles
  let k = new Kit(); milkTruckParts(k);
  actors['milk-truck'] = { id: 'milk-truck', kind: 'vehicle', ...wrap(k, mats) };
  k = new Kit(); feedTruckParts(k);
  actors['feed-truck'] = { id: 'feed-truck', kind: 'vehicle', ...wrap(k, mats) };
  k = new Kit(); tractorParts(k);
  const tractor = { id: 'tractor', kind: 'vehicle', ...wrap(k, mats) };
  const bk = new Kit(); baleParts(bk);
  const bale = bk.build(mats, { receive: false });
  bale.position.set(3.32, 0.24, 0);
  tractor.body.add(bale);
  tractor.bale = bale;
  tractor.box = new THREE.Box3().setFromObject(tractor.body);
  actors.tractor = tractor;
  k = new Kit(); sedanParts(k, '#8F99A5');
  actors['unknown-car'] = { id: 'unknown-car', kind: 'vehicle', ...wrap(k, mats) };
  // people
  for (const [id, p] of Object.entries(PEOPLE)) {
    k = new Kit(); personParts(k, p);
    actors[id] = { id, kind: 'person', ...wrap(k, mats, { scale: PERSON_SCALE }) };
  }
  // fox (not selectable)
  k = new Kit(); foxParts(k);
  actors.fox = { id: 'fox', kind: 'animal', ...wrap(k, mats, { scale: 1.7 }) };
  for (const a of Object.values(actors)) {
    a.root.name = a.id;
    a.root.userData.actorId = a.id;
  }
  return actors;
}

function herdMesh(parts, mats, count) {
  const k = new Kit(); parts(k);
  const geo = k.geometry('matte');
  const mesh = new THREE.InstancedMesh(geo, mats.matte, count);
  mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}
export function createCows(mats, count = 5) { return herdMesh(cowParts, mats, count); }
export function createSheep(mats, count = 9) { return herdMesh(sheepParts, mats, count); }
