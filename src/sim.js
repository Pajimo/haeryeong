import * as THREE from 'three';
import { Character, makeAppearance } from './character.js';
import { KINDS } from './buildings.js';
import { NEEDS, JOBS, TRAITS, line, makeName } from './data.js';
import { rand, rr, pick, chance, clamp, lerp, damp, dampAngle, angleDiff, weightedPick } from './noise.js';
import { groundAt, isWater, riverSide, BRIDGE, LAYOUT, heightAt, WATER_LEVEL, bridgeInfo } from './terrain.js';

// ---------- Navigation: spatial hash of obstacles ----------
export class Nav {
  constructor(obbs, circles) {
    NAV = this; GRID.cache.fill(0); this.astar = (...a) => astar(...a); this.lineClear = (...a) => lineClear(...a); this.cellFree = (x, z) => cellFree(toCell(x), toCell(z));
    this.cell = 10; this.grid = new Map();
    const addTo = (minx, minz, maxx, maxz, item) => {
      for (let i = Math.floor(minx / this.cell); i <= Math.floor(maxx / this.cell); i++)
        for (let j = Math.floor(minz / this.cell); j <= Math.floor(maxz / this.cell); j++) {
          const k = i * 10007 + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(item);
        }
    };
    for (const b of obbs) { const r = Math.hypot(b.hw, b.hd); addTo(b.x - r, b.z - r, b.x + r, b.z + r, { t: 'b', ...b, c: Math.cos(-b.rot), s: Math.sin(-b.rot) }); }
    for (const c of circles) addTo(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r, { t: 'c', ...c });
  }
  addObb(b) { GRID.cache.fill(0); const it = { t: 'b', ...b, c: Math.cos(-b.rot), s: Math.sin(-b.rot) }; const r = Math.hypot(b.hw, b.hd); for (let i = Math.floor((b.x - r) / this.cell); i <= Math.floor((b.x + r) / this.cell); i++) for (let j = Math.floor((b.z - r) / this.cell); j <= Math.floor((b.z + r) / this.cell); j++) { const k = i * 10007 + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(it); } return it; }
  addCircle(x, z, r) { GRID.cache.fill(0); const it = { t: 'c', x, z, r }; for (let i = Math.floor((x - r) / this.cell); i <= Math.floor((x + r) / this.cell); i++) for (let j = Math.floor((z - r) / this.cell); j <= Math.floor((z + r) / this.cell); j++) { const k = i * 10007 + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(it); } return it; }
  near(x, z) { return this.grid.get(Math.floor(x / this.cell) * 10007 + Math.floor(z / this.cell)) || []; }
  blocked(x, z, pad = 0.3) {
    for (const o of this.near(x, z)) {
      if (o.t === 'c') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true; }
      else { const dx = x - o.x, dz = z - o.z; const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + pad && Math.abs(lz) < o.hd + pad) return true; }
    }
    return isWater(x, z);
  }
  pushOut(p, pad = 0.3) {
    for (const o of this.near(p.x, p.z)) {
      if (o.t === 'c') {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + pad;
        if (d < m && d > 1e-4) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; }
      } else {
        const dx = p.x - o.x, dz = p.z - o.z; let lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
        const ex = o.hw + pad - Math.abs(lx), ez = o.hd + pad - Math.abs(lz);
        if (ex > 0 && ez > 0) {
          if (ex < ez) lx = Math.sign(lx || 1) * (o.hw + pad); else lz = Math.sign(lz || 1) * (o.hd + pad);
          // back to world (inverse rotation)
          const c = o.c, s = -o.s;
          p.x = o.x + lx * c - lz * s; p.z = o.z + lx * s + lz * c;
        }
      }
    }
  }
}

const PAL = { x0: LAYOUT.palace[0] - 46, x1: LAYOUT.palace[0] + 46, z0: LAYOUT.palace[1] - 38, z1: LAYOUT.palace[1] + 38 };
const inPalace = (x, z) => x > PAL.x0 && x < PAL.x1 && z > PAL.z0 && z < PAL.z1;

// ---------- Grid pathfinding (A*) ----------
// A 1 m grid over the valley, filled lazily from the obstacle hash. Used only when the straight line
// to a waypoint is blocked, so open-field walking stays as cheap as before.
let NAV = null;
const GRID = { cell: 1.0, half: 420 }; GRID.n = Math.ceil((GRID.half * 2) / GRID.cell); GRID.cache = new Uint8Array(GRID.n * GRID.n);
const AS = { g: new Float32Array(GRID.n * GRID.n), stamp: new Uint32Array(GRID.n * GRID.n), from: new Int32Array(GRID.n * GRID.n), closed: new Uint32Array(GRID.n * GRID.n), run: 0 };
const toCell = (v) => Math.floor((v + GRID.half) / GRID.cell);
const cellX = (i) => (i + 0.5) * GRID.cell - GRID.half;
function cellFree(i, j) {
  if (i < 0 || j < 0 || i >= GRID.n || j >= GRID.n) return false;
  const k = j * GRID.n + i; let c = GRID.cache[k];
  if (!c) { c = NAV && NAV.blocked(cellX(i), cellX(j), 0.38) ? 2 : 1; GRID.cache[k] = c; }
  return c === 1;
}
export function lineClear(ax, az, bx, bz, pad = 0.3) {
  if (!NAV) return true;
  const L = Math.hypot(bx - ax, bz - az); const n = Math.ceil(L / 0.6);
  for (let k = 1; k < n; k++) { const t = k / n; if (NAV.blocked(ax + (bx - ax) * t, az + (bz - az) * t, pad)) return false; }
  return true;
}
function nearestFree(i, j, R) {
  if (cellFree(i, j)) return [i, j];
  for (let r = 1; r <= R; r++) for (let di = -r; di <= r; di++) for (const dj of [-r, r]) { if (cellFree(i + di, j + dj)) return [i + di, j + dj]; if (cellFree(i + dj, j + di)) return [i + dj, j + di]; }
  return null;
}
export function astar(fx, fz, tx, tz, maxExpand = 60000) {
  if (!NAV) return null;
  const s = nearestFree(toCell(fx), toCell(fz), 6), t = nearestFree(toCell(tx), toCell(tz), 10);
  if (!s || !t) return null;
  const N = GRID.n, run = ++AS.run; const sk = s[1] * N + s[0], tk = t[1] * N + t[0];
  const heap = [], hf = [];
  const push = (k, f) => { heap.push(k); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const lk = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = lk; hf[0] = lf; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  const h = (i, j) => { const dx = Math.abs(i - t[0]), dy = Math.abs(j - t[1]); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  AS.stamp[sk] = run; AS.g[sk] = 0; AS.from[sk] = -1; push(sk, h(s[0], s[1]));
  let found = false, n = 0;
  while (heap.length && n++ < maxExpand) {
    const k = pop(); if (AS.closed[k] === run) continue; AS.closed[k] = run;
    if (k === tk) { found = true; break; }
    const i = k % N, j = (k / N) | 0, gk = AS.g[k];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj;
      if (!cellFree(ni, nj)) continue;
      if (di && dj && (!cellFree(i + di, j) || !cellFree(i, j + dj))) continue; // no corner cutting
      const nk = nj * N + ni; if (AS.closed[nk] === run) continue;
      const ng = gk + (di && dj ? Math.SQRT2 : 1);
      if (AS.stamp[nk] !== run || ng < AS.g[nk]) { AS.stamp[nk] = run; AS.g[nk] = ng; AS.from[nk] = k; push(nk, ng + h(ni, nj)); }
    }
  }
  if (!found) return null;
  const cells = []; for (let k = tk; k !== -1; k = AS.from[k]) cells.push([cellX(k % N), cellX((k / N) | 0)]);
  cells.reverse();
  // string-pull: keep only the points needed to see the next one
  const out = []; let a = [fx, fz]; let i = 0;
  while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !lineClear(a[0], a[1], cells[j][0], cells[j][1])) j--; out.push(cells[j]); a = cells[j]; i = j; }
  out.push([tx, tz]);
  return out;
}
function refinePath(path, fx, fz, force) {
  const out = []; let px = fx, pz = fz;
  for (const w of path) {
    if (force || !lineClear(px, pz, w[0], w[1])) { const r = astar(px, pz, w[0], w[1]); if (r) out.push(...r); else out.push(w); force = false; }
    else out.push(w);
    px = w[0]; pz = w[1];
  }
  return out;
}

