// Procedural "sculpted" characters: bodies, faces, hair and hands are modelled as smooth
// signed-distance fields, meshed with Surface Nets, and (for bodies) auto-skinned to the rig.
import * as THREE from 'three';

// ---------- SDF helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); }
export function smax(a, b, k) { return -smin(-a, -b, k); }

// round cone / tapered capsule between a and b (approximate, good enough for meshing)
function segT(px, py, pz, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  return clamp(((px - a[0]) * bx + (py - a[1]) * by + (pz - a[2]) * bz) / (l2 || 1), 0, 1);
}
function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
}

// Primitive: { type:'cone'|'ell'|'rev', ..., k, region, bone, parent, child, zs, sub }
function primDist(p, x, y, z) {
  let zz = z;
  if (p.zs) zz = (z - (p.zc || 0)) / p.zs + (p.zc || 0);
  let d;
  if (p.type === 'cone') {
    const t = segT(x, y, zz, p.a, p.b);
    const cx = p.a[0] + (p.b[0] - p.a[0]) * t, cy = p.a[1] + (p.b[1] - p.a[1]) * t, cz = p.a[2] + (p.b[2] - p.a[2]) * t;
    d = Math.hypot(x - cx, y - cy, zz - cz) - (p.r1 + (p.r2 - p.r1) * t);
    if (p.capEnd) { const dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], dz = p.b[2] - p.a[2]; const L = Math.hypot(dx, dy, dz); d = Math.max(d, ((x - p.b[0]) * dx + (y - p.b[1]) * dy + (zz - p.b[2]) * dz) / L); }
  } else if (p.type === 'ell') {
    d = ellipsoid(x, y, zz, p.c, p.r);
  } else if (p.type === 'rev') {
    // solid of revolution around a vertical axis, radius profile R(y)
    const q = Math.hypot(x - p.c[0], zz - p.c[2]);
    let r = p.R(y);
    if (p.pleats) { const th = Math.atan2(zz - p.c[2], x - p.c[0]); r *= 1 + p.pleats * Math.sin(th * p.pleatN) * clamp((p.y1 - y) / (p.y1 - p.y0), 0, 1); }
    d = (q - r) * 0.9;
    d = Math.max(d, y - p.y1, p.y0 - y);
  }
  if (p.zs) d *= Math.min(1, p.zs);
  return d;
}

export function buildSDF(prims) {
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) {
      const pd = primDist(p, x, y, z);
      if (p.sub) d = smax(d, -pd, p.k || 0);
      else d = d > 1e8 ? pd : smin(d, pd, p.k || 0);
    }
    return d;
  };
}

