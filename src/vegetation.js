import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, rr, pick, chance, fbm, smoothstep, mulberry32 } from './noise.js';
import { heightAt, roadDist, riverDist, slopeAt, WATER_LEVEL, LAYOUT, WORLD_HALF } from './terrain.js';
import { SEASON_U, SEASON_GLSL } from './season.js';

export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWindStrength: { value: 1 },
  uPlayer: { value: new THREE.Vector3(9999, 0, 9999) },
};

// ---------- Shader injection ----------
const SEASON_VS = {
  grass: 'transformed.y *= mix(1.0, 0.3, uWinter) * (1.0 + uSummer * 0.2);',
  rice: 'transformed.y *= uSpring * 0.45 + uSummer * 1.05 + uAutumn + uWinter * 0.12;',
  pampas: 'transformed.y *= uSpring * 0.45 + uSummer * 0.85 + uAutumn + uWinter * 0.75;',
  flower: 'transformed *= uSpring * 1.1 + uSummer * 0.75 + uAutumn + uWinter * 0.0;',
  tree: '',
};
const SEASON_FS = {
  grass: `{ vec3 o = diffuseColor.rgb; float l = dot(o, vec3(0.333));
    vec3 spr = vec3(0.38, 0.64, 0.2) * (0.55 + l * 1.2); vec3 sum = vec3(0.24, 0.47, 0.14) * (0.55 + l * 1.2); vec3 win = vec3(0.6, 0.55, 0.42) * (0.55 + l);
    diffuseColor.rgb = spr * uSpring + sum * uSummer + o * uAutumn + win * uWinter;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 1.0), uSnow * 0.8 * (1.0 - vH * 0.4)); }`,
  rice: `{ vec3 o = diffuseColor.rgb; float l = dot(o, vec3(0.333));
    diffuseColor.rgb = vec3(0.45, 0.75, 0.25) * (0.6 + l) * uSpring + vec3(0.28, 0.55, 0.16) * (0.6 + l) * uSummer + o * uAutumn + vec3(0.55, 0.45, 0.3) * (0.6 + l) * uWinter;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 1.0), uSnow * 0.8); }`,
  pampas: `{ vec3 o = diffuseColor.rgb; float l = dot(o, vec3(0.333));
    diffuseColor.rgb = vec3(0.42, 0.62, 0.24) * (0.5 + l) * (uSpring + uSummer) + o * uAutumn + mix(o, vec3(0.78, 0.76, 0.72), 0.6) * uWinter;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.95, 1.0), uSnow * 0.5); }`,
  flower: `{ vec3 o = diffuseColor.rgb; diffuseColor.rgb = mix(o, vec3(0.88, 0.3, 0.58), uSpring * 0.45); }`,
  tree: `{ vec3 o = diffuseColor.rgb; float l = clamp(dot(o, vec3(0.333)) * 2.4, 0.45, 1.35);
    if (vLeaf > 1.5 && vLeaf < 2.5) {
      // deciduous: blossoms & fresh leaves -> deep green -> autumn colour -> bare
      vec3 blossom = mix(vec3(1.0, 0.6, 0.72), vec3(1.0, 0.86, 0.9), step(0.72, vRand));
      vec3 spr = mix(blossom, vec3(0.6, 0.82, 0.36), step(0.45, vRand)) * l;
      vec3 sum = vec3(0.26, 0.46, 0.16) * (0.75 + vRand * 0.5) * l;
      vec3 win = vec3(0.42, 0.32, 0.22) * l;
      diffuseColor.rgb = spr * uSpring + sum * uSummer + o * uAutumn + win * uWinter;
      if (vRand < uWinter * 0.93) discard;
    } else if (vLeaf > 0.5 && vLeaf < 1.5) {
      diffuseColor.rgb = o * (1.0 + uSpring * 0.12 + uSummer * 0.05 - uWinter * 0.12);
    }
    float sn = uSnow * smoothstep(0.25, 0.8, vUpN);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0), sn * (vLeaf > 0.5 ? 0.85 : 0.6)); }`,
};

