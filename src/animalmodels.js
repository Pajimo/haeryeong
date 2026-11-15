// Animated animal models (Quaternius, CC0 — see README credits). Loaded once at boot; every
// animal gets a SkeletonUtils clone of its type's GLB and its own AnimationMixer (see animals.js).
// Types without a CC0 animated model in a matching style (cat, tiger, boar, chicken, rabbit, crane,
// magpie), and any type whose file fails to load, keep the procedural sculpted bodies.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL}models/animals/`;

// height: overall rest-pose height (ears/head included) in metres; the horse's puts its back at ~1.3 m.
// paint: per-variant colours for the model's named flat-colour materials.
export const CFG = {
  horse: {
    file: 'horse.glb', height: 2.02,
    // chestnut, bay, grey, black, white, dun — [Main, Main_Dark, Main_Light, Hair, Muzzle]
    paint: (v) => {
      const P = [
        ['#8e4a1e', '#6a3414', '#a45a26', '#5a2a12', '#2a1a12'],
        ['#46261a', '#2a1a12', '#5a3420', '#0e0c0a', '#120e0c'],
        ['#8e8e8a', '#6a6a68', '#b4b4b0', '#3a3836', '#2a2826'],
        ['#26201c', '#1a1612', '#3a322c', '#0e0c0a', '#141210'],
        ['#e6e2da', '#d0ccc4', '#f2eee8', '#d8d0c4', '#8a7a70'],
        ['#a8865a', '#8a6a44', '#bc9a6c', '#2a2018', '#3a2c20'],
      ][v % 6];
      return { Main: P[0], Main_Dark: P[1], Main_Light: P[2], Hair: P[3], Muzzle: P[4] };
    },
    variants: 6, clips: { graze: ['Eating', 'Idle_Headlow'], attack: ['Attack_Kick'] },
  },
  deer: { file: 'deer.glb', height: 1.15, paint: () => ({ Main: '#8a6440', Main_Dark: '#5a3e26', Main_Light: '#cbb48e' }), variants: 1 },
  fox: { file: 'fox.glb', height: 0.62, variants: 1 },
  dog: {
    file: 'dog.glb', height: 0.72, variants: 4,
    // Jindo coats: white, tan, cream, black-and-tan
    paint: (v) => [{ Main: '#ece6da', Main_Light: '#f6f2ea' }, { Main: '#c8864a', Main_Light: '#f2ead8' }, { Main: '#ddc8a4', Main_Light: '#f4ecdc' }, { Main: '#26201c', Main_Light: '#b07a48' }][v % 4],
  },
  ox: { file: 'ox.glb', height: 1.75, paint: () => ({ Main: '#9a6230', Main_Light: '#b07a44', Muzzle: '#5a3a24' }), variants: 1 },
};

// which clip plays for each behaviour (first one that exists wins)
const CLIPS = {
  idle: ['Idle'], idle2: ['Idle_2', 'Idle_2_HeadLow', 'Idle_Headlow', 'Idle'],
  graze: ['Eating', 'Idle_Eating', 'Idle_Peck', 'Idle_Headlow', 'Idle_2_HeadLow'],
  walk: ['Walk', 'Run'], run: ['Gallop', 'Run', 'Walk'],
  attack: ['Attack', 'Attack_Headbutt', 'Headbutt', 'Bite_Front'], death: ['Death'],
};

const M = {};
export const animalModel = (type) => M[type] || null;

function materialsFor(def, type, v) {
  def.mats = def.mats || {};
  if (def.mats[v]) return def.mats[v];
  const cfg = CFG[type]; const out = new Map();
  const paint = cfg.paint?.(v);
  for (const src of def.srcMats) {
    const m = src.clone();
    if (paint && paint[src.name]) m.color.set(paint[src.name]);
    m.roughness = 0.85; m.metalness = 0;
    out.set(src, m);
  }
  def.mats[v] = out; return out;
}