// ---------- Surface Nets mesher ----------
export function surfaceNets(sdf, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = sdf(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cid = (i, j, k) => i + cx * (j + cy * k);
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { v[c] = V[id(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cellV[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = V[id(i, j, k)]; const in0 = v0 < 0;
    if (i < cx && j > 0 && k > 0 && j < cy && k < cz) {
      const v1 = V[id(i + 1, j, k)];
      if (in0 !== (v1 < 0)) quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], !in0);
    }
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz) {
      const v1 = V[id(i, j + 1, k)];
      if (in0 !== (v1 < 0)) quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], !in0);
    }
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy) {
      const v1 = V[id(i, j, k + 1)];
      if (in0 !== (v1 < 0)) quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], !in0);
    }
  }
  // fix orientation per triangle using the field gradient, and compute smooth normals
  const P = pos;
  const nrm = new Float32Array(P.length);
  const e = step * 0.5;
  for (let q = 0; q < P.length; q += 3) {
    const x = P[q], y = P[q + 1], z = P[q + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; nrm[q] = gx / l; nrm[q + 1] = gy / l; nrm[q + 2] = gz / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    if (fx * nrm[a] + fy * nrm[a + 1] + fz * nrm[a + 2] < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  // one pass of Laplacian smoothing to remove voxel stepping
  const nv = P.length / 3;
  const acc = new Float32Array(P.length), cnt = new Uint16Array(nv);
  for (let t = 0; t < idx.length; t += 3) for (let s = 0; s < 3; s++) {
    const a = idx[t + s], b = idx[t + (s + 1) % 3];
    acc[a * 3] += P[b * 3]; acc[a * 3 + 1] += P[b * 3 + 1]; acc[a * 3 + 2] += P[b * 3 + 2]; cnt[a]++;
    acc[b * 3] += P[a * 3]; acc[b * 3 + 1] += P[a * 3 + 1]; acc[b * 3 + 2] += P[a * 3 + 2]; cnt[b]++;
  }
  const out = new Float32Array(P.length);
  for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) out[i * 3 + a] = cnt[i] ? P[i * 3 + a] * 0.5 + (acc[i * 3 + a] / cnt[i]) * 0.5 : P[i * 3 + a];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// ---------- Materials: palette-indexed cloth/skin with soft rim light ----------
export const PAL = { skin: 0, top: 1, bottom: 2, robe: 3, belt: 4, collar: 5, shoe: 6, wrap: 7, cuff: 8, armor: 9, lips: 10, inner: 11 };
export function paletteMaterial(colors, opts = {}) {
  const pal = Array.from({ length: 12 }, (_, i) => new THREE.Color(colors[i] || '#ff00ff'));
  const m = new THREE.MeshPhysicalMaterial({ roughness: opts.roughness ?? 0.68, metalness: 0, sheen: 0.55, sheenRoughness: 0.55, sheenColor: new THREE.Color('#fff2e2'), specularIntensity: 0.35 });
  m.userData.pal = pal;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPal = { value: pal };
    sh.uniforms.uBlush = { value: new THREE.Color(opts.blush || '#e07a6a') };
    sh.uniforms.uRim = { value: opts.rim ?? 0.22 };
    sh.uniforms.uHem = { value: opts.hem ? 1 : 0 };
    sh.uniforms.uHemCol = { value: new THREE.Color(opts.hemColor || '#d9b44a') };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRegion; attribute float aBlush; attribute float aLip; varying float vRegion; varying float vBlush; varying float vLip; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion; vBlush = aBlush; vLip = aLip; vObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPal[12]; uniform vec3 uBlush; uniform float uRim; uniform float uHem; uniform vec3 uHemCol; varying float vRegion; varying float vBlush; varying float vLip; varying vec3 vObj;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        int ri = int(vRegion + 0.5);
        vec3 base = uPal[ri];
        if (ri != 0 && ri != 10) {
          // woven fabric micro-variation
          float w = sin(vObj.x * 900.0) * sin(vObj.y * 900.0) * 0.5 + 0.5;
          float folds = sin(vObj.y * 60.0 + sin(vObj.x * 25.0) * 2.0) * 0.5 + 0.5;
          base *= 0.93 + w * 0.05 + folds * 0.06;
        }
        // gold-leaf (geumbak) border on noble skirts & robes
        if (uHem > 0.5 && (ri == 2 || ri == 3) && vObj.y < 0.2 && vObj.y > 0.02) {
          float a = atan(vObj.x, vObj.z);
          float band = smoothstep(0.2, 0.17, vObj.y) * smoothstep(0.035, 0.05, vObj.y);
          float motif = smoothstep(0.55, 0.75, sin(a * 24.0) * sin((vObj.y - 0.1) * 120.0) * 0.5 + 0.5 + sin(a * 48.0) * 0.15);
          float edge = smoothstep(0.012, 0.0, abs(vObj.y - 0.19)) + smoothstep(0.012, 0.0, abs(vObj.y - 0.045));
          base = mix(base, uHemCol, clamp(band * motif + edge, 0.0, 1.0));
        }
        base = mix(base, uBlush, clamp(vBlush, 0.0, 1.0) * 0.45);
        base = mix(base, uPal[10], smoothstep(0.0, 1.0, clamp(vLip, 0.0, 1.0)));
        vec4 diffuseColor = vec4( base, opacity );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
        bool skinR = (ri == 0 || ri == 10);
        totalEmissiveRadiance += diffuseColor.rgb * rimF * uRim + (skinR ? diffuseColor.rgb * vec3(1.0, 0.72, 0.6) * 0.16 : vec3(0.0));`);
  };
  m.customProgramCacheKey = () => 'palette-v2';
  return m;
}

const _hairMats = new Map();
export function hairMaterial(color) {
  if (_hairMats.has(color)) return _hairMats.get(color);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjH;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjH = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjH;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        float ang = atan(vObjH.x, vObjH.z);
        float strands = sin(ang * 140.0 + vObjH.y * 30.0) * 0.5 + 0.5;
        float s2 = sin(ang * 53.0 - vObjH.y * 12.0) * 0.5 + 0.5;
        vec4 diffuseColor = vec4( diffuse * (0.78 + strands * 0.16 + s2 * 0.1), opacity );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 hv = normalize(vViewPosition);
        float sheenH = pow(1.0 - abs(dot(normal, hv)), 3.0);
        totalEmissiveRadiance += vec3(0.08, 0.07, 0.06) * sheenH;`);
  };
  m.customProgramCacheKey = () => 'hair-v1';
  _hairMats.set(color, m);
  return m;
}