function windMaterial(base, opts) {
  const { bladeH = 1, amp = 0.35, trample = true, tree = false, shimmer = 0, season = tree ? 'tree' : 'grass' } = opts;
  base.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms, SEASON_U);
    sh.uniforms.uBladeH = { value: bladeH };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform vec2 uWindDir; uniform float uWindStrength; uniform vec3 uPlayer; uniform float uBladeH;
      varying float vH; varying float vGust;
      ${SEASON_GLSL}
      attribute float aLeaf; attribute float aRand; varying float vLeaf; varying float vRand; varying float vUpN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLeaf = aLeaf; vRand = aRand; vUpN = normal.y;
        ${SEASON_VS[season] || ''}`)
      .replace('#include <project_vertex>', `
      #ifdef USE_INSTANCING
        vec4 gwp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vec4 groot = modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0);
      #else
        vec4 gwp = modelMatrix * vec4(transformed, 1.0);
        vec4 groot = modelMatrix * vec4(0.0,0.0,0.0,1.0);
      #endif
        float hh = clamp(position.y / uBladeH, 0.0, 1.0);
        float bend = hh * hh;
        float wave = sin(dot(groot.xz, uWindDir) * 0.045 - uTime * 1.9) * 0.5 + 0.5;
        float gust = pow(wave, 3.0);
        float flutter = sin(uTime * 2.3 + groot.x * 0.37 + groot.z * 0.21) * 0.35 + sin(uTime * 4.1 + groot.z * 0.6) * 0.15;
        float s = uWindStrength * (0.35 + gust * 1.1);
        ${tree ? 'flutter *= 0.4; s *= 0.35; bend = hh*hh*0.6 + sin(uTime*5.0+position.x*3.0+position.z*2.0)*0.02*hh;' : ''}
        vec2 off = uWindDir * (s + flutter * 0.6) * ${amp.toFixed(3)} * bend;
        off += vec2(-uWindDir.y, uWindDir.x) * flutter * 0.25 * ${amp.toFixed(3)} * bend;
        ${trample ? `vec2 dp = groot.xz - uPlayer.xz; float dl = length(dp);
        off += normalize(dp + 0.0001) * (1.0 - smoothstep(0.0, 1.6, dl)) * hh * 0.7;` : ''}
        gwp.xz += off * ${tree ? '1.0' : 'uBladeH'};
        gwp.y -= length(off) * hh * 0.25;
        vH = hh; vGust = gust * min(uWindStrength, 2.0);
        vec4 mvPosition = viewMatrix * gwp;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = gwp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH; varying float vGust; varying float vLeaf; varying float vRand; varying float vUpN;\n' + SEASON_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 + vGust * vH * ${shimmer.toFixed(3)};
        ${SEASON_FS[season] || ''}`);
  };
  base.customProgramCacheKey = () => `wind-${bladeH}-${amp}-${trample}-${tree}-${shimmer}-${season}`;
  return base;
}

function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv === undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
export { colorize };

// ---------- Chunked instancing ----------
export function chunkedInstances(geo, mat, items, { chunk = 60, castShadow = false, receiveShadow = true, name = '', target = 110 } = {}) {
  const group = new THREE.Group(); group.name = name;
  if (!items.length) return group;
  // Chunking exists so the camera can throw away a whole patch at once, but a chunk holding four trees
  // costs a full draw call to save almost nothing: the valley's 2,688 trees were going out as 560 draws.
  // Grow the chunk until each one carries roughly `target` instances, never below the caller's size (so
  // dense close-range things like grass stay finely culled) and never so large that culling stops working.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const it of items) { if (it.x < minX) minX = it.x; if (it.x > maxX) maxX = it.x; if (it.z < minZ) minZ = it.z; if (it.z > maxZ) maxZ = it.z; }
  const area = Math.max(1, (maxX - minX) * (maxZ - minZ));
  chunk = Math.min(400, Math.max(chunk, Math.sqrt((area * target) / items.length)));
  const buckets = new Map();
  for (const it of items) {
    const key = Math.floor(it.x / chunk) + ',' + Math.floor(it.z / chunk);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (const [, list] of buckets) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
      s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
      p.set(it.x, it.y, it.z);
      m.compose(p, q, s); im.setMatrixAt(i, m);
      if (it.color) im.setColorAt(i, it.color);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = castShadow; im.receiveShadow = receiveShadow;
    im.userData.full = list.length;
    group.add(im);
  }
  return group;
}

// ---------- Grass ----------
function bladeClump(blades = 3, h = 1, w = 0.09, segs = 3, curve = 0.25, spread = 0.3) {
  const geos = [];
  const r = mulberry32(7);
  for (let b = 0; b < blades; b++) {
    const pos = [], col = [], nor = [], uv = [];
    const ox = (r() - 0.5) * spread, oz = (r() - 0.5) * spread, rot = r() * Math.PI, bh = h * (0.7 + r() * 0.5);
    const lean = (r() - 0.5) * 0.4;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const verts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = t * bh, ww = w * (1 - t * 0.92);
      const fwd = curve * t * t * bh + lean * t;
      for (const side of [-1, 1]) {
        const lx = side * ww * 0.5, lz = fwd;
        verts.push([ox + lx * cs - lz * sn, y, oz + lx * sn + lz * cs, t]);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = verts[i * 2], bb = verts[i * 2 + 1], c = verts[i * 2 + 2], d = verts[i * 2 + 3];
      for (const v of [a, c, bb, bb, c, d]) {
        pos.push(v[0], v[1], v[2]); nor.push(0, 1, 0); uv.push(0, v[3]);
        const sh = 0.35 + v[3] * 0.85; col.push(sh, sh, sh);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function pampasClump() {
  const geos = [bladeClump(6, 1.6, 0.05, 4, 0.5, 0.5)];
  // plumes
  const r = mulberry32(11);
  for (let i = 0; i < 4; i++) {
    const plume = new THREE.ConeGeometry(0.07, 0.65, 5, 3);
    plume.rotateZ(Math.PI); // point down then bend
    plume.rotateX(-0.5 - r() * 0.4); plume.rotateY(r() * 6.28);
    const x = (r() - 0.5) * 0.4, z = (r() - 0.5) * 0.4;
    plume.translate(x, 2.0 + r() * 0.4, z);
    const stem = new THREE.CylinderGeometry(0.008, 0.012, 2.1, 3); stem.translate(x * 0.7, 1.05, z * 0.7);
    geos.push(colorize(plume, '#f3e6c4'), colorize(stem, '#9c8550'));
  }
  const g = mergeGeometries(geos.map((x) => { const y = x.index ? x.toNonIndexed() : x; if (!y.attributes.color) colorize(y, '#ffffff'); return y; }));
  // normals up for soft lighting
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function riceClump() {
  const g = bladeClump(5, 0.85, 0.05, 3, 0.55, 0.25);
  const head = new THREE.SphereGeometry(0.05, 4, 3); head.scale(1, 2.2, 1);
  const heads = [];
  const r = mulberry32(5);
  for (let i = 0; i < 4; i++) { const h = head.clone(); h.rotateX(1.0); h.translate((r() - 0.5) * 0.2, 0.85 + r() * 0.1, 0.18 + r() * 0.1); heads.push(colorize(h, '#ffffff')); }
  const geo = mergeGeometries([g, ...heads]);
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return geo;
}

function cosmosFlower() {
  const stem = colorize(new THREE.CylinderGeometry(0.008, 0.01, 0.8, 3).translate(0, 0.4, 0), '#4f6a2a');
  const petals = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.PlaneGeometry(0.05, 0.11).translate(0, 0.07, 0).rotateX(-Math.PI / 2 + 0.25).rotateY(i / 8 * Math.PI * 2);
    p.translate(0, 0.8, 0); petals.push(colorize(p, '#ffffff'));
  }
  const center = colorize(new THREE.SphereGeometry(0.025, 5, 3).translate(0, 0.81, 0), '#d9a520');
  const g = mergeGeometries([stem, ...petals, center]);
  // stem should not take instance color -> encode via darker vertex colors
  return g;
}

export function buildVegetation(scene, isBlocked, quality) {
  const out = { meshes: [] };
  const dens = quality === 'high' ? 1 : 0.6;

  // GRASS
  const grassGeo = bladeClump(5, 0.9, 0.09, 3, 0.3, 0.6);
  const grassMat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 }), { bladeH: 0.9, amp: 0.5, shimmer: 0.35 });
  const grass = [];
  const cA = new THREE.Color('#5b7a2c'), cB = new THREE.Color('#b0a04a'), cC = new THREE.Color('#8a9a3a'), cD = new THREE.Color('#c08a3a');
  const R = 300, step = 1.2 / Math.sqrt(dens);
  for (let z = -R; z < R; z += step) for (let x = -R; x < R; x += step) {
    const px = x + (rand() - 0.5) * step * 1.4, pz = z + (rand() - 0.5) * step * 1.4;
    const d = Math.hypot(px, pz);
    if (d > R) continue;
    const density = d < 180 ? 1 : 1 - smoothstep(180, R, d);
    if (rand() > density * (0.55 + fbm(px * 0.03, pz * 0.03, 2) * 0.6)) continue;
    const h = heightAt(px, pz);
    if (h < WATER_LEVEL + 0.4 || h > 30) continue;
    if (roadDist(px, pz) < 2.6) continue;
    if (Math.hypot(px, pz) < 24) continue;
    const p = LAYOUT.paddies; if (px > p.x0 - 2 && px < p.x1 + 2 && pz > p.z0 - 2 && pz < p.z1 + 2) continue;
    if (slopeAt(px, pz) > 0.9) continue;
    if (isBlocked(px, pz, 0.6)) continue;
    const n = fbm(px * 0.01 + 20, pz * 0.01, 3) * 0.5 + 0.5;
    const col = cA.clone().lerp(cB, smoothstep(0.35, 0.75, n)).lerp(cC, rand() * 0.3);
    if (rand() < 0.08) col.lerp(cD, 0.6);
    const rdist = roadDist(px, pz);
    const meadow = smoothstep(30, 90, d) * smoothstep(3, 14, rdist);
    const tall = (0.45 + n * 0.55 + rand() * 0.25) * (0.75 + meadow * 0.9);
    grass.push({ x: px, y: h - 0.05, z: pz, ry: rand() * 6.28, s: 1, sy: tall, color: col });
  }
  const grassGroup = chunkedInstances(grassGeo, grassMat, grass, { chunk: 40, name: 'grass' });
  scene.add(grassGroup); out.grass = grassGroup;

  // PAMPAS (silver grass fields)
  const pGeo = pampasClump();
  const pMat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), { bladeH: 2.2, amp: 0.45, shimmer: 0.5, season: 'pampas' });
  const pampas = [];
  for (const [cx, cz, r] of LAYOUT.pampas) {
    const n = Math.floor(r * r * 0.9 * dens);
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.28, rd = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * rd, z = cz + Math.sin(a) * rd;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 0.4 || roadDist(x, z) < 2.4 || isBlocked(x, z, 0.8)) continue;
      const edge = rd / r; if (rand() < edge * edge * 0.8) continue;
      pampas.push({ x, y: h - 0.05, z, ry: rand() * 6.28, s: 0.62 + rand() * 0.32, color: new THREE.Color('#d8c08a').lerp(new THREE.Color('#f0e6cf'), rand()) });
    }
  }
  const pampasGroup = chunkedInstances(pGeo, pMat, pampas, { chunk: 40, name: 'pampas' });
  scene.add(pampasGroup); out.pampas = pampasGroup;

  // RICE
  const rGeo = riceClump();
  const rMat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), { bladeH: 0.95, amp: 0.3, shimmer: 0.4, season: 'rice' });
  const rice = [];
  const P = LAYOUT.paddies;
  for (let z = P.z0 + 1; z < P.z1 - 1; z += 0.85) for (let x = P.x0 + 1; x < P.x1 - 1; x += 0.85) {
    const lx = ((x - P.x0) % 24), lz = ((z - P.z0) % 24);
    if (Math.abs(lx - 12) > 10.6 || Math.abs(lz - 12) > 10.6) continue;
    if (roadDist(x, z) < 2.8) continue;
    rice.push({ x: x + (rand() - .5) * .2, y: heightAt(x, z) - 0.05, z: z + (rand() - .5) * .2, ry: rand() * 6.28, s: 1, sy: 0.9 + rand() * 0.25, color: new THREE.Color('#c9a640').lerp(new THREE.Color('#a8963a'), rand() * 0.6) });
  }
  const riceGroup = chunkedInstances(rGeo, rMat, rice, { chunk: 40, name: 'rice' });
  scene.add(riceGroup); out.rice = riceGroup;

  // COSMOS FLOWERS along roads & meadows
  const fGeo = cosmosFlower();
  const fMat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 }), { bladeH: 0.85, amp: 0.4, season: 'flower' });
  const flowers = [];
  const fcols = ['#f2a7c3', '#e05a9a', '#ffffff', '#f7c6d9', '#c2387a'];
  for (let i = 0; i < 9000 * dens; i++) {
    const x = rr(-220, 220), z = rr(-220, 220);
    const rd = roadDist(x, z);
    const near = rd > 2.6 && rd < 7;
    if (!near && rand() > 0.12) continue;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 0.5 || h > 20 || isBlocked(x, z, 0.5) || Math.hypot(x, z) < 24) continue;
    const p = LAYOUT.paddies; if (x > p.x0 - 2 && x < p.x1 + 2 && z > p.z0 - 2 && z < p.z1 + 2) continue;
    flowers.push({ x, y: h, z, ry: rand() * 6.28, s: 0.8 + rand() * 0.5, color: new THREE.Color(pick(fcols)) });
  }
  const flowerGroup = chunkedInstances(fGeo, fMat, flowers, { chunk: 50, name: 'flowers' });
  scene.add(flowerGroup); out.flowers = flowerGroup;

  out.update = (camPos) => {
    for (const g of [grassGroup, flowerGroup, pampasGroup, riceGroup]) {
      for (const im of g.children) {
        const c = im.boundingSphere.center;
        const d = Math.hypot(c.x - camPos.x, c.z - camPos.z);
        im.visible = d < (g === pampasGroup ? 320 : 230);
        if (im.visible) im.count = d < 90 ? im.userData.full : Math.floor(im.userData.full * (d < 150 ? 0.55 : 0.28));
      }
    }
  };
  return out;
}

// ---------- Trees ----------
// Foliage = darker inner volume + alpha-tested leaf cards (atlas: leaves | needles | solid)
const SOLID_UV = [0.985, 0.5];
let _atlas = null;
function leafAtlas() {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const r = mulberry32(77);
  // broad leaves (maple-like stars + ellipses)
  for (let i = 0; i < 95; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 190;
    const x = 245 + Math.cos(a) * d, y = 256 + Math.sin(a) * d, s = 22 + r() * 26, rot = r() * 6.28;
    const v = Math.floor(170 + r() * 85);
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    if (r() < 0.6) { for (let k = 0; k < 10; k++) { const ang = (k / 10) * Math.PI * 2; const rad = k % 2 ? s * 0.42 : s; g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); } }
    else g.ellipse(0, 0, s, s * 0.5, 0, 0, 7);
    g.closePath(); g.fill();
    g.strokeStyle = `rgba(0,0,0,0.25)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-s * 0.8, 0); g.lineTo(s * 0.8, 0); g.stroke();
    g.restore();
  }
  // needle tufts
  for (let t = 0; t < 26; t++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 150;
    const cx = 757 + Math.cos(a) * d, cy = 256 + Math.sin(a) * d;
    for (let k = 0; k < 26; k++) {
      const ang = r() * Math.PI * 2, L = 30 + r() * 50; const v = Math.floor(160 + r() * 95);
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 2 + r() * 1.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L * 0.8); g.stroke();
    }
  }
  g.fillStyle = '#fff'; g.fillRect(1000, 0, 24, 512);
  _atlas = new THREE.CanvasTexture(c); _atlas.colorSpace = THREE.SRGBColorSpace; _atlas.anisotropy = 4;
  return _atlas;
}
let _treeMat = null;
export function treeMaterial() {
  if (_treeMat) return _treeMat;
  _treeMat = windMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, map: leafAtlas(), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }), { bladeH: 14, amp: 0.4, trample: false, tree: true });
  return _treeMat;
}