export function planPath(fx, fz, tx, tz, force = false) {
  const fx0 = fx, fz0 = fz;
  const path = [];
  const pin = inPalace(fx, fz), tin = inPalace(tx, tz);
  const gx = LAYOUT.palace[0];
  if (pin && !tin) { path.push([gx, PAL.z1 - 4], [gx, PAL.z1 + 5]); fx = gx; fz = PAL.z1 + 5; }
  const s1 = riverSide(fx, fz), s2 = riverSide(tx, tz);
  if (s2 !== 0 && bridgeInfo(fx, fz).on) {
    // already on the bridge: carry on to whichever end lies on the target's bank
    const a = BRIDGE.a, b = BRIDGE.b; const end = riverSide(a[0], a[1]) === s2 ? a : b, other = end === a ? b : a;
    const dx = end[0] - other[0], dz = end[1] - other[1], L = Math.hypot(dx, dz) || 1;
    path.push([end[0], end[1]], [end[0] + dx / L * 4, end[1] + dz / L * 4]);
  } else if (s1 !== s2 && s1 !== 0 && s2 !== 0) {
    const a = BRIDGE.a, b = BRIDGE.b;
    const da = Math.hypot(fx - a[0], fz - a[1]), db = Math.hypot(fx - b[0], fz - b[1]);
    const [n, f] = da < db ? [a, b] : [b, a];
    const dx = f[0] - n[0], dz = f[1] - n[1], L = Math.hypot(dx, dz);
    path.push([n[0] - dx / L * 4, n[1] - dz / L * 4], [n[0], n[1]], [f[0], f[1]], [f[0] + dx / L * 4, f[1] + dz / L * 4]);
  }
  if (tin && !pin) { path.push([gx, PAL.z1 + 5], [gx, PAL.z1 - 4]); }
  path.push([tx, tz]);
  return refinePath(path, fx0, fz0, force);
}

// ---------- Sim ----------
let SID = 0;
export class Sim {
  constructor(G, o) {
    this.G = G; this.id = o.id ?? SID++; if (this.id >= SID) SID = this.id + 1;
    this.sex = o.sex ?? (chance(0.5) ? 'm' : 'f');
    this.age = o.age ?? (chance(0.15) ? 'elder' : chance(0.35) ? 'young' : 'adult');
    this.job = o.job ?? 'farmer';
    this.name = o.name ?? makeName(this.sex);
    if (o.surname) this.name = { ...this.name, surname: o.surname[0], hangul: o.surname[1] + this.name.hangul.slice(1), full: `${o.surname[0]} ${this.name.given}` };
    this.traits = o.traits ?? [];
    this.faction = o.faction ?? (this.job === 'bandit' ? 'bandit' : 'village');
    this.home = o.home ?? null;
    this.household = !!o.household;
    this.married = !!o.married; this.spouse = null;
    this.coins = o.coins ?? Math.floor(rr(10, 60));
    this.needs = {}; for (const n of NEEDS) this.needs[n.key] = rr(55, 95);
    this.skills = { sword: JOBS[this.job].fighter ? rr(3, 7) : rr(0, 2.5), archery: rr(0, 3), farming: this.job === 'farmer' ? rr(3, 7) : rr(0, 2), charisma: rr(0, 4), fishing: this.job === 'fisher' ? rr(3, 7) : rr(0, 2), scholarship: this.job === 'scholar' ? rr(4, 8) : rr(0, 2) };
    if (this.job === 'general') this.skills.sword = rr(7, 9);
    if (this.job === 'swordsman') this.skills.sword = rr(6, 9.5);
    if (o.skillSword) this.skills.sword = o.skillSword;
    this.maxHp = 100 + (JOBS[this.job].fighter ? 30 : 0) + this.skills.sword * 4; this.hp = this.maxHp;
    this.stamina = 100;
    this.rel = new Map(); this.moodlets = [];
    this.armed = (JOBS[this.job].fighter || o.armed) && this.age !== 'child';
    this.ageDays = o.ageDays ?? { child: rr(0, 2), young: rr(0, 3), adult: rr(0, 5), elder: rr(0, 2) }[this.age];
    this.pregnant = null; this.factions = {}; this.tasks = {}; this.favor = 0;
    this.parents = o.parents || []; this.children = []; this.generation = o.generation || 1; this.pet = null;
    if (this.age === 'child') { for (const k in this.skills) this.skills[k] = Math.min(this.skills[k], 1); }
    this.look = o.look || null; this.uniform = o.uniform || null; this.allies = o.allies || null;
    this.char = new Character(makeAppearance(this));
    this.look = { skin: this.char.o.skin, hair: this.char.o.hair };
    G.scene.add(this.char.root);
    this.pos = new THREE.Vector3(o.x ?? 0, 0, o.z ?? 0); this.pos.y = groundAt(this.pos.x, this.pos.z);
    this.heading = rr(0, 6.28); this.vel = new THREE.Vector3();
    this.action = null; this.queue = [];
    this.thinkT = rr(0, 1); this.path = []; this.stuckT = 0; this.lastPos = this.pos.clone(); this.detourSide = chance(0.5) ? 1 : -1;
    this.dead = false; this.hidden = false; this.controlled = false; this.freeWill = true;
    this.combat = { target: null, cd: rr(0.5, 1.5), atk: null, blocking: false, blockStart: 0, dodgeT: 0, staggerT: 0, hitT: 0, combo: 0, strafe: chance(0.5) ? 1 : -1, nonlethal: false };
    this.workedToday = 0; this.lastDay = 1;
    this.bubbleText = null; this.currentLabel = 'Idle';
    this.hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.9, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.position.y = 0.95; this.hitMesh.userData.sim = this; this.char.root.add(this.hitMesh);
    this.syncTransform();
  }

