// MakeHuman faces (MPFB2, CC0 assets). 48 sculpted heads (man and woman × child, young, adult and
// elder × 6 face shapes), each with fitted eyes, eyebrows and eyelashes, generated in Blender by
// charpipe/make_heads.py and loaded once at boot. Every villager gets one, chosen by their id,
// and it is tinted to their skin tone. If loading fails, characters keep the old sculpted heads.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const F = { ready: false, v: {}, counts: {} };
// where the eyes sit in head-bone space (matches the hat, hair and hood fittings), and how big heads are
const EYE_AT = new THREE.Vector3(0, 0.112, 0.0845);
const SCALE = 1.1;
// the sculpted hair cap is an ellipsoid shell (see hairGeometry); scale it until it encloses the scalp
export const HC = { c: [0, 0.122, -0.012], r: [0.093, 0.112, 0.108] };

function plain(o) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) {
    const a = o.geometry.attributes[k]; if (!a) continue;
    const n = a.itemSize, arr = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) arr[i * n + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(arr, n));
  }
  if (o.geometry.index) g.setIndex(o.geometry.index.clone());
  g.applyMatrix4(o.matrixWorld);
  return g;
}

export async function loadFaces(url = `${import.meta.env.BASE_URL}chars/heads.glb`) {
  try {
    const [gltf, meta] = await Promise.all([
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url),
      fetch(url.replace('.glb', '.json')).then((r) => r.json()),
    ]);
    gltf.scene.updateMatrixWorld(true);
    const mesh = {}; gltf.scene.traverse((o) => { if (o.isMesh) mesh[o.name] = o; });
    for (const [key, info] of Object.entries(meta.variants)) {
      if (!mesh[key] || !mesh[key + '_eyes']) continue;
      const parts = { head: plain(mesh[key]), eyes: plain(mesh[key + '_eyes']), brows: mesh[key + '_brows'] ? plain(mesh[key + '_brows']) : null, lashes: mesh[key + '_lashes'] ? plain(mesh[key + '_lashes']) : null };
      parts.eyes.computeBoundingBox(); const eyeMid = parts.eyes.boundingBox.getCenter(new THREE.Vector3());
      const m = new THREE.Matrix4().makeTranslation(EYE_AT.x, EYE_AT.y, EYE_AT.z).multiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE)).multiply(new THREE.Matrix4().makeTranslation(-eyeMid.x, -eyeMid.y, -eyeMid.z));
      for (const g of Object.values(parts)) if (g) { g.applyMatrix4(m); g.computeBoundingSphere(); }
      // on a MakeHuman body the head bone is MakeHuman's own head joint: this frame puts the fitted head back at its native size and place
      const hj = info.headJoint ? new THREE.Vector3(info.headJoint[0], info.headJoint[2], -info.headJoint[1]) : null;
      const native = hj ? new THREE.Matrix4().makeTranslation(eyeMid.x - hj.x, eyeMid.y - hj.y, eyeMid.z - hj.z).multiply(new THREE.Matrix4().makeScale(1 / SCALE, 1 / SCALE, 1 / SCALE)).multiply(new THREE.Matrix4().makeTranslation(-EYE_AT.x, -EYE_AT.y, -EYE_AT.z)) : null;
      // landmarks for beards: the front of the mouth and the chin
      const p = parts.head.attributes.position; let mouth = null, chin = null;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (Math.abs(x) > 0.006) continue; if (y < EYE_AT.y - 0.06 && y > EYE_AT.y - 0.082 && (!mouth || z > mouth.z)) mouth = new THREE.Vector3(x, y, z); if (z > 0.04 && (!chin || y < chin.y)) chin = new THREE.Vector3(x, y, z); }
      let W = 0, T = -9, B = 9, Fz = -9, hk = 0; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > EYE_AT.y + 0.02) { W = Math.max(W, Math.abs(x)); T = Math.max(T, y); B = Math.min(B, z); if (y > EYE_AT.y + 0.07) Fz = Math.max(Fz, z); } if (y > EYE_AT.y + 0.045) hk = Math.max(hk, Math.hypot(x / HC.r[0], (y - HC.c[1]) / HC.r[1], (z - HC.c[2]) / HC.r[2])); }
      F.v[key] = { ...parts, native, cranium: { W, T, B, Fz }, hairK: hk, brow: (info.brows || 'eyebrow001').slice(-3), sex: info.sex, age: info.age, mouth, chin };
      const b = `${info.sex}_${info.age}`; F.counts[b] = (F.counts[b] || 0) + 1;
    }
    F.ready = Object.keys(F.v).length > 0;
    console.info('[faces]', Object.keys(F.v).length, 'MakeHuman heads loaded');
  } catch (e) { console.warn('[faces] could not load heads, keeping sculpted faces', e); F.ready = false; }
  return F.ready;
}

