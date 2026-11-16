import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, pick, chance, mulberry32, lerp, distToPolyline } from './noise.js';
import { heightAt, groundAt, roadDist, riverDist, WATER_LEVEL, LAYOUT, ROADS, RIVER, BRIDGE, slopeAt, addDeck } from './terrain.js';
import * as TX from './textures.js';
import { makeGuardianTree } from './vegetation.js';
import { addSnow } from './season.js';

// ---------- Smart object kinds (Sims-style "advertisements") ----------
// adv: need gain per game-minute while using. cost: coins. dur: game minutes.
export const KINDS = {
  bed: { label: 'Sleep', ko: '잠', adv: { energy: 1.0 }, dur: [300, 480], anim: 'sleep', hidden: true, cap: 4, home: true },
  cookpot: { label: 'Cook & Eat', ko: '밥', adv: { hunger: 3.0, fun: 0.2, social: 0.2 }, dur: [25, 40], anim: 'eat', cap: 4, home: true },
  jumak: { label: 'Eat at Jumak', ko: '주막', adv: { hunger: 2.2, social: 0.9, fun: 0.9 }, dur: [30, 50], anim: 'eat', cap: 2, cost: 4 },
  well: { label: 'Wash at Well', ko: '우물', adv: { hygiene: 5.0, social: 0.2 }, dur: [10, 16], anim: 'wash', cap: 2 },
  stream: { label: 'Bathe in Stream', ko: '냇가', adv: { hygiene: 3.0, fun: 0.4 }, dur: [15, 25], anim: 'wash', cap: 4 },
  platform: { label: 'Sit & Chat', ko: '평상', adv: { social: 0.8, fun: 0.6, energy: 0.2 }, dur: [25, 50], anim: 'sit', cap: 5 },
  dummy: { label: 'Train Sword', ko: '수련', adv: { fun: 1.0, honor: 0.6, energy: -0.6, hunger: -0.3, hygiene: -0.4 }, dur: [30, 60], anim: 'train', cap: 1, skill: 'sword' },
  target: { label: 'Practice Archery', ko: '활쏘기', adv: { fun: 1.2, honor: 0.4, energy: -0.3 }, dur: [25, 45], anim: 'archery', cap: 1, skill: 'archery' },
  shrine: { label: 'Pray', ko: '기도', adv: { honor: 1.4, fun: 0.3 }, dur: [20, 35], anim: 'pray', cap: 4 },
  pavilion: { label: 'Recite Poetry', ko: '시', adv: { fun: 1.4, social: 0.4, honor: 0.3 }, dur: [30, 60], anim: 'sit', cap: 5 },
  shop: { label: 'Browse Market', ko: '장터', adv: { fun: 1.0, social: 0.6, hunger: 0.6 }, dur: [15, 30], anim: 'talk', cap: 2, cost: 4 },
  campfire: { label: 'Sit by Fire', ko: '모닥불', adv: { social: 1.0, fun: 0.8, hunger: 1.2 }, dur: [30, 60], anim: 'sit', cap: 8, camp: true },
  // somewhere to sleep for those with no bed of their own: the tavern let rooms (객방) for a few coins,
  // and anyone with nothing could lie down under a pavilion roof or on the temple's veranda
  lodging: { label: 'Lodge at the Jumak', ko: '객방', adv: { energy: 1.0, hygiene: 0.1 }, dur: [300, 420], anim: 'sleep', hidden: true, cap: 8, cost: 3, available: (s) => !s.home },
  rough: { label: 'Sleep Rough', ko: '노숙', adv: { energy: 0.7 }, dur: [240, 360], anim: 'sleep', cap: 6, available: (s) => !s.home },
  tent: { label: 'Sleep in Tent', ko: '천막', adv: { energy: 1.0 }, dur: [300, 420], anim: 'sleep', hidden: true, cap: 3, camp: true },
  // work spots
  field: { label: 'Tend Paddies', ko: '농사', work: 'field', adv: { energy: -0.25, hygiene: -0.4 }, dur: [90, 150], anim: 'farm', cap: 1, skill: 'farming' },
  stallWork: { label: 'Sell Goods', ko: '장사', work: 'stall', adv: { social: 0.4, energy: -0.15 }, dur: [100, 160], anim: 'talk', cap: 1, skill: 'charisma' },
  guard: { label: 'Stand Guard', ko: '경비', work: 'guard', adv: { energy: -0.2, honor: 0.2 }, dur: [100, 160], anim: 'guard', cap: 1 },
  study: { label: 'Study Classics', ko: '공부', work: 'study', adv: { fun: 0.2, energy: -0.15, honor: 0.3 }, dur: [100, 160], anim: 'study', cap: 3, skill: 'scholarship' },
  serve: { label: 'Run the Jumak', ko: '주모', work: 'jumak', adv: { social: 0.6, energy: -0.2 }, dur: [120, 180], anim: 'talk', cap: 1, skill: 'charisma' },
  templeWork: { label: 'Temple Duties', ko: '수행', work: 'shrine', adv: { honor: 0.6, energy: -0.1 }, dur: [100, 160], anim: 'pray', cap: 2 },
  banquet: { label: 'At the banquet', ko: '연회', adv: { fun: 2.4, social: 1.6, hunger: 1.8, honor: 0.5 }, dur: [60, 120], anim: 'talk', cap: 10 },
  rankstone: { label: 'Stand at your rank', ko: '품계석', adv: { honor: 0.5, energy: -0.1 }, dur: [40, 90], anim: 'bow', cap: 1, court: true },
  petitiondrum: { label: 'Strike the petition drum', ko: '신문고', adv: { honor: 1.2, fun: 0.4 }, dur: [10, 18], anim: 'talk', cap: 1 },
  court: { label: 'Attend Court', ko: '조회', work: 'pavilion', adv: { honor: 0.8, energy: -0.15 }, dur: [100, 160], anim: 'court', cap: 8 },
  trainWork: { label: 'Drill', ko: '훈련', work: 'dummy', adv: { honor: 0.5, energy: -0.4, hunger: -0.2 }, dur: [80, 140], anim: 'train', cap: 1, skill: 'sword' },
  campWork: { label: 'Scheme', ko: '모의', work: 'camp', adv: { energy: -0.1 }, dur: [100, 160], anim: 'sit', cap: 8, camp: true },
  throne: { label: 'Sit upon the Throne', ko: '옥좌', work: 'throne', adv: { honor: 0.6, energy: -0.1 }, dur: [120, 180], anim: 'throne', cap: 1, royal: true },
  fish: { label: 'Go Fishing', ko: '낚시', adv: { fun: 1.1, hunger: 0.25 }, dur: [40, 90], anim: 'fish', cap: 1, skill: 'fishing', catch: true },
  fishWork: { label: 'Fish for a Living', ko: '고기잡이', work: 'fish', adv: { energy: -0.15 }, dur: [100, 160], anim: 'fish', cap: 1, skill: 'fishing', catch: true },
  yut: { label: 'Play Yut-nori (bet 5)', ko: '윷놀이', adv: { fun: 1.7, social: 1.1 }, dur: [25, 45], anim: 'yut', cap: 4, gamble: 5 },
  play: { label: 'Kick the Jegi', ko: '제기차기', adv: { fun: 1.6, energy: -0.25 }, dur: [15, 30], anim: 'jegi', cap: 1 },
  lesson: { label: 'Attend Lessons', ko: '서당', work: 'school', adv: { fun: -0.05 }, dur: [90, 150], anim: 'study', cap: 8, skill: 'scholarship' },
  swing: { label: 'Ride the Swing', ko: '그네', adv: { fun: 1.8 }, dur: [10, 20], anim: 'swing', cap: 1 },
  hall: { label: 'Faction Hall', ko: '본부', adv: {}, dur: [1, 1], anim: 'idle', cap: 0, menuOnly: true },
  policeHall: { label: 'Podocheong (Police Bureau)', ko: '포도청', adv: {}, dur: [1, 1], anim: 'idle', cap: 0, menuOnly: true },
  stableHall: { label: 'Stable', ko: '마구간', adv: {}, dur: [1, 1], anim: 'idle', cap: 0, menuOnly: true },
  lender: { label: 'Moneylender', ko: '사채', adv: {}, dur: [1, 1], anim: 'idle', cap: 0, menuOnly: true },
  patrol: { label: 'Patrol', ko: '순찰', work: 'patrol', adv: { energy: -0.2, honor: 0.2 }, dur: [100, 160], anim: 'guard', cap: 6 },
  beg: { label: 'Beg for Coins', ko: '구걸', adv: { honor: -0.4, social: 0.2 }, dur: [30, 60], anim: 'kneel', cap: 2, beg: true },
};

// ---------- helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mtx(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