export async function loadAnimalModels() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const files = [...new Set(Object.values(CFG).map((c) => c.file))];
  const got = {};
  await Promise.all(files.map(async (f) => { try { got[f] = await loader.loadAsync(BASE + f); } catch (e) { console.warn('[animals] could not load', f, e); } }));
  for (const [type, cfg] of Object.entries(CFG)) {
    const g = got[cfg.file]; if (!g) continue;
    try {
      const scene = cloneSkinned(g.scene);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      scene.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else if (o.isMesh) box.expandByObject(o); });
      const h = box.max.y - box.min.y; const scale = cfg.height / h;
      const holder = new THREE.Group(); holder.add(scene); scene.scale.multiplyScalar(scale); scene.position.y = -box.min.y * scale;
      holder.updateMatrixWorld(true);
      const srcMats = new Set();
      scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; srcMats.add(o.material); } });
      const clips = {}; for (const c of g.animations) clips[c.name] = c;
      const pick = (names) => { for (const n of names) if (clips[n]) return clips[n]; return null; };
      const roles = {}; for (const r in CLIPS) roles[r] = pick([...(cfg.clips?.[r] || []), ...CLIPS[r]]);
      const size = new THREE.Vector3(); box.getSize(size).multiplyScalar(scale);
      M[type] = { type, holder, scale, size, roles, srcMats: [...srcMats] };
      if (type === 'horse') M[type].tack = buildTack(holder);
    } catch (e) { console.warn('[animals] model setup failed for', type, e); }
  }
  console.info('[animals]', Object.keys(M).length, 'animated animal models loaded');
  return Object.keys(M).length > 0;
}

// a fresh, independently animated copy for one animal
export function instanceAnimal(type, variant) {
  const def = M[type]; if (!def) return null;
  const obj = cloneSkinned(def.holder);
  const mats = materialsFor(def, type, (variant | 0) % (CFG[type].variants || 1));
  obj.traverse((o) => { if (o.isMesh) { o.material = mats.get(o.material) || o.material; } });
  const mixer = new THREE.AnimationMixer(obj);
  const bones = {}; obj.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return { obj, mixer, roles: def.roles, bones, size: def.size };
}

// ---------- Horse tack (saddle, blanket, stirrups, bridle) ----------
// Built once against the rest pose, measured off the mesh, and stored as bone-local transforms so
// every clone can hang the same meshes on its own spine and head bones and they follow the gait.
function buildTack(holder) {
  holder.updateMatrixWorld(true);
  const meshes = []; holder.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingSphere(); meshes.push(o); } });
  const bones = {}; holder.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const spine = bones.Torso2 || bones.Torso; const head = bones.Head;
  if (!spine || !head || !meshes.length) return null;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ray = new THREE.Raycaster();
  const cast = (o, d) => { ray.set(o, d); return ray.intersectObjects(meshes, false)[0]?.point || null; };
  const sp = spine.getWorldPosition(V());
  const z0 = sp.z + 0.02;
  const top = cast(V(0, 4, z0), V(0, -1, 0))?.y ?? sp.y + 0.2;
  const halfW = cast(V(2, top - 0.22, z0), V(-1, 0, 0))?.x ?? 0.25;
  // muzzle: the front-most vertex, and the ring of vertices just behind it
  const v = new THREE.Vector3(); let tip = null; const pts = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); pts.push(v.clone()); if (!tip || v.z > tip.z) tip = v.clone(); }
  }
  const slice = pts.filter((p) => p.z < tip.z - 0.07 && p.z > tip.z - 0.13 && p.y > top);
  let cy = tip.y, ry = 0.08, rx = 0.07;
  if (slice.length > 3) { let y0 = 9, y1 = -9, x1 = 0; for (const p of slice) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); x1 = Math.max(x1, Math.abs(p.x)); } cy = (y0 + y1) / 2; ry = (y1 - y0) / 2; rx = x1; }

  const red = new THREE.MeshStandardMaterial({ color: '#8e2a22', roughness: 0.8 });
  const lea = new THREE.MeshStandardMaterial({ color: '#4a2a1a', roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 0.8, roughness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: '#2e4f8a', roughness: 0.85, side: THREE.DoubleSide });
  const saddle = new THREE.Group();
  const r = halfW + 0.02;
  // open cylinder along z, arc over the back (theta = PI is the top after rotateX)
  const blanket = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.72, 18, 1, true, Math.PI * 0.42, Math.PI * 1.16).rotateX(Math.PI / 2), blue);
  blanket.position.set(0, top + 0.012 - r, z0 - 0.02);
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.004, r + 0.004, 0.74, 18, 1, true, Math.PI * 0.42, Math.PI * 1.16).rotateX(Math.PI / 2).scale(1, 1, 1), red);
  trim.position.copy(blanket.position); trim.scale.set(1, 1, 0.08); trim.position.z = z0 - 0.02 + 0.33;
  const trim2 = trim.clone(); trim2.position.z = z0 - 0.02 - 0.33;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.3, 0.07, 0.5), lea); seat.position.set(0, top + 0.045, z0);
  const pommel = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.06), red); pommel.position.set(0, top + 0.11, z0 + 0.24);
  const cantle = new THREE.Mesh(new THREE.BoxGeometry(halfW * 1.1, 0.13, 0.06), red); cantle.position.set(0, top + 0.12, z0 - 0.22);
  saddle.add(blanket, trim, trim2, seat, pommel, cantle);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.03), lea); strap.position.set(sx * (halfW + 0.035), top - 0.2, z0 + 0.06);
    const iron = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), gold); iron.position.set(sx * (halfW + 0.04), top - 0.42, z0 + 0.06); iron.rotation.y = Math.PI / 2;
    const girth = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.55, 0.06), lea); girth.position.set(sx * (halfW + 0.012), top - 0.32, z0 + 0.22);
    saddle.add(strap, iron, girth);
  }
  const bridle = new THREE.Group();
  const nose = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 5, 18), lea); nose.scale.set(rx + 0.012, ry + 0.012, 0.09); nose.position.set(0, cy, tip.z - 0.1);
  bridle.add(nose);
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), red); t.position.set(0, cy - ry - 0.04 - i * 0.045, tip.z - 0.2 - i * 0.02); bridle.add(t); }
  for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 4, 10), gold); ring.position.set(sx * (rx + 0.015), cy - ry * 0.4, tip.z - 0.1); ring.rotation.y = Math.PI / 2; bridle.add(ring); }
  saddle.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // to bone-local frames
  const local = (grp, bone) => { grp.updateMatrixWorld(true); return new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(grp.matrixWorld); };
  return {
    saddle, bridle, spine: spine.name, head: head.name,
    saddleM: local(saddle, spine), bridleM: local(bridle, head),
    reinFrom: [V(-(rx + 0.015), cy - ry * 0.4, tip.z - 0.1), V(rx + 0.015, cy - ry * 0.4, tip.z - 0.1)].map((p) => p.applyMatrix4(new THREE.Matrix4().copy(head.matrixWorld).invert())),
    reinTo: V(0, top + 0.12, z0 + 0.2).applyMatrix4(new THREE.Matrix4().copy(spine.matrixWorld).invert()),
    seat: top + 0.08, halfW, top,
  };
}

