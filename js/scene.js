// QazTracker Vision — 3D farm scene (Three.js, procedural, no external models).
//
// export async function createFarmScene(canvas, { onSelect, onEvent, onReady, quality, reducedMotion }) → FarmScene
//
// FarmScene = {
//   objects,                      // getter: objects of the current site [{ id, kind, name, site, subtitle, plate? }]
//   site, sites,                  // current site id, site descriptions
//   setSite(siteId) → Promise,    // camera fly-to + weather change; clears the selection
//   select(objectId | null),      // frame + corner brackets + floating label (null clears)
//   openDoor('checkpoint'|'feed'|'office') → Promise<{ ms }>,
//   zoomBy(step), rotateBy(deg), resetView(), setPaused(paused), dispose(),
//   setViewInsets({ top, right, bottom, left, avoid? } | null, { animate }),  // px covered by the app's panels;
//                                 // the overview and the selected object are framed in the rest;
//                                 // avoid: [{ x0, y0, x1, y1 }] small panels inside that area labels keep clear of
//   tourTo(objectId, { dist, dur }) → Promise,  // optional auto-tour: medium shot of an object, no selection;
//                                 // resetView() brings the camera home
// }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createMaterials, LabelCanvas, pinTexture, dotTexture, glowRectTexture,
  ALARM, clamp, lerp, smooth, easeInOut, easeOut,
} from './scene-kit.js';
import { buildWorld, buildSite, SITE_ORIGINS, makeAoTexture } from './scene-world.js';
import { createActors, PEOPLE, VEHICLES, plateOf } from './scene-actors.js';
import { createSimulation, LOOP } from './scene-sim.js';

const SITE_INFO = {
  north: { id: 'north', name: 'Ферма «Север»', temperature: -32, weather: 'Снег, мороз' },
  south: { id: 'south', name: 'Ферма «Юг»', temperature: 8, weather: 'Сухо, степь' },
};

// Less fill light and a stronger sun: soft blue-grey shadows that sit every object on the ground.
const ENV = {
  north: {
    bg: '#E4EAF2', hemiSky: '#D8E3F8', hemiGround: '#E9EEF5', hemi: 0.5,
    sun: '#F2F5FF', sunI: 3.5, sunDir: new THREE.Vector3(-46, 46, 64), env: 0.3, exposure: 1.02, snow: 1,
  },
  south: {
    bg: '#F0EBE1', hemiSky: '#FFF2DC', hemiGround: '#DCCCA6', hemi: 0.55,
    sun: '#FFE9CA', sunI: 3.6, sunDir: new THREE.Vector3(-44, 80, 56), env: 0.3, exposure: 1.05, snow: 0,
  },
};

const HOME = { az: 0.74, polar: 0.93, azTall: 0.25, polarTall: 0.74, offset: new THREE.Vector3(4, 0, 6) };

// Home framing: the camera fits the main story into the part of the canvas that the app's panels leave
// free — gate, checkpoint with the processor, the barn door and the feed store door. The office, the
// perimeter and the cloud come into view during the auto-tour. [x, y, z, pxUp, pxSide] — site-local
// units, plus room in CSS px for the pins and pills drawn above a point.
const FRAME_WIDE = [
  [-24, 0, 47, 0, 16],          // road in front of the gate
  [-33, 3, 35, 8, 8],           // guard booth
  [-21.4, 4.6, 40.6, 46, 84],   // number-plate camera and its event pill
  [2, 0, 40, 0, 8], [13, 4, 32.4, 30, 8],   // checkpoint + its pin
  [5.9, 5.0, 39.8, 26, 8],      // processor pin
  [-2, 4, -9.3, 0, 0],          // milk block door
  [-14, 10.6, -17, 34, 16],     // barn pin
  [34.3, 2, -11.2, 0, 0], [30, 11.4, -21, 34, 16],   // feed store door + pin
  [10, 13, -36, 80, 60],        // «Облако в Казахстане» and its label (the label slides inside the free area)
];
// Phones: gate, checkpoint and the barn fill the width; looking more from above stretches the farm
// along the tall frame.
const FRAME_TALL = [
  [-24, 0, 45, 0, 4], [-25.5, 3, 49, 0, 4],   // gate and a truck waiting at the barrier
  [-21.4, 4.6, 40.6, 30, 12],
  [-30, 3, 35, 0, 4],
  [2, 0, 40, 0, 4], [13, 4, 32.4, 26, 4],
  [-2, 4, -9.3, 0, 0],
  [-14, 10.6, -17, 30, 10],
  [18, 0, -5, 0, 0],
  [15, 4, -22, 0, 0], [8, 7, -10, 0, 0],      // milk block and the east end of the barn
];
// The south farm has its office on the west side of the yard and a sheep shed by the barn.
const FRAME_WIDE_S = [
  [-24, 0, 47, 0, 16],
  [-21.4, 4.6, 40.6, 46, 84],
  [-44.2, 0, 23.8, 0, 8], [-39, 9.2, 19, 34, 16],    // office + pin
  [2, 0, 40, 0, 8], [13, 4, 32.4, 30, 8],
  [5.9, 5.0, 39.8, 26, 8],
  [-34, 3, -8.6, 0, 0],         // кошара
  [-2, 4, -9.3, 0, 0],
  [-14, 10.6, -17, 34, 16],
  [34.3, 2, -11.2, 0, 0], [30, 11.4, -21, 34, 16],
  [10, 13, -36, 80, 60],
];
const FRAME_TALL_S = [
  [-24, 0, 45, 0, 4], [-25.5, 3, 49, 0, 4],
  [-21.4, 4.6, 40.6, 30, 12],
  [-44.2, 0, 23.8, 0, 4],
  [2, 0, 40, 0, 4], [13, 4, 32.4, 26, 4],
  [-2, 4, -9.3, 0, 0],
  [-14, 10.6, -17, 30, 10],
  [18, 0, -5, 0, 0],
  [15, 4, -22, 0, 0], [8, 7, -10, 0, 0],
];
const FRAMES = { north: { wide: FRAME_WIDE, tall: FRAME_TALL }, south: { wide: FRAME_WIDE_S, tall: FRAME_TALL_S } };
const CLOUD_LABEL = { title: 'Облако в Казахстане', subtitle: 'шифрованный канал от процессора', tone: 'accent' };
const LED_GREEN = new THREE.Color('#2BD67B');
const TONE = { ok: '#17B26A', alarm: '#F04438', accent: '#1E9E5E', cmd: '#0E9F6E' };

function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { return false; }
}

