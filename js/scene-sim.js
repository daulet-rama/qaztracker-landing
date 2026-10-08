// QazTracker Vision — 3D farm scene: deterministic 90-second simulation.
// Every actor pose is a pure function of loop time, so the loop is seamless, pausable and identical on every load.
import * as THREE from 'three';
import { roundedPath, EASE, clamp } from './scene-kit.js';
import { L, LAYOUTS } from './scene-world.js';
import { PEOPLE, VEHICLES, plateOf } from './scene-actors.js';

export const LOOP = 90;

const GX = L.gateX;
const LE = L.road.laneE, LW = L.road.laneW;
const TZ = L.truckLaneZ;
const LX = L.laneX;
const STOP_IN = 38.9;   // front bumper stops here when entering
const STOP_OUT = 36.3;  // front bumper stops here when leaving

class Track {
  constructor(id, start = 0) {
    this.id = id; this.start = start; this.t = start;
    this.segs = []; this.vis = []; this.visFrom = null;
    this.labels = [];
  }
  wait(dt) { this.t += dt; return this; }
  // what the actor is doing from now on (tooltips): «едет к въезду», «идёт к проходной»…
  say(label) { this.labels.push([this.t, label]); return this; }
  labelAt(t) {
    t = this.local(t);
    let out = this.labels.length ? this.labels[0][1] : '';
    for (const [a, label] of this.labels) { if (a <= t) out = label; else break; }
    return out;
  }
  show() { this.visFrom = this.t; return this; }
  hide() { this.vis.push([this.visFrom ?? this.start, this.t]); this.visFrom = null; return this; }
  move(points, { speed = 4, radius = 4, reverse = false, ease = 'inout' } = {}) {
    const curve = roundedPath(points, radius);
    const len = curve.getLength();
    const k = ease === 'linear' ? 1 : ease === 'inout' ? 1.35 : 1.18;
    const dur = Math.max(0.4, (len / speed) * k);
    this.segs.push({ t0: this.t, t1: this.t + dur, curve, len, reverse, ease: EASE[ease] });
    this.t += dur;
    return this;
  }
  finish() { if (this.visFrom !== null) this.hide(); return this; }
  local(t) {
    let x = t;
    while (x < this.start) x += LOOP;
    while (x >= this.start + LOOP) x -= LOOP;
    return x;
  }
  // pose at loop time t → { x, z, yaw, moving, visible, fade }
  pose(t, out = {}) {
    t = this.local(t);
    let seg = null, u = 0, moving = false;
    let prev = null;
    for (const s of this.segs) {
      if (t < s.t0) break;
      if (t <= s.t1) { seg = s; break; }
      prev = s;
    }
    if (seg) { u = seg.ease((t - seg.t0) / (seg.t1 - seg.t0)); moving = u > 0.0005 && u < 0.9995; }
    else if (prev) { seg = prev; u = 1; }
    else { seg = this.segs[0]; u = 0; }
    const p = seg.curve.getPoint(u);
    const tan = seg.curve.getTangent(clamp(u, 0.0005, 0.9995));
    out.x = p.x; out.z = p.z;
    out.yaw = Math.atan2(-tan.z, tan.x) + (seg.reverse ? Math.PI : 0);
    out.moving = moving;
    out.reverse = seg.reverse;
    // visibility with a short scale-in/out
    let vis = this.vis.length === 0, fade = vis ? 1 : 0;
    for (const [a, b] of this.vis) {
      if (t >= a && t < b) { vis = true; fade = Math.min(1, (t - a) / 0.45, (b - t) / 0.45); break; }
    }
    out.visible = vis;
    out.fade = clamp(fade, 0, 1);
    return out;
  }
  // first loop time inside [ta, tb] where predicate(pose) is true (for event timing)
  find(ta, tb, pred) {
    const o = {};
    for (let t = ta; t <= tb; t += 0.02) { this.pose(t, o); if (pred(o)) return t; }
    return null;
  }
}

