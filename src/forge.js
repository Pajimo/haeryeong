// The smithy (대장간): buy iron, then forge a blade by hand — pump the bellows to keep the bloom at
// welding heat, strike in rhythm on the anvil, and quench at cherry-red. The better the work, the
// better the blade: equip it to hit harder, or sell it. Steel from the story deck raises the ceiling.
import * as THREE from 'three';
import { KINDS } from './buildings.js';
import { groundAt, roadDist } from './terrain.js';

KINDS.forge = { label: 'Blacksmith’s Forge', ko: '대장간', adv: {}, dur: [1, 1], anim: 'idle', cap: 0, menuOnly: true };
const GRADES = [[0, 'Crude', '막칼', 0.9, 8], [35, 'Common', '보통', 1.0, 20], [60, 'Fine', '좋은 칼', 1.12, 45], [80, 'Master', '명품', 1.25, 95], [93, 'Legendary', '명검', 1.4, 260]];

export function createForgeSystem(G) {
  let el = null, f = null, keys = {}, spot = null, glow = null;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const steel = () => !!G.systems.find((x) => x.id === 'sagas')?.st?.flags?.steel;
  function grade(score) { let g = GRADES[0]; for (const x of GRADES) if (score >= x[0]) g = x; if (g[1] === 'Legendary' && !steel()) g = GRADES[3]; return g; }

  function build() {
    // find a free patch near the market for the smithy
    const [mx, mz] = G.world.spots.market || [0, 78];
    let best = null;
    for (let r = 14; r < 40 && !best; r += 3) for (let a = 0; a < Math.PI * 2; a += 0.35) { const x = mx + Math.cos(a) * r, z = mz + Math.sin(a) * r; if (roadDist(x, z) > 5 && !G.nav.blocked(x, z, 4) && Math.abs(groundAt(x + 3, z) - groundAt(x - 3, z)) < 1) { best = [x, z]; break; } }
    if (!best) best = [mx + 18, mz + 10];
    const [x, z] = best; const y = groundAt(x, z); spot = best;
    const g = new THREE.Group(); g.position.set(x, y, z);
    const stone = new THREE.MeshStandardMaterial({ color: '#7a756c', roughness: 0.95 }), wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.85 }), iron = new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.7, roughness: 0.45 }), thatch = new THREE.MeshStandardMaterial({ color: '#b39a62', roughness: 1 });
    const add = (geo, mat, px, py, pz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(1.8, 1.4, 1.6), stone, -1.4, 0.7, 0); // furnace
    add(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8), stone, -1.6, 2.1, -0.3); // chimney
    glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: '#ff7a2a' })); glow.position.set(-1.4, 0.6, 0.81); g.add(glow);
    add(new THREE.BoxGeometry(0.5, 0.5, 0.35), iron, 0.6, 0.55, 0.2); add(new THREE.BoxGeometry(0.75, 0.12, 0.3), iron, 0.6, 0.86, 0.2); // anvil
    add(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 10), wood, 0.6, 0.25, 0.2); // stump
    add(new THREE.BoxGeometry(1.1, 0.45, 0.5), wood, 1.9, 0.22, -0.4); // quench trough
    add(new THREE.BoxGeometry(0.9, 0.5, 0.6), wood, -2.6, 0.35, 0.5, 0.4); // bellows
    for (const [px, pz] of [[-2.6, -1.4], [2.4, -1.4], [-2.6, 1.6], [2.4, 1.6]]) add(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 6), wood, px, 1.4, pz);
    const roof = add(new THREE.CylinderGeometry(0.15, 3.4, 1.3, 4, 1), thatch, -0.1, 3.4, 0.1); roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 0.85);
    G.scene.add(g);
    const light = new THREE.PointLight(0xff8a3a, 1.2, 7, 2); light.position.set(-1.4, 1, 1.2); g.add(light);
    G.nav.addCircle(x - 1.4, z, 1.2); G.nav.addCircle(x + 0.6, z + 0.2, 0.4); (G.reserved ||= []).push([x, z, 5]);
    G.addObject('forge', x + 0.6, z + 1.8, { face: Math.PI, title: 'The Smithy · 대장간', look: [x, z] });
    glow.userData.light = light;
  }

  // ---------------- the forging minigame ----------------
  function startForge(me) {
    if (!(me.inv?.iron >= 2)) return G.ui.toast('You need 2 iron bars. Buy them here at the smithy.');
    me.inv.iron -= 2;
    me.cancelAction(); me.missionLock = true; me.pos.set(spot[0] + 0.6, me.pos.y, spot[1] + 1.1); me.heading = Math.PI;
    me.action = { type: 'event', phase: 'do', anim: 'farm', dur: 99999, t: 0, label: 'Forging a blade' };
    const sk = me.skills.smithing || 0;
    f = { me, sk, phase: 'heat', t: 0, temp: 0.2, inBand: 0, burnt: 0, strikes: [], ring: 1, nextRing: 0, quench: 0, score: 0, msg: 'Pump the bellows (hold Space) — keep the iron in the white-hot band' };
    el.classList.remove('hidden'); document.exitPointerLock?.();
  }
  function tick(dt) {
    const c = f; c.t += dt;
    const band = [0.68, 0.84 + c.sk * 0.006];
    if (c.phase === 'heat') {
      c.temp += (keys.space ? 0.42 : -0.18) * dt; c.temp = Math.max(0, Math.min(1, c.temp));
      if (c.temp >= band[0] && c.temp <= band[1]) c.inBand += dt; else if (c.temp > band[1]) c.burnt += dt;
      if (c.t > 20 && c.inBand < 3) { c.burnt += 2; c.inBand = 3; c.msg = 'The smith beside you sighs and takes over the bellows…'; }
      if (c.inBand >= 3) { c.phase = 'hammer'; c.t = 0; c.ring = 1.6; c.msg = 'Strike (Space) the instant the ring closes on the glowing spot'; }
    } else if (c.phase === 'hammer') {
      c.temp = Math.max(0.3, c.temp - dt * 0.03);
      c.ring -= dt * (1.1 + c.strikes.length * 0.06);
      if (c.ring < -0.35) { c.strikes.push(0); c.ring = 1.4; G.audio?.drumHit?.('kung', 0.2); }
      if (c.strikes.length >= 8) { c.phase = 'quench'; c.t = 0; c.msg = 'Watch the colour… quench (Space) at cherry-red'; }
    } else if (c.phase === 'quench') {
      c.quench = (Math.sin(c.t * (1.6 + c.t * 0.12)) + 1) / 2; // colour wavers as the blade cools and is turned in the fire
      if (c.t > 14) quench();
    }
    render();
  }
  function strike() {
    const c = f; if (c.phase !== 'hammer') return;
    const off = Math.abs(c.ring); const tol = 0.12 + c.sk * 0.01;
    const q = off < tol * 0.5 ? 1 : off < tol ? 0.75 : off < tol * 2 ? 0.4 : 0.1;
    c.strikes.push(q * (c.temp > 0.5 ? 1 : 0.7)); c.ring = 1.35;
    G.audio?.clash?.(c.me.pos, q >= 0.75); G.fx?.sparks?.(new THREE.Vector3(spot[0] + 0.6, groundAt(spot[0], spot[1]) + 0.95, spot[1] + 0.2), q >= 0.75 ? 16 : 6, 0.5);
    c.me.char.animT += 0.4;
    c.msg = q >= 1 ? '쾅! Perfect strike' : q >= 0.75 ? 'Good strike' : q >= 0.4 ? 'Off the mark' : 'A glancing blow';
    if (c.strikes.length >= 8) { c.phase = 'quench'; c.t = 0; c.msg = 'Watch the colour… quench (Space) at cherry-red'; }
  }
  function quench() {
    const c = f; if (c.phase !== 'quench') return;
    const qd = Math.abs(c.quench - 0.55); const qs = qd < 0.08 ? 1 : qd < 0.16 ? 0.7 : qd < 0.28 ? 0.4 : 0.15;
    const hs = c.strikes.reduce((a, b) => a + b, 0) / 8;
    const heat = Math.max(0, 1 - c.burnt / 4);
    c.score = Math.round(100 * (0.2 * heat + 0.5 * hs + 0.3 * qs) * (0.92 + c.sk * 0.012));
    const g = grade(c.score);
    const me = c.me; me.inv = me.inv || {}; const key = 'blade_' + g[1].toLowerCase(); me.inv[key] = (me.inv[key] || 0) + 1;
    me.skills.smithing = Math.min(10, (me.skills.smithing || 0) + 0.25 + c.score / 400);
    G.audio?.hit?.(me.pos, false);
    c.phase = 'done'; c.grade = g; c.qs = qs;
    if (g[1] === 'Legendary') { G.log(`✨ In the smithy's glow, ${me.name.full} draws a blade that sings when struck — a 명검 that will be spoken of for a hundred years.`, 'tournament', me.pos); G.systems.find((x) => x.id === 'missions')?.addFame?.(me, 'blade', 15); }
    else if (g[1] === 'Master') G.log(`${me.name.full} forges a master-quality blade (명품). The smiths of the valley come to look.`, 'story', me.pos);
    render();
  }
  function close() { if (f) { f.me.missionLock = false; f.me.cancelAction(); } f = null; el.classList.add('hidden'); }
  function render() {
    const c = f; if (!c) return;
    const band = [0.68, 0.84 + c.sk * 0.006];
    const tempColor = `hsl(${Math.max(0, 40 - c.temp * 40)}, 100%, ${30 + c.temp * 55}%)`;
    const qColor = `hsl(${(1 - c.quench) * 8 + c.quench * 40}, 100%, ${28 + c.quench * 40}%)`;
    el.innerHTML = `<div class="mg-head"><b>대장간 · The Forge</b><small>${esc(c.me.name.given)} · smithing ${(c.sk).toFixed(1)}${steel() ? ' · steel secret known' : ''}</small><button class="mg-x">✕</button></div>
      ${c.phase === 'heat' ? `<div class="fg-heat"><div class="band" style="left:${band[0] * 100}%;width:${(band[1] - band[0]) * 100}%"></div><i style="left:${c.temp * 100}%;background:${tempColor}"></i></div><div class="fg-sub">At heat: ${Math.min(3, c.inBand).toFixed(1)} / 3s${c.burnt > 0.3 ? ` · scorched ${c.burnt.toFixed(1)}s` : ''}</div>` : ''}
      ${c.phase === 'hammer' ? `<div class="fg-anvil"><div class="spot"></div><div class="ring" style="transform:translate(-50%,-50%) scale(${Math.max(0.05, Math.abs(c.ring) + 0.2)});opacity:${c.ring < 0 ? 0.4 : 1}"></div></div><div class="fg-sub">Strikes ${c.strikes.length}/8 · ${'●'.repeat(c.strikes.filter((s) => s >= 0.75).length)}</div>` : ''}
      ${c.phase === 'quench' ? `<div class="fg-blade" style="background:linear-gradient(90deg,#333 0 18%,${qColor} 18% 100%)"></div><div class="fg-sub">Quench at the deep cherry-red — not too bright, not too dark</div>` : ''}
      ${c.phase === 'done' ? `<div class="mg-result"><div class="grade">${esc(c.grade[2])}</div><div><b>${esc(c.grade[1])} blade</b> · score ${c.score}<br>${c.grade[3] > 1 ? `Hits ${Math.round((c.grade[3] - 1) * 100)}% harder when equipped.` : c.grade[3] < 1 ? 'Brittle. Better sold for scrap.' : 'A solid, honest blade.'}<br>Worth about ${c.grade[4]} nyang.</div></div>` : ''}
      <div class="mg-msg">${esc(c.msg)}</div>
      ${c.phase === 'done' ? '<button class="ws-btn" data-close>Set it on the rack</button>' : `<button class="mg-act" data-act>${c.phase === 'heat' ? 'Pump the bellows (hold Space)' : c.phase === 'hammer' ? 'Strike! (Space)' : 'Quench! (Space)'}</button>`}`;
    el.querySelector('.mg-x').onclick = close; el.querySelector('[data-close]')?.addEventListener('click', close);
    const a = el.querySelector('[data-act]'); if (a) { a.onpointerdown = () => press(true); a.onpointerup = a.onpointerleave = () => press(false); }
  }
  function press(down) {
    keys.space = down; if (!f || !down) return;
    if (f.phase === 'hammer') strike(); else if (f.phase === 'quench') quench();
  }
  const best = (s) => { for (const g of [...GRADES].reverse()) if (s.inv?.['blade_' + g[1].toLowerCase()] > 0) return g; return null; };

  const S = {
    id: 'forge',
    get active() { return !!f; },
    get _f() { return f; }, _tick: (dt) => f && f.phase !== 'done' && tick(dt), _press: press,
    init() {
      el = document.createElement('div'); el.id = 'forgeui'; el.className = 'hidden'; document.body.appendChild(el);
      addEventListener('keydown', (e) => { if (!f || e.code !== 'Space') return; if (!e.repeat) press(true); e.preventDefault(); e.stopImmediatePropagation(); }, true);
      addEventListener('keyup', (e) => { if (!f || e.code !== 'Space') return; press(false); e.stopImmediatePropagation(); }, true);
      let last = performance.now();
      const loop = (now) => { requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (glow) { const k = 0.7 + Math.sin(now / 180) * 0.15 + (f ? 0.4 : 0); glow.material.color.setHSL(0.06, 1, 0.45 * k); glow.userData.light.intensity = 1.2 * k; } if (f && f.phase !== 'done') { if (f.me.dead) return close(); tick(dt); } };
      requestAnimationFrame(loop);
      const P = G.economy?.prices; if (P) { P.iron ??= 12; for (const g of GRADES) P['blade_' + g[1].toLowerCase()] ??= g[4]; }
      // a better blade hits harder
      const orig = G.applyHit.bind(G);
      G.applyHit = (att, v, heavy) => { const q = att.bladeQ || 1; if (q === 1) return orig(att, v, heavy); const hp0 = v.hp; const r = orig(att, v, heavy); const dealt = hp0 - v.hp; if (dealt > 0) { v.hp -= dealt * (q - 1); if (v.hp <= 0 && !v.dead) v.die(att); } return r; };
    },
    onEvent(name) { if (name === 'ready' && !spot) build(); },
    objMenuItems(me, o) {
      if (o.kind !== 'forge' || !me.household) return [];
      const P = G.economy.prices; const out = [];
      out.push({ label: `🔥 Forge a blade (2 iron · you have ${me.inv?.iron || 0})`, disabled: !(me.inv?.iron >= 2) || me.age === 'child', fn: () => startForge(me) });
      out.push({ label: `⛏ Buy 2 iron bars (${P.iron * 2} nyang)`, disabled: me.coins < P.iron * 2, fn: () => { me.coins -= P.iron * 2; me.inv = me.inv || {}; me.inv.iron = (me.inv.iron || 0) + 2; } });
      const b = best(me);
      if (b && (me.bladeQ || 1) < b[3]) out.push({ label: `🗡 Carry your ${b[1].toLowerCase()} blade (+${Math.round((b[3] - 1) * 100)}% damage)`, fn: () => { me.bladeQ = b[3]; me.bladeName = b[1]; me.armed = true; if (!me.char.sword) me.rebuildModel(); G.ui.toast(`${me.name.given} now carries a ${b[1].toLowerCase()} blade.`); } });
      const blades = GRADES.filter((g) => me.inv?.['blade_' + g[1].toLowerCase()] > 0);
      if (blades.length) { const tot = blades.reduce((a, g) => a + me.inv['blade_' + g[1].toLowerCase()] * P['blade_' + g[1].toLowerCase()], 0); out.push({ label: `💰 Sell your blades (${tot} nyang)`, fn: () => { for (const g of blades) me.inv['blade_' + g[1].toLowerCase()] = 0; me.earn(tot); if (me.bladeName && !best(me)) { me.bladeQ = 1; me.bladeName = null; } } }); }
      return out;
    },
    panelHtml(s) { return s.bladeName ? `<div class="facts">🗡 Carries a ${esc(s.bladeName.toLowerCase())} blade${s.skills.smithing ? ` · smithing ${s.skills.smithing.toFixed(1)}` : ''}</div>` : s.skills.smithing ? `<div class="facts">🔨 Smithing ${s.skills.smithing.toFixed(1)}</div>` : ''; },
  };
  return S;
}
