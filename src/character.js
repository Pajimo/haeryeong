import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { damp, clamp, lerp, mulberry32 } from './noise.js';
import { bodyFor } from './bodies.js';
import { faceFor, skinMaterial, eyeMaterial, browMaterial, lashMaterial, HC } from './faces.js';
import { bodyGeometry, headGeometry, hairGeometry, handGeometry, paletteMaterial, hairMaterial, jointsFor, silhouetteFor, PAL, BONE_ORDER, irisTexture, corneaMat } from './charbody.js';

// Shared materials (vertex colored) — few programs, many characters
const FWD = /* the sword mesh's own blade axis */ new THREE.Vector3(0, 0, 1);
const GUARD = 1.72; // radians the point is lifted above the line of the forearm (blade level, forward)
export const CHAR_MATS = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
  silk: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff4e0') }),
  eyes: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.2, clearcoat: 0.6 }),
  hair: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }),
  gat: new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.5, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false }),
  steel: new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.18, metalness: 1.0 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 }),
};

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'lHand', 'rShoulder', 'rElbow', 'rHand', 'lHip', 'lKnee', 'lFoot', 'rHip', 'rKnee', 'rFoot'];

class PartBuilder {
  constructor() { this.parts = {}; }
  add(bone, geo, color, matKey = 'body', m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const key = bone + '|' + matKey;
    (this.parts[key] ||= []).push(g);
  }
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const sphere = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r, l, cs = 6, rs = 14) => new THREE.CapsuleGeometry(r, l, cs, rs);
const cyl = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
function lathe(profile, segs = 22) {
  const pts = profile[0][1] > profile[profile.length - 1][1] ? profile.slice().reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

// ---------- Character ----------
// opts: { sex:'m'|'f', age:'young'|'adult'|'elder', skin, hair, outfit, colors:{top,bottom,ribbon,belt}, height, build, married, hat, weapon }
const MH_BODY = !(typeof location !== 'undefined' && /[?&]oldbodies=1/.test(location.search));
export class Character {
  constructor(opts) {
    this.o = opts;
    const H = opts.height ?? 1;
    this.root = new THREE.Group();
    this.bones = {};
    this.scale = H;
    // MakeHuman body and Joseon clothing (src/bodies.js); ?oldbodies=1 shows the old sculpted bodies
    this.mh = MH_BODY ? bodyFor({ ...opts, sil: silhouetteFor(opts.sex, opts.outfit) }) : null;
    this.buildRig();
    this.buildBody();
    this.pose = {}; this.target = {};
    for (const b of BONES) { this.pose[b] = new THREE.Euler(); this.target[b] = { x: 0, y: 0, z: 0 }; }
    this.rootOff = { y: 0, rx: 0, rz: 0, fwd: 0 }; this.rootTarget = { y: 0, rx: 0, rz: 0, fwd: 0 };
    this.phase = Math.random() * 10; this.blink = 0; this.blinkT = 2 + Math.random() * 3;
    this.anim = 'idle'; this.animT = 0; this.speed = 0; this.mouth = 0; this.swordDrawn = false;
    this.snap = 10;
  }

  buildRig() {
    const f = this.o.sex === 'f';
    const { legLen } = jointsFor(this.o.sex);
    const mk = (name, parent, x, y, z) => { const g = new THREE.Bone(); g.position.set(x, y, z); g.name = name; parent.add(g); this.bones[name] = g; return g; };
    this.body = new THREE.Group(); this.root.add(this.body);
    if (this.mh) return this.buildMhRig(mk);
    const hips = mk('hips', this.body, 0, legLen, 0);
    const spine = mk('spine', hips, 0, 0.12, 0);
    const chest = mk('chest', spine, 0, 0.2, 0);
    const neck = mk('neck', chest, 0, 0.21, 0);
    mk('head', neck, 0, 0.08, 0.01);
    const sw = f ? 0.155 : 0.18;
    const ls = mk('lShoulder', chest, sw, 0.15, 0);
    const le = mk('lElbow', ls, 0, -0.27, 0);
    mk('lHand', le, 0, -0.25, 0);
    const rs = mk('rShoulder', chest, -sw, 0.15, 0);
    const re = mk('rElbow', rs, 0, -0.27, 0);
    mk('rHand', re, 0, -0.25, 0);
    const hw = f ? 0.085 : 0.095;
    const lh = mk('lHip', hips, hw, -0.03, 0);
    const lk = mk('lKnee', lh, 0, -legLen * 0.48, 0);
    mk('lFoot', lk, 0, -legLen * 0.44, 0);
    const rh = mk('rHip', hips, -hw, -0.03, 0);
    const rk = mk('rKnee', rh, 0, -legLen * 0.48, 0);
    mk('rFoot', rk, 0, -legLen * 0.44, 0);
    this.legLen = legLen;
  }

  // the game's 17 bones at MakeHuman's joints; limbs hang straight down at rest (bound with armA/legA, as before)
  buildMhRig(mk) {
    const J = this.mh.J; const rel = (a, b) => J[a].clone().sub(J[b]).toArray();
    const hips = mk('hips', this.body, J.hips.x, J.hips.y, J.hips.z);
    const spine = mk('spine', hips, ...rel('spine', 'hips'));
    const chest = mk('chest', spine, ...rel('chest', 'spine'));
    const neck = mk('neck', chest, ...rel('neck', 'chest'));
    mk('head', neck, ...rel('head', 'neck'));
    for (const s of ['l', 'r']) {
      const sh = mk(s + 'Shoulder', chest, ...rel(s + 'Shoulder', 'chest'));
      const el = mk(s + 'Elbow', sh, 0, -J[s + 'Shoulder'].distanceTo(J[s + 'Elbow']), 0);
      mk(s + 'Hand', el, 0, -J[s + 'Elbow'].distanceTo(J[s + 'Hand']), 0);
      const hp = mk(s + 'Hip', hips, ...rel(s + 'Hip', 'hips'));
      const kn = mk(s + 'Knee', hp, 0, -J[s + 'Hip'].distanceTo(J[s + 'Knee']), 0);
      mk(s + 'Foot', kn, 0, -J[s + 'Knee'].distanceTo(J[s + 'Foot']), 0);
    }
    this.legLen = J.hips.y;
  }

  buildBody() {
    const o = this.o; const f = o.sex === 'f'; const P = new PartBuilder();
    const hair = o.hair || '#151210';
    const ribbon = o.colors.ribbon || '#a3262a';
    const elder = o.age === 'elder';
    const outfit = o.outfit;
    const sil = silhouetteFor(o.sex, outfit);
    const armored = outfit === 'soldier' || outfit === 'general';
    // ----- palette-coloured skinned body (sculpted hanbok silhouette) -----
    const skinC = new THREE.Color(o.skin);
    const cols = [];
    cols[PAL.skin] = o.skin; cols[PAL.top] = o.colors.top; cols[PAL.bottom] = o.colors.bottom; cols[PAL.robe] = o.colors.robe || o.colors.top;
    cols[PAL.belt] = o.colors.belt || '#3a2a20'; cols[PAL.collar] = outfit === 'monk' ? '#7a2a20' : '#f4efe4';
    cols[PAL.shoe] = f ? '#efe6d8' : armored ? '#1c1816' : '#2a2420'; cols[PAL.wrap] = o.colors.wrap || (armored ? '#2a2420' : '#ece5d6');
    cols[PAL.cuff] = ribbon; cols[PAL.armor] = o.colors.armor || '#2c3a5e';
    cols[PAL.lips] = '#' + (f ? new THREE.Color('#b8505a').lerp(skinC, 0.25) : skinC.clone().lerp(new THREE.Color('#9a5550'), 0.45)).getHexString();
    cols[PAL.inner] = '#f2ece0';
    const hem = ['noble', 'queen', 'princess', 'royal'].includes(outfit) || ['noble', 'queen', 'princess', 'king', 'prince'].includes(o.job) || o.rich;
    this.skinMat = paletteMaterial(cols, { blush: '#e27a6e', rim: 0.24, hem, hemColor: '#d9b44a' });
    const geo = this.mh ? this.mh.cloth : bodyGeometry(o.sex, sil, o.build ?? 1, outfit === 'child');
    const { armA, legA } = jointsFor(o.sex);
    this.bones.lShoulder.rotation.z = armA; this.bones.rShoulder.rotation.z = -armA;
    this.bones.lHip.rotation.z = legA; this.bones.rHip.rotation.z = -legA;
    this.root.updateMatrixWorld(true);
    const mesh = new THREE.SkinnedMesh(this.mh ? this.mh.cloth : geo, this.skinMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.body.add(mesh); mesh.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(BONE_ORDER.map((n) => this.bones[n]));
    mesh.bind(skel, mesh.matrixWorld);
    if (this.mh) {
      // the MakeHuman skin that shows (neck and hands), textured to match the face
      const sm = this.mhSkin = new THREE.SkinnedMesh(this.mh.skin, skinMaterial(o.sex === 'f' ? 'f' : 'm', o.age === 'elder' ? 'elder' : o.age === 'young' || outfit === 'child' ? 'young' : 'adult', o.skin));
      sm.castShadow = true; sm.receiveShadow = true; this.body.add(sm); sm.updateMatrixWorld(true); sm.bind(skel, sm.matrixWorld);
      sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3); sm.frustumCulled = true;
      this.skinMat.side = THREE.DoubleSide;
    }
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    for (const n of ['lShoulder', 'rShoulder', 'lHip', 'rHip']) this.bones[n].rotation.set(0, 0, 0);
    this.skinned = mesh;
    this.bodyLod = [mesh, geo, this.mh ? () => this.mh.clothLo || this.mh.cloth : () => bodyGeometry(o.sex, sil, o.build ?? 1, outfit === 'child', true)];

    // ----- sculpted head, hands, hair -----
    // MakeHuman head when available (src/faces.js), else the old sculpted one
    const fv = this.face = faceFor(o);
    // everything worn on the head hangs from this frame; on a MakeHuman body it maps the fitted head to its native place
    this.headFrame = new THREE.Group(); this.bones.head.add(this.headFrame);
    if (this.mh && fv?.native) { this.headFrame.matrixAutoUpdate = false; this.headFrame.matrix.copy(fv.native); }
    const HF = this.headFrame;
    this.lodParts = [];
    if (fv) {
      const head = this.headMesh = new THREE.Mesh(fv.head, skinMaterial(o.sex === 'f' ? 'f' : 'm', fv.age, o.skin)); head.castShadow = true; HF.add(head);
      this.faceParts = [new THREE.Mesh(fv.eyes, eyeMaterial())];
      if (fv.brows) this.faceParts.push(new THREE.Mesh(fv.brows, browMaterial(fv.brow, elder ? '#b8b2a8' : hair)));
      if (fv.lashes) this.faceParts.push(new THREE.Mesh(fv.lashes, lashMaterial()));
      for (const m of this.faceParts) { m.renderOrder = 2; HF.add(m); }
    } else {
      const head = new THREE.Mesh(headGeometry(o.sex, o.age), this.skinMat); head.castShadow = true; HF.add(head);
      this.lodParts.push([head, () => headGeometry(o.sex, o.age), () => headGeometry(o.sex, o.age, true)]);
    }
    if (!this.mh) for (const side of ['l', 'r']) { const h = new THREE.Mesh(handGeometry(side), this.skinMat); h.castShadow = true; this.bones[side + 'Hand'].add(h); this.lodParts.push([h, () => handGeometry(side), () => handGeometry(side, true)]); }
    let style = outfit === 'child' ? 'braid' : f ? (o.married ? 'bun' : 'braid') : outfit === 'monk' ? null : outfit === 'bandit' && !o.hat ? 'loose' : 'topknot';
    if (style) {
      const hm = new THREE.Mesh(hairGeometry(style), hairMaterial(hair)); hm.castShadow = true; HF.add(hm); this.lodParts.push([hm, () => hairGeometry(style), () => hairGeometry(style, true)]);
      // grow the hair cap (an ellipsoid shell about HC.c) until the MakeHuman scalp sits inside it
      if (fv?.hairK > 0.97) { const k = fv.hairK * 1.025 + 0.012; hm.scale.setScalar(k); hm.position.set(0, HC.c[1] * (1 - k), HC.c[2] * (1 - k)); this.hairFit = k; }
    }
    if (style === 'bun') P.add('head', cyl(0.005, 0.005, 0.2, 6), '#d9b44a', 'metal', M(0, 0.07, -0.13, 0, 0, Math.PI / 2));
    if (style === 'braid') { P.add('head', new THREE.BoxGeometry(0.06, 0.1, 0.01), ribbon, 'silk', M(0, -0.33, -0.15, -0.1)); P.add('head', new THREE.BoxGeometry(0.05, 0.03, 0.02), ribbon, 'silk', M(0, -0.28, -0.142)); }
    if (style === 'topknot') {
      P.add('head', new THREE.TorusGeometry(0.1, 0.007, 6, 32), '#1a1614', 'hair', M(0, 0.155, -0.012, Math.PI / 2 - 0.22, 0, 0, 0.95, 1.12, 1));
      P.add('head', cyl(0.003, 0.003, 0.08, 5), '#d9c9a0', 'metal', M(0, 0.235, -0.012, 0, 0, Math.PI / 2));
    }
    // brows
    const browC = elder ? '#8a8580' : hair;
    // two tapered strokes per brow give a natural arch instead of a flat bar
    if (!fv) for (const sx of [-1, 1]) {
      const bw = f ? 0.0026 : 0.0036;
      P.add('head', capsule(bw * 1.15, 0.016, 2, 6), browC, 'hair', M(sx * 0.027, 0.1405, 0.0975, -0.25, sx * 0.25, Math.PI / 2 + sx * (f ? -0.05 : 0.02)));
      P.add('head', capsule(bw * 0.85, 0.014, 2, 6), browC, 'hair', M(sx * 0.0405, 0.139, 0.0935, -0.25, sx * 0.45, Math.PI / 2 + sx * (f ? 0.32 : 0.26)));
    }
    // facial hair
    if (!f && o.age !== 'young' && (o.beard ?? true)) {
      const bc = elder ? '#cfcac0' : hair;
      // on a MakeHuman face, place the moustache and goatee from its mouth landmark
      const my = fv?.mouth ? fv.mouth.y + 0.008 : 0.0585, mz = fv?.mouth ? fv.mouth.z + 0.001 : 0.0995;
      for (const sx of [-1, 1]) P.add('head', capsule(0.0034, 0.02, 2, 6), bc, 'hair', M(sx * 0.0135, my, mz, 0, sx * 0.35, sx * 1.25));
      const gy = fv?.mouth ? fv.mouth.y - 0.024 : null, gz = fv?.mouth ? fv.mouth.z - 0.012 : null;
      if (elder) P.add('head', new THREE.ConeGeometry(0.014, 0.065, 10), bc, 'hair', M(0, gy != null ? gy - 0.02 : -0.012, gz ?? 0.068, Math.PI - 0.35)); else P.add('head', capsule(0.0065, 0.016, 3, 8), bc, 'hair', M(0, gy ?? 0.008, gz ?? 0.074, -0.3));
    }
    // ----- Hats -----
    if (o.hat === 'gat') {
      P.add('head', cyl(0.3, 0.3, 0.006, 40), '#141210', 'gat', M(0, 0.195, -0.01, -0.05));
      P.add('head', cyl(0.074, 0.084, 0.15, 28, true), '#141210', 'gat', M(0, 0.272, -0.016, -0.05));
      P.add('head', cyl(0.074, 0.074, 0.004, 28), '#141210', 'gat', M(0, 0.347, -0.02, -0.05));
      // gatkkeun: a strand of beads from the brim down under the chin
      for (let i = 0; i < 17; i++) { const a = -1.15 + i * (2.3 / 16); P.add('head', sphere(0.0042, 6, 4), '#c9a45c', 'metal', M(Math.sin(a) * 0.082, 0.04 - Math.cos(a) * 0.045, 0.012 + 0.05 * Math.cos(a))); }
    } else if (o.hat === 'satgat') {
      P.add('head', new THREE.ConeGeometry(0.32, 0.17, 32, 1, true), '#b89a5a', 'body', M(0, 0.285, -0.01, -0.06));
      P.add('head', new THREE.ConeGeometry(0.3, 0.155, 32, 1, true), '#8a6a3a', 'body', M(0, 0.28, -0.01, -0.06 + Math.PI, 0, 0, 1, -1, 1));
    } else if (o.hat === 'helmet') {
      P.add('head', new THREE.SphereGeometry(0.122, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), '#2a2a2e', 'metal', M(0, 0.15, -0.01));
      P.add('head', new THREE.ConeGeometry(0.05, 0.14, 12), '#c9a45c', 'metal', M(0, 0.31, -0.01));
      P.add('head', cyl(0.126, 0.13, 0.03, 24), '#c9a45c', 'metal', M(0, 0.16, -0.01));
      P.add('head', sphere(0.04, 10, 8), '#b8241e', 'body', M(0, 0.39, -0.01, 0, 0, 0, 1, 1.6, 1));
      for (const sx of [-1, 1]) P.add('head', new THREE.BoxGeometry(0.07, 0.12, 0.015), '#2a2a2e', 'metal', M(sx * 0.105, 0.09, -0.02, 0, sx * 0.4, 0));
    } else if (o.hat === 'jeonrip') {
      P.add('head', cyl(0.26, 0.26, 0.01, 32), '#1c1a18', 'body', M(0, 0.205, -0.01));
      P.add('head', new THREE.SphereGeometry(0.108, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), '#1c1a18', 'body', M(0, 0.205, -0.01));
      P.add('head', sphere(0.03, 8, 6), '#b8241e', 'body', M(0, 0.31, -0.01, 0, 0, 0, 1, 1.4, 1));
    } else if (o.hat === 'headband') {
      P.add('head', new THREE.TorusGeometry(0.1, 0.011, 6, 32), ribbon, 'body', M(0, 0.15, -0.012, Math.PI / 2 - 0.2, 0, 0, 0.96, 1.12, 1));
    } else if (o.hat === 'ikseon') {
      P.add('head', new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), '#121010', 'silk', M(0, 0.165, -0.01, 0, 0, 0, 1, 0.9, 1.05));
      P.add('head', cyl(0.095, 0.1, 0.09, 24), '#121010', 'silk', M(0, 0.2, -0.04));
      for (const sx of [-1, 1]) P.add('head', new THREE.BoxGeometry(0.09, 0.06, 0.006), '#121010', 'silk', M(sx * 0.05, 0.27, -0.1, -0.3, 0, sx * -0.35));
    } else if (o.hat === 'jokduri') {
      P.add('head', cyl(0.045, 0.055, 0.055, 6), '#1c1a18', 'silk', M(0, 0.245, 0.0));
      P.add('head', sphere(0.011, 6, 4), '#d9a520', 'metal', M(0, 0.28, 0.0));
    }
    // goreum ribbon on the jacket front
    if (!armored && outfit !== 'bandit' && outfit !== 'monk') {
      const zf = f ? 0.118 : 0.122, yb = f ? 0.02 : 0.02;
      P.add('chest', new THREE.BoxGeometry(0.028, f ? 0.22 : 0.15, 0.006), ribbon, 'silk', M(-0.035, yb - (f ? 0.1 : 0.06), zf, 0.15, 0, 0.12));
      P.add('chest', new THREE.BoxGeometry(0.024, f ? 0.17 : 0.12, 0.006), ribbon, 'silk', M(-0.012, yb - (f ? 0.08 : 0.05), zf + 0.003, 0.15, 0, -0.1));
      P.add('chest', sphere(0.016, 8, 6), ribbon, 'silk', M(-0.025, yb + 0.01, zf - 0.004, 0, 0, 0, 1.5, 1, 0.6));
    }
    if (armored) {
      for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; P.add('chest', sphere(0.009, 6, 4), '#d9b44a', 'metal', M(Math.sin(a) * 0.168, 0.02 + (i % 2) * 0.07, Math.cos(a) * 0.118)); }
      for (const sx of [-1, 1]) P.add(sx > 0 ? 'lShoulder' : 'rShoulder', sphere(0.085, 14, 8), o.colors.armor || '#2c3a5e', 'body', M(sx * 0.01, 0.0, 0, 0, 0, 0, 1.15, 0.7, 1.05));
    }
    if (o.royal) {
      const gold = '#d9b44a';
      P.add('chest', cyl(0.07, 0.07, 0.006, 24).rotateX(Math.PI / 2), gold, 'metal', M(0, 0.04, 0.125));
      P.add('chest', cyl(0.05, 0.05, 0.008, 24).rotateX(Math.PI / 2), '#b8862a', 'metal', M(0, 0.04, 0.128));
      for (const sx of [-1, 1]) P.add(sx > 0 ? 'lShoulder' : 'rShoulder', cyl(0.05, 0.05, 0.006, 20).rotateZ(Math.PI / 2), gold, 'metal', M(sx * 0.07, -0.02, 0));
    }
    if (outfit === 'merchant') P.add('spine', new THREE.BoxGeometry(0.16, 0.12, 0.06), '#7a5a3a', 'body', M(-0.17, 0.0, 0.02, 0, 0, 0.1));
    if (outfit === 'bandit') P.add('head', new THREE.BoxGeometry(0.16, 0.06, 0.05), '#2a2420', 'body', M(0, 0.05, 0.085));

    // ----- rigid accessory meshes per bone -----
    this.meshes = [mesh];
    for (const key in P.parts) {
      const [bone, matKey] = key.split('|');
      const g = mergeGeometries(P.parts[key]);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, CHAR_MATS[matKey]);
      m.castShadow = matKey !== 'gat';
      (bone === 'head' ? this.headFrame : this.bones[bone]).add(m); this.meshes.push(m);
    }
    if (!fv) {
    // eyes (separate so we can blink)
    const eg = [];
    const irisC = new THREE.Color(o.eyeColor || '#3a2216');
    const EY = 0.112;
    const col = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034;
      eg.push(col(sphere(0.0138, 16, 12).applyMatrix4(M(ex, EY, 0.0845, 0, 0, 0, 1.12, 0.86, 0.8)), new THREE.Color('#ece6de')));

      eg.push(col(sphere(0.0021, 6, 4).applyMatrix4(M(ex + 0.0032, EY + 0.0038, 0.0978)), new THREE.Color('#ffffff')));
      eg.push(col(capsule(0.0019, 0.027, 2, 6).applyMatrix4(M(ex, EY + 0.0072, 0.0968, -0.2, sx * 0.25, Math.PI / 2 + sx * 0.1)), new THREE.Color('#120c0a')));
    }
    const eyeGeo = mergeGeometries(eg.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
    eyeGeo.translate(0, -EY, 0);
    this.eyes = new THREE.Mesh(eyeGeo, CHAR_MATS.eyes);
    this.eyes.position.y = EY;
    this.headFrame.add(this.eyes);
    // textured irises + wet corneas + upper lashes (children of the eye mesh so they blink with it)
    const irisMat = this.irisMat = new THREE.MeshStandardMaterial({ map: irisTexture(o.eyeColor || ['#4a2c18', '#3a2216', '#2a1a10', '#5a3a20'][Math.floor(Math.random() * 4)]), roughness: 0.35 });
    const lashMat = CHAR_MATS.lash || (CHAR_MATS.lash = new THREE.MeshStandardMaterial({ color: '#0e0a08', roughness: 0.7, side: THREE.DoubleSide }));
    const irisG = [], corG = [], lashG = [];
    const tmp = new THREE.Object3D();
    const place = (g, x, y, z, rx, ry, rz) => { tmp.position.set(x, y, z); tmp.rotation.set(rx || 0, ry || 0, rz || 0); tmp.updateMatrix(); return g.applyMatrix4(tmp.matrix); };
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034;
      irisG.push(place(new THREE.CircleGeometry(0.0102, 24), ex - sx * 0.0004, -0.0004, 0.0968, 0, sx * 0.06, 0));
      corG.push(place(new THREE.SphereGeometry(0.0108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), ex, 0, 0.0905, Math.PI / 2, 0, 0));
      for (let i = 0; i < 9; i++) { const t = i / 8; const a = (t - 0.5) * 2.2; const L = 0.0045 + Math.sin(t * Math.PI) * 0.003 + (sx * (t - 0.5) > 0 ? 0.0015 : 0); lashG.push(place(new THREE.BoxGeometry(0.0007, L, 0.0006).translate(0, L / 2, 0), ex + Math.sin(a) * 0.0145, Math.cos(a) * 0.0095 + 0.001, 0.093 - Math.abs(Math.sin(a)) * 0.006, -0.7, 0, -Math.sin(a) * 0.9)); }
    }
    this.eyes.add(new THREE.Mesh(mergeGeometries(irisG), irisMat), new THREE.Mesh(mergeGeometries(corG), corneaMat), new THREE.Mesh(mergeGeometries(lashG), lashMat));
    // eyelids (skin) — give almond-shaped Sims-like eyes
    const lids = [];
    for (const sx of [-1, 1]) {
      const ex = sx * 0.034;
      lids.push(new THREE.SphereGeometry(0.0152, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4).applyMatrix4(M(ex, EY + 0.0005, 0.0842, 0.32, 0, 0, 1.12, 0.9, 0.86)));
      lids.push(new THREE.SphereGeometry(0.0148, 18, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32).applyMatrix4(M(ex, EY, 0.0842, -0.15, 0, 0, 1.12, 0.9, 0.84)));
    }
    const lidGeo = mergeGeometries(lids.map((g) => g.toNonIndexed()));
    this.lids = new THREE.Mesh(lidGeo, this.skinMat); this.headFrame.add(this.lids);
    }
    if (outfit === 'child') { this.bones.head.scale.setScalar(1.32); this.scale *= 0.6; }
    this.root.scale.setScalar(this.scale);

    // weapon: hwando (sword) — scabbard on hip, blade in hand when drawn
    if (o.weapon) {
      const sw = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.78).translate(0, 0, 0.47), CHAR_MATS.steel);
      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4).rotateX(Math.PI / 2).translate(0, 0, 0.9), CHAR_MATS.steel);
      const guard = new THREE.Mesh(cyl(0.04, 0.04, 0.012, 10).rotateX(Math.PI / 2).translate(0, 0, 0.07), new THREE.MeshStandardMaterial({ color: '#c9a45c', roughness: 0.35, metalness: 0.85 }));
      const grip = new THREE.Mesh(cyl(0.016, 0.016, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, -0.04), new THREE.MeshStandardMaterial({ color: '#2a1612', roughness: 0.7 }));
      const tassel = new THREE.Mesh(sphere(0.02, 6, 4).scale(1, 2.5, 1).translate(0, -0.05, -0.16), new THREE.MeshStandardMaterial({ color: '#b8241e', roughness: 0.8 }));
      sw.add(blade, bladeTip, guard, grip, tassel);
      sw.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      this.sword = sw; this.swordBlade = blade;
      const scab = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.8).translate(0, 0, 0.42), new THREE.MeshStandardMaterial({ color: '#1e1412', roughness: 0.4, metalness: 0.2 }));
      this.scabbard = new THREE.Group(); this.scabbard.add(scab);
      this.scabbard.position.set(sil === 'robe' || sil === 'armor' ? 0.2 : 0.18, 0.04, 0.02); this.scabbard.rotation.set(Math.PI * 0.84, 0.25, 0);
      this.bones.hips.add(this.scabbard);
      this.sheathe();
    }
    this.props = {};
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.material && (o.material === this.skinMat || o.material.map?.isCanvasTexture === false)) {} });
    this.skinMat?.dispose(); this.irisMat?.dispose();
    this.root.parent?.remove(this.root);
  }

  // Put the blade in the hand and point it along the line of the forearm. The old fixed rotation was
  // tuned for the hand-built rig, where the arm hung straight down and the hand bone's axes happened to
  // line up; on a MakeHuman body the arm is bound 0.32 rad out from vertical, so that same rotation laid
  // the sword diagonally across the character's back instead of in their grip.
  draw() {
    if (!this.sword) return;
    this.swordDrawn = true;
    this.bones.rHand.add(this.sword);
    this.sword.position.set(0, -0.06, 0.01);
    this.aimSword();
  }
  aimSword() {
    const sw = this.sword; if (!sw || !this.swordDrawn) return;
    this.root.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.bones.rElbow.getWorldPosition(a); this.bones.rHand.getWorldPosition(b);
    const dir = b.sub(a);
    if (dir.lengthSq() < 1e-8) { sw.rotation.set(0.15, 0, 0); return; }
    dir.normalize();
    // into the hand bone's own space, so the result is right whatever the rig or the pose
    const inv = new THREE.Matrix4().extractRotation(this.bones.rHand.matrixWorld).invert();
    dir.applyMatrix4(inv).normalize();
    sw.quaternion.setFromUnitVectors(FWD, dir);
    // then raise the point to a guard angle rather than letting it hang straight down the arm
    sw.rotateX(-GUARD);
  }
  sheathe() { if (!this.sword) return; this.swordDrawn = false; this.scabbard.add(this.sword); this.sword.position.set(0, 0, 0.14); this.sword.rotation.set(Math.PI, 0, 0); this.sword.position.z = 0.0; this.sword.rotation.set(0, 0, 0); this.sword.position.set(0, 0, -0.06); }
  swordTip(out) { if (!this.sword) return null; return this.sword.localToWorld(out.set(0, 0, 0.92)); }
  swordBase(out) { if (!this.sword) return null; return this.sword.localToWorld(out.set(0, 0, 0.15)); }

  setProp(name) {
    this.propName = name || null;
    if (this.propMesh) { this.propMesh.parent?.remove(this.propMesh); this.propMesh = null; }
    if (this._ropes) { for (const r of this._ropes) r.parent?.remove(r); this._ropes = null; }
    if (this._extra) { this._extra.parent?.remove(this._extra); this._extra = null; }
    if (!name) return;
    let m;
    if (name === 'book') { m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: '#e8dcb8' })); m.position.set(0, -0.06, 0.08); this.bones.lHand.add(m); }
    if (name === 'cup') { m = new THREE.Mesh(cyl(0.04, 0.03, 0.05, 10), new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.3 })); m.position.set(0, -0.06, 0.03); this.bones.rHand.add(m); }
    if (name === 'bowl') { m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.3, side: THREE.DoubleSide })); m.position.set(0, -0.04, 0.06); this.bones.lHand.add(m); }
    if (name === 'hoe') { m = new THREE.Group(); const h = new THREE.Mesh(cyl(0.015, 0.015, 1.3, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2a' })); const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.7, roughness: 0.4 })); b.position.set(0, -0.6, 0.08); m.add(h, b); m.position.set(0, -0.05, 0.02); m.rotation.x = Math.PI / 2; this.bones.rHand.add(m); }
    if (name === 'bow') { m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 4, 20, Math.PI * 0.85), new THREE.MeshStandardMaterial({ color: '#3a2214' })); m.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.25 * 0); m.position.set(0, -0.04, 0); this.bones.lHand.add(m); }
    if (name === 'fan') { m = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12, 0, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: '#f2ead6', side: THREE.DoubleSide })); m.position.set(0, -0.05, 0.05); m.rotation.set(0, 0, 1); this.bones.rHand.add(m); }
    if (name === 'rod') { m = new THREE.Mesh(cyl(0.008, 0.014, 2.6, 5).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#6b5a2a', roughness: 0.6 })); m.rotation.set(1.0, 0, 0); m.position.set(0, -0.05, 0.02); const line = new THREE.Mesh(cyl(0.002, 0.002, 2.2, 3).translate(0, -1.1, 0), new THREE.MeshBasicMaterial({ color: '#ddd' })); line.position.set(0, 2.6, 0); line.rotation.x = -1.0; m.add(line); this.bones.rHand.add(m); }
    if (name === 'ropes') { m = new THREE.Group(); for (const b of ['lHand', 'rHand']) { const r = new THREE.Mesh(cyl(0.012, 0.012, 4.2, 4).translate(0, 2.1, 0), new THREE.MeshStandardMaterial({ color: '#a8885a' })); this.bones[b].add(r); m.add(new THREE.Object3D()); (this._ropes ||= []).push(r); } }
    if (name === 'yut') { m = new THREE.Group(); for (let i = 0; i < 2; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.012), new THREE.MeshStandardMaterial({ color: '#e8dcc0' })); st.position.set(i * 0.02, -0.08, 0.03); m.add(st); } this.bones.rHand.add(m); }
    if (name === 'jegi') { m = new THREE.Mesh(sphere(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: '#c0392b' })); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#f2ece0' })); tail.position.y = 0.07; m.add(tail); m.userData.jegi = true; this.root.add(m); }
    if (name === 'baby') { m = new THREE.Mesh(sphere(0.1, 12, 8).scale(1, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: '#f2ece0', roughness: 0.8 })); m.position.set(-0.12, -0.02, 0.1); const face = new THREE.Mesh(sphere(0.05, 10, 8), this.skinMat); face.position.set(0, 0.03, 0.11); m.add(face); this.bones.lElbow.add(m); }
    if (name === 'brush') { m = new THREE.Mesh(cyl(0.006, 0.004, 0.22, 5), new THREE.MeshStandardMaterial({ color: '#3a2a1a' })); m.position.set(0, -0.06, 0.06); m.rotation.x = 1.2; this.bones.rHand.add(m); const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshStandardMaterial({ color: '#f4ecd8', side: THREE.DoubleSide })); paper.rotation.x = -Math.PI / 2; paper.position.set(0, 0.03, 0.42); this.root.add(paper); this._extra = paper; }
    if (name === 'gayageum') { m = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 1.5), new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.5 })); m.add(body); for (let i = 0; i < 12; i++) { const str = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 1.4), new THREE.MeshBasicMaterial({ color: '#f2e6c0' })); str.position.set(-0.11 + i * 0.02, 0.04, 0); m.add(str); const br = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 4), new THREE.MeshStandardMaterial({ color: '#e8dcc0' })); br.position.set(-0.11 + i * 0.02, 0.055, -0.1 + (i % 3) * 0.12); m.add(br); } m.position.set(0.05, 0.28, 0.35); m.rotation.set(0, 0.35, 0.1); this.root.add(m); }
    if (name === 'kite') { m = new THREE.Group(); const sp = new THREE.Mesh(cyl(0.03, 0.03, 0.12, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7a5a32' })); m.add(sp); this.bones.rHand.add(m); }
    if (name === 'snowball') { m = new THREE.Mesh(sphere(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9 })); m.position.set(0, -0.08, 0.03); this.bones.rHand.add(m); }
    if (name === 'ladle') { m = new THREE.Group(); const h = new THREE.Mesh(cyl(0.01, 0.01, 0.6, 5), new THREE.MeshStandardMaterial({ color: '#6b4a2a' })); h.position.y = -0.25; const b = new THREE.Mesh(sphere(0.05, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#6b4a2a', side: THREE.DoubleSide })); b.position.y = -0.55; m.add(h, b); m.position.set(0, -0.05, 0.03); this.bones.rHand.add(m); }
    if (name === 'banner') { m = new THREE.Group(); const pole = new THREE.Mesh(cyl(0.02, 0.02, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#4a3020' })); pole.position.y = 1.0; const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshStandardMaterial({ color: this.o.bannerColor || '#a3262a', side: THREE.DoubleSide })); fl.position.set(0.37, 2.0, 0); m.add(pole, fl); m.position.set(0, -0.05, 0.02); m.rotation.x = -Math.PI / 2 + 0.1; this.bones.rHand.add(m); }
    if (name === 'drum') { m = new THREE.Mesh(cyl(0.28, 0.28, 0.32, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#a3262a', roughness: 0.6 })); m.position.set(0, 1.0, 0.5); this.root.add(m); }
    if (name === 'cup' && false) {}
    if (name === 'lantern') { m = new THREE.Mesh(cyl(0.1, 0.09, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#c0392b', emissive: '#ff8a3a', emissiveIntensity: 2 })); m.position.set(0, -0.25, 0.05); this.bones.rHand.add(m); }
    this.propMesh = m;
  }

  setPregnant(on) {
    if (on && !this.bump) {
      const g = sphere(0.12, 18, 12); g.scale(1, 1.05, 0.95);
      const n = g.attributes.position.count;
      g.setAttribute('aRegion', new THREE.BufferAttribute(new Float32Array(n).fill(this.o.sex === 'f' && silhouetteFor(this.o.sex, this.o.outfit) === 'chima' ? PAL.bottom : PAL.top), 1));
      this.bump = new THREE.Mesh(g, this.skinMat); this.bump.position.set(0, 0.0, 0.07); this.bump.scale.setScalar(0.3); this.bones.spine.add(this.bump);
    }
    if (!on && this.bump) { this.bump.parent.remove(this.bump); this.bump = null; }
  }
  setBumpSize(k) { if (this.bump) this.bump.scale.setScalar(0.3 + k * 0.75); }

  setAnim(name, snap = 10) {
    if (this.anim !== name) {
      this.anim = name; this.animT = 0; this.snap = snap;
      // the arm sits differently in each pose, so a drawn blade re-finds the line of the forearm
      if (this.swordDrawn) this.aimSword();
    }
  }

  // ---------- Procedural animation ----------
  // 0 = full detail, 1 = low-res sculpts, 2 = also drop facial details and small shadows
  setLOD(l) {
    if (l === this.lod) return;
    this.lod = l;
    for (const [m, hi, lo] of this.lodParts || []) { m.geometry = l > 0 ? lo() : hi(); m.castShadow = l < 2; }
    if (this.eyes) this.eyes.visible = l < 2;
    if (this.lids) this.lids.visible = l < 2;
    for (const m of this.faceParts || []) m.visible = l < 2;
    // MakeHuman bodies switch to their light mesh from mid range, and stop casting shadows far away
    const far = this.mh ? l >= 1 : l === 2;
    if (this.bodyLod) { const [m, hi, lo] = this.bodyLod; m.geometry = far ? lo() : hi; if (this.mh) m.castShadow = l < 2; }
    if (this.mhSkin) { this.mhSkin.geometry = far ? (this.mh.skinLo || this.mh.skin) : this.mh.skin; this.mhSkin.castShadow = l < 2; }
    for (const m of this.meshes || []) if (m !== this.skinned && (m.parent === this.bones.head || m.parent === this.headFrame)) m.castShadow = l < 2 && m.material !== CHAR_MATS.gat;
    // a far head is a handful of pixels: its shadow is pure cost
    if (this.headMesh) this.headMesh.castShadow = l < 2;
    this._setTiny(l);
  }

  // Beyond mid range a villager is a few pixels tall, but each belt loop, shoe, hairpin and topknot was
  // still being issued as its own draw call — the most expensive way possible to draw nothing anyone can
  // see. From LOD 2 the small parts go; the head, hair, hat, body and clothes keep the silhouette intact.
  _setTiny(l) {
    const n = (this.meshes || []).length;
    if (!this._tiny || this._tinyN !== n) {
      this._tiny = []; this._tinyN = n;
      const keep = new Set([this.skinned, this.mhSkin, this.eyes, this.lids]);
      this.root.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        if (keep.has(o) || o.material === CHAR_MATS.gat) return;
        const g = o.geometry; const t = g?.index ? g.index.count / 3 : (g?.attributes?.position?.count || 0) / 3;
        if (t > 0 && t < 150) this._tiny.push(o);
      });
    }
    const show = l < 2;
    for (const m of this._tiny) {
      if (!show && !m.userData.lodHidden) { m.userData.lodWas = m.visible; m.userData.lodHidden = true; m.visible = false; }
      else if (show && m.userData.lodHidden) { m.userData.lodHidden = false; m.visible = m.userData.lodWas !== false; }
    }
  }
  update(dt, speed) {
    this.animT += dt; this.speed = speed;
    const T = this.target; const R = this.rootTarget;
    for (const b of BONES) { const t = T[b]; t.x = 0; t.y = 0; t.z = 0; }
    R.y = 0; R.rx = 0; R.rz = 0; R.fwd = 0;
    const f = this.o.sex === 'f';
    const t = this.animT;
    const elder = this.o.age === 'elder';
    // baseline: arms relaxed slightly out
    T.lShoulder.z = 0.12; T.rShoulder.z = -0.12; T.lElbow.x = -0.15; T.rElbow.x = -0.15;
    if (elder) { T.spine.x = 0.15; T.neck.x = -0.1; }
    const breath = Math.sin(this.phase * 0.8 + t * 1.6) * 0.02;
    T.chest.x += breath;
    let k = this.snap;
    const A = this.anim;

    if (A === 'walk' || A === 'run' || A === 'sneak' || A === 'flee') {
      const run = A === 'run' || A === 'flee';
      const fr = run ? 9.5 : 6.2 * clamp(speed / 1.4, 0.6, 1.4);
      this.phase += dt * fr;
      const p = this.phase;
      const sw = run ? 0.85 : (f ? 0.32 : 0.5);
      T.lHip.x = Math.sin(p) * sw; T.rHip.x = -Math.sin(p) * sw;
      T.lKnee.x = Math.max(0, -Math.cos(p)) * (run ? 1.5 : 0.75) + 0.08; T.rKnee.x = Math.max(0, Math.cos(p)) * (run ? 1.5 : 0.75) + 0.08;
      T.lFoot.x = -Math.sin(p) * 0.2; T.rFoot.x = Math.sin(p) * 0.2;
      const as = run ? 0.9 : (f ? 0.25 : 0.42);
      T.lShoulder.x = -Math.sin(p) * as; T.rShoulder.x = Math.sin(p) * as;
      T.lElbow.x = run ? -1.3 : -0.25; T.rElbow.x = run ? -1.3 : -0.25;
      T.hips.y = Math.sin(p) * 0.1; T.chest.y = -Math.sin(p) * 0.14;
      T.spine.x = run ? 0.22 : 0.04; if (elder) T.spine.x += 0.12;
      R.y = Math.abs(Math.cos(p)) * (run ? 0.07 : 0.035) - (run ? 0.04 : 0.01);
      if (this.swordDrawn && !run) { T.rShoulder.x = -0.5; T.rElbow.x = -0.9; }
      if (A === 'flee') { T.lShoulder.x = -2.5; T.rShoulder.x = -2.5 + Math.sin(p) * 0.3; T.lElbow.x = -0.8; T.rElbow.x = -0.8; }
      if (f && !run) { T.lShoulder.x *= 0.5; T.rShoulder.x *= 0.5; T.lElbow.x = -0.5; T.rElbow.x = -0.5; T.lShoulder.z = 0.05; T.rShoulder.z = -0.05; }
      k = 14;
    } else if (A === 'idle' || A === 'guard') {
      const s = Math.sin(t * 0.7 + this.phase);
      T.hips.z = s * 0.02; T.lHip.z = 0.03; T.rHip.z = -0.03; T.head.y = Math.sin(t * 0.37 + this.phase) * 0.25; T.head.x = Math.sin(t * 0.23) * 0.06;
      if (A === 'guard') { T.lShoulder.x = -0.3; T.lElbow.x = -1.2; T.lShoulder.z = 0.3; T.rShoulder.z = -0.15; T.spine.x = -0.05; T.head.y *= 0.5; }
      if (f) { T.lShoulder.x = -0.35; T.rShoulder.x = -0.35; T.lElbow.x = -1.0; T.rElbow.x = -1.0; T.lShoulder.z = -0.12; T.rShoulder.z = 0.12; }
    } else if (A === 'talk' || A === 'laugh' || A === 'angry' || A === 'flirt' || A === 'cheer' || A === 'sad') {
      const g = Math.sin(t * 2.2 + this.phase);
      T.head.x = Math.sin(t * 3.1) * 0.06; T.head.y = Math.sin(t * 0.9) * 0.15;
      T.rShoulder.x = -0.5 - g * 0.25; T.rElbow.x = -1.2 + g * 0.3; T.rShoulder.z = -0.25;
      T.lShoulder.x = -0.15 + g * 0.1;
      this.mouth = Math.abs(Math.sin(t * 11)) * 0.8;
      if (A === 'laugh') { T.spine.x = -0.12 + Math.abs(Math.sin(t * 9)) * 0.08; T.head.x = -0.25; T.lShoulder.x = -0.6; T.lElbow.x = -1.6; T.rShoulder.x = -0.6; T.rElbow.x = -1.6; R.y = Math.abs(Math.sin(t * 9)) * 0.02; }
      if (A === 'angry') { T.spine.x = 0.15; T.head.x = 0.1; T.rShoulder.x = -1.2 - Math.abs(g) * 0.4; T.rElbow.x = -0.2; T.lShoulder.z = 0.4; T.lElbow.x = -1.6; }
      if (A === 'flirt') { T.head.z = 0.18; T.hips.z = 0.06; T.lShoulder.x = -0.3; T.lElbow.x = -1.8; T.rShoulder.x = -0.2; T.rElbow.x = -0.6; }
      if (A === 'cheer') { T.lShoulder.x = -2.8 + g * 0.2; T.rShoulder.x = -2.8 - g * 0.2; T.lElbow.x = -0.3; T.rElbow.x = -0.3; R.y = Math.abs(Math.sin(t * 6)) * 0.08; }
      if (A === 'sad') { T.head.x = 0.4; T.spine.x = 0.2; T.rShoulder.x = 0; T.rElbow.x = -0.2; this.mouth = 0; }
    } else if (A === 'bow') {
      const b = Math.min(1, t * 1.8) * (t > 1.6 ? Math.max(0, 1 - (t - 1.6) * 2) : 1);
      T.spine.x = 0.65 * b; T.chest.x = 0.25 * b; T.neck.x = 0.2 * b;
      T.lShoulder.x = -0.5 * b; T.rShoulder.x = -0.5 * b; T.lElbow.x = -1.2 * b; T.rElbow.x = -1.2 * b; T.lShoulder.z = -0.35 * b; T.rShoulder.z = 0.35 * b;
    } else if (A === 'sit' || A === 'eat' || A === 'study' || A === 'drink') {
      R.y = -this.legLen + 0.2;
      T.lHip.x = -1.45; T.rHip.x = -1.45; T.lHip.z = 0.65; T.rHip.z = -0.65; T.lKnee.x = 2.4; T.rKnee.x = 2.4; T.lHip.y = -0.4; T.rHip.y = 0.4;
      T.lShoulder.x = -0.4; T.rShoulder.x = -0.4; T.lElbow.x = -0.9; T.rElbow.x = -0.9;
      T.head.y = Math.sin(t * 0.4 + this.phase) * 0.3;
      if (A === 'eat') { const e = Math.max(0, Math.sin(t * 2.4)); T.rShoulder.x = -0.6 - e * 0.6; T.rElbow.x = -1.4 - e * 0.9; T.lShoulder.x = -0.55; T.lElbow.x = -1.2; T.head.x = 0.15 - e * 0.15; this.mouth = e * 0.6; }
      if (A === 'drink') { const e = Math.max(0, Math.sin(t * 1.2)); T.rShoulder.x = -0.6 - e * 0.7; T.rElbow.x = -1.4 - e * 0.8; T.head.x = -e * 0.3; }
      if (A === 'study') { T.lShoulder.x = -0.7; T.lElbow.x = -1.0; T.lShoulder.z = -0.15; T.head.x = 0.35; T.rShoulder.x = -0.6; T.rElbow.x = -0.9; T.head.y = Math.sin(t * 0.5) * 0.1; }
    } else if (A === 'sleep') {
      R.y = 0.12; R.rx = -Math.PI / 2;
      T.lShoulder.z = 0.05; T.rShoulder.z = -0.05; T.head.y = 0.3; T.chest.x = Math.sin(t * 1.2) * 0.04;
    } else if (A === 'dead') {
      R.y = 0.14; R.rx = -Math.PI / 2; R.rz = 0.0;
      T.lShoulder.z = 0.9; T.rShoulder.z = -1.1; T.head.y = 0.6; T.lHip.z = 0.2; T.rKnee.x = 0.5; T.rHip.x = -0.3;
      k = 5;
    } else if (A === 'wash') {
      T.spine.x = 0.7; T.chest.x = 0.3; T.lHip.x = -0.5; T.rHip.x = -0.5; T.lKnee.x = 1.0; T.rKnee.x = 1.0; R.y = -0.18;
      const w = Math.sin(t * 4); T.lShoulder.x = -1.0 + w * 0.3; T.rShoulder.x = -1.0 - w * 0.3; T.lElbow.x = -1.2; T.rElbow.x = -1.2;
    } else if (A === 'pray') {
      const b = (Math.sin(t * 0.8) * 0.5 + 0.5);
      T.spine.x = 0.15 + b * 0.35; T.neck.x = 0.2;
      T.lShoulder.x = -0.9; T.rShoulder.x = -0.9; T.lShoulder.z = -0.4; T.rShoulder.z = 0.4; T.lElbow.x = -1.4; T.rElbow.x = -1.4;
    } else if (A === 'court') {
      T.spine.x = 0.25; T.neck.x = 0.15; T.lShoulder.x = -0.8; T.rShoulder.x = -0.8; T.lShoulder.z = -0.35; T.rShoulder.z = 0.35; T.lElbow.x = -1.3; T.rElbow.x = -1.3;
    } else if (A === 'farm') {
      const c = (t * 1.3) % 1; const up = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
      T.spine.x = 0.4 + (1 - up) * 0.25; T.lHip.x = -0.3; T.rHip.x = 0.2; T.lKnee.x = 0.4; T.rKnee.x = 0.3; R.y = -0.06;
      T.rShoulder.x = -0.4 - up * 1.8; T.lShoulder.x = -0.3 - up * 1.6; T.rElbow.x = -0.4; T.lElbow.x = -0.5; T.lShoulder.z = -0.2; T.rShoulder.z = 0.2;
      k = 14;
    } else if (A === 'aim') {
      // bow held out, string drawn back to the cheek as drawK goes 0→1
      const d = this.drawK || 0;
      T.chest.y = 0.95; T.head.y = -0.95; T.spine.x = 0.05; T.lShoulder.x = -1.57; T.lShoulder.z = -0.05; T.lElbow.x = -0.05;
      T.rShoulder.x = -1.45 - d * 0.1; T.rShoulder.z = 0.15 + d * 0.35; T.rElbow.x = -0.6 - d * 1.9; T.lHip.z = 0.16; T.rHip.z = -0.16;
      k = 16;
    } else if (A === 'archery') {
      T.chest.y = 0.9; T.head.y = -0.9; T.lShoulder.x = -1.55; T.lShoulder.z = 0.0; T.lElbow.x = 0;
      const d = Math.min(1, (t % 3) / 1.5); T.rShoulder.x = -1.5; T.rShoulder.z = 0.3 * d; T.rElbow.x = -2.2 * d; T.lHip.z = 0.18; T.rHip.z = -0.18;
    } else if (A === 'dance') {
      const p = t * 2.0 + this.phase;
      T.lShoulder.x = -1.4 + Math.sin(p) * 0.6; T.rShoulder.x = -1.4 - Math.sin(p) * 0.6; T.lShoulder.z = 0.8 + Math.sin(p * 0.5) * 0.3; T.rShoulder.z = -0.8 + Math.sin(p * 0.5) * 0.3;
      T.lElbow.x = -0.5 - Math.sin(p * 2) * 0.3; T.rElbow.x = -0.5 + Math.sin(p * 2) * 0.3; T.hips.y = Math.sin(p * 0.5) * 0.6;
      T.lKnee.x = Math.max(0, Math.sin(p)) * 0.5; T.rKnee.x = Math.max(0, -Math.sin(p)) * 0.5; R.y = Math.abs(Math.sin(p)) * 0.05; T.head.z = Math.sin(p) * 0.15;
      k = 8;
    } else if (A === 'train' || A === 'stance' || A.startsWith('atk') || A === 'heavy' || A === 'block' || A === 'parry' || A === 'hit' || A === 'dodge' || A === 'stagger') {
      // fighting stance base
      T.lHip.x = -0.35; T.rHip.x = 0.3; T.lKnee.x = 0.45; T.rKnee.x = 0.35; R.y = -0.07; T.hips.y = 0.35; T.chest.y = -0.25; T.head.y = -0.1;
      T.rShoulder.x = -1.0; T.rElbow.x = -0.7; T.rShoulder.z = 0.1; T.lShoulder.x = -0.9; T.lElbow.x = -0.9; T.lShoulder.z = -0.35; T.spine.x = 0.08;
      if (A === 'train') {
        const c = (t * 1.1) % 1.6;
        this._atkPose(T, R, c < 0.5 ? 'wind' : c < 0.75 ? 'strike' : 'recover', Math.floor(t * 1.1 / 1.6) % 3);
        k = c > 0.5 && c < 0.75 ? 26 : 12;
      } else if (A.startsWith('atk')) {
        const idx = +A[3] || 0; const stage = this.atkStage || 'wind';
        this._atkPose(T, R, stage, idx); k = stage === 'strike' ? 30 : 16;
      } else if (A === 'heavy') {
        const stage = this.atkStage || 'wind';
        if (stage === 'wind') { T.rShoulder.x = -3.0; T.lShoulder.x = -2.8; T.rElbow.x = -1.0; T.lElbow.x = -1.0; T.spine.x = -0.2; T.chest.y = 0; T.lShoulder.z = -0.6; }
        else { T.rShoulder.x = -0.5; T.lShoulder.x = -0.5; T.rElbow.x = -0.1; T.lElbow.x = -0.2; T.spine.x = 0.45; T.lShoulder.z = -0.5; T.lHip.x = -0.7; T.lKnee.x = 0.9; R.y = -0.18; R.fwd = 0.3; }
        k = stage === 'strike' ? 32 : 9;
      } else if (A === 'block' || A === 'parry') {
        T.rShoulder.x = -1.6; T.rShoulder.z = 0.6; T.rElbow.x = -1.1; T.lShoulder.x = -1.3; T.lElbow.x = -1.3; T.lShoulder.z = -0.6; T.chest.y = 0.2; T.spine.x = -0.05;
        k = A === 'parry' ? 40 : 20;
      } else if (A === 'hit' || A === 'stagger') {
        T.spine.x = -0.35; T.head.x = -0.4; T.chest.y = 0.3; T.lShoulder.x = 0.4; T.rShoulder.x = 0.2; T.lShoulder.z = 0.6; R.fwd = -0.2; k = 25;
        if (A === 'stagger') { T.spine.x = -0.5; T.lShoulder.z = 1.0; T.rShoulder.z = -0.8; R.fwd = -0.35; }
      } else if (A === 'dodge') {
        T.spine.x = 0.5; T.lHip.x = -1.2; T.rHip.x = -0.6; T.lKnee.x = 1.6; T.rKnee.x = 1.8; R.y = -0.45; k = 22;
      }
    } else if (A === 'throne' || A === 'swing') {
      R.y = -this.legLen + 0.06;
      T.lHip.x = -1.5; T.rHip.x = -1.5; T.lKnee.x = 1.5; T.rKnee.x = 1.5; T.lHip.z = 0.08; T.rHip.z = -0.08;
      T.lShoulder.x = -0.55; T.rShoulder.x = -0.55; T.lElbow.x = -0.9; T.rElbow.x = -0.9; T.spine.x = -0.05;
      if (A === 'swing') { const sw = Math.sin(t * 2.2); T.lShoulder.x = -2.7; T.rShoulder.x = -2.7; T.lElbow.x = -0.2; T.rElbow.x = -0.2; T.lShoulder.z = -0.1; T.rShoulder.z = 0.1; T.lKnee.x = 1.2 + sw * 0.5; T.rKnee.x = 1.2 + sw * 0.5; T.spine.x = -sw * 0.2; }
    } else if (A === 'fish') {
      R.y = -this.legLen + 0.2;
      T.lHip.x = -1.45; T.rHip.x = -1.45; T.lHip.z = 0.5; T.rHip.z = -0.5; T.lKnee.x = 2.3; T.rKnee.x = 2.3;
      const tug = Math.max(0, Math.sin(t * 0.6)) > 0.97 ? 0.4 : 0;
      T.rShoulder.x = -1.0 - tug; T.rElbow.x = -0.6; T.lShoulder.x = -0.8; T.lElbow.x = -1.0; T.spine.x = 0.15; T.head.x = 0.1;
    } else if (A === 'yut') {
      R.y = -this.legLen + 0.2;
      T.lHip.x = -1.45; T.rHip.x = -1.45; T.lHip.z = 0.6; T.rHip.z = -0.6; T.lKnee.x = 2.4; T.rKnee.x = 2.4;
      const c = (t + this.phase) % 4; const th = c < 0.6 ? Math.sin(c / 0.6 * Math.PI) : 0;
      T.rShoulder.x = -0.6 - th * 2.0; T.rElbow.x = -1.0 + th * 0.8; T.lShoulder.x = -0.4; T.lElbow.x = -1.0; T.head.x = -th * 0.4;
      if (c > 0.7 && c < 1.4) { T.lShoulder.x = -2.4; T.rShoulder.x = -2.4; T.spine.x = -0.15; }
    } else if (A === 'jegi') {
      const c = (t * 1.6) % 1; const k2 = Math.sin(c * Math.PI);
      T.rHip.x = -0.4 * k2; T.rHip.z = -0.5 * k2; T.rKnee.x = 1.2 * k2; T.rFoot.x = -0.3;
      T.lShoulder.z = 0.7; T.rShoulder.z = -0.7; T.lElbow.x = -0.4; T.rElbow.x = -0.4; T.head.x = 0.35; R.y = k2 * 0.04;
      if (this.propMesh?.userData.jegi) this.propMesh.position.set(-0.1, 0.5 + Math.abs(Math.sin(c * Math.PI)) * 0.9, 0.25);
    } else if (A === 'paint' || A === 'gayageum' || A === 'tea') {
      R.y = -this.legLen + 0.2;
      T.lHip.x = -1.45; T.rHip.x = -1.45; T.lHip.z = 0.6; T.rHip.z = -0.6; T.lKnee.x = 2.4; T.rKnee.x = 2.4; T.spine.x = 0.12;
      if (A === 'paint') { const st = Math.sin(t * 1.6) ; T.rShoulder.x = -0.9 + st * 0.15; T.rShoulder.z = 0.2 + Math.sin(t * 0.9) * 0.15; T.rElbow.x = -1.0; T.lShoulder.x = -0.5; T.lElbow.x = -1.2; T.head.x = 0.45; T.spine.x = 0.3; }
      if (A === 'gayageum') { const p1 = Math.max(0, Math.sin(t * 7 + this.phase)); T.rShoulder.x = -0.7; T.rElbow.x = -1.1 + p1 * 0.25; T.rShoulder.z = 0.15; T.lShoulder.x = -0.8; T.lElbow.x = -0.9; T.lShoulder.z = -0.25 + Math.sin(t * 2) * 0.1; T.head.x = 0.25; T.head.z = Math.sin(t * 0.8) * 0.1; }
      if (A === 'tea') { const e = Math.max(0, Math.sin(t * 0.9)); T.rShoulder.x = -0.6 - e * 0.6; T.rElbow.x = -1.4 - e * 0.8; T.lShoulder.x = -0.6; T.lElbow.x = -1.5; T.head.x = -e * 0.15; }
    } else if (A === 'kite') {
      T.lShoulder.x = -2.2 + Math.sin(t * 1.3) * 0.15; T.rShoulder.x = -1.9 + Math.sin(t * 1.1) * 0.2; T.lElbow.x = -0.4; T.rElbow.x = -0.5; T.head.x = -0.5; T.spine.x = -0.12; T.lHip.x = -0.15; T.rHip.x = 0.1;
    } else if (A === 'throw') {
      const c = (t * 1.1) % 1; const wind = c < 0.6; T.rShoulder.x = wind ? -2.6 : -0.6; T.rElbow.x = wind ? -1.2 : -0.1; T.chest.y = wind ? 0.5 : -0.4; T.lShoulder.x = -0.8; T.lHip.x = -0.4; T.rHip.x = 0.3; T.lKnee.x = 0.3; k = 18;
    } else if (A === 'stir') {
      const c = t * 2.2; T.rShoulder.x = -0.9 + Math.sin(c) * 0.15; T.rShoulder.z = Math.cos(c) * 0.2; T.rElbow.x = -0.8; T.lShoulder.x = -0.6; T.lElbow.x = -1.2; T.spine.x = 0.3; T.head.x = 0.3;
    } else if (A === 'cough' || A === 'sick') {
      const c = Math.max(0, Math.sin(t * 3)) ** 4; T.spine.x = 0.35 + c * 0.25; T.head.x = 0.3 + c * 0.2; T.rShoulder.x = -1.4; T.rElbow.x = -2.0; T.lShoulder.x = -0.5; T.lElbow.x = -1.5; T.lShoulder.z = -0.3;
      if (A === 'sick') { R.y = 0.12; R.rx = -Math.PI / 2; T.head.y = 0.4; }
    } else if (A === 'charge') {
      this.phase += dt * 10; const p = this.phase;
      T.lHip.x = Math.sin(p) * 0.85; T.rHip.x = -Math.sin(p) * 0.85; T.lKnee.x = Math.max(0, -Math.cos(p)) * 1.5 + 0.1; T.rKnee.x = Math.max(0, Math.cos(p)) * 1.5 + 0.1;
      T.rShoulder.x = -2.6; T.rElbow.x = -0.6; T.lShoulder.x = -Math.sin(p) * 0.8; T.lElbow.x = -1.2; T.spine.x = 0.3; R.y = Math.abs(Math.cos(p)) * 0.07 - 0.04; k = 14;
    } else if (A === 'sled') {
      R.y = -this.legLen + 0.15; T.lHip.x = -1.5; T.rHip.x = -1.5; T.lKnee.x = 0.3; T.rKnee.x = 0.3; T.lShoulder.x = -0.6; T.rShoulder.x = -0.6; T.lElbow.x = -0.5; T.rElbow.x = -0.5; T.spine.x = -0.2;
    } else if (A === 'drum') {
      const h1 = Math.max(0, Math.sin(t * 6)), h2 = Math.max(0, Math.sin(t * 6 + Math.PI)); T.rShoulder.x = -1.0 - h1 * 0.9; T.lShoulder.x = -1.0 - h2 * 0.9; T.rElbow.x = -1.2 + h1 * 0.5; T.lElbow.x = -1.2 + h2 * 0.5; T.lHip.x = -0.2; T.rHip.x = 0.2;
    } else if (A === 'carry') {
      T.lShoulder.x = -0.6; T.lElbow.x = -1.6; T.lShoulder.z = -0.2; T.rShoulder.x = -0.5; T.rElbow.x = -1.4; T.rShoulder.z = 0.3; T.head.x = 0.3;
    } else if (A === 'kneel') {
      R.y = -0.48; T.lHip.x = -1.5; T.lKnee.x = 1.5; T.rHip.x = 0.1; T.rKnee.x = 1.6; T.spine.x = 0.3; T.head.x = 0.3;
    }

    if (this.riding) {
      T.lHip.x = -1.15; T.rHip.x = -1.15; T.lHip.z = 0.68; T.rHip.z = -0.68; T.lKnee.x = 1.1; T.rKnee.x = 1.1; T.lFoot.x = 0.2; T.rFoot.x = 0.2;
      R.y = -this.legLen + 0.06 + (this.rideBob || 0); R.fwd = 0; R.rx = 0;
      if (!this.anim.startsWith('atk') && this.anim !== 'heavy' && this.anim !== 'block') { T.lShoulder.x = -0.7; T.rShoulder.x = -0.7; T.lElbow.x = -0.9; T.rElbow.x = -0.9; T.spine.x = 0.12 + (this.speed > 6 ? 0.25 : 0); }
    }
    // mood posture: the sad droop, the content stand tall
    if (this.moodPose && (A === 'idle' || A === 'walk' || A === 'talk')) {
      const m = this.moodPose;
      if (m < 0) { T.head.x += -m * 0.28; T.spine.x += -m * 0.1; T.lShoulder.z += m * 0.08; T.rShoulder.z -= m * 0.08; }
      else { T.head.x -= m * 0.07; T.chest.x -= m * 0.05; }
    }
    // gaze: turn the head (and a little of the chest) toward what they are looking at
    let gy = 0, gx = 0;
    if (this.lookAt && !['sleep', 'dead', 'pray', 'heavy', 'stagger', 'dodge'].includes(A) && !A.startsWith('atk') && !this.riding) {
      const r = this.root; const dx = this.lookAt.x - r.position.x, dz = this.lookAt.z - r.position.z, d = Math.hypot(dx, dz);
      if (d > 0.4 && d < 14) {
        let rel = Math.atan2(dx, dz) - r.rotation.y; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) < 1.9) { gy = clamp(rel, -1.05, 1.05); gx = clamp(-Math.atan2((this.lookAt.y || 0) - r.position.y, d) * 0.5, -0.25, 0.3); }
      }
    }
    this.gazeY = damp(this.gazeY || 0, gy, 5, dt); this.gazeX = damp(this.gazeX || 0, gx, 5, dt);
    T.head.y += this.gazeY * 0.75; T.neck && (T.neck.y += this.gazeY * 0.15); T.chest.y += this.gazeY * 0.18; T.head.x += this.gazeX;
    // apply with damping
    const P = this.pose; const B = this.bones;
    for (const b of BONES) {
      const p = P[b], tg = T[b];
      p.x = damp(p.x, tg.x, k, dt); p.y = damp(p.y, tg.y, k, dt); p.z = damp(p.z, tg.z, k, dt);
      B[b].rotation.set(p.x, p.y, p.z);
    }
    const ro = this.rootOff, rt = this.rootTarget;
    ro.y = damp(ro.y, rt.y, k * 0.8, dt); ro.rx = damp(ro.rx, rt.rx, 6, dt); ro.rz = damp(ro.rz, rt.rz, 6, dt); ro.fwd = damp(ro.fwd, rt.fwd, k, dt);
    this.body.position.set(0, ro.y, ro.fwd);
    this.body.rotation.set(ro.rx, 0, ro.rz);
    if (ro.rx < -0.5) this.body.position.y = ro.y; // lying
    // blink & mouth
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 4; }
    if (this.blink > 0) this.blink -= dt;
    const closed = this.anim === 'sleep' || this.anim === 'dead' || this.anim === 'pray';
    if (this.eyes) this.eyes.scale.y = closed || this.blink > 0 ? 0.12 : 1;
    this.mouth *= 0.9;
  }

  _atkPose(T, R, stage, idx) {
    // three slash variations
    if (idx === 0) { // diagonal from right shoulder
      if (stage === 'wind') { T.rShoulder.x = -2.7; T.rShoulder.z = -0.5; T.rElbow.x = -1.3; T.lShoulder.x = -2.3; T.lElbow.x = -1.4; T.lShoulder.z = -0.7; T.chest.y = 0.45; T.spine.x = -0.1; }
      else if (stage === 'strike') { T.rShoulder.x = -0.7; T.rShoulder.z = 0.45; T.rElbow.x = -0.15; T.lShoulder.x = -0.6; T.lShoulder.z = -0.6; T.lElbow.x = -0.5; T.chest.y = -0.6; T.spine.x = 0.3; R.fwd = 0.25; T.lHip.x = -0.7; T.lKnee.x = 0.8; R.y = -0.15; }
    } else if (idx === 1) { // horizontal sweep left to right
      if (stage === 'wind') { T.rShoulder.x = -1.5; T.rShoulder.z = 0.9; T.rElbow.x = -1.6; T.chest.y = -0.7; T.lShoulder.x = -1.0; T.lShoulder.z = -0.9; }
      else if (stage === 'strike') { T.rShoulder.x = -1.5; T.rShoulder.z = -1.2; T.rElbow.x = -0.1; T.chest.y = 0.75; T.spine.x = 0.15; R.fwd = 0.2; T.lShoulder.x = -0.4; T.lShoulder.z = 0.4; T.rHip.x = -0.4; T.rKnee.x = 0.6; }
    } else { // rising thrust
      if (stage === 'wind') { T.rShoulder.x = -0.3; T.rElbow.x = -1.8; T.chest.y = 0.5; T.lShoulder.x = -0.8; T.lElbow.x = -1.4; T.spine.x = 0.15; R.y = -0.15; }
      else if (stage === 'strike') { T.rShoulder.x = -1.75; T.rElbow.x = -0.05; T.chest.y = -0.2; T.spine.x = 0.35; R.fwd = 0.45; T.lHip.x = -0.9; T.lKnee.x = 0.9; R.y = -0.2; T.lShoulder.x = 0.3; T.lShoulder.z = 0.5; }
    }
  }
}

// ---------- Appearance generator ----------
export function makeAppearance(sim, rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const job = sim.job; const f = sim.sex === 'f';
  const skins = ['#ecc19c', '#e2b18a', '#d8a47c', '#cc9470', '#efc8a6', '#c08660'];
  const hairs = ['#141110', '#1c1714', '#241c17', '#0f0d0d', '#2a201a'];
  const tops = ['#efe0b8', '#e8c8c0', '#bcd8c4', '#e8c260', '#d0dcea', '#f0c8a0', '#e0b8d0', '#f2e6cc', '#c8e0d8'];
  const skirts = ['#a3262a', '#2e4f8a', '#c23b6d', '#3f7d63', '#7a3b8f', '#d1772c', '#1f5f6b', '#b8324a', '#5b4a9a'];
  const ribbons = ['#a3262a', '#7a2a6b', '#2e4f8a', '#2d6b4c', '#c49a2a', '#d14a7a'];
  const commoner = ['#d8ccb0', '#c9b896', '#bfae8c', '#a89a80', '#d2c4a8', '#9a8c74', '#b8a888', '#8a7e6a'];
  const robes = ['#3c5d8c', '#6b8fb5', '#e8e2d2', '#7a9c8a', '#8c6fa0', '#c9b98a', '#5b7d6f', '#b9c9d6'];
  const o = { faceSeed: sim.look?.face ?? sim.id, sex: sim.sex, age: sim.age, skin: pick(skins), hair: sim.age === 'elder' ? pick(['#6a6560', '#8a8580', '#b0aaa0']) : pick(hairs), colors: {}, build: 0.92 + rnd() * 0.2, height: (f ? 0.95 : 1.0) + (rnd() - 0.5) * 0.08, married: sim.married, beard: rnd() < 0.7 };
  if (sim.look) { o.skin = sim.look.skin; if (sim.age !== 'elder') o.hair = sim.look.hair; }
  let outfit = JOB_OUTFIT[job] || 'commoner';
  o.outfit = outfit;
  if (f) {
    o.colors.top = pick(tops); o.colors.bottom = pick(skirts); o.colors.ribbon = pick(ribbons); o.colors.belt = o.colors.bottom;
    if (job === 'noble' || job === 'scholar') { o.outfit = 'noble'; o.hat = rnd() < 0.4 ? 'jokduri' : null; }
    else if (job === 'soldier' || job === 'general' || job === 'swordsman' || job === 'hunter' || job === 'bandit') {
      o.outfit = job === 'bandit' ? 'bandit' : 'warriorF'; o.colors.top = job === 'bandit' ? pick(['#3a3530', '#4a3f35']) : pick(['#2c3a5e', '#5a2a2a', '#2f3a33', '#3a3a44']);
      o.colors.bottom = job === 'bandit' ? '#2a2420' : pick(['#1c2238', '#2a1a1a', '#1f2a22']); o.colors.ribbon = '#a3262a'; o.hat = job === 'bandit' ? 'headband' : rnd() < 0.5 ? 'headband' : null;
    }
    else if (job === 'monk') { o.outfit = 'monk'; o.colors.top = '#8a8780'; o.colors.bottom = '#6f6c66'; o.colors.ribbon = '#7a2a20'; }
    else if (job === 'innkeeper' || job === 'farmer' || job === 'merchant') { o.colors.top = pick(commoner); o.colors.bottom = pick(['#5a6a7a', '#7a5a4a', '#4a5a4a', '#8a6a5a', '#6a5a7a', ...skirts.slice(0, 3)]); }
  } else {
    o.colors.top = pick(commoner); o.colors.bottom = pick(commoner); o.colors.ribbon = pick(['#f2ece0', '#3a2a20']); o.colors.belt = pick(['#3a2a20', '#5a4a3a', '#2e4f8a']);
    if (outfit === 'noble' || outfit === 'scholar') { o.colors.robe = outfit === 'scholar' ? pick(['#d8d2c4', '#cfc8b6', '#c8d0d4']) : pick(robes); o.colors.top = '#dcd6c8'; o.colors.bottom = '#dcd6c8'; o.hat = 'gat'; o.colors.belt = pick(['#a3262a', '#2e4f8a', '#c49a2a']); }
    if (outfit === 'soldier') { o.colors.top = '#2c3a5e'; o.colors.bottom = '#1c2238'; o.colors.armor = pick(['#2c3a5e', '#7d1f1f']); o.colors.robe = o.colors.armor; o.hat = rnd() < 0.6 ? 'jeonrip' : 'helmet'; }
    if (outfit === 'general') { o.colors.top = '#7d1f1f'; o.colors.bottom = '#2a1a1a'; o.colors.armor = '#7d1f1f'; o.colors.robe = '#3a1a1a'; o.hat = 'helmet'; }
    if (outfit === 'monk') { o.colors.top = '#8a8780'; o.colors.bottom = '#7a7770'; o.colors.robe = '#8a8780'; o.colors.belt = '#7a2a20'; o.beard = false; }
    if (outfit === 'wanderer') { o.colors.top = pick(['#3a3a44', '#2f3a33', '#4a3a30', '#e8e2d2']); o.colors.bottom = '#2a2420'; o.colors.robe = pick(['#2a2a32', '#3a3530', '#46403a', '#5b6b7a']); o.hat = 'satgat'; o.colors.belt = '#a3262a'; }
    if (outfit === 'hunter') { o.colors.top = '#6a5a40'; o.colors.bottom = '#4a3f30'; o.hat = 'headband'; o.colors.ribbon = '#3a2a20'; }
    if (outfit === 'bandit') { o.colors.top = pick(['#3a3530', '#4a3f35', '#2f3a33']); o.colors.bottom = '#2a2420'; o.hat = rnd() < 0.6 ? 'headband' : null; o.colors.ribbon = pick(['#7a1f1f', '#2a2420']); o.beard = true; }
    if (outfit === 'merchant') { o.colors.top = pick(['#d9c9a0', '#c9b98a', '#a8b8a0']); o.colors.bottom = pick(commoner); o.hat = rnd() < 0.5 ? 'gat' : null; }
    if (outfit === 'commoner' && rnd() < 0.25) o.hat = 'satgat';
  }
  if (job === 'king') { o.outfit = 'royal'; o.colors.robe = '#b8241e'; o.colors.top = '#b8241e'; o.colors.bottom = '#f2ece0'; o.colors.belt = '#d9b44a'; o.hat = 'ikseon'; o.royal = true; }
  if (job === 'prince') { o.outfit = 'royal'; o.colors.robe = '#1f2a4a'; o.colors.top = '#1f2a4a'; o.colors.bottom = '#f2ece0'; o.colors.belt = '#d9b44a'; o.hat = 'ikseon'; o.royal = true; }
  if (job === 'queen') { o.outfit = 'queen'; o.colors.top = '#2d6b4c'; o.colors.bottom = '#b8241e'; o.colors.ribbon = '#d9b44a'; o.hat = 'jokduri'; o.royal = true; }
  if (job === 'princess') { o.outfit = 'queen'; o.colors.top = '#e8b84a'; o.colors.bottom = '#c23b6d'; o.colors.ribbon = '#7a2a6b'; o.hat = 'jokduri'; }
  if (job === 'official' && !f) { o.outfit = 'scholar'; o.colors.robe = pick(['#3c5d8c', '#7a2a2a', '#2d6b4c']); o.colors.top = '#dcd6c8'; o.colors.bottom = '#dcd6c8'; o.hat = 'gat'; o.colors.belt = '#c49a2a'; }
  if (job === 'fisher') { o.hat = 'satgat'; }
  if (job === 'police') { o.outfit = f ? 'warriorF' : 'police'; o.colors.top = '#1c1c26'; o.colors.bottom = '#1c1c26'; o.colors.belt = '#a3262a'; o.colors.ribbon = '#a3262a'; o.hat = 'jeonrip'; }
  if (sim.look?.colors && sim.age !== 'child') { Object.assign(o.colors, sim.look.colors); if (sim.look.hat !== undefined) o.hat = sim.look.hat; if (sim.look.build) o.build = sim.look.build; if (sim.look.height) o.height = sim.look.height; }
  if (sim.finery) { o.rich = true; if (!o.colors.robe || o.outfit === 'commoner' || o.outfit === 'merchant') { o.colors.top = sim.finery.top; o.colors.bottom = sim.finery.bottom; o.colors.robe = sim.finery.robe; } }
  if (sim.age === 'child') {
    o.outfit = 'child'; o.hat = null; o.beard = false; o.married = false;
    o.colors.top = pick(['#f2e6cc', '#f4d8a0', '#e8eef4', '#f0d0d8']); o.colors.bottom = f ? pick(['#c23b6d', '#a3262a', '#d1772c', '#2e4f8a']) : pick(['#efe6d0', '#d8ccb0', '#c8d0e0']);
    o.colors.ribbon = '#d43a2a'; o.colors.belt = '#e8c040'; o.colors.robe = '#2e5fa0'; o.colors.armor = '#3f8f5a'; o.colors.wrap = '#d14a8a';
    o.height = 1;
  }
  if (sim.uniform) { const u = sim.uniform; if (u.outfit) o.outfit = u.outfit; Object.assign(o.colors, u.colors || {}); if (u.hat !== undefined) o.hat = u.hat; if (u.beard !== undefined) o.beard = u.beard; }
  o.weapon = ['soldier', 'general', 'swordsman', 'bandit', 'hunter', 'king', 'prince', 'police'].includes(job) || (sim.armed && sim.age !== 'child') || !!sim.uniform?.weapon;
  return o;
}
const JOB_OUTFIT = { police: 'police', farmer: 'commoner', merchant: 'merchant', soldier: 'soldier', general: 'general', scholar: 'scholar', innkeeper: 'commoner', monk: 'monk', noble: 'noble', swordsman: 'wanderer', hunter: 'hunter', bandit: 'bandit', fisher: 'commoner', official: 'scholar', child: 'child' };
