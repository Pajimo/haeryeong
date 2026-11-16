import * as THREE from 'three';
import { fbm, ridged, smoothstep, lerp, clamp, distToPolyline, distToSegment } from './noise.js';
import { SEASON_U, SEASON_GLSL } from './season.js';
import { photoTex } from './textures.js';

export const WORLD_HALF = 500;
export const WATER_LEVEL = -0.6;
const RES = 2; // grid spacing (m)
const N = WORLD_HALF * 2 / RES + 1;

// ---------- World layout ----------
export const LAYOUT = {
  village: [0, 0],
  palace: [-30, -185],
  palaceGate: [-30, -140],
  temple: [290, -70],
  training: [-100, 62],
  banditCamp: [-310, 255],
  pampas: [[225, 235, 85], [-245, -70, 65], [60, -300, 70]],
  bamboo: [[-190, 150, 42], [210, -190, 35]],
  paddies: { x0: -70, x1: 75, z0: 110, z1: 205 },
  plaza: [0, 0, 26],
};

export const RIVER = [[470, -430], [300, -270], [170, -150], [132, -40], [140, 60], [178, 170], [125, 300], [10, 420], [-70, 480]];
export const ROADS = [
  [[5, 470], [12, 300], [2, 205], [-4, 108], [0, 0], [-12, -80], [-30, -138]],
  [[8, 0], [90, -6], [180, -22], [255, -55], [285, -68]],
  [[0, 12], [-60, 32], [-100, 52], [-170, 92], [-240, 170], [-300, 240]],
  [[-82, -36], [80, -30]],
  [[-78, 36], [85, 44]],
];
export const BRIDGE = { a: [112, -9], b: [158, -17], width: 5, deck: 1.4 };

function plateau(h, x, z, cx, cz, r0, r1, height) {
  const d = Math.hypot(x - cx, z - cz);
  const w = 1 - smoothstep(r0, r1, d);
  return lerp(h, height, w);
}

function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = fbm(x * 0.0035, z * 0.0035, 5) * 14 + fbm(x * 0.017, z * 0.017, 3) * 2.2;
  const m = smoothstep(230, 430, d);
  h += m * (22 + ridged(x * 0.0042 + 10, z * 0.0042 - 5, 5) * 105);
  const vf = 1 - smoothstep(70, 175, d);
  h = lerp(h, 1.0 + fbm(x * 0.01, z * 0.01, 2) * 0.9, vf);
  h = plateau(h, x, z, LAYOUT.palace[0], LAYOUT.palace[1], 50, 90, 7.5);
  h = plateau(h, x, z, LAYOUT.temple[0], LAYOUT.temple[1], 28, 72, 15);
  h = plateau(h, x, z, LAYOUT.banditCamp[0], LAYOUT.banditCamp[1], 22, 50, h * 0.6 + 3);
  // battlefields: the silver-grass plain, the western moor and the northern pass
  h = plateau(h, x, z, LAYOUT.pampas[0][0], LAYOUT.pampas[0][1], 70, 115, 3.5);
  h = plateau(h, x, z, LAYOUT.pampas[1][0], LAYOUT.pampas[1][1], 45, 80, 4);
  h = plateau(h, x, z, LAYOUT.pampas[2][0], LAYOUT.pampas[2][1], 45, 85, 9);
  // paddies
  const p = LAYOUT.paddies;
  const pw = smoothstep(-14, 0, Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z));
  h = lerp(h, 0.35, pw);
  // gentle path from village up to palace
  const pr = distToSegment(x, z, -12, -80, -30, -140);
  h = lerp(h, lerp(1.2, 7.5, pr.t), (1 - smoothstep(4, 14, pr.d)) * smoothstep(-0.1, 0.2, pr.t));
  // river carve
  const rd = distToPolyline(x, z, RIVER).d;
  h = lerp(h, WATER_LEVEL - 2.4, 1 - smoothstep(6, 19, rd));
  return h;
}

let H, ROADD, RIVERD;
function idx(i, j) { return j * N + i; }