function setUV(g, u, v) { const n = g.attributes.position.count; const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }

let LEAF_TYPE = 2;
function setLeafAttrs(g, type, rnd) { const n = g.attributes.position.count; g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(n).fill(type), 1)); g.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(n).fill(rnd), 1)); return g; }
function blob(r, detail, seed, color, squashY = 1, kind = 'leaf', cards = 12) {
  const g = new THREE.IcosahedronGeometry(r * 0.78, detail);
  const rnd = mulberry32(seed);
  const pos = g.attributes.position; const nor = g.attributes.normal;
  const off = rnd() * 100;
  const base = new THREE.Color(color);
  const col = new Float32Array(pos.count * 3); const t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + fbm(x * 0.9 + off, z * 0.9 + y * 0.7, 2) * 0.3;
    pos.setXYZ(i, x * n, y * n * squashY, z * n);
    const v = new THREE.Vector3(x, y * 0.6 + r * 0.4, z).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    t.copy(base).multiplyScalar(0.5 + (y / r * 0.5 + 0.5) * 0.3);
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  setUV(g, SOLID_UV[0], SOLID_UV[1]);
  const bRand = mulberry32(seed * 7 + 3)();
  setLeafAttrs(g, kind === 'needle' ? 1 : LEAF_TYPE, bRand);
  if (kind === 'none') return g;
  // leaf cards
  const P = [], N = [], U = [], C = [];
  const [u0, u1] = kind === 'needle' ? [0.5, 0.975] : [0.0, 0.478];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), d = new THREE.Vector3(), nn = new THREE.Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < cards; i++) {
    d.set(rnd() * 2 - 1, (rnd() * 2 - 1) * (kind === 'needle' ? 0.5 : 1), rnd() * 2 - 1).normalize();
    const cp = d.clone().multiplyScalar(r * (0.55 + rnd() * 0.35)); cp.y *= squashY;
    const size = r * (0.85 + rnd() * 0.45);
    e.set(kind === 'needle' ? (rnd() - 0.5) * 0.9 - Math.PI / 2 : rnd() * 6.28, rnd() * 6.28, kind === 'needle' ? (rnd() - 0.5) * 0.6 : rnd() * 6.28); q.setFromEuler(e);
    nn.copy(d).add(new THREE.Vector3(0, 0.5, 0)).normalize();
    const shade = 0.78 + (d.y * 0.5 + 0.5) * 0.4 + (rnd() - 0.5) * 0.12;
    t.copy(base).multiplyScalar(shade);
    const vs = corners.map(([a, b]) => new THREE.Vector3(a * size, b * size, 0).applyQuaternion(q).add(cp));
    for (const k of [0, 1, 2, 0, 2, 3]) {
      P.push(vs[k].x, vs[k].y, vs[k].z); N.push(nn.x, nn.y, nn.z); C.push(t.r, t.g, t.b);
      U.push(corners[k][0] > 0 ? u1 : u0, corners[k][1] > 0 ? 1 : 0);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); cg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  cg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); cg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  setLeafAttrs(cg, kind === 'needle' ? 1 : LEAF_TYPE, bRand);
  const out = mergeGeometries([g, cg]);
  out.userData.keepUV = true;
  return out;
}