  get fighter() { return this.age !== 'child' && (!!JOBS[this.job].fighter || this.armed); }
  earn(n) { this.coins += n; if (n > 0) this.G.factions?.notify(this, { type: 'coins', amount: n }); }
  has(t) { return this.traits.includes(t); }
  // A post can outrank a trade: the palace's court ladies, physician and historian are spawned on
  // ordinary jobs but are none of those things, and reading "Bondservant" over a 궁녀 is simply wrong.
  get title() { return this.titleOverride || JOBS[this.job].title; }
  get mood() {
    let s = 0, w = 0;
    for (const n of NEEDS) { const v = this.needs[n.key]; const wt = v < 25 ? 2.2 : 1; s += v * wt; w += wt; }
    let m = s / w - 50; // -50..50
    for (const ml of this.moodlets) m += ml.v;
    return clamp(m, -100, 100);
  }
  get moodLabel() {
    const m = this.mood;
    return m > 40 ? ['Elated', '#7fcf7a'] : m > 20 ? ['Happy', '#a9d27a'] : m > 0 ? ['Content', '#d8d08a'] : m > -20 ? ['Uneasy', '#e0b070'] : m > -40 ? ['Miserable', '#e08060'] : ['Despairing', '#e05050'];
  }
  addMoodlet(id, label, v, dur) {
    const ex = this.moodlets.find((m) => m.id === id);
    if (ex) { ex.t = dur; ex.v = v; return; }
    this.moodlets.push({ id, label, v, t: dur });
  }
  getRel(o) {
    if (!this.rel.has(o.id)) this.rel.set(o.id, { f: 0, r: 0, met: false });
    return this.rel.get(o.id);
  }
  changeRel(o, df, dr = 0) {
    const r = this.getRel(o); r.f = clamp(r.f + df, -100, 100); r.r = clamp(r.r + dr, 0, 100); r.met = true;
    const r2 = o.getRel(this); r2.f = clamp(r2.f + df * (o.has('Loyal') ? 1.1 : 0.9), -100, 100); r2.r = clamp(r2.r + dr, 0, 100); r2.met = true;
  }
  relLabel(o) {
    const r = this.getRel(o);
    if (this.spouse === o) return ['Spouse', '#e88aa8'];
    if (r.r > 45) return ['Sweetheart', '#e88aa8'];
    if (r.f < -60) return ['Nemesis', '#e05050'];
    if (r.f < -25) return ['Rival', '#e08060'];
    if (!r.met) return ['Stranger', '#9a9a9a'];
    if (r.f > 60) return ['Sworn Friend', '#7fcf7a'];
    if (r.f > 30) return ['Friend', '#a9d27a'];
    return ['Acquaintance', '#c8c0a0'];
  }
  isHostile(o) {
    if (o.dead || o === this) return false;
    if (this.faction !== o.faction && !(this.allies?.includes(o.faction)) && !(o.allies?.includes(this.faction))) return true;
    if (this.combat.target === o || o.combat.target === this) return true;
    return false;
  }

  syncTransform() {
    this.char.root.position.copy(this.pos);
    this.char.root.rotation.y = this.heading;
  }

  say(text, kind = 'talk', dur = 3.5) { this.G.bubble(this, text, kind, dur); }