// ---------- Rest skeleton joint positions (character local, bind A-pose) ----------
// Returns positions consistent with Character.buildRig() when arms are rotated by armA.
export function jointsFor(sex) {
  const f = sex === 'f';
  const legLen = f ? 0.84 : 0.89;
  const sw = f ? 0.155 : 0.18, hw = f ? 0.085 : 0.095;
  const armA = 0.32, legA = 0.03;
  const J = {};
  J.hips = [0, legLen, 0]; J.spine = [0, legLen + 0.12, 0]; J.chest = [0, legLen + 0.32, 0]; J.neck = [0, legLen + 0.53, 0]; J.head = [0, legLen + 0.61, 0.01];
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    const sh = [sx * sw, J.chest[1] + 0.15, 0];
    const dir = [sx * Math.sin(armA), -Math.cos(armA), 0];
    J[side + 'Shoulder'] = sh;
    J[side + 'Elbow'] = [sh[0] + dir[0] * 0.27, sh[1] + dir[1] * 0.27, 0];
    J[side + 'Hand'] = [sh[0] + dir[0] * 0.52, sh[1] + dir[1] * 0.52, 0];
    const hp = [sx * hw, legLen - 0.03, 0];
    const ld = [sx * Math.sin(legA), -Math.cos(legA), 0];
    J[side + 'Hip'] = hp;
    J[side + 'Knee'] = [hp[0] + ld[0] * legLen * 0.48, hp[1] + ld[1] * legLen * 0.48, 0];
    J[side + 'Foot'] = [hp[0] + ld[0] * legLen * 0.92, hp[1] + ld[1] * legLen * 0.92, 0];
  }
  return { J, armA, legA, legLen };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------- Body (dressed silhouette) ----------
// sil: 'pants' | 'robe' | 'armor' | 'chima'
function bodyPrims(sex, sil, build) {
  const { J } = jointsFor(sex);
  const f = sex === 'f';
  const bw = build * (f ? 0.9 : 1);
  const P = [];
  const cone = (a, b, r1, r2, o) => P.push({ type: 'cone', a, b, r1, r2, ...o });
  const robeLike = sil === 'robe' || sil === 'armor';
  const torsoReg = robeLike ? (sil === 'armor' ? 'armor' : 'robe') : 'top';
  // torso
  cone(add(J.hips, [0, -0.07, 0]), J.spine, 0.15 * bw, 0.14 * bw, { zs: 0.74, bone: 'hips', child: 'spine', region: (x, y) => (y < J.hips[1] + 0.06 && !robeLike && sil !== 'chima' ? (f ? 'top' : 'bottom') : torsoReg), k: 0 });
  cone(J.spine, add(J.chest, [0, 0.05, 0]), 0.14 * bw, (f ? 0.15 : 0.165) * bw, { zs: 0.7, bone: 'spine', parent: 'hips', child: 'chest', region: torsoReg, k: 0.05 });
  cone(add(J.chest, [0, 0.05, 0]), add(J.neck, [0, -0.03, 0]), (f ? 0.15 : 0.165) * bw, 0.1, { zs: 0.68, bone: 'chest', parent: 'spine', child: 'neck', region: torsoReg, k: 0.05 });
  if (f) { for (const sx of [-1, 1]) P.push({ type: 'ell', c: [sx * 0.055, J.chest[1] + 0.05, 0.065], r: [0.06, 0.055, 0.05], bone: 'chest', region: 'top', k: 0.05 }); }
  for (const [side, sx] of [['l', 1], ['r', -1]]) {
    cone(add(J.chest, [sx * 0.04, 0.13, 0]), J[side + 'Shoulder'], 0.075, 0.068, { zs: 0.85, bone: 'chest', child: side + 'Shoulder', region: torsoReg, k: 0.045 });
    const sl = f ? [0.06, 0.058, 0.058, 0.072] : [0.068, 0.066, 0.066, 0.09];
    cone(J[side + 'Shoulder'], J[side + 'Elbow'], sl[0], sl[1], { bone: side + 'Shoulder', parent: 'chest', child: side + 'Elbow', region: robeLike && sil !== 'armor' ? 'robe' : 'top', k: 0.03 });
    cone(J[side + 'Elbow'], J[side + 'Hand'], sl[2], sl[3], { bone: side + 'Elbow', parent: side + 'Shoulder', child: side + 'Hand', capEnd: true, region: (x, y, z, t) => (t > 0.86 ? (f ? 'cuff' : robeLike && sil !== 'armor' ? 'robe' : 'top') : robeLike && sil !== 'armor' ? 'robe' : 'top'), k: 0.02 });
    // legs
    if (sil !== 'chima') {
      cone(add(J[side + 'Hip'], [0, 0.03, 0]), J[side + 'Knee'], (f ? 0.105 : 0.12) * bw, 0.09, { bone: side + 'Hip', parent: 'hips', child: side + 'Knee', region: 'bottom', k: 0.05 });
      cone(J[side + 'Knee'], add(J[side + 'Foot'], [0, 0.04, 0]), 0.088, 0.058, { bone: side + 'Knee', parent: side + 'Hip', child: side + 'Foot', region: (x, y) => (y < 0.2 ? 'wrap' : 'bottom'), k: 0.03 });
    }
    cone(add(J[side + 'Foot'], [0, 0.0, -0.035]), add(J[side + 'Foot'], [0, -0.012, 0.12]), 0.046, 0.038, { bone: side + 'Foot', parent: sil === 'chima' ? null : side + 'Knee', region: 'shoe', k: 0.015 });
  }
  // neck (skin)
  cone(add(J.neck, [0, -0.04, -0.005]), add(J.head, [0, 0.05, -0.02]), 0.056, 0.05, { bone: 'neck', parent: 'chest', child: 'head', region: 'skin', k: 0.025 });
  // skirts / robes
  if (sil === 'chima') {
    const y1 = J.chest[1] - 0.04, y0 = 0.025;
    P.push({ type: 'rev', c: [0, 0, 0.01], zs: 0.9, y0, y1, pleats: 0.035, pleatN: 22, skirt: true, bone: 'hips', region: 'bottom', k: 0.02,
      R: (y) => { const t = clamp((y1 - y) / (y1 - y0), 0, 1); return 0.135 + 0.06 * Math.min(1, t * 4) + 0.17 * Math.pow(t, 1.15); } });
  }
  if (robeLike) {
    const y1 = J.spine[1] - 0.02, y0 = sil === 'armor' ? 0.42 : 0.26;
    P.push({ type: 'rev', c: [0, 0, 0], zs: 0.8, y0, y1, pleats: 0.015, pleatN: 14, skirt: true, bone: 'hips', region: sil === 'armor' ? 'armor' : 'robe', k: 0.03,
      R: (y) => { const t = clamp((y1 - y) / (y1 - y0), 0, 1); return 0.155 * bw + 0.1 * t + 0.02 * Math.min(1, t * 5); } });
  }
  return { P, J };
}