function branch(points, r0, r1, color, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const tubular = Math.max(4, points.length * 3);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  // taper
  const pos = g.attributes.position;
  const tmp = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular; const c = curve.getPointAt(t); const rad = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      tmp.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(k, tmp.x, tmp.y, tmp.z);
    }
  }
  g.computeVertexNormals();
  return colorize(g, color);
}

function finalize(geos) {
  const list = geos.map((g) => { const keep = g.userData.keepUV; const x = g.index ? g.toNonIndexed() : g; if (!keep) setUV(x, SOLID_UV[0], SOLID_UV[1]); if (!x.attributes.aLeaf) setLeafAttrs(x, x.userData.fruit ? 3 : 0, 0); return x; });
  return mergeGeometries(list);
}

export function makePine(seed) {
  LEAF_TYPE = 1;
  const r = mulberry32(seed);
  const H = 8 + r() * 6;
  const pts = [[0, 0, 0]]; let x = 0, z = 0;
  for (let i = 1; i <= 5; i++) { x += (r() - 0.5) * 1.6; z += (r() - 0.5) * 1.6; pts.push([x, H * i / 5, z]); }
  const geos = [branch(pts, 0.38, 0.12, '#6e3b26', 7)];
  const padCols = ['#3a5a30', '#44663a', '#35522c'];
  const nb = 4 + Math.floor(r() * 4);
  for (let i = 0; i < nb; i++) {
    const t = 0.45 + r() * 0.5; const base = pts[Math.min(5, Math.round(t * 5))];
    const a = r() * 6.28, L = 1.5 + r() * 2.5;
    const end = [base[0] + Math.cos(a) * L, base[1] + 0.3 + r() * 1.0, base[2] + Math.sin(a) * L];
    geos.push(branch([base, [(base[0] + end[0]) / 2, base[1] + 0.6, (base[2] + end[2]) / 2], end], 0.14, 0.05, '#5e3220', 4));
    const pad = blob(1.3 + r() * 0.8, 1, seed * 10 + i, pick(padCols), 0.42, 'needle', 14); pad.scale(1.25, 1, 1.25); pad.translate(end[0], end[1] + 0.25, end[2]);
    geos.push(pad);
  }
  const top = blob(1.6 + r() * 0.6, 1, seed * 7, pick(padCols), 0.45, 'needle', 16); top.translate(pts[5][0], H + 0.3, pts[5][2]);
  geos.push(top);
  LEAF_TYPE = 2;
  return { geo: finalize(geos), h: H + 1 };
}

