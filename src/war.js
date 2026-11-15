// Wars with rival kingdoms: diplomacy, envoys, musters, field battles with arrow volleys and cavalry, sieges, treaties.
import * as THREE from 'three';
import { LAYOUT, groundAt } from './terrain.js';
import { rr, ri, pick, chance, clamp } from './noise.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const alive = (s) => !!s && !s.dead && !s.removed;
const d2 = (a, x, z) => Math.hypot(a.pos.x - x, a.pos.z - z);

// ---------- Rival realms ----------
const REALMS = {
  seorang: {
    name: 'Kingdom of Seorang', ko: '서랑국', short: 'Seorang', color: '#c9a227', banner: '#151515', base: 95, agg: 1.0, cav: 0.12, arch: 0.25, skill: 1.05, fields: [0, 1],
    desc: 'A proud western kingdom of black-lacquered armour and gold trim. Its court never forgets a slight.',
    rulers: ['King Mo Hwan', 'King Gal Jeongseon', 'Queen Hyeon Sorae', 'King Mo Taeryeong'],
    given: ['Mo Gwang', 'Gal Su', 'Hyeon Do', 'Jeok Cheol', 'Ban Ul', 'Mo Seok', 'Gal Bu', 'Hyeon Mu', 'Yeom Gang'],
    uniform: { outfit: 'soldier', colors: { top: '#171717', bottom: '#0f0f0f', armor: '#121212', robe: '#121212', belt: '#c9a227', ribbon: '#c9a227' }, hat: 'helmet' },
    cmd: { outfit: 'general', colors: { top: '#1a1a1a', bottom: '#0f0f0f', armor: '#141414', robe: '#c9a227', belt: '#c9a227' }, hat: 'helmet' },
    taunts: ['Kneel, Haeryeong, and keep your heads!', 'Seorang remembers every insult. Today we collect.', 'Your king hides behind farmers and paper walls!'],
    approach: ['Black-lacquered ranks of Seorang appear over the western ridge, gold glinting on every helm.', 'The drums of Seorang roll across the valley like distant thunder.'],
  },
  hwaru: {
    name: 'Hwaru Khanate', ko: '화루', short: 'Hwaru', color: '#b5652b', banner: '#d8c8a0', base: 105, agg: 1.25, cav: 0.38, arch: 0.3, skill: 1.0, fields: [2, 0],
    desc: 'Northern horse-lords in fur and boiled leather. They live in the saddle and answer every treaty with arrows.',
    rulers: ['Great Khan Temugal', 'Khan Orhai the Red', 'Khatun Saranbi', 'Khan Burgedei'],
    given: ['Jarut', 'Tegun', 'Burkan', 'Sorgal', 'Ulagai', 'Khesar', 'Mergen', 'Odchar', 'Bayalun'],
    uniform: { outfit: 'soldier', colors: { top: '#6b4a2e', bottom: '#3e2c1c', armor: '#8a6a44', robe: '#5a3f26', belt: '#d8c8a0', ribbon: '#d8c8a0' }, hat: 'headband' },
    cmd: { outfit: 'general', colors: { top: '#5a3f26', bottom: '#2e2014', armor: '#a0784a', robe: '#e8dcc0', belt: '#d8c8a0' }, hat: 'helmet' },
    taunts: ['Your walls are made of rice paper! HURRAH!', 'The steppe wind will scatter your ashes!', 'We have ridden nine days to water our horses in your river!'],
    approach: ['At dawn the Hwaru horsemen crested the northern ridge, fur cloaks streaming, the earth trembling beneath their hooves.', 'Horse-tail standards rise over the pass: the Hwaru have come.'],
  },
  heukpa: {
    name: 'Heukpa Sea-Princes', ko: '흑파', short: 'Heukpa', color: '#2a355f', banner: '#b8241e', base: 75, agg: 1.1, cav: 0, arch: 0.32, skill: 0.95, fields: [0, 1],
    desc: 'Indigo-sailed sea-princes of the black waves. Merchants at noon, raiders by moonlight.',
    rulers: ['Sea-Prince Ra Hyeok', 'Sea-Princess Ye Mulgyeol', 'Admiral-Prince Doyun'],
    given: ['Ra Pa', 'Ye Seon', 'Mul Dol', 'Do Gyeong', 'Pa Un', 'Ra Mok', 'Seon Gu', 'Ye Nam'],
    uniform: { outfit: 'soldier', colors: { top: '#1f2a4f', bottom: '#141a30', armor: '#2a355f', robe: '#1f2a4f', belt: '#b8241e', ribbon: '#b8241e' }, hat: 'headband' },
    cmd: { outfit: 'general', colors: { top: '#1f2a4f', bottom: '#141a30', armor: '#333f70', robe: '#b8241e', belt: '#b8241e' }, hat: 'helmet' },
    taunts: ['Your harbours, your silver, your daughters — all ours by sundown!', 'The tide does not ask permission!', 'Black waves drown proud kings!'],
    approach: ['Indigo sails crowd the river mouth. The Heukpa sea-princes have landed.', 'Conch horns wail along the river as Heukpa raiders form ranks on the shore.'],
  },
};
const FIELDS = [
  { name: 'the Silver-Grass Plain of Eoksae', ko: '억새벌 전투', c: LAYOUT.pampas[0], siege: [95, -5] },
  { name: 'the Western Reed Moor', ko: '갈대벌 전투', c: LAYOUT.pampas[1], siege: [-140, -60] },
  { name: 'the Northern Pass of Bukhyeon', ko: '북현 고개 전투', c: LAYOUT.pampas[2], siege: [40, -245] },
];
const OUR_BANNER = '#a3262a';
const ARROW_MAX = 120;