function regionOf(prims, x, y, z, sil, f, J) {
  let best = null, bd = 1e9;
  for (const p of prims) { if (p.sub) continue; const d = primDist(p, x, y, z); if (d < bd) { bd = d; best = p; } }
  let t = 0;
  if (best.type === 'cone') t = segT(x, y, best.zs ? z / best.zs : z, best.a, best.b);
  let r = typeof best.region === 'function' ? best.region(x, y, z, t) : best.region;
  // belt / sash band
  if (sil === 'pants' && !f && Math.abs(y - (J.hips[1] + 0.1)) < 0.022 && best.bone !== 'lShoulder' && best.bone !== 'rShoulder' && !best.bone.includes('Elbow')) r = 'belt';
  if (sil === 'robe' && Math.abs(y - (J.chest[1] - 0.05)) < 0.016 && !best.bone.includes('Elbow') && !best.bone.includes('Shoulder')) r = 'belt';
  if (sil === 'armor' && Math.abs(y - (J.spine[1] - 0.02)) < 0.03 && !best.bone.includes('Elbow') && !best.bone.includes('Shoulder')) r = 'belt';
  if (f && sil === 'chima' && best.skirt && y > J.chest[1] - 0.07) r = 'inner';
  // collar (git / dongjeong): diagonal band on the chest front, wrapping left over right
  if (z > 0.03 && y > J.chest[1] - 0.08 && !best.bone.includes('Elbow') && best.bone !== 'neck') {
    const top = J.neck[1] + 0.0;
    const a = [-0.075, top], b = [0.06, J.chest[1] - 0.08];
    const tt = clamp(((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2), 0, 1);
    const dd = Math.hypot(x - (a[0] + (b[0] - a[0]) * tt), y - (a[1] + (b[1] - a[1]) * tt));
    const a2 = [0.075, top], b2 = [0.0, J.chest[1] + 0.04];
    const tt2 = clamp(((x - a2[0]) * (b2[0] - a2[0]) + (y - a2[1]) * (b2[1] - a2[1])) / ((b2[0] - a2[0]) ** 2 + (b2[1] - a2[1]) ** 2), 0, 1);
    const dd2 = Math.hypot(x - (a2[0] + (b2[0] - a2[0]) * tt2), y - (a2[1] + (b2[1] - a2[1]) * tt2));
    if (Math.min(dd, dd2) < 0.019) r = y > J.neck[1] - 0.06 ? 'collar' : 'belt' === r ? r : 'collar';
  }
  return { region: PAL[r] ?? 1, owner: best, t };
}

const BONE_ORDER = ['hips', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'lHand', 'rShoulder', 'rElbow', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];
export { BONE_ORDER };

function skinWeights(owner, t, x, y, z, J) {
  const w = {};
  const addW = (b, v) => { if (b && v > 0) w[b] = (w[b] || 0) + v; };
  if (owner.skirt) {
    const side = x >= 0 ? 'lHip' : 'rHip';
    const low = clamp((J.hips[1] - y) / 0.5, 0, 1);
    const k = low * (owner.region === 'robe' || owner.region === 'armor' ? 0.55 : 0.32) * clamp(Math.abs(x) / 0.12 + 0.3, 0, 1);
    addW(side, k); addW('hips', 1 - k);
  } else {
    let wp = owner.parent && t < 0.3 ? 0.5 * (1 - t / 0.3) : 0;
    let wc = owner.child && t > 0.72 ? 0.5 * ((t - 0.72) / 0.28) : 0;
    addW(owner.parent, wp); addW(owner.child, wc); addW(owner.bone, 1 - wp - wc);
  }
  const entries = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = entries.reduce((s, e) => s + e[1], 0);
  return entries.map(([b, v]) => [BONE_ORDER.indexOf(b), v / sum]);
}

const _bodyCache = new Map();
export function bodyGeometry(sex, sil, build, stripes = false, lo = false) {
  const bb = stripes ? 1.0 : build > 1.02 ? 1.08 : 0.96;
  const key = geoKey('body', [sex, sil, build, stripes, lo]);
  if (_bodyCache.has(key)) return _bodyCache.get(key);
  const { P, J } = bodyPrims(sex, sil, bb);
  const sdf = buildSDF(P);
  const g = surfaceNets(sdf, [-0.5, -0.03, -0.42], [0.5, J.head[1] + 0.12, 0.42], lo ? 0.028 : 0.0145);
  const pos = g.attributes.position; const n = pos.count;
  const reg = new Float32Array(n), blush = new Float32Array(n), si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const { region, owner, t } = regionOf(P, x, y, z, sil, sex === 'f', J);
    reg[i] = region;
    if (stripes && (owner.bone.includes('Shoulder') || owner.bone.includes('Elbow')) && owner.type === 'cone' && owner.bone !== 'chest') { const band = Math.floor(t * 3.999) + (owner.bone.includes('Elbow') ? 4 : 0); reg[i] = [PAL.cuff, PAL.belt, PAL.armor, PAL.robe, PAL.wrap][band % 5]; }
    const ws = skinWeights(owner, t, x, y, z, J);
    ws.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v; });
  }
  g.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
  g.setAttribute('aBlush', new THREE.BufferAttribute(blush, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
  _bodyCache.set(key, g);
  return g;
}

// ---------- Head (head-bone local space; face looks +Z) ----------
const _headCache = new Map();
export function headGeometry(sex, age, lo = false) {
  const key = geoKey('head', [sex, age, lo]);
  if (_headCache.has(key)) return _headCache.get(key);
  const f = sex === 'f';
  const jaw = f ? 0.055 : 0.062;
  const P = [
    { type: 'ell', c: [0, 0.12, -0.008], r: [0.087, 0.105, 0.099], k: 0 }, // cranium
    { type: 'ell', c: [0, 0.074, 0.02], r: [jaw + 0.006, 0.066, 0.078], k: 0.03 }, // mid face
    { type: 'ell', c: [0, 0.042, 0.034], r: [jaw - 0.006, 0.05, 0.062], k: 0.03 }, // tapering jaw
    { type: 'ell', c: [0, 0.016, 0.06], r: [f ? 0.019 : 0.024, 0.021, 0.022], k: 0.026 }, // chin
    { type: 'ell', c: [0.045, 0.096, 0.064], r: [0.024, 0.017, 0.022], k: 0.02 }, // cheekbones
    { type: 'ell', c: [-0.045, 0.096, 0.064], r: [0.024, 0.017, 0.022], k: 0.02 },
    { type: 'cone', a: [-0.046, 0.139, 0.082], b: [0.046, 0.139, 0.082], r1: f ? 0.009 : 0.013, r2: f ? 0.009 : 0.013, k: 0.02 }, // brow ridge
    { type: 'cone', a: [0, 0.12, 0.093], b: [0, 0.085, f ? 0.104 : 0.108], r1: 0.0075, r2: f ? 0.011 : 0.013, k: 0.012 }, // nose bridge/tip
    { type: 'ell', c: [0.0105, 0.08, 0.097], r: [0.0095, 0.0075, 0.0085], k: 0.008 }, // nostrils
    { type: 'ell', c: [-0.0105, 0.08, 0.097], r: [0.0095, 0.0075, 0.0085], k: 0.008 },
    { type: 'ell', c: [0, 0.053, 0.0935], r: [f ? 0.0175 : 0.0185, f ? 0.0058 : 0.0048, 0.0095], k: 0.006, lip: true },
    { type: 'ell', c: [0, 0.0425, 0.0915], r: [f ? 0.0155 : 0.016, f ? 0.0072 : 0.0062, 0.0105], k: 0.006, lip: true },
    { type: 'ell', c: [0.086, 0.098, -0.004], r: [0.012, 0.028, 0.019], k: 0.012 }, // ears
    { type: 'ell', c: [-0.086, 0.098, -0.004], r: [0.012, 0.028, 0.019], k: 0.012 },
    { type: 'cone', a: [0, -0.1, -0.018], b: [0, 0.04, -0.014], r1: f ? 0.045 : 0.05, r2: f ? 0.04 : 0.045, k: 0.028 }, // neck
    // eye sockets
    { type: 'ell', c: [0.034, 0.112, 0.091], r: [0.0175, 0.0125, 0.0105], k: 0.008, sub: true },
    { type: 'ell', c: [-0.034, 0.112, 0.091], r: [0.0175, 0.0125, 0.0105], k: 0.008, sub: true },
    // mouth corners and the philtrum groove give the face expression
    { type: 'ell', c: [0, 0.0478, 0.1], r: [0.016, 0.0016, 0.006], k: 0.002, sub: true },
    { type: 'ell', c: [0, 0.066, 0.1], r: [0.0035, 0.007, 0.003], k: 0.003, sub: true },
  ];
  // lip parting line
  if (age === 'elder') P.push({ type: 'ell', c: [0, 0.032, 0.044], r: [0.056, 0.028, 0.04], k: 0.03 });
  const sdf = buildSDF(P);
  const g = surfaceNets(sdf, [-0.11, -0.1, -0.12], [0.11, 0.235, 0.135], lo ? 0.0085 : 0.0036);
  const pos = g.attributes.position; const n = pos.count;
  const reg = new Float32Array(n), blush = new Float32Array(n), lip = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ex = (x / 0.021) ** 2 + ((y - 0.0475) / 0.0115) ** 2;
    lip[i] = z > 0.087 && y > 0.034 ? clamp((1.0 - ex) * 2.2, 0, 1) : 0;
    const bd = Math.min(Math.hypot(x - 0.05, y - 0.08, z - 0.07), Math.hypot(x + 0.05, y - 0.08, z - 0.07));
    blush[i] = clamp(1 - bd / 0.028, 0, 1) * (f ? 0.8 : 0.25);
  }
  g.setAttribute('aRegion', new THREE.BufferAttribute(reg, 1));
  g.setAttribute('aBlush', new THREE.BufferAttribute(blush, 1));
  g.setAttribute('aLip', new THREE.BufferAttribute(lip, 1));
  _headCache.set(key, g);
  return g;
}