export function makeBroadleaf(seed, colors, opts = {}) {
  const r = mulberry32(seed);
  const H = (opts.h ?? 5) + r() * 2;
  const trunk = branch([[0, 0, 0], [(r() - .5) * .5, H * 0.5, (r() - .5) * .5], [(r() - .5), H, (r() - .5)]], opts.r0 ?? 0.3, 0.14, opts.bark ?? '#4a3428', 6);
  const geos = [trunk];
  const crown = [0, H + (opts.crownLift ?? 1.2), 0];
  const nBranch = 3 + Math.floor(r() * 2);
  for (let i = 0; i < nBranch; i++) {
    const a = i / nBranch * 6.28 + r(); const L = 1.5 + r() * 1.5;
    geos.push(branch([[0, H * 0.7, 0], [Math.cos(a) * L * 0.5, H * 0.95, Math.sin(a) * L * 0.5], [Math.cos(a) * L, H + 0.8 + r(), Math.sin(a) * L]], 0.12, 0.05, opts.bark ?? '#4a3428', 4));
  }
  const nb = opts.blobs ?? 11;
  const spread = opts.spread ?? 2.6;
  for (let i = 0; i < nb; i++) {
    const a = r() * 6.28, rd = r() * spread, yy = (r() - 0.3) * (opts.tall ?? 2.2);
    const b = blob((opts.blobR ?? 1.3) + r() * 0.8, 1, seed * 13 + i, pick(colors), opts.squash ?? 0.85);
    const coneK = opts.cone ? (1 - (yy + 1) / 4) : 1;
    b.translate(crown[0] + Math.cos(a) * rd * coneK, crown[1] + yy, crown[2] + Math.sin(a) * rd * coneK);
    geos.push(b);
  }
  if (opts.fruit) {
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, rd = 1.2 + r() * spread, yy = (r() - 0.3) * 2.6;
      { const fg = colorize(new THREE.SphereGeometry(0.11, 6, 4).translate(Math.cos(a) * rd, crown[1] + yy, Math.sin(a) * rd), '#ff7a12'); fg.userData.fruit = true; geos.push(fg); }
    }
  }
  return { geo: finalize(geos), h: H + 3 };
}

