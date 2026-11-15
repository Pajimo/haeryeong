// Haeryeong · Pastimes — cozy hobbies, seasonal play and village gatherings.
// Ink painting, gayageum, tea, calligraphy, meditation, stargazing, kitchen gardens, home cooking,
// kites in spring, stream play in summer, kimjang in autumn, sleds and snowballs in winter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KINDS } from './buildings.js';
import { groundAt, heightAt, roadDist, riverDist, LAYOUT } from './terrain.js';
import { rand, rr, pick, chance, clamp, mulberry32 } from './noise.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _col = new THREE.Color();
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12), SPH = new THREE.SphereGeometry(0.5, 12, 8), ICO = new THREE.IcosahedronGeometry(0.5, 1);
const HALF = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI), CONE = new THREE.ConeGeometry(0.5, 1, 8);
const ONGGI = new THREE.LatheGeometry([[0, 0], [0.22, 0.02], [0.36, 0.2], [0.42, 0.42], [0.38, 0.62], [0.26, 0.74], [0.24, 0.78], [0.27, 0.8], [0, 0.82]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
// D E G A C pyeongjo pentatonic, D3 → A5
const SCALE = [146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
const TONIC = 5;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const night = (h) => h >= 20 || h < 4;

// ---------- smart-object kinds ----------
// gate(hour, season, env) → available now; when false the kind's cap drops to 0 so no one picks it.
const DEFS = {
  pt_paint: { tag: 'paint', label: 'Paint Landscapes', ko: '산수화', adv: { fun: 1.3, honor: 0.25 }, dur: [45, 80], anim: 'paint', cap: 1, gate: (h) => h > 6.5 && h < 19.5 },
  pt_callig: { tag: 'callig', label: 'Practice Calligraphy', ko: '서예', adv: { fun: 0.7, honor: 0.6 }, dur: [40, 70], anim: 'paint', cap: 1, gate: (h) => h > 7 && h < 20 },
  pt_music: { tag: 'music', label: 'Play the Gayageum', ko: '가야금', adv: { fun: 1.5, social: 0.3 }, dur: [30, 60], anim: 'gayageum', cap: 1, gate: (h) => h > 8 && h < 23 },
  pt_tea: { tag: 'tea', label: 'Tea Ceremony', ko: '다도', adv: { fun: 0.6, energy: 0.5, social: 0.6, honor: 0.3 }, dur: [30, 50], anim: 'tea', cap: 1, gate: (h) => h > 7 && h < 20 },
  pt_med: { tag: 'med', label: 'Meditate', ko: '참선', adv: { energy: 0.4, fun: 0.5, honor: 0.7 }, dur: [30, 60], anim: 'sit', cap: 1, gate: (h) => h > 5 && h < 21 },
  pt_stars: { tag: 'stars', label: 'Gaze at the Stars', ko: '별보기', adv: { fun: 1.4, energy: 0.2 }, dur: [30, 60], anim: 'sit', cap: 1, gate: (h, se, env) => night(h) && env.weather !== 'rain' },
  pt_garden: { tag: 'garden', label: 'Tend the Kitchen Garden', ko: '텃밭', adv: { fun: 0.8, energy: -0.1 }, dur: [30, 60], anim: 'farm', cap: 1, home: true, gate: (h, se) => se !== 'winter' && h > 6 && h < 19 },
  pt_cook: { tag: 'cook', label: 'Cook a Fine Dish', ko: '요리', adv: { hunger: 2.6, fun: 0.5 }, dur: [30, 45], anim: 'stir', cap: 1, home: true, gate: (h) => h > 6 && h < 22 },
  pt_kite: { tag: 'kite', label: 'Fly a Kite', ko: '연날리기', adv: { fun: 1.9 }, dur: [25, 50], anim: 'kite', cap: 1, gate: (h, se) => se === 'spring' && h > 8 && h < 18.5 },
  pt_picnic: { tag: 'picnic', label: 'Blossom Picnic', ko: '꽃놀이', adv: { fun: 1.2, social: 0.9, hunger: 0.8 }, dur: [30, 60], anim: 'eat', cap: 1, gate: (h, se) => se === 'spring' && h > 10 && h < 18 },
  pt_swim: { tag: 'swim', label: 'Splash in the Stream', ko: '물놀이', adv: { fun: 1.8, hygiene: 2.0 }, dur: [20, 40], anim: 'wash', cap: 1, gate: (h, se) => se === 'summer' && h > 9 && h < 18.5 },
  pt_melon: { tag: 'melon', label: 'Watermelon Feast', ko: '수박', adv: { hunger: 1.6, fun: 1.0, social: 0.7 }, dur: [20, 35], anim: 'eat', cap: 1, gate: (h, se) => se === 'summer' && h > 11 && h < 21 },
  pt_flies: { tag: 'flies', label: 'Watch the Fireflies', ko: '반딧불이', adv: { fun: 1.5, social: 0.3 }, dur: [25, 50], anim: 'sit', cap: 1, gate: (h, se) => se === 'summer' && (h > 19.5 || h < 2) },
  pt_moon: { tag: 'moon', label: 'Wish upon the Moon', ko: '달맞이', adv: { fun: 1.3, honor: 0.4 }, dur: [25, 50], anim: 'pray', cap: 1, gate: (h, se) => se === 'autumn' && (h > 18.5 || h < 2) },
  pt_sled: { tag: 'sled', label: 'Go Sledding', ko: '썰매', adv: { fun: 6.0 }, dur: [6, 8], anim: 'idle', cap: 3, gate: (h, se, env) => se === 'winter' && (env.snowCover || 0) > 0.3 && h > 8 && h < 17.5 },
  pt_snow: { tag: 'snow', label: 'Snowball Fight', ko: '눈싸움', adv: { fun: 2.1, social: 0.6, energy: -0.2 }, dur: [15, 30], anim: 'throw', cap: 1, gate: (h, se, env) => se === 'winter' && (env.snowCover || 0) > 0.3 && h > 8 && h < 17.5 },
  pt_warm: { tag: 'warm', label: 'Warm by the Brazier', ko: '화로', adv: { energy: 0.4, social: 0.8, fun: 0.4 }, dur: [20, 40], anim: 'talk', cap: 1, gate: (h, se) => se === 'winter' && h > 6 && h < 23.5 },
};
const TAG = {}, GATE = {};
const PROP = { pt_paint: 'brush', pt_callig: 'brush', pt_music: 'gayageum', pt_tea: 'cup', pt_garden: 'hoe', pt_cook: 'ladle', pt_kite: 'kite', pt_picnic: 'bowl', pt_melon: 'bowl', pt_snow: 'snowball' };
// skill growth per tag (game minute)
const SKILL = { paint: ['painting', 1], callig: ['scholarship', 0.6], music: ['music', 1], garden: ['gardening', 1], cook: ['cooking', 1], stars: ['scholarship', 0.3], contest: ['painting', 1.2], kimjang: ['cooking', 0.6], musicEv: ['music', 1.1] };
const MOOD = {
  paint: ['Lost in ink and mist', 7, 300], callig: ['A steady brush', 6, 300], music: ['Played the gayageum', 7, 300], tea: ['Calm of the tea ceremony', 10, 360], med: ['Inner stillness', 9, 480],
  stars: ['Counted the stars', 8, 480], kite: ['Flew a kite on the spring wind', 9, 360], picnic: ['Picnic under the blossoms', 10, 480], swim: ['Splashed in the cool stream', 9, 360],
  melon: ['Sweet watermelon', 8, 300], flies: ['Watched the fireflies', 10, 480], moon: ['Made a wish on the moon', 9, 600], snow: ['Snowball fight!', 9, 300], warm: ['Warmed by the brazier', 6, 240], sledRun: ['Whee! Sledding', 10, 360],
};
const LIST = [
  ['pt_paint', '🖌', 'Ink Painting', 'Mist and mountains at the riverside pavilion or the hilltop. Paintings sell at the market.', 'Daytime'],
  ['pt_callig', '📜', 'Calligraphy', 'Brush the classics by the seodang. Raises scholarship; scrolls sell.', 'Daytime'],
  ['pt_music', '🎵', 'Gayageum', 'Pluck the twelve silk strings — neighbours gather to listen.', 'Day & evening'],
  ['pt_tea', '🍵', 'Tea Ceremony', 'A quiet cup at the temple or the pavilion.', 'Daytime'],
  ['pt_med', '🪷', 'Meditation', 'Sit in stillness at the temple.', 'Dawn to dusk'],
  ['pt_stars', '✨', 'Stargazing', 'Count the stars from the temple hill and the lookout.', 'Clear nights'],
  ['pt_garden', '🌱', 'Kitchen Garden', 'Radishes in spring, peppers in summer, cabbages in autumn.', 'Spring–Autumn'],
  ['pt_kite', '🪁', 'Kite Flying', 'Fly a bangpae-yeon over the plaza and the paddies.', 'Spring days'],
  ['pt_picnic', '🌸', 'Blossom Picnic', 'Eat beneath the blossoming cherry trees.', 'Spring'],
  ['pt_swim', '💦', 'Stream Splashing', 'Cool off in the stream.', 'Summer days'],
  ['pt_melon', '🍉', 'Watermelon Feast', 'Slices of cold watermelon on the plaza.', 'Summer'],
  ['pt_flies', '🌿', 'Firefly Watching', 'Sit by the river as the fireflies rise.', 'Summer nights'],
  ['pt_moon', '🌕', 'Moon Viewing', 'Make a wish on the great autumn moon.', 'Autumn nights'],
  ['pt_sled', '🛷', 'Sledding', 'Race down the snowy slope.', 'Snowy winter days'],
  ['pt_snow', '❄', 'Snowball Fight', 'Pelt your friends behind the snow forts.', 'Snowy winter days'],
  ['pt_warm', '🔥', 'Brazier', 'Warm your hands and gossip.', 'Winter'],
];
const CROPS = { spring: 'radish', summer: 'pepper', autumn: 'cabbage' };
const CROP = {
  radish: { name: 'radishes', ko: '무', leaf: '#4f7a2e', fruit: '#eef0e4', sx: 0.75, sy: 1.35, fr: 0.1, price: 3 },
  pepper: { name: 'chili peppers', ko: '고추', leaf: '#3d6b2a', fruit: '#c0281e', sx: 0.9, sy: 1.05, fr: 0.055, price: 5 },
  cabbage: { name: 'napa cabbages', ko: '배추', leaf: '#9ccc6a', fruit: '#e4efb8', sx: 1.3, sy: 1.0, fr: 0.12, price: 4 },
};
const DISHES = {
  bibimbap: { name: 'Bibimbap', ko: '비빔밥', mood: 8, label: 'Hearty bibimbap' },
  japchae: { name: 'Japchae', ko: '잡채', min: 3, mood: 10, label: 'Glossy japchae' },
  hwajeon: { name: 'Hwajeon flower pancakes', ko: '화전', season: 'spring', mood: 11, label: 'Azalea hwajeon' },
  naengmyeon: { name: 'Naengmyeon cold noodles', ko: '냉면', season: 'summer', mood: 11, label: 'Icy naengmyeon' },
  songpyeon: { name: 'Songpyeon', ko: '송편', season: 'autumn', mood: 12, label: 'Half-moon songpyeon' },
  tteokguk: { name: 'Tteokguk', ko: '떡국', season: 'winter', mood: 12, label: 'Warm tteokguk' },
  jjigae: { name: 'Kimchi jjigae', ko: '김치찌개', needs: 'kimchi', mood: 12, label: 'Bubbling kimchi jjigae' },
};
const NAMES = { painting: ['painting', 'paintings'], scroll: ['scroll', 'scrolls'], radish: ['radish', 'radishes'], pepper: ['chili pepper', 'chili peppers'], cabbage: ['cabbage', 'cabbages'], kimchi: ['jar of kimchi', 'jars of kimchi'] };
const SUBJECTS = ['misty peaks', 'plum blossoms in snow', 'a lone fisherman at dusk', 'bamboo bending in the wind', 'the riverside pavilion', 'cranes over old pines', 'autumn maples', 'a moonlit temple', 'Mount Inwang after rain', 'orchids by a rock'];
const TITLES = ['Autumn Moon over the River', 'Plum Blossoms in Snow', 'Fishermen at Dusk', 'Clearing after Rain at Mount Inwang', 'An Orchid in the Wind', 'Bamboo after Rain', 'Wild Geese Returning', 'Evening Bell from a Distant Temple'];

class Mesher {
  constructor() { this.g = []; }
  add(geo, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && (color || k !== 'color')) g.deleteAttribute(k);
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); g.applyMatrix4(_m.compose(_p, _q, _s));
    if (color || !g.attributes.color) {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3); _c.set(color || '#ffffff');
      for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    this.g.push(g);
  }
  geometry() { const g = this.g.length ? mergeGeometries(this.g) : new THREE.BufferGeometry(); this.g = []; return g; }
  build(mat, scene) { const m = new THREE.Mesh(this.geometry(), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; }
}

function kiteTexture(style) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 176; const x = c.getContext('2d');
  const cols = [['#c0392b', '#1f4e8c', '#f2c230'], ['#1f4e8c', '#c0392b', '#2e8b57'], ['#2b2b2b', '#d8a020', '#c0392b'], ['#7a2a8b', '#f2c230', '#1f7a6a']][style % 4];
  x.fillStyle = '#f6f0e0'; x.fillRect(0, 0, 128, 176);
  if (style % 2 === 0) { x.fillStyle = cols[1]; x.fillRect(0, 112, 128, 64); x.fillStyle = cols[2]; x.fillRect(0, 106, 128, 6); }
  else { x.fillStyle = cols[1]; for (const s of [0, 1]) { x.beginPath(); x.moveTo(s * 128, 176); x.lineTo(s * 128, 118); x.lineTo(s ? 86 : 42, 176); x.fill(); } x.fillStyle = cols[2]; x.fillRect(0, 0, 16, 176); x.fillRect(112, 0, 16, 176); }
  x.fillStyle = cols[0]; x.beginPath(); x.arc(64, 30, 22, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#5a4630'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 176); x.moveTo(128, 0); x.lineTo(0, 176); x.moveTo(64, 0); x.lineTo(64, 176); x.moveTo(0, 3); x.lineTo(128, 3); x.moveTo(0, 92); x.lineTo(128, 92); x.stroke();
  x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(64, 92, 21, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return [t, cols[0]];
}

export function createPastimesSystem(G) {
  const sys = {
    id: 'pastimes',
    objs: {}, gardens: [], track: new Map(), simData: new Map(), last: { kimjang: -9, contest: -9, musicnight: -9, picnic: -9, snowday: -9 },
    clock: 0, gateT: 0, plantSlots: 0, gardenAcc: 0, sweepT: 0, nextPhrase: 0, listenT: 0, kimjangShow: 0, seasonKey: null,
    kites: [], snowballs: [], sleds: [], players: [], throwers: [], fireflyWatch: [], petalers: [], braziers: [], blossoms: [], snowmen: [],

    // ---------- setup ----------
    init() {
      for (const k in DEFS) { const { tag, gate, ...def } = DEFS[k]; KINDS[k] = { ...def, baseCap: def.cap }; TAG[k] = tag; GATE[k] = gate; this.objs[k] = []; }
      const P = G.economy?.prices; if (P) Object.assign(P, { painting: P.painting ?? 30, scroll: P.scroll ?? 12, radish: P.radish ?? 3, pepper: P.pepper ?? 5, cabbage: P.cabbage ?? 4, kimchi: P.kimchi ?? 14 });
      this.rng = mulberry32((G.seed || 1337) * 7 + 3); this.taken = [];
      this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      this.M = { base: new Mesher(), spring: new Mesher(), summer: new Mesher(), winter: new Mesher(), kimjang: new Mesher() };
      try { this.build(); } catch (e) { console.error('[pastimes] build', e); }
      this.groups = {}; for (const k in this.M) this.groups[k] = this.M[k].build(this.mat, G.scene);
      this.groups.kimjang.visible = false;
      this.buildDynamic();
      G.ui?.addTopButton?.('🎨 Pastimes', 'Pastimes & seasonal activities (놀이)', () => this.openModal());
      this.registerEvents();
    },

    ok(x, z, pad = 0.9, road = 2.2) {
      if (G.nav.blocked(x, z, pad) || G.world.isBlocked(x, z, pad) || roadDist(x, z) < road) return false;
      const h = heightAt(x, z); if (Math.abs(heightAt(x + 1.2, z) - h) + Math.abs(heightAt(x, z + 1.2) - h) > 0.8) return false;
      for (const t of this.taken) if (Math.hypot(t[0] - x, t[1] - z) < t[2] + pad) return false;
      return true;
    },
    find(cx, cz, r0, r1, pad = 0.9, tries = 80) {
      for (let i = 0; i < tries; i++) { const a = this.rng() * 6.283, r = r0 + (r1 - r0) * this.rng(); const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (this.ok(x, z, pad)) { this.taken.push([x, z, pad]); return [x, z]; } }
      return null;
    },
    place(kind, x, z, heading, extra = {}) {
      const o = G.addObject(kind, x, z, { face: heading, prop: PROP[kind] || 'none', title: `${KINDS[kind].label}`, ...extra });
      if (extra.seat === undefined) o.seat = [x, z];
      this.objs[kind].push(o); return o;
    },
    loc(cx, cz, rot, lx, lz) { const c = Math.cos(rot), s = Math.sin(rot); return [cx + lx * c + lz * s, cz - lx * s + lz * c]; },
    headTo(x, z, tx, tz) { return Math.atan2(tx - x, tz - z); },
    // seat facing a direction: 'sit'-anim seats face (face+π) in the core, others look at `look`
    seat(kind, x, z, h, extra = {}) {
      return this.place(kind, x, z, KINDS[kind].anim === 'sit' ? h + Math.PI : h, { look: [x + Math.sin(h) * 3, z + Math.cos(h) * 3], ...extra });
    },
    mat2(M, x, z, rot, w, d, col, border) {
      const y = groundAt(x, z);
      if (border) M.add(BOX, border, x, y + 0.02, z, rot, w + 0.12, 0.04, d + 0.12);
      M.add(BOX, col, x, y + 0.035, z, rot, w, 0.05, d);
    },

    build() {
      const W = G.world, S = W.spots, B = this.M.base;
      const pav = [128, 100];
      // hilltop lookout: highest open ground in a ring around the village
      let hill = null, hb = -1e9;
      for (let i = 0; i < 64; i++) { const a = i / 64 * 6.283, r = 60 + (i % 4) * 25; const x = Math.cos(a) * r, z = Math.sin(a) * r; const h = heightAt(x, z); if (h > hb && this.ok(x, z, 3)) { hb = h; hill = [x, z]; } }
      // temple hill
      const [tx, tz] = LAYOUT.temple; let thill = null; hb = -1e9;
      for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283, r = 14 + (i % 3) * 9; const x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r; const h = heightAt(x, z); if (h > hb && this.ok(x, z, 2.5)) { hb = h; thill = [x, z]; } }
      this.hill = hill; this.thill = thill;
      const toward = (p, t) => this.headTo(p[0], p[1], t[0], t[1]);
      const paintMat = (p, h, kind = 'pt_paint') => {
        const [x, z] = p; const y = groundAt(x, z);
        this.mat2(B, x, z, h, 1.3, 1.5, kind === 'pt_paint' ? '#c9b07a' : '#8a5a3a', '#6b4a2a');
        const ink = this.loc(x, z, h, 0.55, 0.35); B.add(BOX, '#1d1b1a', ink[0], y + 0.08, ink[1], h, 0.16, 0.04, 0.24);
        const cup = this.loc(x, z, h, -0.55, 0.35); B.add(CYL, '#8fb8a0', cup[0], y + 0.1, cup[1], 0, 0.12, 0.08, 0.12);
        this.seat(kind, x, z, h);
      };
      // painting: pavilion riverside (facing the river), hilltop, temple
      for (let i = 0; i < 2; i++) { const p = this.find(pav[0], pav[1], 7, 13, 1.1); if (p) paintMat(p, toward(p, [pav[0] + 30, p[1]])); }
      if (hill) { const p = this.find(hill[0], hill[1], 0, 4, 1.1); if (p) paintMat(p, toward(p, [0, 0])); }
      { const p = this.find(tx, tz, 10, 20, 1.1); if (p) paintMat(p, toward(p, [tx + 40, tz + 20])); }
      // calligraphy by the seodang
      if (S.school) for (let i = 0; i < 2; i++) { const p = this.find(S.school[0], S.school[1], 3, 9, 1.0); if (p) paintMat(p, toward(p, S.school), 'pt_callig'); }
      // gayageum cushions
      const cushion = (p, h) => { const y = groundAt(p[0], p[1]); B.add(CYL, '#d8a020', p[0], y + 0.04, p[1], 0, 0.95, 0.06, 0.95); B.add(CYL, '#a3262a', p[0], y + 0.08, p[1], 0, 0.85, 0.08, 0.85); this.seat('pt_music', p[0], p[1], h); };
      for (const c of [[pav, 6, 10], [S.jumak || [20, 15], 3, 8], [[0, 0], 7, 11]]) { const p = this.find(c[0][0], c[0][1], c[1], c[2], 1.0); if (p) cushion(p, toward(p, c[0])); }
      if (hill) { const p = this.find(hill[0], hill[1], 2, 6, 1.0); if (p) cushion(p, toward(p, [0, 0])); }
      // tea tables (two facing seats)
      const teaTable = (c) => {
        const p = this.find(c[0], c[1], c[2], c[3], 1.6); if (!p) return; const [x, z] = p; const y = groundAt(x, z); const h = this.rng() * 6.28;
        B.add(BOX, '#5d3a24', x, y + 0.22, z, h, 0.8, 0.05, 0.55); for (const [lx, lz] of [[-0.33, -0.2], [0.33, -0.2], [-0.33, 0.2], [0.33, 0.2]]) { const q = this.loc(x, z, h, lx, lz); B.add(BOX, '#4a2e1c', q[0], y + 0.1, q[1], h, 0.05, 0.2, 0.05); }
        B.add(SPH, '#8fb8a0', x, y + 0.3, z, 0, 0.18, 0.13, 0.18); const sp = this.loc(x, z, h, 0.12, 0); B.add(CYL, '#8fb8a0', sp[0], y + 0.32, sp[1], h, 0.03, 0.12, 0.03, 0, -0.9);
        for (const sd of [-1, 1]) {
          const cu = this.loc(x, z, h, 0.22 * sd, 0.15 * sd); B.add(CYL, '#efe8da', cu[0], y + 0.27, cu[1], 0, 0.07, 0.05, 0.07);
          const st = this.loc(x, z, h, 0, sd * 0.85); B.add(BOX, '#6b5a8a', st[0], y + 0.04, st[1], h, 0.55, 0.07, 0.55);
          this.seat('pt_tea', st[0], st[1], h + (sd > 0 ? Math.PI : 0));
        }
        this.taken.push([x, z, 1.4]);
      };
      teaTable([tx - 6, tz, 5, 14]); teaTable([pav[0], pav[1], 7, 12]); teaTable([S.palace?.[0] ?? -30, (S.palace?.[1] ?? -175) + 6, 6, 16]);
      // meditation cushions at the temple
      for (let i = 0; i < 3; i++) { const p = this.find(tx - 6, tz, 4, 11, 0.9); if (p) { const y = groundAt(p[0], p[1]); B.add(BOX, '#8a7a5a', p[0], y + 0.05, p[1], 0, 0.6, 0.1, 0.6); this.seat('pt_med', p[0], p[1], toward(p, [tx, tz])); } }
      // stargazing & moon viewing mats on the hills
      for (const hc of [thill, hill]) if (hc) for (let i = 0; i < 2; i++) { const p = this.find(hc[0], hc[1], 0, 6, 1.0); if (p) { this.mat2(B, p[0], p[1], this.rng() * 3, 1.6, 1.0, '#b8a070'); this.seat('pt_stars', p[0], p[1], toward(p, [0, -400])); } }
      for (const hc of [hill, pav]) if (hc) for (let i = 0; i < 2; i++) { const p = this.find(hc[0], hc[1], hc === pav ? 7 : 2, hc === pav ? 13 : 8, 1.0); if (p) this.seat('pt_moon', p[0], p[1], toward(p, [p[0] + 100, p[1] - 60])); }
      // fireflies by the river
      for (let i = 0; i < 3; i++) { const p = this.find(pav[0], pav[1], 10, 22, 1.0); if (p) { this.mat2(B, p[0], p[1], 0.3, 1.2, 0.9, '#a89060'); this.seat('pt_flies', p[0], p[1], toward(p, [pav[0] + 30, p[1]])); } }
      // blossom trees + picnic mats (spring), melons (summer)
      this.canopyMat = new THREE.MeshStandardMaterial({ color: '#f2b8c8', roughness: 0.9 });
      const CM = new Mesher();
      const tree = (x, z) => {
        const y = groundAt(x, z); B.add(CYL, '#4a3424', x, y + 1.2, z, 0, 0.28, 2.4, 0.28); B.add(CYL, '#4a3424', x + 0.5, y + 2.2, z, 0, 0.14, 1.4, 0.14, 0, -0.6);
        for (let k = 0; k < 5; k++) CM.add(ICO, '#ffffff', x + rr(-1.2, 1.2), y + rr(2.6, 3.6), z + rr(-1.2, 1.2), 0, rr(1.4, 2.2), rr(1.0, 1.5), rr(1.4, 2.2));
        this.blossoms.push([x, y + 3, z]);
      };
      const picnic = (c, r0, r1) => {
        const p = this.find(c[0], c[1], r0, r1, 3.2); if (!p) return null; const [x, z] = p; const h = this.rng() * 6.28;
        const tp = this.loc(x, z, h, 2.6, 0.4); tree(tp[0], tp[1]); this.taken.push([tp[0], tp[1], 1]);
        this.mat2(this.M.spring, x, z, h, 2.2, 1.6, '#c8433a', '#f0e6d0'); const y = groundAt(x, z);
        for (let k = 0; k < 4; k++) { const d = this.loc(x, z, h, -0.5 + k * 0.33, 0); this.M.spring.add(CYL, k % 2 ? '#efe8da' : '#2e5fa0', d[0], y + 0.1, d[1], 0, 0.22, 0.07, 0.22); }
        for (const [lx, lz] of [[0, -1.05], [0, 1.05], [-1.35, 0], [1.35, 0]]) { const s = this.loc(x, z, h, lx, lz); this.seat('pt_picnic', s[0], s[1], this.headTo(s[0], s[1], x, z)); }
        return p;
      };
      this.picnicSite = picnic([0, 0], 18, 30) || [0, 20]; picnic(pav, 12, 20);
      { const t2 = this.find(0, 0, 24, 34, 1.5); if (t2) tree(t2[0], t2[1]); }
      this.canopy = new THREE.Mesh(CM.geometry(), this.canopyMat); this.canopy.castShadow = true; G.scene.add(this.canopy);
      const melons = (c, r0, r1) => {
        const p = this.find(c[0], c[1], r0, r1, 2.4); if (!p) return; const [x, z] = p; const h = this.rng() * 6.28; const y = groundAt(x, z); const Ms = this.M.summer;
        this.mat2(Ms, x, z, h, 2.0, 1.5, '#d9ceb2', '#8a7a5a'); Ms.add(CYL, '#6b4a2a', x, y + 0.08, z, 0, 0.9, 0.05, 0.9);
        Ms.add(SPH, '#2f6b2a', x + 0.15, y + 0.3, z, 0, 0.42, 0.38, 0.42);
        for (let k = 0; k < 4; k++) { const a = h + k * 1.4, sx = x + Math.cos(a) * 0.32, sz = z + Math.sin(a) * 0.32; Ms.add(HALF, '#d8343a', sx, y + 0.17, sz, a, 0.3, 0.05, 0.3, Math.PI / 2); Ms.add(HALF, '#3d7a2a', sx, y + 0.16, sz, a, 0.32, 0.04, 0.32, Math.PI / 2); }
        for (const [lx, lz] of [[0, -1.0], [0, 1.0], [-1.25, 0], [1.25, 0]]) { const s = this.loc(x, z, h, lx, lz); this.seat('pt_melon', s[0], s[1], this.headTo(s[0], s[1], x, z)); }
      };
      melons([0, 0], 16, 30); melons(S.jumak || [20, 15], 4, 10);
      // kites (spring): open ground at the plaza edge and the paddies' rim
      const fl = S.fields || [0, 160];
      for (const [c, r0, r1, n] of [[[0, 0], 20, 34, 3], [[fl[0], LAYOUT.paddies.z0 - 6], 0, 20, 3]]) for (let i = 0; i < n; i++) { const p = this.find(c[0], c[1], r0, r1, 1.2); if (p) this.place('pt_kite', p[0], p[1], 0); }
      // stream splashing
      for (const so of W.objects.filter((o) => o.kind === 'stream').slice(0, 3)) for (let i = 0; i < 2; i++) {
        const p = this.find(so.x, so.z, 1.5, 6, 0.6); if (!p) continue;
        let best = 0, bd = 1e9; for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, d = riverDist(p[0] + Math.sin(a) * 6, p[1] + Math.cos(a) * 6); if (d < bd) { bd = d; best = a; } }
        this.seat('pt_swim', p[0], p[1], best);
      }
      // kitchen gardens + home cooking
      this.plantSlots = 0;
      for (const h of W.houses) {
        const cp = h.objs?.find((o) => o.kind === 'cookpot');
        if (cp) this.place('pt_cook', cp.x + Math.sin(cp.face) * 0.4, cp.z + Math.cos(cp.face) * 0.4, cp.face, { house: h.id, look: cp.look, title: 'Kitchen · 부엌', sub: 'Cook a fine dish' });
        if (!h.world) continue;
        const hw = (h.w || 9) / 2, hd = (h.d || 7) / 2;
        for (const [lx, lz] of [[-(hw + 2.7), hd + 0.6], [-(hw + 2.7), -0.4], [hw + 2.7, -0.6], [0, -(hd + 2.6)], [-(hw + 2.7), hd + 3]]) {
          const [x, z] = h.world(lx, lz);
          if (!this.ok(x, z, 1.5, 2.6)) continue;
          this.taken.push([x, z, 1.5]);
          this.buildGarden(h, x, z, h.rot); break;
        }
      }
      // snow forts (snowball fights), braziers, sled run (winter)
      const Mw = this.M.winter;
      const fort = (x, z, h) => { const y = groundAt(x, z); for (let k = -1; k <= 1; k++) { const q = this.loc(x, z, h, k * 0.75, 0); Mw.add(BOX, '#eef3f8', q[0], y + 0.3, q[1], h + k * 0.35, 0.8, 0.6, 0.4); } Mw.add(SPH, '#f4f8ff', x, y + 0.6, z, 0, 0.3, 0.3, 0.3); };
      for (const [c, r0, r1] of [[[0, 0], 16, 28], [S.school || [-40, -20], 6, 16]]) {
        const a = this.find(c[0], c[1], r0, r1, 1.2); if (!a) continue;
        let b = null; for (let i = 0; i < 30 && !b; i++) { const ang = this.rng() * 6.283; const x = a[0] + Math.cos(ang) * 9, z = a[1] + Math.sin(ang) * 9; if (this.ok(x, z, 1.2)) b = [x, z]; }
        if (!b) continue; this.taken.push([b[0], b[1], 1.2]);
        for (const [p, q] of [[a, b], [b, a]]) {
          const h = toward(p, q); const f = this.loc(p[0], p[1], h, 0, 1.3); fort(f[0], f[1], h);
          for (const lx of [-0.8, 0.8]) { const s = this.loc(p[0], p[1], h, lx, 0); this.seat('pt_snow', s[0], s[1], h); }
        }
        this.snowSite = this.snowSite || [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
      this.coalMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a' }); const CoalM = new Mesher();
      for (const c of [[0, 0, 9, 16], [...(S.jumak || [20, 15]), 3, 9], [...(S.market || [0, 78]), 4, 12]]) {
        const p = this.find(c[0], c[1], c[2], c[3], 1.6); if (!p) continue; const [x, z] = p; const y = groundAt(x, z);
        Mw.add(CYL, '#2b2522', x, y + 0.55, z, 0, 0.9, 0.35, 0.9); Mw.add(CYL, '#2b2522', x, y + 0.75, z, 0, 1.0, 0.06, 1.0);
        for (let k = 0; k < 3; k++) { const a = k / 3 * 6.283; Mw.add(BOX, '#2b2522', x + Math.cos(a) * 0.32, y + 0.2, z + Math.sin(a) * 0.32, a, 0.06, 0.45, 0.06); }
        CoalM.add(CYL, '#ffffff', x, y + 0.74, z, 0, 0.8, 0.06, 0.8);
        this.braziers.push([x, y + 0.85, z]);
        for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + 0.4; const sx = x + Math.cos(a) * 1.3, sz = z + Math.sin(a) * 1.3; this.seat('pt_warm', sx, sz, this.headTo(sx, sz, x, z)); }
      }
      this.coals = new THREE.Mesh(CoalM.geometry(), this.coalMat); G.scene.add(this.coals);
      this.findSledRun();
      // snowmen spots
      for (let i = 0; i < 10; i++) { const p = this.find(0, 0, 10, 95, 0.9, 40); if (p) this.snowmen.push({ x: p[0], z: p[1], y: groundAt(p[0], p[1]), r: this.rng() * 6.28, k: 0, th: 0.38 + i * 0.045 }); }
      // kimjang site: two long tables near the plaza
      this.buildKimjang();
      // event sites
      this.contestSlots = []; for (let i = 0; i < 8; i++) { const p = this.find(pav[0], pav[1], 8, 13, 1.0); if (p) this.contestSlots.push({ p, look: [pav[0], pav[1]], sim: null }); }
      const jd = S.jumak || [20, 15]; this.stage = this.find(jd[0] - 4, jd[1], 2, 8, 3) || [jd[0] - 6, jd[1]];
      this.stageSlots = [-1.2, 0, 1.2].map((lx, i) => { const q = this.loc(this.stage[0], this.stage[1], toward(this.stage, [0, 0]), lx, 0); return { p: q, look: [0, 0], sim: null, drum: i === 1 }; });
    },

    buildGarden(h, x, z, rot) {
      const B = this.M.base, y = groundAt(x, z);
      B.add(BOX, '#5a3f28', x, y + 0.04, z, rot, 2.6, 0.14, 1.6);
      for (const lz of [-0.5, 0, 0.5]) { const q = this.loc(x, z, rot, 0, lz); B.add(BOX, '#4a3220', q[0], y + 0.12, q[1], rot, 2.4, 0.1, 0.22); }
      for (const [lx, lz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) { const q = this.loc(x, z, rot, lx, lz); B.add(CYL, '#7a5a3a', q[0], y + 0.3, q[1], 0, 0.06, 0.6, 0.06); }
      for (const sd of [-1, 1]) { const q = this.loc(x, z, rot, 0, sd * 0.9); B.add(BOX, '#8a6a42', q[0], y + 0.45, q[1], rot, 2.8, 0.04, 0.04); }
      const st = this.loc(x, z, rot, 0, 1.25);
      const o = this.place('pt_garden', st[0], st[1], rot + Math.PI, { house: h.id, look: [x, z], title: 'Kitchen Garden · 텃밭' });
      const g = { house: h, x, z, rot, y, crop: null, g: 0, q: 0, base: this.plantSlots, obj: o, shown: -1 }; this.plantSlots += 6;
      o.garden = g; this.gardens.push(g);
    },

    findSledRun() {
      let best = null, bs = 0;
      for (let r = 40; r <= 170; r += 10) for (let i = 0; i < 24; i++) {
        const a = i / 24 * 6.283, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!this.ok(x, z, 2, 2)) continue;
        for (let k = 0; k < 8; k++) {
          const da = k / 8 * 6.283, dx = Math.sin(da), dz = Math.cos(da); const ex = x + dx * 24, ez = z + dz * 24;
          const drop = heightAt(x, z) - heightAt(ex, ez); if (drop < 3) continue;
          let clear = true; for (let t = 3; t <= 24 && clear; t += 3) if (G.nav.blocked(x + dx * t, z + dz * t, 1.0)) clear = false;
          const sc = drop - r / 60; if (clear && sc > bs) { bs = sc; best = { top: [x, z], dir: [dx, dz], len: 24 }; }
        }
      }
      this.sled = best; if (!best) return;
      const [x, z] = best.top, h = Math.atan2(best.dir[0], best.dir[1]); this.taken.push([x, z, 2]);
      const Mw = this.M.winter, y = groundAt(x, z);
      for (const lx of [-1.8, 1.8]) { const q = this.loc(x, z, h, lx, -0.8); Mw.add(CYL, '#7a5a3a', q[0], y + 0.7, q[1], 0, 0.08, 1.4, 0.08); Mw.add(BOX, '#c0392b', q[0], y + 1.25, q[1], h, 0.02, 0.3, 0.4); }
      for (const lx of [-1, 1]) { const q = this.loc(x, z, h, lx * 2.6, -1.2); Mw.add(this.sledGeo || (this.sledGeo = this.makeSledGeo()), null, q[0], y + 0.02, q[1], h + 0.3 * lx); }
      this.place('pt_sled', x, z, h, { look: [x + best.dir[0] * 10, z + best.dir[1] * 10], seat: null });
    },
    makeSledGeo() { const m = new Mesher(); for (const sx of [-0.22, 0.22]) m.add(BOX, '#5d3a24', sx, 0.05, 0, 0, 0.06, 0.08, 1.15); m.add(BOX, '#8a6a42', 0, 0.14, -0.05, 0, 0.55, 0.05, 0.85); m.add(CYL, '#5d3a24', 0, 0.1, 0.55, 0, 0.5, 0.06, 0.06, 0, Math.PI / 2); return m.geometry(); },

    buildKimjang() {
      const K = this.M.kimjang; this.kSlots = [];
      let site = null;
      for (let i = 0; i < 80 && !site; i++) {
        const a = this.rng() * 6.283, r = 17 + this.rng() * 12, x = Math.cos(a) * r, z = Math.sin(a) * r, h = a;
        let clear = true; for (let t = -4; t <= 4 && clear; t += 2) for (const sd of [-1.6, 1.6]) { const q = this.loc(x, z, h, t, sd); if (!this.ok(q[0], q[1], 0.9, 1.5)) clear = false; }
        if (clear) site = [x, z, h];
      }
      if (!site) site = [-16, 16, 0.6];
      const [cx, cz, h] = site; this.kimjangSite = [cx, cz]; this.taken.push([cx, cz, 5]);
      for (const tz of [-1.6, 1.6]) {
        const [x, z] = this.loc(cx, cz, h, 0, tz); const y = groundAt(x, z);
        K.add(BOX, '#7a5236', x, y + 0.78, z, h, 6.2, 0.08, 1.05);
        for (const lx of [-2.9, 2.9]) for (const lz of [-0.42, 0.42]) { const q = this.loc(x, z, h, lx, lz); K.add(BOX, '#5d3a24', q[0], y + 0.38, q[1], h, 0.08, 0.76, 0.08); }
        for (let k = 0; k < 12; k++) { const q = this.loc(x, z, h, -2.7 + k * 0.48 + rr(-0.1, 0.1), rr(-0.25, 0.25)); K.add(SPH, k % 3 ? '#a8d47a' : '#eef2d0', q[0], y + 0.92, q[1], h + rr(-0.4, 0.4), 0.26, 0.2, 0.42); }
        for (const lx of [-1.5, 1.5]) { const q = this.loc(x, z, h, lx, 0); K.add(CYL, '#6a4a3a', q[0], y + 0.88, q[1], 0, 0.7, 0.14, 0.7); K.add(CYL, '#b8241e', q[0], y + 0.95, q[1], 0, 0.62, 0.02, 0.62); }
        for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) { const p = this.loc(x, z, h, -2.5 + k, sd * 0.95), lk = this.loc(x, z, h, -2.5 + k, 0); this.kSlots.push({ p, look: lk, sim: null }); }
      }
      for (let k = 0; k < 9; k++) { const q = this.loc(cx, cz, h, -4 + k, 3.6 + (k % 2) * 0.4); K.add(ONGGI, '#5a3322', q[0], groundAt(q[0], q[1]), q[1], 0, 1.1, 1.1, 1.1); }
      for (let k = 0; k < 14; k++) { const q = this.loc(cx, cz, h, 4.2 + rr(0, 1.2), rr(-1.5, 1.5)); K.add(SPH, '#9ccc6a', q[0], groundAt(q[0], q[1]) + 0.18 + (k % 3) * 0.2, q[1], rr(0, 3), 0.32, 0.28, 0.5); }
    },

    buildDynamic() {
      // garden plants (instanced)
      const N = Math.max(1, this.plantSlots);
      this.leaves = new THREE.InstancedMesh(ICO, new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
      this.fruit = new THREE.InstancedMesh(SPH, new THREE.MeshStandardMaterial({ roughness: 0.5 }), N * 2);
      for (const im of [this.leaves, this.fruit]) { im.castShadow = true; im.frustumCulled = false; _m.makeScale(0, 0, 0); for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, _m); im.setColorAt(i, _col.set('#ffffff')); } G.scene.add(im); }
      // kites
      for (let i = 0; i < 6; i++) {
        const [tex, ribbon] = kiteTexture(i);
        const grp = new THREE.Group(); const km = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
        grp.add(new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), km));
        const rm = new THREE.MeshStandardMaterial({ color: ribbon, side: THREE.DoubleSide });
        const tails = []; for (const sx of [-0.45, 0.45]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 2.4).translate(0, -1.2, 0), rm); t.position.set(sx, -0.7, 0); grp.add(t); tails.push(t); }
        grp.visible = false; G.scene.add(grp);
        const arr = new Float32Array(12 * 3); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#efe6cf', transparent: true, opacity: 0.75 })); line.frustumCulled = false; line.visible = false; G.scene.add(line);
        this.kites.push({ grp, tails, line, arr, owner: null, i });
      }
      // snowballs
      const sbg = new THREE.SphereGeometry(0.09, 8, 6), sbm = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9 });
      for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(sbg, sbm); m.visible = false; G.scene.add(m); this.snowballs.push({ m, v: new THREE.Vector3(), t: 0, on: false }); }
      // sleds pool
      this.sledGeo = this.sledGeo || this.makeSledGeo();
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(this.sledGeo, this.mat); m.castShadow = true; this.sleds.push({ m, owner: null }); }
      // snowmen (instanced): two balls, charcoal eyes, twig arms and a little black gat
      const S = new Mesher();
      S.add(SPH, '#f4f8ff', 0, 0.42, 0, 0, 0.95, 0.85, 0.95); S.add(SPH, '#f4f8ff', 0, 1.0, 0, 0, 0.62, 0.6, 0.62);
      for (const sx of [-0.1, 0.1]) S.add(SPH, '#1d1b1a', sx, 1.06, 0.28, 0, 0.06, 0.06, 0.04);
      S.add(BOX, '#a3262a', 0, 0.96, 0.3, 0, 0.12, 0.03, 0.03);
      for (const sx of [-1, 1]) S.add(CYL, '#5d3a24', sx * 0.6, 0.65, 0, 0, 0.04, 0.6, 0.04, 0, sx * 1.1);
      S.add(CYL, '#1d1b1a', 0, 1.3, 0, 0, 0.7, 0.02, 0.7); S.add(CYL, '#1d1b1a', 0, 1.42, 0, 0, 0.26, 0.22, 0.26);
      this.snowmanMesh = new THREE.InstancedMesh(S.geometry(), this.mat, Math.max(1, this.snowmen.length));
      this.snowmanMesh.castShadow = true; this.snowmanMesh.frustumCulled = false; _m.makeScale(0, 0, 0); for (let i = 0; i < this.snowmanMesh.count; i++) this.snowmanMesh.setMatrixAt(i, _m); G.scene.add(this.snowmanMesh);
    },

    // ---------- per-sim data ----------
    sd(s) { let d = this.simData.get(s.id); if (!d) { d = { pq: 0, made: 0, best: 0 }; this.simData.set(s.id, d); } return d; },
    initSkills(s) {
      const k = s.skills; if (!k || k.painting !== undefined) return;
      const kid = s.age === 'child';
      k.painting = Math.min(kid ? 1 : 10, rr(0, 1.5) + (s.job === 'scholar' || s.job === 'noble' ? rr(1, 3) : 0) + (s.has?.('Romantic') ? 1 : 0));
      k.music = Math.min(kid ? 1 : 10, rr(0, 1.5) + (s.job === 'innkeeper' || s.job === 'princess' || s.job === 'queen' ? rr(1, 3) : 0));
      k.cooking = Math.min(kid ? 1 : 10, rr(0.5, 2.5) + (s.job === 'innkeeper' ? 3 : 0) + (s.age === 'elder' ? 2 : 0));
      k.gardening = Math.min(kid ? 1 : 10, rr(0.3, 2) + (s.job === 'farmer' ? rr(2, 4) : 0) + (s.age === 'elder' ? 1 : 0));
    },
    give(s, k, n) { s.inv = s.inv || {}; s.inv[k] = (s.inv[k] || 0) + n; },

    // ---------- gates & seasons ----------
    season() { return G.seasons?.current?.key || G.env.season || 'autumn'; },
    available(kind) { const g = GATE[kind]; return !g || !!g(G.env.hour, this.season(), G.env); },
    refreshGates() {
      const h = G.env.hour, se = this.season();
      for (const k in DEFS) KINDS[k].cap = GATE[k](h, se, G.env) ? KINDS[k].baseCap : 0;
      if (se !== this.seasonKey) this.applySeason(se);
      this.groups.kimjang.visible = !!(G.director.active?.kind === 'kimjang') || this.kimjangShow > 0;
    },
    applySeason(se) {
      this.seasonKey = se;
      this.groups.spring.visible = se === 'spring'; this.groups.summer.visible = se === 'summer'; this.groups.winter.visible = se === 'winter'; if (this.coals) this.coals.visible = se === 'winter';
      if (this.canopy) this.canopy.visible = se !== 'winter'; this.canopyMat?.color.set({ spring: '#f4bccb', summer: '#5f8a3a', autumn: '#c8642a' }[se] || '#f4bccb');
      for (const g of this.gardens) { const c = CROPS[se] || null; if (g.crop !== c) { g.crop = c; g.g = c ? 0.05 : 0; g.q = 0; } }
      this.drawGardens(true);
    },

    // ---------- gardens ----------
    drawGardens(force) {
      let dirty = false;
      for (const g of this.gardens) {
        const lvl = g.crop ? Math.round(Math.min(1, g.g) * 40) : -1;
        if (!force && lvl === g.shown) continue; g.shown = lvl; dirty = true;
        const C = g.crop && CROP[g.crop]; const k = C ? 0.18 + 0.82 * Math.min(1, g.g) : 0;
        for (let i = 0; i < 6; i++) {
          const lx = -0.8 + (i % 3) * 0.8, lz = i < 3 ? -0.3 : 0.3; const [x, z] = this.loc(g.x, g.z, g.rot, lx, lz);
          const sc = k * 0.55; _p.set(x, g.y + 0.16 + sc * (C ? C.sy : 1) * 0.35, z); _q.setFromAxisAngle(_v1.set(0, 1, 0), i * 1.7); _s.set(sc * (C?.sx || 1), sc * (C?.sy || 1), sc * (C?.sx || 1));
          this.leaves.setMatrixAt(g.base + i, _m.compose(_p, _q, _s)); if (C) this.leaves.setColorAt(g.base + i, _col.set(C.leaf));
          for (let f = 0; f < 2; f++) {
            const show = C && g.g > 0.55; const fr = show ? C.fr * 2 * Math.min(1, (g.g - 0.55) * 2.5) : 0;
            _p.set(x + (f ? 0.12 : -0.1), g.y + (g.crop === 'pepper' ? 0.25 + sc * 0.2 : 0.2), z + (f ? -0.06 : 0.08)); _s.set(fr, g.crop === 'pepper' ? fr * 2.2 : fr, fr);
            this.fruit.setMatrixAt((g.base + i) * 2 + f, _m.compose(_p, _q, _s)); if (C) this.fruit.setColorAt((g.base + i) * 2 + f, _col.set(C.fruit));
          }
        }
        g.obj.sub = C ? (g.g >= 1 ? `${C.name} — ripe for harvest!` : `${C.name} · ${Math.round(g.g * 100)}% grown`) : 'Resting under straw for winter';
      }
      if (dirty) for (const im of [this.leaves, this.fruit]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    },
    tickGardens(mins) {
      const f = { spring: 1, summer: 1.2, autumn: 0.9 }[this.season()] || 0; if (!f) return;
      for (const g of this.gardens) { if (!g.crop) continue; const was = g.g; g.g = Math.min(1.2, g.g + mins / 2400 * f * (G.env.weather === 'rain' ? 1.3 : 1));
        if (was < 1 && g.g >= 1 && G.household.some((h) => h.home === g.house)) G.ui?.toast(`🌱 The ${CROP[g.crop].name} in your garden are ripe.`); }
      this.drawGardens(false);
    },
    harvest(s, g) {
      if (!g.crop || g.g < 1) return false; const C = CROP[g.crop];
      const n = 3 + Math.floor((s.skills.gardening || 0) / 2.5) + Math.floor(g.q * 2);
      this.give(s, g.crop, n); g.g = 0.06; g.q = 0; this.drawGardens(false);
      s.say(pick([`Look at these ${C.name}!`, `${C.ko}! A fine crop.`, 'The earth is generous this year.']), 'happy'); s.addMoodlet('pt_harvest', 'Harvested the garden', 8, 480);
      if (s.household) G.ui?.toast(`${s.name.given} harvested ${n} ${C.name} (${C.ko}).`);
      return true;
    },

    // ---------- cooking ----------
    dishesFor(s) { const se = this.season(); return Object.entries(DISHES).filter(([, d]) => (!d.season || d.season === se) && (!d.min || (s.skills.cooking || 0) >= d.min) && (!d.needs || s.inv?.[d.needs] > 0)); },
    cookObj(s) { return s.home && this.objs.pt_cook.find((o) => o.house === s.home.id); },
    serveDish(s, key) {
      const opts = this.dishesFor(s); if (!opts.length) return;
      const [k, D] = (key && DISHES[key] && opts.find(([kk]) => kk === key)) || opts.find(([, d]) => d.season) && chance(0.6) && opts.find(([, d]) => d.season) || pick(opts);
      let q = (s.skills.cooking || 0) * 0.6 + rr(0, 2);
      for (const c of ['cabbage', 'radish', 'pepper']) if (s.inv?.[c] > 0) { s.inv[c]--; q += 1.5; break; }
      if (D.needs) s.inv[D.needs]--; else if (s.inv?.kimchi > 0 && chance(0.3)) { s.inv.kimchi--; q += 1; }
      const mood = Math.round(D.mood + q * 0.6);
      const eaters = [s, ...(s.home?.residents || []).filter((o) => o !== s && !o.dead && !o.hidden && o.pos.distanceTo(s.pos) < 14)];
      for (const e of eaters) { e.addMoodlet('pt_dish', D.label, mood, 360); e.needs.hunger = Math.min(100, e.needs.hunger + 25); }
      s.say(pick([`${D.ko} — come and eat!`, `${D.name}, just like grandmother made.`, 'Eat while it is warm!']), 'happy');
      if (s.household && chance(0.35)) G.log(`${s.name.full} cooked ${D.name} (${D.ko}); the steam carried the scent of sesame through the lane.`, 'story', s.pos);
    },

    // ---------- tracking: who is doing what ----------
    tagOf(a) {
      if (!a || a.phase !== 'do') return null;
      if (a.type === 'use' && a.obj && TAG[a.obj.kind]) return TAG[a.obj.kind];
      if (a.type === 'event' && a.pt) return a.pt;
      return null;
    },
    begin(s, r) {
      const tag = r.tag;
      if (tag === 'kite') { const k = this.kites.find((x) => !x.owner); if (k) { k.owner = s; r.kite = k; s.char.bones.rHand.getWorldPosition(_v1); k.grp.position.copy(_v1); k.grp.visible = k.line.visible = true; } }
      if (tag === 'sled') {
        if (!this.sled) return;
        const runs = s.age === 'elder' ? 1 : 3, out = [];
        for (let i = 0; i < runs; i++) { if (i) out.push({ type: 'goto', dest: this.sled.top, label: 'Trudging back up the hill' }); out.push({ type: 'event', dest: [this.sled.top[0] + rr(-1, 1), this.sled.top[1] + rr(-1, 1)], anim: 'sled', dur: 4.2, pt: 'sledRun', lane: rr(-1.6, 1.6), label: 'Sledding (썰매)', adv: { fun: 3 } }); }
        s.queue.unshift(...out); s.endAction(); return;
      }
      if (tag === 'sledRun') { const sl = this.sleds.find((x) => !x.owner); if (sl) { sl.owner = s; r.sled = sl; s.char.root.add(sl.m); sl.m.position.set(0, 0.02, 0.15); sl.m.rotation.set(0, 0, 0); } r.sx = s.pos.x; r.sz = s.pos.z; }
      if (tag === 'snow' || tag === 'snowEv') r.timer = rr(0.2, 1);
    },
    during(s, r, dt, gm) {
      const sk = SKILL[r.tag]; if (sk) { const [k, rate] = sk; const v = s.skills[k] || 0; s.skills[k] = Math.min(10, v + gm * 0.004 * rate * (s.age === 'child' ? 1.3 : 1) * (1 - v / 14)); }
      switch (r.tag) {
        case 'music': case 'musicEv': this.players.push(s); break;
        case 'snow': case 'snowEv': this.throwers.push(s); r.timer -= dt; if (r.timer <= 0) { r.timer = rr(0.85, 1.4); this.throwSnow(s); } break;
        case 'garden': { const g = r.a.obj?.garden; if (g && g.crop) { g.g = Math.min(1.2, g.g + gm / 900); g.q = Math.min(1.5, g.q + gm / 400 * (1 + (s.skills.gardening || 0) / 10)); } break; }
        case 'swim': if (chance(0.25)) { _v1.set(s.pos.x + rr(-0.6, 0.6), s.pos.y + 0.3, s.pos.z + rr(-0.6, 0.6)); _v2.set(rr(-1, 1), rr(1.5, 3.5), rr(-1, 1)); G.fx?.sparkPool?.emit(_v1, _v2, _col.set('#6a8aa0'), rr(0.05, 0.1), rr(0.4, 0.7), 9); } break;
        case 'picnic': case 'picnicEv': if (chance(0.06)) this.petal(s.pos.x + rr(-3, 3), s.pos.y + rr(2, 4), s.pos.z + rr(-3, 3)); break;
        case 'flies': if (chance(0.5)) { _v1.set(s.pos.x + rr(-6, 6), s.pos.y + rr(0.3, 2.2), s.pos.z + rr(-6, 6)); _v2.set(rr(-0.3, 0.3), rr(-0.1, 0.2), rr(-0.3, 0.3)); G.fx?.flyPool?.emit(_v1, _v2, _col.set('#c8ff70'), rr(0.06, 0.11), rr(3, 6), 0); } break;
        case 'sledRun': {
          if (!this.sled) break; const a = r.a, p = clamp(a.t / (a.dur || 4), 0, 1), e = p * p * (1.8 - 0.8 * p);
          const [dx, dz] = this.sled.dir, L = this.sled.len; const lane = a.lane || 0;
          s.pos.x = r.sx + dx * L * e + dz * lane * e; s.pos.z = r.sz + dz * L * e - dx * lane * e; s.pos.y = groundAt(s.pos.x, s.pos.z);
          s.heading = Math.atan2(dx, dz); s.syncTransform();
          if (p > 0.1 && chance(0.5)) { _v1.set(s.pos.x, s.pos.y + 0.1, s.pos.z); _v2.set(rr(-1, 1) - dx * 2, rr(0.5, 2), rr(-1, 1) - dz * 2); G.fx?.sparkPool?.emit(_v1, _v2, _col.set('#7888a0'), rr(0.05, 0.09), rr(0.3, 0.6), 6); }
          if (p > 0.4 && !r.yelled) { r.yelled = true; if (chance(0.6)) s.say(pick(['Wheee!', '야호!', 'Faster!', 'Aaah!']), 'happy', 2); }
          break;
        }
      }
    },
    finish(s, r) {
      if (r.kite) { r.kite.owner = null; r.kite.grp.visible = r.kite.line.visible = false; }
      if (r.sled) { r.sled.owner = null; r.sled.m.parent?.remove(r.sled.m); }
      if (s.dead || s.removed) return;
      const a = r.a, mins = r.t, done = mins >= Math.min(20, (a.dur || 30) * 0.7);
      const md = MOOD[r.tag]; if (md && mins > (r.tag === 'sledRun' ? 2 : 8)) s.addMoodlet('pt_' + r.tag, md[0], md[1], md[2]);
      if (!done) return;
      const d = this.sd(s);
      if (r.tag === 'paint') {
        const q = clamp((s.skills.painting || 0) + rr(-1, 1.5), 0, 10); this.give(s, 'painting', 1); d.pq += q; d.made++; const subj = pick(SUBJECTS);
        s.say(pick([`${subj}… yes.`, 'The ink found its own way.', 'Not bad. Not bad at all.']), 'happy');
        if (q >= 8.5 && q > d.best) { d.best = q; G.log(`${s.name.full} lays down the brush: a masterwork of ${subj}. Those who see it fall silent.`, 'story', s.pos); }
        else if (s.household && chance(0.3)) G.log(`${s.name.full} painted ${subj} in soft grey ink.`, 'story', s.pos);
      } else if (r.tag === 'callig') { this.give(s, 'scroll', 1); s.say(pick(['Each stroke, a breath.', '一 … 永 … ', 'The character for "peace" (和).']), 'talk'); }
      else if (r.tag === 'garden') { const g = a.obj?.garden; if (g) this.harvest(s, g); }
      else if (r.tag === 'cook') this.serveDish(s, a.dish);
      else if (r.tag === 'stars') { s.skills.scholarship = Math.min(10, (s.skills.scholarship || 0) + 0.1); if (chance(0.4)) s.say(pick(['The Weaver Girl and the Herdsman…', 'A shooting star! Quick, a wish.', 'The Big Dipper points north.']), 'talk'); }
      else if (r.tag === 'music' && (s.skills.music || 0) > 6 && chance(0.2) && s.household) G.log(`Passers-by stop in the lane as ${s.name.full}'s gayageum sings of distant rivers.`, 'story', s.pos);
      else if (r.tag === 'moon' && chance(0.5)) s.say(pick(['May my family stay healthy…', 'A good harvest, please.', 'Bring them home safely.']), 'talk');
    },
    petal(x, y, z) { _v1.set(x, y, z); const wd = G.env.windDir; _v2.set(wd.x * 0.7 + rr(-0.2, 0.2), -rr(0.2, 0.5), wd.y * 0.7 + rr(-0.2, 0.2)); G.fx?.flyPool?.emit(_v1, _v2, _col.set('#c87890'), rr(0.05, 0.08), rr(4, 7), 0); },
    throwSnow(s) {
      const b = this.snowballs.find((x) => !x.on); if (!b) return;
      let tgt = null, bd = 18; for (const o of this.throwers) if (o !== s) { const d = o.pos.distanceTo(s.pos); if (d < bd && d > 2) { bd = d; tgt = o; } }
      s.char.bones.rHand.getWorldPosition(_v1);
      if (tgt) { _v2.set(tgt.pos.x, tgt.pos.y + 1.1, tgt.pos.z); s.heading = Math.atan2(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z); }
      else _v2.set(s.pos.x + Math.sin(s.heading) * 9, s.pos.y + 0.5, s.pos.z + Math.cos(s.heading) * 9);
      const T = 0.55 + _v1.distanceTo(_v2) * 0.03;
      b.m.position.copy(_v1); b.v.subVectors(_v2, _v1).divideScalar(T); b.v.y += 4.9 * T; b.t = 0; b.on = true; b.m.visible = true; b.tgt = tgt;
    },
    updateSnowballs(dt) {
      for (const b of this.snowballs) {
        if (!b.on) continue; b.t += dt; b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
        const p = b.m.position; const hit = b.tgt && !b.tgt.dead && Math.hypot(p.x - b.tgt.pos.x, p.z - b.tgt.pos.z) < 0.5 && p.y < b.tgt.pos.y + 1.7;
        if (hit || p.y < groundAt(p.x, p.z) + 0.05 || b.t > 2.5) {
          for (let i = 0; i < 6; i++) { _v2.set(rr(-1.5, 1.5), rr(0.5, 2.5), rr(-1.5, 1.5)); G.fx?.sparkPool?.emit(p, _v2, _col.set('#8090a0'), rr(0.05, 0.1), rr(0.3, 0.6), 9); }
          if (hit) { b.tgt.needs.fun = Math.min(100, b.tgt.needs.fun + 1); if (chance(0.15)) b.tgt.say(pick(['Ack! 차가워!', 'You got me!', 'Ha! Missed—oh.', 'Revenge!']), 'happy', 1.8); }
          b.on = false; b.m.visible = false;
        }
      }
    },
    updateKites(dt) {
      const wd = G.env.windDir, ws = clamp(G.env.windStrength ?? 1, 0.3, 2);
      for (const k of this.kites) {
        const s = k.owner; if (!s) continue;
        const hand = s.char.bones.rHand.getWorldPosition(_v1);
        const L = 13 + ws * 4 + Math.sin(this.clock * 0.21 + k.i) * 3, el = 0.72 + Math.sin(this.clock * 0.5 + k.i * 2) * 0.12;
        const sway = Math.sin(this.clock * 0.9 + k.i) * 2.5 * ws;
        _v2.set(hand.x + wd.x * Math.cos(el) * L - wd.y * sway, hand.y + Math.sin(el) * L, hand.z + wd.y * Math.cos(el) * L + wd.x * sway);
        k.grp.position.lerp(_v2, 1 - Math.exp(-1.6 * dt));
        k.grp.lookAt(hand); k.grp.rotateX(-0.35); k.grp.rotateZ(Math.sin(this.clock * 1.7 + k.i) * 0.35);
        k.tails[0].rotation.z = Math.sin(this.clock * 3 + k.i) * 0.3; k.tails[1].rotation.z = Math.sin(this.clock * 3.3 + k.i) * 0.3;
        s.heading = Math.atan2(k.grp.position.x - s.pos.x, k.grp.position.z - s.pos.z); s.syncTransform();
        const kp = k.grp.position, n = 12, sag = L * 0.07;
        for (let i = 0; i < n; i++) { const t = i / (n - 1); k.arr[i * 3] = hand.x + (kp.x - hand.x) * t; k.arr[i * 3 + 1] = hand.y + (kp.y - 0.6 - hand.y) * t - sag * 4 * t * (1 - t); k.arr[i * 3 + 2] = hand.z + (kp.z - hand.z) * t; }
        k.line.geometry.attributes.position.needsUpdate = true;
      }
    },
    updateSnowmen() {
      if (!this.snowmen.length) return; const snow = G.env.snowCover || 0, winter = this.season() === 'winter'; let dirty = false;
      for (let i = 0; i < this.snowmen.length; i++) {
        const m = this.snowmen[i]; const tgt = winter && snow > m.th ? 1 : 0; const k = m.k + clamp(tgt - m.k, -0.02, 0.05);
        if (Math.abs(k - m.k) < 1e-4 && m.drawn) continue; m.k = k; m.drawn = true; dirty = true;
        _p.set(m.x, m.y - (1 - k) * 0.2, m.z); _q.setFromAxisAngle(_v1.set(0, 1, 0), m.r); _s.set(k, k * (0.6 + 0.4 * k), k); this.snowmanMesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      if (dirty) this.snowmanMesh.instanceMatrix.needsUpdate = true;
    },

    // ---------- music: pentatonic gayageum phrases ----------
    updateMusic(dt, gm) {
      const A = G.audio; const ps = this.players;
      // listeners nearby: fun & social
      this.listenT += gm;
      if (this.listenT > 2 && ps.length) {
        const k = this.listenT; this.listenT = 0;
        for (const p of ps) for (const o of G.simsNear(p.pos.x, p.pos.z)) {
          if (o === p || o.dead || o.hidden || o.pos.distanceTo(p.pos) > 10) continue;
          o.needs.fun = Math.min(100, o.needs.fun + 0.35 * k * (1 + (p.skills.music || 0) / 10)); o.needs.social = Math.min(100, o.needs.social + 0.15 * k);
          if (chance(0.02 * k)) o.addMoodlet('pt_heard', `Heard ${p.name.given} play the gayageum`, 4 + Math.round((p.skills.music || 0) / 2), 240);
        }
      } else if (!ps.length) this.listenT = 0;
      if (!A?.ctx || A.ctx.state !== 'running' || !ps.length || G.paused) return;
      const L = A.listener || G.player?.focus; if (!L) return;
      let best = null, bd = 1e9; for (const p of ps) { const d = Math.hypot(p.pos.x - L.x, p.pos.z - L.z); if (d < bd) { bd = d; best = p; } }
      const vol = Math.pow(Math.max(0, 1 - bd / 48), 1.5) * 0.34; if (vol < 0.01) return;
      if (A.ctx.currentTime < this.nextPhrase) return;
      const drums = G.director.active?.kind === 'musicnight';
      this.nextPhrase = A.ctx.currentTime + this.phrase(best.skills.music || 0, vol, drums);
    },
    phrase(skill, vol, drums) {
      const A = G.audio, sk = clamp(skill / 10, 0, 1), n = 4 + Math.floor(rand() * 3 + sk * 4);
      const beat = 0.46 - sk * 0.1; let when = 0.1, idx = TONIC + Math.floor(rr(-1, 3));
      // skilled players repeat a motif and resolve to the tonic; beginners wander
      const motif = []; const useMotif = sk > 0.45 && rand() < 0.6;
      for (let i = 0; i < n; i++) {
        let step = rand() < 0.45 + sk * 0.45 ? (rand() < 0.5 ? -1 : 1) : Math.floor(rr(-3, 4));
        if (useMotif && i >= 3 && motif.length) step = motif[(i - 3) % motif.length]; else motif.push(step);
        idx = clamp(idx + step, 2, SCALE.length - 2);
        if (i === n - 1 && sk > 0.25) idx = rand() < 0.65 ? TONIC : TONIC + 3;
        const long = i === n - 1 || rand() < 0.22;
        const bend = sk > 0.35 && (long || rand() < 0.15) ? (rand() < 0.7 ? 0.06 : -0.05) : 0; // nonghyeon: pressed-string bend
        if (sk > 0.6 && rand() < 0.22) A.pluck(SCALE[idx + 1], vol * 0.45, when - 0.07);
        A.pluck(SCALE[idx], vol * (0.8 + rand() * 0.3) * (sk < 0.2 && rand() < 0.3 ? 0.5 : 1), when, bend);
        if (i === 0 || (sk > 0.5 && i % 4 === 0)) A.pluck(SCALE[rand() < 0.6 ? 0 : 2], vol * 0.4, when);
        if (drums) A.drumHit(i % 3 === 0 ? 'kung' : 'ta', vol * 0.9, when);
        when += beat * (long ? 2 : sk > 0.5 && rand() < 0.2 ? 0.5 : 1) * (sk < 0.3 ? rr(0.75, 1.5) : 1);
      }
      if (drums) A.drumHit('kung', vol, when);
      return when + beat * (drums ? 0.5 : 1.5 + rand() * 2.5 * (1 - sk * 0.5));
    },

    // ---------- main loop ----------
    update(dt, gm) {
      this.clock += dt;
      if ((this.gateT -= dt) <= 0) { this.gateT = 1; this.refreshGates(); this.updateSnowmen(); }
      if ((this.sweepT -= dt) <= 0) { this.sweepT = 4; for (const s of G.sims) if (!s.dead) this.initSkills(s); }
      if (this.kimjangShow > 0) this.kimjangShow -= gm;
      this.gardenAcc += gm; if (this.gardenAcc > 5) { this.tickGardens(this.gardenAcc); this.gardenAcc = 0; }
      this.players.length = 0; this.throwers.length = 0;
      for (const [s, r] of this.track) if (s.dead || s.removed || s.action !== r.a) { this.finish(s, r); this.track.delete(s); }
      for (const s of G.sims) {
        if (s.dead) continue; const a = s.action, tag = this.tagOf(a);
        if (!tag) continue;
        let r = this.track.get(s);
        if (!r) { r = { a, tag, t: 0 }; this.track.set(s, r); this.begin(s, r); if (s.action !== a) continue; }
        r.t += gm; this.during(s, r, dt, gm);
      }
      this.updateKites(dt); this.updateSnowballs(dt); this.updateMusic(dt, gm);
      // ambient: falling petals in spring, brazier flames in winter
      const F = G.player?.focus; if (!F || !G.fx) return; const se = this.seasonKey;
      if (se === 'spring') for (const b of this.blossoms) { if (Math.abs(b[0] - F.x) + Math.abs(b[2] - F.z) < 90 && chance(0.12)) this.petal(b[0] + rr(-1.5, 1.5), b[1] + rr(-0.5, 0.8), b[2] + rr(-1.5, 1.5)); }
      if (se === 'winter') for (const b of this.braziers) { if (Math.abs(b[0] - F.x) + Math.abs(b[2] - F.z) < 120 && chance(0.6)) { _v1.set(b[0] + rr(-0.25, 0.25), b[1], b[2] + rr(-0.25, 0.25)); _v2.set(rr(-0.15, 0.15), rr(1.0, 2.0), rr(-0.15, 0.15)); G.fx.firePool?.emit(_v1, _v2, _col.setHSL(rr(0.03, 0.1), 1, 0.55), rr(0.18, 0.32), rr(0.4, 0.8), -0.5); } }
    },

    onEvent(name, p) {
      if (name === 'ready') { for (const s of G.sims) this.initSkills(s); this.refreshGates(); }
      else if (name === 'birth' && p?.child) this.initSkills(p.child);
      else if (name === 'season') {
        const msg = { spring: 'Children unspool bangpae-yeon kites over the plaza; soon the sky of Haeryeong is full of paper moons.', summer: 'Watermelons cool in the stream, and laughter splashes along the riverbank.', autumn: 'Red peppers dry on every roof. Soon the whole village will gather for kimjang.', winter: 'Charcoal braziers glow in the lanes; the children wait for snow deep enough to sled.' }[p?.season];
        if (msg) G.log(msg, 'festival');
      } else if (name === 'day' && this.season() === 'winter') {
        for (const h of G.world.houses) { const rs = h.residents.filter((s) => !s.dead); if (rs.some((s) => s.inv?.kimchi > 0)) for (const s of rs) s.addMoodlet('pt_kimchi', 'Kimchi stores for winter', 6, 1440); }
      }
    },

    // ---------- director events ----------
    registerEvents() {
      const D = G.director; if (!D?.registerEvent) return;
      const vill = (s) => s.faction === 'village' && !s.dead && s.needs.energy > 15 && !['soldier', 'general', 'police', 'king'].includes(s.job);
      const ring = (c, r0, r1) => { for (let i = 0; i < 8; i++) { const a = rr(0, 6.283), r = rr(r0, r1), x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r; if (!G.nav.blocked(x, z, 0.4)) return [x, z]; } return [c[0] + rr(-r1, r1), c[1] + rr(-r1, r1)]; };
      const slotFree = (sl) => !sl.sim || sl.sim.dead || sl.sim.action?.slot !== sl;
      const ev = (s, o) => { s.startAction({ type: 'event', ...o }); return true; };
      const chatter = (set, lines) => { if (chance(0.03)) { const arr = [...set].filter((s) => !s.dead && s.action?.pt); if (arr.length) pick(arr).say(pick(lines), 'talk', 2.5); } };
      const S = this;
      // --- Kimjang ---
      D.registerEvent('kimjang', {
        weight: (G2, h, day) => S.season() === 'autumn' && h > 8.5 && h < 13.5 && day - S.last.kimjang >= 3 ? 3 : 0,
        run: () => {
          S.last.kimjang = G.env.day; const who = new Set(); for (const sl of S.kSlots) sl.sim = null;
          G.log('Kimjang (김장)! Mountains of salted cabbage arrive at the plaza. Neighbours roll up their sleeves to rub in red pepper, garlic and salted shrimp — enough kimchi to carry every house through winter.', 'festival', { x: S.kimjangSite[0], z: S.kimjangSite[1] });
          D.start({ kind: 'kimjang', title: 'Kimjang · Kimchi-making', ko: '김장', pos: S.kimjangSite, max: 240,
            assign: (s) => {
              if (!vill(s)) return false;
              const sl = S.kSlots.find(slotFree);
              if (sl) { sl.sim = s; who.add(s); return ev(s, { dest: sl.p, anim: 'stir', dur: rr(50, 90), look: sl.look, adv: { social: 1.0, fun: 0.8 }, pt: 'kimjang', slot: sl, label: 'Making kimchi (김장)' }); }
              if (s.age === 'child' || chance(0.5)) return ev(s, { dest: ring(S.kimjangSite, 5, 9), anim: pick(['cheer', 'talk', 'laugh']), dur: rr(20, 40), look: S.kimjangSite, adv: { fun: 0.8, social: 0.6 }, label: 'Watching the kimjang' });
              return false;
            },
            update: () => chatter(who, ['More pepper on this one!', 'My mother-in-law salts hers overnight.', 'Taste — too salty?', 'This batch will be perfect by Seollal.', 'Pass the garlic!']),
            end: () => {
              S.kimjangShow = 300; let n = 0;
              for (const s of who) if (!s.dead) { S.give(s, 'kimchi', s.household ? 3 : 1); s.addMoodlet('pt_kimjang', 'Made kimchi together', 12, 2880); n++; }
              G.log(`The last jar is sealed and buried to its shoulders. ${n} neighbours made kimchi together; each carries home a share wrapped in cloth.`, 'festival');
            } });
          for (const s of G.sims) if (s.faction === 'village' && !s.controlled && s.action && !s.action.work && s.action.type === 'use' && chance(0.5)) s.endAction();
        } });
      // --- Poetry & painting contest at the riverside pavilion ---
      D.registerEvent('pt_contest', {
        weight: (G2, h, day) => S.season() !== 'winter' && h > 10 && h < 15 && day - S.last.contest >= 3 && S.contestSlots.length >= 3 ? 1.6 : 0,
        run: () => {
          S.last.contest = G.env.day; const who = new Set(); S.contestWho = who; for (const sl of S.contestSlots) sl.sim = null;
          G.log('A poetry & painting contest (시화 대회) gathers at the riverside pavilion. Brushes are wetted; the judges sip tea and say nothing.', 'festival', { x: 128, z: 100 });
          if (G.household.length) G.ui?.toast('A poetry & painting contest begins at the riverside pavilion — click the pavilion to enter.', 'festival');
          D.start({ kind: 'contest', title: 'Poetry & Painting Contest', ko: '시화 대회', pos: [128, 100], max: 200,
            assign: (s) => {
              if (!vill(s) || s.age === 'child') return false;
              const talent = (s.skills.painting || 0) + (s.skills.scholarship || 0);
              const sl = (talent > 3 || s.has('Scholarly') || s.has('Romantic')) && S.contestSlots.find(slotFree);
              if (sl) { sl.sim = s; who.add(s); return ev(s, { dest: sl.p, anim: 'paint', prop: 'brush', dur: 180, look: sl.look, adv: { fun: 0.8, honor: 0.4 }, pt: 'contest', slot: sl, label: 'Competing in the contest' }); }
              if (chance(0.35)) return ev(s, { dest: ring([128, 100], 13, 17), anim: () => 'talk', dur: rr(30, 60), look: [128, 100], adv: { fun: 0.9, social: 0.6 }, label: 'Admiring the contest' });
              return false;
            },
            update: () => chatter(who, ['The river will not sit still for me.', 'One more stroke… no.', 'Mist. It needs more mist.', 'Autumn wind on the water —']),
            end: () => {
              const ent = [...who].filter((s) => !s.dead); if (!ent.length) return G.log('The judges wait, but no brush touches paper. The contest is quietly abandoned.', 'festival');
              const sc = (s) => (s.skills.painting || 0) * 0.7 + (s.skills.scholarship || 0) * 0.5 + (s.skills.charisma || 0) * 0.1 + rr(0, 3);
              let w = null, ws = -1; for (const s of ent) { const v = sc(s); if (v > ws) { ws = v; w = s; } }
              w.earn(30); w.needs.honor = Math.min(100, w.needs.honor + 25); w.addMoodlet('pt_contest', 'Won the poetry & painting contest', 20, 2880); S.give(w, 'painting', 1); S.sd(w).pq += Math.min(10, (w.skills.painting || 0) + 2);
              for (const s of ent) if (s !== w) s.addMoodlet('pt_contest', 'Painted at the pavilion', 6, 720);
              G.log(`At the riverside pavilion, ${w.name.full} wins the contest with "${pick(TITLES)}". The eldest judge reads the poem twice, then sets down his cup. (30 nyang)`, 'festival', w.pos);
            } });
        } });
      // --- Music night at the jumak ---
      D.registerEvent('pt_musicnight', {
        weight: (G2, h, day) => h > 18.5 && h < 21.5 && day - S.last.musicnight >= 2 && G.env.weather !== 'rain' ? 1.5 : 0,
        run: () => {
          S.last.musicnight = G.env.day; const who = new Set(); for (const sl of S.stageSlots) sl.sim = null;
          G.log('Lanterns are lit outside the jumak: tonight there is music. A janggu drum sets the rhythm and the gayageum answers.', 'festival', { x: S.stage[0], z: S.stage[1] });
          D.start({ kind: 'musicnight', title: 'Music Night at the Jumak', ko: '풍류의 밤', pos: S.stage, max: 180,
            assign: (s) => {
              if (!vill(s)) return false;
              const sl = s.age !== 'child' && ((s.skills.music || 0) > 1.5 || chance(0.3)) && S.stageSlots.find(slotFree);
              if (sl) { sl.sim = s; who.add(s); return ev(s, sl.drum ? { dest: sl.p, anim: 'drum', prop: 'drum', dur: rr(60, 110), look: sl.look, adv: { fun: 1.2, social: 0.6 }, slot: sl, label: 'Drumming the janggu' } : { dest: sl.p, anim: 'gayageum', prop: 'gayageum', dur: rr(60, 110), look: sl.look, adv: { fun: 1.2, social: 0.6 }, pt: 'musicEv', slot: sl, label: 'Playing at the music night' }); }
              const [x, z] = ring(S.stage, 3, 8); who.add(s);
              return ev(s, { dest: [x, z], anim: pick(['dance', 'dance', 'cheer', 'talk', 'laugh']), dur: rr(30, 70), look: S.stage, adv: { fun: 1.4, social: 1.0 }, label: 'Enjoying the music night' });
            },
            update: () => chatter(who, ['Eolssigu!', 'Jotta! 좋다!', 'Play "Arirang"!', 'Another song!']),
            end: () => { for (const s of who) if (!s.dead) s.addMoodlet('pt_musicnight', 'A night of music', 10, 720); G.log('The last notes drift over the dark paddies. Someone is still humming on the way home.', 'festival'); } });
        } });
      // --- Spring flower-viewing picnic ---
      D.registerEvent('pt_picnic', {
        weight: (G2, h, day) => S.season() === 'spring' && h > 10.5 && h < 15 && day - S.last.picnic >= 2 ? 1.8 : 0,
        run: () => {
          S.last.picnic = G.env.day; const who = new Set(); const c = S.picnicSite;
          G.log('Hwajeon-nori (화전놀이): families spread mats beneath the blossoms and fry azalea-petal rice cakes over little fires.', 'festival', { x: c[0], z: c[1] });
          D.start({ kind: 'picnic', title: 'Blossom Picnic', ko: '화전놀이', pos: c, max: 200,
            assign: (s) => { if (!vill(s) || who.size > 28) return false; who.add(s); const [x, z] = ring(c, 2.5, 8); const anim = pick(['eat', 'eat', 'laugh', 'talk', 'dance', 'sit']);
              return ev(s, { dest: [x, z], anim, prop: anim === 'eat' ? 'bowl' : null, dur: rr(40, 80), look: c, adv: { fun: 1.2, social: 1.0, hunger: anim === 'eat' ? 1.5 : 0.3 }, pt: 'picnicEv', label: 'Picnicking under the blossoms' }); },
            update: () => chatter(who, ['The petals are falling into my soup!', 'Spring has really come.', 'One more hwajeon, please.', 'Look, a swallow!']),
            end: () => { for (const s of who) if (!s.dead) s.addMoodlet('pt_picnic', 'Flower-viewing picnic', 12, 720); G.log('Petals drift onto the empty mats as the families walk home, sleepy and full.', 'festival'); } });
        } });
      // --- Snow day ---
      D.registerEvent('pt_snowday', {
        weight: (G2, h, day) => S.season() === 'winter' && (G.env.snowCover || 0) > 0.35 && h > 9 && h < 15 && day - S.last.snowday >= 2 && S.snowSite ? 1.4 : 0,
        run: () => {
          S.last.snowday = G.env.day; const who = new Set(); const c = S.snowSite;
          G.log('Fresh snow! The plaza becomes a battlefield of snow forts; even the grandmothers throw one or two.', 'festival', { x: c[0], z: c[1] });
          D.start({ kind: 'snowday', title: 'Snowball Battle', ko: '눈싸움', pos: c, max: 150,
            assign: (s) => { if (!vill(s) || who.size > 22) return false; const young = s.age === 'child' || s.age === 'young'; if (!young && chance(0.6)) return false; who.add(s); const [x, z] = ring(c, 2, 10);
              return young || chance(0.4) ? ev(s, { dest: [x, z], anim: 'throw', prop: 'snowball', dur: rr(25, 50), look: c, adv: { fun: 2, social: 0.8, energy: -0.2 }, pt: 'snowEv', label: 'Snowball battle!' })
                : ev(s, { dest: [x, z], anim: 'cheer', dur: rr(20, 40), look: c, adv: { fun: 1, social: 0.6 }, label: 'Cheering the snowball battle' }); },
            end: () => { for (const s of who) if (!s.dead) s.addMoodlet('pt_snow', 'Snowball battle!', 10, 600); G.log('Red-cheeked and soaked, the snow warriors retreat to the braziers.', 'festival'); } });
        } });
    },

    // ---------- menus ----------
    nearestFree(me, kind) {
      let best = null, bd = 1e9; const d = KINDS[kind];
      for (const o of this.objs[kind] || []) { if (o.users.size >= d.cap) continue; if (d.home && (!me.home || o.house !== me.home.id)) continue; const dd = Math.hypot(o.x - me.pos.x, o.z - me.pos.z); if (dd < bd) { bd = dd; best = o; } }
      return best;
    },
    go(me, o, extra = {}) { const a = { type: 'use', obj: o, label: extra.label || o.def.label, ...extra }; if (G.player?.command) G.player.command(me, a); else { me.queue = []; me.cancelAction(); me.startAction(a); } },
    goHarvest(me, g) { const a = { type: 'goto', dest: [g.obj.x, g.obj.z], label: 'To the garden', then: (s) => this.harvest(s, g) }; if (G.player?.command) G.player.command(me, a); else { me.queue = []; me.cancelAction(); me.startAction(a); } },
    sellValue(me, k) {
      if (k === 'painting') { const d = this.sd(me), n = me.inv?.painting || 0; const q = n ? d.pq / n : 2; return Math.round(8 + q * q * 1.3 + (me.skills.charisma || 0) * 0.8); }
      if (k === 'scroll') return Math.round(6 + (me.skills.scholarship || 0) * 2.5);
      if (k === 'kimchi') return 14; return CROP[k]?.price || 2;
    },
    sell(me, k) {
      const n = me.inv?.[k] || 0; if (!n) return; const each = this.sellValue(me, k), tot = each * n;
      me.inv[k] = 0; if (k === 'painting') this.sd(me).pq = 0; me.earn(tot);
      G.ui?.toast(`${me.name.given} sold ${n} ${NAMES[k][n > 1 ? 1 : 0]} for ${tot} nyang.`); G.ui?.renderPanel?.();
    },
    simMenuItems(me, other) {
      if (!me || !other || me === other || other.dead) return [];
      const out = [];
      if (me.inv?.painting > 0) out.push({ label: '🖼 Gift an ink painting', fn: () => { const d = this.sd(me); const q = d.pq / me.inv.painting; me.inv.painting--; d.pq -= q; this.give(other, 'painting', 1); this.sd(other).pq += q; me.changeRel(other, 8 + q, other.getRel(me).r > 20 ? 4 : 0); other.addMoodlet('pt_gift', 'Received a painting', 8, 1440); other.say(q > 7 ? 'This… this is exquisite.' : 'How thoughtful! I will hang it by the window.', 'happy'); } });
      if (me.inv?.kimchi > 0) out.push({ label: '🏺 Share a jar of kimchi', fn: () => { me.inv.kimchi--; this.give(other, 'kimchi', 1); me.changeRel(other, 6); other.say('Your family’s kimchi! Thank you.', 'happy'); } });
      const tea = this.teaPair(me);
      if (tea && !other.controlled && other.age !== 'child') out.push({ label: '🍵 Invite to tea', fn: () => {
        if (other.getRel(me).f < -20) { other.say('I would rather not.', 'talk'); return; }
        this.go(me, tea[0]); other.queue = []; other.cancelAction(); other.startAction({ type: 'use', obj: tea[1], label: 'Tea with ' + me.name.given }); me.changeRel(other, 3); other.say('Tea? With pleasure.', 'happy');
      } });
      return out;
    },
    teaPair(me) {
      const t = this.objs.pt_tea; if (!KINDS.pt_tea.cap) return null; let best = null, bd = 1e9;
      for (let i = 0; i + 1 < t.length; i += 2) if (!t[i].users.size && !t[i + 1].users.size) { const d = Math.hypot(t[i].x - me.pos.x, t[i].z - me.pos.z); if (d < bd) { bd = d; best = [t[i], t[i + 1]]; } }
      return best;
    },
    objMenuItems(me, o) {
      if (!me || !o) return [];
      const out = [];
      if (o.kind === 'shop' || o.kind === 'stallWork') for (const k of ['painting', 'scroll', 'cabbage', 'radish', 'pepper', 'kimchi']) { const n = me.inv?.[k] || 0; if (n) out.push({ label: `Sell ${n} ${NAMES[k][n > 1 ? 1 : 0]} · ${this.sellValue(me, k)} each`, fn: () => this.sell(me, k) }); }
      if (o.kind === 'pt_garden' && o.garden && me.home && o.house === me.home.id && o.garden.g >= 1) out.push({ label: `🌱 Harvest the ${CROP[o.garden.crop].name}`, fn: () => this.goHarvest(me, o.garden) });
      if ((o.kind === 'cookpot' || o.kind === 'pt_cook') && me.home && o.house === me.home.id) { const co = this.cookObj(me); if (co) for (const [k, D] of this.dishesFor(me)) out.push({ label: `🍲 Cook ${D.name} (${D.ko})`, fn: () => this.go(me, co, { dish: k, label: `Cooking ${D.name}` }) }); }
      if ((o.kind === 'pavilion' || o.kind === 'pt_paint') && G.director.active?.kind === 'contest' && !this.contestWho?.has(me) && me.age !== 'child') {
        const sl = this.contestSlots.find((x) => !x.sim || x.sim.dead || x.sim.action?.slot !== x);
        if (sl) out.push({ label: '🖌 Enter the poetry & painting contest', fn: () => { sl.sim = me; this.contestWho.add(me); me.queue = []; me.cancelAction(); me.startAction({ type: 'event', dest: sl.p, anim: 'paint', prop: 'brush', dur: 150, look: sl.look, adv: { fun: 0.8, honor: 0.4 }, pt: 'contest', slot: sl, label: 'Competing in the contest' }); } });
      }
      return out;
    },

    chosen() { const s = G.selected; return s && s.household && !s.dead ? s : G.household.find((x) => !x.dead); },
    openModal() {
      const me = this.chosen(); if (!me) return G.ui.toast('There is no one to send.');
      this.initSkills(me);
      const se = this.season(), sk = me.skills;
      const bar = (v) => `<span style="display:inline-block;width:70px;height:6px;background:#0003;border-radius:3px;vertical-align:middle"><i style="display:block;height:100%;width:${(v || 0) * 10}%;background:#d8b46a;border-radius:3px"></i></span> ${(v || 0).toFixed(1)}`;
      const rows = LIST.map(([k, icon, name, desc, when]) => {
        const avail = this.available(k), o = avail && this.nearestFree(me, k);
        return `<tr style="opacity:${avail ? 1 : 0.5}"><td>${icon}</td><td><b>${name}</b> <em>${KINDS[k].ko}</em><br><small>${desc}</small></td><td><small>${avail ? (o ? 'Available' : 'All spots taken') : when}</small></td><td><button data-go="${k}" ${o ? '' : 'disabled'}>Go</button></td></tr>`;
      }).join('');
      const g = me.home && this.gardens.find((x) => x.house === me.home);
      const inv = me.inv || {}; const items = [['painting', '🖼 paintings'], ['scroll', '📜 scrolls'], ['radish', '무 radishes'], ['pepper', '고추 peppers'], ['cabbage', '배추 cabbages'], ['kimchi', '🏺 kimchi jars']].filter(([k]) => inv[k] > 0).map(([k, l]) => `${inv[k]} ${l}`).join(' · ') || 'nothing yet';
      const co = this.cookObj(me);
      const el = G.ui.modal(`<h2>Pastimes · 놀이</h2><p><b>${esc(me.name.full)}</b> — ${{ spring: '🌸 Spring', summer: '☀ Summer', autumn: '🍁 Autumn', winter: '❄ Winter' }[se]}, ${G.env.timeLabel || ''}</p>
        <p style="line-height:1.7">🖌 Painting ${bar(sk.painting)} &nbsp; 🎵 Music ${bar(sk.music)}<br>🍲 Cooking ${bar(sk.cooking)} &nbsp; 🌱 Gardening ${bar(sk.gardening)}<br>📜 Scholarship ${bar(sk.scholarship)}</p>
        <p><small>Carrying: ${items}${g ? ` · Garden: ${esc(g.obj.sub || '')}` : ''}</small></p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        ${co ? `<h3>Home kitchen · 부엌</h3><div>${this.dishesFor(me).map(([k, D]) => `<button data-dish="${k}">${D.name} <em>${D.ko}</em></button>`).join(' ')}</div>` : ''}
        ${g && g.g >= 1 ? '<p><button data-harvest="1">🌱 Harvest the garden</button></p>' : ''}
        <p><small>Sell paintings, scrolls, produce and kimchi by clicking a market stall.</small></p>`);
      const close = () => el.classList.add('hidden');
      el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { const o = this.nearestFree(me, b.dataset.go); if (o) { this.go(me, o); G.ui.toast(`${me.name.given}: ${o.def.label}`); close(); } }));
      el.querySelectorAll('[data-dish]').forEach((b) => (b.onclick = () => { const D = DISHES[b.dataset.dish]; this.go(me, co, { dish: b.dataset.dish, label: `Cooking ${D.name}` }); close(); }));
      el.querySelectorAll('[data-harvest]').forEach((b) => (b.onclick = () => { this.goHarvest(me, g); close(); }));
    },
    panelHtml(s) {
      const k = s.skills || {}; if (k.painting === undefined) return '';
      const f = (v) => (v || 0).toFixed(1);
      const g = s.home && this.gardens.find((x) => x.house === s.home);
      return `<div class="facts">🎨 Pastimes — 🖌 ${f(k.painting)} · 🎵 ${f(k.music)} · 🍲 ${f(k.cooking)} · 🌱 ${f(k.gardening)}${s.inv?.painting ? ` · 🖼 ${s.inv.painting} painting${s.inv.painting > 1 ? 's' : ''} (≈${this.sellValue(s, 'painting')} each)` : ''}${s.inv?.kimchi ? ` · 🏺 ${s.inv.kimchi} kimchi` : ''}${g && s.household ? `<br>🌱 Garden: ${esc(g.obj.sub || '')}` : ''}</div>`;
    },

    // ---------- save / load ----------
    serialize() {
      return { last: this.last, gardens: this.gardens.map((g) => [g.house.id, g.crop, +g.g.toFixed(3), +g.q.toFixed(2)]), sims: [...this.simData].map(([id, d]) => [id, +d.pq.toFixed(1), d.made, +d.best.toFixed(1)]) };
    },
    restore(d) {
      if (!d) return;
      Object.assign(this.last, d.last || {});
      for (const [hid, crop, g, q] of d.gardens || []) { const gd = this.gardens.find((x) => x.house.id === hid); if (gd) { gd.crop = crop; gd.g = g; gd.q = q; } }
      this.drawGardens(true);
      for (const [id, pq, made, best] of d.sims || []) this.simData.set(id, { pq, made, best });
    },
  };
  return sys;
}