export function faceFor(o) {
  if (!F.ready || o.noFace) return null;
  const age = o.outfit === 'child' || o.age === 'child' ? 'child' : o.age === 'elder' ? 'elder' : o.age === 'young' ? 'young' : 'adult';
  const sex = o.sex === 'f' ? 'f' : 'm';
  const n = F.counts[`${sex}_${age}`] || 0; if (!n) return null;
  const idx = (((o.faceSeed ?? 0) * 2654435761) >>> 0) % n;
  return F.v[`head_${sex}_${age}_${idx}`] || null;
}

// ---------- materials (shared, so 130 villagers cost a handful of materials) ----------
const tl = new THREE.TextureLoader();
const texCache = {};
function tex(url, srgb = true) { if (texCache[url]) return texCache[url]; const t = tl.load(url); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (texCache[url] = t); }
const matCache = {};
const REF = new THREE.Color('#e4b893'); // the tone the skin textures were painted in
export function skinMaterial(sex, age, skinHex) {
  const band = age === 'elder' ? 'old' : age === 'adult' ? 'middleage' : 'young';
  const key = `${band}_${sex}_${skinHex}`;
  if (matCache[key]) return matCache[key];
  const want = new THREE.Color(skinHex);
  // tint toward the villager's tone; the old-age textures are painted very ruddy, so pull them back
  const tint = new THREE.Color(want.r / REF.r, want.g / REF.g, want.b / REF.b);
  if (band === 'old') tint.multiply(new THREE.Color('#e9dcd6'));
  tint.r = Math.min(1.25, tint.r); tint.g = Math.min(1.25, tint.g); tint.b = Math.min(1.25, tint.b);
  const m = new THREE.MeshStandardMaterial({ map: tex(`${import.meta.env.BASE_URL}chars/skin_${band}_asian_${sex === 'f' ? 'female' : 'male'}.jpg`), color: tint, roughness: 0.6, metalness: 0 });
  m.name = 'mh-skin'; return (matCache[key] = m);
}
export const eyeMaterial = () => matCache.eye || (matCache.eye = new THREE.MeshPhysicalMaterial({ map: tex(`${import.meta.env.BASE_URL}chars/eye_brown.png`), roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
export function browMaterial(id, hairHex) {
  const key = `brow_${id}_${hairHex}`; if (matCache[key]) return matCache[key];
  const c = new THREE.Color(hairHex); const lum = c.r * 0.3 + c.g * 0.6 + c.b * 0.1;
  return (matCache[key] = new THREE.MeshStandardMaterial({ map: tex(`${import.meta.env.BASE_URL}chars/brow_${id}.png`), color: lum > 0.25 ? c.clone().multiplyScalar(1.6) : new THREE.Color('#ffffff'), transparent: true, alphaTest: 0.15, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
}
export const lashMaterial = () => matCache.lash || (matCache.lash = new THREE.MeshStandardMaterial({ map: tex(`${import.meta.env.BASE_URL}chars/lashes01.png`), color: '#ffffff', transparent: true, alphaTest: 0.2, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }));
export const facesReady = () => F.ready;