class Batcher {
  constructor() { this.parts = {}; this.tag = null; this.tagged = {}; }
  add(key, geo, color, matrix) {
    if (this.tag != null) (this.tagged[this.tag] ||= []).push([key, (this.parts[key] || []).length]);
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const n = g.attributes.position.count;
    if (color || !g.attributes.color) {
      const c = new THREE.Color(color || '#ffffff');
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (matrix) g.applyMatrix4(matrix);
    (this.parts[key] ||= []).push(g);
  }
  build(materials) {
    const group = new THREE.Group();
    this.ranges = {}; const offs = {};
    for (const key in this.parts) { let o = 0; offs[key] = this.parts[key].map((g) => { const r = [o, g.attributes.position.count]; o += r[1]; return r; }); }
    for (const tag in this.tagged) this.ranges[tag] = this.tagged[tag].map(([key, i]) => [key, ...offs[key][i]]);
    this.meshes = {};
    for (const key in this.parts) {
      const geo = mergeGeometries(this.parts[key]);
      const mesh = new THREE.Mesh(geo, materials[key]);
      mesh.castShadow = key !== 'lantern' && key !== 'glow'; mesh.receiveShadow = true;
      mesh.name = 'static-' + key;
      group.add(mesh); this.meshes[key] = mesh;
    }
    return group;
  }
  // collapse everything added under a tag to a single point (demolition of a building in a merged batch)
  collapse(tag) {
    for (const [key, start, count] of this.ranges?.[tag] || []) {
      const m = this.meshes[key]; if (!m) continue; const p = m.geometry.attributes.position;
      const x = p.getX(start), y = p.getY(start) - 50, z = p.getZ(start);
      for (let i = start; i < start + count; i++) p.setXYZ(i, x, y, z);
      p.needsUpdate = true;
    }
    delete this.ranges[tag];
  }
}

// Korean curved roof: concave slopes, uplifted corners (cheoma)
function roofGeometry({ w, d, o, H, lift = 0.9, ridgeK = 1.0, profile = 'concave', tile = 1.3, fascia = 0.32 }) {
  const A = w / 2 + o, B = d / 2 + o;
  const rh = Math.max(0.15, A - B * ridgeK);
  const pos = [], uv = [], idx = [];
  const SU = 16, SV = 8;
  const prof = profile === 'concave' ? (v) => Math.pow(v, 1.6) : (v) => 1 - Math.pow(1 - v, 2.2);
  const liftF = (x, z) => lift * Math.pow(Math.min(1, Math.abs(x) / A), 3) * Math.pow(Math.min(1, Math.abs(z) / B), 3);
  const flare = (x, z, v) => { const k = 1 + 0.06 * Math.pow(Math.min(1, Math.abs(x) / A) * Math.min(1, Math.abs(z) / B), 2) * (1 - v); return [x * k, z * k]; };
  const faces = [
    { eave: (u) => [u * A, B], ridge: (u) => [u * rh, 0], len: A },
    { eave: (u) => [-u * A, -B], ridge: (u) => [-u * rh, 0], len: A },
    { eave: (u) => [A, -u * B], ridge: () => [rh, 0], len: B },
    { eave: (u) => [-A, u * B], ridge: () => [-rh, 0], len: B },
  ];
  for (const f of faces) {
    const base = pos.length / 3;
    const slope = Math.hypot(H, f === faces[2] || f === faces[3] ? A - rh : B);
    // fascia row (j = -1) + roof rows
    for (let j = -1; j <= SV; j++) {
      const v = Math.max(0, j / SV);
      for (let i = 0; i <= SU; i++) {
        const u = -1 + (2 * i) / SU;
        const e = f.eave(u), r = f.ridge(u);
        let x = lerp(e[0], r[0], v), z = lerp(e[1], r[1], v);
        let y = H * prof(v) + liftF(x, z) * (1 - v);
        [x, z] = flare(x, z, v);
        if (j === -1) { y -= fascia; x *= 0.995; z *= 0.995; }
        pos.push(x, y, z);
        uv.push((u * f.len) / tile, (j === -1 ? -fascia : v * slope) / tile);
      }
    }
    for (let j = 0; j < SV + 1; j++) for (let i = 0; i < SU; i++) {
      const a = base + j * (SU + 1) + i, b = a + 1, c = a + SU + 1, dd = c + 1;
      idx.push(a, b, c, b, dd, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, A, B, rh, lift };
}

function beamBetween(p1, p2, r, segs = 5) {
  const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, segs);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function onggiGeo(s = 1) {
  const pts = [];
  const prof = [[0, 0], [0.22, 0.02], [0.36, 0.2], [0.42, 0.42], [0.38, 0.62], [0.26, 0.74], [0.24, 0.78], [0.27, 0.8], [0, 0.82]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r * s, y * s));
  return new THREE.LatheGeometry(pts, 12);
}

// ---------- World builder ----------
export function buildWorld(scene, quality) {
  let B = new Batcher(); const staticB = B;
  const obbs = []; const circles = []; const objects = []; const houses = []; const lanterns = []; const fires = []; const spots = {};
  let oid = 0;
  const addObj = (kind, x, z, face = 0, extra = {}) => {
    const o = { id: oid++, kind, def: KINDS[kind], x, z, face, users: new Set(), ...extra };
    o.y = groundAt(x, z);
    objects.push(o); return o;
  };
  const blockedObb = (x, z, pad = 0) => {
    for (const b of obbs) {
      const dx = x - b.x, dz = z - b.z; const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
    }
    for (const ci of circles) if (Math.hypot(x - ci.x, z - ci.z) < ci.r + pad) return true;
    return false;
  };

  const C = {
    wood: '#5d3a24', woodLight: '#7a5236', red: '#8e2a22', stone: '#8d877c', stoneDark: '#6b665e', ridge: '#2c2f33', white: '#d8d2c2',
    mud: '#b9a27e', straw: '#c2a35e',
  };

  function hanok(x, z, rot, o) {
    const { w, d, h = 2.8, style = 'giwa' } = o;
    const pal = style === 'palace' || style === 'temple';
    let y0 = Infinity;
    for (const [cx, cz] of [[0, 0], [-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      y0 = Math.min(y0, heightAt(x + cx * c + cz * s, z - cx * s + cz * c));
    }
    y0 = Math.max(y0, WATER_LEVEL + 0.5);
    const T = mtx(x, y0, z, rot);
    const add = (key, geo, color, lm) => B.add(key, geo, color, new THREE.Matrix4().multiplyMatrices(T, lm || new THREE.Matrix4()));
    const ph = o.plinth ?? (pal ? 1.1 : style === 'choga' ? 0.45 : 0.6);
    // plinth
    add('stone', new THREE.BoxGeometry(w + 1.6, ph + 2, d + 1.6), '#ffffff', mtx(0, ph - (ph + 2) / 2, 0));
    if (o.tier2) add('stone', new THREE.BoxGeometry(w + 6, ph + 2, d + 5), '#e8e2d8', mtx(0, -(ph + 2) / 2 + 0.05, 0, 0, 0, 0, 1, 0.55, 1));
    // walls
    const fkey = pal ? 'facadeD' : style === 'choga' ? 'mudwall' : 'facade';
    add(fkey, new THREE.BoxGeometry(w, h, d), '#ffffff', mtx(0, ph + h / 2, 0));
    // pillars
    const pc = pal ? C.red : C.wood;
    const nx = Math.max(2, Math.round(w / 2.6));
    for (let i = 0; i <= nx; i++) {
      const px = -w / 2 + (w * i) / nx;
      for (const pz of [d / 2 + 0.12, -d / 2 - 0.12]) add('vc', new THREE.CylinderGeometry(0.15, 0.17, h + 0.2, 8), pc, mtx(px, ph + h / 2, pz));
    }
    // beam band
    if (pal) add('dancheong', new THREE.BoxGeometry(w + 0.6, 0.55, d + 0.6), '#ffffff', mtx(0, ph + h + 0.27, 0));
    else add('vc', new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), C.wood, mtx(0, ph + h + 0.17, 0));
    // maru porch + steps
    if (style !== 'choga') add('vc', new THREE.BoxGeometry(w * 0.7, 0.18, 1.3), C.woodLight, mtx(0, ph - 0.05, d / 2 + 0.75));
    add('stone', new THREE.BoxGeometry(1.8, ph, 0.9), '#dcd6cc', mtx(0, ph / 2 - 0.15, d / 2 + 1.5));
    // roof
    const roofY = ph + h + (pal ? 0.55 : 0.35);
    if (style === 'choga') {
      const r = roofGeometry({ w, d, o: 0.75, H: 1.9, lift: 0, ridgeK: 1.25, profile: 'convex', tile: 1.6, fascia: 0.45 });
      add('thatch', r.geo, '#ffffff', mtx(0, roofY - 0.1, 0));
    } else {
      const H = o.roofH ?? (w * 0.16 + 1.1);
      const ov = o.over ?? 1.5;
      const r = roofGeometry({ w, d, o: ov, H, lift: o.lift ?? 0.95, ridgeK: 1.0 });
      add('tile', r.geo, o.roofTint ?? '#ffffff', mtx(0, roofY, 0));
      // ridge + hip ridges
      add('vc', new THREE.BoxGeometry(r.rh * 2 + 0.6, 0.45, 0.7), C.ridge, mtx(0, roofY + H + 0.12, 0));
      add('vc', new THREE.BoxGeometry(r.rh * 2 + 0.5, 0.1, 0.74), C.white, mtx(0, roofY + H - 0.02, 0));
      for (const sx of [-1, 1]) {
        add('vc', beamBetween([sx * (r.rh + 0.2), roofY + H + 0.2, 0], [sx * (r.rh + 0.65), roofY + H + 0.85, 0], 0.16), C.ridge);
        for (const sz of [-1, 1]) add('vc', beamBetween([sx * r.A * 1.04, roofY + r.lift + 0.12, sz * r.B * 1.04], [sx * r.rh, roofY + H + 0.1, 0], 0.17), C.ridge);
      }
      if (o.double) {
        const h2 = 2.2, w2 = w * 0.78, d2 = d * 0.72, base2 = roofY + H * 0.55;
        add(fkey, new THREE.BoxGeometry(w2, h2, d2), '#ffffff', mtx(0, base2 + h2 / 2, 0));
        add('dancheong', new THREE.BoxGeometry(w2 + 0.5, 0.5, d2 + 0.5), '#ffffff', mtx(0, base2 + h2 + 0.25, 0));
        const H2 = w2 * 0.17 + 1.2;
        const r2 = roofGeometry({ w: w2, d: d2, o: 1.7, H: H2, lift: 1.1, ridgeK: 1.0 });
        const ry2 = base2 + h2 + 0.5;
        add('tile', r2.geo, '#ffffff', mtx(0, ry2, 0));
        add('vc', new THREE.BoxGeometry(r2.rh * 2 + 0.6, 0.5, 0.75), C.ridge, mtx(0, ry2 + H2 + 0.14, 0));
        for (const sx of [-1, 1]) {
          add('vc', beamBetween([sx * (r2.rh + 0.2), ry2 + H2 + 0.2, 0], [sx * (r2.rh + 0.75), ry2 + H2 + 1.1, 0], 0.18), C.ridge);
          for (const sz of [-1, 1]) add('vc', beamBetween([sx * r2.A * 1.04, ry2 + r2.lift + 0.12, sz * r2.B * 1.04], [sx * r2.rh, ry2 + H2 + 0.1, 0], 0.18), C.ridge);
        }
      }
    }
    const fwd = [Math.sin(rot), Math.cos(rot)];
    const world = (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
    const door = world(0, d / 2 + 2.8);
    const obb = { x, z, hw: w / 2 + 1.0, hd: d / 2 + 1.0, rot };
    obbs.push(obb);
    // eave lanterns
    if (o.lanterns) for (const sx of [-1, 1]) { const p = world(sx * (w / 2 + 0.3), d / 2 + 1.2); lanterns.push({ x: p[0], y: y0 + ph + h - 0.3, z: p[1], hang: true, color: o.lanternColor }); }
    return { x, z, rot, y0, door, fwd, world, obb, w, d, style };
  }

  // ---------- Village houses ----------
  const reservedCircles = [
    [0, 0, 34], [-100, -14, 16], [40, 102, 14], [-38, 52, 5], [38, 58, 5], [-46, -52, 5], [62, -20, 5], [LAYOUT.training[0], LAYOUT.training[1], 30], [25, 14, 14], [45, -62, 14], [-30, -185, 70], [128, 100, 14],
  ];
  const housePlaces = [];
  const roadsForHouses = [ROADS[3], ROADS[4], ROADS[0], ROADS[2]];
  for (const road of roadsForHouses) {
    for (let si = 0; si < road.length - 1; si++) {
      const [ax, az] = road[si], [bx, bz] = road[si + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let t = 10; t < L - 6; t += 19) {
        const px = ax + tx * t, pz = az + tz * t;
        if (Math.hypot(px, pz) > 125) continue;
        for (const side of [-1, 1]) {
          const off = 12.5 + rand() * 1.5;
          const hx = px + -tz * side * off, hz = pz + tx * side * off;
          if (reservedCircles.some(([cx, cz, r]) => Math.hypot(hx - cx, hz - cz) < r)) continue;
          if (housePlaces.some((h) => Math.hypot(h.x - hx, h.z - hz) < 15)) continue;
          if (riverDist(hx, hz) < 26 || heightAt(hx, hz) < WATER_LEVEL + 0.8) continue;
          if (roadDist(hx, hz) < 8) continue;
          const p = LAYOUT.paddies; if (hx > p.x0 - 8 && hx < p.x1 + 8 && hz > p.z0 - 8 && hz < p.z1 + 8) continue;
          const rot = Math.atan2(tz * side * -1 * -1 * 0 + (-(-tz * side)), -(tx * side));
          // face toward road: direction = -(normal*side)
          const fx = tz * side, fz = -tx * side;
          housePlaces.push({ x: hx, z: hz, rot: Math.atan2(fx, fz) });
        }
      }
    }
  }
  // tiers of dwelling: a poor hut (움막), a thatched cottage (초가), a tiled house (기와집), a yangban mansion (대감댁)
  const nnd = (hp) => Math.min(99, ...housePlaces.filter((o) => o !== hp).map((o) => Math.hypot(o.x - hp.x, o.z - hp.z)));
  let mansions = 0;
  housePlaces.forEach((hp, i) => {
    const north = hp.z < -5, roomy = nnd(hp) > 21;
    let tier = north ? (chance(0.55) ? 'house' : 'cottage') : chance(0.15) ? 'house' : chance(0.3) ? 'hut' : 'cottage';
    if (north && roomy && mansions < 4 && chance(0.7)) tier = 'mansion';
    if (i === 0 && tier !== 'cottage') tier = 'cottage'; // your family starts in a modest home
    if (tier === 'mansion') mansions++;
    B.tag = 'house' + i;
    houses.push(makeHouse(hp, tier, i));
    B.tag = null;
  });
  function makeHouse(hp, tier, i, dimsIn) {
    const noble = tier === 'house' || tier === 'mansion';
    const dims = { hut: [rr(5, 6), rr(3.8, 4.3), 2.1, 0.2], cottage: [rr(8, 9.6), rr(5.2, 6), 2.6, 0.45], house: [rr(10, 11.5), rr(6, 6.8), 2.8, 0.6], mansion: [rr(12.5, 14), rr(6.8, 7.4), 3.1, 1.0] }[tier];
    const [w, d, hh, plinth] = dimsIn || dims;
    const hk = hanok(hp.x, hp.z, hp.rot, { w, d, h: hh, plinth, style: noble ? 'giwa' : 'choga', lanterns: tier === 'mansion' || (tier === 'house' && chance(0.6)), lanternColor: chance(0.5) ? '#c0392b' : '#2e5fa0', roofH: tier === 'mansion' ? w * 0.17 + 1.4 : undefined });
    const house = { id: i, ...hk, noble, tier, residents: [], objs: [], dims: [w, d, hh, plinth], place: { x: hp.x, z: hp.z, rot: hp.rot } };
    if (tier === 'mansion') {
      // walled compound: plaster walls with a tiled coping, and a raised gate (솟을대문) facing the road
      // wide enough to walk round the cook pot and the jar stand
      const cw = w / 2 + 5.0, cd = d / 2 + 4.8, wh = 1.9, gate = 3.2;
      const seg = (lx, lz, len, along) => { const p = hk.world(lx, lz); const y = heightAt(p[0], p[1]); const rot = hp.rot + (along ? 0 : Math.PI / 2);
        B.add('plaster', new THREE.BoxGeometry(len, wh, 0.45), '#efe7d6', mtx(p[0], y + wh / 2 - 0.2, p[1], rot));
        B.add('stone', new THREE.BoxGeometry(len, 0.6, 0.55), '#b8b0a2', mtx(p[0], y + 0.1, p[1], rot));
        B.add('tile', new THREE.BoxGeometry(len + 0.2, 0.22, 0.95), '#5a6068', mtx(p[0], y + wh - 0.05, p[1], rot));
        B.add('vc', new THREE.BoxGeometry(len + 0.25, 0.14, 0.3), C.ridge, mtx(p[0], y + wh + 0.12, p[1], rot));
        obbs.push({ x: p[0], z: p[1], hw: (along ? len : 0.45) / 2 + 0.2, hd: (along ? 0.45 : len) / 2 + 0.2, rot: hp.rot }); };
      seg(0, -cd, cw * 2, true); seg(-cw, 0, cd * 2, false); seg(cw, 0, cd * 2, false);
      const side = (cw * 2 - gate) / 2; seg(-(gate / 2 + side / 2), cd, side, true); seg(gate / 2 + side / 2, cd, side, true);
      const gp = hk.world(0, cd); const gy = heightAt(gp[0], gp[1]);
      for (const sx of [-1, 1]) { const pp = hk.world(sx * (gate / 2 - 0.2), cd); B.add('vc', new THREE.CylinderGeometry(0.18, 0.2, 3.6, 8), C.wood, mtx(pp[0], heightAt(pp[0], pp[1]) + 1.6, pp[1])); }
      const gr = roofGeometry({ w: gate + 0.4, d: 1.4, o: 0.7, H: 1.0, lift: 0.5, ridgeK: 1.0 });
      B.add('tile', gr.geo, '#ffffff', new THREE.Matrix4().multiplyMatrices(mtx(gp[0], gy + 3.3, gp[1], hp.rot), new THREE.Matrix4()));
      B.add('vc', new THREE.BoxGeometry(gate - 0.3, 0.5, 0.2), C.wood, mtx(gp[0], gy + 3.0, gp[1], hp.rot));
      // a pair of guardian pines in the court
      const tp = hk.world(-w / 2 - 1.6, d / 2 + 2.4); B.add('vc', new THREE.CylinderGeometry(0.16, 0.22, 2.2, 7), C.wood, mtx(tp[0], heightAt(tp[0], tp[1]) + 1.1, tp[1]));
      B.add('vc', new THREE.SphereGeometry(1.1, 9, 6), '#3d5a34', mtx(tp[0], heightAt(tp[0], tp[1]) + 2.6, tp[1], 0, 0, 0, 1.2, 0.7, 1.2));
      // move the front door point outside the gate so people walk in through it
      house.gate = hk.world(0, cd + 1.2);
    }
    if (tier === 'hut') { // a lean-to of brushwood beside the hut
      const lp = hk.world(w / 2 + 0.9, 0); B.add('thatch', new THREE.BoxGeometry(1.4, 0.12, 2.6), '#ffffff', mtx(lp[0], heightAt(lp[0], lp[1]) + 1.3, lp[1], hp.rot, 0, 0.35));
    }
    // yard: cookpot (gamasot on clay stove), onggi jars, bed (inside)
    const cp = hk.world(w / 2 + 1.6, d / 2 + 0.6);
    B.add('vc', new THREE.CylinderGeometry(0.75, 0.85, 0.7, 10), '#8a6a50', mtx(cp[0], heightAt(cp[0], cp[1]) + 0.35, cp[1]));
    B.add('metal', new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), '#2b2522', mtx(cp[0], heightAt(cp[0], cp[1]) + 0.85, cp[1]));
    B.add('metal', new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12), '#3a3430', mtx(cp[0], heightAt(cp[0], cp[1]) + 0.9, cp[1]));
    circles.push({ x: cp[0], z: cp[1], r: 0.9 });
    const cpo = hk.world(w / 2 + 1.6, d / 2 + 2.0);
    house.objs.push(addObj('cookpot', cpo[0], cpo[1], hp.rot + Math.PI, { house: i, look: [cp[0], cp[1]] }));
    const jars = hk.world(-w / 2 - 1.8, -d / 2 + 1.2);
    const jy = heightAt(jars[0], jars[1]);
    B.add('stone', new THREE.BoxGeometry(2.6, 0.3, 2.0), '#cfc8bb', mtx(jars[0], jy + 0.1, jars[1], hp.rot));
    for (let k = 0; k < 6; k++) {
      const s = rr(0.6, 1.1);
      B.add('glaze', onggiGeo(s), '#5a3322', mtx(jars[0] + rr(-0.9, 0.9), jy + 0.25, jars[1] + rr(-0.7, 0.7)));
    }
    circles.push({ x: jars[0], z: jars[1], r: 1.1 });
    house.objs.push(addObj('bed', hk.door[0], hk.door[1], hp.rot + Math.PI, { house: i }));
    return house;
  }
  // ---------- Building plots (택지): open land along the outer roads where new homes can rise ----------
  const plots = [];
  for (const road of ROADS) {
    for (let si = 0; si < road.length - 1; si++) {
      const [ax, az] = road[si], [bx, bz] = road[si + 1];
      const L = Math.hypot(bx - ax, bz - az); const tx = (bx - ax) / L, tz = (bz - az) / L;
      for (let t = 8; t < L - 6; t += 15) {
        const px = ax + tx * t, pz = az + tz * t; const R = Math.hypot(px, pz);
        if (R < 55 || R > 240) continue;
        for (const side of [-1, 1]) {
          const off = 13 + rand() * 1.5; const hx = px + -tz * side * off, hz = pz + tx * side * off;
          if (reservedCircles.some(([cx, cz, r]) => Math.hypot(hx - cx, hz - cz) < r)) continue;
          if ([...housePlaces, ...plots].some((h) => Math.hypot(h.x - hx, h.z - hz) < 17)) continue;
          if (riverDist(hx, hz) < 18 || heightAt(hx, hz) < WATER_LEVEL + 0.8 || roadDist(hx, hz) < 8 || blockedObb(hx, hz, 7)) continue;
          if (Math.abs(heightAt(hx + 6, hz) - heightAt(hx - 6, hz)) > 3 || Math.abs(heightAt(hx, hz + 5) - heightAt(hx, hz - 5)) > 3) continue;
          const p = LAYOUT.paddies; if (hx > p.x0 - 8 && hx < p.x1 + 8 && hz > p.z0 - 8 && hz < p.z1 + 8) continue;
          if (Math.hypot(hx - LAYOUT.palace[0], hz - LAYOUT.palace[1]) < 75 || Math.hypot(hx - LAYOUT.temple[0], hz - LAYOUT.temple[1]) < 40 || Math.hypot(hx - LAYOUT.banditCamp[0], hz - LAYOUT.banditCamp[1]) < 60) continue;
          plots.push({ id: plots.length, x: hx, z: hz, rot: Math.atan2(tz * side, -tx * side), roomy: false });
        }
      }
    }
  }
  for (const p of plots) p.roomy = [...housePlaces, ...plots].every((h) => h === p || Math.hypot(h.x - p.x, h.z - p.z) > 22);

  // ---------- Plaza: guardian tree, platforms, well ----------
  const gt = makeGuardianTree();
  gt.position.set(0, heightAt(0, 0) - 0.3, 0); scene.add(gt);
  circles.push({ x: 0, z: 0, r: 3.2 });
  // sacred straw rope around trunk
  B.add('vc', new THREE.TorusGeometry(1.7, 0.09, 6, 24).rotateX(Math.PI / 2), C.straw, mtx(0, heightAt(0, 0) + 1.9, 0));
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; B.add('vc', new THREE.PlaneGeometry(0.12, 0.4), '#f4f0e6', mtx(Math.cos(a) * 1.75, heightAt(0, 0) + 1.65, Math.sin(a) * 1.75, -a)); }
  // stone altar
  B.add('stone', new THREE.BoxGeometry(2.2, 0.6, 1.2), '#ffffff', mtx(0, heightAt(0, 4) + 0.3, 4.2));
  spots.plaza = [0, 0];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.6; const px = Math.cos(a) * 13, pz = Math.sin(a) * 13; const y = heightAt(px, pz);
    B.add('vc', new THREE.BoxGeometry(3.4, 0.12, 2.4), C.woodLight, mtx(px, y + 0.55, pz, -a));
    for (const [lx, lz] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
      const c = Math.cos(-a), s = Math.sin(-a);
      B.add('vc', new THREE.BoxGeometry(0.14, 0.55, 0.14), C.wood, mtx(px + lx * c + lz * s, y + 0.27, pz - lx * s + lz * c));
    }
    circles.push({ x: px, z: pz, r: 1.6 });
    addObj('platform', px - Math.cos(a) * 2.2, pz - Math.sin(a) * 2.2, Math.atan2(Math.cos(a), Math.sin(a)), { seat: [px, pz], seatY: y + 0.62 });
    if (i === 0) addObj('rough', px * 0.75, pz * 0.75, -a);   // under the plaza platform's eaves
  }
  // wells
  for (const [wx, wz] of [[15, -13], [-38, 52], [38, 58], [-46, -52], [62, -20]]) {
    const wy = heightAt(wx, wz);
    B.add('stone', new THREE.CylinderGeometry(1.0, 1.1, 0.9, 14, 1, true), '#ffffff', mtx(wx, wy + 0.45, wz));
    B.add('vc', new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14), '#1d2a2e', mtx(wx, wy + 0.6, wz));
    for (const sx of [-1, 1]) B.add('vc', new THREE.BoxGeometry(0.15, 2.2, 0.15), C.wood, mtx(wx + sx * 1.1, wy + 1.1, wz));
    B.add('vc', new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6).rotateZ(Math.PI / 2), C.wood, mtx(wx, wy + 2.0, wz));
    const wr = roofGeometry({ w: 2.2, d: 1.2, o: 0.4, H: 0.7, lift: 0.2 });
    B.add('tile', wr.geo, '#ffffff', mtx(wx, wy + 2.15, wz));
    circles.push({ x: wx, z: wz, r: 1.4 });
    addObj('well', wx - 2.1, wz, Math.PI / 2, { look: [wx, wz] });
    addObj('well', wx + 2.1, wz, -Math.PI / 2, { look: [wx, wz] });
    addObj('well', wx, wz + 2.1, Math.PI, { look: [wx, wz] });
  }

  // ---------- Jumak (tavern) ----------
  {
    const hk = hanok(27, 15, -Math.PI / 2, { w: 12, d: 7, style: 'choga', lanterns: true, lanternColor: '#c0392b' });
    const seats = [hk.world(-3, 6.5), hk.world(3, 6.5), hk.world(0, 10)];
    for (const [px, pz] of seats) {
      const y = heightAt(px, pz);
      B.add('vc', new THREE.BoxGeometry(3.2, 0.12, 2.2), C.woodLight, mtx(px, y + 0.5, pz, -Math.PI / 2));
      for (const [lx, lz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) B.add('vc', new THREE.BoxGeometry(0.12, 0.5, 0.12), C.wood, mtx(px + lz, y + 0.25, pz + lx));
      B.add('glaze', onggiGeo(0.35), '#e6dccb', mtx(px, y + 0.56, pz));
      circles.push({ x: px, z: pz, r: 1.5 });
      for (let k = 0; k < 3; k++) addObj('jumak', px + 2.0, pz + (k - 1) * 0.9, -Math.PI / 2, { seatY: y + 0.6, seat: [px + 0.9, pz + (k - 1) * 0.9] });
      addObj('lodging', px + 3.2, pz + 2.6, -Math.PI / 2);
    }
    const sp = hk.world(-4.5, 4.3);
    addObj('serve', sp[0], sp[1], -Math.PI / 2);
    // big cauldron
    const cp = hk.world(4.5, 4.6); const cy = heightAt(cp[0], cp[1]);
    B.add('vc', new THREE.CylinderGeometry(0.9, 1.0, 0.8, 12), '#8a6a50', mtx(cp[0], cy + 0.4, cp[1]));
    B.add('metal', new THREE.SphereGeometry(0.75, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), '#2b2522', mtx(cp[0], cy + 0.95, cp[1]));
    circles.push({ x: cp[0], z: cp[1], r: 1.1 });
    fires.push({ x: cp[0], y: cy + 0.3, z: cp[1], small: true });
    // sign banner pole (주막)
    spots.jumak = hk.door;
  }

  // ---------- Seodang (village school) ----------
  {
    const hk = hanok(45, -64, 0, { w: 11, d: 6.5, style: 'giwa', lanterns: true });
    for (let k = 0; k < 3; k++) { const p = hk.world(-3 + k * 3, 4.6); addObj('study', p[0], p[1], Math.PI, { seatY: hk.y0 + 0.6 }); }
    for (let k = 0; k < 6; k++) { const p = hk.world(-4 + (k % 3) * 4, 6.2 + Math.floor(k / 3) * 1.6); addObj('lesson', p[0], p[1], Math.PI, { look: [45, -64] }); }
    spots.school = hk.door;
  }

  // ---------- Market stalls ----------
  const awningCols = ['#a3262a', '#2e4f8a', '#c49a2a', '#3f7d63', '#7a3b8f', '#d1772c'];
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      const z = 55 + i * 9, x = side * 7.5 + (z > 100 ? -4 : 0) * 0;
      const y = heightAt(x, z);
      const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const T = mtx(x, y, z, rot);
      const add = (geo, color, lm, key = 'vc') => B.add(key, geo, color, new THREE.Matrix4().multiplyMatrices(T, lm));
      for (const [lx, lz] of [[-1.4, -1], [1.4, -1], [-1.4, 1], [1.4, 1]]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.4 + (lz > 0 ? 0 : 0.4), 5), C.wood, mtx(lx, 1.2 + (lz > 0 ? 0 : 0.2), lz));
      add(new THREE.BoxGeometry(3.2, 0.06, 2.6), pick(awningCols), mtx(0, 2.55, 0, 0, -0.18), 'cloth');
      add(new THREE.BoxGeometry(2.6, 0.8, 0.9), C.woodLight, mtx(0, 0.4, 0.4));
      const goods = pick(['veg', 'pots', 'cloth', 'fish']);
      for (let k = 0; k < 7; k++) {
        const gx = rr(-1.1, 1.1), gz = rr(0.1, 0.7);
        if (goods === 'veg') add(new THREE.SphereGeometry(rr(0.08, 0.14), 6, 4), pick(['#ff7a12', '#d43a2a', '#e8d24a', '#7aa03c']), mtx(gx, 0.88, gz));
        else if (goods === 'pots') B.add('glaze', onggiGeo(rr(0.25, 0.4)), pick(['#5a3322', '#7a4a2a', '#e6dccb']), new THREE.Matrix4().multiplyMatrices(T, mtx(gx, 0.8, gz)));
        else if (goods === 'cloth') add(new THREE.BoxGeometry(0.4, 0.12, 0.3), pick(awningCols), mtx(gx, 0.86 + k * 0.03, gz));
        else add(new THREE.BoxGeometry(0.35, 0.05, 0.1), '#9aa6b0', mtx(gx, 0.84, gz, rr(0, 3)));
      }
      obbs.push({ x, z, hw: 1.7, hd: 1.4, rot });
      const back = [x + Math.sin(rot) * -1.6, z + Math.cos(rot) * -1.6];
      const front = [x + Math.sin(rot) * 2.4, z + Math.cos(rot) * 2.4];
      addObj('stallWork', back[0], back[1], rot);
      addObj('shop', front[0], front[1], rot + Math.PI);
    }
  }
  spots.market = [0, 78];

  // ---------- Training ground ----------
  {
    const [cx, cz] = LAYOUT.training; spots.training = [cx, cz];
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2; if (Math.abs(a - 5.6) < 0.35) continue;
      const px = cx + Math.cos(a) * 19, pz = cz + Math.sin(a) * 19;
      B.add('vc', new THREE.CylinderGeometry(0.09, 0.11, 1.4, 5), C.wood, mtx(px, heightAt(px, pz) + 0.7, pz));
      if (i % 2 === 0) { const a2 = (i + 1) / 40 * Math.PI * 2; B.add('vc', beamBetween([px, heightAt(px, pz) + 1.1, pz], [cx + Math.cos(a2 + Math.PI / 40) * 19, heightAt(px, pz) + 1.1, cz + Math.sin(a2 + Math.PI / 40) * 19], 0.05, 4), C.wood); }
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.85 + i * 0.32; const px = cx + Math.cos(a) * 12, pz = cz + Math.sin(a) * 12; const y = heightAt(px, pz);
      B.add('vc', new THREE.CylinderGeometry(0.12, 0.14, 2.0, 6), C.wood, mtx(px, y + 1.0, pz));
      B.add('thatch', new THREE.CylinderGeometry(0.32, 0.36, 1.1, 8), '#ffffff', mtx(px, y + 1.35, pz));
      B.add('vc', new THREE.CylinderGeometry(0.05, 0.05, 1.3, 4).rotateZ(Math.PI / 2), C.wood, mtx(px, y + 1.6, pz, a));
      B.add('thatch', new THREE.SphereGeometry(0.24, 8, 6), '#ffffff', mtx(px, y + 2.1, pz));
      circles.push({ x: px, z: pz, r: 0.5 });
      const fx = cx + Math.cos(a) * 10.2, fz = cz + Math.sin(a) * 10.2;
      const face = Math.atan2(px - fx, pz - fz);
      addObj('dummy', fx, fz, face, { look: [px, pz] });
      addObj('trainWork', fx + Math.cos(a + 1.57) * 0.01, fz + Math.sin(a + 1.57) * 0.01, face, { look: [px, pz] });
    }
    // archery targets
    for (let i = 0; i < 3; i++) {
      const px = cx + 14 + i * 3, pz = cz - 10; const y = heightAt(px, pz);
      B.add('cloth', new THREE.CylinderGeometry(0.75, 0.75, 0.15, 16).rotateX(Math.PI / 2), '#e8dcc0', mtx(px, y + 1.1, pz));
      B.add('vc', new THREE.CylinderGeometry(0.45, 0.45, 0.17, 16).rotateX(Math.PI / 2), '#a3262a', mtx(px, y + 1.1, pz));
      B.add('vc', new THREE.CylinderGeometry(0.18, 0.18, 0.19, 12).rotateX(Math.PI / 2), '#e0b030', mtx(px, y + 1.1, pz));
      B.add('vc', new THREE.BoxGeometry(0.1, 1.2, 0.1), C.wood, mtx(px, y + 0.4, pz));
      circles.push({ x: px, z: pz, r: 0.8 });
      addObj('target', px - 1, pz + 14, Math.PI, { look: [px, pz] });
    }
    // weapon rack
    const rx = cx - 4, rz = cz + 15; const ry = heightAt(rx, rz);
    B.add('vc', new THREE.BoxGeometry(3, 0.12, 0.3), C.wood, mtx(rx, ry + 1.4, rz)); B.add('vc', new THREE.BoxGeometry(3, 0.12, 0.3), C.wood, mtx(rx, ry + 0.4, rz));
    for (let k = 0; k < 5; k++) B.add('metal', new THREE.BoxGeometry(0.04, 2.2, 0.06), '#c0c4c8', mtx(rx - 1.2 + k * 0.6, ry + 1.2, rz, 0, 0, 0.1));
    circles.push({ x: rx, z: rz, r: 1.6 });
    lanterns.push({ x: cx - 18, y: heightAt(cx - 18, cz) + 2.3, z: cz, post: true }, { x: cx + 18, y: heightAt(cx + 18, cz) + 2.3, z: cz, post: true });
  }

  // ---------- Palace ----------
  {
    const [px, pz] = LAYOUT.palace; spots.palace = [px, pz + 10]; spots.palaceGate = [px, -146];
    const W = 92, D = 76, wallH = 3.0, gz = pz + D / 2; // south wall z
    const wallSeg = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1), rot = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
      const steps = Math.ceil(len / 6);
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps; const mx = lerp(x1, x2, (t0 + t1) / 2), mz = lerp(z1, z2, (t0 + t1) / 2);
        const y = heightAt(mx, mz); const sl = len / steps + 0.05;
        B.add('stone', new THREE.BoxGeometry(sl, 1.3, 1.3), '#ffffff', mtx(mx, y + 0.0, mz, rot));
        B.add('plaster', new THREE.BoxGeometry(sl, wallH - 1.0, 1.0), '#f0e8d6', mtx(mx, y + 0.65 + (wallH - 1.0) / 2, mz, rot));
        const cap = roofGeometry({ w: sl, d: 0.6, o: 0.45, H: 0.5, lift: 0, ridgeK: 6 });
        B.add('tile', cap.geo, '#ffffff', mtx(mx, y + wallH + 0.1, mz, rot));
        B.add('vc', new THREE.BoxGeometry(sl, 0.2, 0.3), C.ridge, mtx(mx, y + wallH + 0.62, mz, rot));
      }
      obbs.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, hw: len / 2, hd: 0.9, rot });
    };
    const x0 = px - W / 2, x1 = px + W / 2, z0 = pz - D / 2, z1 = gz;
    wallSeg(x0, z0, x1, z0); wallSeg(x0, z0, x0, z1); wallSeg(x1, z0, x1, z1);
    wallSeg(x0, z1, px - 7, z1); wallSeg(px + 7, z1, x1, z1);
    // gate house
    const gy = heightAt(px, z1);
    for (const sx of [-1, 1]) { B.add('stone', new THREE.BoxGeometry(4, 5, 4), '#ffffff', mtx(px + sx * 5, gy + 2.2, z1)); obbs.push({ x: px + sx * 5, z: z1, hw: 2.2, hd: 2.2, rot: 0 }); }
    B.add('dancheong', new THREE.BoxGeometry(14, 0.6, 4.4), '#ffffff', mtx(px, gy + 5.0, z1));
    B.add('facadeD', new THREE.BoxGeometry(11, 2.2, 3.4), '#ffffff', mtx(px, gy + 6.4, z1));
    const gr = roofGeometry({ w: 12, d: 4.2, o: 1.9, H: 2.6, lift: 1.1 });
    B.add('tile', gr.geo, '#ffffff', mtx(px, gy + 7.6, z1));
    B.add('vc', new THREE.BoxGeometry(gr.rh * 2 + 0.6, 0.5, 0.7), C.ridge, mtx(px, gy + 7.6 + 2.75, z1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('vc', beamBetween([px + sx * gr.A * 1.04, gy + 7.6 + 1.2, z1 + sz * gr.B * 1.04], [px + sx * gr.rh, gy + 7.6 + 2.7, z1], 0.17), C.ridge);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add('vc', new THREE.CylinderGeometry(0.22, 0.24, 2.4, 8), C.red, mtx(px + sx * 5, gy + 6.3, z1 + sz * 1.6));
    lanterns.push({ x: px - 8.5, y: gy + 2.8, z: z1 + 2.5, post: true }, { x: px + 8.5, y: gy + 2.8, z: z1 + 2.5, post: true });
    addObj('guard', px - 9, z1 + 4, 0); addObj('guard', px + 9, z1 + 4, 0);
    addObj('guard', px - 9, z1 - 4, Math.PI); addObj('guard', px + 9, z1 - 4, Math.PI);
    // main hall
    const hall = hanok(px, pz - 14, 0, { w: 24, d: 12, h: 4.2, style: 'palace', double: true, plinth: 1.6, tier2: true, roofH: 3.6, over: 2.2, lift: 1.3, lanterns: true });
    // stone path
    for (let z = z1 - 2; z > pz - 4; z -= 2.2) B.add('stone', new THREE.BoxGeometry(4.2, 0.2, 2.0), '#e6e0d6', mtx(px, heightAt(px, z) + 0.05, z));
    // rank stones + court spots
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      const sx2 = px + sx * 5, sz2 = pz + 2 + i * 4.2;
      B.add('stone', new THREE.BoxGeometry(0.35, 0.7, 0.25), '#ffffff', mtx(sx2, heightAt(sx2, sz2) + 0.35, sz2));
      circles.push({ x: sx2, z: sz2, r: 0.3 });
      addObj('court', sx2 - sx * 1.2, sz2 + 0.6, Math.PI);
    }
    // side halls
    hanok(px - 34, pz - 4, Math.PI / 2, { w: 15, d: 7, style: 'giwa', lanterns: true });
    hanok(px + 34, pz - 4, -Math.PI / 2, { w: 15, d: 7, style: 'giwa', lanterns: true });
    // ---- the inner court (내전): where the royal family actually lives ----
    // Behind the throne hall, as at Gyeongbokgung: the council hall where the day's business is done,
    // then the king's and queen's quarters, with the kitchen and the infirmary on the flanks.
    hanok(px, pz - 27, 0, { w: 18, d: 9, h: 3.8, style: 'palace', plinth: 1.0, roofH: 3.0, over: 1.8, lanterns: true });        // 사정전, council
    hanok(px - 21, pz - 31, 0, { w: 13, d: 8, h: 3.4, style: 'palace', plinth: 0.8, roofH: 2.7, over: 1.6 });                   // 강녕전, the king
    hanok(px + 21, pz - 31, 0, { w: 13, d: 8, h: 3.4, style: 'palace', plinth: 0.8, roofH: 2.7, over: 1.6, lanterns: true });   // 교태전, the queen
    hanok(px - 35, pz - 20, Math.PI / 2, { w: 10, d: 6, style: 'giwa' });                                                       // 수라간, royal kitchen
    hanok(px + 35, pz - 20, -Math.PI / 2, { w: 10, d: 6, style: 'giwa' });                                                      // 내의원, royal infirmary
    addObj('cookpot', px - 35, pz - 16, 0);
    addObj('study', px + 35, pz - 16, 0);

    // ---- 품계석: the rank stones ----
    // Two files of them down the courtyard. At the morning assembly every official stands at the stone
    // of his grade, the first grade nearest the throne — so the whole hierarchy is legible at a glance.
    const stoneTop = pz - 6, stoneGap = 3.4;
    for (let i = 0; i < 9; i++) {
      const sz2 = stoneTop + 4 + i * stoneGap;
      for (const sx of [-1, 1]) {
        const sxp = px + sx * 5.5, sy = heightAt(sxp, sz2);
        B.add('stone', new THREE.BoxGeometry(0.5, 0.95, 0.5), '#e6e2d8', mtx(sxp, sy + 0.47, sz2));
        B.add('stone', new THREE.BoxGeometry(0.66, 0.12, 0.66), '#d8d2c6', mtx(sxp, sy + 0.99, sz2));
        addObj('rankstone', sxp + sx * 1.5, sz2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, { grade: 9 - i, side: sx });
      }
    }

    // ---- 신문고: the petition drum at the gate ----
    // Any commoner with a grievance the magistrates will not hear may strike it, and the court must
    // listen. It is the one place in the palace an ordinary villager is allowed to stand.
    {
      const dx = px - 13, dz = gz - 5, dy = heightAt(dx, dz);
      for (const sx of [-1, 1]) B.add('vc', new THREE.CylinderGeometry(0.16, 0.18, 2.6, 8), C.red, mtx(dx + sx * 1.0, dy + 1.3, dz));
      B.add('vc', new THREE.BoxGeometry(2.6, 0.2, 0.3), C.red, mtx(dx, dy + 2.6, dz));
      B.add('vc', new THREE.CylinderGeometry(0.72, 0.72, 0.95, 16), '#d9b06a', mtx(dx, dy + 1.65, dz, 0, Math.PI / 2));
      B.add('vc', new THREE.CylinderGeometry(0.74, 0.74, 0.08, 16), '#8d2f24', mtx(dx + 0.52, dy + 1.65, dz, 0, Math.PI / 2));
      B.add('vc', new THREE.CylinderGeometry(0.74, 0.74, 0.08, 16), '#8d2f24', mtx(dx - 0.52, dy + 1.65, dz, 0, Math.PI / 2));
      obbs.push({ x: dx, z: dz, hw: 1.4, hd: 0.6, rot: 0 });
      addObj('petitiondrum', dx, dz + 1.6, 0);
      spots.petitionDrum = [dx, dz + 1.6];
    }

    // ---- 경회루: the banquet pavilion on its lotus pond ----
    // The one building in a Joseon palace meant purely for pleasure and state occasions: an open floor
    // on stone pillars standing out over the water, where the King feasted envoys and his own court.
    {
      const qx = px - 68, qz = pz - 6, qy = heightAt(qx, qz);   // clear of the west wall at px-46
      const pw = 30, pd = 24;
      // The pond is a RAISED stone basin, not a hole: the terrain here is not flat and a sunken slab
      // simply disappeared into the hillside, leaving the pavilion standing on dry grass. A formal
      // palace pond was a built thing anyway, walled and faced in cut stone.
      const lip = 0.95;
      for (const [ox, oz, w2, d2] of [[0, -pd / 2, pw + 1.8, 0.9], [0, pd / 2, pw + 1.8, 0.9], [-pw / 2, 0, 0.9, pd + 1.8], [pw / 2, 0, 0.9, pd + 1.8]]) {
        const ey = heightAt(qx + ox, qz + oz);
        B.add('stone', new THREE.BoxGeometry(w2, lip + 1.2, d2), '#cfc9bd', mtx(qx + ox, ey + lip / 2 - 0.3, qz + oz));
      }
      // the water, just under the lip
      B.add('vc', new THREE.BoxGeometry(pw - 0.4, 0.3, pd - 0.4), '#24525c', mtx(qx, qy + lip - 0.42, qz));
      obbs.push({ x: qx, z: qz - pd / 2, hw: pw / 2 + 0.8, hd: 0.5, rot: 0 });
      obbs.push({ x: qx, z: qz + pd / 2, hw: pw / 2 + 0.8, hd: 0.5, rot: 0 });
      obbs.push({ x: qx - pw / 2, z: qz, hw: 0.5, hd: pd / 2 + 0.8, rot: 0 });
      // the east wall, with a gap where the stair-bridge crosses it (it had no collision at all, so
      // anyone could stroll in and wade across the pond at ground level)
      const gap = 1.7, eh = (pd / 2 + 0.8 - gap) / 2;
      for (const sz of [-1, 1]) obbs.push({ x: qx + pw / 2, z: qz + sz * (gap + eh), hw: 0.5, hd: eh, rot: 0 });
      // lotus pads
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (pw / 2 - 3);
        B.add('vc', new THREE.CylinderGeometry(0.5 + Math.random() * 0.35, 0.5, 0.06, 7), '#3f6b3a', mtx(qx + Math.cos(a) * r, qy + lip - 0.26, qz + Math.sin(a) * r * 0.78));
      }
      // the pavilion itself: 12 stone pillars, an open floor, a great tiled roof
      const fw = 17, fd = 12, fh = 2.9;
      for (let i = -2; i <= 2; i++) for (const sz of [-1, 0, 1]) {
        const cx = qx + i * (fw / 4.2), cz = qz + sz * (fd / 2.6);
        B.add('stone', new THREE.CylinderGeometry(0.42, 0.5, fh + lip, 8), '#d6d0c4', mtx(cx, qy + (fh + lip) / 2, cz));
      }
      B.add('wood', new THREE.BoxGeometry(fw + 1.4, 0.4, fd + 1.4), '#8a6b45', mtx(qx, qy + fh + lip + 0.2, qz));
      B.add('floor', new THREE.BoxGeometry(fw, 0.18, fd), '#c9a877', mtx(qx, qy + fh + lip + 0.48, qz));
      for (const sx of [-1, 1]) for (let i = -1; i <= 1; i++) B.add('vc', new THREE.CylinderGeometry(0.2, 0.22, 2.6, 8), C.red, mtx(qx + i * (fw / 2.4), qy + fh + lip + 1.78, qz + sx * fd / 2.2));
      B.add('dancheong', new THREE.BoxGeometry(fw + 0.6, 0.45, fd + 0.6), '#5d7f6a', mtx(qx, qy + fh + lip + 3.2, qz));
      const pr2 = roofGeometry({ w: fw + 1, d: fd + 1, o: 2.4, H: 3.1, lift: 1.25 });
      B.add('tile', pr2.geo, '#ffffff', mtx(qx, qy + fh + lip + 3.5, qz));
      B.add('vc', new THREE.BoxGeometry(pr2.rh * 2 + 0.7, 0.5, 0.8), C.ridge, mtx(qx, qy + fh + lip + 3.5 + 3.2, qz));
      // The floor is a walkable deck, reached by a stone stair-bridge from the east bank. The old
      // causeway climbed barely 1.5 m to a floor 4.4 m up, and the whole pavilion was a collision box —
      // so the banquet seats were unreachable and guests walked at it for hours, starving.
      const floorY = qy + fh + lip + 0.57;
      addDeck({ x0: qx - fw / 2, x1: qx + fw / 2, z0: qz - fd / 2, z1: qz + fd / 2, y0: floorY });
      const sx0 = qx + fw / 2, sx1 = qx + pw / 2 + 4.5, groundE = heightAt(sx1, qz);   // lands short of the palace wall at qx + 22
      addDeck({ x0: sx0 - 0.05, x1: sx1, z0: qz - 1.5, z1: qz + 1.5, y0: floorY, y1: groundE });
      const steps = 16;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps, x = sx0 + (sx1 - sx0) * t, y = floorY + (groundE - floorY) * t;
        const top = y + 0.1, bot = Math.min(heightAt(x, qz), qy + lip - 0.4);
        B.add('stone', new THREE.BoxGeometry((sx1 - sx0) / steps + 0.05, Math.max(0.3, top - bot), 3.2), '#d2ccc0', mtx(x, (top + bot) / 2, qz));
      }
      for (const side of [-1, 1]) {   // low stone balustrades along the stair
        const g = new THREE.BoxGeometry(Math.hypot(sx1 - sx0, floorY - groundE), 0.5, 0.18);
        const m = mtx((sx0 + sx1) / 2, (floorY + groundE) / 2 + 0.55, qz + side * 1.62, 0, 0, Math.atan2(groundE - floorY, sx1 - sx0));
        B.add('stone', g, '#e2ddd2', m);
      }
      // the water around the pavilion floor is not walkable (the deck's edges are its railings)
      const wN = (pd / 2 - fd / 2) / 2;
      for (const sz of [-1, 1]) obbs.push({ x: qx, z: qz + sz * (fd / 2 + wN), hw: pw / 2, hd: wN, rot: 0 });
      const wW = (pw / 2 - fw / 2) / 2;
      obbs.push({ x: qx - fw / 2 - wW, z: qz, hw: wW, hd: fd / 2, rot: 0 });
      const ehd = (fd / 2 - 1.6) / 2;
      for (const sz of [-1, 1]) obbs.push({ x: qx + fw / 2 + wW, z: qz + sz * (1.6 + ehd), hw: wW, hd: ehd, rot: 0 });
      addObj('banquet', qx, qz + fd / 2 - 1.5, 0, { cap: 10 });
      addObj('banquet', qx - 4, qz - fd / 2 + 1.5, Math.PI, { cap: 10 });
      spots.banquetHall = [sx1 + 1, qz];   // the foot of the stair ('pavilion' is the village one)
    }

    spots.council = [px, pz - 22];
    spots.kingQuarters = [px - 21, pz - 26];
    spots.queenQuarters = [px + 21, pz - 26];
    spots.courtyard = [px, pz + 8];

    for (const sx of [-1, 1]) for (const sz of [0, 1]) lanterns.push({ x: px + sx * 8, y: heightAt(px, pz) + 2.3, z: pz + 6 + sz * 14, post: true });
    spots.throne = hall.door;
    // throne dais with the Sun, Moon and Five Peaks screen (일월오봉도)
    {
      const tz = pz - 4.2, ty = heightAt(px, tz);
      B.add('stone', new THREE.BoxGeometry(5, 0.7, 3.4), '#ffffff', mtx(px, ty + 0.35, tz));
      B.add('cloth', new THREE.BoxGeometry(3.6, 0.04, 2.6), '#8e2a22', mtx(px, ty + 0.72, tz));
      B.add('vc', new THREE.BoxGeometry(1.2, 0.5, 0.9), '#8e2a22', mtx(px, ty + 0.95, tz));
      B.add('vc', new THREE.BoxGeometry(1.3, 1.2, 0.14), '#8e2a22', mtx(px, ty + 1.5, tz - 0.45));
      B.add('metal', new THREE.BoxGeometry(1.36, 0.12, 0.18), '#c9a45c', mtx(px, ty + 2.12, tz - 0.45));
      for (const sx of [-1, 1]) B.add('vc', new THREE.BoxGeometry(0.14, 0.4, 0.8), '#8e2a22', mtx(px + sx * 0.62, ty + 1.3, tz - 0.05));
      circles.push({ x: px, z: tz, r: 2.2 });
      addObj('throne', px, tz + 2.6, 0, { seat: [px, tz + 0.05], seatY: ty + 1.18 });
      spots.throneSeat = [px, tz];
      // painted screen
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#1f4f8a'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#e8f0f8'; g.beginPath(); g.arc(120, 60, 26, 0, 7); g.fill();
      g.fillStyle = '#d43a2a'; g.beginPath(); g.arc(392, 60, 26, 0, 7); g.fill();
      g.fillStyle = '#2d6b4c';
      for (const [x, h] of [[60, 120], [160, 160], [256, 200], [352, 160], [452, 120]]) { g.beginPath(); g.moveTo(x - 70, 210); g.lineTo(x, 210 - h); g.lineTo(x + 70, 210); g.fill(); }
      g.fillStyle = '#e8e2d2'; g.fillRect(0, 210, 512, 46);
      g.strokeStyle = '#9ec8e8'; g.lineWidth = 6; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 90, 232); g.quadraticCurveTo(i * 90 + 45, 218, i * 90 + 90, 232); g.stroke(); }
      g.fillStyle = '#7a3a1a'; for (const x of [40, 470]) { g.fillRect(x - 5, 120, 10, 90); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x, 115, 26, 0, 7); g.fill(); g.fillStyle = '#7a3a1a'; }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      scr.position.set(px, ty + 1.95, tz - 1.35); scene.add(scr);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.5, 0.08), new THREE.MeshStandardMaterial({ color: '#5a2a1a', roughness: 0.6 }));
      fr.position.set(px, ty + 1.95, tz - 1.4); fr.castShadow = true; scene.add(fr);
    }
  }

  // ---------- Watchtower ----------
  {
    const tx = -48, tz = -100, ty = heightAt(tx, tz);
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) B.add('vc', new THREE.CylinderGeometry(0.16, 0.2, 8, 6), C.wood, mtx(tx + lx, ty + 4, tz + lz));
    B.add('vc', new THREE.BoxGeometry(4.2, 0.25, 4.2), C.woodLight, mtx(tx, ty + 7, tz));
    for (const s of [-1, 1]) { B.add('vc', new THREE.BoxGeometry(4.2, 0.8, 0.1), C.wood, mtx(tx, ty + 7.5, tz + s * 2.05)); B.add('vc', new THREE.BoxGeometry(0.1, 0.8, 4.2), C.wood, mtx(tx + s * 2.05, ty + 7.5, tz)); }
    const r = roofGeometry({ w: 3.6, d: 3.6, o: 0.8, H: 1.5, lift: 0.4 }); B.add('tile', r.geo, '#ffffff', mtx(tx, ty + 9.6, tz));
    for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) B.add('vc', new THREE.CylinderGeometry(0.1, 0.1, 1.8, 5), C.wood, mtx(tx + lx, ty + 8.8, tz + lz));
    obbs.push({ x: tx, z: tz, hw: 2.2, hd: 2.2, rot: 0 });
    addObj('guard', tx + 3, tz + 3, 0.6);
    // red & blue banner poles
    for (const [bx, bz, col] of [[tx + 3, tz - 2, '#a3262a'], [tx - 3, tz - 2, '#2e4f8a']]) {
      const by = heightAt(bx, bz);
      B.add('vc', new THREE.CylinderGeometry(0.06, 0.06, 7, 5), C.wood, mtx(bx, by + 3.5, bz));
      B.add('cloth', new THREE.PlaneGeometry(1.2, 2.4), col, mtx(bx + 0.6, by + 5.6, bz));
    }
  }

  // ---------- Temple ----------
  {
    const [tx, tz] = LAYOUT.temple; spots.temple = [tx - 6, tz];
    const hk = hanok(tx + 8, tz - 4, -Math.PI / 2, { w: 14, d: 9, h: 3.4, style: 'temple', lanterns: true, lanternColor: '#d9a520' });
    for (let k = 0; k < 4; k++) { const p = hk.world(-4.5 + k * 3, 8.5); addObj('shrine', p[0], p[1], Math.PI / 2 * 1 - Math.PI, { look: [tx + 8, tz - 4] }); }
    { const p = hk.world(6, 10.5); addObj('rough', p[0], p[1], 0, { title: 'The temple veranda' }); }   // the monks turn no one away
    const p2 = hk.world(-3, 7); addObj('templeWork', p2[0], p2[1], Math.PI / 2); const p3 = hk.world(3, 7); addObj('templeWork', p3[0], p3[1], Math.PI / 2);
    // stone pagoda
    const sx = tx - 6, sz = tz - 14, sy = heightAt(sx, sz);
    B.add('stone', new THREE.BoxGeometry(3.2, 0.8, 3.2), '#ffffff', mtx(sx, sy + 0.4, sz));
    let y = sy + 0.8;
    for (let i = 0; i < 5; i++) {
      const s = 2.0 - i * 0.28;
      B.add('stone', new THREE.BoxGeometry(s * 0.7, 0.9 - i * 0.08, s * 0.7), '#ffffff', mtx(sx, y + 0.45, sz)); y += 0.9 - i * 0.08;
      const cap = roofGeometry({ w: s * 0.8, d: s * 0.8, o: s * 0.3, H: 0.25, lift: 0.18 }); B.add('stone', cap.geo, '#ffffff', mtx(sx, y, sz)); y += 0.3;
    }
    B.add('metal', new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6), '#8a7a4a', mtx(sx, y + 0.7, sz));
    circles.push({ x: sx, z: sz, r: 2 });
    // bell pavilion
    const bx = tx - 4, bz = tz + 14, by = heightAt(bx, bz);
    for (const [lx, lz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) B.add('vc', new THREE.CylinderGeometry(0.18, 0.2, 4, 8), C.red, mtx(bx + lx, by + 2, bz + lz));
    B.add('dancheong', new THREE.BoxGeometry(4.4, 0.4, 4.4), '#ffffff', mtx(bx, by + 4.1, bz));
    const br = roofGeometry({ w: 4, d: 4, o: 1.2, H: 1.8, lift: 0.7 }); B.add('tile', br.geo, '#ffffff', mtx(bx, by + 4.3, bz));
    const bell = new THREE.LatheGeometry([[0, 0], [0.7, 0.05], [0.65, 0.4], [0.55, 1.2], [0.4, 1.5], [0, 1.6]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
    B.add('bronze', bell, '#ffffff', mtx(bx, by + 2.0, bz));
    circles.push({ x: bx, z: bz, r: 2.6 });
    for (let i = 0; i < 4; i++) lanterns.push({ x: tx - 10 + i * 0.1, y: by + 2.5, z: tz - 10 + i * 7, post: true, color: '#d9a520' });
  }

  // ---------- Riverside pavilion (jeongja) ----------
  {
    const px = 128, pz = 100, py = heightAt(px, pz);
    B.add('stone', new THREE.CylinderGeometry(4.2, 4.4, 1.0, 6), '#ffffff', mtx(px, py + 0.2, pz));
    B.add('vc', new THREE.CylinderGeometry(4.0, 4.0, 0.2, 6), C.woodLight, mtx(px, py + 1.4, pz));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; B.add('vc', new THREE.CylinderGeometry(0.16, 0.18, 3.4, 8), C.red, mtx(px + Math.cos(a) * 3.6, py + 2.9, pz + Math.sin(a) * 3.6)); }
    B.add('dancheong', new THREE.CylinderGeometry(3.9, 3.9, 0.45, 6, 1, true), '#ffffff', mtx(px, py + 4.6, pz));
    const r = roofGeometry({ w: 5.8, d: 5.8, o: 1.6, H: 2.6, lift: 1.0 }); B.add('tile', r.geo, '#ffffff', mtx(px, py + 4.8, pz, Math.PI / 6));
    B.add('metal', new THREE.SphereGeometry(0.3, 8, 6), '#c49a2a', mtx(px, py + 7.6, pz));
    circles.push({ x: px, z: pz, r: 4.4 });
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.3; addObj('pavilion', px + Math.cos(a) * 5.4, pz + Math.sin(a) * 5.4, Math.atan2(-Math.cos(a), -Math.sin(a)), { seat: [px + Math.cos(a) * 2.2, pz + Math.sin(a) * 2.2], seatY: py + 1.5 }); }
    spots.pavilion = [px - 6, pz];
    lanterns.push({ x: px + 3.2, y: py + 3.9, z: pz, hang: true }, { x: px - 3.2, y: py + 3.9, z: pz, hang: true });
  }

  // ---------- Fields (work spots in paddies) + straw stacks ----------
  {
    const p = LAYOUT.paddies;
    for (let i = 0; i < 12; i++) {
      const fx = rr(p.x0 + 6, p.x1 - 6), fz = rr(p.z0 + 6, p.z1 - 6);
      if (roadDist(fx, fz) < 4) { i--; continue; }
      addObj('field', fx, fz, rr(0, 6.28));
    }
    for (let i = 0; i < 10; i++) {
      const sx = rr(p.x0 - 14, p.x1 + 14), sz = chance(0.5) ? p.z0 - rr(4, 9) : p.z1 + rr(4, 9);
      if (roadDist(sx, sz) < 4) continue;
      const sy = heightAt(sx, sz);
      B.add('thatch', new THREE.CylinderGeometry(0.9, 1.1, 1.6, 10), '#ffffff', mtx(sx, sy + 0.8, sz));
      B.add('thatch', new THREE.ConeGeometry(1.25, 1.2, 10), '#ffffff', mtx(sx, sy + 2.2, sz));
      circles.push({ x: sx, z: sz, r: 1.2 });
    }
    spots.fields = [(p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2];
    // a scarecrow (heosuabi)
    const sx = 10, sz = 160, sy = heightAt(sx, sz);
    B.add('vc', new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), C.wood, mtx(sx, sy + 1.2, sz));
    B.add('vc', new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5).rotateZ(Math.PI / 2), C.wood, mtx(sx, sy + 1.8, sz));
    B.add('cloth', new THREE.BoxGeometry(0.7, 0.8, 0.3), '#d9ceb2', mtx(sx, sy + 1.6, sz));
    B.add('thatch', new THREE.ConeGeometry(0.6, 0.35, 12), '#ffffff', mtx(sx, sy + 2.45, sz));
  }

  // ---------- Stream bathing spots ----------
  for (const [sx, sz] of [[118, 30], [150, 150], [160, -100]]) {
    let best = [sx, sz]; let bd = 99;
    for (let i = 0; i < 40; i++) { const x = sx + rr(-15, 15), z = sz + rr(-15, 15); const rd = riverDist(x, z); const dd = Math.abs(rd - 12); if (dd < bd && heightAt(x, z) > WATER_LEVEL - 0.2) { bd = dd; best = [x, z]; } }
    addObj('stream', best[0], best[1], 0);
  }

  // ---------- Bandit camp ----------
  {
    const [bx, bz] = LAYOUT.banditCamp; spots.bandit = [bx, bz];
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2; if (Math.abs(a - 5.5) < 0.3) continue;
      const px = bx + Math.cos(a) * 18, pz = bz + Math.sin(a) * 18; const y = heightAt(px, pz);
      const hh = rr(2.2, 3.2);
      B.add('vc', new THREE.CylinderGeometry(0.16, 0.2, hh, 6), '#4a3626', mtx(px, y + hh / 2 - 0.3, pz, 0, rr(-.08, .08), rr(-.08, .08)));
      B.add('vc', new THREE.ConeGeometry(0.17, 0.5, 6), '#4a3626', mtx(px, y + hh - 0.05, pz));
      circles.push({ x: px, z: pz, r: 0.5 });
    }
    const fy = heightAt(bx, bz);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; B.add('stone', new THREE.DodecahedronGeometry(0.3), '#ffffff', mtx(bx + Math.cos(a) * 1.0, fy + 0.1, bz + Math.sin(a) * 1.0)); }
    for (let i = 0; i < 4; i++) B.add('vc', new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5).rotateZ(Math.PI / 2), '#3a2a1a', mtx(bx, fy + 0.2, bz, i * 0.8));
    fires.push({ x: bx, y: fy + 0.2, z: bz });
    circles.push({ x: bx, z: bz, r: 1.3 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; addObj('campfire', bx + Math.cos(a) * 3, bz + Math.sin(a) * 3, a + Math.PI / 2 + Math.PI / 2 * 0 + Math.atan2(0, 0), { look: [bx, bz] }); }
    for (let i = 0; i < 4; i++) addObj('campWork', bx + rr(-6, 6), bz + rr(-6, 6), rr(0, 6.28));
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4; const tx = bx + Math.cos(a) * 11, tz = bz + Math.sin(a) * 11; const ty = heightAt(tx, tz);
      B.add('cloth', new THREE.ConeGeometry(2.4, 3.0, 8, 1, true), pick(['#6b5a45', '#5a4a3a', '#7a6a50']), mtx(tx, ty + 1.5, tz));
      B.add('vc', new THREE.CylinderGeometry(0.06, 0.06, 3.6, 4), '#3a2a1a', mtx(tx, ty + 1.8, tz));
      circles.push({ x: tx, z: tz, r: 2.4 });
      const door = [bx + Math.cos(a) * 8.2, bz + Math.sin(a) * 8.2];
      addObj('tent', door[0], door[1], a + Math.PI);
    }
  }

  // ---------- Seonangdang (village shrine cairn + cloth tree) ----------
  {
    const sx = -150, sz = 84, sy = heightAt(sx, sz);
    for (let i = 0; i < 40; i++) { const r = 1.6 * (1 - i / 40); const a = rand() * 6.28; B.add('stone', new THREE.DodecahedronGeometry(rr(0.2, 0.35)), '#ffffff', mtx(sx + Math.cos(a) * r, sy + i * 0.05, sz + Math.sin(a) * r)); }
    for (let i = 0; i < 18; i++) { const a = rand() * 6.28; B.add('cloth', new THREE.PlaneGeometry(0.15, rr(0.6, 1.2)), pick(['#c0392b', '#2e5fa0', '#e8c547', '#f4f0e6', '#3f7d63']), mtx(sx + 3 + Math.cos(a) * 1.4, sy + 3.2, sz + Math.sin(a) * 1.4, a)); }
    B.add('vc', new THREE.TorusGeometry(1.5, 0.05, 4, 20).rotateX(Math.PI / 2), C.straw, mtx(sx + 3, sy + 3.6, sz));
    circles.push({ x: sx, z: sz, r: 1.8 });
    addObj('shrine', sx + 2.6, sz - 1.2, 0, { look: [sx, sz] });
  }

  // ---------- Jangseung village guardians ----------
  const jtex1 = TX.jangseungTexture('天下大將軍'), jtex2 = TX.jangseungTexture('地下女將軍');
  const jmat1 = new THREE.MeshStandardMaterial({ map: jtex1, roughness: 0.9 }), jmat2 = new THREE.MeshStandardMaterial({ map: jtex2, roughness: 0.9 });
  const jangGroup = new THREE.Group();
  for (const [ax, az, bx2, bz2, face] of [[-6, 113, 6, 113, Math.PI], [62, -12, 62, 4, -Math.PI / 2 * -1], [-52, 20, -46, 34, Math.PI / 2 * -1]]) {
    [[ax, az, jmat1], [bx2, bz2, jmat2]].forEach(([x, z, mat]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 3.2, 12), mat);
      m.position.set(x, heightAt(x, z) + 1.6, z); m.rotation.y = face; m.castShadow = true;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 0.8 }));
      hat.position.y = 1.8; m.add(hat);
      jangGroup.add(m); circles.push({ x, z, r: 0.6 });
    });
  }
  scene.add(jangGroup);

  // ---------- Bridge ----------
  {
    const [ax, az] = BRIDGE.a, [bx, bz] = BRIDGE.b;
    const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az);
    const N = 18;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N; const x = lerp(ax, bx, t), z = lerp(az, bz, t);
      const y = BRIDGE.deck + Math.sin(t * Math.PI) * 1.2;
      const slope = Math.cos(t * Math.PI) * Math.PI * 1.2 / len;
      B.add('vc', new THREE.BoxGeometry(BRIDGE.width, 0.25, len / N + 0.05), C.woodLight, mtx(x, y - 0.12, z, rot, -Math.atan(slope)));
      for (const s of [-1, 1]) {
        const px = x + Math.cos(rot) * s * (BRIDGE.width / 2 - 0.1), pz = z - Math.sin(rot) * s * (BRIDGE.width / 2 - 0.1);
        if (i % 3 === 0) B.add('vc', new THREE.BoxGeometry(0.14, 1.0, 0.14), C.red, mtx(px, y + 0.4, pz, rot));
        B.add('vc', new THREE.BoxGeometry(0.1, 0.1, len / N + 0.05), C.red, mtx(px, y + 0.85, pz, rot, -Math.atan(slope)));
      }
      if (i % 4 === 1) for (const s of [-1, 1]) {
        const px = x + Math.cos(rot) * s * 1.6, pz = z - Math.sin(rot) * s * 1.6;
        B.add('vc', new THREE.CylinderGeometry(0.22, 0.25, y + 3.5, 8), C.wood, mtx(px, (y - 3.5) / 2, pz));
      }
    }
    lanterns.push({ x: ax - 1, y: heightAt(ax - 1, az) + 2.4, z: az + 3, post: true }, { x: bx + 1, y: heightAt(bx + 1, bz) + 2.4, z: bz - 3, post: true });
  }

  // ---------- Road lanterns ----------
  for (let z = -78; z < 110; z += 16) {
    const side = (Math.floor(z / 16) % 2) ? 1 : -1; const x = side * 4.5 + (z < -10 ? (z + 10) * 0.15 : 0);
    if (Math.hypot(x, z) < 30) continue;
    lanterns.push({ x, y: heightAt(x, z) + 2.3, z, post: true, color: side > 0 ? '#c0392b' : '#2e5fa0' });
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.25; const x = Math.cos(a) * 22, z = Math.sin(a) * 22; lanterns.push({ x, y: heightAt(x, z) + 2.3, z, post: true, color: i % 2 ? '#c0392b' : '#2e5fa0' }); }

  // lantern geometry
  for (const L of lanterns) {
    if (L.post) {
      const gy = L.y - 2.3;
      B.add('vc', new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), C.wood, mtx(L.x, gy + 1.3, L.z));
      B.add('vc', new THREE.BoxGeometry(0.06, 0.06, 0.6), C.wood, mtx(L.x, gy + 2.55, L.z + 0.25));
      L.z += 0.5; L.y = gy + 2.1;
      circles.push({ x: L.x, z: L.z - 0.5, r: 0.3 });
    }
    B.add('lantern', new THREE.CylinderGeometry(0.22, 0.2, 0.5, 10), L.color || '#c0392b', mtx(L.x, L.y, L.z));
    B.add('vc', new THREE.CylinderGeometry(0.12, 0.24, 0.12, 10), '#2a2220', mtx(L.x, L.y + 0.3, L.z));
    B.add('vc', new THREE.CylinderGeometry(0.008, 0.008, 0.4, 3), '#2a2220', mtx(L.x, L.y + 0.5, L.z));
  }

  // ---------- Fishing spots along the river ----------
  {
    let made = 0;
    for (let i = 0; i < 400 && made < 10; i++) {
      const x = rr(90, 200), z = rr(-160, 330);
      const rd = riverDist(x, z);
      if (rd < 10.5 || rd > 13 || heightAt(x, z) < WATER_LEVEL + 0.15 || objects.some((o) => o.kind === 'fish' && Math.hypot(o.x - x, o.z - z) < 12)) continue;
      // face the water: probe toward lower ground
      let best = 0, bh = 1e9; for (let a = 0; a < 6.28; a += 0.4) { const h = heightAt(x + Math.sin(a) * 6, z + Math.cos(a) * 6); if (h < bh) { bh = h; best = a; } }
      addObj('fish', x, z, best, { look: [x + Math.sin(best) * 5, z + Math.cos(best) * 5] });
      addObj('fishWork', x + 0.01, z + 0.01, best, { look: [x + Math.sin(best) * 5, z + Math.cos(best) * 5] });
      made++;
    }
  }
  // ---------- Yut-nori mats, jegi players, swing ----------
  {
    for (const [mx, mz] of [[18, 22], [-14, 15]]) {
      const my = heightAt(mx, mz);
      B.add('cloth', new THREE.BoxGeometry(2.4, 0.04, 2.4), '#c9b07a', mtx(mx, my + 0.02, mz, 0.3));
      for (let k = 0; k < 4; k++) B.add('vc', new THREE.BoxGeometry(0.25, 0.03, 0.05), '#e8dcc0', mtx(mx + rr(-0.3, 0.3), my + 0.06, mz + rr(-0.3, 0.3), rr(0, 3)));
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; addObj('yut', mx + Math.cos(a) * 1.3, mz + Math.sin(a) * 1.3, 0, { look: [mx, mz] }); }
    }
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.7; addObj('play', Math.cos(a) * 9, Math.sin(a) * 9, a); }
    // swing (geune) hanging from a tall frame near the plaza
    const sx0 = -18, sz0 = -10, sy0 = heightAt(sx0, sz0);
    for (const s2 of [-1, 1]) B.add('vc', beamBetween([sx0 + s2 * 1.6, sy0, sz0], [sx0 + s2 * 0.9, sy0 + 6, sz0], 0.12), C.wood);
    B.add('vc', new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6).rotateZ(Math.PI / 2), C.wood, mtx(sx0, sy0 + 6, sz0));
    circles.push({ x: sx0 - 1.5, z: sz0, r: 0.3 }, { x: sx0 + 1.5, z: sz0, r: 0.3 });
    addObj('swing', sx0, sz0 + 0.01, 0, { swingTop: [sx0, sy0 + 6, sz0] });
    spots.swing = [sx0, sz0];
  }
  // ---------- Faction halls (banners) ----------
  const hallAt = { court: [LAYOUT.palace[0] + 13, -146], hwarang: [LAYOUT.training[0] - 8, LAYOUT.training[1] + 14], guild: [12, 50], temple: [LAYOUT.temple[0] - 12, LAYOUT.temple[1] + 6], lotus: [-147, 80], bandits: [LAYOUT.banditCamp[0] + 5, LAYOUT.banditCamp[1] + 5] };
  const FC = { court: ['#c0392b', '王'], hwarang: ['#d9a520', '劍'], guild: ['#3f7d63', '商'], temple: ['#6c8fc2', '卍'], lotus: ['#3a1a4a', '蓮'], bandits: ['#7a1f1f', '賊'] };
  for (const id in hallAt) {
    const [hx, hz] = hallAt[id]; const hy = heightAt(hx, hz);
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = FC[id][0]; g.fillRect(0, 0, 128, 256); g.strokeStyle = '#e8cf8f'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 244);
    g.fillStyle = '#f4ead2'; g.font = 'bold 84px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(FC[id][1], 64, 120);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 5, 6), new THREE.MeshStandardMaterial({ color: '#4a3020' })); pole.position.set(hx, hy + 2.5, hz); pole.castShadow = true; scene.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(hx + 0.55, hy + 3.7, hz); flag.castShadow = true; scene.add(flag);
    circles.push({ x: hx, z: hz, r: 0.3 });
    addObj('hall', hx + 1.4, hz + 1.4, 0, { faction: id });
  }
  spots.halls = hallAt;

  // ---------- Podocheong (police bureau) + jail cage ----------
  {
    const hk = hanok(-100, -14, Math.PI / 2, { w: 11, d: 6.5, style: 'giwa', lanterns: true, lanternColor: '#2e5fa0' });
    const door = hk.door; spots.police = door;
    addObj('policeHall', door[0] + 1.5, door[1] + 2.5, Math.PI / 2);
    for (let k = 0; k < 3; k++) addObj('patrol', door[0] + 2 + k, door[1] - 2, Math.PI / 2);
    // wooden jail cage (okgan)
    const [cx, cz] = hk.world(0, -9); const cy = heightAt(cx, cz);
    B.add('vc', new THREE.BoxGeometry(5, 0.2, 3.4), C.wood, mtx(cx, cy + 0.1, cz, Math.PI / 2));
    B.add('vc', new THREE.BoxGeometry(5.2, 0.2, 3.6), C.wood, mtx(cx, cy + 2.4, cz, Math.PI / 2));
    for (let i = 0; i <= 12; i++) for (const side of [-1, 1]) { const t = -2.5 + i * (5 / 12); B.add('vc', new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), C.wood, mtx(cx + side * 1.7, cy + 1.25, cz + t)); }
    for (let i = 0; i <= 8; i++) for (const side of [-1, 1]) { const t = -1.7 + i * (3.4 / 8); B.add('vc', new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), C.wood, mtx(cx + t, cy + 1.25, cz + side * 2.5)); }
    const jr = roofGeometry({ w: 3.6, d: 5.2, o: 0.6, H: 1.0, lift: 0.2 }); B.add('thatch', jr.geo, '#ffffff', mtx(cx, cy + 2.5, cz, Math.PI / 2));
    spots.jail = [[cx - 0.7, cz - 1.2], [cx + 0.7, cz - 1.2], [cx - 0.7, cz + 1.2], [cx + 0.7, cz + 1.2]];
    obbs.push({ x: cx, z: cz, hw: 1.8, hd: 2.6, rot: 0 });
    // wanted board
    const bx = door[0] + 3, bz = door[1] + 3.5, by = heightAt(bx, bz);
    B.add('vc', new THREE.BoxGeometry(0.1, 2.2, 0.1), C.wood, mtx(bx - 0.7, by + 1.1, bz)); B.add('vc', new THREE.BoxGeometry(0.1, 2.2, 0.1), C.wood, mtx(bx + 0.7, by + 1.1, bz));
    B.add('plaster', new THREE.BoxGeometry(1.6, 1.0, 0.06), '#f0e6cc', mtx(bx, by + 1.5, bz));
    circles.push({ x: bx, z: bz, r: 0.9 });
  }
  // ---------- Stable (마구간) with paddock ----------
  {
    const sx0 = 40, sz0 = 96, sy0 = heightAt(sx0, sz0); spots.stable = [sx0, sz0 + 9];
    for (const [lx, lz] of [[-4, -2], [0, -2], [4, -2], [-4, 2], [0, 2], [4, 2]]) B.add('vc', new THREE.CylinderGeometry(0.14, 0.16, 2.8, 6), C.wood, mtx(sx0 + lx, sy0 + 1.4, sz0 + lz));
    const sr = roofGeometry({ w: 9, d: 4.4, o: 0.8, H: 1.6, lift: 0, ridgeK: 1.3, profile: 'convex', tile: 1.6, fascia: 0.4 });
    B.add('thatch', sr.geo, '#ffffff', mtx(sx0, sy0 + 2.8, sz0));
    B.add('vc', new THREE.BoxGeometry(9, 1.2, 0.12), C.woodLight, mtx(sx0, sy0 + 0.6, sz0 - 2));
    for (let k = 0; k < 3; k++) B.add('thatch', new THREE.BoxGeometry(1.2, 0.5, 0.6), '#ffffff', mtx(sx0 - 3 + k * 3, sy0 + 0.25, sz0 - 1.4));
    obbs.push({ x: sx0, z: sz0 - 1.2, hw: 4.8, hd: 1.2, rot: 0 });
    // paddock fence
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; if (a > 4.3 && a < 4.9) continue; const px = sx0 + Math.cos(a) * 9, pz = sz0 + 10 + Math.sin(a) * 6; B.add('vc', new THREE.CylinderGeometry(0.07, 0.08, 1.3, 5), C.wood, mtx(px, heightAt(px, pz) + 0.65, pz)); const a2 = (i + 1) / 26 * Math.PI * 2; B.add('vc', beamBetween([px, heightAt(px, pz) + 1.05, pz], [sx0 + Math.cos(a2) * 9, heightAt(px, pz) + 1.05, sz0 + 10 + Math.sin(a2) * 6], 0.04, 4), C.wood); }
    addObj('stableHall', sx0 + 1.5, sz0 + 2.8, 0);
  }
  // ---------- Moneylender at the jumak, begging spot at the plaza ----------
  addObj('lender', 33, 6, -Math.PI / 2);
  addObj('beg', -4, 7.5, Math.PI); addObj('beg', 5, -7, 0);


  // ---------- Materials ----------
  const facade = TX.facadeTexture(false), facadeD = TX.facadeTexture(true);
  const danT = TX.dancheongTexture();
  const lanternT = TX.lanternTexture('#ffffff');
  // photographic surfaces (Poly Haven CC0, see public/tex): shared textures, no extra draw calls
  const P = TX.photoTex;
  const tileT = P('rooftile_c'), thatchT = P('thatch_c');
  tileT.repeat.set(0.24, 0.24); thatchT.repeat.set(0.7, 0.7);
  const mats = {
    vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.8 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6b5a3a', roughness: 0.35, metalness: 0.9 }),
    glaze: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    tile: new THREE.MeshStandardMaterial({ vertexColors: true, map: tileT, normalMap: P('rooftile_n', false), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.62, metalness: 0.1, side: THREE.DoubleSide }),
    thatch: new THREE.MeshStandardMaterial({ vertexColors: true, map: thatchT, normalMap: P('thatch_n', false), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1.0, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    plaster: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    dancheong: new THREE.MeshStandardMaterial({ vertexColors: true, map: danT, roughness: 0.7 }),
    facade: new THREE.MeshStandardMaterial({ vertexColors: true, map: facade.map, emissiveMap: facade.emissive, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0, roughness: 0.9 }),
    facadeD: new THREE.MeshStandardMaterial({ vertexColors: true, map: facadeD.map, emissiveMap: facadeD.emissive, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0, roughness: 0.85 }),
    mudwall: new THREE.MeshStandardMaterial({ vertexColors: true, map: facade.map, emissiveMap: facade.emissive, emissive: new THREE.Color('#ffa850'), emissiveIntensity: 0, roughness: 0.95, color: new THREE.Color('#e6d2b0') }),
    lantern: new THREE.MeshStandardMaterial({ vertexColors: true, map: lanternT, emissive: new THREE.Color('#ff9a4a'), emissiveIntensity: 0.2, roughness: 0.8 }),
  };
  // dark grey giwa from a clay barrel-tile photo; golden straw from a weathered thatch photo
  TX.recolorMap(mats.tile, '#55585c', 0.0, 1.3);
  TX.recolorMap(mats.thatch, '#a08850', 0.25, 1.1);
  // world-space detail: wood grain on beams/posts/furniture, dry-stone on plinths and walls, rough plaster
  TX.addTriplanarDetail(mats.vc, { map: P('wood_c'), normalMap: P('wood_n', false), scale: 0.55, strength: 0.55, normalScale: 0.45, grainUp: true, hue: 0.2 });
  TX.addTriplanarDetail(mats.stone, { map: P('stonewall_c'), normalMap: P('stonewall_n', false), scale: 0.6, strength: 0.85, normalScale: 0.8, hue: 0.3, tint: '#a8a397' });
  TX.addTriplanarDetail(mats.plaster, { map: P('plaster_c'), normalMap: P('plaster_n', false), scale: 0.45, strength: 0.45, normalScale: 0.5, hue: 0.0, tint: '#ece6d8' });
  for (const k of ['facade', 'facadeD', 'mudwall']) TX.addTriplanarDetail(mats[k], { map: P('plaster_c'), normalMap: P('plaster_n', false), scale: 0.45, strength: 0.3, normalScale: 0.35, hue: 0.0 });
  for (const k of ['vc', 'tile', 'thatch', 'stone', 'plaster', 'cloth', 'glaze', 'dancheong', 'metal']) addSnow(mats[k], k === 'tile' || k === 'thatch' ? 1.0 : 0.85, 'snow-' + k);
  const staticGroup = B.build(mats);
  scene.add(staticGroup);

  const isBlocked = (x, z, pad = 0) => blockedObb(x, z, pad);
  const reserved = [...plots.map((p) => [p.x, p.z, 11]), [-100, -18, 14], [40, 104, 13], [0, 0, 12], [LAYOUT.training[0], LAYOUT.training[1], 21], [LAYOUT.palace[0], LAYOUT.palace[1], 58], [LAYOUT.temple[0], LAYOUT.temple[1], 24], [LAYOUT.banditCamp[0], LAYOUT.banditCamp[1], 20], [0, 78, 12], [128, 100, 8]];

  return {
    staticGroup, mats, obbs, circles, objects, houses, lanterns, fires, spots, isBlocked, reserved, plots,
    // build a house during play: its own small batch, plus the obstacles it adds
    buildHouse(place, tier, id, dims) {
      const saved = B; B = new Batcher(); const o0 = obbs.length, c0 = circles.length;
      let house;
      try { house = makeHouse(place, tier, id, dims); } finally { const g = B.build(mats); B = saved; scene.add(g); house && (house.group = g); }
      return { house, obbs: obbs.slice(o0), circles: circles.slice(c0) };
    },
    demolish(house) { if (house.group) { scene.remove(house.group); house.group.traverse((m) => m.geometry?.dispose?.()); house.group = null; } else staticB.collapse('house' + house.id); for (const o of house.objs || []) { const i = objects.indexOf(o); if (i >= 0) objects.splice(i, 1); } },
    setNight(n, t) {
      mats.facade.emissiveIntensity = n * 0.9; mats.facadeD.emissiveIntensity = n * 0.9; mats.mudwall.emissiveIntensity = n * 0.75;
      mats.lantern.emissiveIntensity = 0.25 + n * (6 + Math.sin(t * 3) * 0.3);
    },
  };
}