// ---------- Hair ----------
const _hairCache = new Map();
export function hairGeometry(style, lo = false) {
  const ck = geoKey('hair', [style, lo]);
  if (_hairCache.has(ck)) return _hairCache.get(ck);
  const P = [
    { type: 'ell', c: [0, 0.122, -0.012], r: [0.093, 0.112, 0.108], k: 0 },
  ];
  const sdfBase = buildSDF(P);
  const extra = [];
  if (style === 'topknot') extra.push({ type: 'ell', c: [0, 0.232, -0.012], r: [0.028, 0.036, 0.028], k: 0.02 }, { type: 'cone', a: [0, 0.2, -0.01], b: [0, 0.225, -0.01], r1: 0.034, r2: 0.022, k: 0.02 });
  if (style === 'bun') extra.push({ type: 'ell', c: [0, 0.07, -0.118], r: [0.052, 0.034, 0.034], k: 0.02 });
  if (style === 'braid') {
    extra.push({ type: 'ell', c: [0, 0.07, -0.105], r: [0.04, 0.04, 0.03], k: 0.03 });
    for (let i = 0; i < 9; i++) extra.push({ type: 'ell', c: [0, 0.03 - i * 0.04, -0.118 - Math.min(i, 3) * 0.01], r: [0.024 - i * 0.0008, 0.026, 0.02], k: 0.012 });
  }
  if (style === 'loose') extra.push({ type: 'cone', a: [0, 0.12, -0.08], b: [0, -0.12, -0.1], r1: 0.085, r2: 0.06, zs: 0.6, k: 0.04 });
  const sdfX = buildSDF(extra.length ? extra : [{ type: 'ell', c: [0, -9, 0], r: [0.01, 0.01, 0.01] }]);
  const female = style === 'bun' || style === 'braid';
  const sdf = (x, y, z) => {
    // hairline: shell is kept above a line that is high at the forehead and low at the nape
    let d = sdfBase(x, y, z);
    const front = clamp((z - 0.0) / 0.08, 0, 1);
    const thr = 0.152 + front * (0.026 * (1 - Math.min(1, (x / 0.075) ** 2))) - 0.11 * clamp((0.03 - z) / 0.13, 0, 1) - (Math.abs(x) > 0.07 && z > -0.02 && z < 0.05 ? -0.025 : 0);
    d = smax(d, thr - y, 0.012);
    // keep it a shell around the scalp (cut away the inside below the crown)
    d = smax(d, -ellipsoid(x, y, z, [0, 0.118, -0.008], [0.082, 0.1, 0.095]), 0.004);
    if (female && y > 0.17 && z > -0.04) d = smax(d, -(Math.abs(x) - 0.0016), 0.002); // center part
    // combed strands flowing back from the hairline
    const th = Math.atan2(x, z + 0.03);
    d += 0.0007 * Math.sin(th * 46 + y * 18) * clamp((y - 0.02) / 0.1, 0, 1);
    return smin(d, sdfX(x, y, z), 0.02);
  };
  const g = surfaceNets(sdf, [-0.115, -0.33, -0.17], [0.115, 0.285, 0.125], lo ? 0.0095 : 0.0042);
  _hairCache.set(ck, g);
  return g;
}