// hang a copy of the tack on one horse instance; returns the parts so they can be removed again
export function attachTack(inst) {
  const T = M.horse?.tack; if (!T) return null;
  const spine = inst.bones[T.spine], head = inst.bones[T.head]; if (!spine || !head) return null;
  const put = (tmpl, bone, mat) => { const g = tmpl.clone(); g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1); g.matrixAutoUpdate = false; g.matrix.copy(mat); bone.add(g); return g; };
  const saddle = put(T.saddle, spine, T.saddleM), bridle = put(T.bridle, head, T.bridleM);
  const reinMat = new THREE.MeshStandardMaterial({ color: '#3a2014', roughness: 0.6 });
  const reins = [0, 1].map(() => { const m = new THREE.Mesh(_reinGeo, reinMat); m.matrixAutoUpdate = false; inst.obj.add(m); return m; });
  return { saddle, bridle, reins, head, spine, from: T.reinFrom, to: T.reinTo };
}
const _reinGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 4, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();
// keep the reins running from the bit rings to the pommel (call after the mixer has posed the bones)
export function updateReins(inst, tk) {
  if (!tk) return;
  inst.obj.updateMatrixWorld(true);
  _inv.copy(inst.obj.matrixWorld).invert();
  _b.copy(tk.to).applyMatrix4(tk.spine.matrixWorld).applyMatrix4(_inv);
  for (let i = 0; i < 2; i++) {
    _a.copy(tk.from[i]).applyMatrix4(tk.head.matrixWorld).applyMatrix4(_inv);
    const len = _a.distanceTo(_b);
    _m.lookAt(_b, _a, _up); _q.setFromRotationMatrix(_m);
    _s.set(1, 1, len); tk.reins[i].matrix.compose(_a, _q, _s);
  }
}
