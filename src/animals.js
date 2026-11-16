import * as THREE from 'three';
import { buildSDF, surfaceNets, smin } from './charbody.js';
import { ANIMALS } from './data.js';
import { rr, pick, chance, clamp, dampAngle, fbm } from './noise.js';
import { heightAt, groundAt, isWater, LAYOUT, WATER_LEVEL, riverDist } from './terrain.js';
import { instanceAnimal, attachTack, updateReins } from './animalmodels.js';

const PET_NAMES = { dog: ['Baekgu', 'Nureongi', 'Bokshil', 'Jindol', 'Hodu', 'Dubu', 'Bami'], cat: ['Nabi', 'Yaong', 'Kkami', 'Mimi', 'Durumi'] };

// ---------- Mesh generation ----------
const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
furMat.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float rimA = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
    totalEmissiveRadiance += diffuseColor.rgb * rimA * 0.3;`);
};
const _geoCache = new Map();

function colorize(g, fn) {
  const p = g.attributes.position; const c = new Float32Array(p.count * 3); const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Species definitions: trunk prims (body/tail), head prims (relative to neck pivot), legs, colours
function spec(type, variant = 0) {
  const C = (h) => new THREE.Color(h);
  const E = (c, r, k = 0.02, tag) => ({ type: 'ell', c, r, k, tag });
  const K = (a, b, r1, r2, k = 0.02, tag) => ({ type: 'cone', a, b, r1, r2, k, tag });
  switch (type) {
    case 'dog': case 'cat': {
      const cat = type === 'cat'; const s = cat ? 0.62 : 1;
      const base = cat ? C(['#d98a3a', '#2a2420', '#e8e2d6', '#8a7a6a'][variant % 4]) : C(['#f2ede2', '#d9a066', '#e8dcc6', '#2a2420'][variant % 4]);
      const sc = (v) => v.map((x) => x * s);
      return {
        legH: 0.36 * s, legR: 0.03 * s, legs: [[0.075 * s, 0.17 * s], [-0.075 * s, 0.17 * s], [0.075 * s, -0.17 * s], [-0.075 * s, -0.17 * s]],
        trunk: [E(sc([0, 0.46, 0]), sc([0.11, 0.12, 0.25])), E(sc([0, 0.49, 0.14]), sc([0.12, 0.14, 0.13]), 0.06),
          ...(cat ? [K(sc([0, 0.5, -0.22]), sc([0, 0.62, -0.34]), 0.022 * s, 0.02 * s, 0.03), K(sc([0, 0.62, -0.34]), sc([0, 0.86, -0.36]), 0.02 * s, 0.018 * s, 0.02)]
            : [K(sc([0, 0.52, -0.22]), sc([0, 0.66, -0.28]), 0.04, 0.035, 0.03), E(sc([0, 0.68, -0.2]), sc([0.045, 0.05, 0.075]), 0.03)])],
        neck: sc([0, 0.56, 0.24]),
        head: [E(sc([0, 0.08, 0.05]), sc([0.08, 0.075, 0.085])), K(sc([0, 0.06, 0.1]), sc([0, 0.045, cat ? 0.15 : 0.2]), (cat ? 0.035 : 0.045) * s, (cat ? 0.028 : 0.03) * s, 0.025),
          E(sc([0, 0.052, cat ? 0.155 : 0.205]), sc([0.017, 0.014, 0.012]), 0.005, 'nose'),
          K(sc([0.048, 0.12, 0.03]), sc([0.06, cat ? 0.19 : 0.215, 0.02]), 0.032 * s, 0.004, 0.012), K(sc([-0.048, 0.12, 0.03]), sc([-0.06, cat ? 0.19 : 0.215, 0.02]), 0.032 * s, 0.004, 0.012),
          E(sc([0.035, 0.1, 0.115]), sc([0.012, 0.012, 0.008]), 0.002, 'eye'), E(sc([-0.035, 0.1, 0.115]), sc([0.012, 0.012, 0.008]), 0.002, 'eye')],
        color: (x, y, z, tag, out) => {
          out.copy(base);
          if (tag === 'nose' || tag === 'eye') return out.set('#120c0a');
          if (!cat && variant === 1 && y < 0.42 * s) out.lerp(C('#f2ede2'), 0.6);
          if (cat && variant === 0) { if (Math.sin(z * 90 + Math.sin(y * 40) * 2) > 0.5) out.multiplyScalar(0.7); }
          if (cat && variant === 1 && y < 0.4 * s) out.set('#f2ede2');
        },
        size: s, legColor: base,
      };
    }
    case 'deer': case 'fox': case 'boar': case 'tiger': case 'ox': {
      const P = {
        deer: { s: 1, len: 0.38, r: [0.15, 0.17], legH: 0.58, legR: 0.025, head: 0.085, snout: 0.1, base: '#9a7a55', belly: '#d8c8a8', ears: 'long', tail: 'short' },
        fox: { s: 0.62, len: 0.3, r: [0.1, 0.11], legH: 0.34, legR: 0.025, head: 0.08, snout: 0.13, base: '#c8602a', belly: '#f2ece0', ears: 'pointy', tail: 'bushy' },
        boar: { s: 1, len: 0.45, r: [0.22, 0.26], legH: 0.3, legR: 0.05, head: 0.13, snout: 0.16, base: '#4a3a2c', belly: '#3a2e24', ears: 'small', tail: 'short', tusks: true },
        tiger: { s: 1.15, len: 0.62, r: [0.2, 0.22], legH: 0.55, legR: 0.07, head: 0.15, snout: 0.09, base: '#d9802a', belly: '#f2ece0', ears: 'round', tail: 'long', stripes: true },
        ox: { s: 1.2, len: 0.62, r: [0.3, 0.33], legH: 0.6, legR: 0.07, head: 0.15, snout: 0.15, base: '#8a5a32', belly: '#7a4e2a', ears: 'small', tail: 'long', horns: true },
      }[type];
      const s = P.s; const y0 = P.legH + P.r[1] * 0.6;
      const trunk = [E([0, y0, 0], [P.r[0], P.r[1], P.len]), E([0, y0 + 0.02, P.len * 0.55], [P.r[0] * 1.08, P.r[1] * 1.1, P.len * 0.45], 0.08)];
      if (P.tail === 'bushy') trunk.push(K([0, y0, -P.len], [0, y0 - 0.1, -P.len - 0.35], 0.05, 0.07, 0.04, 'tail'), E([0, y0 - 0.12, -P.len - 0.38], [0.06, 0.06, 0.08], 0.03, 'tip'));
      if (P.tail === 'long') trunk.push(K([0, y0 + 0.05, -P.len], [0, y0 - 0.25, -P.len - 0.45], 0.035, 0.03, 0.03, 'tail'));
      if (P.tail === 'short') trunk.push(E([0, y0 + 0.05, -P.len - 0.02], [0.04, 0.05, 0.04], 0.03, 'tail'));
      const nk = [0, y0 + P.r[1] * 0.5, P.len * 0.9];
      const H = P.head;
      const head = [E([0, 0.06, 0.06], [H * 0.9, H * 0.85, H]), K([0, 0.04, 0.08], [0, 0.0, 0.08 + P.snout + H * 0.5], H * 0.55, H * 0.4, 0.04),
        E([0.6 * H, 0.08, 0.1 + H * 0.3], [0.012, 0.012, 0.01], 0.002, 'eye'), E([-0.6 * H, 0.08, 0.1 + H * 0.3], [0.012, 0.012, 0.01], 0.002, 'eye'),
        E([0, 0.0, 0.08 + P.snout + H * 0.55], [H * 0.3, H * 0.25, 0.02], 0.01, 'nose')];
      for (const sx of [-1, 1]) {
        if (P.ears === 'long') head.push(K([sx * H * 0.6, H * 0.8, 0.02], [sx * H * 1.4, H * 1.5, -0.02], 0.035, 0.01, 0.01));
        if (P.ears === 'pointy') head.push(K([sx * H * 0.55, H * 0.75, 0.04], [sx * H * 0.8, H * 1.6, 0.03], 0.03, 0.004, 0.01));
        if (P.ears === 'round') head.push(E([sx * H * 0.7, H * 0.85, 0.0], [0.04, 0.04, 0.02], 0.015));
        if (P.ears === 'small') head.push(E([sx * H * 0.9, H * 0.6, -0.02], [0.05, 0.03, 0.02], 0.015));
        if (P.horns) head.push(K([sx * H * 0.7, H * 0.7, 0.02], [sx * H * 1.8, H * 1.4, 0.1], 0.03, 0.012, 0.01, 'horn'));
        if (P.tusks) head.push(K([sx * H * 0.35, -0.02, 0.08 + P.snout], [sx * H * 0.5, 0.07, 0.08 + P.snout + 0.04], 0.012, 0.004, 0.005, 'horn'));
      }
      const L = P.len * 0.62;
      return {
        legH: P.legH, legR: P.legR, legs: [[P.r[0] * 0.6, L], [-P.r[0] * 0.6, L], [P.r[0] * 0.6, -L], [-P.r[0] * 0.6, -L]],
        trunk, neck: nk, head, scale: s, legColor: new THREE.Color(type === 'deer' ? '#8a6a48' : P.base),
        color: (x, y, z, tag, out) => {
          out.set(P.base);
          if (y < y0 - P.r[1] * 0.4 && !tag) out.lerp(new THREE.Color(P.belly), 0.8);
          if (tag === 'eye') return out.set('#0a0808');
          if (tag === 'nose') return out.set(type === 'ox' ? '#5a3a2a' : '#1a1210');
          if (tag === 'horn') return out.set('#e8dcc0');
          if (tag === 'tip') return out.set('#f6f2ea');
          if (P.stripes && !tag) { const n = Math.sin(z * 26 + Math.sin(y * 9) * 2.2 + fbm(x * 4, z * 4, 2) * 3); if (n > 0.55 && y > y0 - P.r[1] * 0.5) out.set('#1a1410'); }
          if (P.stripes && tag === 'tail') { if (Math.sin(y * 30) > 0.4) out.set('#1a1410'); }
          if (type === 'deer' && tag === 'tail') out.set('#f2ece0');
        },
      };
    }
    case 'horse': {
      const v = variant % 6;
      const base = C(['#7a4a2a', '#5a3a22', '#a8a49c', '#2a2420', '#e8e4dc', '#8a6a4a'][v]);
      const mane = v === 4 ? C('#d8d0c4') : v === 2 ? C('#5a5650') : C('#1a1410');
      const legs = [[0.15, 0.44], [-0.15, 0.44], [0.15, -0.46], [-0.15, -0.46]];
      return {
        legH: 0.84, legR: 0.062, legs,
        trunk: [E([0, 1.06, 0], [0.25, 0.29, 0.62]), E([0, 1.1, 0.36], [0.27, 0.31, 0.33], 0.1), E([0, 1.11, -0.4], [0.28, 0.3, 0.31], 0.1),
          K([0, 1.2, -0.66], [0, 0.72, -0.82], 0.055, 0.085, 0.04, 'mane'), E([0, 1.3, -0.62], [0.06, 0.05, 0.06], 0.04, 'mane')],
        neck: [0, 1.2, 0.52],
        head: [K([0, 0, 0], [0, 0.42, 0.26], 0.18, 0.1, 0.06), K([0, 0.42, 0.26], [0, 0.27, 0.58], 0.085, 0.058, 0.05), E([0, 0.37, 0.34], [0.07, 0.09, 0.12], 0.04),
          K([0, 0.1, -0.07], [0, 0.53, 0.2], 0.035, 0.028, 0.02, 'mane'), E([0, 0.56, 0.26], [0.035, 0.03, 0.05], 0.015, 'mane'),
          K([0.045, 0.5, 0.24], [0.055, 0.63, 0.22], 0.022, 0.004, 0.01), K([-0.045, 0.5, 0.24], [-0.055, 0.63, 0.22], 0.022, 0.004, 0.01),
          E([0.068, 0.42, 0.36], [0.013, 0.015, 0.011], 0.002, 'eye'), E([-0.068, 0.42, 0.36], [0.013, 0.015, 0.011], 0.002, 'eye'),
          E([0.025, 0.26, 0.6], [0.012, 0.014, 0.01], 0.004, 'nose'), E([-0.025, 0.26, 0.6], [0.012, 0.014, 0.01], 0.004, 'nose')],
        color: (x, y, z, tag, out) => {
          out.copy(base);
          if (tag === 'mane') out.copy(mane);
          if (tag === 'eye') out.set('#080606');
          if (tag === 'nose') out.set('#1a1210');
          if (v === 0 && !tag && z > 0.5 && y > 1.45) out.set('#f2ece0');
        },
        legColor: v === 4 ? C('#d8d2c8') : base.clone().multiplyScalar(0.75),
      };
    }
    case 'rabbit': return {
      legH: 0.07, legR: 0.025, legs: [[0.05, 0.07], [-0.05, 0.07], [0.06, -0.08], [-0.06, -0.08]],
      trunk: [E([0, 0.16, -0.02], [0.08, 0.09, 0.12]), E([0, 0.15, -0.14], [0.035, 0.035, 0.03], 0.02, 'tip')], neck: [0, 0.2, 0.08],
      head: [E([0, 0.03, 0.03], [0.05, 0.05, 0.06]), K([0.02, 0.06, 0.0], [0.03, 0.18, -0.03], 0.018, 0.012, 0.01), K([-0.02, 0.06, 0.0], [-0.03, 0.18, -0.03], 0.018, 0.012, 0.01),
        E([0.033, 0.045, 0.06], [0.008, 0.008, 0.006], 0.002, 'eye'), E([-0.033, 0.045, 0.06], [0.008, 0.008, 0.006], 0.002, 'eye')],
      color: (x, y, z, tag, out) => { out.set('#a08a6a'); if (tag === 'eye') out.set('#0a0808'); if (tag === 'tip') out.set('#f6f2ea'); },
    };
    case 'crane': case 'magpie': case 'chicken': {
      const P = {
        crane: { body: [0.12, 0.13, 0.24], y: 0.85, legH: 0.72, neck: 0.42, base: '#f4f2ec', tailC: '#1a1a1a', neckC: '#1a1a1a', crown: '#d82a2a' },
        magpie: { body: [0.05, 0.05, 0.1], y: 0.14, legH: 0.08, neck: 0.05, base: '#141618', tailC: '#1a2a3a', neckC: '#141618', belly: '#f4f2ec' },
        chicken: { body: [0.1, 0.11, 0.13], y: 0.28, legH: 0.16, neck: 0.1, base: ['#c8702a', '#f2ece0', '#3a2a20'][variant % 3], tailC: '#2a1a14', neckC: null, crown: '#d82a2a' },
      }[type];
      const b = P.body; const trunk = [E([0, P.y, 0], b), K([0, P.y + 0.02, -b[2] * 0.7], [0, P.y + (type === 'chicken' ? 0.12 : 0.0), -b[2] * (type === 'magpie' ? 2.8 : 1.5)], b[0] * 0.5, b[0] * 0.15, 0.02, 'tail')];
      const nb = [0, P.y + b[1] * 0.5, b[2] * 0.7];
      const head = [K([0, 0, 0], [0, P.neck, 0.03], b[0] * 0.3, b[0] * 0.25, 0.02, 'neck'), E([0, P.neck + 0.02, 0.04], [b[0] * 0.4, b[0] * 0.38, b[0] * 0.45], 0.02),
        K([0, P.neck + 0.02, 0.04 + b[0] * 0.4], [0, P.neck - 0.005, 0.04 + b[0] * (type === 'crane' ? 1.7 : 0.9)], b[0] * 0.12, 0.004, 0.005, 'beak'),
        E([b[0] * 0.25, P.neck + 0.035, 0.06], [0.008, 0.008, 0.006].map((v) => v * (type === 'crane' ? 1 : 0.6)), 0.002, 'eye'), E([-b[0] * 0.25, P.neck + 0.035, 0.06], [0.008, 0.008, 0.006].map((v) => v * (type === 'crane' ? 1 : 0.6)), 0.002, 'eye')];
      if (P.crown) head.push(E([0, P.neck + 0.02 + b[0] * 0.38, 0.04], [b[0] * 0.12, b[0] * 0.15, b[0] * 0.25], 0.01, 'crown'));
      return {
        legH: P.legH, legR: type === 'crane' ? 0.008 : 0.012, legs: [[0.04 * (b[0] / 0.1), 0.0], [-0.04 * (b[0] / 0.1), 0.0]], trunk, neck: nb, head, bird: true, wing: b,
        color: (x, y, z, tag, out) => {
          out.set(P.base);
          if (tag === 'tail') out.set(P.tailC);
          if (tag === 'neck' && P.neckC) out.set(P.neckC);
          if (tag === 'beak') out.set(type === 'crane' ? '#6a6a50' : '#e8b030');
          if (tag === 'eye') out.set('#0a0808');
          if (tag === 'crown') out.set(P.crown);
          if (P.belly && !tag && y < P.y) out.set(P.belly);
        },
      };
    }
  }
}

function meshPart(prims, colorFn, key, step) {
  if (_geoCache.has(key)) return _geoCache.get(key);
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  for (const p of prims) {
    const pts = p.type === 'ell' ? [[p.c[0] - p.r[0], p.c[1] - p.r[1], p.c[2] - p.r[2]], [p.c[0] + p.r[0], p.c[1] + p.r[1], p.c[2] + p.r[2]]] : [p.a.map((v) => v - Math.max(p.r1, p.r2)), p.b.map((v) => v + Math.max(p.r1, p.r2)), p.a.map((v) => v + Math.max(p.r1, p.r2)), p.b.map((v) => v - Math.max(p.r1, p.r2))];
    for (const q of pts) { minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]); minZ = Math.min(minZ, q[2]); maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]); maxZ = Math.max(maxZ, q[2]); }
  }
  const pad = step * 3;
  const g = surfaceNets(buildSDF(prims), [minX - pad, minY - pad, minZ - pad], [maxX + pad, maxY + pad, maxZ + pad], step);
  // tag lookup: nearest prim
  const sdfs = prims.map((p) => buildSDF([{ ...p, k: 0 }]));
  colorize(g, (x, y, z, out) => {
    let best = 0, bd = 1e9; for (let i = 0; i < prims.length; i++) { const d = sdfs[i](x, y, z); if (d < bd) { bd = d; best = i; } }
    colorFn(x, y, z, prims[best].tag, out);
  });
  _geoCache.set(key, g);
  return g;
}

// ---------- Animal ----------
class Animal {
  constructor(A, type, x, z, o = {}) {
    this.A = A; this.G = A.G; this.type = type; this.def = ANIMALS[type];
    this.variant = o.variant ?? Math.floor(Math.random() * 4);
    this.home = o.home || [x, z]; this.range = o.range ?? 30;
    this.pos = new THREE.Vector3(x, groundAt(x, z), z); this.heading = rr(0, 6.28);
    this.maxHp = this.def.hp || 30; this.hp = this.maxHp; this.dead = false; this.hidden = false;
    this.state = 'idle'; this.t = rr(1, 5); this.target = null; this.phase = rr(0, 6); this.speed = 0;
    this.combat = { atk: null, target: null, dodgeT: 0, blocking: false };
    this.owner = null; this.petName = o.petName || null; this.happiness = 80; this.fly = 0;
    this.id = o.id ?? A.nextId++;
    this.build();
  }
  get name() { const n = this.petName || this.def.name; return { full: n, given: n, hangul: this.def.ko }; }
  get title() { return this.def.name; }

  build() {
    let inst = null;
    try { inst = instanceAnimal(this.type, this.variant); } catch (e) { console.warn('[animals] model instance failed, using sculpted body', e); }
    if (inst) return this.buildModel(inst);
    const S = spec(this.type, this.variant);
    const step = this.type === 'tiger' || this.type === 'ox' || this.type === 'boar' ? 0.022 : this.type === 'deer' || this.type === 'crane' ? 0.016 : 0.009;
    const k = this.type + '|' + (['dog', 'cat', 'chicken'].includes(this.type) ? this.variant % 4 : 0);
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const trunk = new THREE.Mesh(meshPart(S.trunk, S.color, k + '|t', step), furMat); trunk.castShadow = true; this.body.add(trunk);
    this.neck = new THREE.Group(); this.neck.position.set(...S.neck); this.body.add(this.neck);
    const head = new THREE.Mesh(meshPart(S.head, S.color, k + '|h', step * 0.7), furMat); head.castShadow = true; this.neck.add(head);
    this.legs = [];
    const legCol = S.legColor ? S.legColor.clone() : new THREE.Color('#a08a6a');
    const legMat = S.bird ? new THREE.MeshStandardMaterial({ color: this.type === 'crane' ? '#2a2a24' : '#d9a030', roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: legCol, roughness: 0.85 });
    for (const [lx, lz] of S.legs) {
      const g = new THREE.Group(); g.position.set(lx, S.legH + (S.bird ? 0.0 : 0.04), lz);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(S.legR, S.legH * 0.9, 3, 8).translate(0, -S.legH / 2, 0), legMat); leg.castShadow = true;
      g.add(leg); this.body.add(g); this.legs.push(g);
    }
    if (S.bird) {
      const wingG = new THREE.SphereGeometry(1, 10, 6).scale(S.wing[0] * 0.25, S.wing[1] * 0.6, S.wing[2] * 0.95);
      const wc = this.type === 'crane' ? '#f4f2ec' : this.type === 'magpie' ? '#1a2a3a' : '#a85a2a';
      this.wings = [-1, 1].map((sx) => { const w = new THREE.Group(); w.position.set(sx * S.wing[0] * 0.9, S.legH + S.wing[1] * 1.0 + (this.type === 'crane' ? 0.1 : 0.05), 0); const m = new THREE.Mesh(wingG, new THREE.MeshStandardMaterial({ color: wc, roughness: 0.8 })); m.position.x = sx * S.wing[0] * 0.3; m.castShadow = true; w.add(m); this.body.add(w); return w; });
    }
    this.spec = S;
    const sc = this.def.puppy ? 0.6 : 1;
    this.root.scale.setScalar(sc);
    this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1).translate(0, 0.4, 0), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.animal = this; this.root.add(this.hitMesh);
    this.G.scene.add(this.root);
  }

  // animated GLB body (see animalmodels.js). this.body stays an (empty) group whose y follows the spine, for the rider's bob.
  buildModel(inst) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.model = inst; this.root.add(inst.obj);
    this.neck = inst.bones.Head || this.body; this.legs = [];
    this.spec = { legH: inst.size.y * 0.5 };
    this.bobBone = inst.bones.Torso2 || inst.bones.Torso || inst.bones.Body || null;
    inst.obj.updateMatrixWorld(true);
    this.bobRest = this.bobBone ? this.bobBone.matrixWorld.elements[13] : 0;
    inst.actions = {}; this.curAction = null; this.attackT = 0; this.mixAcc = 0;
    this.root.scale.setScalar(this.def.puppy ? 0.6 : 1);
    const sz = inst.size;
    this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.4, sz.x * 1.2), Math.max(0.4, sz.y * 0.9), Math.max(0.5, sz.z * 0.85)).translate(0, Math.max(0.2, sz.y * 0.45), 0), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitMesh.userData.animal = this; this.root.add(this.hitMesh);
    this.G.scene.add(this.root);
    this.playAnim('idle');
  }

  playAnim(role, ts = 1, once = false, fade = 0.25) {
    const m = this.model; const clip = m.roles[role] || m.roles.idle; if (!clip) return;
    let a = m.actions[clip.name];
    if (!a) { a = m.actions[clip.name] = m.mixer.clipAction(clip); }
    a.timeScale = ts;
    if (this.curAction === a) return;
    a.reset(); a.enabled = true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (!once) a.time = (this.id * 0.37 % 1) * clip.duration;
    a.play();
    if (this.curAction) this.curAction.crossFadeTo(a, fade, false);
    this.curAction = a;
  }

  animateModel(dt) {
    const moving = this.speed > 0.05; const L = this.model.size.z;
    if (this.lunge > 0) { this.lunge = 0; this.attackT = Math.min(0.9, (this.model.roles.attack?.duration || 0.8) * 0.9); }
    if (this.attackT > 0) { this.attackT -= dt; this.playAnim('attack', 1.2, true, 0.12); }
    else if (moving) {
      const runAt = this.type === 'horse' ? 7 : this.def.speed * 0.6;
      if (this.speed > runAt) this.playAnim('run', clamp(this.speed / (L * 3.2), 0.7, 1.6));
      else this.playAnim('walk', clamp(this.speed / (L * 0.6), 0.5, 2.4), false, 0.2);
    } else if (this.state === 'graze' || this.state2 === 'lie') this.playAnim('graze', 1, false, 0.5);
    else this.playAnim(this.id % 3 === 0 ? 'idle2' : 'idle', 1, false, 0.4);
    // throttle distant mixers: tick every third frame with the accumulated time
    this.mixAcc += dt;
    if (!this.rider && (this.camD || 0) > 45 && ((this.A.frame + this.id) % 3)) return;
    this.model.mixer.update(this.mixAcc); this.mixAcc = 0;
    if (this.tackParts?.reins && this.root.visible && (this.rider || (this.camD || 0) < 40)) updateReins(this.model, this.tackParts);
    if (this.bobBone) {
      const y = (this.bobBone.matrixWorld.elements[13] - this.root.matrixWorld.elements[13]) / (this.root.scale.y || 1);
      this.body.position.y = clamp(y - this.bobRest, -0.2, 0.25);
    }
  }

  setTack(on) {
    if (this.model) {
      if (on && !this.tackParts) { this.tackParts = attachTack(this.model); this.tack = this.tackParts?.saddle || null; this.bridle = this.tackParts?.bridle || null; }
      if (!on && this.tackParts) { const t = this.tackParts; t.saddle.removeFromParent(); t.bridle.removeFromParent(); t.reins.forEach((r) => r.removeFromParent()); this.tackParts = null; this.tack = null; this.bridle = null; }
      return;
    }
    if (!on && this.tack) { this.tack.removeFromParent(); for (const p of this.tackExtra || []) p.removeFromParent(); this.tack = null; this.bridle = null; this.tackExtra = null; return; }
    if (on && !this.tack) {
      const g = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: '#8e2a22', roughness: 0.8 }); const lea = new THREE.MeshStandardMaterial({ color: '#4a2a1a', roughness: 0.55 }); const gold = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.8, roughness: 0.35 });
      const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.62, 16, 1, true, -Math.PI * 0.62, Math.PI * 1.24).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2e4f8a', roughness: 0.85, side: THREE.DoubleSide }));
      blanket.rotation.y = Math.PI / 2; blanket.rotation.z = Math.PI / 2; blanket.position.set(0, 1.08, 0.02);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.46), lea); saddle.position.set(0, 1.37, 0.02);
      const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.06), red); pommel.position.set(0, 1.44, 0.24);
      const cantle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), red); cantle.position.set(0, 1.45, -0.2);
      g.add(saddle, pommel, cantle);
      for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.42, 0.03), lea); st.position.set(sx * 0.26, 1.14, 0.05); const ir = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), gold); ir.position.set(sx * 0.27, 0.92, 0.05); ir.rotation.y = Math.PI / 2; g.add(st, ir); }
      const bridle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.01, 4, 16), lea); bridle.position.set(0, 0.38, 0.38); bridle.rotation.y = Math.PI / 2; this.neck.add(bridle);
      this.tackExtra = [bridle];
      for (let i = 0; i < 3; i++) { const tas = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), red); tas.position.set(0, 0.25 - i * 0.05, 0.3); this.neck.add(tas); this.tackExtra.push(tas); }
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.body.add(g); this.tack = g; this.bridle = bridle;
    }
  }

  nearestHuman(r) {
    let best = null, bd = r;
    for (const s of this.G.simsNear(this.pos.x, this.pos.z)) { if (s.dead || s.hidden) continue; const d = s.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = s; } }
    if (!best && r > 12) for (const s of this.G.sims) { if (s.dead || s.hidden) continue; const d = s.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  moveToward(x, z, sp, dt) {
    const dx = x - this.pos.x, dz = z - this.pos.z; const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    let hx = dx / d, hz = dz / d;
    const nx = this.pos.x + hx * sp * dt, nz = this.pos.z + hz * sp * dt;
    if (isWater(nx, nz) && !this.fly) { this.t = 0; return true; }
    if (!this.fly && this.G.nav.blocked(nx, nz, 0.3)) { this.heading += 0.8; this.pos.x += Math.sin(this.heading) * sp * dt; this.pos.z += Math.cos(this.heading) * sp * dt; this.G.nav.pushOut(this.pos, 0.3); }
    else { this.pos.x = nx; this.pos.z = nz; }
    this.heading = dampAngle(this.heading, Math.atan2(hx, hz), 8, dt);
    this.speed = sp;
    return d < sp * dt + 0.3;
  }

  update(dt, gm, camPos) {
    if (this.rider) {
      const r = this.rider;
      if (r.dead || !r.mount) { this.rider = null; } else {
        this.pos.x = r.pos.x; this.pos.z = r.pos.z; this.heading = r.heading;
        this.speed = r.moving ? (r.curSpeed || 3) : 0;
        this.pos.y = groundAt(this.pos.x, this.pos.z);
        this.root.visible = !r.hidden; this.camD = camPos.distanceTo(this.pos);
        this.animate(dt);
        r.char.rideBob = this.body.position.y * 0.8;
        this.root.position.copy(this.pos); this.root.rotation.y = this.heading;
        return;
      }
    }
    if (this.called && this.owner) {
      const o = this.owner; const d = o.pos.distanceTo(this.pos);
      if (d > 2.5) { this.camD = camPos.distanceTo(this.pos); this.moveToward(o.pos.x + 1.6, o.pos.z, this.def.speed * 2.6, dt); this.root.position.copy(this.pos); this.root.rotation.y = this.heading; this.pos.y = groundAt(this.pos.x, this.pos.z); this.animate(dt); return; }
      this.called = false; this.home = [this.pos.x, this.pos.z]; this.range = 4; this.state = 'graze';
    }
    if (this.dead && this.model) {
      this.deadT = (this.deadT || 0) + gm; this.root.position.copy(this.pos);
      if (!this.deathPlayed) { this.deathPlayed = true; this.attackT = 0; this.playAnim('death', 1, true, 0.15); }
      if (this.root.visible && this.deadT < 30) this.model.mixer.update(dt);
      return;
    }
    if (this.dead) { this.deadT = (this.deadT || 0) + gm; this.body.rotation.z = Math.min(Math.PI / 2, this.body.rotation.z + dt * 4); this.root.position.copy(this.pos); return; }
    this.camD = camPos.distanceTo(this.pos);
    const far = this.camD > 110;
    this.root.visible = !far && !this.hidden;
    this.speed = 0; this.t -= gm;
    const D = this.def; const G = this.G;
    // perception
    if (D.flee && this.state !== 'flee') { const h = this.nearestHuman(D.bird ? 7 : 11); if (h && !(this.owner)) { this.state = 'flee'; this.target = h; this.t = rr(8, 15); if (D.bird) this.fly = 1; } }
    if (D.hostile && this.state !== 'attack' && this.state !== 'flee') {
      const r = this.type === 'tiger' ? (G.env.isNight ? 26 : 14) : 7;
      const h = this.nearestHuman(r);
      if (h && chance(D.hostile * 0.02)) { this.state = 'attack'; this.target = h; this.t = 60; if (this.type === 'tiger') { G.log(`A tiger roars in the ${h.pos.length() > 200 ? 'mountains' : 'valley'}! It stalks ${h.name.full}!`, 'danger', h.pos); G.audio?.alarm(); } }
    }
    if (this.hp < this.maxHp && D.hostile && this.state !== 'attack' && this.lastHitBy && !this.lastHitBy.dead) { this.state = 'attack'; this.target = this.lastHitBy; this.t = 60; }
    if (this.hp < this.maxHp * 0.3 && !D.hostile && this.state !== 'flee') { this.state = 'flee'; this.target = this.lastHitBy; this.t = 15; }

    switch (this.state) {
      case 'idle': case 'graze':
        if (this.owner && this.type !== 'horse') { this.state = 'follow'; break; }
        if (this.t <= 0) {
          if (chance(0.55)) { const a = rr(0, 6.28), r = rr(3, this.range); this.dest = [this.home[0] + Math.cos(a) * r, this.home[1] + Math.sin(a) * r]; this.state = 'wander'; this.t = 60; }
          else { this.state = chance(0.5) ? 'graze' : 'idle'; this.t = rr(4, 20); }
        }
        break;
      case 'wander':
        if (this.moveToward(this.dest[0], this.dest[1], D.speed * 0.3, dt) || this.t <= 0) { this.state = 'graze'; this.t = rr(4, 16); }
        break;
      case 'flee': {
        const t = this.target;
        if (!t || this.t <= 0 || t.pos.distanceTo(this.pos) > 30) { this.state = 'idle'; this.t = 3; this.fly = 0; break; }
        const ax = this.pos.x - t.pos.x, az = this.pos.z - t.pos.z; const l = Math.hypot(ax, az) || 1;
        this.moveToward(this.pos.x + ax / l * 5, this.pos.z + az / l * 5, D.speed, dt);
        break;
      }
      case 'attack': {
        const t = this.target;
        if (!t || t.dead || t.hidden || this.t <= 0 || t.pos.distanceTo(this.pos) > 45) { this.state = 'idle'; this.t = 5; this.target = null; break; }
        const d = t.pos.distanceTo(this.pos);
        if (d > 1.5) this.moveToward(t.pos.x, t.pos.z, D.speed * (d > 6 ? 1 : 0.6), dt);
        else {
          this.heading = dampAngle(this.heading, Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z), 8, dt);
          this.biteT = (this.biteT || 0) - dt;
          if (this.biteT <= 0) { this.biteT = this.type === 'tiger' ? 1.1 : 1.4; this.lunge = 0.3; this.A.bite(this, t); }
        }
        break;
      }
      case 'follow': {
        const o = this.owner;
        if (!o || o.dead) { this.owner = null; this.state = 'idle'; break; }
        if (o.hidden) { const door = o.home?.door; if (door && this.moveToward(door[0] + 1, door[1] + 1, D.speed * 0.5, dt)) this.state2 = 'sit'; break; }
        // guard dog: attack whoever fights the owner
        if (this.type === 'dog' && o.combat.target && !o.combat.target.dead && o.combat.target.pos?.distanceTo(o.pos) < 10) { this.state = 'attack'; this.target = o.combat.target; this.t = 30; break; }
        const d = o.pos.distanceTo(this.pos);
        const side = o.heading + 2.4;
        const fx = o.pos.x + Math.sin(side) * 1.6, fz = o.pos.z + Math.cos(side) * 1.6;
        if (d > 25) { this.pos.set(fx, 0, fz); }
        if (d > 2.4) this.moveToward(fx, fz, d > 6 ? D.speed * 1.3 : D.speed * 0.6, dt);
        else this.heading = dampAngle(this.heading, o.heading, 3, dt);
        this.state2 = d < 2.6 && !o.moving ? (o.char.anim === 'sleep' || o.char.anim.match(/sit|eat|study|fish|yut|throne/) ? 'lie' : 'sit') : null;
        this.happiness = Math.max(0, this.happiness - gm * 0.01);
        break;
      }
    }
    // pets & farm animals sleep at night
    if ((D.farm || D.pet) && G.env.isNight && this.state === 'idle' && !this.owner) this.state2 = 'lie'; else if (!this.owner) this.state2 = null;
    // keep near home for farm animals
    this.pos.y = this.fly ? Math.max(groundAt(this.pos.x, this.pos.z), WATER_LEVEL) + this.fly * 6 : groundAt(this.pos.x, this.pos.z);
    if (this.fly && this.state !== 'flee') this.fly = Math.max(0, this.fly - dt * 0.3);
    if (!far) this.animate(dt);
    this.root.position.copy(this.pos); this.root.rotation.y = this.heading;
  }

  animate(dt) {
    if (this.model) return this.animateModel(dt);
    const S = this.spec; const moving = this.speed > 0.05;
    const run = this.speed > this.def.speed * 0.6;
    this.phase += dt * (moving ? (run ? 12 : 7) * clamp(this.speed / this.def.speed + 0.4, 0.5, 1.6) : 0);
    const p = this.phase;
    const amp = moving ? (run ? 0.75 : 0.45) : 0;
    if (S.bird) {
      this.legs[0].rotation.x = Math.sin(p) * amp; this.legs[1].rotation.x = -Math.sin(p) * amp;
      const flap = this.fly > 0.05 ? Math.sin(performance.now() / 70) * 0.9 : -0.1;
      this.wings[0].rotation.z = -flap; this.wings[1].rotation.z = flap;
      this.neck.rotation.x = this.state === 'graze' ? 0.9 + Math.sin(performance.now() / 300) * 0.2 : Math.sin(p * 0.5) * 0.15;
      this.body.position.y = 0;
      return;
    }
    if (this.type === 'rabbit') {
      const hop = moving ? Math.abs(Math.sin(p * 0.7)) : 0;
      this.body.position.y = hop * 0.18; this.body.rotation.x = -hop * 0.3;
      for (const [i, l] of this.legs.entries()) l.rotation.x = moving ? (i < 2 ? -0.8 : 0.8) * hop : 0;
      this.neck.rotation.x = this.state === 'graze' ? 0.4 : 0;
      return;
    }
    const gallop = run;
    const off = gallop ? [0, 0.3, Math.PI, Math.PI + 0.3] : [0, Math.PI, Math.PI, 0];
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(p + off[i]) * amp; });
    this.body.position.y = moving ? Math.abs(Math.sin(p)) * (gallop ? 0.06 : 0.02) : 0;
    this.body.rotation.x = gallop ? Math.sin(p) * 0.06 : 0;
    // head / postures
    let nx = moving ? Math.sin(p) * 0.06 : Math.sin(performance.now() / 900 + this.phase) * 0.08;
    if (this.state === 'graze' && !moving) nx = 0.9;
    this.neck.rotation.x = nx; this.neck.rotation.y = !moving ? Math.sin(performance.now() / 1300 + this.phase) * 0.4 : 0;
    if (this.lunge > 0) { this.lunge -= dt; this.body.position.z = Math.sin(this.lunge / 0.3 * Math.PI) * 0.4; this.neck.rotation.x = -0.3; } else this.body.position.z = 0;
    if (this.state2 === 'sit' && !moving) { this.legs[2].rotation.x = -1.4; this.legs[3].rotation.x = -1.4; this.body.rotation.x = -0.45; this.body.position.y = -S.legH * 0.35; this.legs[0].rotation.x = 0.4; this.legs[1].rotation.x = 0.4; }
    if (this.state2 === 'lie' && !moving) { this.legs.forEach((l, i) => (l.rotation.x = i < 2 ? -1.4 : 1.4)); this.body.position.y = -S.legH * 0.85; this.body.rotation.x = 0; this.neck.rotation.x = 0.35; }
    if (this.wagT === undefined) this.wagT = 0;
  }
}

// ---------- Manager ----------
export class Animals {
  constructor(G) { this.G = G; this.list = []; this.nextId = 1; }

  spawn(type, x, z, o) { const a = new Animal(this, type, x, z, o); this.list.push(a); return a; }

  populate(saved) {
    if (saved) { for (const d of saved) { const a = this.spawn(d.type, d.x, d.z, { variant: d.variant, petName: d.petName, home: d.home, id: d.id }); a.ownerId = d.ownerId; a.happiness = d.happiness ?? 80; a.forSale = d.forSale ?? null; } this.nextId = Math.max(1, ...this.list.map((a) => a.id + 1)); this.linkOwners(); return; }
    const ring = (rmin, rmax, maxH = 70) => { for (let i = 0; i < 60; i++) { const a = rr(0, 6.28), r = rr(rmin, rmax); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) > 480 || Math.abs(z) > 480) continue; const h = heightAt(x, z); if (h > WATER_LEVEL + 0.5 && h < maxH && !this.G.nav.blocked(x, z, 0.5)) return [x, z]; } return [0, 60]; };
    const herd = (type, n, rmin, rmax, maxH, per = 3, range = 30) => { for (let i = 0; i < n; i += per) { const c = ring(rmin, rmax, maxH); for (let j = 0; j < per && i + j < n; j++) this.spawn(type, c[0] + rr(-4, 4), c[1] + rr(-4, 4), { home: c, range }); } };
    herd('deer', 16, 150, 380, 60, 4, 40);
    herd('rabbit', 12, 50, 260, 25, 2, 18);
    herd('boar', 6, 200, 400, 70, 3, 40);
    herd('fox', 4, 120, 330, 50, 1, 50);
    herd('tiger', 1, 360, 440, 95, 1, 90);
    herd('magpie', 10, 20, 120, 20, 2, 25);
    // cranes in the paddies and by the river
    const P = LAYOUT.paddies;
    for (let i = 0; i < 6; i++) { const x = rr(P.x0, P.x1), z = rr(P.z0, P.z1); this.spawn('crane', x, z, { home: [x, z], range: 25 }); }
    // farm animals
    for (let i = 0; i < 3; i++) { const x = rr(P.x0 + 5, P.x1 - 5), z = P.z0 - 6 - rr(0, 4); this.spawn('ox', x, z, { home: [x, z], range: 8 }); }
    const houses = this.G.world.houses;
    for (let i = 0; i < 12; i++) { const h = pick(houses); this.spawn('chicken', h.door[0] + rr(-3, 3), h.door[1] + rr(-3, 3), { home: [h.door[0], h.door[1]], range: 6, variant: i }); }
    // horses: three for sale at the stable, a wild herd in the silver-grass field
    const st = this.G.world.spots.stable;
    for (let i = 0; i < 3; i++) { const h = this.spawn('horse', st[0] + rr(-5, 5), st[1] + rr(-2, 3), { home: [st[0], st[1]], range: 5, variant: i }); h.forSale = [120, 160, 260][i]; }
    for (let i = 0; i < 4; i++) this.spawn('horse', 220 + rr(-20, 20), 230 + rr(-20, 20), { home: [220, 230], range: 35, variant: 2 + i });
    // village dogs and cats (strays you can adopt)
    for (let i = 0; i < 6; i++) { const h = pick(houses); this.spawn('dog', h.door[0] + rr(-4, 4), h.door[1] + rr(-4, 4), { home: [h.door[0], h.door[1]], range: 15, variant: i }); }
    for (let i = 0; i < 4; i++) { const h = pick(houses); this.spawn('cat', h.door[0] + rr(-4, 4), h.door[1] + rr(-4, 4), { home: [h.door[0], h.door[1]], range: 10, variant: i }); }
  }

  // ---------- Horses ----------
  mount(s, h) {
    if (s.mount || h.rider || s.age === 'child') return;
    s.cancelAction(); s.mount = h; h.rider = s; s.char.riding = true; h.called = false;
    s.pos.x = h.pos.x; s.pos.z = h.pos.z; s.heading = h.heading;
    if (s.household) this.G.ui?.toast(`Mounted ${h.petName}. ${s.controlled ? 'Shift to gallop · E to dismount' : 'Long journeys are faster on horseback.'}`);
  }
  dismount(s) {
    const h = s.mount; if (!h) return;
    h.rider = null; s.mount = null; s.char.riding = false; s.char.rideBob = 0;
    const a = s.heading + Math.PI / 2; s.pos.x += Math.sin(a) * 1.0; s.pos.z += Math.cos(a) * 1.0;
    h.home = [h.pos.x, h.pos.z]; h.range = 4; h.state = 'graze'; h.t = 30;
  }
  buyHorse(s, h) {
    if (s.coins < h.forSale) return this.G.ui?.toast(`That horse costs ${h.forSale} nyang.`);
    s.coins -= h.forSale; h.forSale = null; this.giveHorse(s, h);
    this.G.log(`${s.name.full} bought a ${['chestnut', 'bay', 'grey', 'black', 'white', 'dun'][h.variant % 6]} horse and named it ${h.petName}.`, 'story', s.pos);
  }
  giveHorse(s, h) {
    if (s.horse && !s.horse.dead) { s.horse.owner = null; s.horse.setTack(false); }
    h.owner = s; s.horse = h; h.petName = pick(['Cheollima', 'Baekma', 'Jeokto', 'Pungun', 'Heukbyeol', 'Bitnari', 'Haetsal', 'Geumbit']); h.setTack(true);
  }
  tame(s, h) {
    const ok = Math.random() < 0.3 + s.skills.charisma * 0.04 + s.skills.sword * 0.02;
    if (ok) { this.giveHorse(s, h); h.home = [h.pos.x, h.pos.z]; h.range = 4; this.G.log(`${s.name.full} tamed a wild horse and named it ${h.petName}!`, 'story', s.pos); s.needs.honor = Math.min(100, s.needs.honor + 15); }
    else { s.hp -= 12; s.char.setAnim('hit'); s.say('Whoa—! It threw me!', 'shout'); h.state = 'flee'; h.target = s; h.t = 6; }
  }
  whistle(s) {
    const h = s.horse; if (!h || h.dead) return this.G.ui?.toast('You have no horse. Buy one at the stable south of the plaza.');
    if (h.rider) return;
    h.called = true; s.say('(whistles)', 'talk', 1.5);
  }

  linkOwners() { for (const a of this.list) if (a.ownerId != null) { const o = this.G.sims.find((s) => s.id === a.ownerId); if (o) { a.owner = o; if (a.type === 'horse') { o.horse = a; a.setTack(true); } else { o.pet = a; a.state = 'follow'; } } } }

  adopt(sim, a) {
    if (sim.pet && !sim.pet.dead) { this.G.ui?.toast(`${sim.name.given} already has a pet.`); return; }
    a.owner = sim; sim.pet = a; a.state = 'follow'; a.petName = a.petName || pick(PET_NAMES[a.type] || ['Bori']);
    a.home = sim.home?.door || a.home;
    this.G.log(`${sim.name.full} adopted a ${a.def.name.toLowerCase()} and named it ${a.petName}.`, 'love', sim.pos);
    sim.addMoodlet('pet', 'New pet!', 15, 1440);
  }
  buyPuppy(sim) {
    if (sim.coins < 15) { this.G.ui?.toast('A Jindo puppy costs 15 nyang.'); return; }
    sim.coins -= 15;
    const a = this.spawn('dog', sim.pos.x + 1, sim.pos.z + 1, { variant: Math.floor(rr(0, 3)) });
    a.root.scale.setScalar(0.65);
    this.adopt(sim, a);
  }
  petInteract(sim, a, kind) {
    if (kind === 'pet') { sim.needs.fun = Math.min(100, sim.needs.fun + 12); sim.needs.social = Math.min(100, sim.needs.social + 6); a.happiness = 100; sim.say(a.type === 'dog' ? 'Good dog, ' + (a.petName || 'boy') + '!' : 'Nabi, nabi… (purr)', 'happy'); sim.char.setAnim('wash'); }
    if (kind === 'play') { sim.needs.fun = Math.min(100, sim.needs.fun + 25); a.happiness = 100; sim.say('Fetch! Go on!', 'happy'); sim.char.setAnim('cheer'); a.state = 'wander'; a.dest = [sim.pos.x + rr(-8, 8), sim.pos.z + rr(-8, 8)]; a.t = 6; setTimeout(() => { if (a.owner) a.state = 'follow'; }, 4000); }
  }

  // animal attacks a sim (or animal)
  bite(a, t) {
    const G = this.G;
    const dmg = a.type === 'tiger' ? rr(14, 24) : a.type === 'boar' ? rr(8, 14) : rr(4, 8);
    if (t.combat?.dodgeT > 0.08) return;
    if (t.combat?.blocking) { t.stamina -= 12; G.fx?.sparks(t.pos.clone().setY(t.pos.y + 1), 6, 0.5); return; }
    t.hp -= dmg;
    if (t.combat) t.combat.hitT = 0.35;
    G.fx?.blood(t.pos.clone().setY(t.pos.y + 1.0), 8, a.heading);
    G.audio?.hit(t.pos, a.type === 'tiger');
    if (t.say && chance(0.4)) t.say(a.type === 'tiger' ? 'AAAH! A TIGER!' : 'Get away!', 'shout', 1.5);
    if (t.controlled) G.hitStop?.(0.04, 0.12);
    // dieAnimal() was never defined anywhere, so an animal killed by another animal was simply left
    // alive at hp <= 0 while its attacker went idle. Use the real kill path.
    if (t.hp <= 0) { if (t.die) { t.die(null); G.log(`${t.name.full} was killed by a ${a.def.name.toLowerCase()}.`, 'death', t.pos); } else this.kill(t, null); a.state = 'idle'; return; }
    // villagers respond
    if (t.startFight && !t.controlled && t.action?.type !== 'fight') {
      if (t.fighter) t.startFight(a); else { t.cancelAction(); t.startAction({ type: 'flee', dest: t.home?.door || [0, 0], label: 'Fleeing!' }); }
    }
    for (const s of G.sims) if (s.fighter && !s.dead && !s.controlled && !s.combat.target && s.pos.distanceTo(a.pos) < 20 && s !== t && a.type !== 'dog') s.startFight(a);
  }

  // a sim's sword hits an animal
  hit(att, a, heavy) {
    const G = this.G;
    const dmg = (heavy ? 30 : 14) * (0.75 + att.skills.sword * 0.06);
    a.hp -= dmg; a.lastHitBy = att;
    G.fx?.blood(a.pos.clone().setY(a.pos.y + 0.6), 10, att.heading); G.audio?.hit(a.pos, heavy);
    if (att.controlled) { G.hitStop?.(0.05, 0.15); G.ui?.floatText(att, Math.round(dmg).toString(), '#ffd0c0'); }
    if (a.hp <= 0) this.kill(a, att);
  }

  kill(a, killer) {
    const G = this.G;
    a.dead = true; a.state = 'dead';
    if (a.owner) { a.owner.addMoodlet('petdied', `Mourning ${a.petName}`, -25, 2880); G.log(`${a.owner.name.full}'s beloved ${a.def.name.toLowerCase()} ${a.petName} has died.`, 'death', a.pos); a.owner.pet = null; }
    for (const s of G.sims) if (s.combat.target === a) { s.endFight(); s.cancelAction(); }
    if (!killer) return;
    const value = { tiger: 150, boar: 25, deer: 18, fox: 15, rabbit: 4, ox: 30, chicken: 3, crane: 0, magpie: 0, dog: 0, cat: 0 }[a.type] || 0;
    if (value) { killer.earn(value); killer.needs.hunger = Math.min(100, killer.needs.hunger + 15); }
    if (a.type === 'tiger') { killer.needs.honor = 100; killer.addMoodlet('tiger', 'Tiger Slayer!', 40, 4320); killer.tigerSlayer = true; G.log(`🐯 ${killer.name.full} has slain the great Korean tiger of the mountains! Their name will be sung for generations. (+${value} nyang)`, 'tournament', a.pos); }
    else if (a.type === 'crane') { killer.needs.honor = Math.max(0, killer.needs.honor - 30); G.log(`${killer.name.full} killed a sacred crane. The elders are horrified.`, 'omen', a.pos); }
    else if (['dog', 'cat'].includes(a.type)) { killer.needs.honor = Math.max(0, killer.needs.honor - 20); }
    else if (killer.household) G.ui?.toast(`Hunted a ${a.def.name.toLowerCase()}: +${value} nyang`);
    if (a.type === 'ox' || a.type === 'chicken') { killer.outlaw = true; G.log(`${killer.name.full} slaughtered a farmer's ${a.def.name.toLowerCase()}!`, 'danger', a.pos); }
  }

  update(dt, gm, camPos) {
    this.frame = (this.frame || 0) + 1;
    for (const a of this.list) {
      // same quarantine as sims: a creature that chased a NaN target must not carry NaN onward
      const P = a.pos;
      if (!Number.isFinite(P.x) || !Number.isFinite(P.z) || !Number.isFinite(P.y)) { const b = a._safe || a.home || [0, 0]; P.set(b[0], 0, b[1]); a.target = null; if (a.state === 'chase' || a.state === 'flee') a.state = 'idle'; }
      else (a._safe ||= [0, 0], a._safe[0] = P.x, a._safe[1] = P.z);
      a.update(dt, gm, camPos);
    }
    // remove long-dead animals, respawn wildlife occasionally
    for (const a of this.list) if (a.dead && a.deadT > 180) { this.G.scene.remove(a.root); a.removed = true; }
    this.list = this.list.filter((a) => !a.removed);
    this.respawnT = (this.respawnT ?? 600) - gm;
    if (this.respawnT <= 0) {
      this.respawnT = 600;
      const counts = {}; for (const a of this.list) counts[a.type] = (counts[a.type] || 0) + 1;
      const want = { deer: 16, rabbit: 12, boar: 6, fox: 4, tiger: 1 };
      for (const t in want) if ((counts[t] || 0) < want[t]) { const a = rr(0, 6.28), r = rr(250, 420); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (heightAt(x, z) > WATER_LEVEL + 1 && Math.abs(x) < 470 && Math.abs(z) < 470) this.spawn(t, x, z, { home: [x, z], range: 40 }); }
    }
  }

  serialize() { return this.list.filter((a) => !a.dead).map((a) => ({ id: a.id, type: a.type, x: a.pos.x, z: a.pos.z, variant: a.variant, petName: a.petName, home: a.home, ownerId: a.owner?.id ?? null, happiness: a.happiness, forSale: a.forSale ?? null })); }
}