// ---------- Hands (rigid on hand bone; bone points -Y at rest, palm faces inward) ----------
const _handCache = new Map();
export function handGeometry(side, lo = false) {
  const ck = geoKey('hand', [side, lo]);
  if (_handCache.has(ck)) return _handCache.get(ck);
  const sx = side === 'l' ? 1 : -1; // palm faces -sx
  const P = [
    { type: 'ell', c: [0, -0.045, 0.004], r: [0.017, 0.045, 0.039], k: 0 }, // palm (flat in x)
    { type: 'cone', a: [0, 0.01, 0], b: [0, -0.03, 0.004], r1: 0.026, r2: 0.03, zs: 0.8, k: 0.02 }, // wrist
  ];
  const fingers = [[-0.026, 0.05], [-0.009, 0.056], [0.008, 0.053], [0.024, 0.045]];
  for (const [fz, len] of fingers) {
    const base = [0, -0.085, fz];
    const mid = [-sx * 0.012, -0.085 - len * 0.55, fz * 1.05];
    const tip = [-sx * 0.03, -0.085 - len * 0.85, fz * 1.08];
    P.push({ type: 'cone', a: base, b: mid, r1: 0.0095, r2: 0.0085, k: 0.008 }, { type: 'cone', a: mid, b: tip, r1: 0.0085, r2: 0.007, k: 0.006 });
  }
  P.push({ type: 'cone', a: [-sx * 0.006, -0.03, 0.03], b: [-sx * 0.018, -0.065, 0.048], r1: 0.012, r2: 0.0095, k: 0.012 }, { type: 'cone', a: [-sx * 0.018, -0.065, 0.048], b: [-sx * 0.028, -0.09, 0.05], r1: 0.0095, r2: 0.008, k: 0.006 });
  const sdf = buildSDF(P);
  const g = surfaceNets(sdf, [-0.06, -0.17, -0.06], [0.06, 0.03, 0.08], lo ? 0.0075 : 0.0032);
  const n = g.attributes.position.count;
  g.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aBlush', new THREE.BufferAttribute(new Float32Array(n), 1));
  _handCache.set(ck, g);
  return g;
}