export function makeBamboo(seed) {
  LEAF_TYPE = 1;
  const r = mulberry32(seed);
  const H = 9 + r() * 4;
  const geos = [];
  const stalk = new THREE.CylinderGeometry(0.07, 0.09, H, 6, 12, true); stalk.translate(0, H / 2, 0);
  // node rings darker via color per vertex
  const c = new Float32Array(stalk.attributes.position.count * 3);
  for (let i = 0; i < stalk.attributes.position.count; i++) {
    const y = stalk.attributes.position.getY(i); const node = (y % (H / 12)) < 0.12 ? 0.75 : 1;
    const col = new THREE.Color('#7e9a3e').lerp(new THREE.Color('#a8b05a'), y / H).multiplyScalar(node);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  stalk.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geos.push(stalk);
  for (let i = 0; i < 9; i++) {
    const y = H * (0.55 + r() * 0.45);
    const b = blob(0.7 + r() * 0.5, 0, seed + i * 3, pick(['#6f9a3a', '#8ab048', '#5f8a32']), 0.35, 'leaf', 6);
    b.scale(1.6, 1, 0.8); b.rotateY(r() * 6.28);
    const a = r() * 6.28; b.translate(Math.cos(a) * 0.9, y, Math.sin(a) * 0.9);
    geos.push(b);
  }
  LEAF_TYPE = 2;
  return { geo: finalize(geos), h: H };
}

export function makeRock(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const r = mulberry32(seed); const off = r() * 50;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 1 + fbm(x * 1.3 + off, z * 1.3 + y, 3) * 0.45;
    pos.setXYZ(i, x * n * 1.3, y * n * 0.75, z * n);
  }
  g.computeVertexNormals();
  return colorize(g, '#8e8a82');
}