  // ---------- Actions ----------
  cancelAction(silent = false) {
    const a = this.action;
    if (!a) return;
    if (a.type === 'use' && a.phase === 'do' && a.obj && a.t > 0) this.G.factions?.notify(this, { type: 'use', kind: a.obj.kind, minutes: a.t });
    this.G.emit?.('actionEnd', { sim: this, action: a, completed: a.type === 'use' ? a.phase === 'do' && a.t >= (a.dur || 0) * 0.95 : true });
    if (a.obj) a.obj.users.delete(this);
    if (a.partner && a.partner.action && a.partner.action.partner === this && a.type === 'converse') { const p = a.partner; p.action.partner = null; p.endAction(); }
    if (this.hidden) this.setHidden(false);
    this.char.setProp(null);
    this.action = null; this.path = [];
  }
  endAction() { this.cancelAction(); }
  setHidden(h) { this.hidden = h; this.char.root.visible = !h; }
  push(action, front = false) { if (front) this.queue.unshift(action); else this.queue.push(action); }
  // Where a person stands to use an object. Many objects sit inside the collision of the thing they
  // belong to — the tavern counter, the market stalls, a well, a palace cookpot — and walking to their
  // exact point stopped people a few metres short for hours: the tavern, the main place to buy a meal,
  // was unreachable. Use the object's own point when it is walkable, else the nearest walkable spot.
  standOf(o) {
    const nav = this.G.nav;
    if (!nav?.blocked) return [o.x, o.z];
    if (o._stand && !nav.blocked(o._stand[0], o._stand[1], 0.3)) return o._stand;
    if (!nav.blocked(o.x, o.z, 0.3)) return (o._stand = [o.x, o.z]);
    // open ground, not a sliver between two walls that nothing can path into
    const open = (x, z) => { let n = 0; for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4; if (!nav.blocked(x + Math.sin(q) * 0.9, z + Math.cos(q) * 0.9, 0.25)) n++; } return n >= 5; };
    let best = null;
    for (let r = 0.5; r <= 7.01 && !best; r += 0.5) {
      for (let i = 0; i < 16; i++) {
        // try the object's front first, then sweep round
        const ang = (o.face || 0) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
        const x = o.x + Math.sin(ang) * r, z = o.z + Math.cos(ang) * r;
        if (!nav.blocked(x, z, 0.3) && open(x, z)) { best = [x, z]; break; }
      }
    }
    return (o._stand = best || [o.x, o.z]);
  }
  startAction(a) {
    this.cancelAction();
    if (!this.mount && this.horse && !this.horse.dead && !this.horse.rider && !this.controlled && a.type !== 'fight') { const dest = a.dest || (a.obj ? [a.obj.x, a.obj.z] : null); if (dest && !a.toHorse && Math.hypot(dest[0] - this.pos.x, dest[1] - this.pos.z) > 55 && this.horse.pos.distanceTo(this.pos) < 35) { if (this.horse.pos.distanceTo(this.pos) < 3) this.G.animals.mount(this, this.horse); else { const h = this.horse; return this.startAction({ type: 'goto', dest: [h.pos.x, h.pos.z], toHorse: true, label: 'Fetching the horse', then: (s) => { if (!s.mount && h.pos.distanceTo(s.pos) < 4) s.G.animals.mount(s, h); s.startAction(a); } }); } } }
    a.phase = a.phase || 'move'; a.t = 0;
    this.action = a;
    if (a.obj) a.obj.users.add(this);
    const dest = a.dest || (a.obj ? this.standOf(a.obj) : a.target ? [a.target.pos.x, a.target.pos.z] : null);
    if (dest) this.path = planPath(this.pos.x, this.pos.z, dest[0], dest[1]);
    this.currentLabel = a.label || a.type;
  }

  // ---------- Autonomy: Sims-style utility AI ----------
  needWeight(key) { const v = this.needs[key]; return Math.pow((100 - v) / 100, 2) * 4 + 0.04; }
  think() {
    const G = this.G;
    if (this.queue.length) { this.startAction(this.queue.shift()); return; }
    if (this.missionLock) return;
    if (this.controlled || (!this.freeWill && this.household)) return;
    // Safety valve: plugin systems and village events claim decisions before the needs-based choice
    // below, and not all of them check needs — so a quarter of the village could be kept busy while
    // starving. Someone famished or dead on their feet eats or sleeps first (a raid still comes first).
    const urgent = this.needs.hunger < 15 || this.needs.energy < 10;
    if (G.directorAssign && (!urgent || G.director?.active?.kind === 'raid') && G.directorAssign(this)) return;
    if (!urgent && G.simAction(this)) return;
    const cands = [];
    const hour = G.env.hour;
    const night = hour < 5.5 || hour > 21.5;
    const bandit = this.faction === 'bandit';
    for (const o of G.world.objects) {
      const d = o.def;
      if (o.users.size >= d.cap) continue;
      if (d.home && (!this.home || o.house !== this.home.id)) continue;
      if (d.camp && !bandit) continue;
      if (bandit && !d.camp && o.kind !== 'stream') continue;
      if (d.work) continue;
      if (d.cost && this.coins < d.cost) continue;
      if (d.royal && this.job !== 'king') continue;
      if (d.available && !d.available(this, o)) continue;
      if (d.gamble && this.coins < d.gamble) continue;
      if (d.beg && this.coins >= 8) continue;
      if (this.age === 'child' && ['dummy', 'target', 'jumak', 'yut', 'shop', 'campfire', 'tent'].includes(o.kind)) continue;
      if (o.kind === 'swing' && this.age === 'elder') continue;
      const dur = (d.dur[0] + d.dur[1]) / 2;
      let s = 0;
      for (const k in d.adv) if (d.adv[k] > 0) s += d.adv[k] * Math.min(dur, 60) * this.needWeight(k) * 0.01;
      if (s <= 0) continue;
      const k = o.kind;
      if (k === 'dummy' || k === 'target') s *= this.fighter ? 1.4 : 0.35;
      if ((k === 'dummy') && (this.has('Brave') || this.has('Hot-headed') || this.has('Ambitious'))) s *= 1.5;
      if ((k === 'pavilion') && (this.has('Scholarly') || this.has('Romantic') || this.job === 'noble' || this.job === 'scholar')) s *= 1.7;
      if (k === 'shrine' && this.has('Pious')) s *= 1.9;
      if ((k === 'platform' || k === 'jumak') && this.has('Cheerful')) s *= 1.3;
      if (k === 'jumak' && !this.has('Cheerful') && this.job !== 'swordsman') s *= 0.75;
      if (this.has('Lazy') && (k === 'platform' || k === 'bed')) s *= 1.3;
      if (d.cost && this.has('Greedy')) s *= 0.5;
      const sleepy = d.anim === 'sleep';   // bed, tent, tavern lodging, a pavilion floor
      if (sleepy && night) s *= 2.2;
      if (sleepy && !night && this.needs.energy > 35) s *= 0.15;
      // desperate needs outrank distance: someone dead on their feet goes to bed rather than washing at
      // the nearest well, and someone famished walks to a meal rather than chatting on the way
      const desperate = (sleepy && this.needs.energy < 15) || ((d.adv.hunger || 0) > 0.5 && this.needs.hunger < 15);
      if (desperate) s *= 2.5;
      const dist = Math.hypot(o.x - this.pos.x, o.z - this.pos.z);
      s /= 1 + dist / (desperate ? 200 : 70);
      cands.push({ s, a: { type: 'use', obj: o, label: d.label } });
    }
    // work
    const jw = JOBS[this.job].work;
    const shift = this.job === 'child' ? hour > 8.5 && hour < 14 : this.job === 'king' ? hour > 8.5 && hour < 13 : this.job === 'innkeeper' ? hour > 9 && hour < 22 : this.job === 'soldier' ? (this.id % 2 ? hour > 6 && hour < 18 : hour > 14 || hour < 2) : hour > 7.5 && hour < 17.5;
    if (G.env.day !== this.lastDay) { this.lastDay = G.env.day; this.workedToday = 0; }
    if (jw && shift && this.workedToday < 360) {
      const objs = G.world.objects.filter((o) => o.def.work === jw && o.users.size < o.def.cap);
      if (objs.length) {
        const o = objs.reduce((a, b) => (Math.hypot(a.x - this.pos.x, a.z - this.pos.z) * (0.5 + rand()) < Math.hypot(b.x - this.pos.x, b.z - this.pos.z) * (0.5 + rand()) ? a : b));
        let s = 2.2 * (this.has('Ambitious') ? 1.4 : 1) * (this.has('Lazy') ? 0.6 : 1);
        const low = Math.min(...Object.values(this.needs));
        if (low < 20) s *= 0.25;
        cands.push({ s, a: { type: 'use', obj: o, label: o.def.label, work: true } });
      }
    }
    // social
    if (!night || bandit) {
      const near = G.sims.filter((o) => o !== this && !o.dead && !o.hidden && o.faction === this.faction && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 40 && (!o.action || o.action.type !== 'fight'));
      for (const o of near.slice(0, 8)) {
        const r = this.getRel(o);
        let s = this.needWeight('social') * 0.9 * (1 + r.f / 120) * (this.has('Cheerful') ? 1.3 : 1);
        if (r.f < -30 && (this.has('Hot-headed') || this.has('Cunning'))) s = this.needWeight('social') * 0.6 + 0.15;
        if (r.r > 30) s *= 1.4;
        s /= 1 + Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) / 30;
        cands.push({ s, a: { type: 'social', target: o, label: `Chat with ${o.name.given}` } });
      }
    }
    // wander
    cands.push({ s: 0.08 + (this.has('Lazy') ? 0 : 0.05), a: { type: 'wander', label: 'Strolling' } });
    if (night && this.home && !bandit) cands.push({ s: 0.25, a: { type: 'use', obj: this.home.objs.find((o) => o.kind === 'bed'), label: 'Head home' } });
    cands.sort((a, b) => b.s - a.s);
    const top = cands.slice(0, 3);
    const choice = weightedPick(top, (c) => c.s * c.s);
    this.startAction(choice.a);
  }

  // ---------- Movement ----------
  moveAlong(dt, speed, arrive = 0.5) {
    if (!this.path.length) return true;
    const [tx, tz] = this.path[0];
    const dx = tx - this.pos.x, dz = tz - this.pos.z; const d = Math.hypot(dx, dz);
    const last = this.path.length === 1;
    if (d < (last ? arrive : 1.2)) { this.path.shift(); return this.path.length === 0; }
    let dirx = dx / d, dirz = dz / d;
    const nav = this.G.nav;
    // probe for obstacles, rotate desired direction to find a free heading
    const la = Math.min(2.2, Math.max(0.5, d - 0.6));
    if (nav.blocked(this.pos.x + dirx * la, this.pos.z + dirz * la, 0.35)) {
      let found = false;
      for (let i = 1; i <= 9 && !found; i++) {
        for (const sgn of [this.detourSide, -this.detourSide]) {
          const a = sgn * i * 0.3; const c = Math.cos(a), s = Math.sin(a);
          const nx = dirx * c - dirz * s, nz = dirx * s + dirz * c;
          if (!nav.blocked(this.pos.x + nx * la, this.pos.z + nz * la, 0.35)) { dirx = nx; dirz = nz; found = true; this.detourSide = sgn; break; }
        }
      }
    }
    // separation
    let sx = 0, sz = 0;
    for (const o of this.G.simsNear(this.pos.x, this.pos.z)) {
      if (o === this || o.hidden || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z; const od = Math.hypot(ox, oz);
      if (od < 0.9 && od > 1e-3) { sx += ox / od * (0.9 - od) * 2; sz += oz / od * (0.9 - od) * 2; }
    }
    if (this.mount) { speed *= speed > 3 ? 2.6 : 2.1; this.curSpeed = speed; }
    const vx = dirx * speed + sx, vz = dirz * speed + sz;
    const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
    if (!isWater(nx, nz) || isWater(this.pos.x, this.pos.z)) { this.pos.x = nx; this.pos.z = nz; }
    nav.pushOut(this.pos, 0.3);
    this.heading = dampAngle(this.heading, Math.atan2(dirx, dirz), 10, dt);
    this.moving = true;
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 2.0) {
      // stuck = barely moved in 2 s, or pacing back and forth (little net progress over ~8 s)
      const moved = this.pos.distanceTo(this.lastPos);
      this._hist = this._hist || []; this._hist.push([this.pos.x, this.pos.z]); if (this._hist.length > 4) this._hist.shift();
      const pacing = this._hist.length === 4 && Math.hypot(this._hist[0][0] - this.pos.x, this._hist[0][1] - this.pos.z) < 2.5 && speed > 1;
      if (moved < 0.8 || pacing) {
        this.stuckCount = (this.stuckCount || 0) + 1; this._hist = [];
        const goal = this.path[this.path.length - 1];
        if (nav.blocked(this.pos.x, this.pos.z, 0.05)) { const f = nearestFree(toCell(this.pos.x), toCell(this.pos.z), 6); if (f) { this.pos.x = cellX(f[0]); this.pos.z = cellX(f[1]); } }
        if (goal && this.stuckCount <= 3) this.path = planPath(this.pos.x, this.pos.z, goal[0], goal[1], true);
        else if (goal && this.stuckCount <= 5) { this.detourSide *= -1; const a = this.heading + Math.PI / 2 * this.detourSide; this.path.unshift([this.pos.x + Math.sin(a) * 4, this.pos.z + Math.cos(a) * 4]); }
        else { this.stuckCount = 0; this.path = []; return true; }
      } else this.stuckCount = 0;
      this.stuckT = 0; this.lastPos.copy(this.pos);
    }
    return false;
  }

  faceTowards(x, z, dt, k = 8) { this.heading = dampAngle(this.heading, Math.atan2(x - this.pos.x, z - this.pos.z), k, dt); }

  // ---------- Per-frame update ----------
  update(dt, gm) {
    // quarantine: a non-finite position must never survive a frame, or it spreads to anyone who
    // chases, follows or fights this sim. Put them back where they last stood.
    const P = this.pos;
    if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) {
      const b = this._safe || this.home?.door || [0, 0];
      P.set(b[0], Number.isFinite(b[2]) ? b[2] : 0, b[1]);
      if (this.combat?.target && !Number.isFinite(this.combat.target.pos.x)) this.endFight?.();
      if (!this._nanWarned) { this._nanWarned = true; console.warn('[sim] non-finite position repaired', this.name?.full, this.action?.type, this.action?.label); }
    } else (this._safe ||= [0, 0, 0], this._safe[0] = P.x, this._safe[1] = P.z, this._safe[2] = P.y);
    // watchdog: some event locked this person for itself and then left them with nothing to do (or never
    // let go). Three idle game hours under a lock and the lock is released, whoever took it.
    if (this.missionLock && !this.action && !this.hidden && !this.away && !this.jailed && !this.controlled && !this.dead) {
      this._lockIdle = (this._lockIdle || 0) + gm;
      if (this._lockIdle > 180) { this.missionLock = false; this._lockIdle = 0; this.G._lockLeaks = (this.G._lockLeaks || 0) + 1; }
    } else this._lockIdle = 0;
    if (this.dead) { this.deadT = (this.deadT || 0) + gm; this.char.setAnim('dead', 5); this.char.update(dt, 0); this.syncTransform(); return; }
    // needs
    const decay = { hunger: 0.095, energy: 0.065, social: 0.075, fun: 0.08, hygiene: 0.045, honor: 0.025 };
    if (this.G.env.season === 'winter') { decay.hunger *= 1.15; decay.energy *= 1.12; } else if (this.G.env.season === 'summer') decay.hygiene *= 1.25;
    if (this.has('Lazy')) decay.energy *= 1.25;
    if (this.perkNeverWeary) decay.energy *= 0.75; if (this.has('Cheerful')) decay.fun *= 0.8; if (this.has('Ambitious')) decay.honor *= 1.6;
    for (const k in decay) this.needs[k] = clamp(this.needs[k] - decay[k] * gm, 0, 100);
    for (const m of this.moodlets) m.t -= gm;
    this.moodlets = this.moodlets.filter((m) => m.t > 0);
    this.stamina = clamp(this.stamina + dt * (this.combat.blocking ? 4 : 16), 0, 100);
    if (!this.combat.target) this.hp = Math.min(this.maxHp, this.hp + gm * 0.4);
    if (!this.controlled) this.moving = false;

    const c = this.combat;
    c.staggerT -= dt; c.hitT -= dt; c.dodgeT -= dt; c.cd -= dt;
    if (c.atk) this.updateAttack(dt);
    if (c.dodgeT > 0 && this.dodgeVec) {
      const k = c.dodgeT / 0.45;
      const nx = this.pos.x + this.dodgeVec[0] * dt * k, nz = this.pos.z + this.dodgeVec[1] * dt * k;
      if (!this.G.nav.blocked(nx, nz, 0.3)) { this.pos.x = nx; this.pos.z = nz; }
      this.char.setAnim('dodge', 22);
    }

    if (this.controlled) {
      // input handled externally (player.js) — still animate
    } else {
      this.thinkT -= dt;
      if (!this.action && this.thinkT <= 0) { this.thinkT = rr(0.3, 0.9); this.think(); }
      if (this.action) this.runAction(dt, gm);
    }
    // life cycle: aging, pregnancy
    this.ageDays += gm / 1440 * (this.G.ageSpeed ?? 1);
    const AG = { child: 3, young: 5, adult: 7 };
    if (AG[this.age] !== undefined && this.ageDays > AG[this.age] && !this.combat.target && !this.hidden && (!this.action || this.action.type !== 'fight')) this.G.ageUp(this);
    else if (this.age === 'elder' && this.ageDays > 4 && Math.random() < gm / (1440 * 3)) this.G.oldAgeDeath(this);
    if (this.pregnant) {
      this.pregnant.t += gm; const k = Math.min(1, this.pregnant.t / 2880);
      this.char.setBumpSize(k);
      if (this.pregnant.t > 2880 && !this.combat.target) this.G.giveBirth(this);
    }
    // ground & transform
    const gy = groundAt(this.pos.x, this.pos.z);
    this.pos.y = this.action && this.action.seatY && this.action.phase === 'do' ? this.action.seatY - (this.char.anim === 'sit' || this.char.anim === 'eat' ? 0 : 0) : gy;
    this.pos.y = Math.max(this.pos.y, WATER_LEVEL - 0.9);
    if (this.mount) this.pos.y = groundAt(this.pos.x, this.pos.z) + 1.36;
    this.updateGaze(dt);
    this.char.update(dt, this.moving ? this.curSpeed || 1.4 : 0);
    this.syncTransform();
  }

  // where the eyes go: conversation partners, opponents, people speaking nearby, and the player passing by
  updateGaze(dt) {
    const c = this.char;
    c.moodPose = clamp(this.mood / 40, -1, 1);
    if (c.lod === 2) { c.lookAt = null; return; }
    this.gazeT = (this.gazeT || 0) - dt;
    if (this.gazeT > 0 && (!this.gazeOn || !this.gazeOn.dead)) { if (this.gazeOn) c.lookAt = this.gazeOn.pos; return; }
    this.gazeT = 0.8 + Math.random() * 2.2;
    const a = this.action; let t = null;
    if (this.combat.target) t = this.combat.target;
    else if (a && (a.type === 'social' || a.type === 'converse')) t = a.target || a.partner || a.with || null;
    if (!t && !this.controlled) {
      let best = null, bs = 0;
      for (const o of this.G.sims) {
        if (o === this || o.dead || o.hidden) continue;
        const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z; const d2 = dx * dx + dz * dz; if (d2 > 64) continue;
        // must be roughly in front
        const rel = Math.atan2(dx, dz) - this.heading; const fa = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))); if (fa > 1.9) continue;
        let sc = 1 / (1 + d2 * 0.08);
        if (o.controlled || o === this.G.selected) sc *= 3.5;
        if (this.G.ui?.bubbles?.has?.(o) || o._sayT > 0) sc *= 2;  // the bubble map is on the UI
        if (this.getRel(o).r > 30) sc *= 2.5;
        sc *= 0.5 + Math.random();
        if (sc > bs) { bs = sc; best = o; }
      }
      if (best && Math.random() < 0.7) t = best;
    }
    this.gazeOn = t; c.lookAt = t ? t.pos : null;
  }

  runAction(dt, gm) {
    const a = this.action; const G = this.G;
    a.t += gm;
    if (a.type === 'use') {
      const o = a.obj; if (!o) return this.endAction();
      if (a.phase === 'move') {
        // An unreachable seat (inside a wall, across water) used to be walked at forever — guests spent
        // nine hours at the banquet door, starving. Give up once an hour passes without getting closer.
        const sp = this.standOf(o), dd = Math.hypot(this.pos.x - sp[0], this.pos.z - sp[1]);
        if (a._best == null || dd < a._best - 1.5) { a._best = dd; a._bestT = a.t; }
        else if (a.t - a._bestT > 60 && !a.forced) { if (this.char.propName === 'lantern') this.char.setProp(null); return this.endAction(); }
        const run = a.run || a.work && this.late;
        if (this.G.env.isNight && !this.char.propMesh && this.id % 3 === 0 && this.age !== 'child' && !this.mount) this.char.setProp('lantern');
        this.curSpeed = run ? 4.2 : 1.45 * (this.age === 'elder' ? 0.8 : 1);
        this.char.setAnim(run ? 'run' : 'walk');
        if (a.t > 600) return this.endAction();
        if (this.moveAlong(dt, this.curSpeed, 0.45)) {
          if (this.mount) this.G.animals.dismount(this);
          a.phase = 'do'; a.t = 0; a.dur = rr(o.def.dur[0], o.def.dur[1]);
          if (o.seat) { this.pos.x = o.seat[0]; this.pos.z = o.seat[1]; a.seatY = o.seatY; }
          if (o.def.hidden) this.setHidden(true);
          if (o.kind === 'rough') this.addMoodlet('rough', 'Slept rough, without a roof', -6, 720);
          const anim = o.def.anim;
          if (anim === 'eat') this.char.setProp(o.kind === 'jumak' && chance(0.5) ? 'cup' : 'bowl');
          if (anim === 'study') this.char.setProp('book');
          if (anim === 'farm') this.char.setProp('hoe');
          if (anim === 'archery') this.char.setProp('bow');
          if (o.prop || o.def.prop) this.char.setProp(o.prop || o.def.prop);
          if (anim === 'fish') this.char.setProp('rod');
          if (anim === 'yut') this.char.setProp('yut');
          if (anim === 'jegi') this.char.setProp('jegi');
          if (anim === 'swing') this.char.setProp('ropes');
          if ((anim === 'train') && this.char.sword) this.char.draw();
          if (o.def.cost) { this.coins -= o.def.cost; }
          this.currentLabel = o.def.label;
        }
      } else {
        const d = o.def;
        let anim = d.anim; if (anim === 'eat' && this.char.propMesh && o.kind === 'jumak' && a.t > a.dur * 0.6) anim = 'drink';
        if (anim === 'talk' && o.kind === 'shop') anim = chance(0.002) ? 'laugh' : 'talk';
        if (o.kind === 'patrol') {
          if (!a.wp || Math.hypot(a.wp[0] - this.pos.x, a.wp[1] - this.pos.z) < 2) { const ang = rr(0, 6.28), r = rr(10, 70); a.wp = [Math.cos(ang) * r, Math.sin(ang) * r + 10]; if (this.G.nav.blocked(a.wp[0], a.wp[1], 0.5)) a.wp = null; else this.path = planPath(this.pos.x, this.pos.z, a.wp[0], a.wp[1]); }
          if (a.wp) { this.curSpeed = 1.3; this.char.setAnim('walk'); this.moveAlong(dt, 1.3, 1.5); }
          if (d.work) { this.earn(JOBS[this.job].pay * gm / 60); this.workedToday += gm; }
          if (a.t > a.dur) this.endAction();
          return;
        }
        this.char.setAnim(anim === 'farm' ? 'farm' : anim);
        if (o.look) this.faceTowards(o.look[0], o.look[1], dt); else if (o._stand && (o._stand[0] !== o.x || o._stand[1] !== o.z) && !o.seat) this.faceTowards(o.x, o.z, dt); else if (o.seat && d.anim === 'sit') this.heading = dampAngle(this.heading, o.face + Math.PI, 6, dt); else if (o.face !== undefined) this.heading = dampAngle(this.heading, o.face, 6, dt);
        for (const k in d.adv) this.needs[k] = clamp(this.needs[k] + d.adv[k] * gm, 0, 100);
        if (d.work) { this.earn(JOBS[this.job].pay * (1 + (this.rankBonus || 0) + (this.stall && o.kind === 'stallWork' ? 1 : 0)) * gm / 60); this.workedToday += gm; }
        if (o.swingTop) { const th = Math.sin(a.t * 2.2 * 60 / 60) * 0.75; const L = 4.3; this.pos.x = o.swingTop[0]; this.pos.z = o.swingTop[2] + Math.sin(th) * L; a.seatY = o.swingTop[1] - Math.cos(th) * L; this.heading = 0; }
        if (d.skill) this.skills[d.skill] = Math.min(10, this.skills[d.skill] + gm * 0.0025);
        const pos = Object.keys(d.adv).filter((k) => d.adv[k] > 0);
        const full = !d.work && pos.length && pos.every((k) => this.needs[k] > 97);
        if (a.t > a.dur || full) {
          if (d.catch && !a.paid) { a.paid = true; const fish = Math.random() < 0.25 + (this.skills.fishing || 0) * 0.06; if (fish) { const n = Math.ceil(rr(2, 6) * (1 + (this.skills.fishing || 0) * 0.15)); this.earn(n); this.needs.hunger = Math.min(100, this.needs.hunger + 10); this.say(pick(['A fat carp!', 'Caught a mandarin fish!', 'Ha! Dinner tonight.']), 'happy'); } else this.say('…Nothing bites today.', 'talk'); }
          if (d.beg && !a.paid) { a.paid = true; const n = Math.random() < 0.6 ? Math.ceil(rr(1, 6)) : 0; if (n) { this.earn(n); this.say(`(receives ${n} nyang)`, 'talk'); } else this.say('…No one spares a coin.', 'sad'); }
          if (d.gamble && !a.paid) { a.paid = true; const win = Math.random() < 0.45 + this.skills.charisma * 0.01; if (win) { this.earn(d.gamble); this.say(pick(['Mo! 모!', 'Yut! 윷!', 'Ha! Pay up!']), 'happy'); } else { this.coins = Math.max(0, this.coins - d.gamble); this.say(pick(['Do… 도.', 'Aigoo, my coins!', 'Back-do?!']), 'sad'); } }
          if (anim === 'train' && this.char.swordDrawn) this.char.sheathe();
          if (d.hidden && G.env.isNight && this.needs.energy < 95 && !full) return; // keep sleeping until morning
          this.endAction();
        }
      }
    } else if (a.type === 'wander') {
      if (!a.dest) { const ang = rr(0, 6.28), r = rr(6, 25); a.dest = [this.pos.x + Math.cos(ang) * r, this.pos.z + Math.sin(ang) * r]; if (this.G.nav.blocked(a.dest[0], a.dest[1], 0.5)) return this.endAction(); this.path = planPath(this.pos.x, this.pos.z, a.dest[0], a.dest[1]); }
      this.curSpeed = 1.2; this.char.setAnim('walk');
      if (this.moveAlong(dt, 1.2, 0.8) || a.t > 120) { this.endAction(); this.char.setAnim('idle'); this.thinkT = rr(1, 4); }
    } else if (a.type === 'goto') {
      this.curSpeed = a.run ? 4.2 : 1.5; this.char.setAnim(a.run ? 'run' : 'walk');
      if (this.moveAlong(dt, this.curSpeed, 0.6) || a.t > 400) { this.endAction(); this.char.setAnim('idle'); if (a.then) a.then(this); }
    } else if (a.type === 'event') {
      // director-driven: go to spot, perform anim for duration
      if (a.phase === 'move') {
        this.curSpeed = a.run ? 4.0 : 1.5; this.char.setAnim(a.run ? 'run' : 'walk');
        if (this.moveAlong(dt, this.curSpeed, 1.0) || a.t > 300) { a.phase = 'do'; a.t = 0; if (a.prop) this.char.setProp(a.prop); }
      } else {
        this.char.setAnim(typeof a.anim === 'function' ? a.anim(this) : a.anim || 'idle');
        if (a.look) this.faceTowards(a.look[0], a.look[1], dt, 4);
        if (a.adv) for (const k in a.adv) this.needs[k] = clamp(this.needs[k] + a.adv[k] * gm, 0, 100);
        if (a.t > (a.dur || 60) || (a.until && a.until())) { this.endAction(); if (a.then) a.then(this); }
      }
    } else if (a.type === 'social') this.runSocial(dt, gm, a);
    else if (a.type === 'converse') this.runConverse(dt, gm, a);
    else if (a.type === 'fight') this.runFight(dt, gm, a);
    else if (a.type === 'flee') {
      this.curSpeed = 4.3; this.char.setAnim('flee');
      if (a.t < 1 && chance(0.02)) this.say(line('flee'), 'shout');
      if (this.moveAlong(dt, this.curSpeed, 1.0)) {
        if (this.home) { this.setHidden(true); a.type = 'hide'; a.t = 0; } else this.endAction();
      }
    } else if (a.type === 'hide') {
      if (a.t > 90 && !this.G.raidActive) this.endAction();
    } else if (a.type === 'jailed') {
      this.char.setAnim('kneel');
    } else if (a.type === 'yield') {
      this.char.setAnim('kneel'); if (a.t > 20) this.endAction();
    } else if (a.type === 'interact') {
      // player-ordered specific social interaction with target
      this.runSocial(dt, gm, a);
    }
  }

  // ---------- Social ----------
  runSocial(dt, gm, a) {
    const o = a.target;
    if (!o || o.dead || o.hidden) return this.endAction();
    a.dest = [o.pos.x, o.pos.z];
    const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
    if (d > 1.9) {
      if (!this.path.length || a.repath <= 0) { this.path = planPath(this.pos.x, this.pos.z, o.pos.x, o.pos.z); a.repath = 2; }
      a.repath = (a.repath ?? 2) - dt;
      this.curSpeed = 1.6; this.char.setAnim('walk');
      this.moveAlong(dt, 1.6, 1.6);
      if (a.t > 240) this.endAction();
      return;
    }
    // arrive — try to engage
    const busy = o.controlled || (o.action && ['fight', 'converse', 'flee', 'hide', 'yield'].includes(o.action.type)) || (o.action && o.action.work && chance(0.6) && !a.forced);
    if (busy && !a.forced) { this.say(o.controlled ? '…' : 'Ah, you seem busy.', 'talk', 2); this.changeRel(o, -0.5); return this.endAction(); }
    if (o.controlled && !a.forced) return this.endAction();
    const dur = rr(20, 40);
    const me = { type: 'converse', partner: o, phase: 'do', t: 0, dur, turn: 0, next: 0, lead: true, label: `Talking with ${o.name.given}`, kind: a.kind };
    this.cancelAction(); this.action = me; this.currentLabel = me.label;
    if (!o.controlled) { o.cancelAction(); o.action = { type: 'converse', partner: this, phase: 'do', t: 0, dur, lead: false, label: `Talking with ${this.name.given}` }; o.currentLabel = o.action.label; }
  }

  runConverse(dt, gm, a) {
    const o = a.partner;
    if (!o || o.dead || o.hidden) return this.endAction();
    this.faceTowards(o.pos.x, o.pos.z, dt);
    const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
    if (d < 1.1) { const ang = Math.atan2(this.pos.x - o.pos.x, this.pos.z - o.pos.z); this.pos.x += Math.sin(ang) * dt * 0.8; this.pos.z += Math.cos(ang) * dt * 0.8; this.moving = true; this.curSpeed = 0.6; }
    if (!this.char.anim.match(/talk|laugh|angry|flirt|bow|cheer|sad|idle/)) this.char.setAnim('idle');
    if (!a.lead) { if (this.char.animT > 3 && this.char.anim !== 'idle') this.char.setAnim('idle'); return; }
    this.needs.social = clamp(this.needs.social + 0.9 * gm, 0, 100); o.needs.social = clamp(o.needs.social + 0.9 * gm, 0, 100);
    a.next -= gm;
    if (a.next <= 0) {
      a.next = rr(4, 7);
      const speaker = a.turn % 2 === 0 ? this : o, listener = speaker === this ? o : this;
      this.G.socialExchange(speaker, listener, a, a.turn === 0 && a.kind ? a.kind : null);
      a.turn++;
    }
    if (a.t > a.dur && !a.hold) {
      this.endAction(); if (o.action && o.action.partner === this) o.endAction();
    }
  }

  // ---------- Combat ----------
  startFight(target, nonlethal = false) {
    // A sim told to fight himself (a soldier answering a fight he started; a rebel picked from his own
    // band) closed to distance zero, divided by it, and turned his position into NaN — and every
    // fighter who then chased him caught it. That is where the NaN geometry warnings came from.
    if (!target || target === this || this.dead || target.dead) return;
    this.cancelAction();
    this.action = { type: 'fight', target, t: 0, phase: 'do', label: nonlethal ? `Dueling ${target.name.given}` : `Fighting ${target.name.given}` };
    this.combat.target = target; this.combat.nonlethal = nonlethal; this.currentLabel = this.action.label;
    if (this.char.sword && !this.char.swordDrawn) this.char.draw();
  }
  endFight() { this.combat.target = null; this.combat.blocking = false; if (this.char.swordDrawn) this.char.sheathe(); }

  runFight(dt, gm, a) {
    const c = this.combat; const t = c.target;
    if (!t || t.dead || (c.nonlethal && (t.action?.type === 'yield' || this.action?.type === 'yield'))) {
      this.endFight(); this.endAction(); return;
    }
    if (t.hidden) { this.endFight(); this.endAction(); return; }
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z; const d = Math.hypot(dx, dz);
    if (d > (c.nonlethal ? 150 : 60)) { this.endFight(); this.endAction(); return; }
    // flee if badly hurt (non-brave, lethal fight)
    if (!c.nonlethal && this.faction === 'bandit' && this.hp < this.maxHp * 0.2 && chance(0.01)) { this.endFight(); this.startAction({ type: 'goto', dest: LAYOUT.banditCamp, run: true, label: 'Fleeing to the woods' }); return; }
    if (!c.nonlethal && !this.missionHero && ((this.household && this.hp < this.maxHp * 0.3 && chance(0.05)) || (this.hp < this.maxHp * 0.22 && !this.has('Brave') && this.faction !== 'bandit' && chance(0.01)))) {
      this.endFight(); const h = this.home?.door || [0, 0];
      this.startAction({ type: 'flee', dest: h, label: 'Fleeing!' }); return;
    }
    if (c.staggerT > 0 || c.hitT > 0) { this.char.setAnim(c.staggerT > 0 ? 'stagger' : 'hit'); return; }
    if (c.atk) return; // attack in progress
    this.faceTowards(t.pos.x, t.pos.z, dt, 10);
    const skill = this.skills.sword;
    // defensive reaction to incoming attack
    const inc = t.combat.atk && t.combat.atk.stage === 'wind' && d < 3.2;
    if (inc && !c.blocking && c.dodgeT <= 0 && !c.reacted) {
      c.reacted = true;
      const r = rand();
      if (r < 0.25 + skill * 0.055) { c.blocking = true; c.blockStart = performance.now(); c.blockHold = rr(0.4, 0.8); }
      else if (r < 0.32 + skill * 0.065) this.dodge(-1);
    }
    if (!inc) c.reacted = false;
    if (c.blocking) {
      this.char.setAnim('block', 20); c.blockHold -= dt;
      if (c.blockHold <= 0) c.blocking = false;
      return;
    }
    if (c.dodgeT > 0) { this.char.setAnim('dodge'); return; }
    // approach / strafe / attack
    const ideal = 1.9;
    if (d > 2.5) {
      this.path = [[t.pos.x, t.pos.z]];
      this.curSpeed = d > 7 ? 4.4 : 2.2; this.char.setAnim(d > 7 ? 'run' : 'walk');
      if (d <= 7 && !this.char.swordDrawn && this.char.sword) this.char.draw();
      this.moveAlong(dt, this.curSpeed, 2.0);
      if (d < 7) this.char.setAnim('stance', 12), this.moving = true;
    } else {
      // strafe
      const ang = Math.atan2(dx, dz) + Math.PI / 2 * c.strafe;
      const sp = 0.9;
      const nx = this.pos.x + Math.sin(ang) * sp * dt + (d < ideal - 0.4 ? -dx / d * dt : 0), nz = this.pos.z + Math.cos(ang) * sp * dt + (d < ideal - 0.4 ? -dz / d * dt : 0);
      if (!this.G.nav.blocked(nx, nz, 0.3)) { this.pos.x = nx; this.pos.z = nz; }
      if (chance(0.006)) c.strafe *= -1;
      this.char.setAnim('stance', 12);
      let busy = 0;
      if (c.cd <= 0) for (const o of this.G.simsNear(t.pos.x, t.pos.z)) if (o !== this && o.combat.target === t && o.combat.atk) busy++;
      const tokens = (t.controlled || t.missionHero || t.household) ? 1 : 2;
      if (c.cd <= 0 && busy >= tokens) { c.cd = rr(0.3, 0.8); }
      if (c.cd <= 0) {
        const aggressive = this.has('Hot-headed') ? 1.4 : 1;
        if (chance(0.06 * aggressive + skill * 0.004)) {
          this.attack(chance(0.18) ? 'heavy' : 'light');
        }
      }
    }
  }

  dodge(dir = -1) {
    const c = this.combat; if (c.dodgeT > 0 || this.stamina < 20) return false;
    c.dodgeT = 0.45; this.stamina -= 20;
    const back = this.heading + (dir < 0 ? Math.PI : 0) + rr(-0.6, 0.6);
    this.dodgeVec = [Math.sin(back) * 7, Math.cos(back) * 7];
    this.char.setAnim('dodge', 22);
    return true;
  }

  attack(kind = 'light') {
    const c = this.combat;
    if (c.atk || c.staggerT > 0 || c.hitT > 0 || this.stamina < 10) return false;
    if (this.char.sword && !this.char.swordDrawn) this.char.draw();
    c.blocking = false;
    const heavy = kind === 'heavy';
    c.combo = heavy ? 0 : (c.comboT > 0 ? (c.combo + 1) % 3 : 0);
    c.atk = { kind, stage: 'wind', t: 0, wind: heavy ? 0.55 : 0.26 + rand() * 0.06, strike: heavy ? 0.16 : 0.12, recover: heavy ? 0.45 : 0.3, hit: false, idx: c.combo };
    this.stamina -= heavy ? 22 : 12;
    this.char.atkStage = 'wind';
    this.char.setAnim(heavy ? 'heavy' : 'atk' + c.combo, 16);
    this.char.animT = 0;
    // readable tell: a glint (red for heavies — dodge, don't block) when someone swings at the player
    if (!this.controlled && c.target?.controlled) {
      const tip = new THREE.Vector3(this.pos.x + Math.sin(this.heading) * 0.35, this.pos.y + 1.75, this.pos.z + Math.cos(this.heading) * 0.35);
      this.G.fx?.glint?.(tip, heavy); this.G.audio?.tell?.(this.pos, heavy);
    }
    return true;
  }

  updateAttack(dt) {
    const c = this.combat; const at = c.atk;
    at.t += dt;
    if (at.stage === 'wind' && at.t > at.wind) {
      at.stage = 'strike'; at.t = 0; this.char.atkStage = 'strike';
      this.G.audio?.swing(this.pos, at.kind === 'heavy');
      this.G.fx?.startTrail(this);
      // lunge
      const L = at.kind === 'heavy' ? 0.9 : 0.5;
      const nx = this.pos.x + Math.sin(this.heading) * L, nz = this.pos.z + Math.cos(this.heading) * L;
      if (!this.G.nav.blocked(nx, nz, 0.3)) { this.pos.x = nx; this.pos.z = nz; }
    } else if (at.stage === 'strike') {
      if (!at.hit && at.t > at.strike * 0.4) { at.hit = true; this.G.resolveHit(this, at); }
      if (at.t > at.strike) { at.stage = 'recover'; at.t = 0; this.char.atkStage = 'recover'; }
    } else if (at.stage === 'recover' && at.t > at.recover) {
      c.atk = null; c.comboT = 0.5; this.char.atkStage = null;
      c.cd = this.controlled ? 0 : rr(0.35, 1.3) - this.skills.sword * 0.05;
      this.G.fx?.endTrail(this);
    }
    if (c.comboT > 0) c.comboT -= dt;
  }

  die(killer) {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.cancelAction(); this.endFight();
    this.char.setAnim('dead', 5); this.char.setProp(null);
    this.G.onDeath(this, killer);
  }

  dispose() { this.G.scene.remove(this.char.root); this.char.dispose?.(); }
  rebuildModel() {
    const vis = this.char.root.visible; const hm = this.hitMesh; hm.parent?.remove(hm);
    const drawn = this.char.swordDrawn;
    this.G.scene.remove(this.char.root); this.char.dispose?.();
    this.char = new Character(makeAppearance(this));
    this.char.root.add(hm); this.G.scene.add(this.char.root); this.char.root.visible = vis;
    if (drawn) this.char.draw();
    if (this.pregnant) { this.char.setPregnant(true); this.char.setBumpSize(Math.min(1, this.pregnant.t / 2880)); }
    this.G.ui?.portraits.cache.delete(this.id);
    this.syncTransform();
  }
}