export function silhouetteFor(sex, outfit) {
  if (outfit === 'child') return sex === 'f' ? 'chima' : 'pants';
  if (outfit === 'royal') return 'robe';
  if (outfit === 'police') return 'pants';
  if (outfit === 'queen') return 'chima';
  if (sex === 'f') return ['warriorF', 'bandit'].includes(outfit) ? 'pants' : 'chima';
  if (outfit === 'soldier' || outfit === 'general') return 'armor';
  if (['noble', 'scholar', 'monk', 'wanderer'].includes(outfit)) return 'robe';
  return 'pants';
}

// ---------- Eyes: textured iris, wet cornea ----------
const _irisTex = new Map();
export function irisTexture(color) {
  if (_irisTex.has(color)) return _irisTex.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const base = new THREE.Color(color);
  const css = (k) => `rgb(${Math.round(base.r * 255 * k)},${Math.round(base.g * 255 * k)},${Math.round(base.b * 255 * k)})`;
  g.fillStyle = '#ece6de'; g.fillRect(0, 0, 128, 128);
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, css(1.5)); grd.addColorStop(0.45, css(1.1)); grd.addColorStop(0.85, css(0.75)); grd.addColorStop(1, css(0.25));
  g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  for (let i = 0; i < 140; i++) { const a = Math.random() * 6.283; const r0 = 16 + Math.random() * 6, r1 = 40 + Math.random() * 20; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,220,170' : '20,10,5'},${0.12 + Math.random() * 0.18})`; g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a + 0.05) * r1, 64 + Math.sin(a + 0.05) * r1); g.stroke(); }
  g.strokeStyle = 'rgba(10,6,4,0.85)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke();
  g.fillStyle = '#050303'; g.beginPath(); g.arc(64, 64, 19, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _irisTex.set(color, t); return t;
}
export const corneaMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.05, clearcoat: 1, clearcoatRoughness: 0.0, specularIntensity: 1, depthWrite: false });