export function buildTrees(scene, isBlocked, quality, reserved) {
  const treeMat = treeMaterial();
  const types = {
    pine: [1, 2, 3, 4].map((s) => makePine(s * 31)),
    maple: [1, 2, 3].map((s) => makeBroadleaf(s * 17, ['#b8321e', '#d0521c', '#a3201a', '#c9411f'], { h: 4, blobs: 13 })),
    mapleGold: [1, 2].map((s) => makeBroadleaf(s * 23, ['#d88a1c', '#c96a14', '#e0a12a'], { h: 4, blobs: 12 })),
    ginkgo: [1, 2].map((s) => makeBroadleaf(s * 41, ['#e8be2c', '#f0cc3a', '#d9a920'], { h: 7, blobs: 14, cone: true, tall: 4, spread: 2.2, bark: '#5a4a3c' })),
    persimmon: [1, 2].map((s) => makeBroadleaf(s * 53, ['#7d8a3a', '#a08a32', '#8a7a2e'], { h: 4, blobs: 8, blobR: 0.9, fruit: true, bark: '#3e2e24' })),
    green: [1, 2].map((s) => makeBroadleaf(s * 61, ['#4d6b2c', '#5d7a32', '#3f5c28'], { h: 5, blobs: 12 })),
    bamboo: [1, 2, 3].map((s) => makeBamboo(s * 71)),
  };
  const placed = {};
  for (const k in types) placed[k] = types[k].map(() => []);
  const all = [];
  const place = (type, x, z, s = 1) => {
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 0.6) return false;
    if (roadDist(x, z) < 4) return false;
    if (isBlocked(x, z, 2.5)) return false;
    for (const rv of reserved) if (Math.hypot(x - rv[0], z - rv[1]) < rv[2]) return false;
    const vi = Math.floor(rand() * types[type].length);
    placed[type][vi].push({ x, y: h - 0.2, z, ry: rand() * 6.28, s: s * (0.8 + rand() * 0.45) });
    all.push({ x, z, r: type === 'bamboo' ? 0.15 : 0.5 * s, type });
    return true;
  };
  const dens = quality === 'high' ? 1 : 0.7;
  // mountain forests
  for (let i = 0; i < 2600 * dens; i++) {
    const a = rand() * 6.28, d = 170 + Math.sqrt(rand()) * 300;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
    const h = heightAt(x, z);
    if (h > 95 || slopeAt(x, z) > 1.4) continue;
    const n = fbm(x * 0.008, z * 0.008, 3);
    if (n < -0.15) continue;
    const r = rand();
    const type = h > 40 ? (r < 0.75 ? 'pine' : 'green') : r < 0.45 ? 'pine' : r < 0.7 ? 'maple' : r < 0.82 ? 'mapleGold' : r < 0.92 ? 'green' : 'ginkgo';
    place(type, x, z, 1 + rand() * 0.4);
  }
  // valley scattered
  for (let i = 0; i < 420 * dens; i++) {
    const a = rand() * 6.28, d = 45 + rand() * 140;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const r = rand();
    place(r < 0.35 ? 'maple' : r < 0.5 ? 'mapleGold' : r < 0.65 ? 'pine' : r < 0.78 ? 'persimmon' : r < 0.88 ? 'ginkgo' : 'green', x, z);
  }
  // riverside maples
  for (let i = 0; i < 160; i++) {
    const x = rr(60, 300), z = rr(-300, 380);
    const rd = riverDist(x, z); if (rd < 20 || rd > 32) continue;
    place(rand() < 0.7 ? 'maple' : 'mapleGold', x, z);
  }
  // bamboo groves
  for (const [cx, cz, r] of LAYOUT.bamboo) {
    for (let i = 0; i < r * r * 0.35; i++) {
      const a = rand() * 6.28, rd = Math.sqrt(rand()) * r;
      place('bamboo', cx + Math.cos(a) * rd, cz + Math.sin(a) * rd, 0.9 + rand() * 0.3);
    }
  }
  // palace & temple ginkgos / pines
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; place(i % 2 ? 'ginkgo' : 'pine', LAYOUT.palace[0] + Math.cos(a) * 68, LAYOUT.palace[1] + Math.sin(a) * 64, 1.2); }
  for (let i = 0; i < 12; i++) { const a = rand() * 6.28; place(rand() < 0.5 ? 'maple' : 'ginkgo', LAYOUT.temple[0] + Math.cos(a) * rr(26, 40), LAYOUT.temple[1] + Math.sin(a) * rr(26, 40), 1.1); }

  const group = new THREE.Group(); group.name = 'trees';
  for (const k in types) {
    types[k].forEach((v, i) => {
      if (!placed[k][i].length) return;
      const g = chunkedInstances(v.geo, treeMat, placed[k][i], { chunk: 120, castShadow: true });
      group.add(g);
    });
  }
  // rocks
  const rocks = [];
  const rockGeo = makeRock(3);
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  for (let i = 0; i < 700; i++) {
    const a = rand() * 6.28, d = 40 + Math.sqrt(rand()) * 420;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
    if (roadDist(x, z) < 4 || isBlocked(x, z, 2)) continue;
    const rv = riverDist(x, z);
    const s = rv < 16 ? rr(0.4, 1.2) : rr(0.5, 2.6) * (slopeAt(x, z) > 0.6 ? 1.8 : 1);
    rocks.push({ x, y: heightAt(x, z) - s * 0.25, z, ry: rand() * 6.28, rx: rr(-0.2, 0.2), s, color: new THREE.Color('#ffffff').multiplyScalar(rr(0.75, 1.05)) });
    all.push({ x, z, r: s * 1.1, type: 'rock' });
  }
  group.add(chunkedInstances(rockGeo, rockMat, rocks, { chunk: 120, castShadow: true }));
  scene.add(group);
  return { group, colliders: all.filter((t) => t.type !== 'bamboo' || rand() < 0.3) };
}

