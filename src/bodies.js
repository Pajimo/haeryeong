// MakeHuman bodies (MPFB2, CC0), built in Blender by charpipe/make_bodies.py: man, woman, elder and child
// variants, posed into the game's bind pose and skinned to the game's own 17-bone rig, so the existing
// procedural animation drives them unchanged. Each has a full-detail mesh and a decimated far LOD.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const B = { ready: false, v: {}, meta: null };
// Blender (z-up, -y forward) -> three (y-up, +z forward)
const yup = ([x, y, z]) => new THREE.Vector3(x, z, -y);

function extract(mesh, order) {
  // plain, float, bind-pose geometry with skin indices remapped to the game's BONE_ORDER
  const src = mesh.geometry; const g = new THREE.BufferGeometry();
  // bind-pose positions through the skeleton: correct whether or not the file was quantised (meshopt
  // moves a quantised skinned mesh's scale into its inverse bind matrices)
  const P = src.attributes.position, N = src.attributes.normal, n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); const v = new THREE.Vector3(), w = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); pos.set([v.x, v.y, v.z], i * 3);
    if (N) { nn.fromBufferAttribute(N, i).normalize(); w.fromBufferAttribute(P, i); const eps = 0.01 / Math.max(1e-6, mesh.skeleton.boneInverses[0].getMaxScaleOnAxis()); w.addScaledVector(nn, eps); mesh.applyBoneTransform(i, w); w.applyMatrix4(mesh.matrixWorld); w.sub(v).normalize(); nor.set([w.x, w.y, w.z], i * 3); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (N) g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const U = src.attributes.uv; if (U) { const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = U.getX(i); uv[i * 2 + 1] = U.getY(i); } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  const names = mesh.skeleton.bones.map((b) => b.name);
  const remap = names.map((n) => Math.max(0, order.indexOf(n)));
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const I = new Uint16Array(si.count * 4), W = new Float32Array(sw.count * 4);
  for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) { I[i * 4 + c] = remap[si.getComponent(i, c)]; W[i * 4 + c] = sw.getComponent(i, c); }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(W, 4));
  if (src.index) g.setIndex(src.index.clone());
  // palette region per vertex (clothing colours), plus the attributes the palette shader expects
  const reg = src.attributes._region;
  const R = new Float32Array(n); if (reg) for (let i = 0; i < n; i++) R[i] = Math.round(reg.getX(i));
  g.setAttribute('aRegion', new THREE.BufferAttribute(R, 1)); g.setAttribute('aBlush', new THREE.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('aLip', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.computeBoundingSphere();
  return g;
}

export async function loadBodies(order, url = `${import.meta.env.BASE_URL}chars/bodies.glb`) {
  try {
    const [gltf, meta] = await Promise.all([new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url), fetch(url.replace('.glb', '.json')).then((r) => r.json())]);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
    const meshes = {}; gltf.scene.traverse((o) => { if (o.isSkinnedMesh) meshes[o.name] = o; });
    for (const [key, info] of Object.entries(meta.variants)) {
      const J = {}; for (const [b, p] of Object.entries(info.joints)) J[b] = yup(p);
      const sils = {};
      for (const sil of info.sils || []) {
        const m = (suf) => meshes[`body_${key}_${sil}_${suf}`];
        if (!m('skin') || !m('cloth')) continue;
        sils[sil] = { skin: extract(m('skin'), order), cloth: extract(m('cloth'), order), skinLo: m('skin_lo') ? extract(m('skin_lo'), order) : null, clothLo: m('cloth_lo') ? extract(m('cloth_lo'), order) : null };
      }
      if (Object.keys(sils).length) B.v[key] = { J, sils, cut: info.cut };
    }
    B.meta = meta; B.ready = Object.keys(B.v).length > 0;
    console.info('[bodies]', Object.keys(B.v).join(', '));
  } catch (e) { console.warn('[bodies] could not load, keeping sculpted bodies', e); B.ready = false; B.error = String(e?.stack || e); }
  return B.ready;
}

export function bodyFor(o) {
  if (!B.ready) return null;
  const age = o.outfit === 'child' || o.age === 'child' ? 'child' : o.age === 'elder' ? 'elder' : 'adult';
  const v = B.v[`${o.sex === 'f' ? 'f' : 'm'}_${age}`] || B.v[`${o.sex === 'f' ? 'f' : 'm'}_adult`]; if (!v) return null;
  const sil = v.sils[o.sil] ? o.sil : o.sil === 'armor' && v.sils.robe ? 'robe' : Object.keys(v.sils)[0];
  return { J: v.J, sil, ...v.sils[sil] };
}
export const bodyMeta = () => B.meta;
