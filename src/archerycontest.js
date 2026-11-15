// Archery contest (활쏘기 대회): five arrows each at the training-ground targets.
// Villagers are scored by skill; when your character steps up, every ring is earned with your own aim.
import * as THREE from 'three';
import { LAYOUT, groundAt } from './terrain.js';

const SHOTS = 5;
const ring = (off) => (off >= 0.75 ? 0 : Math.max(1, Math.min(10, Math.round(10 - off / 0.075))));

export function createArcheryContestSystem(G) {
  const D = () => G.director;
  let st = null;
  const S = {
    id: 'archeryContest',
    get _st() { return st; },
    lanes() {
      const [cx, cz] = LAYOUT.training;
      return [0, 1, 2].map((i) => { const px = cx + 14 + i * 3, pz = cz - 10; return { x: px, y: groundAt(px, pz) + 1.1, z: pz, r: 0.75, line: [px, pz + 14] }; });
    },
    init() {
      const A = G.archery; if (A) A.targets.push(...this.lanes());
      D().registerEvent('archeryContest', { weight: () => 0, run: () => this.start() });
    },
    start() {
      const d = D(); d.lastTourneyDay = G.env.day;
      const [cx, cz] = LAYOUT.training;
      const pool = G.sims.filter((s) => !s.dead && !s.hidden && !s.household && !s.controlled && s.age !== 'child' && s.faction === 'village' && !['king', 'queen', 'general'].includes(s.job) && !s.missionLock && !s.combat.target);
      const npcs = pool.sort((a, b) => (b.skills.archery + (b.job === 'hunter' ? 3 : 0) + Math.random() * 2) - (a.skills.archery + (a.job === 'hunter' ? 3 : 0) + Math.random() * 2)).slice(0, 5);
      const hh = G.household.filter((h) => !h.dead && h.age !== 'child' && (h.controlled || Math.hypot(h.pos.x - cx, h.pos.z - cz) < 45 || h.skills.archery >= 4));
      const field = [...hh, ...npcs];
      if (field.length < 3) return;
      const lane = this.lanes()[1];
      st = { field, scores: new Map(field.map((s) => [s, []])), i: 0, shot: 0, t: -25, lane, phase: 'gather', playerShots: 0, playerWait: 0 };
      G.log(`An archery contest (활쏘기 대회) at the training ground! ${field.length} archers will loose ${SHOTS} arrows each at the target. A purse of 60 nyang for the finest eye in Haeryeong.`, 'tournament', { x: cx, z: cz });
      if (G.household.some((h) => field.includes(h))) G.ui?.toast(`🏹 Archery contest! ${field.filter((s) => s.household).map((s) => s.name.given).join(', ')} will compete. Take control (V) to shoot yourself.`, 'festival');
      else G.ui?.toast('🏹 An archery contest begins at the training ground. Bring an archer to enter!', 'festival');
      G.audio?.drum();
      const waitSpot = (k) => [lane.line[0] - 3 - (k % 3) * 1.4, lane.line[1] + 2.5 + Math.floor(k / 3) * 1.4];
      field.forEach((s, k) => { if (!s.controlled) { s.cancelAction(); s.missionLock = true; s.startAction({ type: 'event', dest: waitSpot(k), run: true, anim: 'idle', dur: 999, look: [lane.x, lane.z], label: 'Waiting to shoot' }); } });
      d.start({
        kind: 'archery', title: 'Archery Contest', ko: '활쏘기 대회', pos: [cx + 17, cz + 2], max: 400,
        assign: (s) => {
          if (s.faction !== 'village' || field.includes(s) || Math.random() < 0.5) return false;
          const a = Math.random() * Math.PI - Math.PI, r = 6 + Math.random() * 4;
          s.startAction({ type: 'event', dest: [lane.line[0] + Math.cos(a) * r - 4, lane.line[1] + 4 + Math.abs(Math.sin(a)) * 3], anim: () => (Math.random() < 0.004 ? 'cheer' : 'idle'), dur: 80 + Math.random() * 60, look: [lane.x, lane.z], adv: { fun: 1.1, social: 0.4 }, label: 'Watching the archery' });
          return true;
        },
        update: (gm) => this.tick(gm),
        end: () => this.finish(),
      });
    },
    tick(gm) {
      if (!st) return;
      st.t += gm;
      if (st.t < 0) return;
      const s = st.field[st.i];
      if (!s) { D().active && (D().active.done = true); return; }
      if (s.dead) { st.i++; st.shot = 0; return; }
      const L = st.lane;
      if (st.phase === 'gather') {
        st.phase = 'walk'; st.t = 0;
        if (s.controlled) {
          s.pos.set(L.line[0], groundAt(L.line[0], L.line[1]), L.line[1]); s.heading = Math.PI;
          G.player.camYaw = 0; G.player.camPitch = 0.08;
          if (G.archery && !G.archery.on) G.archery.toggle(true);
          G.ui?.toast(`🎯 Your turn, ${s.name.given}! ${SHOTS} arrows at the middle target. Hold and release the left mouse button.`, 'festival');
          st.playerShots = 0; st.playerWait = 0;
        } else { s.cancelAction(); if (s.pos.distanceTo(new THREE.Vector3(L.line[0], s.pos.y, L.line[1])) > 25) { s.pos.set(L.line[0] - 2, groundAt(L.line[0] - 2, L.line[1] + 2), L.line[1] + 2); } s.startAction({ type: 'goto', dest: L.line, label: 'Stepping up to the line' }); }
        G.log(`${s.name.full} steps up to the line.`, 'tournament');
        return;
      }
      if (st.phase === 'walk') {
        if (s.controlled) { st.phase = 'shoot'; st.t = 0; return; }
        if (s.pos.distanceTo(new THREE.Vector3(L.line[0], s.pos.y, L.line[1])) < 1.2 || st.t > 12) {
          s.cancelAction(); s.pos.x = L.line[0]; s.pos.z = L.line[1];
          s.action = { type: 'event', phase: 'do', anim: 'archery', dur: 999, t: 0, look: [L.x, L.z], label: 'Drawing the bow' };
          s.char.setProp('bow'); st.phase = 'shoot'; st.t = 0;
        }
        return;
      }
      if (st.phase === 'shoot') {
        if (s.controlled) {
          // the player's own arrows are scored by arrowTarget events; misses count when an arrow is loosed but nothing lands
          if (st.playerShots >= SHOTS) { st.playerWait += gm; if (st.playerWait > 3) this.nextArcher(); }
          else if (st.t > 120) { while (st.scores.get(s).length < SHOTS) st.scores.get(s).push(0); this.nextArcher(); G.ui?.toast('Too slow — the judges call time!'); }
          return;
        }
        if (st.t < 2.4) return;
        st.t = 0;
        const sk = s.skills.archery || 0; const spread = Math.max(0.06, 0.62 - sk * 0.055);
        const off = Math.abs(gauss() * spread), ang = Math.random() * Math.PI * 2;
        const to = new THREE.Vector3(L.x + Math.cos(ang) * off, L.y + Math.sin(ang) * off, L.z + 0.06);
        if (off >= 0.75) { to.y = groundAt(to.x, L.z - 3) + 0.05; to.z = L.z - 3 - Math.random() * 4; }
        const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.45, s.pos.z - 0.4);
        G.archery?.fireVisual(from, to, 0.75);
        const sc = ring(off); st.scores.get(s).push(sc);
        setTimeout(() => s.say(sc === 10 ? '관중! Bullseye!' : sc === 0 ? 'Missed!' : `${sc}`, sc >= 9 ? 'happy' : sc === 0 ? 'sad' : 'talk', 1.6), 750);
        s.skills.archery = Math.min(10, sk + 0.02);
        if (st.scores.get(s).length >= SHOTS) { st.t = -2; this.nextArcher(); }
      }
    },
    nextArcher() {
      const s = st.field[st.i]; const tot = st.scores.get(s).reduce((a, b) => a + b, 0);
      G.log(`${s.name.full} scores ${tot} of ${SHOTS * 10}${st.scores.get(s).filter((x) => x === 10).length >= 2 ? ' — a hail of bullseyes!' : '.'}`, 'tournament', s.pos);
      if (!s.controlled) { s.char.setProp(null); s.cancelAction(); s.startAction({ type: 'event', dest: [st.lane.line[0] + 4 + Math.random() * 2, st.lane.line[1] + 3], anim: 'idle', dur: 999, look: [st.lane.x, st.lane.z], label: 'Waiting for the results' }); }
      st.i++; st.phase = 'gather'; st.t = -3; st.shot = 0;
    },
    finish() {
      if (!st) return; const s0 = st; st = null;
      const ranked = [...s0.scores.entries()].map(([s, a]) => [s, a.reduce((x, y) => x + y, 0), a.filter((x) => x === 10).length, Math.random()]).filter(([s]) => !s.dead).sort((a, b) => b[1] - a[1] || b[2] - a[2] || b[3] - a[3]);
      for (const s of s0.field) { if (!s.controlled) { s.missionLock = false; s.cancelAction(); s.char.setProp(null); } }
      if (!ranked.length) return;
      const [w, top] = ranked[0];
      w.earn?.(60); w.needs.honor = 100; w.archerChampion = true; w.addMoodlet('archerChamp', 'Champion archer', 25, 1440);
      G.systems.find((x) => x.id === 'missions')?.addFame?.(w, 'blade', 8);
      G.log(`🏹 ${w.name.full} wins the archery contest with ${top} points${ranked[1] ? (ranked[1][1] === top ? ` — tied with ${ranked[1][0].name.given}, but ${ranked[0][2] > ranked[1][2] ? 'with more bullseyes' : 'winning the shoot-off'}` : ` (${ranked[1][0].name.given} close behind with ${ranked[1][1]})`) : ''}! They say not since the founding king has the valley seen such an eye.`, 'tournament', w.pos);
      G.ui?.toast(`🏆 ${w.name.given} wins the archery contest! ${ranked.slice(0, 3).map(([s, t], i) => `${i + 1}. ${s.name.given} ${t}`).join(' · ')}`, 'festival');
      if (w.household) for (const h of G.household) h.addMoodlet('proud', `Proud of ${w.name.given}`, 10, 720);
      G.audio?.festival?.(true); setTimeout(() => G.audio?.festival?.(false), 3000);
    },
    onEvent(name, p) {
      if (!st) return;
      const s = st.field[st.i];
      if (!s?.controlled || st.phase !== 'shoot') return;
      if (name === 'arrowLoosed' && p.sim === s) {
        st.playerShots++; const n = st.playerShots;
        setTimeout(() => { if (st && st.scores.get(s).length < n) { st.scores.get(s).push(0); G.ui?.floatText?.(s, 'Miss', '#ccc'); } }, 2200);
      }
      if (name === 'arrowTarget' && p.sim === s && Math.abs(p.target.x - st.lane.x) < 0.01 && Math.abs(p.target.z - st.lane.z) < 0.01 && st.scores.get(s).length < st.playerShots) {
        const sc = ring(p.off); st.scores.get(s).push(sc);
        G.ui?.floatText?.(s, sc === 10 ? '관중! 10' : String(sc), sc >= 9 ? '#ffd76a' : '#fff');
        if (sc === 10) G.hitStop?.(0.05, 0.2);
      }
    },
    status() { if (!st) return null; return [...st.scores.entries()].map(([s, a]) => `${s.name.given} ${a.reduce((x, y) => x + y, 0)}`).join(' · '); },
  };
  return S;
}
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