const norm = (t) => ((t % LOOP) + LOOP) % LOOP;

// One simulation per farm: same story, the farm's own office position and number plates.
// Per loop the checkpoint sees two entries and two exits, so the head count does not drift.
export function createSimulation(siteId = 'north') {
  const OF = (LAYOUTS[siteId] || L).office;
  const WZ = OF.walkZ ?? 26;          // path between the checkpoint lane and the office
  const WEST = OF.doorX < L.laneX;    // office on the west side: the path crosses the driveway
  const tracks = {};
  const events = [];
  const barrier = [];     // [open, close]
  const turnstile = [];   // { t, dir }
  const feedDoor = [];    // [open, close]
  const officeDoor = [];  // [open, close]
  const baleOff = [];     // [unload, reload] times for the tractor bale
  const keys = {};        // loop times of the key moments the «try it yourself» scenarios start from
  const ev = (t, data) => events.push({ t: norm(t), ...data });

  const plate = (t, id, result, direction) => {
    const v = VEHICLES[id];
    const plateNo = plateOf(id, siteId);
    keys[`plate:${id}:${direction}`] = norm(t);
    ev(t - 1.35, { fx: [{ type: 'scan', at: direction === 'in' ? 'anprIn' : 'anprOut', vehicle: id }] });
    ev(t, {
      emit: { type: 'plate', plate: plateNo, vehicle: v.vehicle, vehicleId: id, objectId: 'gate', result, direction },
      fx: [
        { type: 'ring', anchor: 'gateRing', tone: result === 'allowed' ? 'ok' : 'alarm', size: 6 },
        { type: 'pill', vehicle: id, lift: id === 'unknown-car' ? 3.2 : 4.6, tone: result === 'allowed' ? 'ok' : 'alarm',
          title: plateNo, chip: result === 'allowed' ? (direction === 'in' ? 'Въезд разрешён' : 'Выезд разрешён') : 'Не пропущен',
          subtitle: result === 'allowed' ? `${capital(v.vehicle)} · в списке` : 'Номера нет в списке' },
        { type: 'packet', anchor: direction === 'in' ? 'anprIn' : 'anprOut', tone: result === 'allowed' ? 'ok' : 'alarm' },
      ],
    });
  };
  const face = (t, personId, point, objectId, anchor, ringPos, result) => {
    const p = PEOPLE[personId];
    const ok = result === 'allowed';
    keys[`face:${personId}:${objectId}`] = norm(t);
    ev(t, {
      emit: { type: 'face', person: ok ? p.name : 'Неизвестное лицо', personId, point, objectId, result },
      fx: [
        { type: 'screen', anchor, tone: ok ? 'ok' : 'alarm' },
        { type: 'ring', pos: ringPos, tone: ok ? 'ok' : 'alarm', size: 3.2 },
        { type: 'halo', actor: personId, tone: ok ? 'ok' : 'alarm' },
        { type: 'pill', anchor, actor: personId, lift: 2.9, tone: ok ? 'ok' : 'alarm', title: ok ? p.name : 'Неизвестное лицо',
          chip: ok ? 'Проход разрешён' : 'Доступ запрещён', subtitle: point },
        { type: 'packet', anchor, tone: ok ? 'ok' : 'alarm' },
      ],
    });
  };

  // ------------------------------------------------ feed truck (КамАЗ): arrives at the end of the loop, parks, leaves
  {
    const half = 4.2;
    const tr = new Track('feed-truck', -10);
    tr.show().say('едет к въезду');
    tr.move([[100, LW], [GX, LW], [GX, STOP_IN + half]], { speed: 13, radius: 7, ease: 'out' });
    tr.say('у шлагбаума, камера читает номер');
    const tp = tr.t + 1.0;
    plate(tp, 'feed-truck', 'allowed', 'in');
    tr.t = tp + 1.2;
    const bOpen = tp + 0.15;
    tr.say('едет к складу кормов');
    tr.move([[GX, STOP_IN + half], [GX, TZ], [L.feedPark.x, TZ], [L.feedPark.x, L.feedPark.z]], { speed: 6.5, radius: 5 });
    barrier.push([bOpen, bOpen + 6.4]);
    tr.say('разгружается у склада кормов');
    tr.wait(Math.max(4, 39 - tr.t));
    tr.say('разворачивается');
    tr.move([[L.feedPark.x, L.feedPark.z], [L.feedPark.x, 1.6], [L.feedPark.x + 6, TZ]], { speed: 2.6, radius: 3.6, reverse: true });
    tr.wait(0.6);
    tr.say('едет к выезду');
    tr.move([[L.feedPark.x + 6, TZ], [GX, TZ], [GX, STOP_OUT - half]], { speed: 6.5, radius: 5 });
    tr.say('у шлагбаума на выезде');
    const tq = tr.t + 0.9;
    plate(tq, 'feed-truck', 'allowed', 'out');
    tr.t = tq + 1.2;
    barrier.push([tq + 0.15, tq + 6.0]);
    tr.say('уезжает с фермы');
    tr.move([[GX, STOP_OUT - half], [GX, LW], [-125, LW]], { speed: 12, radius: 6, ease: 'in' });
    tr.finish();
    tracks['feed-truck'] = tr;
  }

  // ------------------------------------------------ milk truck: in, loads milk at the tank, leaves east
  {
    const half = 4.85;
    const tr = new Track('milk-truck', 0);
    tr.wait(10).show().say('едет к въезду');
    tr.move([[-125, LE], [GX, LE], [GX, STOP_IN + half]], { speed: 13, radius: 7, ease: 'out' });
    tr.say('у шлагбаума, камера читает номер');
    const tp = tr.t + 1.0;
    plate(tp, 'milk-truck', 'allowed', 'in');
    barrier.push([tp + 0.15, tp + 6.6]);
    tr.t = tp + 1.2;
    tr.say('едет к молочному блоку');
    tr.move([[GX, STOP_IN + half], [GX, TZ], [L.milkPark.x, TZ], [L.milkPark.x, L.milkPark.z]], { speed: 6.5, radius: 5 });
    tr.say('забирает молоко');
    tr.wait(Math.max(4, 52 - tr.t));
    tr.say('разворачивается');
    tr.move([[L.milkPark.x, L.milkPark.z], [L.milkPark.x, 1.4], [L.milkPark.x + 5.5, TZ]], { speed: 2.6, radius: 3.6, reverse: true });
    tr.wait(0.6);
    tr.say('едет к выезду');
    tr.move([[L.milkPark.x + 5.5, TZ], [GX, TZ], [GX, STOP_OUT - half]], { speed: 6.5, radius: 5 });
    tr.say('у шлагбаума на выезде');
    const tq = tr.t + 0.9;
    plate(tq, 'milk-truck', 'allowed', 'out');
    barrier.push([tq + 0.15, tq + 6.4]);
    tr.t = tq + 1.2;
    tr.say('уезжает с фермы');
    tr.move([[GX, STOP_OUT - half], [GX, LE], [100, LE]], { speed: 13, radius: 7, ease: 'in' });
    tr.finish();
    tracks['milk-truck'] = tr;
  }

  // ------------------------------------------------ unknown car: not in the list, barrier stays closed, turns back
  {
    const half = 2.2;
    const tr = new Track('unknown-car', 0);
    tr.wait(36).show().say('едет к въезду');
    tr.move([[-125, LE], [GX, LE], [GX, STOP_IN + half]], { speed: 14, radius: 6, ease: 'out' });
    tr.say('у шлагбаума, камера читает номер');
    const tp = tr.t + 1.0;
    plate(tp, 'unknown-car', 'not_in_list', 'in');
    tr.t = tp + 0.2;
    tr.say('номера нет в списке, шлагбаум закрыт');
    tr.t = tp + 2.6;
    tr.say('разворачивается');
    tr.move([[GX, STOP_IN + half], [GX, LW], [GX + 6, LW]], { speed: 3.2, radius: 4.2, reverse: true });
    tr.wait(0.5);
    tr.say('уезжает');
    tr.move([[GX + 6, LW], [-125, LW]], { speed: 13, ease: 'in' });
    tr.finish();
    tracks['unknown-car'] = tr;
  }

  // ------------------------------------------------ tractor with a front loader: hay stack → cow pen → back
  {
    const tr = new Track('tractor', 0);
    const home = [44.5, -16.5];
    tr.say('стоит у сеновала');
    tr.wait(31);
    tr.say('везёт рулон сена к загону');
    tr.move([home, [44.5, 1.15], [-14.5, 1.15]], { speed: 5.4, radius: 3.4 });
    const tu = tr.t + 1.5;
    tr.say('выгружает сено');
    tr.wait(0.9);
    tr.say('возвращается к сеновалу');
    tr.move([[-14.5, 1.15], [-19.6, 1.15], [-19.6, 7.0], [47.6, 7.0], [47.6, -20.4], home.map((v, i) => i ? -20.4 : v), home], { speed: 5.4, radius: 2.4 });
    tr.say('стоит у сеновала');
    const tl = tr.t - 0.5;
    baleOff.push([tu, tl]);
    tracks.tractor = tr;
  }

  // ------------------------------------------------ people
  const W = 1.75; // walking speed
  const walk = (tr, pts, speed = W) => tr.move(pts, { speed, radius: 1.1, ease: 'linear' });
  const pass = (t, dir) => turnstile.push({ t, dir });

  // worker-4 (Сауле): night shift leaves through the exit terminal
  {
    const tr = new Track('worker-4', 0);
    tr.wait(2).show().say('смена закончилась, идёт к проходной');
    walk(tr, [[L.barnDoor.x + 0.5, L.barnDoor.z], [L.barnDoor.x + 0.5, 10.7], [LX + 0.6, 10.7], [LX + 0.6, 33.2], [LX, 34.4]]);
    tr.say('выходит по лицу');
    const tf = tr.t + 0.4;
    face(tf, 'worker-4', 'Проходная · выход', 'checkpoint', 'cpOut', [LX, 0.08, 34.4], 'allowed');
    pass(tf + 0.35, -1);
    tr.t = tf + 0.9;
    tr.say('идёт к машине');
    walk(tr, [[LX, 34.4], [LX, 39.6], [LX + 0.6, 41.1], [20.3, 41.1], [20.3, 45.2]]);
    tr.finish();
    tracks['worker-4'] = tr;
  }
  // worker-1 (Ерлан): arrives by car, enters, walks to the barn
  {
    const tr = new Track('worker-1', 0);
    tr.wait(6.6).show().say('приехал на смену, идёт к проходной');
    walk(tr, [[24.6, 45.4], [24.6, 42.9], [LX + 0.4, 42.9], [LX, 41.6], [LX, 38.4]]);
    tr.say('проходит по лицу');
    const tf = tr.t + 0.4;
    face(tf, 'worker-1', 'Проходная · вход', 'checkpoint', 'cpIn', [LX, 0.08, 38.4], 'allowed');
    pass(tf + 0.35, 1);
    tr.t = tf + 0.9;
    tr.say('идёт к коровнику');
    walk(tr, [[LX, 38.4], [LX, 33.6], [LX - 0.6, 32.4], [LX - 0.6, 9.7], [L.barnDoor.x - 0.5, 9.7], [L.barnDoor.x - 0.5, -8.5]]);
    tr.say('проходит в молочный блок');
    const tb = tr.t + 0.4;
    face(tb, 'worker-1', 'Коровник · молочный блок', 'barn', 'barnTerm', [L.barnDoor.x - 0.5, 0.08, -8.5], 'allowed');
    tr.t = tb + 1.0;
    walk(tr, [[L.barnDoor.x - 0.5, -8.5], [L.barnDoor.x, L.barnDoor.z - 0.4]]);
    tr.say('в коровнике');
    tr.finish();
    tracks['worker-1'] = tr;
  }
  // worker-2 (Айгуль): enters, goes to the office, ZKTeco terminal opens the door
  {
    const tr = new Track('worker-2', 0);
    tr.wait(27).show().say('идёт к проходной');
    walk(tr, [[32.8, 45.4], [32.8, 42.9], [LX + 0.4, 42.9], [LX, 41.6], [LX, 38.4]]);
    tr.say('проходит по лицу');
    const tf = tr.t + 0.4;
    face(tf, 'worker-2', 'Проходная · вход', 'checkpoint', 'cpIn', [LX, 0.08, 38.4], 'allowed');
    pass(tf + 0.35, 1);
    tr.t = tf + 0.9;
    tr.say('идёт в контору');
    // west office: she hurries across the driveway between the feed truck and the milk truck
    walk(tr, [[LX, 38.4], [LX, 33.6], [LX - 0.6, 32.4], [LX - 0.6, WZ - 0.5], [OF.doorX, WZ - 0.5], [OF.doorX, OF.z1 + 1.2]], WEST ? 2.2 : W);
    tr.say('открывает контору по лицу');
    const to = tr.t + 0.4;
    face(to, 'worker-2', 'Контора', 'office', 'officeTerm', [OF.doorX, 0.08, OF.z1 + 1.2], 'allowed');
    ev(to + 0.35, { emit: { type: 'door', objectId: 'office', state: 'open' }, fx: [] });
    officeDoor.push([to + 0.35, to + 4.6]);
    tr.t = to + 1.0;
    walk(tr, [[OF.doorX, OF.z1 + 1.2], [OF.doorX, OF.z1 - 1.6]]);
    tr.say('в конторе');
    tr.finish();
    ev(to + 4.6 + 0.8, { emit: { type: 'door', objectId: 'office', state: 'closed' }, fx: [] });
    tracks['worker-2'] = tr;
  }
  // stranger: not in the database, denied at the checkpoint, walks away
  {
    const tr = new Track('stranger', 0);
    tr.wait(57).show().say('идёт к проходной');
    walk(tr, [[-6, 49.3], [4, 49.3], [LX, 44.5], [LX, 38.4]]);
    tr.say('лица нет в базе, турникет закрыт');
    const tf = tr.t + 0.4;
    face(tf, 'stranger', 'Проходная · вход', 'checkpoint', 'cpIn', [LX, 0.08, 38.4], 'denied');
    ev(tf + 0.6, {
      emit: { type: 'alarm', kind: 'unknown_face', where: 'Проходная · вход', objectId: 'checkpoint' },
      fx: [{ type: 'alarm', objectId: 'checkpoint' }],
    });
    tr.t = tf + 3.0;
    tr.say('уходит');
    walk(tr, [[LX, 38.4], [LX, 44.5], [4, 49.3], [-6, 49.3]], 1.9);
    tr.finish();
    tracks.stranger = tr;
  }
  // worker-3 (Данияр): from the barn to the feed store, Face ID opens the roller door
  {
    const tr = new Track('worker-3', 0);
    tr.wait(61.5).show().say('идёт к складу кормов');
    walk(tr, [[L.barnDoor.x, L.barnDoor.z], [L.barnDoor.x, -7.6], [34.3, -7.6], [34.3, -10.1]], 1.9);
    tr.say('открывает склад по лицу');
    const tf = tr.t + 0.4;
    face(tf, 'worker-3', 'Склад кормов', 'feed', 'feedTerm', [34.3, 0.08, -10.1], 'allowed');
    ev(tf + 0.35, { emit: { type: 'door', objectId: 'feed', state: 'open' }, fx: [] });
    feedDoor.push([tf + 0.35, tf + 5.3]);
    tr.t = tf + 1.9;
    walk(tr, [[34.3, -10.1], [31.2, -11.2], [30.6, -14.5]], 1.9);
    tr.say('на складе кормов');
    tr.finish();
    ev(tf + 5.3 + 1.6, { emit: { type: 'door', objectId: 'feed', state: 'closed' }, fx: [] });
    tracks['worker-3'] = tr;
  }
  // worker-5 (Бауыржан, ветеринар): office → milk block, later back (no access events)
  {
    const tr = new Track('worker-5', 0);
    tr.wait(WEST ? 12 : 3).show();
    const mid = WEST ? [[3.5, WZ + 0.4], [12.2, 13.2]] : [[22, WZ + 0.4], [14.2, 9.8]];
    const route = [[OF.doorX, OF.z1 + 1.0], [OF.doorX, WZ + 0.4], ...mid, [12.2, 9.8], [12.2, -10.6], [11.5, -11.4]];
    tr.say('идёт в молочный блок');
    if (WEST) walk(tr, route, 1.8); // the long way from the west office: one trip per loop
    else {
      walk(tr, route, 1.6);
      tr.say('в молочном блоке');
      tr.hide();
      tr.wait(Math.max(2, 57.5 - tr.t)).show();
      tr.say('возвращается в контору');
      walk(tr, route.slice().reverse(), 1.6);
    }
    tr.finish();
    tracks['worker-5'] = tr;
  }
  // worker-6 (Нурлан, водитель): leaves the office, exits through the checkpoint and walks to his car
  {
    const t0 = OF.doorX > LX ? 36 : 24;
    const tr = new Track('worker-6', 0);
    tr.wait(t0).show().say('идёт к проходной');
    officeDoor.push([t0 - 0.6, t0 + 1.6]);
    walk(tr, [[OF.doorX, OF.z1 + 0.6], [OF.doorX, WZ + 0.5], [LX + 0.6, WZ + 0.5], [LX + 0.6, 33.2], [LX, 34.4]]);
    tr.say('выходит по лицу');
    const tf = tr.t + 0.4;
    face(tf, 'worker-6', 'Проходная · выход', 'checkpoint', 'cpOut', [LX, 0.08, 34.4], 'allowed');
    pass(tf + 0.35, -1);
    tr.t = tf + 0.9;
    tr.say('идёт к машине');
    walk(tr, [[LX, 34.4], [LX, 39.6], [LX + 0.6, 41.1], [26.3, 41.1], [26.3, 45.2]]);
    tr.finish();
    tracks['worker-6'] = tr;
  }
  // guard stands at the gate booth
  {
    const tr = new Track('guard', 0);
    tr.say('дежурит у въезда');
    tr.move([[-30.2, 34.4], [-30.15, 34.6]], { speed: 1, ease: 'linear' });
    tracks.guard = tr;
  }
  // fox crosses the perimeter line on the east side
  {
    const tr = new Track('fox', 0);
    tr.wait(40).show();
    tr.move([[82, -30], [62, -16], [52, -9], [47.2, -6.2]], { speed: 4.6, radius: 3, ease: 'out' });
    tr.wait(2.4);
    tr.move([[47.2, -6.2], [49.5, -10.5], [57, -14], [84, -27]], { speed: 5.4, radius: 2.5, ease: 'in' });
    tr.finish();
    tracks.fox = tr;
    const tc = tr.find(40, 60, (o) => o.x <= L.fence.x1 - 1.0);
    keys.perimeter = norm(tc);
    ev(tc, {
      emit: { type: 'alarm', kind: 'line_crossing', where: 'Периметр · восточная сторона', objectId: 'perimeter-cam' },
      fx: [
        { type: 'alarm', objectId: 'perimeter-cam' },
        { type: 'ring', anchor: 'vlineMid', tone: 'alarm', size: 7 },
        { type: 'pill', anchor: 'vlineMid', lift: 3.2, tone: 'alarm', title: 'Пересечение линии', chip: 'Тревога', subtitle: 'Камера периметра · восток' },
        { type: 'packet', anchor: 'perimCam', tone: 'alarm' },
      ],
    });
  }

  events.sort((a, b) => a.t - b.t);

  // Net people through the checkpoint at loop time t (entries − exits since t = 0); 0 again at the end of the loop.
  const heads = events.filter((e) => e.emit && e.emit.type === 'face' && e.emit.objectId === 'checkpoint' && e.emit.result === 'allowed')
    .map((e) => [e.t, /выход/i.test(e.emit.point) ? -1 : 1]);
  const headAt = (t) => { let n = 0; for (const [a, d] of heads) if (a <= t) n += d; return n; };

  // ---------------------------------------------- props as functions of loop time
  const ramp = (t, a, b, up = 1.0, down = 1.2) => {
    if (t < a || t > b + down) return 0;
    if (t < a + up) return (t - a) / up;
    if (t <= b) return 1;
    return 1 - (t - b) / down;
  };
  const intervals = (list, t, up, down) => {
    let v = 0;
    for (const [a, b] of list) {
      v = Math.max(v, ramp(t, norm(a), norm(a) + (b - a), up, down));
      v = Math.max(v, ramp(t + LOOP, norm(a), norm(a) + (b - a), up, down));
    }
    return EASE.inout(v);
  };
  const props = {
    barrier: (t) => intervals(barrier, t, 1.0, 1.4),
    feedDoor: (t) => intervals(feedDoor, t, 1.4, 1.6),
    officeDoor: (t) => intervals(officeDoor, t, 0.6, 0.8),
    turnstile: (t) => {
      let rot = 0;
      for (const { t: tp, dir } of turnstile) {
        const a = norm(tp);
        const k = clamp((t - a) / 0.9, 0, 1);
        rot += dir * EASE.inout(k);
      }
      return rot * (Math.PI * 2 / 3);
    },
    bale: (t) => {
      for (const [a, b] of baleOff) { if (t >= norm(a) && t < norm(b)) return false; }
      return true;
    },
  };

  return { LOOP, tracks, events, props, keys, headAt, debug: { barrier, turnstile, feedDoor, officeDoor, baleOff } };
}

