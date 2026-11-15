// Mounted archery (마상궁술): gallop a course past six straw targets and loose as you pass.
// Start from the stable on your own horse; each target scores its best arrow (rings 1–10).
import * as THREE from 'three';
import { groundAt, heightAt, roadDist } from './terrain.js';

const N = 6, GAP = 17, SIDE = 8, LIMIT = 75;
export function createHorseCourseSystem(G) {
  let run = null, hud = null, course = null;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ring = (off) => (off >= 0.75 ? 0 : Math.max(1, Math.min(10, Math.round(10 - off / 0.075))));
  function findCourse() {
    if (course) return course;
    const [sx, sz] = G.world.spots.stable || [40, 105];
    let best = null, bs = -1e9;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
      const dx = Math.sin(a), dz = Math.cos(a);
      for (const off of [10, 20, 35]) {
        const x0 = sx + dx * off, z0 = sz + dz * off; let ok = true, rough = 0;
        for (let i = 0; i <= N + 1 && ok; i++) {
          const x = x0 + dx * i * GAP, z = z0 + dz * i * GAP, tx = x - dz * SIDE, tz = z + dx * SIDE;
          if (Math.abs(x) > 460 || Math.abs(z) > 460 || G.nav.blocked(x, z, 2.5) || G.nav.blocked(tx, tz, 1.5) || heightAt(x, z) < 0.3) ok = false;
          rough += Math.abs(heightAt(x, z) - heightAt(x0, z0));
        }
        if (ok && -rough > bs) { bs = -rough; best = { x0, z0, dx, dz }; }
      }
    }
    course = best; return course;
  }
  function build(c) {
    const g = new THREE.Group(); const posts = [];
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2a' }), straw = new THREE.MeshStandardMaterial({ color: '#e8dcc0' }), red = new THREE.MeshStandardMaterial({ color: '#a3262a' }), gold = new THREE.MeshStandardMaterial({ color: '#e0b030' });
    const targets = [];
    for (let i = 1; i <= N; i++) {
      const x = c.x0 + c.dx * i * GAP - c.dz * SIDE, z = c.z0 + c.dz * i * GAP + c.dx * SIDE, y = groundAt(x, z);
      const t = new THREE.Group(); t.position.set(x, y, z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), wood); post.position.y = 0.8; t.add(post);
      for (const [r, m, dz] of [[0.75, straw, 0], [0.45, red, 0.01], [0.18, gold, 0.02]]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 18).rotateX(Math.PI / 2), m); d.position.set(0, 1.6, dz); t.add(d); }
      // face the riding line
      t.rotation.y = Math.atan2(c.dz, -c.dx);
      t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(t); posts.push(t);
      // face normal points from the target toward the line
      targets.push({ x, y: y + 1.6, z, r: 0.75, nx: c.dz, nz: -c.dx, course: true, i, best: 0 });
    }
    // start and finish flags
    for (const k of [0, N + 1]) { const x = c.x0 + c.dx * k * GAP, z = c.z0 + c.dz * k * GAP; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), wood); p.position.set(x + c.dz * 3, groundAt(x, z) + 1.5, z - c.dx * 3); g.add(p); const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ color: k ? '#2d6b4c' : '#a3262a', side: THREE.DoubleSide })); fl.position.set(p.position.x + 0.45, p.position.y + 1.1, p.position.z); g.add(fl); }
    G.scene.add(g);
    return { g, targets };
  }
  function start(me) {
    const h = me.horse; if (!h || h.dead) return G.ui.toast('You need your own horse. Buy one here at the stable.');
    const c = findCourse(); if (!c) return G.ui.toast('No open ground for a course near the stable.');
    if (run) end(false);
    const { g, targets } = build(c);
    const A = G.archery; A.targets.push(...targets);
    if (me.mount) G.animals.dismount(me);
    const sx = c.x0 - c.dx * 10, sz = c.z0 - c.dz * 10;
    h.pos.set(sx, groundAt(sx, sz), sz); me.pos.set(sx, h.pos.y, sz);
    G.select(me); if (G.player.mode !== 'warrior') G.player.toggleMode('warrior');
    G.animals.mount(me, h);
    me.heading = Math.atan2(c.dx, c.dz); h.heading = me.heading;
    G.player.camYaw = me.heading + Math.PI - 0.5; G.player.camPitch = 0.12;
    if (!A.on) A.toggle(true);
    run = { me, c, g, targets, t: 0, started: false, done: false };
    hud.classList.remove('hidden');
    G.ui.toast('🐎 Gallop (W + Shift) past the six targets on your left and loose as you pass. The clock starts at the red flag.', 'festival');
  }
  function along(p) { const c = run.c; return (p.x - c.x0) * c.dx + (p.z - c.z0) * c.dz; }
  function end(finished) {
    const r = run; run = null; hud.classList.add('hidden');
    const A = G.archery; A.targets = A.targets.filter((t) => !t.course);
    setTimeout(() => G.scene.remove(r.g), 15000);
    if (!finished) return;
    const me = r.me; const total = r.targets.reduce((a, t) => a + t.best, 0); const hits = r.targets.filter((t) => t.best > 0).length;
    const bonus = Math.max(0, Math.round((LIMIT - r.t) / 3));
    const score = total + (hits ? bonus : 0);
    const prize = Math.round(score * 0.8);
    me.earn(prize); me.skills.archery = Math.min(10, me.skills.archery + 0.1 + hits * 0.05);
    G.systems.find((x) => x.id === 'missions')?.addFame?.(me, 'hunt', Math.round(score / 10));
    const bestKey = 'courseBest'; const prev = me[bestKey] || 0; if (score > prev) me[bestKey] = score;
    if (score >= 50 && !me.mountedArcher) { me.mountedArcher = true; G.log(`🐎🏹 ${me.name.full} rides the mounted archery course and strikes ${hits} of 6 at full gallop. Old cavalrymen call them a true horse-archer (명궁 기마).`, 'tournament', me.pos); }
    G.ui.toast(`🏁 Course done in ${r.t.toFixed(1)}s · ${hits}/6 targets · ${total} points + ${hits ? bonus : 0} speed = ${score}${score > prev ? ' (new best!)' : ''} · +${prize} nyang`, 'festival');
  }
  const S = {
    id: 'horseCourse',
    get active() { return !!run; },
    init() { hud = document.createElement('div'); hud.id = 'coursehud'; hud.className = 'hidden'; document.body.appendChild(hud); },
    start, end,
    update(dt) {
      if (!run) return;
      const r = run, me = r.me;
      if (me.dead || G.player.mode !== 'warrior' || G.selected !== me) return end(false);
      const d = along(me.pos);
      if (!r.started && d > -1) { r.started = true; G.audio?.drum?.(); }
      if (r.started) r.t += dt;
      if (r.started && d > (N + 1) * GAP) return end(true);
      if (r.t > LIMIT) { G.ui.toast('⏱ Time! The judges lower their flags.'); return end(true); }
      hud.innerHTML = `<b>마상궁술</b> ${r.started ? `${r.t.toFixed(1)}s` : 'ride to the red flag'} · ${r.targets.map((t) => `<span class="${t.best ? 'hit' : ''}">${t.best || '·'}</span>`).join('')}`;
    },
    onEvent(name, p) {
      if (!run || name !== 'arrowTarget' || p.sim !== run.me || !p.target.course) return;
      const sc = ring(p.off); if (sc > p.target.best) p.target.best = sc;
      G.ui?.floatText?.(run.me, sc === 10 ? '관중! 10' : String(sc), sc >= 9 ? '#ffd76a' : '#fff');
    },
    objMenuItems(me, o) {
      if (o.kind !== 'stableHall' || !me.household) return [];
      return [{ label: `🏹 Ride the mounted archery course${me.courseBest ? ` (best ${me.courseBest})` : ''}`, disabled: !me.horse || me.horse.dead, fn: () => start(me) }];
    },
  };
  return S;
}
