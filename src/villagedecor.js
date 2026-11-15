// Village dressing: proper road surfaces (rutted earth tracks, cobbled lanes near the plaza) and
// yard details — brushwood fences (싸리 울타리) round cottages and huts, dry-stone walls (돌담) round
// tiled houses, low clay chimneys (굴뚝), woodpiles and laundry poles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROADS, heightAt, isWater, LAYOUT } from './terrain.js';
import { addSnow } from './season.js';
import { photoTex } from './textures.js';

function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function alphaEdge() { return canvasTex((g, S) => { const grd = g.createLinearGradient(0, 0, S, 0); grd.addColorStop(0, '#000'); grd.addColorStop(0.16, '#fff'); grd.addColorStop(0.84, '#fff'); grd.addColorStop(1, '#000'); g.fillStyle = grd; g.fillRect(0, 0, S, S); }, 64); }
function brushTex() {
  return canvasTex((g, S) => {
    g.fillStyle = '#6e5a38'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { const x = rnd() * S; const v = 120 + rnd() * 70; g.strokeStyle = `rgb(${v},${v - 18},${v - 50})`; g.lineWidth = 1 + rnd() * 2.2; g.beginPath(); g.moveTo(x, S); g.lineTo(x + (rnd() - 0.5) * 18, 0); g.stroke(); }
    for (const y of [0.3, 0.72]) { g.fillStyle = 'rgba(70,50,30,0.85)'; g.fillRect(0, y * S, S, 5); }
  });
}
// a ribbon of quads following a polyline, draped on the terrain
// u runs 0..uSpan across the ribbon (so photo textures keep real-world scale), v = distance / uvScale
function ribbon(points, width, lift, uvScale, uSpan = 1) {
  const pos = [], uv = [], idx = []; let dist = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]; const [nx, nz] = points[Math.min(i + 1, points.length - 1)]; const [px, pz] = points[Math.max(i - 1, 0)];
    let dx = nx - px, dz = nz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ox = -dz * width / 2, oz = dx * width / 2;
    if (i > 0) dist += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    for (const [sx, u] of [[-1, 0], [1, 1]]) { const vx = x + ox * sx, vz = z + oz * sx; pos.push(vx, heightAt(vx, vz) + lift, vz); uv.push(u * uSpan, dist / uvScale); }
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function resample(line, step) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) { const [ax, az] = line[i], [bx, bz] = line[i + 1]; const L = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  out.push(line[line.length - 1]); return out;
}