// ---------- Geometry cache plumbing (workers + IndexedDB) ----------
// Bump when any sculpt changes, so stale cached meshes are thrown away.
export const GEO_VERSION = 4;
export function geoKey(fn, a) {
  if (fn === 'body') { const [sex, sil, build, stripes = false, lo = false] = a; const bb = stripes ? 1.0 : build > 1.02 ? 1.08 : 0.96; return `${sex}|${sil}|${bb}|${!!stripes}|${!!lo}`; }
  if (fn === 'head') return a[0] + a[1] + (a[2] ? 'lo' : '');
  return a[0] + (a[1] ? 'lo' : '');
}
const CACHES = { body: _bodyCache, head: _headCache, hair: _hairCache, hand: _handCache };
export const GEO_FNS = { body: (a) => bodyGeometry(...a), head: (a) => headGeometry(...a), hair: (a) => hairGeometry(...a), hand: (a) => handGeometry(...a) };
export function hasGeo(fn, a) { return CACHES[fn].has(geoKey(fn, a)); }
export function seedGeo(fn, a, g) { CACHES[fn].set(geoKey(fn, a), g); }
export function packGeo(g) {
  const attrs = {}; const transfer = [];
  for (const [k, at] of Object.entries(g.attributes)) { const arr = at.array.slice(); attrs[k] = [arr, at.itemSize, at.normalized]; transfer.push(arr.buffer); }
  let index = null; if (g.index) { index = g.index.array.slice(); transfer.push(index.buffer); }
  const bs = g.boundingSphere ? [g.boundingSphere.center.x, g.boundingSphere.center.y, g.boundingSphere.center.z, g.boundingSphere.radius] : null;
  return { d: { attrs, index, bs }, transfer };
}
export function unpackGeo(d) {
  const g = new THREE.BufferGeometry();
  for (const [k, [arr, size, norm]] of Object.entries(d.attrs)) g.setAttribute(k, arr instanceof Uint16Array && k === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, size) : new THREE.BufferAttribute(arr, size, norm));
  if (d.index) g.setIndex(new THREE.BufferAttribute(d.index, 1));
  if (d.bs) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(d.bs[0], d.bs[1], d.bs[2]), d.bs[3]); else g.computeBoundingSphere();
  return g;
}
// every mesh variant the game can ask for (full and low detail)
export function allGeoJobs() {
  const J = [];
  for (const lo of [false, true]) {
    for (const sex of ['m', 'f']) {
      for (const sil of sex === 'f' ? ['chima', 'pants'] : ['pants', 'robe', 'armor']) for (const build of [1.0, 1.1]) J.push(['body', [sex, sil, build, false, lo]]);
      J.push(['body', [sex, sex === 'f' ? 'chima' : 'pants', 1, true, lo]]);
      for (const age of ['child', 'young', 'adult', 'elder']) J.push(['head', [sex, age, lo]]);
    }
    for (const st of ['topknot', 'bun', 'braid', 'loose']) J.push(['hair', [st, lo]]);
    for (const side of ['l', 'r']) J.push(['hand', [side, lo]]);
  }
  return J;
}
