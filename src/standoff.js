// Standoff (一騎打ち): face a group of foes, hold F, release exactly when the real strike comes.
import * as THREE from 'three';

export function createStandoffSystem(G) {
  const S = {
    id: 'standoff', st: null, holding: false, promptT: 0,
    init() {
      const el = document.createElement('div'); el.id = 'standoff-ui'; el.className = 'hidden'; document.body.appendChild(el); this.el = el;
      addEventListener('keydown', (e) => {
        if (e.code !== 'KeyF' || e.repeat || G.player.mode !== 'warrior' || ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        this.holding = true;
        if (!this.st) this.tryStart();
      });
      addEventListener('keyup', (e) => { if (e.code === 'KeyF') { this.holding = false; if (this.st) this.release(); } });
    },
    hero() { const s = G.selected; return s && s.controlled && !s.dead ? s : null; },
    foesNear(h) { return G.sims.filter((o) => !o.dead && !o.hidden && o !== h && o.isHostile(h) && o.pos.distanceTo(h.pos) < 26 && o.fighter); },
    canStart(h) { if (!h || h.combat.target || h.mount) return false; const f = this.foesNear(h); return f.length >= 1 && !f.some((o) => o.combat.target === h && o.pos.distanceTo(h.pos) < 4); },
    tryStart() {
      const h = this.hero(); if (!this.canStart(h)) return;
      const foes = this.foesNear(h).sort((a, b) => a.pos.distanceTo(h.pos) - b.pos.distanceTo(h.pos));
      this.st = { h, foes, kills: 0, chain: 0, frozen: new Map() };
      for (const f of foes) { this.st.frozen.set(f, f.missionLock); f.missionLock = true; f.endFight?.(); f.cancelAction(); f.combat.target = null; }
      h.endFight?.(); if (!h.char.swordDrawn) h.char.draw();
      G.ui.toast('一騎打ち · Standoff', 'duel');
      G.audio?.drum();
      this.nextFoe();
    },
    nextFoe() {
      const st = this.st; const h = st.h;
      const foe = st.foes.find((f) => !f.dead && !st.done?.has(f));
      if (!foe || st.chain >= 3) return this.end(true);
      (st.done ||= new Set()).add(foe);
      st.foe = foe; st.chain++;
      // place the challenger 5.5m in front of the hero
      const ang = Math.atan2(foe.pos.x - h.pos.x, foe.pos.z - h.pos.z);
      foe.pos.set(h.pos.x + Math.sin(ang) * 5.5, foe.pos.y, h.pos.z + Math.cos(ang) * 5.5);
      h.heading = ang; foe.heading = ang + Math.PI;
      if (foe.char.sword && !foe.char.swordDrawn) foe.char.draw();
      // others stand back in a loose ring
      for (const f of st.foes) if (f !== foe && !f.dead) { f.cancelAction(); f.startAction({ type: 'event', phase: 'do', anim: 'stance', dur: 999, look: [h.pos.x, h.pos.z], label: 'Watching the standoff' }); }
      foe.cancelAction(); st.foeAnim = 'stance'; foe.action = { type: 'event', phase: 'do', anim: () => this.st?.foeAnim || 'stance', dur: 999, t: 0, label: 'Standoff' };
      foe.say(['You dare face me alone?', 'Draw, then.', '…', 'Your last breath, swordsman.', 'Come.'][Math.floor(Math.random() * 5)], 'shout', 2.5);
      // schedule: 1-3 feints, then the true strike
      const feints = Math.min(3, 1 + Math.floor(Math.random() * (1 + st.chain)));
      st.events = []; let t = 1.6 + Math.random() * 1.2;
      for (let i = 0; i < feints; i++) { st.events.push({ t, kind: 'feint' }); t += 0.9 + Math.random() * 1.4; }
      st.events.push({ t: t + Math.random() * 1.2, kind: 'strike' });
      st.t = 0; st.window = null; st.phase = 'wait';
      this.show(`Hold <b>F</b> — release the instant they truly strike`);
    },
    release() {
      const st = this.st; if (!st || st.phase === 'resolve') return;
      if (st.window && st.t >= st.window[0] && st.t <= st.window[1]) this.win(); else this.lose(st.t < (st.window?.[0] ?? 1e9) ? 'Too early — a feint drew your blade!' : 'Too late!');
    },
    win() {
      const st = this.st; const h = st.h; const f = st.foe; st.phase = 'resolve';
      h.char.atkStage = 'strike'; h.char.setAnim('atk1', 30); G.fx?.startTrail(h);
      setTimeout(() => G.fx?.endTrail(h), 250);
      // dash through
      const ang = h.heading; h.pos.x += Math.sin(ang) * 6.5; h.pos.z += Math.cos(ang) * 6.5;
      G.audio?.swing(h.pos, true); G.audio?.hit(f.pos, true);
      G.fx?.blood(f.pos.clone().setY(f.pos.y + 1.2), 26, ang); G.fx?.flash(f.pos.clone().setY(f.pos.y + 1.2));
      G.hitStop?.(0.25, 1.4, true);
      setTimeout(() => { if (!f.dead) f.die(h); }, 450);
      st.kills++;
      const ms = G.systems.find((x) => x.id === 'missions'); ms?.addFame?.(h, 'blade', 8);
      h.addMoodlet('standoff', 'Won a standoff', 15, 600);
      this.show(`<span class="so-win">斬 · ${f.name.given} falls</span>`);
      setTimeout(() => { if (this.st) this.nextFoe(); }, 1900);
    },
    lose(why) {
      const st = this.st; const h = st.h; const f = st.foe; st.phase = 'resolve';
      this.show(`<span class="so-lose">${why}</span>`);
      f.char.atkStage = 'strike'; st.foeAnim = 'heavy';
      setTimeout(() => { if (!h.dead) { h.hp -= h.maxHp * 0.3; h.combat.staggerT = 1.0; G.fx?.blood(h.pos.clone().setY(h.pos.y + 1.2), 14, f.heading); G.audio?.hit(h.pos, true); if (h.hp <= 0) h.die(f); } this.end(false); }, 300);
    },
    end(clean) {
      const st = this.st; if (!st) return; this.st = null;
      this.el.classList.add('hidden');
      const alive = st.foes.filter((f) => !f.dead);
      for (const f of alive) { f.missionLock = st.frozen.get(f) || false; f.cancelAction(); }
      if (clean && st.kills >= 2) {
        // the rest lose their nerve
        for (const f of alive) if (Math.random() < 0.6 && f.faction === 'bandit') { f.say('…Demon! Run!', 'shout'); f.startAction({ type: 'flee', dest: [-300, 250], label: 'Fleeing in terror' }); }
        G.log(`${st.h.name.full} cut down ${st.kills} foes in a single breath. Witnesses will not stop talking about it.`, 'tournament', st.h.pos);
      }
      for (const f of alive) if (f.action?.type !== 'flee') f.startFight(st.h);
    },
    show(html) { this.el.innerHTML = html; this.el.classList.remove('hidden'); },
    update(dt) {
      // prompt when a standoff is possible
      const h = this.hero();
      if (!this.st) {
        this.promptT -= dt;
        if (h && this.promptT <= 0) { this.promptT = 0.5; const ok = this.canStart(h); if (ok) this.show('Press <b>F</b> · Standoff 一騎打ち'); else this.el.classList.add('hidden'); }
        else if (!h) this.el.classList.add('hidden');
        return;
      }
      const st = this.st;
      if (!h || h !== st.h || h.dead) return this.end(false);
      const f = st.foe; if (!f || f.dead && st.phase !== 'resolve') return this.nextFoe();
      // cinematic camera from the side
      // over-the-shoulder: behind the hero, slightly right, looking at the challenger; slow push-in while waiting
      const fw = h.heading, rt = fw - Math.PI / 2, push = st.phase === 'wait' ? Math.min(1, st.t / 6) : 1;
      const back = 3.4 - push * 1.0;
      G.player.camOverride = { pos: new THREE.Vector3(h.pos.x - Math.sin(fw) * back + Math.sin(rt) * 1.1, h.pos.y + 1.75 - push * 0.15, h.pos.z - Math.cos(fw) * back + Math.cos(rt) * 1.1), look: new THREE.Vector3(f.pos.x, f.pos.y + 1.35, f.pos.z) };
      document.body.classList.add('standoff');
      G.standoffActive = true;
      h.moving = false;
      if (st.phase === 'resolve') return;
      h.char.setAnim('stance');
      if (!this.holding && !st.window) { if (!st.waitMsg) { st.waitMsg = true; this.show('Hold <b>F</b> to face them'); } return; }
      if (st.waitMsg) { st.waitMsg = false; this.show('Steady… release the instant they truly strike'); }
      st.t += dt;
      const ev = st.events[0];
      if (ev && st.t >= ev.t) {
        st.events.shift();
        if (ev.kind === 'feint') { f.char.atkStage = 'wind'; st.foeAnim = 'atk0'; G.audio?.swing?.(f.pos, false); setTimeout(() => { if (this.st?.foe === f && this.st.phase !== 'resolve') this.st.foeAnim = 'stance'; }, 260); }
        else { f.char.atkStage = 'wind'; st.foeAnim = 'heavy'; st.window = [st.t + 0.12, st.t + 0.58]; G.fx?.flash(f.pos.clone().setY(f.pos.y + 1.6)); }
      }
      if (st.window && st.t > st.window[1] + 0.05) this.lose('Too late!');
    },
    onEvent() {},
  };
  // clear camera override when standoff ends
  const origEnd = S.end.bind(S);
  S.end = (c) => { origEnd(c); G.player.camOverride = null; G.standoffActive = false; document.body.classList.remove('standoff'); };
  return S;
}