// The village guardian tree (zelkova) — a unique hero tree
export function makeGuardianTree() {
  const geos = [];
  const r = mulberry32(99);
  geos.push(branch([[0, 0, 0], [0.4, 3, 0.2], [0.2, 6, -0.3], [0, 8, 0]], 1.3, 0.5, '#4a3a30', 10));
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * 6.28 + r() * 0.4, L = 6 + r() * 3;
    geos.push(branch([[0, 5 + r() * 2, 0], [Math.cos(a) * L * 0.4, 8 + r() * 2, Math.sin(a) * L * 0.4], [Math.cos(a) * L, 10 + r() * 3, Math.sin(a) * L]], 0.45, 0.12, '#4a3a30', 6));
  }
  for (let i = 0; i < 34; i++) {
    const a = r() * 6.28, rd = r() * 8;
    const b = blob(2.2 + r() * 1.4, 1, 500 + i, pick(['#7a8a2e', '#9a8a2a', '#b88a24', '#6a7a2a']), 0.7);
    b.translate(Math.cos(a) * rd, 11 + r() * 4 - rd * 0.2, Math.sin(a) * rd);
    geos.push(b);
  }
  // root flare
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; geos.push(branch([[0, 1.5, 0], [Math.cos(a) * 1.5, 0.3, Math.sin(a) * 1.5], [Math.cos(a) * 2.6, -0.2, Math.sin(a) * 2.6]], 0.6, 0.2, '#4a3a30', 6)); }
  const mat = treeMaterial();
  const m = new THREE.Mesh(finalize(geos), mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