export async function createFarmScene(canvas, opts = {}) {
  const { onSelect = () => {}, onEvent = () => {}, onReady = () => {} } = opts;
  const quality = opts.quality === 'low' ? 'low' : 'high';
  const RM = !!opts.reducedMotion;
  if (!canvas) throw new Error('createFarmScene: canvas is required');
  if (!webgl2Available()) throw new Error('WebGL2 недоступен');

  let renderer;
  try {
    // On high-density screens the pixels themselves smooth edges; MSAA there costs a lot of fill-rate.
    const antialias = (window.devicePixelRatio || 1) < 1.5 || quality === 'low';
    renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL недоступен: ' + (e && e.message));
  }
  const maxPR = quality === 'low' ? 1.25 : 2;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, maxPR);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = ENV.north.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(ENV.north.bg);
  scene.fog = new THREE.Fog(ENV.north.bg, 200, 520);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = ENV.north.env;

  const camera = new THREE.PerspectiveCamera(30, 1, 2, 3000);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(ENV.north.hemiSky, ENV.north.hemiGround, ENV.north.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(ENV.north.sun, ENV.north.sunI);
  sun.castShadow = true;
  const SM = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(SM, SM);
  const sc = sun.shadow.camera;
  sc.left = -92; sc.right = 92; sc.top = 92; sc.bottom = -92; sc.near = 10; sc.far = 420;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- world
  const mats = createMaterials();
  const aoTexture = makeAoTexture();
  const world = buildWorld(mats);
  scene.add(world.group);
  const sites = {};
  for (const id of ['north', 'south']) {
    const s = buildSite(id, { mats, aoTexture, quality });
    s.group.position.copy(SITE_ORIGINS[id]);
    s.origin = SITE_ORIGINS[id].clone();
    scene.add(s.group);
    sites[id] = s;
  }
  sites.south.group.visible = false;

  // ---------------------------------------------------------------- actors
  const actors = createActors(mats);
  const actorsRoot = new THREE.Group();
  actorsRoot.name = 'actors';
  scene.add(actorsRoot);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const a of Object.values(actors)) {
    actorsRoot.add(a.root);
    a.root.visible = false;
    if (a.kind === 'animal') continue;
    const size = a.box.getSize(new THREE.Vector3()), center = a.box.getCenter(new THREE.Vector3());
    const pad = a.kind === 'person' ? 0.5 : 0.4;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x + pad, size.y + pad, size.z + pad), proxyMat);
    proxy.position.copy(center);
    proxy.userData.objectId = a.id;
    a.root.add(proxy);
    a.proxy = proxy;
  }
  const sims = { north: createSimulation('north'), south: createSimulation('south') };
  let sim = sims.north;

  // ---------------------------------------------------------------- per-site extras: pins, proxies, cloud label, uplink
  const linkUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color('#2BB673') } };
  const linkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: linkUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float dash = smoothstep(0.35, 0.5, fract(vUv.x * 26.0 - uTime * 1.4)) * (1.0 - smoothstep(0.85, 1.0, fract(vUv.x * 26.0 - uTime * 1.4)));
        float a = 0.22 + 0.7 * dash;
        a *= smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        gl_FragColor = vec4(uColor * (0.9 + dash * 0.4), a);
      }`,
  });
  const pinTex = new Map();
  const getPinTex = (color, icon) => {
    const key = color + icon;
    if (!pinTex.has(key)) pinTex.set(key, pinTexture(color, icon));
    return pinTex.get(key);
  };
  const pickables = { north: [], south: [] };
  const pins = { north: [], south: [] };
  const labelSprites = [];
  for (const id of ['north', 'south']) {
    const s = sites[id];
    for (const o of s.objects) {
      const boxes = o.proxies || [o.box];
      for (const b of boxes) {
        const size = b.getSize(new THREE.Vector3()), center = b.getCenter(new THREE.Vector3());
        const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), proxyMat);
        m.position.copy(center);
        m.userData.objectId = o.id;
        s.group.add(m);
        pickables[id].push(m);
      }
      if (o.pin) {
        const { texture, aspect } = getPinTex('#1E7B4C', o.icon);
        const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true });
        const sp = new THREE.Sprite(mat);
        sp.center.set(0.5, 0);
        const h = o.pinSmall ? 2.4 : 3.3;
        sp.scale.set(h * aspect, h, 1);
        sp.position.copy(o.pin);
        sp.renderOrder = 20;
        sp.userData = { objectId: o.id, base: o.pin.clone(), h, aspect, icon: o.icon, phase: pins[id].length * 0.9 };
        s.group.add(sp);
        pins[id].push(sp);
      }
    }
    // uplink tube processor → cloud
    const a = s.anchors;
    // rises straight up from the processor and arcs over the farm to the cloud behind the tree line
    const curve = new THREE.CubicBezierCurve3(
      a.processorTop.clone(),
      a.processorTop.clone().add(new THREE.Vector3(0, 22, 0)),
      a.cloudBottom.clone().add(new THREE.Vector3(0, -14, 12)),
      a.cloudBottom.clone(),
    );
    s.uplink = curve;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.06, 6, false), linkMat);
    tube.renderOrder = 4;
    s.group.add(tube);
    // cloud label
    const lc = new LabelCanvas(640, 132);
    const dims = lc.draw(CLOUD_LABEL);
    const lm = new THREE.SpriteMaterial({ map: lc.texture, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true });
    const ls = new THREE.Sprite(lm);
    ls.center.set(0.5, 0);
    ls.position.copy(a.cloud).add(new THREE.Vector3(0, 4.6, 0));
    ls.renderOrder = 21;
    ls.userData.px = [dims.w, dims.h];
    s.group.add(ls);
    labelSprites.push(ls);
    s.cloudLabel = ls;
    s.cloudLabelCanvas = lc;
  }

  // ---------------------------------------------------------------- FX: rings, pills, packets, scan beam, selection
  const fxRoot = new THREE.Group();
  fxRoot.name = 'fx';
  scene.add(fxRoot);
  const dotTex = dotTexture(64);
  const packetTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 17, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const glowTex = glowRectTexture();

  const ringGeo = new THREE.RingGeometry(0.8, 1.0, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TONE.ok, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.visible = false; m.renderOrder = 6;
    fxRoot.add(m);
    rings.push({ mesh: m, t0: 0, dur: 1, size: 3, active: false });
  }
  // halo that stays under a person for 1.5 s after a face event (green: allowed, red: denied)
  const haloGeo = new THREE.RingGeometry(0.62, 0.9, 48);
  haloGeo.rotateX(-Math.PI / 2);
  const halos = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: TONE.ok, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.visible = false; m.renderOrder = 6; m.scale.setScalar(1.25);
    fxRoot.add(m);
    halos.push({ mesh: m, actor: null, t0: 0, active: false });
  }
  const pills = [];
  for (let i = 0; i < 5; i++) {
    const lc = new LabelCanvas(760, 132);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lc.texture, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true, opacity: 0 }));
    sp.center.set(0.5, 0); sp.visible = false; sp.renderOrder = 30;
    fxRoot.add(sp);
    labelSprites.push(sp);
    pills.push({ sprite: sp, lc, t0: 0, dur: 3.6, base: new THREE.Vector3(), active: false });
  }
  const packets = [];
  for (let i = 0; i < 8; i++) {
    const group = new THREE.Group();
    const dots = [];
    for (let j = 0; j < 4; j++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: j === 0 ? packetTex : dotTex, color: TONE.ok, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true }));
      sp.scale.setScalar(j === 0 ? 1.25 : 1.0 - j * 0.18);
      sp.renderOrder = 25;
      group.add(sp); dots.push(sp);
    }
    group.visible = false;
    fxRoot.add(group);
    packets.push({ group, dots, path: null, t0: 0, dur: 1.4, active: false, onArrive: null, onMid: null, midFired: false, midAt: 0.5 });
  }
  // ANPR scan beam (pyramid from the camera head to the plate)
  const beamGeo = new THREE.ConeGeometry(1, 1, 4, 1, true);
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(-Math.PI / 2);
  beamGeo.rotateZ(Math.PI / 4);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color('#16A35F') } },
    vertexShader: 'varying float vZ; void main(){ vZ = position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying float vZ;
      void main(){ float band = smoothstep(0.8, 1.0, fract(vZ * 2.2 - uTime * 2.4)); float a = (0.2 + 0.55 * band) * uAlpha * (0.45 + vZ * 0.55);
      gl_FragColor = vec4(mix(uColor, vec3(0.75, 1.0, 0.86), band * 0.5), a); }`,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false; beam.renderOrder = 7;
  fxRoot.add(beam);
  const scan = { active: false, t0: 0, dur: 1.7, from: 'anprIn', vehicle: null };

  // selection visuals
  const selMat = new THREE.MeshBasicMaterial({ color: '#25B36E', toneMapped: false, transparent: true, opacity: 0.96, depthWrite: false });
  const selGroup = new THREE.Group(); selGroup.visible = false; // no renderOrder on groups: it would become groupOrder for children
  const glowMat = new THREE.MeshBasicMaterial({ color: '#2BB673', alphaMap: glowTex, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const selGlow = new THREE.Mesh(glowGeo, glowMat); selGlow.visible = false; selGlow.renderOrder = 5;
  const selLabel = { lc: new LabelCanvas(760, 132) };
  selLabel.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: selLabel.lc.texture, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true }));
  selLabel.sprite.center.set(0.5, 0); selLabel.sprite.visible = false; selLabel.sprite.renderOrder = 31;
  labelSprites.push(selLabel.sprite);
  const hoverLabel = { lc: new LabelCanvas(760, 132), id: null };
  hoverLabel.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hoverLabel.lc.texture, sizeAttenuation: false, depthTest: false, depthWrite: false, toneMapped: false, fog: false, transparent: true, opacity: 0.94 }));
  hoverLabel.sprite.center.set(0.5, 0); hoverLabel.sprite.visible = false; hoverLabel.sprite.renderOrder = 31;
  labelSprites.push(hoverLabel.sprite);
  fxRoot.add(selLabel.sprite, hoverLabel.sprite);

  // ---------------------------------------------------------------- snow
  const SNOW_N = quality === 'low' ? 900 : 2600;
  const snowGeo = new THREE.BufferGeometry();
  const seeds = new Float32Array(SNOW_N * 3);
  let sr = 12345;
  const srand = () => { sr = (sr * 16807) % 2147483647; return sr / 2147483647; };
  for (let i = 0; i < SNOW_N * 3; i++) seeds[i] = srand();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  snowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(230, 70, 230) },
      uSize: { value: 2.4 }, uPR: { value: pixelRatio }, uAlpha: { value: 1 }, uTex: { value: dotTex },
    },
    vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uSize; uniform float uPR; varying float vA;
      void main(){
        vec3 s = position;
        vec3 p = s * uBox;
        p.y = mod(p.y - uTime * (2.2 + s.x * 2.0), uBox.y);
        p.x += sin(uTime * 0.7 + s.z * 6.283) * 1.4 + uTime * 1.6;
        p.z += cos(uTime * 0.5 + s.x * 6.283) * 1.0;
        p.xz = mod(p.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) + uCenter.xz - uBox.xz * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(uSize * uPR * (0.6 + s.y * 0.8) * (160.0 / -mv.z), 5.0 * uPR);
        vA = smoothstep(uBox.y, uBox.y * 0.75, p.y) * smoothstep(0.0, 3.0, p.y);
      }`,
    fragmentShader: `uniform float uAlpha; uniform sampler2D uTex; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(1.0, 1.0, 1.0, a * vA * uAlpha * 0.95); }`,
  });
  const snowPts = new THREE.Points(snowGeo, snowMat);
  snowPts.frustumCulled = false;
  snowPts.renderOrder = 9;
  snowPts.visible = !RM;
  scene.add(snowPts);

  // ---------------------------------------------------------------- controls
  // The mouse wheel scrolls the page; the scene zooms only with Ctrl / Cmd (and trackpad pinch, which sends ctrlKey).
  const onWheelGuard = (e) => { if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation(); };
  canvas.addEventListener('wheel', onWheelGuard, { passive: true });
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !RM;
  controls.dampingFactor = 0.085;
  controls.minDistance = 26;
  controls.maxDistance = 330;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.2;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.9;
  controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  canvas.style.touchAction = 'pan-y';

  // ---------------------------------------------------------------- state
  const state = {
    site: 'north', weather: 0, paused: false, disposed: false,
    simTime: 0, lastLt: 0, selected: null, followId: null,
    flight: null, alarms: new Map(), screens: new Map(), userDoors: {}, ledFlash: 0,
    needsRender: true, hoverDirty: false,
    atHome: true, selRadius: 0, selStatic: true,
  };
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpS = new THREE.Spherical();
  const poseTmp = {};
  let viewW = 1, viewH = 1;

  function currentSite() { return sites[state.site]; }
  function siteObjects(siteId) {
    const s = sites[siteId];
    const list = s.objects.map((o) => ({ id: o.id, kind: o.kind, name: o.name, site: siteId, subtitle: o.subtitle }));
    for (const [id, v] of Object.entries(VEHICLES)) { const pl = plateOf(id, siteId); list.push({ id, kind: 'vehicle', name: v.name, site: siteId, subtitle: pl, plate: pl }); }
    for (const [id, p] of Object.entries(PEOPLE)) list.push({ id, kind: 'person', name: p.name, site: siteId, subtitle: p.role });
    return list;
  }
  function findObject(id) {
    const s = currentSite();
    const st = s.objects.find((o) => o.id === id);
    if (st) return { kind: 'static', def: st, site: s };
    if (actors[id] && actors[id].kind !== 'animal') return { kind: 'actor', actor: actors[id], def: VEHICLES[id] || PEOPLE[id] };
    return null;
  }

  // ---------------------------------------------------------------- sizing
  function pxScale() { return (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, viewH); }
  function applyLabelScale(sp) {
    const [w, h] = sp.userData.px || [100, 30];
    const k = pxScale() * (viewW < 600 ? 0.82 : 1);
    sp.scale.set(w * k, h * k, 1);
  }
  function resize() {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 800);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 500);
    if (w === viewW && h === viewH) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (userInsets && !curInsets) curInsets = { ...userInsets };
    applyViewOffset();
    if (state.atHome && !state.selected && !state.flight && state.homePlaced) refit(false);
    for (const sp of labelSprites) applyLabelScale(sp);
    snowMat.uniforms.uPR.value = renderer.getPixelRatio();
    requestRender();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);

  // The app draws glass panels over the canvas. The camera keeps its orbit target in the middle of the
  // uncovered area (asymmetric frustum), so framing, selection and rotation all happen around that point.
  // userInsets is what the app asked for; curInsets eases towards it so panels opening and closing
  // (the phone's bottom sheet, for example) slide the picture instead of making it jump.
  let userInsets = null, curInsets = null, avoidRects = [];
  const EDGES = ['top', 'right', 'bottom', 'left'];
  function defaultInsets() {
    const aspect = viewW / viewH;
    if (viewW >= 980 && aspect >= 1.1) return { top: viewH * 0.2, right: viewW * 0.25, bottom: viewH * 0.08, left: 0 };
    if (aspect < 0.9) return { top: viewH * 0.2, right: 0, bottom: viewH * 0.1, left: 0 };
    return { top: viewH * 0.18, right: 0, bottom: viewH * 0.08, left: 0 };
  }
  function targetInsets() { return userInsets || defaultInsets(); }
  function insets() { return (userInsets && curInsets) || targetInsets(); }
  function rectOf(i) {
    const w = Math.max(viewW * 0.3, viewW - i.left - i.right), h = Math.max(viewH * 0.3, viewH - i.top - i.bottom);
    const left = Math.min(i.left, viewW - w), top = Math.min(i.top, viewH - h);
    return { cx: left + w / 2, cy: top + h / 2, w, h, x0: left, y0: top };
  }
  // useTarget: where the camera should end up (the insets being eased towards), not where it is now
  function freeRect(useTarget) { return rectOf(useTarget ? targetInsets() : insets()); }
  function applyViewOffset() {
    const f = freeRect();
    camera.setViewOffset(viewW, viewH, viewW / 2 - f.cx, viewH / 2 - f.cy, viewW, viewH);
    camera.updateProjectionMatrix();
  }
  function easeInsets(dt) {
    if (!userInsets || !curInsets) return false;
    const k = RM || dt <= 0 ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false, changed = false;
    for (const e of EDGES) {
      const d = userInsets[e] - curInsets[e];
      if (Math.abs(d) < 0.5) { if (d) { curInsets[e] = userInsets[e]; changed = true; } continue; }
      curInsets[e] += d * k; moving = true; changed = true;
    }
    if (changed) applyViewOffset();
    return moving;
  }
  // Event pills and labels near the edge slide sideways so they stay inside the free part of the canvas;
  // one that would go under the top panels flips below its point.
  const edgeV = new THREE.Vector3();
  function keepLabelsInView() {
    const f = freeRect();
    const lo = f.x0 + 6, hi = f.x0 + f.w - 6, top = f.y0 + 6;
    camera.updateMatrixWorld();
    const k = viewW < 600 ? 0.82 : 1;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (const sp of labelSprites) {
      if (!sp.visible || !sp.userData.px) continue;
      sp.getWorldPosition(edgeV);
      const w = sp.userData.px[0] * k, h = sp.userData.px[1] * k;
      // default anchor: centred above the point; a side label (the cloud) sits left of its object
      let cx0 = 0.5, cy0 = 0;
      if (sp.userData.sideRadius) {
        const rpx = (sp.userData.sideRadius * viewH) / (2 * Math.max(1, camera.position.distanceTo(edgeV)) * tanV);
        cx0 = 1 + (rpx + 8) / w; cy0 = 0.5;
      }
      edgeV.project(camera);
      let cx = cx0, cy = cy0;
      if (edgeV.z < 1) {
        const px = ((edgeV.x + 1) / 2) * viewW;
        if (px - cx * w < lo) cx = (px - lo) / w;
        else if (px + (1 - cx) * w > hi) cx = 1 - (hi - px) / w;
        cx = clamp(cx, Math.min(0.1, cx0), Math.max(0.9, cx0));
        const py = ((1 - edgeV.y) / 2) * viewH;
        // flips below its point; if the point itself is under the panels, the label slides down into view
        if (py - (1 - cy) * h < top) cy = clamp((top - (py - h)) / h, cy0, 2.6);
      }
      // small panels inside the free area (the view buttons): the label moves to the side of them
      if (edgeV.z < 1 && avoidRects.length) {
        const px = ((edgeV.x + 1) / 2) * viewW, py = ((1 - edgeV.y) / 2) * viewH;
        const l = px - cx * w, r = l + w, t = py - (1 - cy) * h, b = t + h;
        for (const a of avoidRects) {
          if (r <= a.x0 || l >= a.x1 || b <= a.y0 || t >= a.y1) continue;
          if (px <= (a.x0 + a.x1) / 2) cx = (px - (a.x0 - 6 - w)) / w;
          else cx = (px - (a.x1 + 6)) / w;
        }
      }
      if (Math.abs(sp.center.x - cx) > 0.002) { sp.center.x = cx; state.needsRender = true; }
      if (Math.abs(sp.center.y - cy) > 0.002) { sp.center.y = cy; state.needsRender = true; }
    }
  }
  const fitCam = new THREE.PerspectiveCamera();
  const fitV = new THREE.Vector3();
  // Smallest distance (and a re-centred target) at which every frame point lands inside the free rect.
  function fitHome(siteId, az, polar, points) {
    const f = freeRect(true);
    fitCam.copy(camera);
    fitCam.setViewOffset(viewW, viewH, viewW / 2 - f.cx, viewH / 2 - f.cy, viewW, viewH);
    fitCam.updateProjectionMatrix();
    const o = SITE_ORIGINS[siteId];
    const target = o.clone().add(HOME.offset);
    const m = Math.min(f.w, f.h) * 0.025 + 4;
    const box = { x0: f.x0 + m, x1: f.x0 + f.w - m, y0: f.y0 + m, y1: f.y0 + f.h - m };
    const tanV = Math.tan(THREE.MathUtils.degToRad(fitCam.fov) / 2);
    const bounds = (dist) => {
      tmpS.set(dist, polar, az);
      fitCam.position.setFromSpherical(tmpS).add(target);
      fitCam.lookAt(target);
      fitCam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y, z, up, side] of points) {
        fitV.set(o.x + x, o.y + y, o.z + z).project(fitCam);
        const px = ((fitV.x + 1) / 2) * viewW, py = ((1 - fitV.y) / 2) * viewH;
        x0 = Math.min(x0, px - side); x1 = Math.max(x1, px + side);
        y0 = Math.min(y0, py - up); y1 = Math.max(y1, py);
      }
      return { x0, x1, y0, y1 };
    };
    const fitsAt = (d) => { const b = bounds(d); return b.x1 - b.x0 <= box.x1 - box.x0 && b.y1 - b.y0 <= box.y1 - box.y0; };
    const lo0 = Math.max(controls.minDistance, 50), hi0 = controls.maxDistance;
    let dist = hi0;
    for (let iter = 0; iter < 4; iter++) {
      let lo = lo0, hi = hi0;
      if (fitsAt(lo)) hi = lo;
      else if (fitsAt(hi)) { for (let s = 0; s < 16; s++) { const mid = (lo + hi) / 2; if (fitsAt(mid)) hi = mid; else lo = mid; } }
      dist = hi;
      const b = bounds(dist);
      const dx = (b.x0 + b.x1) / 2 - (box.x0 + box.x1) / 2;
      const dy = (b.y0 + b.y1) / 2 - (box.y0 + box.y1) / 2;
      const upp = (2 * dist * tanV) / viewH;
      target.x += Math.cos(az) * dx * upp; target.z -= Math.sin(az) * dx * upp;
      const g = (dy * upp) / Math.max(0.35, Math.cos(polar));
      target.x += Math.sin(az) * g; target.z += Math.cos(az) * g;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
    }
    return { target, dist: clamp(dist * 1.01, controls.minDistance, controls.maxDistance) };
  }
  function homeView(siteId) {
    const tall = viewW / viewH < 0.8;
    // a very wide, low free area (laptops with short screens): look more from the side so the farm fills it
    const fr = freeRect(true), wide = clamp((fr.w / fr.h - 1.9) / 1.3, 0, 1);
    const az = tall ? HOME.azTall : HOME.az, polar = tall ? HOME.polarTall : lerp(HOME.polar, 1.1, wide);
    const fr2 = FRAMES[siteId] || FRAMES.north;
    const { target, dist } = fitHome(siteId, az, polar, tall ? fr2.tall : fr2.wide);
    return { target, dist, az, polar };
  }
  // Distance at which a selected object fills ~70% of the free area's shorter side.
  function selectionDistance(radius, isStatic) {
    const f = freeRect(true);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const want = (radius * viewH) / (0.7 * Math.min(f.w, f.h) * tanV);
    return clamp(want, isStatic ? 40 : 26, 170);
  }
  // Called when the free area changed: keep the overview or the selected object framed.
  function refit(animate) {
    if (state.disposed) return;
    if (state.selected) {
      const v = currentView();
      const dist = selectionDistance(state.selRadius, state.selStatic);
      if (Math.abs(dist - v.dist) / v.dist < 0.06) return;
      const target = state.flight ? state.flight.to.target : v.target;
      flyTo({ target, dist, az: state.flight ? state.flight.to.az : v.az, polar: state.flight ? state.flight.to.polar : v.polar }, { dur: animate ? 0.6 : 0 });
    } else if (state.atHome && !(state.flight && state.flight.arc)) {
      const h = homeView(state.site);
      if (animate) flyTo(h, { dur: 0.6 });
      else flyTo(h, { dur: 0 });
    }
  }
  function placeCamera(target, dist, az, polar) {
    tmpS.set(dist, polar, az);
    camera.position.setFromSpherical(tmpS).add(target);
    camera.lookAt(target);
    controls.target.copy(target);
  }
  function currentView() {
    tmpV.copy(camera.position).sub(controls.target);
    tmpS.setFromVector3(tmpV);
    return { target: controls.target.clone(), dist: tmpS.radius, az: tmpS.theta, polar: tmpS.phi };
  }

  // ---------------------------------------------------------------- camera flights
  function flyTo(view, { dur = 1.2, arc = 0, onProgress = null } = {}) {
    if (state.flight && state.flight.resolve) state.flight.resolve();
    const from = currentView();
    let toAz = view.az ?? from.az;
    while (toAz - from.az > Math.PI) toAz -= Math.PI * 2;
    while (toAz - from.az < -Math.PI) toAz += Math.PI * 2;
    const to = { target: view.target.clone(), dist: clamp(view.dist ?? from.dist, controls.minDistance, controls.maxDistance), az: toAz, polar: clamp(view.polar ?? from.polar, controls.minPolarAngle, controls.maxPolarAngle) };
    return new Promise((resolve) => {
      if (RM || dur <= 0) {
        state.flight = null;
        controls.enabled = true;
        if (onProgress) onProgress(1);
        placeCamera(to.target, to.dist, to.az, to.polar);
        controls.update();
        requestRender();
        resolve();
        return;
      }
      controls.enabled = false;
      state.flight = { t0: performance.now(), dur: dur * 1000, from, to, arc, onProgress, resolve };
      requestRender();
    });
  }
  function updateFlight(now) {
    const f = state.flight;
    if (!f) return;
    const k = clamp((now - f.t0) / f.dur, 0, 1);
    const e = easeInOut(k);
    const target = tmpV2.copy(f.from.target).lerp(f.to.target, e);
    const dist = lerp(f.from.dist, f.to.dist, e) * (1 + f.arc * Math.sin(Math.PI * e));
    const az = lerp(f.from.az, f.to.az, e);
    const polar = lerp(f.from.polar, f.to.polar, e) - Math.min(0.3, f.arc * 0.14) * Math.sin(Math.PI * e);
    placeCamera(target, dist, az, clamp(polar, 0.3, 1.25));
    if (f.onProgress) f.onProgress(e);
    if (k >= 1) {
      state.flight = null;
      controls.enabled = true;
      controls.update();
      f.resolve();
    }
  }

  // ---------------------------------------------------------------- weather / site
  const envA = ENV.north, envB = ENV.south;
  const cA = new THREE.Color(), cB = new THREE.Color();
  function applyWeather(w) {
    state.weather = w;
    const mix = (a, b) => cA.set(a).lerp(cB.set(b), w);
    scene.background.copy(mix(envA.bg, envB.bg));
    scene.fog.color.copy(scene.background);
    hemi.color.copy(mix(envA.hemiSky, envB.hemiSky));
    hemi.groundColor.copy(mix(envA.hemiGround, envB.hemiGround));
    hemi.intensity = lerp(envA.hemi, envB.hemi, w);
    sun.color.copy(mix(envA.sun, envB.sun));
    sun.intensity = lerp(envA.sunI, envB.sunI, w);
    scene.environmentIntensity = lerp(envA.env, envB.env, w);
    renderer.toneMappingExposure = lerp(envA.exposure, envB.exposure, w);
    snowMat.uniforms.uAlpha.value = clamp(1 - w * 1.6, 0, 1);
    snowPts.visible = !RM && snowMat.uniforms.uAlpha.value > 0.01;
  }
  const sunCenter = new THREE.Vector3();
  function placeSun() {
    const dir = tmpV.copy(envA.sunDir).lerp(envB.sunDir, state.weather);
    sun.position.copy(sunCenter).add(dir.multiplyScalar(2.2));
    sun.target.position.copy(sunCenter);
    sun.target.updateMatrixWorld();
  }

  function moveActorsTo(siteId) {
    actorsRoot.position.copy(SITE_ORIGINS[siteId]);
    sim = sims[siteId];
    for (const h of halos) { h.active = false; h.mesh.visible = false; }
  }

  async function setSite(siteId) {
    if (!sites[siteId]) throw new Error('Неизвестный объект: ' + siteId);
    if (state.disposed) return;
    if (siteId === state.site && !state.flight) { state.atHome = true; await flyTo(homeView(siteId), { dur: 1.0 }); return; }
    const from = state.site;
    clearSelection();
    state.atHome = true;
    state.site = siteId;
    sites[siteId].group.visible = true;
    const wFrom = state.weather, wTo = siteId === 'south' ? 1 : 0;
    let moved = false;
    const sunFrom = SITE_ORIGINS[from].clone(), sunTo = SITE_ORIGINS[siteId].clone();
    await flyTo(homeView(siteId), {
      dur: 3.2, arc: 2.1,
      onProgress: (e) => {
        applyWeather(lerp(wFrom, wTo, smooth(e)));
        sunCenter.copy(sunFrom).lerp(sunTo, e);
        placeSun();
        if (!moved && e >= 0.5) { moveActorsTo(siteId); moved = true; }
      },
    });
    if (state.site !== siteId || state.disposed) return; // another setSite() took over
    if (!moved) moveActorsTo(siteId);
    applyWeather(wTo);
    sunCenter.copy(SITE_ORIGINS[siteId]); placeSun();
    if (state.site === siteId) sites[from].group.visible = from === siteId;
    requestRender();
  }

  // ---------------------------------------------------------------- selection
  function bracketGeometry(size) {
    const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
    const big = Math.max(size.x, size.y, size.z);
    const t = clamp(big * 0.011, 0.07, 0.24);
    const lh = clamp(Math.min(size.x, size.z) * 0.24, 0.45, 4.2);
    const lv = clamp(size.y * 0.3, 0.35, 2.6);
    const geos = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * hx, cy = sy * hy, cz = sz * hz;
      const bx = new THREE.BoxGeometry(lh, t, t); bx.translate(cx - sx * lh / 2, cy, cz); geos.push(bx);
      const by = new THREE.BoxGeometry(t, lv, t); by.translate(cx, cy - sy * lv / 2, cz); geos.push(by);
      const bz = new THREE.BoxGeometry(t, t, lh); bz.translate(cx, cy, cz - sz * lh / 2); geos.push(bz);
    }
    const g = new THREE.BufferGeometry();
    let n = 0;
    const nonIdx = geos.map((x) => { const y = x.toNonIndexed(); n += y.attributes.position.count; return y; });
    const pos = new Float32Array(n * 3); let o = 0;
    for (const y of nonIdx) { pos.set(y.attributes.position.array, o); o += y.attributes.position.array.length; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }
  let selMesh = null;
  function clearSelection() {
    state.selected = null; state.followId = null; selLabel.revertAt = 0;
    selGroup.visible = false; selGlow.visible = false; selLabel.sprite.visible = false;
    if (selMesh) { selMesh.geometry.dispose(); selGroup.remove(selMesh); selMesh = null; }
    selGroup.removeFromParent(); selGlow.removeFromParent(); selLabel.sprite.removeFromParent();
    requestRender();
  }
  function drawLabel(lc, sprite, info) {
    const d = lc.draw(info);
    sprite.userData.px = [d.w, d.h];
    applyLabelScale(sprite);
  }
  function labelInfo(id) {
    const f = findObject(id);
    if (!f) return null;
    if (f.kind === 'static') return { title: f.def.name, subtitle: f.def.subtitle, tone: 'accent' };
    if (VEHICLES[id]) return { title: VEHICLES[id].name, chip: plateOf(id, state.site), tone: id === 'unknown-car' ? 'alarm' : 'accent' };
    const p = PEOPLE[id];
    return { title: p.name, subtitle: p.role, tone: id === 'stranger' ? 'alarm' : 'accent' };
  }
  function selectInternal(id, { fly = true } = {}) {
    const f = findObject(id);
    if (!f) return false;
    if (f.kind === 'actor' && !f.actor.root.visible) return false;
    if (state.selected === id) return true;
    clearSelection();
    state.selected = id;
    let size, center, parent;
    if (f.kind === 'static') {
      size = f.def.box.getSize(new THREE.Vector3()).add(new THREE.Vector3(1.2, 0.8, 1.2));
      center = f.def.box.getCenter(new THREE.Vector3());
      center.y = size.y / 2 + 0.03;
      parent = f.site.group;
    } else {
      size = f.actor.box.getSize(new THREE.Vector3()).add(new THREE.Vector3(0.8, 0.5, 0.8));
      center = f.actor.box.getCenter(new THREE.Vector3());
      parent = f.actor.root;
    }
    selMesh = new THREE.Mesh(bracketGeometry(size), selMat);
    selMesh.renderOrder = 8;
    selGroup.add(selMesh);
    selGroup.position.copy(center);
    selGroup.visible = true;
    selGroup.userData.t0 = performance.now();
    parent.add(selGroup);
    selGlow.scale.set(size.x + 2.4, 1, size.z + 2.4);
    selGlow.position.set(center.x, 0.08, center.z);
    selGlow.visible = true;
    parent.add(selGlow);
    drawLabel(selLabel.lc, selLabel.sprite, labelInfo(id));
    selLabel.sprite.position.set(center.x, center.y + size.y / 2 + 0.6, center.z);
    if (f.kind === 'static' && f.def.pin) selLabel.sprite.position.copy(f.def.pin).add(new THREE.Vector3(0, 0.6, 0));
    selLabel.sprite.visible = true;
    parent.add(selLabel.sprite);
    if (hoverLabel.id === id) { hoverLabel.sprite.visible = false; hoverLabel.id = null; }
    if (fly) {
      // a frame box (perimeter camera: pole + the line it watches) decides where the camera looks and how far
      const fb = f.kind === 'static' && f.def.frameBox;
      const fCenter = fb ? fb.getCenter(new THREE.Vector3()) : center.clone();
      const worldCenter = parent.localToWorld(fCenter);
      worldCenter.y = fb ? 1.5 : Math.min(center.y, 4);
      const radius = fb ? fb.getSize(new THREE.Vector3()).length() / 2 : size.length() / 2;
      state.selRadius = radius; state.selStatic = f.kind === 'static'; state.atHome = false;
      const dist = selectionDistance(radius, f.kind === 'static');
      const v = currentView();
      flyTo({ target: worldCenter, dist, az: v.az, polar: clamp(v.polar, 0.78, 1.05) }, { dur: 1.1 });
      state.followId = f.kind === 'actor' ? id : null;
    }
    requestRender();
    return true;
  }

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer = { x: 0, y: 0, inside: false, down: null };
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const list = [...pickables[state.site], ...pins[state.site]];
    for (const a of Object.values(actors)) if (a.proxy && a.root.visible) list.push(a.proxy);
    const hits = raycaster.intersectObjects(list, false);
    if (!hits.length) return null;
    // pins and actors win over large building proxies
    const best = hits.find((h) => h.object.isSprite) || hits.find((h) => actors[h.object.userData.objectId]) || hits[0];
    return best.object.userData.objectId || null;
  }
  function onPointerDown(e) {
    pointer.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onPointerUp(e) {
    const d = pointer.down; pointer.down = null;
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 6 || performance.now() - d.t > 700) return;
    const id = pick(e.clientX, e.clientY);
    if (id) { selectInternal(id, { fly: true }); onSelect(id); }
    else { clearSelection(); onSelect(null); }
  }
  function onPointerMove(e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
    if (pointer.down && Math.hypot(e.clientX - pointer.down.x, e.clientY - pointer.down.y) > 6) state.followId = null;
    state.hoverDirty = true;
    if (RM) { updateHover(); }
  }
  function onPointerCancel() { pointer.down = null; state.hoverDirty = true; }
  function onPointerLeave() {
    pointer.inside = false; state.hoverDirty = true;
    if (RM) updateHover();
  }
  function updateHover() {
    if (!state.hoverDirty) return;
    state.hoverDirty = false;
    const id = pointer.inside && !pointer.down ? pick(pointer.x, pointer.y) : null;
    canvas.style.cursor = id ? 'pointer' : '';
    if (id === hoverLabel.id) return;
    hoverLabel.id = id;
    if (!id || id === state.selected) { hoverLabel.sprite.visible = false; requestRender(); return; }
    const f = findObject(id);
    drawLabel(hoverLabel.lc, hoverLabel.sprite, { ...labelInfo(id), tone: 'neutral' });
    hoverLabel.target = f;
    hoverLabel.sprite.visible = true;
    requestRender();
  }
  function placeHoverLabel() {
    const f = hoverLabel.target;
    if (!hoverLabel.sprite.visible || !f) return;
    if (f.kind === 'static') {
      const b = f.def.box;
      tmpV.set((b.min.x + b.max.x) / 2, b.max.y + 0.9, (b.min.z + b.max.z) / 2);
      if (f.def.pin) tmpV.copy(f.def.pin).add(new THREE.Vector3(0, f.def.pinSmall ? 2.6 : 3.6, 0));
      hoverLabel.sprite.position.copy(f.site.group.localToWorld(tmpV));
    } else {
      if (!f.actor.root.visible) { hoverLabel.sprite.visible = false; return; }
      tmpV.set(0, f.actor.box.max.y + 0.8, 0);
      hoverLabel.sprite.position.copy(f.actor.root.localToWorld(tmpV));
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerCancel);
  controls.addEventListener('change', () => requestRender());
  controls.addEventListener('start', () => { state.atHome = false; });

  // ---------------------------------------------------------------- FX helpers
  function siteAnchor(name, siteId = state.site) {
    const a = sites[siteId].anchors[name];
    return a ? a.clone().add(SITE_ORIGINS[siteId]) : SITE_ORIGINS[siteId].clone();
  }
  function spawnRing(pos, tone, size = 3, delay = 0) {
    const r = rings.find((x) => !x.active) || rings[0];
    r.active = true; r.t0 = performance.now() + delay; r.dur = 1300; r.size = size;
    r.mesh.position.copy(pos); r.mesh.position.y = Math.max(0.09, pos.y);
    r.mesh.material.color.set(TONE[tone] || tone);
    r.mesh.visible = !RM;
    r.mesh.material.opacity = 0;
  }
  function spawnPill(pos, info, lift = 2) {
    const p = pills.find((x) => !x.active) || pills.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    p.active = true; p.t0 = performance.now(); p.dur = RM ? 4200 : 3800;
    const d = p.lc.draw(info);
    p.sprite.userData.px = [d.w, d.h];
    applyLabelScale(p.sprite);
    p.base.copy(pos).add(new THREE.Vector3(0, lift, 0));
    p.sprite.position.copy(p.base);
    p.sprite.visible = true;
    p.sprite.material.opacity = RM ? 1 : 0;
  }
  function spawnPacket(points, tone, dur = 1.4, { onArrive = null, onMid = null, midAt = 0.5 } = {}) {
    if (RM || state.paused) { if (onMid) onMid(); if (onArrive) onArrive(); return; }
    const p = packets.find((x) => !x.active);
    if (!p) { if (onMid) onMid(); if (onArrive) onArrive(); return; }
    p.active = true; p.t0 = performance.now(); p.dur = dur * 1000; p.onArrive = onArrive; p.onMid = onMid; p.midFired = false; p.midAt = midAt;
    p.path = points;
    for (const d of p.dots) d.material.color.set(TONE[tone] || tone);
    p.group.visible = true;
  }
  function uplinkPath(fromWorld, siteId = state.site) {
    const s = sites[siteId];
    const o = SITE_ORIGINS[siteId];
    const proc = s.anchors.processorTop.clone().add(o);
    const mid = fromWorld.clone().lerp(proc, 0.5); mid.y = Math.max(fromWorld.y, proc.y) + 4 + fromWorld.distanceTo(proc) * 0.12;
    const a = new THREE.QuadraticBezierCurve3(fromWorld.clone(), mid, proc.clone());
    const up = s.uplink;
    const b = { getPoint: (t, out = new THREE.Vector3()) => up.getPoint(t, out).add(o) };
    const la = a.getLength(), lb = up.getLength();
    const split = la / (la + lb);
    return { split, getPoint: (t, out) => (t < split ? a.getPoint(t / split, out) : b.getPoint((t - split) / (1 - split), out)) };
  }
  function downlinkPath(toWorld, siteId = state.site) {
    const up = uplinkPath(toWorld, siteId);
    return { split: 1 - up.split, getPoint: (t, out) => up.getPoint(1 - t, out) };
  }
  function flashScreen(anchorName, tone, ms = 2000) {
    const part = { cpIn: 'cpInScreen', cpOut: 'cpOutScreen', feedTerm: 'feedScreen', officeTerm: 'officeScreen', barnTerm: 'barnScreen' }[anchorName];
    if (!part) return;
    state.screens.set(part, { until: performance.now() + ms, color: TONE[tone] || tone });
  }
  function raiseAlarm(objectId, ms = 9000) {
    state.alarms.set(objectId, performance.now() + ms);
    for (const sp of pins[state.site]) if (sp.userData.objectId === objectId) sp.material.map = getPinTex(ALARM, 'alert').texture;
    if (objectId === 'perimeter-cam') {
      const s = currentSite();
      s.parts.vline.material.uniforms.uColor.value.set('#FF4D4F');
      s.parts.wedge.material.uniforms.uColor.value.set('#FF4D4F');
      s.parts.wedge.material.uniforms.uAlpha.value = 0.3;
    }
    const pos = objectId === 'perimeter-cam' ? siteAnchor('perimCam') : siteAnchor('cpIn');
    for (let i = 0; i < 3; i++) spawnRing(tmpV.copy(pos).setY(0.1), 'alarm', 5 + i, i * 420);
  }
  function clearAlarm(objectId) {
    state.alarms.delete(objectId);
    for (const id of ['north', 'south']) for (const sp of pins[id]) if (sp.userData.objectId === objectId) sp.material.map = getPinTex('#1E7B4C', sp.userData.icon).texture;
    if (objectId === 'perimeter-cam') {
      for (const id of ['north', 'south']) {
        sites[id].parts.vline.material.uniforms.uColor.value.set('#2BD67B');
        sites[id].parts.wedge.material.uniforms.uColor.value.set('#2BD67B');
        sites[id].parts.wedge.material.uniforms.uAlpha.value = 0.16;
      }
    }
  }

  // ---------------------------------------------------------------- simulation events
  // An event of the object that is already selected is shown as the second line of its label, not as a pill.
  function showOnSelection(fx) {
    const base = labelInfo(state.selected);
    if (!base) return;
    const line = fx.title === base.chip || fx.title === base.title ? fx.chip : `${fx.title} · ${fx.chip}`;
    drawLabel(selLabel.lc, selLabel.sprite, { title: base.title, chip: base.chip, subtitle: line, tone: fx.tone === 'alarm' ? 'alarm' : 'ok' });
    selLabel.revertAt = performance.now() + (RM ? 4200 : 3800);
  }
  function spawnHalo(actorId, tone) {
    if (!actors[actorId]) return;
    const h = halos.find((x) => !x.active) || halos.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    h.active = true; h.actor = actorId; h.t0 = performance.now();
    h.mesh.material.color.set(TONE[tone] || tone);
  }
  function runFx(list, emit) {
    const src = emit ? [emit.objectId] : [];
    if (emit && emit.objectId === 'perimeter-cam') src.push('perimeter');
    for (const fx of list) {
      let pos = fx.anchor ? siteAnchor(fx.anchor) : fx.pos ? new THREE.Vector3(...fx.pos).add(SITE_ORIGINS[state.site]) : null;
      if (fx.vehicle && actors[fx.vehicle]) pos = actors[fx.vehicle].root.getWorldPosition(new THREE.Vector3());
      switch (fx.type) {
        case 'scan':
          scan.active = !RM; scan.t0 = performance.now(); scan.from = fx.at; scan.vehicle = fx.vehicle;
          break;
        case 'ring': spawnRing(pos, fx.tone, fx.size || 3); break;
        case 'pill': {
          const ids = [...src, fx.vehicle, fx.actor].filter(Boolean);
          if (state.selected && selLabel.sprite.visible && ids.includes(state.selected)) showOnSelection(fx);
          else spawnPill(pos, { title: fx.title, subtitle: fx.subtitle, chip: fx.chip, tone: fx.tone }, fx.lift || 2);
          break;
        }
        case 'halo': spawnHalo(fx.actor, fx.tone); break;
        case 'screen': flashScreen(fx.anchor, fx.tone); break;
        case 'packet': {
          const path = uplinkPath(pos);
          spawnPacket(path, fx.tone, 1.6, { midAt: path.split, onMid: () => { state.ledFlash = performance.now(); } });
          break;
        }
        case 'alarm': raiseAlarm(fx.objectId); break;
        default: break;
      }
    }
  }
  function processEvents(fromT, toT) {
    // events with t in (fromT, toT], handling the loop wrap
    const fire = (e) => {
      if (e.fx && e.fx.length) runFx(e.fx, e.emit);
      if (e.emit) {
        try { onEvent({ ...e.emit, time: new Date() }); } catch (err) { console.error(err); }
      }
      requestRender();
    };
    if (toT >= fromT) { for (const e of sim.events) if (e.t > fromT && e.t <= toT) fire(e); }
    else {
      for (const e of sim.events) if (e.t > fromT) fire(e);
      for (const e of sim.events) if (e.t <= toT) fire(e);
    }
  }

  // ---------------------------------------------------------------- per-frame updates
  const cowMat = new THREE.Matrix4(), cowQ = new THREE.Quaternion(), cowE = new THREE.Euler(), cowP = new THREE.Vector3(), cowS = new THREE.Vector3(1, 1, 1);
  function updateActors(lt, simT) {
    for (const [id, tr] of Object.entries(sim.tracks)) {
      const a = actors[id];
      if (!a) continue;
      tr.pose(lt, poseTmp);
      a.root.visible = poseTmp.visible && poseTmp.fade > 0.01;
      if (!a.root.visible) {
        if (state.selected === id) { clearSelection(); try { onSelect(null); } catch (e) { /* ignore */ } }
        continue;
      }
      a.root.position.set(poseTmp.x, 0, poseTmp.z);
      a.root.rotation.y = poseTmp.yaw;
      const f = RM ? 1 : easeOut(poseTmp.fade);
      a.root.scale.setScalar(Math.max(0.001, f));
      if (a.kind === 'person' || a.kind === 'animal') {
        const walking = poseTmp.moving && !RM;
        const ph = simT * (a.kind === 'animal' ? 16 : 8.5) + id.length;
        a.body.position.y = walking ? Math.abs(Math.sin(ph)) * (a.kind === 'animal' ? 0.12 : 0.11) : 0;
        a.body.rotation.x = walking ? Math.sin(ph) * 0.05 : 0;
        a.body.rotation.z = walking ? -0.05 : (RM ? 0 : Math.sin(simT * 0.8 + id.length) * 0.012);
      } else {
        a.body.position.y = poseTmp.moving && !RM ? Math.sin(simT * 13 + id.length) * 0.015 : 0;
      }
    }
    actors.tractor.bale.visible = sim.props.bale(lt);
  }
  function updateFixtures(lt, now) {
    const s = currentSite();
    const P = s.parts;
    const user = (id) => {
      const u = state.userDoors[id];
      if (!u) return 0;
      const t = (now - u.openAt) / 1000;
      if (t < 0) return 0;
      if (t < u.openDur) return smooth(t / u.openDur);
      if (t < u.openDur + u.hold) return 1;
      const c = 1 - (t - u.openDur - u.hold) / u.closeDur;
      if (c <= 0) { delete state.userDoors[id]; return 0; }
      return smooth(c);
    };
    P.barrier.rotation.z = sim.props.barrier(lt) * THREE.MathUtils.degToRad(84);
    let turn = sim.props.turnstile(lt);
    const ut = state.userDoors.checkpoint;
    if (ut) {
      const t = (now - ut.openAt) / 1000;
      turn += (t <= 0 ? 0 : easeInOut(clamp(t / 0.9, 0, 1))) * (Math.PI * 2 / 3);
      if (t > 6) delete state.userDoors.checkpoint;
    }
    P.turnstile.userData.spin.rotation.y = turn;
    const fd = Math.max(sim.props.feedDoor(lt), user('feed'));
    const door = P.feedDoor;
    door.scale.y = Math.max(0.04, 1 - fd * 0.96);
    const od = Math.max(sim.props.officeDoor(lt), user('office'));
    P.officeDoor.rotation.y = -od * 1.45;
    // screens
    for (const key of ['cpInScreen', 'cpOutScreen', 'feedScreen', 'officeScreen', 'barnScreen']) {
      const sc = P[key]; if (!sc) continue;
      const st = state.screens.get(key);
      if (st && st.until > now) sc.material.color.set(st.color);
      else { if (st) state.screens.delete(key); sc.material.color.copy(sc.mesh.userData.idle); }
    }
    // processor LED: calm pulse, bright flash on traffic
    const flash = clamp(1 - (now - state.ledFlash) / 380, 0, 1);
    const pulse = RM ? 0.8 : 0.65 + 0.35 * Math.sin(now / 520);
    P.led.material.color.copy(LED_GREEN).multiplyScalar(0.7 + pulse * 0.3 + flash * 0.9);
    P.led.halo.material.opacity = 0.3 + pulse * 0.25 + flash * 0.5;
    // alarms timeout
    for (const [id, until] of state.alarms) if (now > until) clearAlarm(id);
    P.vline.material.uniforms.uTime.value = RM ? 0 : now / 1000;
    // cows
    if (!RM || state.needsRender) {
      const spots = P.cows.userData.spots;
      for (let i = 0; i < spots.length; i++) {
        const [x, z, ry] = spots[i];
        const tt = now / 1000 + i * 3.1;
        cowP.set(x + (RM ? 0 : Math.sin(tt * 0.13) * 0.4), 0, z + (RM ? 0 : Math.cos(tt * 0.11) * 0.25));
        cowE.set(0, ry + (RM ? 0 : Math.sin(tt * 0.21) * 0.35), 0);
        cowQ.setFromEuler(cowE);
        cowS.setScalar(P.cows.userData.scale || 1.2);
        cowMat.compose(cowP, cowQ, cowS);
        P.cows.setMatrixAt(i, cowMat);
      }
      P.cows.instanceMatrix.needsUpdate = true;
    }
  }
  function updateFx(now, dt) {
    let busy = false;
    for (const r of rings) {
      if (!r.active) continue;
      busy = true;
      const k = (now - r.t0) / r.dur;
      if (k < 0) { r.mesh.visible = false; continue; }
      if (k >= 1) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.visible = !RM;
      const s = r.size * (0.25 + easeOut(k) * 0.95);
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - k) * 0.95;
    }
    for (const h of halos) {
      if (!h.active) continue;
      busy = true;
      const a = actors[h.actor];
      const t = (now - h.t0) / 1000;
      if (!a || !a.root.visible || t > 1.9) { h.active = false; h.mesh.visible = false; continue; }
      a.root.getWorldPosition(tmpV);
      h.mesh.position.set(tmpV.x, 0.075, tmpV.z);
      h.mesh.material.opacity = t < 1.5 ? 0.95 : 0.95 * (1 - (t - 1.5) / 0.4);
      h.mesh.visible = true;
    }
    if (selLabel.revertAt && now > selLabel.revertAt) {
      selLabel.revertAt = 0;
      if (state.selected) { const info = labelInfo(state.selected); if (info) drawLabel(selLabel.lc, selLabel.sprite, info); }
      busy = true;
    }
    {
      // the cloud label hides while something is selected and when the cloud itself is under the top panels
      const cl = currentSite().cloudLabel;
      cl.getWorldPosition(tmpV2).project(camera);
      const py = ((1 - tmpV2.y) / 2) * viewH;
      const show = !state.selected && tmpV2.z < 1 && py > freeRect().y0 + 8;
      if (cl.visible !== show) { cl.visible = show; busy = true; }
    }
    for (const p of pills) {
      if (!p.active) continue;
      busy = true;
      const t = now - p.t0;
      if (t >= p.dur) { p.active = false; p.sprite.visible = false; continue; }
      if (RM) { p.sprite.material.opacity = 1; continue; }
      const fin = clamp(t / 260, 0, 1), fout = clamp((p.dur - t) / 420, 0, 1);
      p.sprite.material.opacity = Math.min(fin, fout);
      p.sprite.position.copy(p.base).add(tmpV.set(0, easeOut(fin) * 0.8 + t / p.dur * 0.6, 0));
    }
    for (const p of packets) {
      if (!p.active) continue;
      busy = true;
      const k = clamp((now - p.t0) / p.dur, 0, 1);
      const e = easeInOut(k) * 0.85 + k * 0.15;
      p.dots.forEach((d, j) => {
        const kk = clamp(e - j * 0.025, 0, 1);
        p.path.getPoint(kk, d.position);
        d.material.opacity = j === 0 ? 1 : 0.7 - j * 0.15;
      });
      if (!p.midFired && e >= p.midAt) { p.midFired = true; if (p.onMid) p.onMid(); }
      if (k >= 1) { p.active = false; p.group.visible = false; if (p.onArrive) p.onArrive(); }
    }
    if (scan.active) {
      busy = true;
      const k = (now - scan.t0) / (scan.dur * 1000);
      const a = actors[scan.vehicle];
      if (k >= 1 || !a || !a.root.visible) { scan.active = false; beam.visible = false; }
      else {
        const head = siteAnchor(scan.from);
        const v = VEHICLES[scan.vehicle];
        const fwd = tmpV2.set(Math.cos(a.root.rotation.y), 0, -Math.sin(a.root.rotation.y));
        const plate = a.root.position.clone().add(actorsRoot.position).addScaledVector(fwd, v.length / 2 + 0.05);
        plate.y = 0.7;
        const len = head.distanceTo(plate);
        beam.position.copy(head);
        beam.lookAt(plate);
        beam.scale.set(1.4, 0.8, len);
        beam.visible = true;
        beamMat.uniforms.uAlpha.value = Math.min(1, k * 6, (1 - k) * 5);
        beamMat.uniforms.uTime.value = now / 1000;
      }
    }
    // selection breathing
    if (selGroup.visible) {
      const t = (now - selGroup.userData.t0) / 1000;
      const intro = RM ? 1 : easeOut(clamp(t / 0.45, 0, 1));
      const s = (1.28 - 0.28 * intro) * (RM ? 1 : 1 + Math.sin(t * 2.6) * 0.012);
      selGroup.scale.setScalar(s);
      selMat.opacity = 0.35 + 0.61 * intro;
      glowMat.opacity = (0.32 + (RM ? 0 : Math.sin(t * 2.6) * 0.08)) * intro;
    }
    // pins bob + distance scale
    const dist = camera.position.distanceTo(controls.target);
    const ps = clamp(dist / 150, 0.55, 1.35);
    for (const sp of pins[state.site]) {
      const u = sp.userData;
      const alarm = state.alarms.has(u.objectId);
      const bob = RM ? 0 : Math.sin(now / 700 + u.phase) * 0.18;
      sp.position.set(u.base.x, u.base.y + bob, u.base.z);
      const pulse = alarm && !RM ? 1 + Math.sin(now / 140) * 0.06 : 1;
      const hov = hoverLabel.id === u.objectId ? 1.12 : 1;
      sp.visible = state.selected !== u.objectId || alarm;
      sp.scale.set(u.h * u.aspect * ps * pulse * hov, u.h * ps * pulse * hov, 1);
    }
    // cloud bob
    const s = currentSite();
    if (!RM) s.parts.cloud.position.y = s.anchors.cloud.y + Math.sin(now / 1400) * 0.35;
    linkUniforms.uTime.value = RM ? 0 : now / 1000;
    return busy;
  }

  // ---------------------------------------------------------------- loop
  let raf = 0, lastNow = performance.now(), rmTimer = 0;
  const perf = { frames: 0, acc: 0, startedAt: performance.now(), degraded: 0 };
  function requestRender() {
    state.needsRender = true;
    if (!raf && !state.paused && !state.disposed && RM) raf = requestAnimationFrame(rmFrame);
  }
  function update(dt, now) {
    if (easeInsets(dt)) state.needsRender = true;
    updateFlight(now);
    if (!state.flight && controls.enabled) {
      controls.update();
      clampTarget();
    }
    const lt = ((state.simTime % LOOP) + LOOP) % LOOP;
    processEvents(state.lastLt, lt);
    state.lastLt = lt;
    updateActors(lt, state.simTime);
    updateFixtures(lt, now);
    follow(dt);
    const busy = updateFx(now, dt);
    updateHover();
    placeHoverLabel();
    keepLabelsInView();
    // fog and snow follow the camera target
    const dist = camera.position.distanceTo(controls.target);
    scene.fog.near = dist * 0.95 + 70;
    scene.fog.far = dist * 2.3 + 300;
    snowMat.uniforms.uCenter.value.copy(controls.target);
    snowMat.uniforms.uTime.value = state.simTime;
    return busy;
  }
  function clampTarget() {
    const o = SITE_ORIGINS[state.site];
    const t = controls.target;
    const cx = clamp(t.x, o.x - 75, o.x + 80), cz = clamp(t.z, o.z - 70, o.z + 70), cy = clamp(t.y, 0, 6);
    if (cx !== t.x || cz !== t.z || cy !== t.y) {
      const dx = cx - t.x, dz = cz - t.z, dy = cy - t.y;
      t.set(cx, cy, cz);
      camera.position.x += dx; camera.position.z += dz; camera.position.y += dy;
    }
  }
  function follow(dt) {
    if (!state.followId || state.flight) return;
    const a = actors[state.followId];
    if (!a || !a.root.visible) { state.followId = null; return; }
    const goal = a.root.getWorldPosition(new THREE.Vector3()); goal.y = 0;
    const k = 1 - Math.exp(-dt * 3.2);
    const dx = (goal.x - controls.target.x) * k, dz = (goal.z - controls.target.z) * k;
    controls.target.x += dx; controls.target.z += dz;
    camera.position.x += dx; camera.position.z += dz;
  }
  function frame(now) {
    raf = 0;
    if (state.paused || state.disposed) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    state.simTime += dt;
    update(dt, now);
    renderer.render(scene, camera);
    state.needsRender = false;
    adapt(dt, now);
    raf = requestAnimationFrame(frame);
  }
  // reduced motion: the simulation advances in steps; frames are drawn only when something changed
  function rmFrame(now) {
    raf = 0;
    if (state.paused || state.disposed) return;
    update(0, now);
    if (state.needsRender) { renderer.render(scene, camera); state.needsRender = false; rmLastDraw = now; }
  }
  // Reduced motion: the farm updates like a slideshow — a still frame every 2 s or when an event happens.
  let rmLastDraw = 0;
  function rmTick() {
    if (state.paused || state.disposed) return;
    state.simTime += 0.5;
    const now = performance.now();
    const before = state.needsRender;
    update(0.5, now);
    if (state.needsRender || before || now - rmLastDraw > 1950) {
      renderer.render(scene, camera); state.needsRender = false; rmLastDraw = now;
    }
  }
  function adapt(dt, now) {
    if (state.noAdapt || now - perf.startedAt < 2500) return;
    perf.frames++; perf.acc += dt;
    if (perf.frames < 120) return;
    const avg = perf.acc / perf.frames;
    perf.frames = 0; perf.acc = 0;
    if (avg > 0.021 && perf.degraded < 5) {
      perf.degraded++;
      if (pixelRatio > 1.01) {
        pixelRatio = Math.max(1, pixelRatio - 0.35);
        renderer.setPixelRatio(pixelRatio);
        viewW = viewH = -1; resize();
      } else if (sun.shadow.mapSize.x > 1024) {
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
      } else {
        snowPts.visible = false;
      }
    }
  }
  function start() {
    if (state.disposed || state.paused) return;
    resize();
    lastNow = performance.now();
    if (RM) {
      if (!rmTimer) rmTimer = setInterval(rmTick, 500);
      requestRender();
    } else if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (rmTimer) clearInterval(rmTimer);
    rmTimer = 0;
  }
  const onVisibility = () => { if (document.hidden) stop(); else if (!state.paused) start(); };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------------------------------------------------------------- initial view & warm-up
  resize();
  applyWeather(0);
  sunCenter.copy(SITE_ORIGINS.north); placeSun();
  moveActorsTo('north');
  const h = homeView('north');
  placeCamera(h.target, h.dist, h.az, h.polar);
  controls.update();
  state.homePlaced = true;
  update(0, performance.now());
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* optional */ }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.disposed) return;
      for (const id of ['north', 'south']) {
        sites[id].parts.sign.mesh.userData.redraw?.();
        const d = sites[id].cloudLabelCanvas.draw(CLOUD_LABEL);
        sites[id].cloudLabel.userData.px = [d.w, d.h];
        applyLabelScale(sites[id].cloudLabel);
      }
      requestRender();
    }).catch(() => {});
  }

  // ---------------------------------------------------------------- public API
  const api = {
    get objects() { return siteObjects(state.site); },
    get site() { return state.site; },
    sites: Object.values(SITE_INFO).map((s) => ({ ...s })),
    setSite,
    select(objectId) {
      if (state.disposed) return;
      if (objectId == null) { clearSelection(); return; }
      selectInternal(objectId, { fly: true });
    },
    openDoor(objectId) {
      if (!['checkpoint', 'feed', 'office'].includes(objectId)) return Promise.reject(new Error('Нельзя открыть: ' + objectId));
      const t0 = performance.now();
      const anchor = { checkpoint: 'cpIn', feed: 'feedTerm', office: 'officeTerm' }[objectId];
      const siteId = state.site;
      const target = siteAnchor(anchor, siteId);
      const travel = 0.62;
      spawnPacket(downlinkPath(target, siteId), 'cmd', travel, { midAt: 0.55, onMid: () => { state.ledFlash = performance.now(); } });
      return new Promise((resolve) => {
        setTimeout(() => {
          const now = performance.now();
          const openDur = objectId === 'feed' ? 1.1 : objectId === 'office' ? 0.5 : 0.6;
          state.userDoors[objectId] = { openAt: now, openDur, hold: 4.2, closeDur: objectId === 'feed' ? 1.5 : 0.8 };
          flashScreen(anchor, 'ok', 2600);
          spawnRing(target.clone().setY(0.1), 'ok', 3.4);
          requestRender();
          setTimeout(() => resolve({ ms: Math.round(performance.now() - t0) }), (RM || state.paused ? 0 : openDur * 1000));
        }, travel * 1000 + 40);
      });
    },
    // Optional: tell the scene which part of the canvas is covered by UI (px from each edge), or null for defaults.
    // { animate: false } snaps (use it for the first call, before the canvas is shown).
    setViewInsets(next, { animate = true } = {}) {
      if (state.disposed) return;
      const prev = freeRect(true);
      const from = { ...insets() };
      userInsets = next ? { top: Math.max(0, +next.top || 0), right: Math.max(0, +next.right || 0), bottom: Math.max(0, +next.bottom || 0), left: Math.max(0, +next.left || 0) } : null;
      avoidRects = next && Array.isArray(next.avoid) ? next.avoid.filter((a) => a && a.x1 > a.x0 && a.y1 > a.y0) : [];
      curInsets = userInsets ? (animate && !RM ? from : { ...userInsets }) : null;
      applyViewOffset();
      const now = freeRect(true);
      if (Math.abs(now.w - prev.w) > 6 || Math.abs(now.h - prev.h) > 6 || Math.abs(now.cx - prev.cx) > 6 || Math.abs(now.cy - prev.cy) > 6) refit(animate && !RM);
      requestRender();
    },
    zoomBy(step) {
      state.atHome = false;
      const v = currentView();
      const dist = clamp(v.dist * Math.pow(0.8, step || 0), controls.minDistance, controls.maxDistance);
      flyTo({ ...v, dist }, { dur: 0.35 });
    },
    rotateBy(deg) {
      state.atHome = false;
      const v = currentView();
      flyTo({ ...v, az: v.az + THREE.MathUtils.degToRad(deg || 0) }, { dur: 0.55 });
    },
    resetView({ dur = 1.1 } = {}) {
      state.followId = null;
      state.atHome = true;
      return flyTo(homeView(state.site), { dur });
    },
    // Auto-tour: a medium shot of an object (its tour point if it has one), without selecting it.
    tourTo(objectId, { dist = 70, dur = 1.6 } = {}) {
      if (state.disposed || state.selected || (state.flight && state.flight.arc)) return Promise.resolve(false);
      const f = findObject(objectId);
      if (!f) return Promise.resolve(false);
      let target, d = dist;
      if (f.kind === 'static') {
        const t = f.def.tour;
        const local = t ? new THREE.Vector3(t[0], 0, t[1]) : (f.def.frameBox || f.def.box).getCenter(new THREE.Vector3());
        if (t && t[2]) d = t[2];
        // the same medium shot on a narrow free area (phones) needs more distance
        const fr = freeRect(true);
        d *= clamp(720 / Math.min(fr.w, fr.h * 1.6), 1, 2.2);
        target = f.site.group.localToWorld(local);
      } else {
        if (!f.actor.root.visible) return Promise.resolve(false);
        target = f.actor.root.getWorldPosition(new THREE.Vector3());
      }
      target.y = 0;
      state.atHome = false; state.followId = null;
      const v = currentView();
      return flyTo({ target, dist: d, az: v.az, polar: clamp(v.polar, 0.85, 1.0) }, { dur }).then(() => true);
    },
    setPaused(paused) {
      paused = !!paused;
      if (paused === state.paused) return;
      state.paused = paused;
      if (paused) stop(); else start();
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheelGuard);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      controls.dispose();
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) {
          if (seen.has(m)) continue; seen.add(m);
          for (const key of ['map', 'alphaMap']) if (m[key] && !seen.has(m[key])) { seen.add(m[key]); m[key].dispose(); }
          if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); }
          m.dispose();
        }
      });
      for (const { texture } of pinTex.values()) texture.dispose();
      envTex.dispose();
      try {
        const gl = renderer.getContext();
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      } catch (e) { /* context may be lost */ }
      renderer.dispose();
    },
    // debugging helpers (not part of the landing contract)
    _debug: { HOME, FRAME_TALL, FRAME_WIDE, homeView: () => homeView(state.site), get insets() { return { target: targetInsets(), cur: insets() }; }, set noAdapt(v) { state.noAdapt = !!v; }, snow: snowPts, sun, sims, get scan() { return { ...scan, visible: beam.visible, alpha: beamMat.uniforms.uAlpha.value, scale: beam.scale.toArray(), pos: beam.position.toArray() }; }, get simTime() { return state.simTime; }, set simTime(v) { state.simTime = v; state.lastLt = ((v % LOOP) + LOOP) % LOOP; }, get sim() { return sim; }, renderer, camera, scene, controls },
  };

  start();
  requestAnimationFrame(() => { if (!state.disposed) { try { onReady(api); } catch (e) { console.error(e); } } });
  return api;
}