function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Dev helper: list pairs of actors whose footprints overlap while one of them moves (test page only).
export function findConflicts(sim, step = 0.1) {
  const ids = Object.keys(sim.tracks).filter((id) => id !== 'fox' && id !== 'guard');
  const dims = { 'milk-truck': [9.7, 2.6], 'feed-truck': [8.4, 2.5], tractor: [5.9, 2.2], 'unknown-car': [4.4, 1.9] };
  const corners = (o, [l, w]) => {
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    const fx = c, fz = -s, rx = s, rz = c; // forward (+x local) and right (+z local)
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [o.x + fx * a * l / 2 + rx * b * w / 2, o.z + fz * a * l / 2 + rz * b * w / 2]);
  };
  const sep = (A, B) => {
    for (const P of [A, B]) for (let i = 0; i < 4; i++) {
      const [x1, z1] = P[i], [x2, z2] = P[(i + 1) % 4];
      const nx = z2 - z1, nz = x1 - x2;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (const [x, z] of A) { const d = x * nx + z * nz; amin = Math.min(amin, d); amax = Math.max(amax, d); }
      for (const [x, z] of B) { const d = x * nx + z * nz; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
      if (amax < bmin || bmax < amin) return true;
    }
    return false;
  };
  const out = [];
  const a = {}, b = {};
  for (let t = 0; t < LOOP; t += step) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      sim.tracks[ids[i]].pose(t, a); sim.tracks[ids[j]].pose(t, b);
      if (!a.visible || !b.visible || !(a.moving || b.moving)) continue;
      const A = corners(a, dims[ids[i]] || [0.9, 0.9]), B = corners(b, dims[ids[j]] || [0.9, 0.9]);
      if (!sep(A, B)) out.push({ t: +t.toFixed(1), a: ids[i], b: ids[j], d: +Math.hypot(a.x - b.x, a.z - b.z).toFixed(1) });
    }
  }
  return out;
}
