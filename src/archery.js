// Archery (궁술): B readies the bow in warrior mode. Hold the left mouse button to draw, release to loose.
// Arrows are real projectiles with gravity: draw longer for range and power, aim high for distance.
// Works from horseback too, in the tradition of the great mounted archers.
import * as THREE from 'three';
import { groundAt } from './terrain.js';

const G_ACC = 9.8;
// the obstacle map has no heights: guess them (walls and houses tall, posts and pots low)
function solidAt(nav, x, h, z) {
  for (const o of nav.near(x, z)) {
    if (o.t === 'c') { if (Math.hypot(x - o.x, z - o.z) < o.r && h < (o.r < 0.8 ? 0.9 : o.r < 2.5 ? 3.5 : 6)) return true; }
    else { const dx = x - o.x, dz = z - o.z; const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw && Math.abs(lz) < o.hd && h < 5.5) return true; }
  }
  return false;
}

export function createArcherySystem(G) {
  const arrows = [];
  let geo = null, mat = null, fletch = null;
  const tmp = new THREE.Vector3(), ray = new THREE.Vector3(), camP = new THREE.Vector3();
  function arrowMesh() {
    if (!geo) {
      geo = new THREE.CylinderGeometry(0.008, 0.008, 0.82, 5).rotateX(Math.PI / 2);
      mat = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 0.7 });
      fletch = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.9, side: THREE.DoubleSide });
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, mat));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8a8a90', metalness: 0.6, roughness: 0.4 })); head.position.z = 0.43; g.add(head);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.1), fletch); f.position.z = -0.36; f.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI * 2); f.rotateX(Math.PI / 2); g.add(f); }
    return g;
  }

  const S = {
    id: 'archery', on: false, drawing: false, drawK: 0, cool: 0, arrows, targets: [],
    init() {
      G.archery = this;
      const ch = document.createElement('div'); ch.id = 'crosshair'; ch.className = 'hidden'; ch.innerHTML = '<i></i>'; document.body.appendChild(ch); this.ch = ch;
      addEventListener('keydown', (e) => {
        if (e.code !== 'KeyB' || e.repeat || G.player.mode !== 'warrior' || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        this.toggle();
      });
    },
    hero() { const s = G.selected; return s && !s.dead && G.player.mode === 'warrior' ? s : null; },
    toggle(force) {
      const s = this.hero(); if (!s) return;
      this.on = force ?? !this.on;
      if (this.on) { if (s.char.swordDrawn) s.char.sheathe(); s.char.setProp('bow'); s.combat.blocking = false; G.ui?.toast(`🏹 Bow ready — hold left mouse to draw, release to loose. B to put it away. (Archery ${s.skills.archery.toFixed(1)})`); }
      else { s.char.setProp(null); this.drawing = false; this.drawK = 0; }
      this.ch.classList.toggle('hidden', !this.on);
    },
    mouseDown(e) {
      if (!this.on || !this.hero()) return false;
      if (e.button === 0) { if (this.cool <= 0 && this.hero().stamina > 8) { this.drawing = true; this.drawK = 0; G.audio?.tell?.(this.hero().pos, false); } return true; }
      if (e.button === 2) { this.drawing = false; this.drawK = 0; return true; } // right click cancels the draw
      return true;
    },
    mouseUp(e) {
      if (!this.on || !this.hero()) return false;
      if (e.button === 0 && this.drawing) this.loose();
      return true;
    },
    // where the crosshair points: march along the camera ray until it meets the ground or a body
    aimPoint() {
      const cam = G.player.camera; cam.getWorldDirection(ray); camP.copy(cam.position);
      const me = this.hero();
      let best = null, bd = 140;
      for (const o of G.sims) {
        if (o === me || o.dead || o.hidden) continue;
        tmp.set(o.pos.x, o.pos.y + 1.2, o.pos.z).sub(camP); const along = tmp.dot(ray); if (along < 2 || along > bd) continue;
        const perp = tmp.addScaledVector(ray, -along).length(); if (perp < 0.55) { bd = along; best = o; }
      }
      for (const T of this.targets) { const nx = T.nx ?? 0, nz = T.nz ?? 1; const den = ray.x * nx + ray.z * nz; if (Math.abs(den) < 1e-4) continue; const d = ((T.x - camP.x) * nx + (T.z - camP.z) * nz + 0.08) / den; if (d > 2 && d < bd && Math.hypot(camP.x + ray.x * d - T.x, camP.y + ray.y * d - T.y, camP.z + ray.z * d - T.z) < T.r + 0.3) { bd = d; best = null; } }
      for (let d = 2; d < bd; d += 1.5) { const x = camP.x + ray.x * d, y = camP.y + ray.y * d, z = camP.z + ray.z * d; if (y < groundAt(x, z)) { bd = d; best = null; break; } }
      return new THREE.Vector3().copy(camP).addScaledVector(ray, Math.min(bd, 140));
    },
    loose() {
      const s = this.hero(); this.drawing = false;
      const k = this.drawK; this.drawK = 0; this.cool = 0.35;
      if (k < 0.15) return; // barely drawn: the arrow just drops
      const sk = s.skills.archery || 0;
      const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.45, s.pos.z);
      from.x += Math.sin(s.heading) * 0.5; from.z += Math.cos(s.heading) * 0.5;
      const to = this.aimPoint();
      const speed = 28 + k * 34;
      const dist = from.distanceTo(to); const tFlight = dist / speed;
      const dir = to.clone().sub(from); dir.y += 0.5 * G_ACC * tFlight * tFlight; dir.normalize();
      // a wobble that shrinks with skill and a full draw
      const wob = (0.05 - sk * 0.004) * (1.2 - k);
      dir.x += (Math.random() - 0.5) * wob; dir.y += (Math.random() - 0.5) * wob; dir.z += (Math.random() - 0.5) * wob; dir.normalize();
      const m = arrowMesh(); m.position.copy(from); G.scene.add(m);
      arrows.push({ m, pos: from, vel: dir.multiplyScalar(speed), owner: s, k, t: 0, stuck: false, life: 0 });
      G.emit('arrowLoosed', { sim: s, k });
      s.stamina = Math.max(0, s.stamina - 6);
      G.audio?.swing?.(s.pos, false);
      s.char.setAnim('aim', 30);
    },
    // an arrow that flies on a fixed arc from → to and sticks there (contest shots, NPC archers)
    fireVisual(from, to, flight = 0.9) {
      const m = arrowMesh(); m.position.copy(from); G.scene.add(m);
      const vel = to.clone().sub(from).divideScalar(flight); vel.y += 0.5 * G_ACC * flight;
      arrows.push({ m, pos: from.clone(), vel, owner: null, visual: true, to: to.clone(), flight, k: 1, t: 0, stuck: false, life: 0 });
    },
    hit(a, v, head) {
      const s = a.owner; const sk = s.skills.archery || 0;
      let dmg = (16 + a.k * 30) * (0.85 + sk * 0.06) * (head ? 2 : 1);
      if (v.combat.blocking && Math.abs(Math.atan2(Math.sin(Math.atan2(s.pos.x - v.pos.x, s.pos.z - v.pos.z) - v.heading), Math.cos(Math.atan2(s.pos.x - v.pos.x, s.pos.z - v.pos.z) - v.heading))) < 1.2) {
        G.fx?.sparks(a.pos.clone(), 8, 0.6); G.audio?.clash?.(a.pos, false); return;
      }
      if (v.missionHero) dmg *= 0.42; if (s.missionHero) dmg *= 1.6;
      v.hp -= dmg; v.combat.hitT = 0.3;
      G.fx?.blood(a.pos.clone(), head ? 18 : 10, Math.atan2(a.vel.x, a.vel.z)); G.audio?.hit(a.pos, head);
      G.ui?.floatText?.(v, (head ? 'Headshot! ' : '') + Math.round(dmg), head ? '#ffd76a' : '#ffd0c0');
      G.hitStop?.(head ? 0.08 : 0.04, head ? 0.3 : 0.12);
      s.skills.archery = Math.min(10, sk + 0.05);
      // shooting an innocent is a crime, and they will not take it quietly
      const lawful = s.isHostile(v) || v.combat.target === s || v.outlaw;
      if (!lawful) { G.economy?.commitCrime?.(s, 30, 'shooting an innocent'); if (!s.outlaw) { s.outlaw = true; G.log(`${s.name.full} put an arrow in ${v.name.full}! The guards are coming.`, 'danger', s.pos); } }
      if (v.hp <= 0) v.die(s);
      else if (!v.controlled) { if (v.fighter) { if (!v.combat.target) v.startFight(s); } else { v.cancelAction(); v.startAction({ type: 'flee', dest: v.home?.door || [0, 0], label: 'Fleeing arrows!' }); } if (Math.random() < 0.5) v.say(['Argh! An arrow!', 'Archer! Take cover!', 'Aigo!'][Math.floor(Math.random() * 3)], 'shout', 1.5); }
      G.systems.find((x) => x.id === 'missions')?.addFame?.(s, 'blade', head ? 2 : 1);
    },
    update(dt) {
      const s = this.hero();
      if (this.on && !s) { this.on = false; this.drawing = false; this.ch.classList.add('hidden'); this.lastHero?.char.setProp(null); }
      if (s) this.lastHero = s;
      this.cool -= dt;
      if (this.on && s) {
        if (this.drawing) {
          this.drawK = Math.min(1, this.drawK + dt / (0.85 - (s.skills.archery || 0) * 0.03));
          s.stamina = Math.max(0, s.stamina - dt * (this.drawK >= 1 ? 6 : 1));
          if (s.stamina <= 0) this.loose();
        }
        const aiming = this.drawing || !s.moving;
        G.player.aimZoom = THREE.MathUtils.damp(G.player.aimZoom || 0, this.drawing ? 1 : 0.35, 8, dt);
        if (aiming) { if (!s.mount) s.heading = G.player.camYaw + Math.PI; s.char.drawK = this.drawK; s.char.setAnim('aim', 18); }
        this.ch.style.setProperty('--k', this.drawK.toFixed(2));
        this.ch.classList.toggle('drawing', this.drawing);
        if (s.char.propName !== 'bow') s.char.setProp('bow');
        if (s.char.swordDrawn) { this.toggle(false); }
        G.fovKick = Math.max(G.fovKick || 0, this.drawK * 7);
      } else if (G.player.aimZoom) G.player.aimZoom = THREE.MathUtils.damp(G.player.aimZoom, 0, 8, dt);
      // fly arrows
      for (const a of arrows) {
        a.life += dt;
        if (a.stuck) continue;
        if (a.visual) {
          const prevV = a.vel.clone(); a.vel.y -= G_ACC * dt; a.pos.addScaledVector(a.vel, dt);
          if (a.life >= a.flight) { a.pos.copy(a.to); a.vel.copy(prevV); a.stuck = true; G.audio?.hit?.(a.pos, false); }
          a.m.position.copy(a.pos); tmp.copy(a.pos).add(a.vel); a.m.lookAt(tmp); continue;
        }
        const steps = 3, h = dt / steps;
        for (let i = 0; i < steps && !a.stuck; i++) {
          const prev = a.pos.clone();
          a.vel.y -= G_ACC * h; a.pos.addScaledVector(a.vel, h);
          let nearT = false;
          for (const T of this.targets) {
            if (Math.hypot(a.pos.x - T.x, a.pos.z - T.z) < 1.2) nearT = true;
            const nx = T.nx ?? 0, nz = T.nz ?? 1; // the way the target face looks
            const s0 = (prev.x - T.x) * nx + (prev.z - T.z) * nz - 0.08, s1 = (a.pos.x - T.x) * nx + (a.pos.z - T.z) * nz - 0.08;
            if (s0 * s1 > 0) continue; // did not cross the target face this step
            const u = s0 / (s0 - s1 || 1e-6); const cx = prev.x + (a.pos.x - prev.x) * u, cy = prev.y + (a.pos.y - prev.y) * u, cz = prev.z + (a.pos.z - prev.z) * u;
            const off = Math.hypot(cx - T.x, cy - T.y, cz - T.z);
            if (off < T.r) {
              a.stuck = true; a.pos.set(cx + nx * 0.02, cy, cz + nz * 0.02); G.audio?.hit?.(a.pos, false);
              G.emit('arrowTarget', { sim: a.owner, target: T, off });
              break;
            }
          }
          if (a.stuck) break;
          // bodies
          for (const v of G.sims) {
            if (v === a.owner || v.dead || v.hidden) continue;
            const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z; if (dx * dx + dz * dz > 0.3) continue;
            const yy = a.pos.y - v.pos.y; if (yy < 0.2 || yy > (v.age === 'child' ? 1.2 : 1.85)) continue;
            this.hit(a, v, yy > (v.age === 'child' ? 1.0 : 1.55)); a.stuck = true; a.m.visible = false; break;
          }
          if (a.stuck) break;
          for (const an of G.animals?.list || []) {
            if (an.dead || an === a.owner?.mount || (an.owner && an.owner === a.owner && a.life < 0.4)) continue; const dx = a.pos.x - an.pos.x, dz = a.pos.z - an.pos.z; const r = an.def?.size || 0.6;
            if (dx * dx + dz * dz < r * r && a.pos.y - an.pos.y < r * 2 + 0.3 && a.pos.y > an.pos.y) { G.animals.hit(a.owner, an, a.k > 0.7); a.owner.skills.archery = Math.min(10, a.owner.skills.archery + 0.04); a.stuck = true; a.m.visible = false; break; }
          }
          if (a.stuck) break;
          const gy = groundAt(a.pos.x, a.pos.z);
          if (a.pos.y <= gy + 0.02 || (!nearT && solidAt(G.nav, a.pos.x, a.pos.y - gy, a.pos.z))) { a.stuck = true; a.pos.copy(prev); }
        }
        a.m.position.copy(a.pos);
        tmp.copy(a.pos).add(a.vel); a.m.lookAt(tmp);
        if (a.life > 6 && !a.stuck) a.stuck = true;
      }
      for (let i = arrows.length - 1; i >= 0; i--) { const a = arrows[i]; if (a.stuck && (a.life > 25 || !a.m.visible)) { G.scene.remove(a.m); arrows.splice(i, 1); } }
      if (arrows.length > 40) { const a = arrows.shift(); G.scene.remove(a.m); }
    },
  };
  return S;
}