export function createWarSystem(G) {
  const st = {
    realms: {}, war: null, peaceUntil: 4, lastDiplo: 0, lastIncident: 0, ultimatum: null, forceWar: null, history: [], feastDue: null,
    counsel: 0, counselDay: -1, commander: null, enlisted: [], occupiedUntil: 0, tributes: [],
  };
  for (const id in REALMS) st.realms[id] = { tension: rr(12, 42), strength: REALMS[id].base, ruler: pick(REALMS[id].rulers), pact: 0, bond: false, wins: 0, losses: 0 };
  let C = null; // running campaign (runtime only)
  let E = null; // running envoy visit
  let pending = null; // pending royal decision (player king)
  const leaving = []; // enemy sims walking away to be despawned
  let arrowMesh = null; const arrows = []; let arrowDirty = false;
  const _o = new THREE.Object3D(), _v = new THREE.Vector3(), _p = new THREE.Vector3();
  const day = () => G.env?.day ?? 1;
  const realm = (id) => st.realms[id];
  const R_ = (id) => REALMS[id];
  const log = (t, k = 'story', pos) => { try { G.log(t, k, pos); } catch (e) { console.error(e); } };
  const toast = (t, k) => { try { G.ui?.toast(t, k); } catch {} };
  const king = () => (alive(G.king) ? G.king : null);
  const hawkish = () => { const k = king(); if (!k) return 0; let h = 0; if (k.has('Ambitious')) h += 1; if (k.has('Brave')) h += 0.5; if (k.has('Hot-headed')) h += 1; if (k.has('Gentle')) h -= 1; if (k.has('Pious')) h -= 0.5; return h + st.counsel; };
  const ourPower = () => G.sims.filter((s) => alive(s) && s.faction === 'village' && ['soldier', 'general', 'police'].includes(s.job)).length * 8 + 20;
  const hottest = () => Object.keys(st.realms).sort((a, b) => realm(b).tension - realm(a).tension)[0];
  const bump = (id, v) => { const r = realm(id); if (r) r.tension = clamp(r.tension + v, 0, 100); };

  // ---------- Arrows (instanced) ----------
  function initArrows() {
    if (arrowMesh || !G.scene) return;
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4).rotateX(Math.PI / 2);
    arrowMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.8 }), ARROW_MAX);
    arrowMesh.frustumCulled = false; G.scene.add(arrowMesh);
    _o.scale.set(0, 0, 0); _o.updateMatrix();
    for (let i = 0; i < ARROW_MAX; i++) { arrows.push({ i, on: false }); arrowMesh.setMatrixAt(i, _o.matrix); }
    arrowMesh.instanceMatrix.needsUpdate = true;
  }
  function hideArrow(a) { a.on = false; _o.scale.set(0, 0, 0); _o.updateMatrix(); arrowMesh.setMatrixAt(a.i, _o.matrix); arrowDirty = true; }
  function fireArrow(sh, tgt) {
    const a = arrows.find((x) => !x.on); if (!a) return;
    const d = d2(sh, tgt.pos.x, tgt.pos.z); const sc = 0.8 + d * 0.045;
    Object.assign(a, { on: true, landed: false, stick: 0, t: -rr(0, 0.35), shooter: sh, side: sh.faction, target: tgt,
      sx: sh.pos.x, sy: sh.pos.y + 1.5, sz: sh.pos.z, ex: tgt.pos.x + rr(-sc, sc), ez: tgt.pos.z + rr(-sc, sc), dur: 0.7 + d / 38, h: 2.5 + d * 0.2 });
    a.ey = groundAt(a.ex, a.ez) + 0.9;
  }
  function updateArrows(dt) {
    if (!arrowMesh) return;
    for (const a of arrows) {
      if (!a.on) continue;
      a.t += dt; if (a.t < 0) continue;
      const u = Math.min(1, a.t / a.dur);
      const x = a.sx + (a.ex - a.sx) * u, z = a.sz + (a.ez - a.sz) * u, y = a.sy + (a.ey - a.sy) * u + a.h * 4 * u * (1 - u) - (a.landed ? 0.5 : 0);
      _o.position.set(x, y, z); _o.scale.set(1, 1, 1);
      _v.set(x + (a.ex - a.sx), y + (a.ey - a.sy) + a.h * 4 * (1 - 2 * u), z + (a.ez - a.sz)); _o.lookAt(_v); _o.updateMatrix();
      arrowMesh.setMatrixAt(a.i, _o.matrix); arrowDirty = true;
      if (u >= 1) { if (!a.landed) { a.landed = true; arrowLand(a); } else { a.stick += dt; if (a.stick > 8) hideArrow(a); } }
    }
    if (arrowDirty) { arrowMesh.instanceMatrix.needsUpdate = true; arrowDirty = false; }
  }
  function arrowLand(a) {
    let v = null; const t = a.target;
    if (alive(t) && !t.hidden && d2(t, a.ex, a.ez) < 1.25) v = t;
    else for (const o of G.simsNear(a.ex, a.ez)) { if (o.dead || o.hidden || o.faction === a.side || o.faction === 'envoy') continue; if (d2(o, a.ex, a.ez) < 0.85) { v = o; break; } }
    if (!v) return;
    hideArrow(a);
    _p.set(v.pos.x, v.pos.y + 1.3, v.pos.z);
    if (v.combat.blocking) { G.fx?.sparks(_p, 6, 0.5); return; }
    const dmg = rr(9, 19); v.hp -= dmg;
    G.fx?.blood(_p, 8, 0); if (chance(0.3)) G.audio?.hit(_p, false);
    if (v.controlled) G.ui?.floatText?.(v, 'Arrow ' + Math.round(dmg), '#ff9a7a');
    if (chance(0.25)) v.say(pick(['Argh! An arrow!', 'Shields up!', 'Aigo!']), 'shout', 1.2);
    if (v.hp <= 0) v.die(alive(a.shooter) ? a.shooter : null);
  }
  function volley(shooters, foes) {
    let n = 0;
    for (const s of shooters) {
      if (!alive(s) || s.combat.target || s.warRouting || s.warWounded) continue;
      let best = null, bd = 95;
      for (let k = 0; k < 4; k++) { const f = foes[Math.floor(Math.random() * foes.length)]; if (!alive(f) || f.hidden) continue; const d = d2(s, f.pos.x, f.pos.z); if (d < bd) { bd = d; best = f; } }
      if (!best || bd < 5) continue;
      s.heading = Math.atan2(best.pos.x - s.pos.x, best.pos.z - s.pos.z);
      fireArrow(s, best); if (chance(0.6)) fireArrow(s, best); n++;
    }
    if (n) G.audio?.swing?.(shooters[0]?.pos, false);
  }

  // ---------- Spawning & formation ----------
  function freeSpot(x, z) {
    for (let r = 0; r < 12; r += 2) for (let k = 0; k < 6; k++) { const a = k * 1.047, nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r; if (!G.nav.blocked(nx, nz, 0.6)) return [nx, nz]; }
    return [x, z];
  }
  function slot(center, face, i, perRow = 7) {
    const px = -face[1], pz = face[0]; const row = Math.floor(i / perRow), col = (i % perRow) - (perRow - 1) / 2;
    return freeSpot(center[0] + px * col * 2.3 - face[0] * row * 2.7, center[1] + pz * col * 2.3 - face[1] * row * 2.7);
  }
  function flank(center, face, j) { const side = j % 2 ? 1 : -1, off = side * (10 + Math.floor(j / 2) * 2.8); return freeSpot(center[0] - face[1] * off, center[1] + face[0] * off); }
  function hold(s, dest, look, anim = 'guard', prop = null, run = true, label = 'Holding the line') {
    if (!alive(s) || s.controlled) return;
    s.endFight(); s.startAction({ type: 'event', dest, run, anim, prop, dur: 99999, look, label, war: true });
    if (prop) s.char.setProp(prop);
  }
  function spawnFoe(rid, role, x, z, faction = 'enemy') {
    const R = R_(rid); const cmd = role === 'commander';
    [x, z] = freeSpot(x, z);
    const s = G.spawn({ sex: 'm', age: cmd ? 'adult' : chance(0.7) ? 'young' : 'adult', job: cmd ? 'general' : role === 'envoy' ? 'official' : 'soldier', faction, x, z,
      uniform: role === 'envoy' ? { outfit: 'scholar', colors: { robe: R.color, belt: R.banner, top: '#e8e2d2', bottom: '#e8e2d2' }, hat: 'gat' } : { ...(cmd ? R.cmd : R.uniform), weapon: true },
      skillSword: cmd ? rr(7.5, 9.2) : rr(3.2, 6.5) * R.skill, traits: ['Brave', pick(['Loyal', 'Hot-headed', 'Ambitious'])], coins: ri(2, 12) });
    const given = pick(R.given);
    s.name = { surname: R.short, given, hangul: R.ko + ' ' + given, full: `${cmd ? 'Commander ' : role === 'envoy' ? 'Envoy ' : ''}${given} of ${R.short}` };
    s.warEnemy = true; s.warRealm = rid; s.warRole = role; s.home = null;
    if (faction === 'envoy') s.allies = ['village'];
    if (cmd) { s.maxHp = s.hp = 240; }
    try { s.char.o.bannerColor = R.banner; } catch {}
    if (role === 'cavalry' && G.animals) {
      try { const h = G.animals.spawn('horse', x, z, { variant: ri(0, 5), home: [x, z], range: 4 }); h.setTack?.(true); h.warHorse = true; G.animals.mount(s, h); (C?.horses || []).push(h); s.maxHp = s.hp = s.maxHp + 40; } catch (e) { console.error(e); }
    }
    return s;
  }
  function despawn(s) {
    if (!s || s.removed) return;
    try { if (s.mount) { const h = s.mount; G.animals.dismount(s); removeHorse(h); } s.cancelAction(); s.endFight(); } catch {}
    s.dead = true; s.removed = true; s.dispose();
    if (G.selected === s && G.household[0]) G.select(G.household[0]);
  }
  function removeHorse(h) { if (!h || h.removed) return; if (h.rider) { try { G.animals.dismount(h.rider); } catch {} } G.scene.remove(h.root); h.removed = true; h.dead = true; h.deadT = 999; }

  // ---------- Enemy deaths (patched so they are not mourned as villagers or treated as murder) ----------
  const origOnDeath = G.onDeath.bind(G);
  G.onDeath = (s, killer) => {
    if (!s?.warEnemy) return origOnDeath(s, killer);
    try {
      const R = R_(s.warRealm);
      if (killer && killer.faction === 'village') {
        killer.needs.honor = clamp(killer.needs.honor + (s.warRole === 'commander' ? 60 : 12), 0, 100); killer.earn(s.warRole === 'commander' ? 80 : ri(4, 12));
        killer.addMoodlet('warKill', 'Slew an invader', 12, 600); killer.warKills = (killer.warKills || 0) + 1;
        G.kills.set(killer.id, (G.kills.get(killer.id) || 0) + 1);
        G.factions?.notify(killer, { type: 'kill', victim: s });
      }
      if (s.warRole === 'commander') {
        log(`${s.name.full} falls${killer ? ' beneath the blade of ' + killer.name.full : ''}! The ${R.short} standard wavers.`, 'tournament', s.pos);
        if (C) C.foeCmdrDead = true;
        if (killer?.household) toast(`${killer.name.given} slew the enemy commander!`, 'festival');
      } else if (killer?.household && chance(0.6)) log(`${killer.name.full} cut down ${s.name.full}${killer.warKills > 2 ? ` — ${killer.warKills} foes fallen to that blade today` : ''}.`, 'combat', s.pos);
      if (C) C.foeDead++;
      G.emit('death', { sim: s, killer });
      if (G.selected === s) G.ui?.onSelect(s);
    } catch (e) { console.error('[war] enemy death', e); }
  };

  // ---------- Royal decisions (the player may be King) ----------
  function decide(title, text, opts, aiIdx, cb) {
    const k = king();
    if (k && k.household && G.ui?.modal) {
      let done = false; const fin = (i) => { if (done) return; done = true; pending = null; try { cb(i); } catch (e) { console.error(e); } };
      pending = { t: 0, fin: () => fin(aiIdx) };
      try {
        const el = G.ui.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><p><small>Your counsellors advise: “${esc(opts[aiIdx])}”</small></p><div class="aopts">${opts.map((o, i) => `<button data-w="${i}">${esc(o)}</button>`).join('')}</div>`);
        el.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => { el.classList.add('hidden'); fin(+b.dataset.w); }));
      } catch { fin(aiIdx); }
      return;
    }
    cb(aiIdx);
  }

  // ---------- Diplomacy: envoys ----------
  function startEnvoy(rid, purpose) {
    const R = R_(rid); const r = realm(rid); const k = king();
    const td = G.world.spots?.throne || LAYOUT.palaceGate; const dest = [td[0], td[1] + 3]; const start = [-12, -70];
    const env = spawnFoe(rid, 'envoy', start[0], start[1], 'envoy');
    const guards = [0, 1].map((i) => spawnFoe(rid, 'guard', start[0] + (i ? 2 : -2), start[1] + 2, 'envoy'));
    const party = [env, ...guards];
    env.startAction({ type: 'goto', dest, label: 'Bearing a message for the King' });
    guards.forEach((g, i) => g.startAction({ type: 'goto', dest: [dest[0] + (i ? 2 : -2), dest[1] + 2], label: 'Escorting the envoy' }));
    const amt = Math.round(clamp(30 + r.strength * 0.6 + r.tension, 40, 180));
    E = { rid, purpose, party, env, stage: 'walk', t: 0, amt, start, ev: null };
    st.lastDiplo = day();
    const what = { tribute: 'bearing a demand for tribute', trade: 'bearing silk and a proposal of trade', marriage: 'bearing betrothal gifts', ultimatum: 'bearing a sealed ultimatum', gifts: 'bearing gifts of horses and lacquerware', complaint: 'bearing a bitter complaint', peace: 'beneath a white flag of truce' }[purpose];
    log(`An envoy of the ${R.name} (${R.ko}) rides up the southern road, ${what}.`, purpose === 'ultimatum' ? 'danger' : 'decree', { x: start[0], z: start[1] });
    G.director.start({
      kind: 'envoy', title: `Envoy of ${R.short}`, ko: '사신 행차', pos: dest, max: 600,
      update: (gm) => envoyUpdate(gm, dest),
      assign: (s) => {
        if (party.includes(s)) { if (E?.stage === 'leave') { s.startAction({ type: 'goto', dest: [E.start[0], E.start[1] + 30], label: 'Returning home' }); return true; } s.startAction({ type: 'event', phase: 'do', anim: s === env ? 'talk' : 'guard', dur: 30, look: [dest[0], dest[1] - 4], label: s === env ? 'Delivering a message' : 'Standing guard' }); return true; }
        if (s.faction !== 'village' || !(s.factions?.court) || s.job === 'king' || chance(0.6) || E.stage === 'leave') return false;
        const a = rr(0, 6.28); s.startAction({ type: 'event', dest: [dest[0] + Math.cos(a) * rr(5, 9), dest[1] + Math.sin(a) * rr(4, 7)], anim: 'idle', dur: 60, look: [env.pos.x, env.pos.z], label: 'Witnessing the embassy' }); return true;
      },
      end: () => { if (E) { for (const p of E.party) if (alive(p)) leaving.push({ s: p, t: 50 }); E = null; } },
    });
    E.ev = G.director.active;
    if (k && !k.controlled && !k.combat.target && purpose !== 'peace') { k.cancelAction(); k.startAction({ type: 'event', dest: [td[0], td[1] - 1], anim: 'idle', dur: 160, look: dest, label: 'Receiving an envoy' }); }
  }
  function envoyUpdate(gm, dest) {
    if (!E) return; E.t += gm; const ev = E.ev;
    const { env, rid } = E; const R = R_(rid); const r = realm(rid); const k = king();
    if (!alive(env)) { if (E.stage !== 'gone') { log(`The envoy of ${R.short} lies dead in Haeryeong. In ${R.short}, they are already sharpening spears.`, 'danger', env.pos); bump(rid, 40); E.stage = 'gone'; } if (ev) ev.done = true; return; }
    if (E.stage === 'walk' && (!env.action || d2(env, dest[0], dest[1]) < 4 || E.t > 220)) {
      E.stage = 'speak'; E.t = 0; env.cancelAction(); env.char.setAnim('bow', 8);
      const lines = { tribute: `${r.ruler} demands ${E.amt} nyang in tribute, as is owed by lesser realms.`, trade: `${r.ruler} offers a pact of trade — silk and salt for your ginseng and porcelain.`, marriage: `${r.ruler} proposes a royal betrothal, to bind our houses in blood and peace.`, ultimatum: `${r.ruler} commands: pay ${E.amt * 2} nyang and bow — or face fire and steel.`, gifts: `${r.ruler} sends these gifts in friendship.`, complaint: `${r.ruler} is insulted by your border guards and demands redress!`, peace: `${r.ruler} is weary of blood. Shall we speak of peace?` }[E.purpose];
      env.say(lines, E.purpose === 'ultimatum' ? 'shout' : 'talk', 7);
      log(`At the throne hall, the envoy of ${R.short} speaks: “${lines}”`, 'decree', env.pos);
    } else if (E.stage === 'speak' && E.t > 9) {
      E.stage = 'reply'; resolveEnvoy();
    } else if (E.stage === 'leave' && E.t > 90) { if (ev) ev.done = true; }
  }
  function envoyLeave() { if (!E) return; E.stage = 'leave'; E.t = 0; for (const p of E.party) if (alive(p)) { p.cancelAction(); p.startAction({ type: 'goto', dest: [E.start[0] + rr(-3, 3), E.start[1] + 30], label: 'Returning home' }); } }
  function resolveEnvoy() {
    const { rid, purpose, amt, env } = E; const R = R_(rid); const r = realm(rid); const k = king(); const h = hawkish();
    const kname = k ? `King ${k.name.given}` : 'The regency council';
    const reply = (t, kind = 'talk') => { if (k && k.pos.distanceTo(env.pos) < 30) k.say(t, kind, 5); };
    const done = () => envoyLeave();
    const yesNo = (title, text, opts, aiIdx, onYes, onNo) => decide(title, text, opts, aiIdx, (i) => { (i === 0 ? onYes : onNo)(); done(); });
    if (purpose === 'gifts') { reply('Tell your master Haeryeong is grateful.'); bump(rid, -10); if (k) k.coins += 40; log(`${kname} accepts the gifts of ${R.short}. Lacquer boxes and fine horses fill the palace stables.`, 'decree'); return done(); }
    if (purpose === 'tribute') return yesNo(`${R.name} demands tribute`, `The envoy demands ${amt} nyang.`, [`Pay ${amt} nyang`, 'Refuse with contempt'], h + (r.strength > ourPower() * 1.4 ? -1 : 0) > -0.3 ? 1 : 0,
      () => { if (k) k.coins = Math.max(0, k.coins - amt); bump(rid, -15); reply('Take it, and go.'); log(`${kname} pays ${amt} nyang to ${R.short}. The court mutters of shame.`, 'decree'); for (const s of G.sims) if (s.faction === 'village' && !s.dead && chance(0.4)) s.addMoodlet('humbled', 'Haeryeong bowed to foreigners', -5, 720); },
      () => { bump(rid, rr(14, 24)); reply('Haeryeong pays tribute to no one!', 'shout'); env.say('You will regret this.', 'angry'); log(`${kname} tears the tribute demand in two. The envoy of ${R.short} leaves white with fury.`, 'danger'); });
    if (purpose === 'trade') return yesNo(`A trade pact with ${R.short}`, 'Silk and salt for ginseng and porcelain.', ['Sign the pact', 'Decline'], h > 1.5 ? 1 : 0,
      () => { r.pact = day() + 6; bump(rid, -15); reply('Let the caravans come.'); log(`A trade pact is sealed with the ${R.name}! Caravans will cross the border for six days.`, 'decree'); for (const s of G.sims) if (s.job === 'merchant' && !s.dead) s.earn(8); },
      () => { bump(rid, 5); log(`${kname} declines the trade pact. ${R.short}'s merchants grumble.`, 'decree'); });
    if (purpose === 'marriage') {
      const heir = G.sims.find((s) => alive(s) && ['prince', 'princess'].includes(s.job) && !s.spouse && s.age !== 'child');
      return yesNo(`A royal betrothal`, `${r.ruler} offers marriage to ${heir ? heir.name.full : 'a royal heir'}.`, ['Accept the betrothal', 'Refuse'], h > 1 ? 1 : 0,
        () => { r.bond = true; bump(rid, -30); reply('Two houses, one peace.'); log(`💍 ${heir ? heir.name.full : 'The royal heir'} is betrothed into the house of ${r.ruler}. Bells ring in two kingdoms.`, 'love'); heir?.addMoodlet('betrothed', `Betrothed to ${R.short}`, 10, 2880); },
        () => { bump(rid, 14); log(`The betrothal is refused. In ${R.short}, ${r.ruler} takes it as a personal insult.`, 'danger'); });
    }
    if (purpose === 'complaint') return yesNo(`${R.short} demands redress`, 'Offer an apology and 30 nyang of gifts?', ['Apologise and send gifts', 'Dismiss them'], h > 0.5 ? 1 : 0,
      () => { if (k) k.coins = Math.max(0, k.coins - 30); bump(rid, -12); log(`${kname} sends apologies and silk to ${R.short}. Tempers cool.`, 'decree'); },
      () => { bump(rid, 12); log(`${kname} dismisses the complaint of ${R.short} with a wave of the hand.`, 'danger'); });
    if (purpose === 'ultimatum') return yesNo(`Ultimatum from ${R.short}`, `Pay ${amt * 2} nyang and bow — or war.`, ['Bow and pay', 'Defy them — let it be war'], h + (r.strength > ourPower() * 1.8 ? -1.5 : 0) >= -0.5 ? 1 : 0,
      () => { if (k) k.coins = Math.max(0, k.coins - amt * 2); bump(rid, -35); log(`${kname} bows to ${R.short}'s ultimatum and pays ${amt * 2} nyang. War is averted — at the price of pride.`, 'decree'); for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('shame', 'The King bowed to foreigners', -8, 1440); },
      () => { st.ultimatum = { realm: rid, day: day() }; realm(rid).tension = Math.max(r.tension, 88); reply('Tell your master: come and take it.', 'shout'); log(`${kname} hurls the ultimatum to the floor. “Come and take it.” The die is cast.`, 'danger'); G.audio?.drum(); });
    if (purpose === 'peace') {
      const w = st.war; const accept = !w ? 0 : (w.losses > w.wins || h < 0.5 || chance(0.4)) ? 0 : 1;
      return yesNo(`${R.short} offers peace`, 'Accept a truce and end the war?', ['Accept peace', 'Fight on'], accept, () => { if (st.war) treaty('negotiated'); }, () => { log(`${kname} refuses peace. “The war ends when ${R.short} is broken.”`, 'danger'); bump(rid, 10); });
    }
    done();
  }

  // ---------- Chronicle incidents (no visiting party) ----------
  function incident() {
    const ids = Object.keys(st.realms); const rid = pick(ids); const R = R_(rid); const r = realm(rid);
    st.lastIncident = day() + (G.env.hour || 0) / 24;
    const W = { skirmish: r.tension > 35 ? 2 : 0.3, spy: 0.8, caravan: 1, betrayal: r.pact > day() || r.bond ? 0.7 : 0, defector: 0.5, strife: 0.6, rumour: r.tension > 55 ? 1.6 : 0.4, insult: 0.8 };
    let tot = 0; for (const k in W) tot += W[k]; let x = Math.random() * tot, k = 'rumour'; for (const key in W) { x -= W[key]; if (x <= 0) { k = key; break; } }
    if (k === 'skirmish') { bump(rid, rr(6, 12)); const s = pick(G.sims.filter((o) => alive(o) && o.job === 'soldier')); if (s) { s.hp = Math.min(s.hp, s.maxHp * 0.5); s.addMoodlet('skirmish', 'Wounded in a border skirmish', -8, 720); } log(`Steel rang at the border cairns: a patrol of Haeryeong clashed with ${R.short} scouts.${s ? ` ${s.name.full} came home bloodied.` : ''}`, 'danger'); }
    if (k === 'spy') { const s = pick(G.sims.filter((o) => alive(o) && o.faction === 'village' && !o.household && o.has('Cunning') && !['king', 'queen', 'prince', 'princess', 'general'].includes(o.job))); bump(rid, 8); if (s) { log(`Scandal! ${s.name.full} is unmasked as a spy for ${R.short} — letters in cipher were found sewn into a sleeve.`, 'danger', s.pos); try { G.economy?.commitCrime(s, 70, `spying for ${R.short}`); } catch {} } else log(`A ${R.short} spy was caught sketching the palace walls and flogged at the gate.`, 'danger'); }
    if (k === 'caravan') { if (r.tension > 45) { bump(rid, 7); log(`Raiders in ${R.short} colours plundered a salt caravan on the eastern road. The merchants weep.`, 'danger'); for (const s of G.sims) if (s.job === 'merchant' && !s.dead) s.coins = Math.max(0, s.coins - 5); } else { bump(rid, -4); log(`A caravan from ${R.short} arrives laden with ${pick(['lacquerware', 'horses', 'salted fish', 'amber', 'furs'])}. Coins change hands at the market.`, 'info'); } }
    if (k === 'betrayal') { r.pact = 0; r.bond = false; bump(rid, 32); log(`Betrayal! ${r.ruler} has torn up every promise made to Haeryeong. The pact is ash.`, 'danger'); G.audio?.drum(); }
    if (k === 'defector') { const s = G.spawn({ sex: 'm', age: 'adult', job: 'swordsman', x: 8, z: 320, traits: ['Brave', 'Cunning'] }); const gv = pick(R.given); s.name = { ...s.name, full: `${gv} the Defector`, given: gv }; s.startAction({ type: 'goto', dest: [0, 20], label: 'Seeking refuge' }); log(`${s.name.full}, a deserter from ${R.short}, seeks refuge in Haeryeong. He says ${R.short} can field ${Math.round(r.strength / 5)} spears.`, 'story', s.pos); bump(rid, 4); }
    if (k === 'strife') { if (chance(0.5)) { r.strength = Math.max(40, r.strength - 20); log(`Civil strife tears at ${R.short}: rival lords besiege one another. Their army is weakened.`, 'omen'); } else { const old = r.ruler; r.ruler = pick(R.rulers.filter((x) => x !== old)) || old; bump(rid, rr(-15, 20)); log(`News from ${R.short}: ${old} is dead. ${r.ruler} now rules — and no one knows what they want.`, 'omen'); } }
    if (k === 'rumour') log(pick([`Merchants whisper that ${R.short} is forging spearheads day and night.`, `Shepherds report ${R.short} campfires on the far hills, more each night.`, `A ${R.short} horn was heard in the mist beyond the river. The old soldiers do not sleep.`, `The shaman cast the bones: “${R.short}” — and they came up red.`]), r.tension > 60 ? 'danger' : 'omen');
    if (k === 'insult') { bump(rid, rr(5, 12)); log(pick([`${r.ruler} mocked King ${king()?.name.given || ''} at a feast, calling Haeryeong "a village with a palace".`, `A ${R.short} poet's verses mocking Haeryeong are sung in every tavern of the north.`, `${R.short} has moved its boundary stones three li into Haeryeong's hills.`]), 'danger'); }
    G.director.cool = rr(90, 220);
  }

  // ---------- War declaration & campaigns ----------
  function declareWar(rid) {
    const R = R_(rid); const r = realm(rid);
    st.war = { realm: rid, since: day(), battles: 0, wins: 0, losses: 0, nextBattleDay: day(), lastBattleDay: day() };
    st.ultimatum = null; st.forceWar = null;
    G.emit?.('warDeclared', { realm: rid });
    log(`⚔ WAR! The ${R.name} (${R.ko}) has declared war on Haeryeong. ${r.ruler}'s banners are raised.`, 'danger', LAYOUT.palaceGate);
    log(pick(R.approach), 'danger');
    toast(`War with ${R.short}! Household fighters may join the army: click the General, a soldier or the King.`, 'danger');
    G.audio?.alarm();
    for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('war', `Dread of war with ${R.short}`, s.fighter && s.has('Brave') ? 4 : -8, 2880);
  }
  function gatherArmy() {
    const out = []; const used = new Set();
    const add = (s, role) => { if (!alive(s) || used.has(s) || s.royalGuard || s.merc || s.age === 'child' || s.jailed || s.action?.type === 'jailed' || s.faction !== 'village') return; used.add(s); s.warRole = role; out.push(s); };
    const vil = G.sims.filter((s) => alive(s) && s.faction === 'village');
    const pc = st.commander != null ? vil.find((s) => s.id === st.commander) : null;
    const gen = vil.find((s) => s.job === 'general' && !s.household);
    add(pc, 'commander'); add(gen, pc ? 'infantry' : 'commander');
    vil.filter((s) => s.job === 'soldier' && !s.household).slice(0, 10).forEach((s) => add(s, 'infantry'));
    vil.filter((s) => s.factions?.hwarang && s.fighter && !s.household && s.job !== 'police').slice(0, 4).forEach((s) => add(s, s.job === 'hunter' ? 'archer' : 'infantry'));
    vil.filter((s) => s.job === 'police' && !s.policeChief).slice(0, 2).forEach((s) => add(s, 'infantry'));
    vil.filter((s) => s.job === 'hunter' && !s.household).slice(0, 2).forEach((s) => add(s, 'archer'));
    const prince = vil.find((s) => s.job === 'prince' && s.has('Brave')); if (prince && chance(0.6)) { add(prince, 'infantry'); log(`Crown Prince ${prince.name.given} buckles on armour and rides with the army.`, 'story'); }
    for (const id of st.enlisted) add(vil.find((s) => s.id === id), 'infantry');
    if (!out.some((s) => s.warRole === 'commander')) { const best = out.slice().sort((a, b) => b.skills.sword - a.skills.sword)[0]; if (best) best.warRole = 'commander'; }
    const cons = vil.filter((s) => !s.household && s.sex === 'm' && ['young', 'adult'].includes(s.age) && ['farmer', 'merchant', 'fisher'].includes(s.job) && !used.has(s)).sort(() => Math.random() - 0.5).slice(0, 2);
    cons.forEach((s, i) => { add(s, i ? 'drummer' : 'bearer'); s.warConscript = true; s.addMoodlet('conscripted', 'Conscripted for war', -18, 2880); for (const o of [s.spouse, ...(s.children || []), ...(s.parents || [])]) if (alive(o)) o.addMoodlet('fearFor' + s.id, `Fears for ${s.name.given} at war`, -10, 2880); });
    if (cons.length) log(`Conscription officers knock at village doors. ${cons.map((s) => s.name.full).join(' and ')} must march.`, 'decree');
    return out.slice(0, 22);
  }
  function startCampaign() {
    const w = st.war; if (!w || C) return;
    const rid = w.realm; const R = R_(rid); const r = realm(rid);
    const fi = w.battles === 0 ? R.fields[0] : pick(R.fields); const F = FIELDS[fi];
    const c = [F.c[0], F.c[1]]; let dx = c[0], dz = c[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ours = gatherArmy();
    if (!ours.length) { log(`Haeryeong has no army left to send. ${R.short} marches unopposed!`, 'danger'); }
    C = { rid, fi, F, c, dir: [dx, dz], phase: 'muster', t: 0, aiT: 0, ours, foes: [], spawnQ: [], horses: [], foeDead: 0, volT: 0, drumT: 0, siegeT: 0, said: {},
      ourLine: [c[0] - dx * 17, c[1] - dz * 17], foeLine: [c[0] + dx * 17, c[1] + dz * 17], foeSpawn: freeSpot(clamp(c[0] + dx * 75, -455, 455), clamp(c[1] + dz * 75, -455, 455)) };
    C.cmdr = ours.find((s) => s.warRole === 'commander') || null;
    w.battles++; w.lastBattleDay = day();
    const n = clamp(Math.round(9 + r.strength / 9), 12, 21);
    const nc = Math.round(n * R.cav), na = Math.round(n * R.arch);
    const roles = ['commander', 'bearer', 'bearer', 'drummer'];
    for (let i = 0; i < nc; i++) roles.push('cavalry'); for (let i = 0; i < na; i++) roles.push('archer');
    while (roles.length < n) roles.push('infantry');
    C.spawnQ = roles;
    // muster at the palace gate
    const M = [LAYOUT.palaceGate[0], LAYOUT.palaceGate[1] + 24];
    let i = 0; for (const s of ours) { if (s.warRole === 'bearer') s.char.o.bannerColor = OUR_BANNER; if (s === C.cmdr) hold(s, [M[0], M[1] - 6], M, 'talk', null, true, 'Addressing the troops'); else hold(s, slot([M[0], M[1] + 2], [0, -1], i++), [M[0], M[1] - 6], 'guard', s.warRole === 'bearer' ? 'banner' : null, true, 'Mustering for war'); }
    for (const h of G.household) if (alive(h) && h.fighter && !ours.includes(h)) { toast(`The army musters at the palace gate! ${h.name.given} may join — click the General or a soldier.`); break; }
    log(`War drums at the palace gate! ${ours.length} warriors muster under ${C.cmdr ? C.cmdr.name.full : 'no captain'} to meet ${R.short} at ${F.name}.`, 'danger', { x: M[0], z: M[1] });
    G.audio?.drum();
    C.ev = null;
    G.director.start({ kind: 'war', title: `War with ${R.short}`, ko: F.ko, pos: M, max: 99999, update: () => { if (!C) G.director.active && (G.director.active.done = true); }, assign: (s) => (C ? reassign(s) : false), end: () => {} });
    C.ev = G.director.active;
  }
  function setPos(p) { if (C?.ev) C.ev.pos = p; try { G.env.spiritWindTarget = { x: p[0], z: p[1] }; } catch {} }
  function ourFace() { return C.dir; }
  function foeFace() { return [-C.dir[0], -C.dir[1]]; }
  function lineSlot(s, mine) {
    const list = mine ? C.ours : C.foes; const face = mine ? ourFace() : foeFace(); const center = mine ? C.ourLine : C.foeLine;
    const role = s.warRole;
    if (role === 'commander') return [center[0] - face[0] * 4, center[1] - face[1] * 4];
    if (role === 'cavalry') return flank(center, face, list.filter((x) => x.warRole === 'cavalry').indexOf(s));
    const front = list.filter((x) => x.warRole === 'infantry'); const back = list.filter((x) => ['archer', 'bearer', 'drummer'].includes(x.warRole));
    if (role === 'infantry') return slot(center, face, front.indexOf(s));
    return slot(center, face, Math.ceil(front.length / 7) * 7 + 7 + back.indexOf(s));
  }
  function holdLine(s, mine, run = true) {
    const look = mine ? C.foeLine : C.ourLine; const r = s.warRole; const dest = lineSlot(s, mine);
    if (r === 'archer') hold(s, dest, look, 'archery', 'bow', run, 'Archer line');
    else if (r === 'drummer') hold(s, dest, look, 'drum', 'drum', run, 'Beating the war drum');
    else if (r === 'bearer') hold(s, dest, look, 'guard', 'banner', run, 'Bearing the standard');
    else hold(s, dest, look, 'guard', null, run, mine ? 'Marching to war' : 'Holding the line');
  }
  const foesOf = (s) => (s.faction === 'village' ? C.foes : C.ours);
  function nearestFoe(s, list, max) { let b = null, bd = max; for (const f of list) { if (!alive(f) || f.hidden || f.warRouting) continue; const d = d2(s, f.pos.x, f.pos.z); if (d < bd) { bd = d; b = f; } } return b; }
  function charge(s, f) {
    if (s.mount) { if (s.action?.type !== 'goto' || chance(0.2)) s.startAction({ type: 'goto', dest: [f.pos.x, f.pos.z], run: true, label: 'Cavalry charge!' }); return; }
    if (!s.action?.warCharge) { s.endFight(); s.startAction({ type: 'event', phase: 'do', anim: 'charge', dur: 99999, label: 'Charging!', warCharge: true }); s.path = []; if (chance(0.25)) s.say(s.faction === 'village' ? pick(['For Haeryeong!', 'For the King!', 'Charge! 돌격!', 'Haeryeong! Haeryeong!']) : pick(R_(C.rid).taunts), 'shout', 2); }
    s.warTx = f.pos.x; s.warTz = f.pos.z;
  }
  function reassign(s) {
    if (!C || s.controlled) return false;
    const mine = C.ours.includes(s), foe = C.foes.includes(s);
    if (!mine && !foe) return false;
    if (s.warRouting || s.warWounded) return false;
    if (C.phase === 'muster') { hold(s, [LAYOUT.palaceGate[0] + rr(-6, 6), LAYOUT.palaceGate[1] + 28], null, 'guard'); return true; }
    if (['march', 'standoff'].includes(C.phase)) { holdLine(s, mine); return true; }
    if (C.phase === 'melee' || C.phase === 'siege') { const f = nearestFoe(s, mine ? C.foes : C.ours, 150); if (f) { if (d2(s, f.pos.x, f.pos.z) < 45) s.startFight(f); else charge(s, f); return true; } }
    return false;
  }
  function campaignTick(gm) {
    const R = R_(C.rid);
    C.t += gm;
    // staggered enemy spawning
    if (C.spawnQ.length && (C.phase === 'march' || C.phase === 'siegeSpawn')) {
      const role = C.spawnQ.shift(); const base = C.phase === 'siegeSpawn' ? C.siegeAt : C.foeSpawn;
      const s = spawnFoe(C.rid, role, base[0] + rr(-6, 6), base[1] + rr(-6, 6)); C.foes.push(s);
      if (role === 'commander') C.foeCmdr = s;
      if (C.phase === 'march') holdLine(s, false, s.warRole === 'cavalry'); else { s.warObj = chance(0.5) ? [LAYOUT.palaceGate[0], LAYOUT.palaceGate[1] + 6] : [rr(-12, 12), rr(-5, 20)]; s.startAction({ type: 'goto', dest: s.warObj, run: true, label: 'Sacking Haeryeong' }); }
      if (!C.spawnQ.length) C.foeInit = C.foes.length;
    }
    C.aiT -= gm; if (C.aiT > 0) return; C.aiT = 0.3;
    const P = C.phase; const ours = C.ours.filter((s) => alive(s)); const foes = C.foes.filter((s) => alive(s) && !s.warRouting);
    if (P === 'muster') {
      if (C.t > 22 && !C.said.speech && C.cmdr) { C.said.speech = 1; C.cmdr.say(pick([`Men of Haeryeong! ${R.short} would make slaves of your children. Will you let them?`, 'We march at once. Tonight we sleep on the field, or in the earth!', 'Our fathers held this valley. So shall we!']), 'shout', 6); setTimeout(() => { for (const s of ours) if (!s.controlled && chance(0.6)) s.char.setAnim('cheer', 10); }, 2500); }
      if (C.t > 60) {
        C.phase = 'march'; C.t = 0; setPos(C.c);
        for (const s of ours) holdLine(s, true);
        log(`The army of Haeryeong marches out through the palace gate toward ${C.F.name}. Mothers watch from the walls.`, 'story');
      }
    } else if (P === 'march') {
      C.drumT -= 0.3; if (C.drumT <= 0 && C.foes.length) { C.drumT = 12; G.audio?.drum(); }
      if (C.t > 4 && !C.said.arrive && C.foes.length > 3) { C.said.arrive = 1; log(pick(R.approach), 'danger', { x: C.foeLine[0], z: C.foeLine[1] }); }
      const arrived = ours.filter((s) => d2(s, ...lineSlot(s, true)) < 14).length;
      if (C.t > 200) for (const s of ours) if (!s.controlled && !s.household && d2(s, ...C.ourLine) > 60) { const p = freeSpot(C.ourLine[0] - C.dir[0] * 18 + rr(-6, 6), C.ourLine[1] - C.dir[1] * 18 + rr(-6, 6)); s.pos.set(p[0], groundAt(p[0], p[1]), p[1]); holdLine(s, true); }
      if (!C.spawnQ.length && (arrived >= ours.length * 0.75 || C.t > 230)) { C.phase = 'standoff'; C.t = 0; for (const s of ours) if (!s.controlled) holdLine(s, true, false); log(`The two hosts face each other across ${C.F.name}. The silver grass bends in the wind. Neither side breathes.`, 'danger', { x: C.c[0], z: C.c[1] }); }
    } else if (P === 'standoff') {
      C.drumT -= 0.3; if (C.drumT <= 0) { C.drumT = 5; G.audio?.drum(); }
      if (C.t > 3 && !C.said.taunt && alive(C.foeCmdr)) { C.said.taunt = 1; C.foeCmdr.say(pick(R.taunts), 'shout', 5); }
      if (C.t > 9 && !C.said.retort && alive(C.cmdr)) { C.said.retort = 1; C.cmdr.say(pick(['Then come and take it!', `${R.short} will find only graves here.`, 'Archers — nock!']), 'shout', 4); }
      C.volT -= 0.3; if (C.volT <= 0 && C.t > 10) { C.volT = 6; volley(C.foes.filter((s) => s.warRole === 'archer'), ours); volley(ours.filter((s) => s.warRole === 'archer'), foes); }
      if (C.t > 34) {
        C.phase = 'melee'; C.t = 0; G.audio?.alarm();
        log(pick([`“CHARGE!” The lines crash together on ${C.F.name} with a sound like a falling forest.`, `Drums roll, horns scream — and both armies charge into the silver grass!`, `${C.cmdr ? C.cmdr.name.full : 'The captain'} raises a blade: “돌격! CHARGE!” Haeryeong surges forward.`]), 'danger', { x: C.c[0], z: C.c[1] });
        C.ourInit = ours.length; C.foeInit = C.foes.length;
        if (C.cmdr) C.cmdr.say('돌격! CHARGE!', 'shout', 3);
      }
    } else if (P === 'melee') {
      C.volT -= 0.3;
      if (C.volT <= 0) { C.volT = 7; volley(C.foes.filter((s) => s.warRole === 'archer' && !s.combat.target && !nearestFoe(s, ours, 14)), ours); volley(ours.filter((s) => s.warRole === 'archer' && !s.combat.target && !nearestFoe(s, foes, 14)), foes); }
      for (const s of [...ours, ...foes]) {
        if (s.controlled || s.warRouting || s.warWounded) continue;
        if (s.faction === 'village' && !s.household && !s.warRolled && s.hp < s.maxHp * 0.3) { s.warRolled = true; if (chance(0.45)) { s.warWounded = true; const p = freeSpot(C.ourLine[0] - C.dir[0] * 20 + rr(-5, 5), C.ourLine[1] - C.dir[1] * 20 + rr(-5, 5)); hold(s, p, null, 'kneel', null, false, 'Wounded'); s.say(pick(['I am hit… go on without me!', 'My arm… my arm!']), 'shout'); continue; } }
        if (s.combat.target && alive(s.combat.target) && !s.combat.target.warRouting) continue;
        const list = s.faction === 'village' ? foes : ours; const f = nearestFoe(s, list, 120); if (!f) continue;
        const d = d2(s, f.pos.x, f.pos.z); const r = s.warRole;
        if (r === 'archer' && d > 14) { if (!s.action || s.action.anim !== 'archery') hold(s, [s.pos.x, s.pos.z], [f.pos.x, f.pos.z], 'archery', 'bow', false, 'Loosing arrows'); continue; }
        if ((r === 'bearer' || r === 'drummer') && d > 6) continue;
        if (d < 7 || (s.mount && d < 10)) s.startFight(f); else charge(s, f);
      }
      // morale
      const ourLost = (C.ourInit || 1) - ours.filter((s) => !s.warWounded && s.action?.type !== 'flee' && s.action?.type !== 'hide' && d2(s, ...C.c) < 130).length + (alive(C.cmdr) ? 0 : (C.ourInit || 1) * 0.2);
      const foeLost = (C.foeInit || 1) - foes.length + (C.foeCmdrDead ? (C.foeInit || 1) * 0.25 : 0);
      const ol = ourLost / (C.ourInit || 1), fl = foeLost / (C.foeInit || 1);
      if (C.cmdr && !alive(C.cmdr) && !C.said.cmdrDead) { C.said.cmdrDead = 1; log(`${C.cmdr.name.full}, commander of Haeryeong's army, has fallen! A groan runs down the line.`, 'death', C.cmdr.pos); }
      if (fl >= 0.6 || !foes.length || (C.t > 420 && fl >= ol)) endBattle('victory');
      else if (ol >= 0.6 || !ours.length || C.t > 420) endBattle('defeat');
    } else if (P === 'rout') {
      if (C.t > 15 && !C.said.stop) { C.said.stop = 1; for (const s of ours) if (!s.controlled && s.combat.target?.warRouting) { s.endFight(); s.startAction({ type: 'event', phase: 'do', anim: 'cheer', dur: 30, label: 'Victory!' }); } }
      if (C.t > 45) finishVictory();
    } else if (P === 'retreat') {
      if (C.t > 40) beginSiege();
    } else if (P === 'siegeSpawn' || P === 'siege') {
      if (P === 'siegeSpawn' && !C.spawnQ.length) { C.phase = 'siege'; C.t = 0; }
      C.siegeT += 0.3;
      const k = king();
      for (const s of foes) {
        if (s.controlled || (s.combat.target && alive(s.combat.target))) continue;
        let best = null, bd = 32; for (const o of G.sims) { if (o.dead || o.hidden || o.faction !== 'village') continue; const d = d2(o, s.pos.x, s.pos.z); if (d < bd) { bd = d; best = o; } }
        if (s.warRole === 'commander' && k && d2(k, s.pos.x, s.pos.z) < 55) best = k;
        if (best) { s.startFight(best); if (chance(0.2)) s.say(pick(R.taunts), 'shout'); }
        else if (!s.action || s.action.type !== 'goto') { const o = s.warObj || [0, 10]; s.startAction({ type: 'goto', dest: [o[0] + rr(-15, 15), o[1] + rr(-15, 15)], run: true, label: 'Sacking Haeryeong' }); }
      }
      for (const s of G.sims) {
        if (s.dead || s.hidden || s.controlled || s.faction !== 'village') continue;
        const f = nearestFoe(s, foes, 260); if (!f) continue; const d = d2(s, f.pos.x, f.pos.z);
        const def = s.age !== 'child' && (['soldier', 'general', 'police'].includes(s.job) || ((s.fighter || s.has('Brave')) && s.job !== 'monk'));
        if (def && !s.combat.target && d < 50) s.startFight(f);
        else if (def && !s.combat.target && d < (['soldier', 'general'].includes(s.job) ? 260 : 90)) { if (s.action?.type !== 'goto' || chance(0.05)) s.startAction({ type: 'goto', dest: [f.pos.x, f.pos.z], run: true, label: 'Rushing to the defence!' }); }
        else if (!def && d < 35 && (!s.action || !['flee', 'hide'].includes(s.action.type))) { s.cancelAction(); s.startAction({ type: 'flee', dest: s.home?.door || [LAYOUT.palace[0], -140], label: 'Fleeing the invaders!' }); }
      }
      if (!foes.length && !C.spawnQ.length) endSiege(true);
      else if (C.siegeT > 420 || !k) endSiege(false);
    }
  }
  function endBattle(res) {
    const R = R_(C.rid); const r = realm(C.rid); const w = st.war;
    C.result = res; C.phase = res === 'victory' ? 'rout' : 'retreat'; C.t = 0;
    const theirDead = C.foeDead; const ourDead = C.ours.filter((s) => s.dead).length;
    if (res === 'victory') {
      for (const s of C.foes) if (alive(s)) { s.warRouting = true; s.endFight(); s.startAction({ type: 'goto', dest: C.foeSpawn, run: true, label: 'Routing!' }); if (chance(0.3)) s.say(pick(['Fall back! FALL BACK!', 'Run! They are demons!', 'Save yourselves!']), 'shout'); leaving.push({ s, t: 0 }); }
      log(`The ${R.short} line breaks! Their soldiers throw down their spears and flee across ${C.F.name}. ${theirDead} of them lie in the grass; Haeryeong lost ${ourDead}.`, 'tournament', { x: C.c[0], z: C.c[1] });
      G.audio?.drum(); r.strength = Math.max(25, r.strength - 12 - theirDead * 2); r.losses++; if (w) w.wins++;
    } else {
      for (const s of C.ours) if (alive(s) && !s.controlled) { s.endFight(); s.startAction({ type: 'goto', dest: [LAYOUT.palaceGate[0] + rr(-8, 8), LAYOUT.palaceGate[1] + rr(6, 14)], run: true, label: 'Retreating to the palace!' }); }
      for (const s of C.foes) if (alive(s)) { s.endFight(); s.startAction({ type: 'event', phase: 'do', anim: 'cheer', dur: 25, label: 'Triumph' }); }
      log(`Disaster on ${C.F.name}! Haeryeong's army breaks and flees for the palace walls. ${ourDead} of our warriors will not come home.`, 'danger', { x: C.c[0], z: C.c[1] });
      r.wins++; if (w) w.losses++; r.strength = Math.min(160, r.strength + 5);
      toast(`Defeat! ${R.short} marches on Haeryeong!`, 'danger'); G.audio?.alarm();
    }
    st.history.unshift({ day: day(), realm: C.rid, field: C.F.name, result: res, ours: ourDead, theirs: theirDead, cmdr: C.cmdr?.name?.full || null });
    st.history = st.history.slice(0, 16);
  }
  function participants() { return [...C.ours.filter((s) => alive(s)), ...G.household.filter((h) => alive(h) && !C.ours.includes(h) && d2(h, ...C.c) < 150)]; }
  function finishVictory() {
    const R = R_(C.rid); const r = realm(C.rid);
    for (const s of participants()) {
      s.earn(ri(15, 35)); s.needs.honor = clamp(s.needs.honor + 30, 0, 100); s.addMoodlet('victory', `Victor of ${C.F.name}`, 25, 2880);
      if (s.household) { s.earn(40); if (G.factions && !s.factions?.bandits && !s.factions?.lotus) { G.factions.join(s, 'court', true); const m = s.factions.court; if (m) { m.rep += s === C.cmdr ? 140 : 50; while (m.rep >= (m.rank + 1) * 60 && m.rank < 6) G.factions.promote(s, 'court'); } } }
    }
    if (C.cmdr && alive(C.cmdr) && C.cmdr.household) { C.cmdr.addMoodlet('warHero', `Hero of ${C.F.name}`, 40, 4320); log(`🏆 ${C.cmdr.name.full}, who led the vanguard, is hailed as the Hero of ${C.F.name}! The King himself will hear of it.`, 'tournament', C.cmdr.pos); king()?.changeRel(C.cmdr, 30); }
    for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('warVictory', 'Our army is victorious!', 15, 1440);
    st.feastDue = { realm: C.rid, day: day() };
    r.tension = 25;
    if (r.strength < 55 || chance(0.5)) { endCampaign(); treaty('victory'); }
    else { if (st.war) st.war.nextBattleDay = day() + 1; log(`${r.ruler} gathers the survivors and swears revenge. The war is not over.`, 'danger'); endCampaign(); }
  }
  function beginSiege() {
    const R = R_(C.rid);
    C.phase = 'siegeSpawn'; C.t = 0; C.siegeT = 0; C.siegeAt = freeSpot(...C.F.siege);
    C.spawnQ = Array.from({ length: ri(4, 7) }, (_, i) => (i === 0 && !alive(C.foeCmdr) ? 'commander' : 'infantry'));
    for (const s of C.foes) if (alive(s) && !s.warRouting) { s.warObj = chance(0.5) ? [LAYOUT.palaceGate[0], LAYOUT.palaceGate[1] + 6] : [0, 10]; s.startAction({ type: 'goto', dest: s.warObj, run: true, label: 'Marching on Haeryeong' }); }
    G.raidActive = true; setPos(LAYOUT.palaceGate);
    if (C.ev) { C.ev.title = `Siege of Haeryeong`; C.ev.ko = '공성전'; try { G.ui?.setEvent(C.ev); } catch {} }
    log(`SIEGE! ${R.short} troops pour toward the village and the palace gate. Bells ring; mothers drag children indoors.`, 'danger', LAYOUT.palaceGate);
    toast('Siege! Defend the palace gate and the village!', 'danger'); G.audio?.alarm();
  }
  function endSiege(held) {
    const R = R_(C.rid); const r = realm(C.rid);
    if (held) {
      log(`Haeryeong holds! The last ${R.short} raiders are cut down beneath the palace walls. The bells ring in triumph.`, 'tournament', LAYOUT.palaceGate);
      r.strength = Math.max(25, r.strength - 25); if (st.war) st.war.wins++;
      for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('heldWalls', 'We held the walls!', 18, 1440);
      for (const h of G.household) if (alive(h) && h.warKills) { h.factions?.court && (h.factions.court.rep += 40); h.needs.honor = 100; }
      st.feastDue = { realm: C.rid, day: day() };
      endCampaign(); if (r.strength < 70 || chance(0.6)) treaty('victory'); else if (st.war) st.war.nextBattleDay = day() + 2;
    } else {
      const k = king();
      log(k ? `The defenders are spent. ${R.short} soldiers plunder the market and set fire to the granary before the court sues for terms.` : `With the King fallen, the court opens the gates and begs ${R.short} for terms.`, 'danger', { x: 0, z: 10 });
      for (const s of G.sims) if (s.faction === 'village' && !s.dead) { s.coins = Math.floor(s.coins * 0.7); s.addMoodlet('sacked', 'Haeryeong was sacked', -18, 2880); }
      if (k) k.coins = Math.floor(k.coins * 0.6);
      endCampaign(); treaty('defeat');
    }
  }
  function endCampaign() {
    if (!C) return;
    G.raidActive = false;
    for (const s of C.foes) if (alive(s) && !leaving.some((l) => l.s === s)) { s.warRouting = true; s.endFight(); s.startAction({ type: 'goto', dest: C.foeSpawn, run: true, label: 'Withdrawing' }); leaving.push({ s, t: 0 }); }
    for (const s of G.sims) {
      if (s.dead || s.faction !== 'village') continue;
      if (s.combat.target?.warEnemy) { s.endFight(); s.cancelAction(); }
      if (s.action && (s.action.war || s.action.warCharge || ['flee', 'hide'].includes(s.action.type))) s.endAction();
      s.warRole = null; s.warWounded = false; s.warRolled = false; s.warConscript = false;
    }
    for (const h of C.horses) if (!h.rider) removeHorse(h);
    if (C.ev) C.ev.done = true;
    G.kills?.clear?.();
    C = null;
    ensureGarrison();
  }
  function ensureGarrison() {
    try {
      const vil = G.sims.filter((s) => alive(s) && s.faction === 'village');
      if (!vil.some((s) => s.job === 'general')) { const best = vil.filter((s) => s.job === 'soldier' && !s.household).sort((a, b) => b.skills.sword - a.skills.sword)[0]; if (best) { best.job = 'general'; best.rebuildModel(); G.factions?.join(best, 'court', true); if (best.factions.court) best.factions.court.rank = Math.max(best.factions.court.rank, 6); log(`${best.name.full} is raised to General of Haeryeong's army.`, 'decree', best.pos); } }
      const n = vil.filter((s) => s.job === 'soldier').length; const bar = G.vhouses?.barracks; const add = Math.max(0, 6 - n);
      for (let i = 0; i < add; i++) { const s = G.spawn({ sex: 'm', age: 'young', job: 'soldier', home: bar || null, x: LAYOUT.palace[0] + rr(-15, 15), z: LAYOUT.palace[1] + rr(10, 30) }); bar?.residents.push(s); G.factions?.join(s, 'court', true); }
      if (add) log(`${add} young recruits take up the spear to refill the ranks of the royal guard.`, 'decree');
    } catch (e) { console.error('[war] garrison', e); }
  }
  function treaty(kind) {
    const w = st.war; if (!w) return; const rid = w.realm; const R = R_(rid); const r = realm(rid);
    const k = king();
    if (kind === 'victory') {
      const amt = ri(18, 40); st.tributes.push({ realm: rid, amt, days: 5, to: 'us' }); r.tension = 15; st.peaceUntil = day() + 5;
      log(`🕊 Treaty of ${pick(['the Silver Grass', 'the Willow Bridge', 'the Nine Banners', 'the River Stones'])}: ${r.ruler} sues for peace. ${R.short} will pay Haeryeong ${amt} nyang a day for five days.`, 'decree');
    } else if (kind === 'defeat') {
      const amt = ri(25, 50); st.tributes.push({ realm: rid, amt, days: 4, to: 'them' }); r.tension = 40; st.peaceUntil = day() + 5; st.occupiedUntil = day() + 2;
      log(`A humiliating peace: ${R.short} garrisons the river crossing and Haeryeong must pay ${amt} nyang a day for four days.`, 'danger');
    } else { r.tension = 30; st.peaceUntil = day() + 3; log(`🕊 Envoys of Haeryeong and ${R.short} exchange cups of wine. ${k ? 'King ' + k.name.given : 'The court'} and ${r.ruler} agree to an uneasy peace.`, 'decree'); }
    st.history.unshift({ day: day(), realm: rid, field: 'Treaty', result: kind === 'defeat' ? 'tribute' : kind === 'victory' ? 'peace (tribute won)' : 'peace', ours: 0, theirs: 0 });
    st.war = null; st.commander = null; st.enlisted = []; st.counsel = 0;
    for (const s of G.sims) if (s.faction === 'village' && !s.dead) { s.moodlets = s.moodlets.filter((m) => m.id !== 'war'); if (kind !== 'defeat') s.addMoodlet('peace', 'Peace at last', 10, 1440); }
    if (C) endCampaign();
  }

  // ---------- Victory feast ----------
  function feast() {
    const f = st.feastDue; st.feastDue = null; if (!f) return; const R = R_(f.realm);
    log(`A victory parade! The veterans march from the palace gate to the plaza behind captured ${R.short} banners. Rice wine flows; drums play until dawn.`, 'festival', { x: 0, z: 0 });
    G.audio?.festival(true);
    const vets = G.sims.filter((s) => alive(s) && s.faction === 'village' && !s.controlled && (s.job === 'soldier' || s.job === 'general' || (s.moodlets || []).some((m) => m.id === 'victory'))).slice(0, 10);
    vets.forEach((s, i) => { s.cancelAction(); s.startAction({ type: 'event', dest: [rr(-5, 5), rr(-8, 8)], anim: () => (Math.random() < 0.01 ? 'cheer' : 'guard'), prop: i === 0 ? 'banner' : i === 1 ? 'drum' : null, dur: 80, label: 'Victory parade' }); if (i === 0) s.char.o.bannerColor = R.banner; });
    G.director.start({
      kind: 'festival', title: 'Victory Feast', ko: '개선 잔치', pos: [0, 0], max: 220,
      assign: (s) => { if (s.faction !== 'village' || chance(0.4)) return false; const a = rr(0, 6.28), r = rr(9, 22); s.startAction({ type: 'event', dest: [Math.cos(a) * r, Math.sin(a) * r], anim: () => pick(['cheer', 'dance', 'talk', 'idle']), dur: rr(40, 90), look: [0, 0], adv: { fun: 1.4, social: 1.0, hunger: 1 }, label: 'Celebrating the victory' }); return true; },
      end: () => { G.audio?.festival(false); for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('feast', 'Victory feast', 14, 1440); log('The victory feast ends. Even the old soldiers wept a little, remembering the fallen.', 'festival'); },
    });
  }

  // ---------- Daily drift ----------
  function onDay() {
    st.counsel *= 0.5;
    const k = king(); const h = hawkish(); const dd = day();
    const winter = G.env?.season === 'winter';
    for (const id in st.realms) {
      const r = realm(id); const R = R_(id);
      r.strength = Math.min(R.base + 30, r.strength + 3);
      if (st.war?.realm === id) continue;
      let v = rr(-2, 7) * R.agg + h * 1.5 - (r.pact > dd ? 4 : 0) - (r.bond ? 4 : 0) - (winter ? 2 : 0) + (r.strength > ourPower() * 1.5 ? 2 : 0);
      if (dd < 3) v = Math.min(v, 2);
      bump(id, v);
      if (r.pact && r.pact <= dd) { r.pact = 0; log(`The trade pact with ${R.short} has lapsed.`, 'info'); }
    }
    // tributes
    st.tributes = st.tributes.filter((t) => t.days > 0);
    for (const t of st.tributes) {
      const R = R_(t.realm); t.days--;
      if (t.to === 'us') { if (k) k.coins += t.amt; log(`A ${R.short} tribute caravan delivers ${t.amt} nyang to the palace treasury.`, 'decree'); }
      else { let got = 0; if (k) { const n = Math.min(k.coins, Math.ceil(t.amt / 2)); k.coins -= n; got += n; } for (const s of G.sims) if (s.faction === 'village' && !s.dead && s.coins > 3 && got < t.amt) { s.coins -= 2; got += 2; s.addMoodlet('tribute', `Taxed for ${R.short}'s tribute`, -7, 1440); } log(`${R.short} tax-collectors leave Haeryeong with ${got} nyang. Resentment smoulders.`, 'danger'); }
    }
    if (st.occupiedUntil >= dd) for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('occupied', 'Foreign soldiers at the river crossing', -12, 1440);
    if (st.ultimatum && !st.war && dd > st.ultimatum.day) st.forceWar = st.ultimatum.realm;
    const w = st.war;
    if (w && !C && dd - w.since >= 6 && chance(0.35)) { log(`Both realms are exhausted. Grain runs short, widows wail — and the war sputters out.`, 'story'); treaty('negotiated'); }
    const hot = hottest(); if (!st.war && realm(hot).tension > 70 && chance(0.6)) log(`Along the border, ${R_(hot).short} watch-fires burn. Tension is near breaking.`, 'omen');
  }

  // ---------- Director events ----------
  function registerEvents() {
    const D = G.director; if (!D?.registerEvent || D.custom?.realmEnvoy) return;
    D.registerEvent('realmEnvoy', { weight: (g, h, dd) => (!st.war && !E && king() && h > 9 && h < 16 && dd - st.lastDiplo >= 1 && dd >= 2 ? 1.3 : 0), run: () => {
      const rid = pick(Object.keys(st.realms)); const t = realm(rid).tension;
      const W = t > 78 ? ['ultimatum', 'ultimatum', 'complaint', 'tribute'] : t > 50 ? ['tribute', 'complaint', 'tribute', 'trade'] : t > 25 ? ['trade', 'tribute', 'marriage', 'complaint'] : ['gifts', 'trade', 'marriage'];
      startEnvoy(rid, pick(W));
    } });
    D.registerEvent('realmIncident', { weight: (g, h, dd) => (dd + h / 24 - st.lastIncident >= 0.6 && dd >= 2 ? 0.9 : 0), run: () => incident() });
    D.registerEvent('realmWar', { weight: (g, h, dd) => { if (st.war || C || dd < 3) return 0; if (st.forceWar) return 50; if (dd < st.peaceUntil) return 0; const t = realm(hottest()).tension; return t >= 85 ? (G.env?.season === 'winter' ? 2 : 6) : 0; }, run: () => {
      const rid = st.forceWar || hottest(); declareWar(rid); startCampaign();
    } });
    D.registerEvent('realmBattle', { weight: (g, h, dd) => (st.war && !C && dd >= st.war.nextBattleDay && h > 6 && h < 17 ? 5 : 0), run: () => { log(`Scouts gallop in: ${R_(st.war.realm).short} is on the move again!`, 'danger'); startCampaign(); } });
    D.registerEvent('realmPeace', { weight: (g, h, dd) => (st.war && !C && !E && dd - st.war.lastBattleDay >= 1 && h > 9 && h < 16 ? 1.4 : 0), run: () => startEnvoy(st.war.realm, 'peace') });
    D.registerEvent('warFeast', { weight: (g, h) => (st.feastDue && !C && h > 10 && h < 21 ? 8 : 0), run: () => feast() });
  }

  // ---------- Player agency ----------
  function counselWar(me) {
    const rid = hottest(); const R = R_(rid); const k = G.king;
    st.counsel += 1; st.counselDay = day(); bump(rid, 10 + me.skills.charisma * 1.5);
    me.say(`Majesty, ${R.short} grows bolder each day. Strike first!`, 'shout'); k.changeRel(me, k.has('Ambitious') || k.has('Hot-headed') ? 6 : -3);
    log(`${me.name.full} counsels King ${k.name.given} to make war on ${R.short}. The court murmurs.`, 'decree', me.pos);
  }
  function counselPeace(me) {
    const k = G.king; st.counsel -= 1; st.counselDay = day();
    me.say('Majesty, every war is paid for in widows. Seek peace.', 'talk'); k.changeRel(me, k.has('Gentle') || k.has('Pious') ? 6 : -2);
    if (st.war && !C) {
      const p = 0.2 + me.skills.charisma * 0.04 + (st.war.losses > st.war.wins ? 0.25 : 0) - Math.max(0, hawkish()) * 0.1;
      if (Math.random() < p) { log(`Moved by ${me.name.full}'s counsel, King ${k.name.given} sends envoys to sue for peace.`, 'decree', me.pos); treaty('negotiated'); }
      else { log(`King ${k.name.given} hears ${me.name.full} out — then turns away. The war goes on.`, 'decree', me.pos); }
    } else { for (const id in st.realms) bump(id, -6); log(`${me.name.full} counsels patience and peace. King ${k.name.given} sends conciliatory letters to the neighbouring realms.`, 'decree', me.pos); }
  }
  function volunteer(me) {
    const k = G.king; const ok = (me.factions?.court?.rank || 0) >= 3 || me.skills.sword >= 6;
    if (!ok) return toast('The King needs a court rank of 3 or Sword 6 to trust you with the vanguard.');
    if (k.getRel(me).f < -20) { k.say('You? Never.', 'angry'); return; }
    st.commander = me.id; if (!st.enlisted.includes(me.id)) st.enlisted.push(me.id);
    k.say(`So be it, ${me.name.given}. Lead my vanguard — and come back alive.`, 'talk', 5); me.char.setAnim('bow', 8);
    log(`King ${k.name.given} names ${me.name.full} commander of the vanguard!`, 'decree', me.pos);
    if (C && ['muster', 'march'].includes(C.phase)) { if (!C.ours.includes(me)) C.ours.push(me); if (C.cmdr && C.cmdr !== me) C.cmdr.warRole = 'infantry'; me.warRole = 'commander'; C.cmdr = me; if (!me.controlled) reassign(me); }
  }
  function enlist(me, on) {
    if (on) {
      if (!st.enlisted.includes(me.id)) st.enlisted.push(me.id);
      me.addMoodlet('enlisted', 'Marching to war', 8, 2880); me.say('My blade is the King’s.', 'shout');
      log(`${me.name.full} joins the royal army against ${R_(st.war.realm).short}.`, 'story', me.pos);
      if (C && ['muster', 'march', 'standoff'].includes(C.phase) && !C.ours.includes(me)) { me.warRole = 'infantry'; C.ours.push(me); if (!me.controlled) reassign(me); }
      toast(`${me.name.given} enlisted. ${me.controlled ? 'Follow the army!' : 'They will march with the army.'}`);
    } else {
      st.enlisted = st.enlisted.filter((x) => x !== me.id); if (st.commander === me.id) st.commander = null;
      if (C) { C.ours = C.ours.filter((x) => x !== me); if (C.cmdr === me) C.cmdr = null; if (!me.controlled) me.cancelAction(); }
      me.needs.honor = Math.max(0, me.needs.honor - 30); me.addMoodlet('deserter', 'Deserted the army', -15, 2880);
      if (me.factions?.court) me.factions.court.rep = Math.max(0, me.factions.court.rep - 50);
      for (const s of G.sims) if (alive(s) && ['soldier', 'general'].includes(s.job)) s.getRel(me).f -= 15;
      log(`${me.name.full} has deserted the army! The soldiers spit at the name.`, 'danger', me.pos);
    }
  }

  // ---------- Realms modal ----------
  function openRealms() {
    const k = king(); const w = st.war;
    const rows = Object.keys(st.realms).map((id) => {
      const R = R_(id), r = realm(id); const t = Math.round(r.tension); const col = t > 75 ? '#d23c2c' : t > 50 ? '#e09a3a' : t > 25 ? '#c8b45a' : '#6aaa6a';
      const status = w?.realm === id ? '<b style="color:#e05050">AT WAR</b>' : [r.pact > day() ? 'Trade pact' : '', r.bond ? 'Royal betrothal' : '', st.ultimatum?.realm === id ? '<b style="color:#e08060">Ultimatum defied</b>' : '', ...st.tributes.filter((x) => x.realm === id).map((x) => (x.to === 'us' ? `Pays us ${x.amt}/day (${x.days}d)` : `We pay ${x.amt}/day (${x.days}d)`))].filter(Boolean).join(' · ') || (t > 75 ? 'Hostile' : t > 45 ? 'Wary' : 'At peace');
      return `<div class="kf" style="border-left-color:${R.color}"><div class="kfh"><span class="fi" style="background:${R.color};color:${R.banner}">${R.ko[0]}</span><b>${esc(R.name)}</b> <em>${R.ko}</em> <small>${esc(r.ruler)}</small></div>
        <p>${esc(R.desc)}</p>
        <div style="display:flex;gap:8px;align-items:center;font-size:12px">Tension <div style="flex:1;height:8px;background:#0003;border-radius:4px"><div style="width:${t}%;height:100%;background:${col};border-radius:4px"></div></div> ${t}</div>
        <small>Army: ~${Math.round(r.strength / 5)} spears${R.cav > 0.2 ? ', many horsemen' : ''} · Battles won against us: ${r.wins} · lost: ${r.losses} · ${status}</small></div>`;
    }).join('');
    const ws = w ? `<p><b style="color:#e05050">⚔ At war with the ${esc(R_(w.realm).name)}</b> since day ${w.since}. Battles: ${w.battles} (won ${w.wins}, lost ${w.losses}).${C ? ` <b>${{ muster: 'The army is mustering', march: 'The armies are marching', standoff: 'The lines face each other', melee: 'Battle is joined!', rout: 'The enemy is routed', retreat: 'Our army retreats', siegeSpawn: 'Siege!', siege: 'Siege!' }[C.phase]}</b> at ${esc(C.F.name)}.` : ''}${st.commander != null ? ` Vanguard: ${esc(G.sims.find((s) => s.id === st.commander)?.name.full || '—')}.` : ''}</p>`
      : `<p>Haeryeong is at peace${st.peaceUntil > day() ? ` (treaty holds until day ${st.peaceUntil})` : ''}. ${k ? `King ${esc(k.name.given)} is ${hawkish() > 0.8 ? 'hungry for glory' : hawkish() < -0.5 ? 'a man of peace' : 'cautious'}.` : ''}</p>`;
    const hist = st.history.length ? st.history.slice(0, 8).map((h) => `<li>Day ${h.day}: ${esc(h.field)} vs ${esc(R_(h.realm)?.short || '?')} — <b>${esc(h.result)}</b>${h.ours || h.theirs ? ` (our dead ${h.ours}, theirs ${h.theirs})` : ''}</li>`).join('') : '<li>No battles yet. May it stay so.</li>';
    try { G.ui.modal(`<h2>The Neighbouring Realms · 이웃 나라</h2>${ws}${rows}<h3>Annals of War</h3><ul style="font-size:12px;margin:0;padding-left:18px">${hist}</ul><p><small>Counsel the King (click him with a household member) to steer war and peace.</small></p>`); } catch (e) { console.error(e); }
  }

  return {
    id: 'war',
    get st() { return st; },
    api: { declareWar: (rid) => { declareWar(rid); startCampaign(); }, treaty: (k) => treaty(k), bump: (rid, v) => bump(rid, v), envoy: (rid, p) => startEnvoy(rid, p) },
    init() { try { initArrows(); } catch (e) { console.error('[war] arrows', e); } },
    onEvent(name, p) {
      if (name === 'ready') {
        registerEvents();
        if (!st._btn) { st._btn = true; try { G.ui?.addTopButton('⚔ Realms', 'Neighbouring realms, diplomacy & war', openRealms); } catch {} }
        for (const s of G.sims.slice()) if (s.faction === 'enemy' || s.faction === 'envoy') despawn(s);
        G.sims = G.sims.filter((s) => !s.removed);
        if (!p?.loaded) log(`Beyond the mountains lie rivals: the ${REALMS.seorang.name}, the ${REALMS.hwaru.name}, and the ${REALMS.heukpa.name}. Haeryeong's peace is a thin silk thread.`, 'story');
      }
      if (name === 'day') onDay();
      if (name === 'death' && C && p?.sim) {
        const s = p.sim;
        if (s === C.cmdr) { C.cmdrDeadT = C.t; if (s.household) toast(`${s.name.given} has fallen leading the vanguard!`, 'danger'); }
        if (s.household && C.ours.includes(s)) log(`${s.name.full} died on ${C.F.name}, sword in hand. The ${s.name.surname} family will remember.`, 'death', s.pos);
      }
    },
    update(dt, gm) {
      updateArrows(dt);
      if (pending) { pending.t += gm; if (pending.t > 45) pending.fin(); }
      for (let i = leaving.length - 1; i >= 0; i--) { const l = leaving[i]; l.t += gm; if (!alive(l.s) || l.t > 80) { if (alive(l.s)) despawn(l.s); leaving.splice(i, 1); } }
      if (!C) return;
      try { campaignTick(gm); } catch (e) { console.error('[war] campaign', e); endCampaign(); return; }
      if (!C) return;
      // custom charge movement (event 'do' anim stays 'charge' while we steer)
      for (const list of [C.ours, C.foes]) for (const s of list) {
        if (!s.action?.warCharge || s.dead || s.controlled) continue;
        if (s.path.length) { s.path[0][0] = s.warTx; s.path[0][1] = s.warTz; } else s.path.push([s.warTx, s.warTz]);
        s.moveAlong(dt, 4.5, 1.2);
      }
    },
    serialize() { const { _btn, ...rest } = st; return JSON.parse(JSON.stringify(rest)); },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      for (const id in REALMS) if (d.realms?.[id]) Object.assign(st.realms[id], d.realms[id]);
      for (const k of ['peaceUntil', 'lastDiplo', 'lastIncident', 'counsel', 'occupiedUntil']) if (typeof d[k] === 'number') st[k] = d[k];
      st.war = d.war && REALMS[d.war.realm] ? { ...d.war, nextBattleDay: Math.max(d.war.nextBattleDay || 0, (G.env?.day || 1) + 0) } : null;
      st.ultimatum = d.ultimatum && REALMS[d.ultimatum.realm] ? d.ultimatum : null; st.forceWar = REALMS[d.forceWar] ? d.forceWar : null;
      st.history = Array.isArray(d.history) ? d.history.filter((h) => REALMS[h.realm]) : [];
      st.tributes = Array.isArray(d.tributes) ? d.tributes.filter((t) => REALMS[t.realm]) : [];
      st.feastDue = d.feastDue && REALMS[d.feastDue.realm] ? d.feastDue : null;
      st.commander = d.commander ?? null; st.enlisted = Array.isArray(d.enlisted) ? d.enlisted : [];
      for (const s of G.sims.slice()) if (s.faction === 'enemy' || s.faction === 'envoy') despawn(s);
      G.sims = G.sims.filter((s) => !s.removed);
    },
    simMenuItems(me, o) {
      if (!me?.household || !o || o.dead || me === o) return [];
      const items = []; const w = st.war; const k = king();
      if (o.job === 'king' && o === k) {
        const rid = hottest(); const used = st.counselDay === day();
        if (!w) items.push({ label: `⚔ Counsel war on ${R_(rid).short}`, disabled: used, fn: () => counselWar(me) });
        items.push({ label: w ? '🕊 Counsel peace (sue for terms)' : '🕊 Counsel peace', disabled: used || !!C, fn: () => counselPeace(me) });
        if ((w || realm(rid).tension > 60) && st.commander !== me.id) items.push({ label: '🗡 Volunteer to lead the vanguard', disabled: !((me.factions?.court?.rank || 0) >= 3 || me.skills.sword >= 6), fn: () => volunteer(me) });
      }
      if (me.job === 'king' && o.job === 'general' && o.faction === 'village') {
        if (!w) items.push({ label: `⚔ Declare war on ${R_(hottest()).short}`, danger: true, fn: () => { st.forceWar = hottest(); realm(st.forceWar).tension = 95; G.director.cool = Math.min(G.director.cool, 5); log(`King ${me.name.given} orders the General to prepare for war against ${R_(st.forceWar).short}!`, 'decree', me.pos); } });
        else if (!C) items.push({ label: '🕊 Send envoys to make peace', fn: () => { if (chance(0.55 + (w.wins > w.losses ? 0.25 : 0))) treaty('negotiated'); else log(`${R_(w.realm).short} rejects the peace envoys and sends back their heads in a basket.`, 'danger'); } });
      }
      if (w && o.faction === 'village' && ['general', 'soldier', 'king'].includes(o.job) && me.fighter && me.job !== 'king') {
        if (st.enlisted.includes(me.id)) items.push({ label: '🏳 Desert the army', danger: true, fn: () => enlist(me, false) });
        else items.push({ label: `⚔ Join the army against ${R_(w.realm).short}`, fn: () => enlist(me, true) });
      }
      if (o.faction === 'envoy' && E && E.env === o) {
        items.push({ label: 'Insult the envoy', danger: true, fn: () => { me.say(`Crawl back to ${R_(E.rid).short}, dog!`, 'angry'); o.say('Haeryeong will answer for this!', 'angry'); bump(E.rid, 15); me.needs.honor = Math.min(100, me.needs.honor + 5); log(`${me.name.full} publicly insults the envoy of ${R_(E.rid).short}. Tension soars.`, 'danger', me.pos); } });
        items.push({ label: 'Offer gifts (15 nyang)', disabled: me.coins < 15, fn: () => { me.coins -= 15; bump(E.rid, -6); o.say('Your courtesy will be reported.', 'happy'); me.changeRel(o, 10); } });
      }
      return items;
    },
    panelHtml(s) {
      if (!s?.household) return '';
      const w = st.war; const bits = [];
      if (w) bits.push(`⚔ Haeryeong is at war with ${esc(R_(w.realm).short)}${C ? ` — ${C.phase === 'melee' ? 'battle raging' : C.phase.startsWith('siege') ? 'siege!' : C.phase}` : ''}.`);
      if (st.enlisted.includes(s.id)) bits.push(st.commander === s.id ? '🗡 Commander of the vanguard.' : '🛡 Enlisted in the royal army.');
      if (s.warKills) bits.push(`Foes slain in war: ${s.warKills}.`);
      if (!w) { const rid = hottest(); const t = realm(rid).tension; if (t > 60) bits.push(`Border tension with ${esc(R_(rid).short)}: ${Math.round(t)}%.`); }
      return bits.length ? `<div class="facts" style="margin-top:4px">${bits.join('<br>')}</div>` : '';
    },
  };
}