export function buildHeightfield() {
  H = new Float32Array(N * N);
  ROADD = new Float32Array(N * N);
  RIVERD = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = -WORLD_HALF + j * RES;
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * RES;
      H[idx(i, j)] = rawHeight(x, z);
      let rd = 99;
      for (const r of ROADS) { const v = distToPolyline(x, z, r).d; if (v < rd) rd = v; }
      ROADD[idx(i, j)] = rd;
      RIVERD[idx(i, j)] = distToPolyline(x, z, RIVER).d;
    }
  }
}

function sample(arr, x, z) {
  const fx = clamp((x + WORLD_HALF) / RES, 0, N - 1.001), fz = clamp((z + WORLD_HALF) / RES, 0, N - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = arr[idx(i, j)], b = arr[idx(i + 1, j)], c = arr[idx(i, j + 1)], d = arr[idx(i + 1, j + 1)];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
export const heightAt = (x, z) => sample(H, x, z);
export const roadDist = (x, z) => sample(ROADD, x, z);
export const riverDist = (x, z) => sample(RIVERD, x, z);

export function bridgeInfo(x, z) {
  const r = distToSegment(x, z, BRIDGE.a[0], BRIDGE.a[1], BRIDGE.b[0], BRIDGE.b[1]);
  if (r.d < BRIDGE.width / 2 + 0.3 && r.t > 0 && r.t < 1) {
    const arch = Math.sin(r.t * Math.PI) * 1.2;
    return { on: true, y: BRIDGE.deck + arch, t: r.t };
  }
  return { on: false };
}
// Raised walkable floors (decks): a pavilion floor on pillars, a stair-bridge up to it. Axis-aligned
// rectangles; a deck may slope along x (y0 at x0 to y1 at x1) to make a ramp or stair. Registered at
// build time, before any object or person asks how high the ground is there.
const DECKS = [];
export function addDeck(d) { DECKS.push({ y1: d.y0, ...d }); }
function deckY(x, z) {
  let y = -Infinity;
  for (const d of DECKS) {
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
    const t = d.x1 > d.x0 ? (x - d.x0) / (d.x1 - d.x0) : 0;
    y = Math.max(y, d.y0 + (d.y1 - d.y0) * t);
  }
  return y;
}
export function groundAt(x, z) {
  const h = heightAt(x, z);
  const b = bridgeInfo(x, z);
  const g = b.on ? Math.max(h, b.y) : h;
  return DECKS.length ? Math.max(g, deckY(x, z)) : g;
}
export function isWater(x, z) { return heightAt(x, z) < WATER_LEVEL - 0.25 && !bridgeInfo(x, z).on; }
// which side of the river (sign)
export function riverSide(x, z) {
  const r = distToPolyline(x, z, RIVER);
  const a = RIVER[r.i], b = RIVER[r.i + 1];
  return Math.sign((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]));
}
export function slopeAt(x, z) {
  const e = 1.5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// ---------- Terrain mesh ----------
export function buildTerrain() {
  const seg = 400;
  const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // surface masks for the photo textures: A = forest floor, rock, river pebbles, paddy mud; B = packed dirt
  const maskA = new Uint8Array(pos.count * 4), maskB = new Uint8Array(pos.count);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#58702c'), grassB = new THREE.Color('#9a8a3a'), grassC = new THREE.Color('#6f7f35');
  const forest = new THREE.Color('#34472a'), forestB = new THREE.Color('#6b3a22');
  const rock = new THREE.Color('#6d685f'), rockLight = new THREE.Color('#a39d92');
  const dirt = new THREE.Color('#9b8263'), sand = new THREE.Color('#8f8a72'), plaza = new THREE.Color('#a8916f');
  const rice = new THREE.Color('#b59b45'), mud = new THREE.Color('#5d5236');
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const h = heightAt(x, z);
    pos.setY(k, h);
    const n = fbm(x * 0.02, z * 0.02, 3) * 0.5 + 0.5;
    const n2 = fbm(x * 0.006 + 40, z * 0.006, 3) * 0.5 + 0.5;
    c.copy(grassA).lerp(grassB, smoothstep(0.35, 0.75, n2)).lerp(grassC, n * 0.4);
    const d = Math.hypot(x, z);
    // mountain forest
    const mtn = smoothstep(15, 45, h);
    if (mtn > 0) { const f = c.clone().copy(forest).lerp(forestB, smoothstep(0.55, 0.8, n) * 0.6); c.lerp(f, mtn); }
    const sl = slopeAt(x, z);
    let mRock = Math.max(smoothstep(0.4, 0.95, sl), smoothstep(85, 120, h) * 0.8), mPeb = 0, mMud = 0, mDirt = 0;
    c.lerp(rock, smoothstep(0.55, 1.1, sl) * 0.85);
    c.lerp(rockLight, smoothstep(85, 120, h) * 0.8);
    const rv = riverDist(x, z);
    c.lerp(sand, (1 - smoothstep(10, 22, rv)) * 0.85);
    // gravel bars along the river, a band of wet mud right at the waterline
    mPeb = (1 - smoothstep(13, 24, rv)); mMud = rv < 30 ? (1 - smoothstep(0.15, 1.4, Math.abs(h - WATER_LEVEL))) * 0.75 : 0;
    const p = LAYOUT.paddies;
    if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) {
      const dike = Math.min(Math.abs(((x - p.x0) % 24) - 12), Math.abs(((z - p.z0) % 24) - 12));
      c.copy(dike > 10.8 ? grassA : mud); mMud = dike > 10.8 ? 0 : 1; mRock = 0; mPeb = 0;
    }
    c.lerp(plaza, (1 - smoothstep(18, 30, d)) * 0.9);
    const rd = roadDist(x, z);
    c.lerp(dirt, (1 - smoothstep(2.0, 4.2, rd)) * 0.95);
    // palace courtyard
    const pd = Math.hypot(x - LAYOUT.palace[0], z - LAYOUT.palace[1]);
    c.lerp(plaza, (1 - smoothstep(38, 46, pd)) * 0.8);
    const td = Math.hypot(x - LAYOUT.temple[0], z - LAYOUT.temple[1]);
    c.lerp(plaza, (1 - smoothstep(18, 26, td)) * 0.7);
    const trd = Math.hypot(x - LAYOUT.training[0], z - LAYOUT.training[1]);
    c.lerp(dirt, (1 - smoothstep(16, 22, trd)) * 0.9);
    const bd = Math.hypot(x - LAYOUT.banditCamp[0], z - LAYOUT.banditCamp[1]);
    c.lerp(dirt, (1 - smoothstep(14, 24, bd)) * 0.8);
    mDirt = Math.max((1 - smoothstep(2.0, 4.2, rd)) * 0.95, (1 - smoothstep(18, 30, d)) * 0.9, (1 - smoothstep(38, 46, pd)) * 0.8, (1 - smoothstep(18, 26, td)) * 0.7, (1 - smoothstep(16, 22, trd)) * 0.9, (1 - smoothstep(14, 24, bd)) * 0.8);
    maskA[k * 4] = mtn * 255; maskA[k * 4 + 1] = clamp(mRock, 0, 1) * 255; maskA[k * 4 + 2] = mPeb * 255; maskA[k * 4 + 3] = mMud * 255; maskB[k] = mDirt * 255;
    colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('tmA', new THREE.BufferAttribute(maskA, 4, true));
  geo.setAttribute('tmB', new THREE.BufferAttribute(maskB, 1, true));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.customProgramCacheKey = () => 'terrain-season-photo';
  // photographic ground (Poly Haven CC0). Each photo is used as a detail multiplier (texel / mean colour)
  // over the vertex colours, so the art-directed palette and the season tints still drive the hue.
  const T = { grass: photoTex('grass_c'), forest: photoTex('forest_c'), dirt: photoTex('dirt_c'), dirtN: photoTex('dirt_n', false), rock: photoTex('rock_c'), rockN: photoTex('rock_n', false), peb: photoTex('pebbles_c'), mud: photoTex('mud_c') };
  const TU = {
    tGrass: { value: T.grass }, tForest: { value: T.forest }, tDirt: { value: T.dirt }, tDirtN: { value: T.dirtN }, tRock: { value: T.rock }, tRockN: { value: T.rockN }, tPeb: { value: T.peb }, tMud: { value: T.mud },
    aGrass: { value: T.grass.userData.avg }, aForest: { value: T.forest.userData.avg }, aDirt: { value: T.dirt.userData.avg }, aRock: { value: T.rock.userData.avg }, aPeb: { value: T.peb.userData.avg }, aMud: { value: T.mud.userData.avg },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SEASON_U, TU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 tmA; attribute float tmB; varying vec4 vTmA; varying float vTmB; varying vec3 vWPos; varying float vUp; varying vec3 vTN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUp = objectNormal.y; vTN = objectNormal; vTmA = tmA; vTmB = tmB;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying float vUp; varying vec3 vTN; varying vec4 vTmA; varying float vTmB;
      uniform sampler2D tGrass; uniform sampler2D tForest; uniform sampler2D tDirt; uniform sampler2D tDirtN; uniform sampler2D tRock; uniform sampler2D tRockN; uniform sampler2D tPeb; uniform sampler2D tMud;
      uniform vec3 aGrass; uniform vec3 aForest; uniform vec3 aDirt; uniform vec3 aRock; uniform vec3 aPeb; uniform vec3 aMud;
      ${SEASON_GLSL}
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      // detail = texel / mean, partly desaturated so the vertex colour keeps control of the hue
      vec3 tDet(vec3 c, vec3 avg, float hue){ vec3 d = clamp(c / max(avg, vec3(0.01)), 0.0, 2.5); return mix(vec3(dot(d, vec3(0.299,0.587,0.114))), d, hue); }
      // two scales, rotated against each other, blended by a slow noise: hides the tiling
      vec3 tTwo(sampler2D t, vec2 p, float s1, float s2, float k){
        vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p;
        return mix(texture2D(t, p * s1).rgb, texture2D(t, q * s2).rgb, k);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float camD = length(vWPos - cameraPosition);
        float far = smoothstep(25.0, 140.0, camD);
        float mixK = mix(0.35 + 0.3 * vn(vWPos.xz * 0.05), 0.85, far);
        float detStr = mix(1.0, 0.55, smoothstep(120.0, 420.0, camD));
        vec3 det = tDet(tTwo(tGrass, vWPos.xz, 0.42, 0.083, mixK), aGrass, 0.55);
        if (vTmA.x > 0.01) det = mix(det, tDet(tTwo(tForest, vWPos.xz, 0.3, 0.07, mixK), aForest, 0.5), vTmA.x);
        vec3 tnW = normalize(vTN);
        vec3 rkW = pow(abs(tnW), vec3(4.0)); rkW /= rkW.x + rkW.y + rkW.z;
        vec2 rkUX = vWPos.zy * 0.11, rkUY = vWPos.xz * 0.11, rkUZ = vWPos.xy * 0.11;
        if (vTmA.y > 0.01) {
          // near scale ~9 m, far scale ~27 m (rotated) so cliffs don't show a grid
          vec3 rc = vec3(0.0);
          if (mixK < 0.99) rc = texture2D(tRock, rkUX).rgb * rkW.x + texture2D(tRock, rkUY).rgb * rkW.y + texture2D(tRock, rkUZ).rgb * rkW.z;
          vec3 rq = vWPos.zxy * 0.037;
          vec3 rf = texture2D(tRock, rq.xz * mat2(0.8, -0.6, 0.6, 0.8)).rgb * rkW.x + texture2D(tRock, vWPos.zx * 0.037).rgb * rkW.y + texture2D(tRock, vWPos.yx * 0.037 + 0.37).rgb * rkW.z;
          rc = mix(rc, rf, max(mixK, 0.45));
          det = mix(det, tDet(rc, aRock, 0.4), vTmA.y);
        }
        if (vTmA.z > 0.01) det = mix(det, tDet(tTwo(tPeb, vWPos.xz, 0.33, 0.09, mixK), aPeb, 0.45), vTmA.z);
        if (vTmA.w > 0.01) det = mix(det, tDet(tTwo(tMud, vWPos.xz, 0.25, 0.07, mixK), aMud, 0.3), vTmA.w);
        if (vTmB > 0.01) det = mix(det, tDet(tTwo(tDirt, vWPos.xz, 0.3, 0.075, mixK), aDirt, 0.4), vTmB);
        diffuseColor.rgb *= mix(vec3(1.0), det, detStr);
        float dn = vn(vWPos.xz*0.15)*0.6 + vn(vWPos.xz*0.9)*0.4;
        diffuseColor.rgb *= 0.9 + dn*0.2;
        // seasonal tint of the land
        vec3 o = diffuseColor.rgb;
        float greenish = clamp((o.g - o.r) * 6.0 + 0.5, 0.0, 1.0);
        vec3 spr = o * mix(vec3(1.0), vec3(0.78, 1.12, 0.72), greenish * 0.9 + 0.2);
        vec3 sum = o * mix(vec3(1.0), vec3(0.7, 1.02, 0.66), greenish * 0.9 + 0.2);
        vec3 win = mix(o, vec3(dot(o, vec3(0.33))) * vec3(1.0, 0.95, 0.9), 0.6);
        diffuseColor.rgb = spr * uSpring + sum * uSummer + o * uAutumn + win * uWinter;
        // snow cover, patchy on slopes and near water
        float snowN = vn(vWPos.xz * 0.35) * 0.5 + vn(vWPos.xz * 2.1) * 0.3;
        float snow = uSnow * smoothstep(0.55, 0.85, vUp + snowN * 0.25) * smoothstep(-0.8, 0.2, vWPos.y);
        snow = clamp(snow * 1.25, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98) * (0.94 + dn * 0.08), snow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // world-space normal detail from the rock (triplanar) and dirt (top-down) photos; fades with distance and snow
          float nk = (1.0 - smoothstep(30.0, 160.0, camD)) * (1.0 - snow);
          vec3 wn = tnW;
          if (nk > 0.01 && vTmA.y > 0.01) {
            vec2 nX = texture2D(tRockN, rkUX).xy * 2.0 - 1.0, nY = texture2D(tRockN, rkUY).xy * 2.0 - 1.0, nZ = texture2D(tRockN, rkUZ).xy * 2.0 - 1.0;
            wn += (vec3(0.0, nX.y, nX.x) * rkW.x + vec3(nY.x, 0.0, nY.y) * rkW.y + vec3(nZ.x, nZ.y, 0.0) * rkW.z) * vTmA.y * nk;
          }
          if (nk > 0.01 && vTmB > 0.01) {
            vec2 nd = texture2D(tDirtN, vWPos.xz * 0.3).xy * 2.0 - 1.0;
            wn += vec3(nd.x, 0.0, nd.y) * 0.8 * vTmB * nk;
          }
          normal = normalize(mat3(viewMatrix) * normalize(wn));
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function waterNormalTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const hgt = (x, y) => {
    const u = x / S * Math.PI * 2, v = y / S * Math.PI * 2;
    return Math.sin(u * 3 + Math.sin(v * 2) * 1.5) * 0.5 + Math.sin(v * 5 + u * 2) * 0.3 + Math.sin(u * 9 - v * 7) * 0.15 + Math.sin(u * 13 + v * 11) * 0.08;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    const nx = -dx * 2, ny = -dy * 2, nz = 1; const l = Math.hypot(nx, ny, nz);
    const o = (y * S + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  return t;
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const normalMap = waterNormalTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1f4a52'), roughness: 0.06, metalness: 0.0, normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86, envMapIntensity: 1.1,
    clearcoat: 0.6, clearcoatRoughness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.receiveShadow = true;
  mesh.userData.update = (t) => { normalMap.offset.set(t * 0.006, t * 0.011); };
  return mesh;
}

// Distant layered mountains (ink-wash silhouettes)
export function buildFarMountains() {
  const g = new THREE.Group();
  const layers = [{ r: 620, h: 150, col: '#4c5d63' }, { r: 760, h: 230, col: '#6f7f88' }, { r: 920, h: 300, col: '#8e9aa3' }];
  layers.forEach((L, li) => {
    const seg = 220;
    const geo = new THREE.BufferGeometry();
    const verts = [], idxs = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2;
      const n = ridged(Math.cos(a) * 2.5 + li * 7, Math.sin(a) * 2.5 + li * 3, 4);
      const hh = L.h * (0.35 + n * 0.9);
      const x = Math.cos(a) * L.r, z = Math.sin(a) * L.r;
      verts.push(x * 1.02, -30, z * 1.02, x, hh, z);
      if (i < seg) { const b = i * 2; idxs.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idxs);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: L.col, fog: true, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(geo, mat));
  });
  return g;
}