export function createVillageDecorSystem(G) {
  const S = {
    id: 'villageDecor',
    onEvent(name) {
      if (name !== 'ready' || this.built) return; this.built = true;
      try { this.roads(); this.yards(); } catch (e) { console.error('[villageDecor]', e); }
    },
    roads() {
      // photographic road surfaces (Poly Haven CC0): rutted trail, cobbles, granite flagstones. Each ribbon's
      // u spans width / tile metres; its own soft alpha edge is stretched back to one span across.
      const TILE = { dirt: 3.4, cob: 2.4, pave: 2.6 };
      const edge = (k, wd) => { const a = alphaEdge(); a.repeat.set(TILE[k] / wd, 1); return a; };
      const road = (k, c, n, opts) => new THREE.MeshStandardMaterial({ map: photoTex(c), normalMap: photoTex(n, false), transparent: true, depthWrite: false, polygonOffset: true, ...opts });
      const dirtM = road('dirt', 'dirt_c', 'dirt_n', { alphaMap: edge('dirt', 4.2), color: '#ece0cf', normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const cobM = road('cob', 'cobble_c', 'cobble_n', { alphaMap: edge('cob', 4.6), color: '#d8d0c4', normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.9, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      addSnow(dirtM, 0.9, 'road-dirt'); addSnow(cobM, 0.7, 'road-cob');
      const paveM = road('pave', 'paving_c', 'paving_n', { alphaMap: edge('pave', 5), color: '#f0ece6', normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.85, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      addSnow(paveM, 0.7, 'road-pave');
      const dirt = [], cob = [], pave = [];
      const [px, pz] = LAYOUT.plaza;
      // how wealthy is the neighbourhood around a point?
      const W = { mansion: 3, house: 1.6, cottage: 0.3, hut: -1.2 };
      const wealth = (x, z) => { let w = 0; for (const h of G.world.houses) { const d = Math.hypot(h.x - x, h.z - z); if (d < 34) w += (W[h.tier] ?? 0.3) * (1 - d / 40); } const dp = Math.hypot(x - px, z - pz); if (dp < 40) w += 2.2; const pal = Math.hypot(x - LAYOUT.palace[0], z - LAYOUT.palace[1]); if (pal < 80) w += 4; return w; };
      const kindAt = (x, z) => { const w = wealth(x, z); return w >= 3.2 ? 'pave' : w >= 1.2 ? 'cob' : 'dirt'; };
      const spec = { pave: [5, 0.09, TILE.pave, pave], cob: [4.6, 0.08, TILE.cob, cob], dirt: [4.2, 0.06, TILE.dirt, dirt] };
      for (const road of ROADS) {
        const pts = resample(road, 1.6);
        let run = [], kind = null;
        const flush = () => { if (run.length > 2) { const [wd, lift, uvs, list] = spec[kind]; list.push(ribbon(run, wd, lift, uvs, wd / uvs)); } run = []; };
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (isWater(p[0], p[1])) { flush(); kind = null; continue; }
          const k = kindAt(p[0], p[1]);
          if (k !== kind) { const last = run[run.length - 1]; flush(); kind = k; if (last) run.push(last); else if (i > 0) run.push(pts[i - 1]); }
          run.push(p);
        }
        flush();
      }
      // a paved approach from the road to every mansion gate
      for (const h of G.world.houses) if (h.tier === 'mansion' && h.gate) {
        let best = null, bd = 1e9; for (const road of ROADS) for (const q of resample(road, 2)) { const d = Math.hypot(q[0] - h.gate[0], q[1] - h.gate[1]); if (d < bd) { bd = d; best = q; } }
        if (best && bd < 30) pave.push(ribbon(resample([best, h.gate], 1.2), 2.6, 0.1, TILE.pave, 5 / TILE.pave));
      }
      for (const [list, m] of [[dirt, dirtM], [cob, cobM], [pave, paveM]]) { if (!list.length) continue; const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.receiveShadow = true; mesh.renderOrder = 1; G.scene.add(mesh); }
    },
    yards() {
      const brush = [], stone = [], clay = [], wood = [];
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      const put = (list, geo, x, y, z, ry = 0, rx = 0, rz = 0) => { e.set(rx, ry, rz); q.setFromEuler(e); pv.set(x, y, z); sv.set(1, 1, 1); m4.compose(pv, q, sv); list.push(geo.clone().applyMatrix4(m4)); };
      // fence or wall along a local segment of a house's yard
      const segment = (h, ax, az, bx, bz, kind) => {
        const A = h.world(ax, az), B = h.world(bx, bz); const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if (len < 0.5) return;
        const rot = Math.atan2(B[0] - A[0], B[1] - A[1]) - Math.PI / 2; const n = Math.ceil(len / 1.6);
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n; const cx = A[0] + (B[0] - A[0]) * (t0 + t1) / 2, cz = A[1] + (B[1] - A[1]) * (t0 + t1) / 2; const y = heightAt(cx, cz); const sl = len / n;
          if (kind === 'brush') { put(brush, new THREE.BoxGeometry(sl, 1.05, 0.12), cx, y + 0.5, cz, rot); put(wood, new THREE.CylinderGeometry(0.05, 0.06, 1.3, 5), A[0] + (B[0] - A[0]) * t0, heightAt(A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0) + 0.6, A[1] + (B[1] - A[1]) * t0); }
          else { const hh = 1.1 + (rnd() - 0.5) * 0.18; put(stone, new THREE.BoxGeometry(sl + 0.05, hh, 0.55), cx, y + hh / 2 - 0.05, cz, rot); }
        }
      };
      const ring = (h, x0, x1, z0, z1, kind, gate) => {
        segment(h, x0, z0, x1, z0, kind); segment(h, x0, z0, x0, z1, kind); segment(h, x1, z0, x1, z1, kind);
        const gl = -gate / 2, gr = gate / 2; segment(h, x0, z1, gl, z1, kind); segment(h, gr, z1, x1, z1, kind);
      };
      for (const h of G.world.houses) {
        if (!h.world || h.virtual) continue;
        const w = h.w, d = h.d, t = h.tier || (h.noble ? 'house' : 'cottage');
        if (t === 'mansion') continue; // has its own walls
        const x0 = -w / 2 - 3.3, x1 = w / 2 + 3.1, z0 = -d / 2 - 2.4, z1 = d / 2 + 4.2;
        ring(h, x0, x1, z0, z1, t === 'house' ? 'stone' : 'brush', 3.4);
        if (t !== 'house') {
          // low clay chimney beside the kitchen end and a woodpile
          const c = h.world(w / 2 + 0.55, -d / 2 + 0.6); const cy = heightAt(c[0], c[1]);
          put(clay, new THREE.CylinderGeometry(0.28, 0.34, 1.5, 8), c[0], cy + 0.75, c[1]); put(clay, new THREE.CylinderGeometry(0.36, 0.3, 0.18, 8), c[0], cy + 1.55, c[1]);
          const wp = h.world(-w / 2 - 0.9, d / 2 - 0.6); const wy = heightAt(wp[0], wp[1]);
          for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) put(wood, new THREE.CylinderGeometry(0.11, 0.11, 1.2, 6), wp[0], wy + 0.12 + r * 0.2, wp[1], h.rot, 0, Math.PI / 2 + 0.0);
        } else {
          // laundry pole and line
          const a = h.world(-w / 2 - 1.6, d / 2 + 2.6), b = h.world(-w / 2 - 1.6, -d / 2 + 0.2);
          for (const p of [a, b]) put(wood, new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5), p[0], heightAt(p[0], p[1]) + 1.05, p[1]);
        }
      }
      // dry-stone walls (돌담) and posts/woodpiles use the shared photo textures (box/cylinder UVs ~ 1-2 m)
      const mats = { brush: new THREE.MeshStandardMaterial({ map: brushTex(), color: '#ffffff', roughness: 1 }), stone: new THREE.MeshStandardMaterial({ map: photoTex('stonewall_c'), normalMap: photoTex('stonewall_n', false), color: '#d8d2c8', roughness: 0.95 }), clay: new THREE.MeshStandardMaterial({ color: '#8f6a4e', roughness: 0.95 }), wood: new THREE.MeshStandardMaterial({ map: photoTex('wood_c'), color: '#b08a68', roughness: 0.9 }) };
      for (const k in mats) addSnow(mats[k], 0.8, 'yard-' + k);
      for (const [list, k] of [[brush, 'brush'], [stone, 'stone'], [clay, 'clay'], [wood, 'wood']]) {
        if (!list.length) continue; const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => { if (g.index) return g.toNonIndexed(); return g; })), mats[k]); mesh.castShadow = mesh.receiveShadow = true; G.scene.add(mesh);
      }
    },
  };
  return S;
}
