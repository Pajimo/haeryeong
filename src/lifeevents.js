// Life events, folklore, disasters, illness and village requests for Haeryeong.
// Things that happen to you, and to everyone else: fevers and epidemics, house fires and
// bucket brigades, floods, droughts, locusts, thunderstorms, eclipses and comets, gwishin and
// dokkaebi, foundlings, matchmakers, thieves, kidnappers — plus a notice board of villager requests.
import * as THREE from 'three';
import { KINDS } from './buildings.js';
import { rand, rr, pick, chance, clamp, weightedPick } from './noise.js';
import { LAYOUT, groundAt, heightAt, isWater, BRIDGE } from './terrain.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BTN = 'display:block;width:100%;text-align:left;background:#1d1a17;color:#f0d9a0;border:1px solid #c9a45c;border-radius:4px;padding:8px 12px;margin:5px 0;font-size:13px;cursor:pointer';
const DIS = {
  fever: { name: 'Fever', ko: '열병', icon: '🤒', rate: 1, spread: 0.010 },
  cough: { name: 'Winter cough', ko: '고뿔', icon: '😷', rate: 0.7, spread: 0.014 },
  flux: { name: 'Summer flux', ko: '괴질', icon: '🤢', rate: 1.2, spread: 0.009 },
  pox: { name: 'Smallpox', ko: '마마', icon: '🔴', rate: 1.5, spread: 0.016 },
};
const HERBS = ['doraji bellflower roots', 'danggwi angelica', 'omija berries', 'wild mugwort (ssuk)', 'hasuo root', 'licorice root (gamcho)'];
const REQ_INFO = {
  herbs: { icon: '🌿', title: 'Medicinal herbs', reward: 25, honor: 8 },
  dog: { icon: '🐕', title: 'A lost Jindo dog', reward: 20, honor: 6 },
  heirloom: { icon: '🏺', title: 'A stolen heirloom', reward: 60, honor: 18 },
  escort: { icon: '🛡', title: 'Escort to the bridge', reward: 45, honor: 12 },
  letter: { icon: '✍', title: 'A love letter', reward: 20, honor: 5 },
  duel: { icon: '⚔', title: 'A matter of honour', reward: 50, honor: 20 },
  rice: { icon: '🍚', title: 'Rice for the widow', reward: 12, honor: 15 },
};
const ri = (a, b) => Math.floor(rr(a, b + 1));

export function createLifeEventsSystem(G) {
  const S = { ill: new Map(), immune: {}, cool: {}, nextHH: 0, nextNPC: 0, nextReq: 0, requests: [], rid: 0, healerId: null, mudangId: null, captive: null, crop: 1, drought: 0, fate: {}, lastWorld: {}, epidemic: 0, herbLore: {} };
  const V = { fires: [], beacons: new Map(), ghost: null, comet: null, eclipse: null, storm: null, flood: null, swarm: null, wisps: [], rituals: [], flash: 0, bolts: [], lastT: performance.now(), fastAcc: 0, slowAcc: 0, objs: {}, wells: [], tex: {}, nagT: 0 };
  const modalQ = [];

  // ---------- helpers ----------
  const now = () => G.env.day * 1440 + G.env.hour * 60;
  const alive = (s) => !!s && !s.dead && !s.removed;
  const byId = (id) => (id == null ? null : G.sims.find((s) => s.id === id && !s.removed) || null);
  const HH = () => (G.household || []).filter((s) => alive(s) && !s.jailed);
  const vill = () => G.sims.filter((s) => alive(s) && s.faction === 'village' && !s.household && !['king', 'queen', 'prince', 'princess', 'general', 'soldier'].includes(s.job));
  const log = (t, k = 'story', p = null) => { try { G.log(t, k, p); } catch (e) { console.error(e); } };
  const toast = (t, k) => { try { G.ui?.toast(t, k); } catch { /* ignore */ } };
  const bump = (s, k, v) => { if (s?.needs && k in s.needs) s.needs[k] = clamp(s.needs[k] + v, 0, 100); };
  const P = (s) => (s?.pos ? { x: s.pos.x, z: s.pos.z } : null);
  const nm = (s) => s?.name?.full || 'someone';
  const gv = (s) => s?.name?.given || 'someone';
  const season = () => G.env.season || 'autumn';
  const night = () => G.env.hour > 20.5 || G.env.hour < 4.5;
  const cdOk = (k) => (S.cool[k] || 0) <= now();
  const cd = (k, mins) => { S.cool[k] = now() + mins; };
  const dist = (s, x, z) => Math.hypot(s.pos.x - x, s.pos.z - z);
  const since = (k) => G.env.day - (S.lastWorld[k] ?? -99);
  const luck = (s) => (s && S.fate[s.id] && S.fate[s.id].until > now() ? S.fate[s.id].v : 0);
  const pay = (s, n) => { if (!s) return; if (n > 0) s.earn(Math.round(n)); else s.coins = Math.max(0, s.coins + Math.round(n)); };
  const richest = () => HH().sort((a, b) => b.coins - a.coins)[0] || null;
  const hhCoins = () => HH().reduce((a, s) => a + s.coins, 0);
  const free = (s, work = false) => alive(s) && !s.controlled && !s.jailed && !s.combat?.target && !s.hidden && (!s.action || (['wander', 'use', 'social'].includes(s.action.type) && (work || !s.action.work) && !s.action.le)) && (!s.household || (s.freeWill && !s.queue.length));
  const focus = (x, z) => { try { G.player.focusTarget.set(x, 0, z); G.player.follow = false; } catch { /* ignore */ } };
  const endBanner = (kind) => { const a = G.director?.active; if (a && a.kind === kind) a.done = true; };
  const drum = (pos, vol = 0.5) => { const A = G.audio; if (!A?.ctx) return; try { A.drumHit(chance(0.3) ? 'ta' : 'kung', vol * (pos ? A.gainFor(pos) : 1)); } catch { /* ignore */ } };
  const spot = (x, z, r = 6) => { for (let i = 0; i < 24; i++) { const a = rr(0, 6.28), d = rr(0, r); const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (!G.nav.blocked(px, pz, 0.8) && !isWater(px, pz)) return [px, pz]; } return [x, z]; };
  const single = (s) => alive(s) && !s.spouse && ['young', 'adult'].includes(s.age);
  const doAt = (me, x, z, label, fn) => { if (dist(me, x, z) < 4) return fn(); if (me.controlled) return toast('Walk closer first.'); me.startAction({ type: 'goto', dest: [x, z], label, then: () => { if (dist(me, x, z) < 6) fn(); } }); };
  const disposeObj = (o) => { if (!o) return; o.parent?.remove(o); o.traverse?.((m) => { m.geometry?.dispose?.(); if (m.material && !m.material.userData?.keep) m.material.dispose?.(); }); };

  function glow(key, r, g, b) {
    if (V.tex[key]) return V.tex[key];
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`); grd.addColorStop(0.3, `rgba(${r},${g},${b},0.45)`); grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return (V.tex[key] = new THREE.CanvasTexture(c));
  }

  // ---------- modal choices (queued so events never stomp on each other) ----------
  function ask(title, body, opts, sim) { if (modalQ.length > 3) { opts[opts.length - 1]?.fn?.(); return; } modalQ.push({ title, body, opts, sim }); flushModal(); }
  function flushModal() {
    if (!modalQ.length || !G.ui?.modal || !G.started) return;
    const cur = document.getElementById('modal'); if (cur && !cur.classList.contains('hidden')) return;
    const m = modalQ.shift();
    let img = ''; try { if (m.sim) img = `<img src="${G.ui.portraits.get(m.sim)}" style="float:left;width:64px;height:64px;margin:0 12px 6px 0;border-radius:4px;border:1px solid #c9a45c">`; } catch { /* ignore */ }
    const el = G.ui.modal(`<h2>${m.title}</h2>${img}<p style="line-height:1.55">${m.body}</p><div style="clear:both">${m.opts.map((o, i) => `<button data-le="${i}" style="${BTN}${o.disabled ? ';opacity:.45;cursor:default' : ''}" ${o.disabled ? 'disabled' : ''}>${o.label}${o.hint ? `<br><small style="opacity:.7">${o.hint}</small>` : ''}</button>`).join('')}</div>`);
    let done = false;
    const fire = (i) => { if (done) return; done = true; el.classList.add('hidden'); try { m.opts[i]?.fn?.(); } catch (e) { console.error('[lifeevents] choice', e); } setTimeout(flushModal, 600); };
    el.querySelectorAll('[data-le]').forEach((b) => (b.onclick = () => fire(+b.dataset.le)));
    const mc = el.querySelector('.mclose'); if (mc) { mc.textContent = 'Close (choose the last option)'; mc.onclick = () => fire(m.opts.length - 1); }
    try { G.audio?.ctx && G.audio.pluck(392, 0.12); } catch { /* ignore */ }
  }

  // ================= ILLNESS =================
  function infect(s, kind = 'fever', quiet = false) {
    if (!alive(s) || S.ill.has(s.id) || (S.immune[s.id] || 0) > G.env.day || S.ill.size >= 16) return false;
    if (S.herbLore[s.id] && chance(0.5)) return false;
    S.ill.set(s.id, { k: kind, sev: rr(0.18, 0.35), d0: G.env.day, tr: 0 });
    const D = DIS[kind];
    if (!quiet) {
      if (s.household) { log(`${D.icon} ${nm(s)} has come down with ${D.name.toLowerCase()} (${D.ko}). ${pick(['Their brow burns like a brazier.', 'They shiver beneath three quilts.', 'The family boils barley water and worries.'])}`, 'danger', P(s)); toast(`${gv(s)} has fallen ill with ${D.name.toLowerCase()}. Rest, medicine or a healer will help.`); }
      else if (chance(0.35)) log(`${nm(s)} has taken to bed with ${D.name.toLowerCase()}.`, 'story', P(s));
    }
    return true;
  }
  function cure(s) {
    S.ill.delete(s.id); S.immune[s.id] = G.env.day + 5;
    s.moodlets = s.moodlets.filter((m) => m.id !== 'le_ill');
    s.addMoodlet('le_well', 'Recovered from illness', 12, 720);
    if (s.household || chance(0.25)) log(`${nm(s)} ${pick(['has recovered and eats three bowls of rice to prove it', 'rises from the sickbed, pale but smiling', 'is well again — the family hangs a thank-you cloth at the shrine'])}.`, 'story', P(s));
  }
  function treat(s, amt, label) { const d = S.ill.get(s?.id); if (!d) return false; d.tr = 720; d.sev -= amt; s.addMoodlet('le_treat', label || 'Took herbal medicine', 6, 600); return true; }
  function illDeath(s, D) {
    S.ill.delete(s.id);
    log(pick([`The ${D.name.toLowerCase()} claimed ${nm(s)} in the night. Incense smoke rises from the ${s.name.surname} house.`, `${nm(s)} did not survive the ${D.name.toLowerCase()}. White mourning hemp is hung at the gate.`, `Despite every remedy, ${nm(s)} has succumbed to ${D.name.toLowerCase()} (${D.ko}).`]), 'death', P(s));
    if (s.age === 'elder') s.naturalDeath = true;
    s.die(null);
  }
  function restAction(s, D) { const h = s.home?.door; s.cancelAction(); s.startAction({ type: 'event', dest: h ? [h[0] + rr(-1, 1), h[1] + rr(-1, 1)] : [s.pos.x, s.pos.z], anim: 'sick', dur: rr(90, 180), label: `Resting — ${D.name}`, leRest: true }); }

  function illTick(m) {
    const k = m / 1440; const ep = S.epidemic > now() ? 2.5 : 1;
    const smul = { winter: 1.8, summer: 1.3, spring: 0.8, autumn: 0.9 }[season()] || 1;
    for (const [id, d] of [...S.ill]) {
      const s = byId(id); if (!alive(s)) { S.ill.delete(id); continue; }
      const D = DIS[d.k] || DIS.fever;
      const rest = s.hidden || s.action?.leRest || (s.action?.obj?.kind === 'bed' && s.action.phase === 'do');
      d.sev += (rr(-0.4, 0.5) * D.rate + (s.age === 'elder' ? 0.22 : s.age === 'child' ? 0.12 : 0) - (rest ? 0.55 : 0) - (d.tr > 0 ? 0.6 : 0) - (S.herbLore[s.id] ? 0.1 : 0) - luck(s) * 0.1) * k;
      d.tr = Math.max(0, d.tr - m);
      if (d.sev <= 0) { cure(s); continue; }
      if (d.sev >= 1) { d.sev = 1; if (chance((s.age === 'elder' ? 0.005 : s.age === 'child' ? 0.003 : 0.0004) * m / 10)) { illDeath(s, D); continue; } }
      s.addMoodlet('le_ill', `${D.icon} ${D.name}`, -8 - Math.round(d.sev * 16), 30);
      bump(s, 'energy', -1.2 * d.sev * m / 10); bump(s, 'fun', -0.8 * d.sev * m / 10); bump(s, 'hunger', -0.3 * m / 10);
      s.hp = Math.min(s.hp, s.maxHp * (1 - 0.45 * d.sev));
      if (!s.hidden && chance(0.1)) s.say(pick(['*cough* *cough*', 'Aigo… my head burns…', '*shivers*', 'Ugh… so dizzy…', '*sneezes*']), 'sad', 2.5);
      if (d.sev > 0.3 && free(s) && chance(0.3)) restAction(s, D);
      else if (!s.household && free(s) && s.coins >= 8 && V.objs.herb && chance(0.08)) s.startAction({ type: 'use', obj: V.objs.herb, label: 'Seeking medicine' });
      if (!s.hidden) for (const o of G.simsNear(s.pos.x, s.pos.z)) {
        if (o === s || o.dead || S.ill.has(o.id) || o.pos.distanceTo(s.pos) > 2.4) continue;
        const p = D.spread * smul * ep * (m / 10) * (o.age === 'elder' || o.age === 'child' ? 1.4 : 1) * (s.action?.partner === o ? 2.5 : 1);
        if (chance(p)) infect(o, d.k, !o.household);
      }
    }
    // the village physician makes rounds
    const doc = byId(S.healerId);
    if (alive(doc) && S.ill.size && free(doc, true) && chance(0.4)) {
      const pts = [...S.ill].map(([id, d]) => [byId(id), d]).filter(([t, d]) => alive(t) && !t.hidden && d.tr <= 0 && t !== doc).sort((a, b) => a[0].pos.distanceTo(doc.pos) - b[0].pos.distanceTo(doc.pos));
      const t = pts[0]?.[0];
      if (t) doc.startAction({ type: 'goto', dest: [t.pos.x, t.pos.z], label: `Visiting the sick (${gv(t)})`, le: 'doc', then: () => { if (alive(t) && t.pos.distanceTo(doc.pos) < 5 && treat(t, 0.3, 'Treated by the physician')) { doc.say(pick(['Drink this, slowly.', 'Acupuncture at the hegu point…', 'Keep the ondol warm tonight.']), 'talk'); doc.earn(3); t.changeRel(doc, 6); if (t.household) log(`The physician ${nm(doc)} treated ${nm(t)} with needles and bitter decoction.`, 'story', P(t)); } } });
    }
  }

  // ================= FIRE =================
  function startFire(house, cause) {
    if (!house || house.virtual || V.fires.some((f) => f.house === house && !f.done) || V.fires.length > 3) return null;
    const y = house.y0 ?? groundAt(house.x, house.z);
    const light = V.fireLight && !V.fireLight.userData.busy ? V.fireLight : null; if (light) { light.userData.busy = true; light.position.set(house.x, y + 5, house.z); }
    const f = { id: 'f' + (++S.rid), house, x: house.x, z: house.z, y, heat: 35, burnT: 0, t: 0, crew: new Set(), helpers: {}, light, cause, choice: null, done: false, smoke: 0 };
    V.fires.push(f);
    const hh = house.residents.some((r) => r.household && alive(r));
    const why = cause === 'lightning' ? 'A bolt of lightning splits the roof ridge' : pick(['An ember from the ondol furnace catches the thatch', 'An overturned oil lamp sets the paper doors alight', 'A careless long pipe drops its ash onto dry straw', 'Sparks from the kitchen hearth leap into the eaves']);
    const owner = house.residents.find(alive);
    log(`🔥 FIRE! ${why} — the ${owner ? owner.name.surname + ' family' : 'empty'} house is burning! Villagers run for the wells.`, 'danger', { x: f.x, z: f.z });
    try { G.audio?.ctx && G.audio.alarm(); } catch { /* ignore */ }
    if (hh) {
      const hero = HH().filter((s) => s.home === house && s.age !== 'child').sort((a, b) => a.pos.distanceTo(new THREE.Vector3(f.x, a.pos.y, f.z)) - b.pos.distanceTo(new THREE.Vector3(f.x, b.pos.y, f.z)))[0] || HH()[0];
      ask('🔥 Your house is on fire!', `${why}. Flames lick up the timber pillars of the ${hero?.name.surname} home. The family's coins, the ancestral tablets and grandmother's wedding chest are inside!`, [
        { label: 'Rush inside to save the heirlooms', hint: 'Brave — may be burned', fn: () => { f.choice = 'rush'; f.hero = hero?.id; } },
        { label: 'Lead the bucket brigade from the well', hint: 'More neighbours rally, honour if it is saved', fn: () => { f.choice = 'brigade'; if (hero && !hero.controlled) f.crew.add(hero); f.bonusCrew = 5; } },
        { label: 'Get everyone out and pray', hint: 'Nobody is hurt — but more may be lost', fn: () => { f.choice = 'safe'; } },
      ], hero);
    } else if (G.director && !G.director.active) G.director.start({ kind: 'fire', title: 'House Fire', ko: '화재', pos: [f.x, f.z], max: 300, update: () => { if (f.done) endBanner('fire'); } });
    return f;
  }
  function wellNear(x, z) { let b = null, bd = 1e9; for (const w of V.wells) { const d = Math.hypot(w[0] - x, w[1] - z); if (d < bd) { bd = d; b = w; } } return b; }
  function crewLeg(f, s, leg) {
    if (leg === 'well') { const w = wellNear(f.x, f.z) || [f.x + 20, f.z]; const a = rr(0, 6.28); s.startAction({ type: 'event', dest: [w[0] + Math.cos(a) * 2.2, w[1] + Math.sin(a) * 2.2], anim: 'wash', dur: 1e6, run: true, look: w, label: 'Drawing water', le: f.id, leLeg: 'well' }); }
    else { const r = Math.max(f.house.w || 8, f.house.d || 6) / 2 + 3; const a = rr(0, 6.28); s.startAction({ type: 'event', dest: spot(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 2), anim: 'throw', prop: 'bowl', dur: 1e6, run: true, look: [f.x, f.z], label: 'Bucket brigade!', le: f.id, leLeg: 'fire' }); }
  }
  function fireFrame(f, rdt) {
    f.t += rdt;
    const k = f.done ? 0 : f.heat / 100;
    if (f.light) f.light.intensity = k * (45 + 25 * Math.sin(f.t * 17) * Math.sin(f.t * 5.3));
    const fx = G.fx; if (!fx) return;
    const cam = G.camera?.position; if (cam && Math.hypot(cam.x - f.x, cam.z - f.z) > 260) return;
    const p = V.tmp || (V.tmp = new THREE.Vector3()); const v = V.tmpv || (V.tmpv = new THREE.Vector3());
    const H = f.house; const w = (H.w || 8) * 0.5, d = (H.d || 6) * 0.5;
    const at = (h0, h1) => { const lx = rr(-w, w), lz = rr(-d, d); const q = H.world ? H.world(lx, lz) : [f.x + lx, f.z + lz]; p.set(q[0], f.y + rr(h0, h1), q[1]); };
    let n = k * 110 * rdt; while (n > 0) { if (n >= 1 || chance(n)) { at(1.2, 4.8); v.set(rr(-0.6, 0.6), rr(2, 4.5), rr(-0.6, 0.6)); fx.firePool?.emit(p, v, new THREE.Color().setHSL(rr(0.03, 0.11), 1, rr(0.45, 0.62)), rr(0.5, 1.3), rr(0.5, 1.1), -1.5); } n -= 1; }
    let m = (k * 30 + (f.done && f.smoke > 0 ? 6 : 0)) * rdt; const wd = G.env.windDir;
    while (m > 0) { if (m >= 1 || chance(m)) { at(4, 6); v.set((wd?.x || 0.5) * 1.5 + rr(-0.4, 0.4), rr(1.2, 2.2), (wd?.y || 0.2) * 1.5 + rr(-0.4, 0.4)); fx.bloodPool?.emit(p, v, new THREE.Color().setScalar(rr(0.12, 0.26)), rr(1.4, 2.8), rr(2.2, 3.6), -0.6); } m -= 1; }
    if (!f.done) for (const s of [...f.crew]) {
      if (!alive(s) || s.controlled || (s.household && s.queue.length)) { f.crew.delete(s); continue; }
      const a = s.action;
      if (!a || a.le !== f.id) { if (s.combat?.target || s.jailed || (a && (s.household || ['fight', 'flee', 'hide', 'jailed'].includes(a.type)))) { f.crew.delete(s); continue; } crewLeg(f, s, 'well'); continue; }
      if (a.phase === 'do' && a.t > 2.5) {
        if (a.leLeg === 'well') crewLeg(f, s, 'fire');
        else { f.heat -= rr(3, 5) * (s.household ? 1.4 : 1); f.helpers[s.id] = (f.helpers[s.id] || 0) + 1; if (chance(0.2)) s.say(pick(['More water!', 'Hurry, hurry!', 'Pass the bucket!', 'The roof — aim for the roof!']), 'shout', 1.5); crewLeg(f, s, 'well'); }
      }
    }
  }
  function fireTick(f, m) {
    if (f.done) { f.smoke -= m; if (f.smoke <= 0) { if (f.light) { f.light.intensity = 0; f.light.userData.busy = false; } V.fires = V.fires.filter((x) => x !== f); } return; }
    const rain = G.env.rain || 0;
    f.heat += (1.1 * (1 + (G.env.windStrength || 1) * 0.15) - rain * 2.8) * m;
    f.heat = Math.min(100, f.heat);
    if (f.heat >= 95) f.burnT += m;
    // recruit neighbours
    const cap = 8 + (f.bonusCrew || 0);
    if (f.crew.size < cap) {
      let added = 0;
      for (const s of G.sims) {
        if (added >= 2 || f.crew.size >= cap) break;
        if (f.crew.has(s) || s.faction !== 'village' || s.age === 'child' || s.age === 'elder' && chance(0.7) || !free(s, true) || dist(s, f.x, f.z) > 75) continue;
        f.crew.add(s); added++; if (chance(0.3)) s.say(pick(['Fire! FIRE!', 'To the well!', 'Bring buckets!']), 'shout');
      }
    }
    if (f.choice === 'rush' && f.hero != null) {
      const h = byId(f.hero); f.hero = null;
      if (alive(h)) {
        if (chance(0.45 + (h.has('Brave') ? 0.2 : 0) + luck(h) * 0.1)) { f.saved = true; h.needs.honor = Math.min(100, h.needs.honor + 20); h.addMoodlet('le_hero', 'Saved the heirlooms from the fire', 18, 1440); log(`${nm(h)} plunged through the smoke and emerged clutching the ancestral tablets and the family coin chest!`, 'story', P(h)); }
        else { h.hp = Math.max(5, h.hp - h.maxHp * 0.5); h.addMoodlet('le_burned', 'Burned in the fire', -20, 1440); log(`${nm(h)} ran into the blaze and was dragged out by neighbours, badly burned, hands empty.`, 'danger', P(h)); if (chance(0.4)) infect(h, 'fever'); }
      }
    }
    if (f.heat <= 0) endFire(f, false);
    else if (f.burnT > 80 || f.t > 600) endFire(f, true);
  }
  function endFire(f, gutted) {
    f.done = true; f.smoke = gutted ? 40 : 15; endBanner('fire');
    for (const s of f.crew) if (alive(s) && s.action?.le === f.id) s.endAction();
    const helpers = Object.entries(f.helpers).sort((a, b) => b[1] - a[1]).map(([id]) => byId(+id)).filter(alive);
    const res = f.house.residents.filter(alive);
    if (!gutted) {
      log(`The fire at the ${res[0]?.name.surname || 'old'} house is out!${helpers.length ? ` ${helpers.slice(0, 3).map(nm).join(', ')} fought it bucket by bucket.` : ''} Only the eaves are charred.`, 'story', { x: f.x, z: f.z });
      for (const h of helpers) { h.addMoodlet('le_saved', 'Helped put out a fire', 12, 720); bump(h, 'honor', 8); for (const r of res) r.changeRel(h, 12); }
      if (f.choice === 'brigade') for (const r of res) if (r.household) { bump(r, 'honor', 12); r.addMoodlet('le_saved', 'Saved our home', 15, 1440); }
      return;
    }
    let lost = 0;
    for (const r of res) { const frac = f.saved ? rr(0.1, 0.25) : f.choice === 'safe' ? rr(0.5, 0.75) : rr(0.35, 0.6); const n = Math.floor(r.coins * frac); r.coins -= n; lost += n; r.addMoodlet('le_burned', 'Our house burned', -28, 2880); }
    let gift = 0;
    for (const s of G.sims) { if (!alive(s) || s.faction !== 'village' || res.includes(s) || s.coins < 6) continue; if (res.some((r) => s.getRel(r).f > 15) && chance(0.6)) { const n = Math.min(s.coins, ri(2, 8)); s.coins -= n; gift += n; } }
    if (res.length && gift) res.forEach((r) => pay(r, gift / res.length));
    log(`The ${res[0]?.name.surname || 'abandoned'} house is gutted — blackened pillars and steaming roof tiles. ${lost} nyang of savings went up in smoke.${gift ? ` Following the village compact (hyangyak, 향약), neighbours pooled ${gift} nyang to help them rebuild.` : ''}`, 'danger', { x: f.x, z: f.z });
  }

  // ================= LIGHTNING / SKY =================
  function thunder(delay, vol) {
    const A = G.audio; if (!A?.ctx) return;
    try {
      const ctx = A.ctx; const t0 = ctx.currentTime + delay;
      const src = ctx.createBufferSource(); src.buffer = A._leRumble || (A._leRumble = A.noiseBuffer(5));
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320 + vol * 300;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.08); g.gain.exponentialRampToValueAtTime(vol * 0.4, t0 + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
      src.connect(lp); lp.connect(g); g.connect(A.sfxBus || A.master); src.start(t0); src.stop(t0 + 4.8);
    } catch { /* ignore */ }
  }
  function bolt(x, z) {
    const gy = groundAt(x, z); const mat = new THREE.MeshBasicMaterial({ color: 0xeef4ff, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const g = new THREE.Group(); let a = new THREE.Vector3(x + rr(-25, 25), gy + 150, z + rr(-25, 25)); const up = new THREE.Vector3(0, 1, 0);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12; const b = new THREE.Vector3(THREE.MathUtils.lerp(a.x, x, 0.35) + (i < 12 ? rr(-5, 5) : 0), gy + 150 * (1 - t), THREE.MathUtils.lerp(a.z, z, 0.35) + (i < 12 ? rr(-5, 5) : 0));
      const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, L, 4, 1, true), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(up, d.normalize()); g.add(m); a = b;
    }
    if (V.boltLight) { V.boltLight.position.set(x, gy + 25, z); V.boltLight.intensity = 400; }
    G.scene.add(g); V.bolts.push({ g, life: 0.35 }); V.flash = 1;
    const cam = G.camera?.position; const d = cam ? Math.hypot(cam.x - x, cam.z - z) : 100;
    thunder(Math.min(4, d / 340), clamp(1.3 - d / 350, 0.25, 1.1));
    try { G.fx?.sparks(new THREE.Vector3(x, gy + 0.5, z), 30, 2); } catch { /* ignore */ }
    for (const s of G.sims) if (alive(s) && !s.hidden && dist(s, x, z) < 4) { s.hp = Math.max(1, s.hp - s.maxHp * 0.5); s.addMoodlet('le_struck', 'Nearly struck by lightning', -18, 1440); s.say('AAAH!', 'shout'); log(`Lightning struck the ground beside ${nm(s)}! They live, though their hair stands on end.`, 'omen', P(s)); }
    const h = G.world.houses.find((hh) => Math.hypot(hh.x - x, hh.z - z) < 9);
    if (h && chance(0.6)) startFire(h, 'lightning');
  }
  function strike() {
    const f = G.player?.focus || G.camera?.position || { x: 0, z: 0 };
    if (chance(0.18)) { const h = pick(G.world.houses); if (h) return bolt(h.x + rr(-2, 2), h.z + rr(-2, 2)); }
    const a = rr(0, 6.28), r = rr(25, 170); bolt(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r);
  }
  function postEnv(dt) {
    const env = G.env;
    const e = V.eclipse;
    if (e && e.k > 0) {
      env.sun.intensity *= 1 - 0.94 * e.k; env.hemi.intensity *= 1 - 0.78 * e.k;
      if (env.starMat) env.starMat.opacity = Math.max(env.starMat.opacity, e.k * 0.75);
      G.scene.fog?.color.multiplyScalar(1 - 0.65 * e.k);
    }
    if (V.flash > 0) { env.hemi.intensity += V.flash * 5; env.sun.intensity += V.flash * 3; V.flash = Math.max(0, V.flash - (dt || 0.016) * (V.flash > 0.6 ? 3 : 7)); }
  }
  function ensureEclipseMeshes() {
    if (V.dome) return;
    V.dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), new THREE.MeshBasicMaterial({ color: 0x04060c, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    V.dome.renderOrder = 5; V.dome.frustumCulled = false;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const grd = x.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.36, 'rgba(0,0,0,1)'); grd.addColorStop(0.4, 'rgba(255,245,220,1)'); grd.addColorStop(0.55, 'rgba(255,230,190,0.35)'); grd.addColorStop(1, 'rgba(255,220,180,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    V.corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    V.corona.scale.setScalar(150); V.corona.renderOrder = 6;
  }
  function buildComet() {
    const g = new THREE.Group(); const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('comet', 230, 245, 255), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    head.scale.setScalar(55); g.add(head); const tail = [];
    for (let i = 1; i <= 20; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('comet', 230, 245, 255), color: new THREE.Color().setHSL(0.52, 0.6, 0.75), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.75 * (1 - i / 21) })); sp.scale.setScalar(48 * (1 - i / 24)); g.add(sp); tail.push(sp); }
    g.frustumCulled = false; G.scene.add(g);
    return { g, head, tail, t: 0, dur: 190, a0: rr(0, 6.28), dir: chance(0.5) ? 1 : -1 };
  }
  const cometDir = (c, u) => { const a = c.a0 + c.dir * u * 1.6; const e = 0.35 + Math.sin(u * Math.PI) * 0.25; return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)); };

  // ================= GHOST / RITUALS =================
  function buildGhost(x, z) {
    const g = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xeef4ff, transparent: true, opacity: 0.5, depthWrite: false });
    const hairM = new THREE.MeshBasicMaterial({ color: 0x060606, transparent: true, opacity: 0.85 });
    const add = (geo, mat, px, py, pz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.x = rx; g.add(m); return m; };
    add(new THREE.CylinderGeometry(0.2, 0.62, 1.5, 14, 1, true), white, 0, 0.75, 0);
    add(new THREE.CylinderGeometry(0.15, 0.21, 0.45, 10), white, 0, 1.68, 0);
    add(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0xdde6ee, transparent: true, opacity: 0.75 }), 0, 2.02, 0);
    add(new THREE.BoxGeometry(0.32, 1.05, 0.08), hairM, 0, 1.6, -0.1);
    add(new THREE.BoxGeometry(0.27, 0.5, 0.04), hairM, 0, 1.9, 0.12);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.035, 0.045, 0.6, 6), white, sx * 0.22, 1.45, 0.08, -0.35);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('ghost', 170, 205, 255), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 })); sp.scale.setScalar(3.6); sp.position.y = 1.3; g.add(sp);
    g.position.set(x, groundAt(x, z), z); G.scene.add(g);
    return { g, white, sp, x, z, home: [x, z], wp: [x, z], t: 0, age: 0, fade: 1, scareT: 0, wailT: 3 };
  }
  function banishGhost(how, who) {
    const gh = V.ghost; if (!gh || gh.leaving) return; gh.leaving = how || 'fade';
    if (how === 'gut') log(`The mudang's drums thunder and her bells ring until dawn-grey; with a long sigh the white-robed maiden dissolves into the mist. The gwishin will trouble Haeryeong no more.`, 'omen', { x: gh.x, z: gh.z });
    else if (how === 'peace') log(`${nm(who)} listened to the gwishin's han (恨) — a maiden wronged and buried without rites. Promised a proper ancestral rite, she bowed once and faded like breath on a cold morning.`, 'omen', { x: gh.x, z: gh.z });
    else log('As the first cock crows, the pale figure by the well thins into the mist and is gone. For now.', 'omen', { x: gh.x, z: gh.z });
    endBanner('gwishin');
  }
  function ghostFrame(gh, rdt, gm) {
    gh.t += rdt; gh.age += gm;
    if (gh.leaving) { gh.fade -= rdt * 0.35; if (gh.fade <= 0) { disposeObj(gh.g); V.ghost = null; return; } }
    if (Math.hypot(gh.wp[0] - gh.x, gh.wp[1] - gh.z) < 1) gh.wp = spot(gh.home[0], gh.home[1], 11);
    const dx = gh.wp[0] - gh.x, dz = gh.wp[1] - gh.z, d = Math.hypot(dx, dz) || 1; const sp = 0.55 * rdt * (gm > 0 ? 1 : 0);
    gh.x += dx / d * sp; gh.z += dz / d * sp;
    gh.g.position.set(gh.x, groundAt(gh.x, gh.z) + 0.3 + Math.sin(gh.t * 1.3) * 0.15, gh.z); gh.g.rotation.y = Math.atan2(dx, dz);
    const op = gh.fade * (0.35 + 0.18 * Math.sin(gh.t * 2.7) + (chance(0.01) ? -0.3 : 0));
    gh.white.opacity = Math.max(0, op); gh.sp.material.opacity = Math.max(0, op + 0.1); gh.g.visible = !(chance(0.004));
    gh.wailT -= rdt;
    if (gh.wailT <= 0 && G.audio?.ctx) { gh.wailT = rr(9, 16); const cam = G.camera?.position; const v = cam ? clamp(1 - Math.hypot(cam.x - gh.x, cam.z - gh.z) / 120, 0, 1) : 0; if (v > 0) try { G.audio.flute(rr(330, 420), 2.8, 0.05 * v); G.audio.flute(rr(250, 300), 2.2, 0.035 * v, 1.6); } catch { /* ignore */ } }
  }
  function ghostScare(gh) {
    if (gh.leaving) return;
    for (const s of G.sims) {
      if (!alive(s) || s.hidden || s.faction !== 'village' || dist(s, gh.x, gh.z) > 14) continue;
      if (!s.moodlets.some((m) => m.id === 'le_ghost')) { s.addMoodlet('le_ghost', 'Saw a gwishin!', -16, 720); bump(s, 'energy', -10); }
      if (s.id === S.mudangId || s.controlled || s.action?.le === 'face' || s.action?.type === 'flee') continue;
      if (s.household && !free(s)) continue;
      if ((s.has('Pious') || s.has('Brave')) && chance(0.4)) { s.cancelAction(); s.startAction({ type: 'event', dest: [s.pos.x, s.pos.z], anim: 'pray', dur: 15, look: [gh.x, gh.z], label: 'Chanting against the spirit' }); s.say('Namu Amitabul… 나무아미타불…', 'talk'); continue; }
      s.cancelAction(); s.startAction({ type: 'flee', dest: s.home?.door || [0, 0], label: 'Fleeing the ghost!' }); s.say(pick(['Gwi- GWISHIN!! 귀신이다!', 'Aaaah! A ghost!', 'Mother save me!']), 'shout');
    }
  }
  function performGut(pos, purpose, onDone) {
    const mud = byId(S.mudangId);
    if (!alive(mud)) { toast('There is no mudang in the village to perform a gut.'); return false; }
    V.rituals.push({ mud: mud.id, pos, t: 0, need: 40, purpose, onDone, beat: 0 });
    mud.say(pick(['Spirits, hear me!', 'I come with drum and bell.', 'Let the gut begin!']), 'shout');
    for (const s of G.sims) if (alive(s) && s !== mud && free(s) && dist(s, pos[0], pos[1]) < 60 && chance(0.35)) { const a = rr(0, 6.28); s.startAction({ type: 'event', dest: spot(pos[0] + Math.cos(a) * 6, pos[1] + Math.sin(a) * 6, 2), anim: 'pray', dur: rr(30, 50), look: pos, label: 'Watching the gut ritual' }); }
    return true;
  }
  function ritualTick(r) {
    const mud = byId(r.mud);
    if (!alive(mud) || mud.jailed) { r.dead = true; r.onDone?.(false); return; }
    const a = mud.action;
    if (!a || a.le !== 'gut') { if (mud.controlled || mud.combat?.target) return; mud.startAction({ type: 'event', dest: spot(r.pos[0], r.pos[1], 2.5), anim: (s) => (Math.floor((s.action?.t || 0) / 3) % 3 === 2 ? 'pray' : 'dance'), prop: 'drum', dur: 1e6, run: true, look: r.pos, label: 'Performing a gut (굿)', le: 'gut' }); return; }
    if (a.phase !== 'do') return;
    r.t += 1; drum(mud.pos, 0.6);
    if (chance(0.12)) mud.say(pick(['Eoheo-ya! 어허야!', '*rings the spirit bells*', 'Go now, go in peace!', 'Eat, drink, and depart!']), 'shout', 2);
    if (r.t >= r.need) { r.dead = true; mud.endAction(); mud.earn(5); bump(mud, 'honor', 10); r.onDone?.(true); }
  }

  // ================= CAPTIVE CHILD =================
  function captiveTick() {
    const c = S.captive; if (!c) return;
    const kid = byId(c.id); if (!alive(kid)) { S.captive = null; return; }
    const [bx, bz] = LAYOUT.banditCamp;
    const release = (txt, k = 'story') => { S.captive = null; if (kid.action?.le === 'captive') kid.endAction(); kid.addMoodlet('le_freed', 'Home safe at last', 20, 1440); if (kid.home && !kid.controlled) kid.startAction({ type: 'goto', dest: kid.home.door, run: true, label: 'Running home' }); log(txt, k, P(kid)); toast(txt); V.beacons.get('captive') && (disposeObj(V.beacons.get('captive')), V.beacons.delete('captive')); };
    if (c.ransomed) return release(`The ransom was paid beneath the old pine. ${nm(kid)} was left blindfolded by the road — shaken, but unharmed.`);
    if (dist(kid, bx, bz) > 35) return release(`${nm(kid)} slipped away from the bandit camp and is free!`);
    const res = HH().find((s) => s !== kid && s.age !== 'child' && s.pos.distanceTo(kid.pos) < 4);
    if (res) { bump(res, 'honor', 30); res.addMoodlet('le_rescuer', `Rescued ${gv(kid)}`, 25, 2880); return release(`${nm(res)} cut ${nm(kid)}'s bonds in the heart of the bandit camp and carried them home! The village will sing of it.`); }
    if (c.policeAt && now() > c.policeAt) { c.policeAt = 0; if (chance(0.6)) return release(`Constables of the Podocheong raided the western woods at dawn and brought ${nm(kid)} home unharmed.`, 'decree'); log('The constables returned from the woods bloodied and empty-handed.', 'danger'); }
    if (now() > c.until) return release(`After two terrible nights, ${nm(kid)} wriggled free and found the road home by moonlight.`);
    if (kid.action?.le !== 'captive' && !kid.controlled) { kid.cancelAction(); kid.startAction({ type: 'event', phase: 'do', anim: 'kneel', dur: 1e6, label: 'Held captive by bandits', le: 'captive' }); }
    if (!V.beacons.has('captive')) V.beacons.set('captive', beacon(0xff5a4a));
    V.beacons.get('captive').position.set(kid.pos.x, groundAt(kid.pos.x, kid.pos.z), kid.pos.z);
  }

  // ================= PERSONAL EVENTS =================
  const goodW = (s, w) => w * (1 + 0.5 * luck(s)), badW = (s, w) => w * (1 - 0.4 * luck(s));
  const notChild = (s) => s.age !== 'child';
  const PERSONAL = [
    { k: 'sick', hh: (s) => badW(s, ({ winter: 1.5, summer: 1.0 }[season()] || 0.45) * (S.ill.has(s.id) ? 0 : 1)), npc: (s) => (S.ill.has(s.id) ? 0 : ({ winter: 1.4, summer: 1 }[season()] || 0.4)),
      run(s, hh) {
        const kind = season() === 'winter' ? 'cough' : season() === 'summer' ? 'flux' : 'fever'; if (!infect(s, kind, true)) return false; const D = DIS[kind];
        if (!hh) return log(`${nm(s)} has taken to bed with ${D.name.toLowerCase()}.`, 'story', P(s));
        const p = richest();
        ask(`${D.icon} ${gv(s)} has fallen ill`, `${D.name} (${D.ko}) has taken hold of ${gv(s)} — ${pick(['a burning brow and aching bones', 'chills that rattle their teeth', 'a cough that echoes through the courtyard'])}. Elders and children are most at risk, and it may spread to anyone they talk to.`, [
          { label: 'Put them to bed on a warm ondol with rice porridge', hint: 'Rest heals, but no work today', fn: () => { if (!s.controlled) restAction(s, D); } },
          { label: 'Brew ginger and jujube tea (5 nyang)', hint: 'Herbal remedy — faster recovery', disabled: !p || p.coins < 5, fn: () => { pay(p, -5); treat(s, 0.2, 'Ginger & jujube tea'); } },
          { label: '"It is nothing." Carry on as usual', hint: 'Honour for the brave… or worse fever', fn: () => { const d = S.ill.get(s.id); if (d) d.sev += 0.12; if (s.has('Brave')) bump(s, 'honor', 6); } },
        ], s);
      } },
    { k: 'treasure', hh: (s) => notChild(s) ? goodW(s, s.job === 'farmer' ? 0.8 : 0.3) : 0, npc: (s) => (s.job === 'farmer' ? 0.5 : 0.12),
      run(s, hh) {
        const n = ri(40, 140);
        if (!hh) { pay(s, n); return log(`${nm(s)} struck an old onggi jar while ${s.job === 'farmer' ? 'ploughing' : 'digging'} — ${n} nyang of Goryeo-era coins! ${pick(['The whole village is suddenly very friendly.', 'Their neighbours are already digging.'])}`, 'story', P(s)); }
        ask('A clay jar in the earth', `${gv(s)}'s spade strikes something hard… an old onggi jar stuffed with Goryeo-era coins and a silver binyeo hairpin — worth perhaps <b>${n} nyang</b>.`, [
          { label: 'Keep it quiet and keep it all', hint: 'A jealous neighbour might talk', fn: () => { pay(s, n); if (chance(0.25)) { pay(s, -n / 2); bump(s, 'honor', -10); log(`A jealous neighbour told the magistrate of ${nm(s)}'s buried treasure. Half was seized as 'unreported Crown property'.`, 'decree', P(s)); } else log(`${nm(s)} quietly unearthed a jar of old coins. Nobody need know.`, 'story', P(s)); } },
          { label: 'Report it to the magistrate', hint: 'A modest reward and great honour', fn: () => { pay(s, n / 3); bump(s, 'honor', 22); log(`${nm(s)} dutifully reported a treasure jar to the magistrate and was rewarded for their honesty.`, 'decree', P(s)); } },
          { label: 'Share it with the poor of the village', hint: 'Generosity is remembered', fn: () => { pay(s, n / 5); bump(s, 'honor', 28); s.addMoodlet('le_generous', 'Generous heart', 16, 1440); for (const v of vill().sort(() => rand() - 0.5).slice(0, 8)) s.changeRel(v, 6); log(`${nm(s)} found buried coins and gave most to the poorest families. Rice bowls are full tonight.`, 'story', P(s)); } },
        ], s);
      } },
    { k: 'inherit', hh: (s) => notChild(s) ? goodW(s, 0.3) : 0, npc: () => 0.2,
      run(s, hh) {
        const n = ri(90, 260), who = pick(['great-uncle', 'distant cousin', 'mother’s elder brother', 'childless aunt']), city = pick(['Hanyang', 'Kaesong', 'Jeonju', 'Pyongyang']);
        if (!hh) { pay(s, n); return log(`A courier from ${city}: ${nm(s)}'s ${who} has died and left them ${n} nyang.`, 'story', P(s)); }
        ask('A letter from ' + city, `A dusty courier bows at the gate: ${gv(s)}'s ${who} in ${city} has died, leaving <b>${n} nyang</b> to the family.`, [
          { label: 'Accept the inheritance', fn: () => { pay(s, n); s.addMoodlet('le_inherit', 'Bittersweet inheritance', 8, 1440); log(`${nm(s)} inherited ${n} nyang from a ${who} in ${city}.`, 'story', P(s)); } },
          { label: 'Give it to the temple for prayers for the departed', hint: 'Great honour', fn: () => { bump(s, 'honor', 35); s.addMoodlet('le_pious', 'Honoured the dead', 14, 1440); try { G.factions?.notify(s, { type: 'donate', amount: n }); } catch { /* ignore */ } log(`${nm(s)} gave an entire inheritance of ${n} nyang to the temple. The monks chant for the departed ${who} for forty-nine days.`, 'story', P(s)); } },
        ], s);
      } },
    { k: 'find', hh: (s) => goodW(s, 0.5), npc: () => 0.3,
      run(s, hh) {
        const n = ri(6, 25), owner = pick(vill().filter((v) => v !== s));
        if (!hh) { pay(s, n); return chance(0.4) && log(`${nm(s)} found a silk purse on the road with ${n} nyang inside.`, 'story', P(s)); }
        ask('A purse on the road', `In the dust of the road lies an embroidered silk purse heavy with <b>${n} nyang</b>. ${owner ? `It carries the crest of the ${owner.name.surname} family.` : ''}`, [
          { label: 'Pocket it', fn: () => { pay(s, n); if (owner && chance(0.3)) { owner.changeRel(s, -15); bump(s, 'honor', -6); log(`${nm(owner)} saw ${nm(s)} with their lost purse. Words were exchanged.`, 'story', P(s)); } } },
          { label: 'Seek out the owner', disabled: !owner, fn: () => { s.changeRel(owner, 20); bump(s, 'honor', 10); const r = chance(0.5) ? Math.ceil(n / 3) : 0; pay(s, r); log(`${nm(s)} returned a lost purse to ${nm(owner)}${r ? `, who insisted on a reward of ${r} nyang` : ', who bowed deeply'}.`, 'story', P(s)); } },
        ], s);
      } },
    { k: 'thief', hh: (s) => (night() && s.home && !s.home.virtual && notChild(s) ? badW(s, 1.0) : 0), npc: (s) => (night() && s.home && !s.home.virtual ? 0.6 : 0),
      run(s, hh) {
        if (!hh) { const n = Math.floor(s.coins * rr(0.15, 0.3)); s.coins -= n; const caught = chance(0.3) && pick(G.sims.filter((p) => alive(p) && p.job === 'police')); return log(`Thieves crept into the ${s.name.surname} house in the night and made off with ${n} nyang of rice money.${caught ? ` Constable ${caught.name.given} caught one at the bridge.` : ''}`, 'danger', P(s)); }
        const fighter = HH().filter((x) => x.home === s.home && x.fighter).sort((a, b) => b.skills.sword - a.skills.sword)[0] || s;
        ask('Footsteps in the courtyard', `Deep in the night, ${gv(s)} hears the gate creak and the soft clink of the rice jars. A thief is in the house!`, [
          { label: `Confront the intruder (${gv(fighter)})`, hint: fighter.fighter ? 'Draw steel' : 'Brave but risky', fn: () => thiefFight(fighter) },
          { label: 'Shout for the constables', fn: () => { if (chance(0.55)) { log(`At ${nm(s)}'s cry, constables came running with torches. The thief was caught red-handed and dragged to the Podocheong.`, 'decree', P(s)); bump(s, 'honor', 4); } else { let lost = 0; for (const r of HH().filter((x) => x.home === s.home)) { const n = Math.floor(r.coins * 0.15); r.coins -= n; lost += n; } log(`The thief vaulted the wall before the constables arrived, taking ${lost} nyang with him.`, 'danger', P(s)); } } },
          { label: 'Stay hidden and let him take what he wants', fn: () => { let lost = 0; for (const r of HH().filter((x) => x.home === s.home)) { const n = Math.floor(r.coins * 0.25); r.coins -= n; lost += n; r.addMoodlet('le_robbed', 'Robbed in the night', -12, 1440); } log(`A thief stripped the ${s.name.surname} house of ${lost} nyang while the family hid under their quilts.`, 'danger', P(s)); } },
        ], s);
      } },
    { k: 'scam', hh: (s) => (!night() && s.coins >= 30 && notChild(s) ? 0.5 : 0), npc: (s) => (s.coins > 30 ? 0.3 : 0),
      run(s, hh) {
        if (!hh) { const n = Math.min(s.coins, ri(15, 35)); s.coins -= n; return log(`${nm(s)} paid ${n} nyang for a "hundred-year ginseng" that turned out to be a painted bellflower root.`, 'story', P(s)); }
        const buy = (price) => { pay(s, -price); if (chance(0.35 + (s.has('Cunning') ? 0.2 : 0) + luck(s) * 0.15)) { s.maxHp += 10; s.hp = s.maxHp; bump(s, 'energy', 100); s.addMoodlet('le_ginseng', 'Invigorated by wild ginseng', 20, 1440); log(`Against all odds, the merchant's ginseng was genuine! ${nm(s)} feels ten years younger.`, 'story', P(s)); } else { bump(s, 'honor', -5); s.addMoodlet('le_swindled', 'Swindled!', -15, 1440); log(`${nm(s)} bought a "hundred-year ginseng" for ${price} nyang. It was a bellflower root stained with tea. The merchant is long gone.`, 'story', P(s)); } };
        ask('A merchant from Hanyang', `A silk-robed merchant with a too-wide smile presses a gnarled root into ${gv(s)}'s hands: "Hundred-year wild ginseng (산삼) from Mount Baekdu! For you — only <b>40 nyang</b>."`, [
          { label: 'Buy it (40 nyang)', disabled: s.coins < 40, fn: () => buy(40) },
          { label: 'Haggle', hint: 'Charisma', fn: () => { s.skills.charisma = Math.min(10, s.skills.charisma + 0.2); if (chance(0.3 + s.skills.charisma * 0.07)) { if (s.coins >= 20) buy(20); } else { s.say('He stormed off, insulted!', 'talk'); } } },
          { label: 'Send him packing', fn: () => { if (s.has('Cunning')) bump(s, 'honor', 3); } },
        ], s);
      } },
    { k: 'admirer', hh: (s) => (single(s) ? (s.has('Romantic') ? 1.4 : 0.8) : 0), npc: (s) => (single(s) ? 0.5 : 0),
      run(s, hh) {
        const adm = pick(vill().filter((v) => v !== s && single(v) && v.sex !== s.sex)); if (!adm) return false;
        if (!hh) { s.changeRel(adm, 10, 25); return log(`Love letters pass between ${nm(adm)} and ${nm(s)}. The washerwomen at the well speak of nothing else.`, 'love', P(s)); }
        ask('A letter tucked in the gate', `Folded hanji, scented with plum blossom: <i>"${pick(['The moon over the pavilion is lonely without you.', 'I pass your gate each dawn only to hear you laugh.', 'Like the pine in winter, my heart does not change.'])}"</i> It is unsigned — yet the gossips say it is from <b>${esc(nm(adm))}</b>, the ${esc(adm.title.toLowerCase())}.`, [
          { label: `Seek out ${gv(adm)}`, fn: () => { s.changeRel(adm, 15, 30); if (!s.controlled) s.startAction({ type: 'interact', target: adm, kind: 'flirt', forced: true, label: `Meeting ${gv(adm)}` }); focus(adm.pos.x, adm.pos.z); } },
          { label: 'Write a poem back, anonymously', fn: () => { s.changeRel(adm, 6, 14); bump(s, 'fun', 15); s.addMoodlet('le_secret', 'A secret romance', 12, 1440); } },
          { label: 'Burn the letter', fn: () => { adm.addMoodlet('le_spurned', 'Letter unanswered', -10, 1440); } },
        ], s);
      } },
    { k: 'matchmaker', hh: (s) => (single(s) && !s.married ? 0.7 : 0), npc: (s) => (single(s) ? 0.4 : 0),
      run(s, hh) {
        const c = vill().filter((v) => v !== s && single(v) && v.sex !== s.sex && s.getRel(v).f > -20).sort((a, b) => (b.job === 'noble') - (a.job === 'noble') || rand() - 0.5)[0]; if (!c) return false;
        if (!hh) { G.director?.wedding(s, c); return log(`The matchmaker's work: ${nm(s)} and ${nm(c)} were wed by arrangement of their families. They had met only once.`, 'love', P(s)); }
        ask('The matchmaker calls', `Old Madam ${pick(['Kim', 'Pak', 'Choe', 'Han'])}, the village matchmaker (중매쟁이), arrives with dried persimmons: "${esc(nm(c))} — ${esc(c.traits.slice(0, 2).join(' and ').toLowerCase())}, a ${esc(c.title.toLowerCase())} — their saju birth-signs align with ${esc(gv(s))}'s like the Weaver Girl and the Cowherd!"`, [
          { label: 'Agree to the marriage', hint: `${gv(c)} joins your household`, fn: () => { G.director?.wedding(s, c); } },
          { label: 'Arrange a meeting first', fn: () => { s.changeRel(c, 20, 25); if (!s.controlled) s.startAction({ type: 'interact', target: c, kind: 'chat', forced: true, label: `Meeting ${gv(c)}` }); } },
          { label: 'Politely decline', fn: () => s.addMoodlet('le_free', 'Free to choose my own love', 4, 600) },
        ], s);
      } },
    { k: 'foundling', hh: (s) => (s.home && !s.home.virtual && notChild(s) && HH().length < 8 && G.aliveCount < G.popCap ? 0.3 : 0), npc: (s) => (s.home && !s.home.virtual && s.spouse && G.aliveCount < G.popCap ? 0.2 : 0),
      run(s, hh) {
        const sex = chance(0.5) ? 'm' : 'f';
        const adopt = () => { const h = s.home; const par = [s, s.spouse].filter(alive); const kid = G.spawn({ sex, age: 'child', job: 'child', home: h, surname: [s.name.surname, s.name.hangul[0]], household: !!s.household, x: h.door[0] + 0.6, z: h.door[1] + 0.6, parents: par, generation: (s.generation || 1) + 1, ageDays: 0, coins: 0 }); h.residents.push(kid); for (const p of par) { p.children.push(kid); p.getRel(kid).f = 70; kid.getRel(p).f = 70; p.getRel(kid).met = kid.getRel(p).met = true; } if (kid.household) { G.household.push(kid); G.ui?.refreshHousehold(); } return kid; };
        if (!hh) { const k = adopt(); return log(`A foundling was left at the ${s.name.surname} gate. They have taken in little ${gv(k)} as their own.`, 'love', P(s)); }
        ask('A basket at the gate', `At dawn, wrapped in a ragged quilt inside a willow basket, a baby ${sex === 'm' ? 'boy' : 'girl'} cries at the ${esc(s.name.surname)} family gate. A scrap of paper reads only: <i>"Forgive me."</i>`, [
          { label: 'Adopt the child', fn: () => { const k = adopt(); for (const x of HH()) x.addMoodlet('le_baby', 'A new little one', 18, 1440); log(`The ${s.name.surname} family adopted a foundling and named ${sex === 'm' ? 'him' : 'her'} ${k.name.given}.`, 'love', P(s)); } },
          { label: 'Carry the baby to the temple monks', fn: () => { bump(s, 'honor', 12); log(`${nm(s)} carried a foundling to the mountain temple, where the monks will raise it.`, 'story', P(s)); } },
        ], s);
      } },
    { k: 'kidnap', hh: (s) => (s.age === 'child' && !S.captive && (G.env.hour > 17 || G.env.hour < 5) ? badW(s, 0.35) : 0), npc: (s) => (s.age === 'child' ? 0.15 : 0),
      run(s, hh) {
        if (!hh) { const p = s.parents?.[0]; return log(`Bandits snatched ${nm(s)} on the forest road! ${chance(0.6) ? 'Constables rescued the child at dawn.' : `${p ? nm(p) : 'The family'} paid a ransom of ${ri(30, 70)} nyang.`}`, 'danger', P(s)); }
        const [bx, bz] = LAYOUT.banditCamp; const [cx, cz] = spot(bx, bz, 7);
        s.cancelAction(); s.queue = []; s.pos.set(cx, groundAt(cx, cz), cz);
        S.captive = { id: s.id, until: now() + 2880, policeAt: 0 };
        s.startAction({ type: 'event', phase: 'do', anim: 'kneel', dur: 1e6, label: 'Held captive by bandits', le: 'captive' });
        log(`${nm(s)} went to fetch water at dusk and never came home. An arrow in the gatepost bears a note: "100 nyang, or the child is ours."`, 'danger', P(s));
        ask('⛓ Taken by bandits!', `${gv(s)} has been carried off to the bandit camp in the western woods. The note demands <b>100 nyang</b> by the old pine.`, [
          { label: 'Pay the ransom (100 nyang)', disabled: hhCoins() < 100, fn: () => { if (!S.captive) return; let due = 100; for (const r of HH().sort((a, b) => b.coins - a.coins)) { const n = Math.min(due, r.coins); r.coins -= n; due -= n; } S.captive.ransomed = true; } },
          { label: 'Go and rescue them yourself', hint: 'Reach the child in the bandit camp', fn: () => { focus(bx, bz); toast(`Bring a fighter to the bandit camp and reach ${gv(s)} to free them.`); } },
          { label: 'Petition the Podocheong for help', hint: 'Constables may raid the camp — in time', fn: () => { if (S.captive) S.captive.policeAt = now() + 300; toast('The police chief promises to raid the woods at dawn…'); } },
        ], s);
      } },
    { k: 'hermit', hh: (s) => (notChild(s) ? goodW(s, 0.45) : 0), npc: () => 0.15,
      run(s, hh) {
        const go = (anim, txt) => { const [x, z] = LAYOUT.bamboo?.[0] || [-190, 150]; if (free(s) || (s.household && !s.controlled && !s.queue.length)) s.startAction({ type: 'event', dest: spot(x, z, 10), anim, dur: 90, label: 'Training with the hermit' }); log(`${nm(s)} spent days in the bamboo grove with a mountain hermit (도사), ${txt}.`, 'story', P(s)); };
        if (!hh) { const k = pick(['sword', 'scholarship', 'farming']); s.skills[k] = Math.min(10, s.skills[k] + 1); return log(`${nm(s)} returned from the mountains much improved in ${k} — they say a hermit taught them.`, 'story', P(s)); }
        ask('The hermit of the bamboo grove', `A white-bearded hermit (도사) with a gourd of wine appears from the mist: "I have watched you, ${esc(gv(s))}. One teaching remains in these old bones. Choose."`, [
          { label: 'The way of the sword (검법)', fn: () => { s.skills.sword = Math.min(10, s.skills.sword + 1.2); go('train', 'learning a sword form older than the dynasty'); } },
          { label: 'The Four Books and Three Classics', fn: () => { s.skills.scholarship = Math.min(10, s.skills.scholarship + 1.5); go('study', 'reciting the classics under the moon'); } },
          { label: 'Herb lore and the art of healing', hint: 'Resist illness, nurse others better', fn: () => { S.herbLore[s.id] = true; go('pray', 'learning which roots heal and which kill'); } },
          { label: 'Politely decline', fn: () => {} },
        ], s);
      } },
    { k: 'monk', hh: (s) => 0.5, npc: () => 0.25,
      run(s, hh) {
        const good = ['You will find fortune where the earth is turned.', 'A great honour waits for you before the moon is full.', 'Your descendants will wear the robes of ministers.'];
        const bad = ['I see smoke and ash in your house.', 'Beware a smiling stranger on the road.', 'A fever walks toward your gate.'];
        const fate = (v, txt) => { S.fate[s.id] = { v, until: now() + 2880 }; log(`A wandering monk read ${nm(s)}'s face and said: "${txt}"`, 'omen', P(s)); toast(`The monk says: "${txt}"`); };
        if (!hh) return log(`A wandering monk told ${nm(s)}: "${pick([...good, ...bad])}"`, 'omen', P(s));
        ask('A wandering monk', `A monk in a wide straw hat, his alms bowl empty, stops before ${esc(gv(s))} and studies their face (관상) for a long moment.`, [
          { label: 'Give alms (5 nyang)', disabled: s.coins < 5, fn: () => { pay(s, -5); bump(s, 'honor', 5); s.addMoodlet('le_blessed', 'Blessed by a monk', 10, 2880); fate(1, pick(good)); } },
          { label: 'Ask about your future', fn: () => (chance(0.5) ? fate(1, pick(good)) : fate(-1, pick(bad))) },
          { label: 'Wave him away', fn: () => { s.addMoodlet('le_cursed', 'An ominous prophecy', -8, 2880); fate(-1, pick(bad)); } },
        ], s);
      } },
    { k: 'dokkaebi', hh: (s) => (night() ? (notChild(s) ? 0.9 : 0.3) : 0), npc: () => (night() ? 0.35 : 0),
      run(s, hh) {
        V.wisps.push({ x: s.pos.x, z: s.pos.z, t: 45 });
        if (!hh) return log(pick([`${nm(s)} came home at dawn covered in mud, swearing a dokkaebi made them wrestle all night.`, `${nm(s)} tricked a dokkaebi with buckwheat jelly and woke up beside a pile of coins.`, `Blue dokkaebi-fire was seen dancing near ${nm(s)}'s field.`]), 'omen', P(s));
        ask('👹 Dokkaebi at the crossroads!', `Blue dokkaebi-fire (도깨비불) dances in the dark. A hulking one-horned goblin in a tiger-skin loincloth bars ${esc(gv(s))}'s way, twirling a spiked magic club (방망이): <i>"Hehe! Wrestle me, or make a wish, human!"</i>`, [
          { label: 'Wish for gold — "Geum nawara, ttukttak!"', hint: 'Dokkaebi gold is fickle', fn: () => { if (chance(0.5 + luck(s) * 0.15)) { const n = ri(80, 200); pay(s, n); log(`"Geum nawara, ttukttak!" — gold poured from the dokkaebi's club. ${nm(s)} is ${n} nyang richer!`, 'omen', P(s)); } else { pay(s, -15); bump(s, 'hygiene', -100); s.addMoodlet('le_tricked', 'Tricked by a dokkaebi', -10, 1440); log(`${nm(s)}'s dokkaebi gold turned to dry leaves at cock-crow — and somehow their purse is lighter, and they smell of the pigsty.`, 'omen', P(s)); } } },
          { label: 'Wrestle it — ssireum!', hint: 'Strength and courage', fn: () => { if (chance(0.35 + s.skills.sword * 0.04 + (s.has('Brave') ? 0.15 : 0))) { bump(s, 'honor', 25); pay(s, 40); s.addMoodlet('le_ssireum', 'Out-wrestled a dokkaebi!', 20, 2880); log(`${nm(s)} threw a dokkaebi in ssireum! Delighted, the goblin left a pouch of coins and vanished cackling.`, 'omen', P(s)); } else { s.hp = Math.max(5, s.hp - s.maxHp * 0.4); bump(s, 'energy', -40); log(`The dokkaebi dragged ${nm(s)} through the bramble thickets until dawn.`, 'omen', P(s)); } } },
          { label: 'Offer it buckwheat jelly (muk) and walk on', hint: 'Safe — dokkaebi love muk', fn: () => { S.fate[s.id] = { v: 1, until: now() + 1440 }; s.addMoodlet('le_muk', 'A friendly goblin', 5, 720); } },
        ], s);
      } },
    { k: 'gumiho', hh: (s) => (night() && notChild(s) && s.age !== 'elder' ? (s.has('Romantic') ? 0.7 : 0.35) : 0), npc: () => (night() ? 0.2 : 0),
      run(s, hh) {
        const fox = () => { try { G.animals?.spawn('fox', s.pos.x + rr(-6, 6), s.pos.z + rr(-6, 6), { range: 60 }); } catch { /* ignore */ } };
        if (!hh) { fox(); return log(`Woodcutters whisper of a nine-tailed fox (구미호) on the pass after ${nm(s)} was found at dawn, dazed and smiling, with no memory of the night.`, 'omen', P(s)); }
        const lover = s.sex === 'm' ? 'woman' : 'man';
        ask('A beautiful stranger', `On the moonlit road, a ${lover} of unearthly beauty in pale silk asks ${esc(gv(s))} to walk them over the mountain pass. Their eyes catch the lantern light… a little like a fox's.`, [
          { label: 'Escort them over the pass', hint: 'Romance… or a gumiho?', fn: () => { fox(); if (chance(0.35 - luck(s) * 0.1)) { if (s.has('Brave') || s.skills.sword > 5) { s.skills.scholarship = Math.min(10, s.skills.scholarship + 2); bump(s, 'honor', 20); log(`On the pass, nine tails unfurled from the stranger's skirts — a gumiho! ${nm(s)} fought it off and took its fox-bead (여우구슬), and with it, strange wisdom.`, 'omen', P(s)); } else { s.hp = Math.max(5, s.hp * 0.4); bump(s, 'energy', -60); s.addMoodlet('le_fox', 'Nearly eaten by a gumiho', -25, 2880); log(`A gumiho! ${nm(s)} fled down the mountain as nine white tails lashed the moonlight.`, 'danger', P(s)); } } else { s.addMoodlet('le_enchanted', 'An enchanted evening', 15, 1440); log(`${nm(s)} walked a mysterious stranger over the pass. At the crossroads they vanished, leaving only the scent of wild chrysanthemum.`, 'love', P(s)); } } },
          { label: 'Recite a Buddhist sutra', hint: 'Pious', fn: () => { fox(); if (s.has('Pious') || chance(0.4)) { bump(s, 'honor', 15); log(`As ${nm(s)} chanted the Heart Sutra, the stranger shrieked, sprouted nine tails and fled into the pines. A gumiho!`, 'omen', P(s)); } else log(`The stranger laughed at ${nm(s)}'s stammered sutra and melted into the dark.`, 'omen', P(s)); } },
          { label: 'Lend them a lantern and hurry home', fn: () => {} },
        ], s);
      } },
    { k: 'dream', hh: (s) => (G.env.hour > 4.5 && G.env.hour < 9 && notChild(s) ? 0.9 : 0), npc: () => 0,
      run(s) {
        const types = ['pig', 'teeth', 'ancestor']; if (s.spouse && alive(s.spouse) && ['young', 'adult'].includes(s.age) && !s.pregnant && !s.spouse.pregnant) types.push('taemong', 'taemong');
        const t = pick(types);
        if (t === 'pig') ask('A golden pig dream (돼지꿈)', `${esc(gv(s))} dreamt of a fat golden pig trotting into the house — the luckiest dream there is!`, [
          { label: 'Keep it secret — luck flows to the dreamer', fn: () => { S.fate[s.id] = { v: 1, until: now() + 1440 }; if (chance(0.5)) { const n = ri(20, 60); pay(s, n); log(`${nm(s)} dreamt of a pig — and that very afternoon a debtor repaid ${n} nyang long forgotten.`, 'omen', P(s)); } } },
          { label: 'Sell the dream to a friend (꿈을 팔다)', fn: () => { const f = pick(vill()); if (f) { pay(s, 10); s.changeRel(f, 10); S.fate[f.id] = { v: 1, until: now() + 1440 }; log(`${nm(s)} sold a lucky pig dream to ${nm(f)} for 10 nyang, as the old custom allows.`, 'omen', P(s)); } } },
        ], s);
        else if (t === 'teeth') ask('An ill dream', `${esc(gv(s))} woke in a cold sweat: in the dream, their teeth crumbled and fell out one by one. The elders say it means illness in the family.`, [
          { label: 'Buy a protective bujeok charm from the mudang (10)', disabled: s.coins < 10, fn: () => { pay(s, -10); S.fate[s.id] = { v: 1, until: now() + 2880 }; } },
          { label: 'It was only a dream', fn: () => { if (chance(0.5)) infect(pick(HH()), 'fever'); } },
        ], s);
        else if (t === 'ancestor') ask('A visit from the ancestors', `${esc(gv(s))}'s late grandfather appeared in a dream, frowning: the ancestral rites have been neglected.`, [
          { label: 'Hold a jesa ancestral rite (15 nyang)', disabled: s.coins < 15, fn: () => { pay(s, -15); for (const x of HH()) { bump(x, 'honor', 8); x.addMoodlet('le_jesa', 'Honoured the ancestors', 10, 1440); } log(`The ${s.name.surname} family laid out rice cakes, jujubes and chestnuts in a jesa for their ancestors.`, 'story', P(s)); } },
          { label: 'Ignore it', fn: () => s.addMoodlet('le_guilt', 'The ancestors are displeased', -8, 1440) },
        ], s);
        else ask('A conception dream (태몽)', `${esc(gv(s))} dreamt of a blue dragon coiling around the moon and dropping a pearl into their lap — a taemong, the dream that foretells a child!`, [
          { label: `Tell ${gv(s.spouse)} at once`, fn: () => { G.tryForBaby(s, s.spouse); G.tryForBaby(s, s.spouse); } },
          { label: 'Keep it to yourself', fn: () => s.addMoodlet('le_dream', 'A strange, lovely dream', 6, 720) },
        ], s);
      } },
    { k: 'injury', hh: (s) => badW(s, 0.3), npc: () => 0.4,
      run(s, hh) {
        s.hp = Math.max(5, s.hp - s.maxHp * 0.35); s.addMoodlet('le_hurt', 'Bruised and sore', -10, 1440); bump(s, 'energy', -20);
        const what = season() === 'winter' ? 'slipped on the frozen well stones' : pick(['was kicked by a temperamental ox', 'fell from a roof while mending tiles', 'twisted an ankle in a paddy ditch', 'was stung by a nest of hornets']);
        log(`${nm(s)} ${what}.`, hh ? 'danger' : 'story', P(s)); if (hh) toast(`${gv(s)} ${what}.`);
      } },
    { k: 'quarrel', hh: () => 0, npc: (s) => 0.6,
      run(s) {
        const o = pick(vill().filter((v) => v !== s && v.home && v.home !== s.home)); if (!o) return false;
        if (s.spouse && alive(s.spouse) && chance(0.25)) { s.spouse.changeRel(s, -20, -15); return log(`Scandal! ${nm(s)} was seen walking with ${nm(o)} by the river at midnight. ${nm(s.spouse)} has not spoken to them since.`, 'love', P(s)); }
        s.changeRel(o, -25); log(`${nm(s)} and ${nm(o)} are feuding over ${pick(['a boundary stone that moved in the night', 'a chicken that crossed the wall', 'an unpaid debt of rice', 'whose ox trampled the cabbages'])}.`, 'story', P(s));
        if (s.fighter && o.fighter && chance(0.35)) G.startDuel(s, o);
      } },
    { k: 'tiger', hh: () => 0, npc: () => (cdOk('w_tiger') ? 0.15 : 0),
      run(s) {
        cd('w_tiger', 2880); const a = rr(0, 6.28); const [x, z] = spot(Math.cos(a) * 140, Math.sin(a) * 140, 20);
        try { G.animals?.spawn('tiger', x, z, { home: [x, z], range: 70 }); } catch { return false; }
        log(`🐯 ${nm(s)} came running from the hills: a great tiger (호랑이) has been seen prowling near the village! Mothers call their children indoors.`, 'danger', { x, z });
        toast('A tiger prowls near the village!');
      } },
    { k: 'windfall', hh: (s) => (s.job === 'merchant' ? goodW(s, 0.5) : 0), npc: (s) => (s.job === 'merchant' ? 0.4 : 0),
      run(s, hh) { const n = ri(30, 90); pay(s, n); log(`A Qing trading caravan bought every bolt of silk from ${nm(s)}'s stall — ${n} nyang in a single morning!`, 'story', P(s)); if (hh) toast(`${gv(s)} made ${n} nyang from a Qing caravan!`); } },
  ];
  function personal(hh) {
    const pool = [];
    const cands = hh ? HH() : vill().sort(() => rand() - 0.5).slice(0, 8);
    for (const ev of PERSONAL) {
      if (!cdOk((hh ? 'hh_' : 'np_') + ev.k)) continue;
      for (const s of cands) { let w = 0; try { w = (hh ? ev.hh : ev.npc)(s) || 0; } catch { w = 0; } if (w > 0) pool.push({ ev, s, w }); }
    }
    if (!pool.length) return;
    const c = weightedPick(pool, (p) => p.w);
    let r; try { r = c.ev.run(c.s, hh); } catch (e) { console.error('[lifeevents] event', c.ev.k, e); }
    if (r !== false) cd((hh ? 'hh_' : 'np_') + c.ev.k, hh ? rr(2000, 4000) : rr(500, 1000));
  }
  function thiefFight(s) {
    const d = s.home?.door || [s.pos.x, s.pos.z];
    const t = G.spawn({ sex: 'm', age: 'young', job: 'bandit', faction: 'bandit', x: d[0] + 2, z: d[1] + 2, coins: ri(5, 20) });
    t.skills.sword = rr(1.5, 3.5); t.maxHp = t.hp = 80; t.leThief = true;
    if (s.controlled) return toast('A thief by your gate — deal with him!');
    if (s.fighter) { s.cancelAction(); s.startFight(t); t.startFight(s); s.say('Who goes there?! Draw!', 'shout'); }
    else if (chance(0.5 + (s.has('Brave') ? 0.2 : 0))) { s.say('THIEF! Get out of my house!', 'shout'); t.startAction({ type: 'goto', dest: LAYOUT.banditCamp, run: true, label: 'Fleeing' }); log(`${nm(s)} chased off a thief with a broom and a battle cry!`, 'story', P(s)); bump(s, 'honor', 8); }
    else { s.hp = Math.max(5, s.hp - s.maxHp * 0.3); const n = Math.floor(s.coins * 0.1); s.coins -= n; t.startAction({ type: 'goto', dest: LAYOUT.banditCamp, run: true, label: 'Fleeing with loot' }); log(`The thief knocked ${nm(s)} down and fled with ${n} nyang.`, 'danger', P(s)); }
  }

  // ================= REQUESTS =================
  function beacon(color = 0xffd76a) {
    const g = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m1.position.y = 8; g.add(m1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring); g.userData.ring = ring;
    G.scene.add(g); return g;
  }
  const reqTarget = (r) => {
    const giver = byId(r.giver);
    if (r.stage === 'return' || r.stage === 'meet' || r.stage === 'write' || r.stage === 'deliver') return giver ? [giver.pos.x, giver.pos.z] : null;
    if (r.type === 'dog') { const a = dogOf(r); return a ? [a.pos.x, a.pos.z] : r.target; }
    if (r.type === 'heirloom' && r.stage === 'hunt') { const c = byId(r.carrier); return c ? [c.pos.x, c.pos.z] : r.target; }
    if (r.type === 'escort') return [BRIDGE.b[0] + 6, BRIDGE.b[1]];
    if (r.type === 'duel') { const v = byId(r.rival); return v ? [v.pos.x, v.pos.z] : null; }
    return r.target;
  };
  const dogOf = (r) => (G.animals?.list || []).find((a) => a.id === r.dog && !a.dead) || null;
  const stageText = (r) => ({ open: 'Posted on the board', gather: `Find the ${r.herb} on the hillside`, return: `Return to ${gv(byId(r.giver))}`, find: 'Search for the dog', hunt: 'Hunt down the bandit carrying it', recover: 'Recover it from the bandit’s body', meet: `Meet ${gv(byId(r.giver))}`, walk: 'Escort them across the bridge — stay close!', write: `Write the letter (Scholarship 3+) — talk to ${gv(byId(r.giver))}`, duel: `Defeat ${gv(byId(r.rival))} in a duel`, deliver: `Bring rice to ${gv(byId(r.giver))}` }[r.stage] || r.stage);

  function postRequest() {
    const V0 = vill().filter((v) => v.home && v.age !== 'child' && !S.requests.some((r) => r.giver === v.id));
    if (!V0.length) return;
    const opts = {
      herbs: () => { const g = pick(V0); const sick = [...S.ill.keys()].map(byId).find((x) => alive(x) && x.home === g.home); return { giver: g, herb: pick(HERBS), text: `"${sick ? `My ${sick.sex === 'f' ? 'daughter' : 'son'} ${gv(sick)} burns with fever` : 'My old mother’s joints ache in the cold'} — please, gather ${pick(HERBS)} from the hillside for me."` }; },
      dog: () => { const g = pick(V0); return { giver: g, text: `"My Jindo dog Baekgu chased a hare into the hills two days ago and has not come back. He is white, with one brown ear…"` }; },
      heirloom: () => { const g = pick(V0.filter((v) => ['noble', 'merchant', 'scholar'].includes(v.job))) || pick(V0); return { giver: g, text: `"Bandits waylaid me on the western road and took my grandfather's ${pick(['celadon wine-pot', 'jade seal', 'ancestral portrait scroll', 'silver-inlaid sword'])}. One of them still carries it — please, bring it back."` }; },
      escort: () => { const g = pick(V0.filter((v) => v.job === 'merchant')); return g && { giver: g, text: '"I must carry my silks across the river bridge, but the roads crawl with bandits. Walk with me and I will pay you well."' }; },
      letter: () => { const g = pick(V0.filter((v) => single(v))); const c = g && pick(vill().filter((v) => v !== g && single(v) && v.sex !== g.sex)); return c && { giver: g, crush: c.id, text: `"I… I cannot write, and even if I could, I would not know the words. Will you write a poem for ${c.name.full} in my name?" (Requires Scholarship 3)` }; },
      duel: () => { const g = pick(V0.filter((v) => !v.fighter)); const rv = g && pick(vill().filter((v) => v.fighter && v !== g && !['police'].includes(v.job))); if (!rv) return null; g.changeRel(rv, -30); return { giver: g, rival: rv.id, text: `"${rv.name.full} insulted my family before the whole market. I am no swordsman — will someone defend our honour in a duel?"` }; },
      rice: () => { const g = pick(V0.filter((v) => (v.age === 'elder' && v.sex === 'f') || v.coins < 12)) || null; return g && { giver: g, text: `"${g.sex === 'f' ? 'Since my husband died' : 'Since the harvest failed'}, there is nothing in the rice jar. A single sack would see me through the month."` }; },
    };
    const types = Object.keys(opts).filter((t) => S.requests.filter((r) => r.type === t).length < 1);
    for (let tries = 0; tries < 4 && types.length; tries++) {
      const t = pick(types); let o = null; try { o = opts[t](); } catch { o = null; }
      if (!o || !o.giver) continue;
      const info = REQ_INFO[t];
      const r = { id: ++S.rid, type: t, giver: o.giver.id, text: o.text, herb: o.herb, crush: o.crush ?? null, rival: o.rival ?? null, reward: info.reward + ri(0, 10), honor: info.honor, stage: 'open', posted: now(), exp: now() + 2160, taker: null, target: null, dog: null, carrier: null };
      S.requests.push(r);
      log(`📜 ${nm(o.giver)} pinned a request to the notice board: ${info.title}.`, 'story', P(o.giver));
      toast(`📜 New village request: ${info.title}`);
      return;
    }
  }
  function acceptReq(r, who) {
    const t = alive(who) && who.household ? who : G.selected?.household && alive(G.selected) ? G.selected : HH().find(notChild);
    if (!t) return toast('No one in your household can take this on.');
    const giver = byId(r.giver); if (!alive(giver)) return toast('The one who asked is no longer with us.');
    r.taker = t.id; r.exp = now() + 2880;
    if (r.type === 'herbs') { r.stage = 'gather'; r.target = pick([[-95, -75], [75, -95], [-130, 10], [95, 150], [-150, -40], [60, -150], [-60, 120]].map(([x, z]) => spot(x, z, 12)).filter(([x, z]) => !isWater(x, z))) || spot(-100, -60, 20); }
    else if (r.type === 'dog') { r.stage = 'find'; const a = rr(0, 6.28); r.target = spot(Math.cos(a) * rr(100, 160), Math.sin(a) * rr(100, 160), 15); try { const d = G.animals.spawn('dog', r.target[0], r.target[1], { home: r.target, range: 4, variant: 0 }); r.dog = d.id; } catch { r.dog = null; } }
    else if (r.type === 'heirloom') { r.stage = 'hunt'; const [bx, bz] = LAYOUT.banditCamp; r.target = spot(bx * 0.45, bz * 0.45, 12); const c = G.spawn({ sex: 'm', age: 'young', job: 'bandit', faction: 'bandit', x: r.target[0], z: r.target[1] }); c.leCarrier = r.id; r.carrier = c.id; c.startAction({ type: 'event', dest: r.target, anim: 'idle', dur: 240, label: 'Admiring stolen loot' }); }
    else if (r.type === 'escort') { r.stage = 'meet'; r.startD = Math.hypot(giver.pos.x - BRIDGE.b[0], giver.pos.z - BRIDGE.b[1]); }
    else if (r.type === 'letter') r.stage = 'write';
    else if (r.type === 'duel') r.stage = 'duel';
    else if (r.type === 'rice') r.stage = 'deliver';
    log(`${nm(t)} took up ${nm(giver)}'s request: ${REQ_INFO[r.type].title}.`, 'story', P(t));
    const tg = reqTarget(r); if (tg) { try { G.ui.marker(tg); } catch { /* ignore */ } }
    toast(`${REQ_INFO[r.type].icon} ${stageText(r)}`);
  }
  function finishReq(r, s, ok, why) {
    r.stage = ok ? 'done' : 'failed';
    const b = V.beacons.get(r.id); if (b) { disposeObj(b); V.beacons.delete(r.id); }
    const giver = byId(r.giver);
    if (ok && alive(s)) {
      pay(s, r.reward); bump(s, 'honor', r.honor); s.addMoodlet('le_helped', 'Helped a neighbour', 15, 720);
      if (giver) { s.changeRel(giver, 25); giver.addMoodlet('le_helped2', 'A neighbour helped me', 15, 1440); giver.say(pick(['Thank you, thank you!', 'May Heaven bless your house!', 'I will never forget this.']), 'happy'); }
      log(`${REQ_INFO[r.type].icon} ${nm(s)} ${why || 'fulfilled the request of ' + nm(giver)}. Reward: ${r.reward} nyang.`, 'story', P(s));
      toast(`Request complete: +${r.reward} nyang, honour gained.`);
    } else if (!ok && why) { log(`${REQ_INFO[r.type].icon} ${why}`, 'story'); if (giver && s) giver.changeRel(s, -10); }
    S.requests = S.requests.filter((x) => x !== r);
  }
  function nearHH(x, z, d) { return HH().find((s) => !s.hidden && dist(s, x, z) < d) || null; }
  function reqTick() {
    for (const r of [...S.requests]) {
      const giver = byId(r.giver);
      if (r.stage === 'open') { if (now() > r.exp || !alive(giver)) S.requests = S.requests.filter((x) => x !== r); continue; }
      const taker = byId(r.taker);
      if (!alive(giver)) { finishReq(r, taker, false, `The request lapses — ${giver ? nm(giver) : 'the one who asked'} is gone.`); continue; }
      if (now() > r.exp) { finishReq(r, taker, false, `${nm(giver)} gave up waiting for help with "${REQ_INFO[r.type].title}".`); continue; }
      let b = V.beacons.get(r.id); if (!b) { b = beacon(); V.beacons.set(r.id, b); }
      const tg = reqTarget(r); if (tg) { b.visible = true; b.position.set(tg[0], groundAt(tg[0], tg[1]), tg[1]); } else b.visible = false;
      if (r.type === 'herbs') {
        if (r.stage === 'gather') { const s = nearHH(r.target[0], r.target[1], 4); if (s) { r.stage = 'return'; s.say(`Found the ${r.herb}!`, 'happy'); toast(`Herbs gathered — return to ${gv(giver)}.`); } }
        else { const s = nearHH(giver.pos.x, giver.pos.z, 3.5); if (s) finishReq(r, s, true, `gathered ${r.herb} for ${nm(giver)}`); }
      } else if (r.type === 'dog') {
        let d = dogOf(r);
        if (!d) { try { d = G.animals.spawn('dog', r.target[0], r.target[1], { home: r.target, range: 4, variant: 0 }); r.dog = d.id; } catch { /* ignore */ } }
        const s = d && nearHH(d.pos.x, d.pos.z, 4.5);
        if (s) { d.home = giver.home?.door ? [...giver.home.door] : [giver.pos.x, giver.pos.z]; d.range = 10; finishReq(r, s, true, `found ${nm(giver)}'s lost Jindo dog in the hills; it bounded home barking with joy`); }
      } else if (r.type === 'heirloom') {
        const c = byId(r.carrier);
        if (r.stage === 'hunt') { if (c && !c.dead) r.target = [c.pos.x, c.pos.z]; else { r.stage = 'recover'; toast('The bandit is down — recover the heirloom.'); } }
        else if (r.stage === 'recover') { if (nearHH(r.target[0], r.target[1], 4.5)) { r.stage = 'return'; toast(`Heirloom recovered — return it to ${gv(giver)}.`); } }
        else { const s = nearHH(giver.pos.x, giver.pos.z, 3.5); if (s) finishReq(r, s, true, `recovered ${nm(giver)}'s stolen heirloom from the bandits`); }
      } else if (r.type === 'escort') {
        const dst = [BRIDGE.b[0] + 6, BRIDGE.b[1]];
        if (r.stage === 'meet') { if (nearHH(giver.pos.x, giver.pos.z, 5)) { r.stage = 'walk'; giver.say('Let us go — keep your blade ready.', 'talk'); } }
        else {
          if (dist(giver, dst[0], dst[1]) < 8) { finishReq(r, nearHH(giver.pos.x, giver.pos.z, 30) || taker, true, `escorted ${nm(giver)} and their silks safely across the river bridge`); continue; }
          if (['flee', 'hide', 'fight'].includes(giver.action?.type) || giver.combat?.target) continue;
          const guard = nearHH(giver.pos.x, giver.pos.z, 16);
          if (!guard) { if (giver.action?.le !== 'escWait') { giver.cancelAction(); giver.startAction({ type: 'event', dest: [giver.pos.x, giver.pos.z], anim: 'idle', dur: 1e6, label: 'Waiting for an escort', le: 'escWait' }); giver.say('Wait! Do not leave me alone on this road!', 'shout'); } }
          else if (giver.action?.le !== 'escGo') { giver.cancelAction(); giver.startAction({ type: 'goto', dest: dst, label: 'Travelling under escort', le: 'escGo' }); }
          if (!r.ambushed && dist(giver, dst[0], dst[1]) < (r.startD || 100) * 0.55) {
            r.ambushed = true;
            for (let i = 0; i < 2; i++) { const [x, z] = spot(giver.pos.x + rr(-12, 12), giver.pos.z + rr(-12, 12), 4); const b2 = G.spawn({ sex: 'm', age: 'young', job: 'bandit', faction: 'bandit', x, z }); b2.skills.sword = rr(2, 4.5); b2.startFight(giver); }
            log(`Ambush! Bandits burst from the reeds to waylay ${nm(giver)}'s silk cart!`, 'danger', P(giver)); try { G.audio?.ctx && G.audio.alarm(); } catch { /* ignore */ }
          }
        }
      } else if (r.type === 'duel') { const rv = byId(r.rival); if (!alive(rv)) finishReq(r, taker, false, `${nm(giver)}'s quarrel ended without a duel — ${rv ? nm(rv) : 'the rival'} is gone.`); }
    }
  }
  function openBoard() {
    if (!G.ui?.modal) return;
    const rows = S.requests.map((r) => {
      const I = REQ_INFO[r.type]; const g = byId(r.giver); const t = byId(r.taker);
      return `<div style="border-left:3px solid #c9a45c;padding:6px 10px;margin:8px 0;background:rgba(0,0,0,.12)"><b>${I.icon} ${I.title}</b> <small>— ${esc(nm(g))}${g ? ', ' + esc(g.title.toLowerCase()) : ''}</small><br><i>${esc(r.text)}</i><br><small>Reward: ${r.reward} nyang + honour · ${r.stage === 'open' ? `expires in ${Math.max(1, Math.round((r.exp - now()) / 60))}h` : `<b>${esc(nm(t))}</b>: ${esc(stageText(r))}`}</small><div>${r.stage === 'open' ? `<button data-acc="${r.id}" style="${BTN};width:auto;display:inline-block">Accept</button>` : `<button data-show="${r.id}" style="${BTN};width:auto;display:inline-block">Show on map</button> <button data-drop="${r.id}" style="${BTN};width:auto;display:inline-block">Abandon</button>`}</div></div>`;
    }).join('');
    const el = G.ui.modal(`<h2>📜 Village Requests · 방(榜)</h2><p style="opacity:.8">Notices pinned to the board at the plaza. Help your neighbours for coin, honour and friendship.</p>${rows || '<p><i>The board is bare today. Check back later.</i></p>'}`);
    el.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => { const r = S.requests.find((x) => x.id === +b.dataset.acc); if (r) acceptReq(r); openBoard(); }));
    el.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => { const r = S.requests.find((x) => x.id === +b.dataset.show); const tg = r && reqTarget(r); if (tg) { focus(tg[0], tg[1]); try { G.ui.marker(tg); } catch { /* ignore */ } } el.classList.add('hidden'); }));
    el.querySelectorAll('[data-drop]').forEach((b) => (b.onclick = () => { const r = S.requests.find((x) => x.id === +b.dataset.drop); if (r) finishReq(r, byId(r.taker), false, `${nm(byId(r.taker))} abandoned ${nm(byId(r.giver))}'s request.`); openBoard(); }));
  }

  // ================= WORLD EVENTS (storyteller) =================
  function world(key, w, run) {
    G.director?.registerEvent?.('le_' + key, {
      weight: (g, h, day) => { try { return w(h, day) || 0; } catch { return 0; } },
      run: () => { S.lastWorld[key] = G.env.day; try { run(); } catch (e) { console.error('[lifeevents] world', key, e); } if (!G.director.active) G.director.cool = rr(90, 200); },
    });
  }
  const gatherAt = (pos, r, anims, label, p = 0.5, filter = null) => (s) => {
    if (s.faction !== 'village' || s.hidden || chance(1 - p) || (filter && !filter(s))) return false;
    const a = rr(0, 6.28), d = rr(r * 0.4, r);
    s.startAction({ type: 'event', dest: spot(pos[0] + Math.cos(a) * d, pos[1] + Math.sin(a) * d, 3), anim: pick(anims), dur: rr(40, 90), look: pos, label }); return true;
  };
  function registerWorld() {
    const S2 = season;
    world('epidemic', () => (since('epidemic') >= 4 ? ({ winter: 0.5, summer: 0.4 }[S2()] || 0.08) : 0), () => {
      const kind = S2() === 'winter' ? (chance(0.35) ? 'pox' : 'cough') : S2() === 'summer' ? 'flux' : 'fever'; const D = DIS[kind];
      S.epidemic = now() + 2160;
      const pool = vill().sort(() => rand() - 0.5); let n = 0; for (const s of pool) { if (n >= ri(3, 5)) break; if (infect(s, kind, true)) n++; }
      if (chance(0.3)) infect(pick(HH()), kind);
      ensureRoles(); const doc = byId(S.healerId);
      log(`☠ ${D.name} (${D.ko}) spreads through Haeryeong! ${kind === 'pox' ? 'Families hang straw taboo-ropes (금줄) across their gates and lay out offerings for the smallpox spirit, the "honoured guest".' : 'Coughing echoes from house after house.'}${doc ? ` The physician ${nm(doc)} goes door to door.` : ''}`, 'danger', { x: 0, z: 0 });
      G.director.start({ kind: 'epidemic', title: `Epidemic: ${D.name}`, ko: '역병', pos: [0, 0], max: 360,
        assign: (s) => { if (S.ill.has(s.id)) { restAction(s, D); return true; } return false; },
        end: () => log(`The worst of the ${D.name.toLowerCase()} has passed. ${S.ill.size ? S.ill.size + ' still lie abed.' : 'The village breathes again.'}`, 'story') });
    });
    world('fire', () => (since('fire') >= 2 && (G.env.rain || 0) < 0.3 ? ({ winter: 0.4, autumn: 0.35 }[S2()] || 0.22) * (G.env.weather === 'windy' ? 1.6 : 1) : 0), () => {
      const hs = G.world.houses.filter((h) => h.residents.some(alive)); if (hs.length) startFire(pick(hs), 'accident');
    });
    world('storm', () => (since('storm') >= 2 && S2() !== 'winter' ? (S2() === 'summer' ? 0.5 : 0.3) : 0), () => {
      G.env.setWeather('rain'); V.storm = { next: rr(3, 8), n: 0 };
      log(pick(['Black clouds pile above the peaks. Thunder rolls down the valley like the drums of the Thunder God.', 'A summer thunderstorm breaks over Haeryeong! The shamans say the Dragon King is angry.']), 'omen');
      G.director.start({ kind: 'storm', title: 'Thunderstorm', ko: '뇌우', pos: [0, 0], max: rr(90, 160),
        update: (gm) => { const st = V.storm; if (!st) return; st.next -= gm; if (st.next <= 0) { st.next = rr(4, 14); st.n++; strike(); } },
        end: () => { V.storm = null; G.env.setWeather('cloudy'); log('The storm rumbles away eastward over the sea.', 'omen'); } });
    });
    world('flood', () => (S2() === 'summer' && since('flood') >= 4 ? (G.env.weather === 'rain' ? 0.8 : 0.3) : 0), () => {
      G.env.setWeather('rain'); const P0 = LAYOUT.paddies;
      let mn = 1e9; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) mn = Math.min(mn, heightAt(P0.x0 + (P0.x1 - P0.x0) * i / 6, P0.z0 + (P0.z1 - P0.z0) * j / 6));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(P0.x1 - P0.x0 + 30, P0.z1 - P0.z0 + 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5b6a55, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.1 }));
      mesh.position.set((P0.x0 + P0.x1) / 2, mn - 0.3, (P0.z0 + P0.z1) / 2); G.scene.add(mesh);
      const cap = KINDS.field?.cap; if (KINDS.field) KINDS.field.cap = 0;
      V.flood = { mesh, base: mn, t: 0, cap };
      for (const o of G.world.objects) if (o.kind === 'field') for (const u of [...o.users]) { u.cancelAction(); if (!u.controlled) { u.startAction({ type: 'flee', dest: u.home?.door || [0, 0], label: 'Fleeing the flood!' }); u.say('The river! The river is over its banks!', 'shout'); } }
      S.crop *= 0.5;
      log('🌊 The monsoon river bursts its banks! Brown water pours across the rice paddies, drowning half the season’s crop.', 'danger', { x: mesh.position.x, z: mesh.position.z });
      for (const s of G.sims) if (alive(s) && s.job === 'farmer') s.addMoodlet('le_flood', 'The paddies are flooded', -15, 2880);
      G.director.start({ kind: 'flood', title: 'Monsoon Flood', ko: '홍수', pos: [mesh.position.x, mesh.position.z], max: 260,
        update: (gm) => { const f = V.flood; if (!f) return; f.t += gm; const lv = f.t < 80 ? f.t / 80 : f.t > 200 ? Math.max(0, 1 - (f.t - 200) / 60) : 1; f.mesh.position.y = f.base - 0.3 + lv * 1.3; },
        end: () => { const f = V.flood; if (f) { disposeObj(f.mesh); if (KINDS.field) KINDS.field.cap = f.cap ?? 1; } V.flood = null; log('The flood waters recede, leaving silt and drowned seedlings. The farmers wade out to replant what they can.', 'story'); } });
    });
    world('drought', () => (S2() === 'summer' && since('drought') >= 5 && !S.drought ? 0.25 : 0), () => {
      S.drought = now() + 2880; G.env.setWeather('clear'); S.crop *= 0.7;
      try { if (G.economy?.prices?.rice) G.economy.prices.rice = Math.round(G.economy.prices.rice * 1.4); } catch { /* ignore */ }
      log('☀ No rain for weeks. The paddies crack like old pottery and the price of rice climbs. The elders call for a rain ritual (기우제) beneath the guardian tree.', 'danger');
      const king = alive(G.king) ? G.king : null;
      G.director.start({ kind: 'kiuje', title: 'Rain Ritual', ko: '기우제', pos: [0, 0], max: 160,
        assign: gatherAt([0, 0], 16, ['pray', 'pray', 'kneel', 'bow'], 'Praying for rain', 0.55),
        update: () => { if (chance(0.03)) drum({ x: 0, z: 0 }, 0.4); },
        end: () => { if (chance(0.55)) { S.drought = 0; G.env.setWeather('rain'); log(`Heaven hears! ${king ? 'His Majesty ' + king.name.given + "'s" : 'The village’s'} prayers are answered — fat drops of rain drum on the tiles and the children dance in the mud.`, 'festival'); for (const s of G.sims) if (alive(s) && s.faction === 'village') s.addMoodlet('le_rain', 'Rain at last!', 12, 1440); } else log('The rain ritual ends under a pitiless sky. The drought goes on.', 'omen'); } });
    });
    world('locusts', () => (['summer', 'autumn'].includes(S2()) && since('locusts') >= 5 ? 0.22 : 0), () => {
      const P0 = LAYOUT.paddies; const c = [(P0.x0 + P0.x1) / 2, (P0.z0 + P0.z1) / 2]; V.swarm = { c, t: 0, helpers: 0 };
      log('🦗 A whirring brown cloud darkens the sky — LOCUSTS! They descend on the paddies. Farmers run out with brooms, drums and smoking torches.', 'danger', { x: c[0], z: c[1] });
      G.director.start({ kind: 'locusts', title: 'Locust Swarm', ko: '메뚜기 떼', pos: c, max: 150,
        assign: (s) => { const ok = gatherAt(c, 45, ['throw', 'throw', 'farm', 'angry'], 'Beating back the locusts', 0.6, (x) => x.age !== 'child' && dist(x, c[0], c[1]) < 160)(s); if (ok && V.swarm) V.swarm.helpers++; return ok; },
        end: () => { const h = V.swarm?.helpers || 0; V.swarm = null; const loss = clamp(0.4 - h * 0.025, 0.1, 0.4); S.crop *= 1 - loss; log(`The locusts move on to the next valley. ${h > 10 ? 'Thanks to the whole village turning out, most of the rice was saved.' : 'Whole terraces of rice are stripped bare.'}`, 'story'); } });
    });
    world('harvest', () => (S2() === 'autumn' && since('harvest') >= 4 && G.env.hour > 8 && G.env.hour < 15 ? 0.6 : 0), () => {
      const good = S.crop >= 0.75; const P0 = LAYOUT.paddies; const c = [(P0.x0 + P0.x1) / 2, (P0.z0 + P0.z1) / 2];
      for (const s of G.sims) if (alive(s) && s.job === 'farmer') { pay(s, Math.round(rr(15, 35) * S.crop * (good ? 1.4 : 1))); s.addMoodlet('le_harvest', good ? 'A bumper harvest!' : 'A meagre harvest', good ? 15 : -10, 1440); }
      try { if (G.economy?.prices?.rice) G.economy.prices.rice = Math.max(3, Math.round(G.economy.prices.rice * (good ? 0.8 : 1.3))); } catch { /* ignore */ }
      log(good ? '🌾 A bumper harvest! Golden sheaves stand in rows across the paddies and the granaries overflow. Farmers sing the harvest song as they thresh.' : '🌾 The harvest comes in thin and grey after a hard year. Families count every grain.', good ? 'festival' : 'story', { x: c[0], z: c[1] });
      S.crop = 1;
      G.director.start({ kind: 'harvest', title: good ? 'Bumper Harvest' : 'Thin Harvest', ko: '추수', pos: c, max: 140, assign: gatherAt(c, 50, ['farm', 'farm', 'carry', 'cheer'], 'Bringing in the harvest', 0.5, (x) => x.age !== 'elder') });
    });
    world('eclipse', () => (G.env.hour > 9.5 && G.env.hour < 14.5 && since('eclipse') >= 6 ? 0.12 : 0), () => {
      ensureEclipseMeshes(); G.scene.add(V.dome); G.scene.add(V.corona); V.eclipse = { t: 0, dur: 80, k: 0 };
      log('🌑 The sun is being devoured! Darkness at midday — the Bulgae, fire-dogs of the dark kingdom, have sunk their teeth into the sun. Villagers bang pots and gongs to drive them off!', 'omen');
      G.director.start({ kind: 'eclipse', title: 'Solar Eclipse', ko: '일식', pos: [0, 0], max: 90,
        assign: gatherAt([0, 0], 30, ['pray', 'kneel', 'throw', 'cheer'], 'Banging pots to drive off the fire-dogs', 0.6),
        update: (gm) => { const e = V.eclipse; if (!e) return; e.t += gm; e.k = Math.pow(clamp(Math.sin(Math.PI * clamp(e.t / e.dur, 0, 1)), 0, 1), 0.6); if (chance(0.05)) drum(null, 0.3); },
        end: () => { V.eclipse = null; V.dome?.parent?.remove(V.dome); V.corona?.parent?.remove(V.corona); log('The fire-dogs let go — the sun returns, whole and blazing.', 'omen'); const k = G.king; if (alive(k)) { k.addMoodlet('le_omen', 'Ill omen in the heavens', -10, 1440); if (chance(0.4)) { log(`King ${k.name.given} fasts for three days and pardons prisoners to appease Heaven.`, 'decree'); for (const s of G.sims) if (s.jailed) try { G.economy.release(s, false); } catch { /* ignore */ } } } } });
    });
    world('comet', () => ((G.env.hour > 20 || G.env.hour < 3) && since('comet') >= 5 ? 0.2 : 0), () => {
      V.comet = buildComet();
      log('☄ A broom-star (혜성) sweeps across the night sky, its tail like spilled silver. The court astronomers of the Gwansanggam argue all night over what it portends.', 'omen');
      G.director.start({ kind: 'comet', title: 'A Broom Star', ko: '혜성', pos: [0, 0], max: 200,
        assign: gatherAt([0, 0], 25, ['idle', 'pray', 'talk'], 'Watching the comet', 0.35),
        end: () => { if (V.comet) disposeObj(V.comet.g); V.comet = null; const good = chance(0.5); log(good ? 'The astronomers declare the broom-star an auspicious sign: a sweeping-away of old misfortunes.' : 'The astronomers whisper that a broom-star foretells the fall of the mighty. Nobles sleep badly.', 'omen'); for (const s of G.sims) if (alive(s) && s.faction === 'village') s.addMoodlet('le_comet', good ? 'Auspicious heavens' : 'Uneasy heavens', good ? 6 : -5, 1440); } });
    });
    world('gwishin', () => ((G.env.hour > 21 || G.env.hour < 2.5) && since('gwishin') >= 2 && !V.ghost ? 0.5 : 0), () => {
      const spots = [[-46, -52], [-38, 52], [62, -20], [-150, 86]]; const sp = pick(spots); const [x, z] = spot(sp[0] + 4, sp[1] + 4, 4);
      V.ghost = buildGhost(x, z); const where = sp[0] === -150 ? 'the old seonangdang shrine' : 'the old well';
      log(`👻 A white-robed maiden with long unbound hair drifts by ${where}, weeping. A gwishin (귀신)! Villagers bar their doors.`, 'omen', { x, z });
      const p = richest(); const hero = (G.selected?.household && alive(G.selected) && notChild(G.selected)) ? G.selected : HH().find(notChild);
      ask('👻 A gwishin walks!', `A ghost maiden in white mourning robes has been seen at ${where}, her face hidden by long black hair. Children cry, dogs howl, and no one will draw water there tonight.`, [
        { label: 'Pay the mudang 30 nyang to perform a gut', hint: 'Exorcism with drums and bells', disabled: !p || p.coins < 30 || !alive(byId(S.mudangId)), fn: () => { pay(p, -30); performGut([x, z], 'ghost', (ok) => { if (ok && V.ghost) { banishGhost('gut'); bump(p, 'honor', 12); for (const v of vill().slice(0, 10)) v.changeRel(p, 4); } }); } },
        { label: `Go and face her (${gv(hero)})`, hint: 'Courage and piety help', disabled: !hero, fn: () => { if (hero.controlled) return toast('Walk up to the ghost to face her.'); hero.cancelAction(); hero.queue = []; hero.startAction({ type: 'goto', dest: [V.ghost?.x ?? x, V.ghost?.z ?? z], run: true, label: 'Facing the gwishin', le: 'face', then: () => faceGhost(hero) }); } },
        { label: 'Bar the doors and wait for dawn', fn: () => { for (const s of HH()) s.addMoodlet('le_uneasy', 'A ghost haunts the village', -5, 600); } },
      ]);
      G.director.start({ kind: 'gwishin', title: 'A Gwishin Walks', ko: '귀신', pos: [x, z], max: 480,
        update: () => { const gh = V.ghost; if (!gh || gh.leaving) { endBanner('gwishin'); return; } if (G.env.hour > 5 && G.env.hour < 12) banishGhost('dawn'); else if (gh.age > (gh.gutAt ||= rr(70, 140)) && !V.rituals.length && alive(byId(S.mudangId))) { log('The village elders, sleepless, summon the mudang to drive out the gwishin.', 'omen'); performGut([gh.x, gh.z], 'ghost', (ok) => ok && banishGhost('gut')); } },
        end: () => { if (V.ghost && !V.ghost.leaving) banishGhost('dawn'); } });
    });
  }
  function faceGhost(s) {
    const gh = V.ghost; if (!gh || gh.leaving || !alive(s)) return;
    if (dist(s, gh.x, gh.z) > 9) return toast('The ghost has drifted away… get closer.');
    s.faceTowards?.(gh.x, gh.z, 1, 10);
    if (chance(0.3 + (s.has('Brave') ? 0.2 : 0) + (s.has('Pious') ? 0.25 : 0) + s.skills.scholarship * 0.03)) { bump(s, 'honor', 22); s.addMoodlet('le_ghostpeace', 'Gave a ghost peace', 20, 2880); s.say('Rest now. I will see you honoured.', 'talk'); banishGhost('peace', s); }
    else { s.hp = Math.max(5, s.hp * 0.7); bump(s, 'energy', -50); s.addMoodlet('le_ghost', 'Terrified by a gwishin', -25, 1440); s.say('AAAAH!', 'shout'); log(`${nm(s)} met the gwishin face to face — she lifted her hair, and ${nm(s)} fainted dead away.`, 'omen', P(s)); if (chance(0.5)) infect(s, 'fever'); if (!s.controlled) s.startAction({ type: 'flee', dest: s.home?.door || [0, 0], label: 'Fleeing!' }); }
  }

  // ================= ROLES & WORLD OBJECTS =================
  function ensureRoles() {
    let doc = byId(S.healerId);
    if (!alive(doc)) { const c = vill().filter((v) => ['scholar', 'monk'].includes(v.job) && v.age !== 'child').sort((a, b) => (b.age === 'elder') - (a.age === 'elder'))[0] || vill().find((v) => v.age === 'elder'); if (c) { const had = S.healerId != null; S.healerId = c.id; c.leRole = 'physician'; if (had) log(`${nm(c)}, who studied the Dongui Bogam, now tends the sick as village physician (의원).`, 'story', P(c)); } }
    else doc.leRole = 'physician';
    let mud = byId(S.mudangId);
    if (!alive(mud)) { const c = vill().filter((v) => v.sex === 'f' && ['adult', 'elder'].includes(v.age) && v.id !== S.healerId).sort((a, b) => b.has('Pious') - a.has('Pious'))[0]; if (c) { const had = S.mudangId != null; S.mudangId = c.id; c.leRole = 'mudang'; if (had) log(`The spirits have chosen ${nm(c)} as Haeryeong's new mudang (무당). She danced in a trance for three days.`, 'omen', P(c)); } }
    else mud.leRole = 'mudang';
  }
  function placeObjects() {
    if (!KINDS.noticeBoard) KINDS.noticeBoard = { label: 'Read the Notice Board', ko: '방', adv: {}, dur: [4, 8], anim: 'idle', cap: 3, menuOnly: true };
    if (!KINDS.herbalist) KINDS.herbalist = { label: 'Buy Herbal Medicine', ko: '약방', adv: {}, dur: [8, 14], anim: 'talk', cap: 2, cost: 8, menuOnly: true };
    const mk = (kind, x0, z0, title, sub, build) => {
      const [x, z] = spot(x0, z0, 8); const o = G.addObject(kind, x, z, { title, sub, prop: kind === 'herbalist' ? 'bowl' : 'book', look: [x, z] });
      try { const g = build(); g.position.set(x, groundAt(x, z), z); g.rotation.y = Math.atan2(-x, -z); G.scene.add(g); o.leMesh = g; } catch (e) { console.error(e); }
      return o;
    };
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.9 }), paper = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 1 }), roof = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.7 });
    for (const m of [wood, paper, roof]) m.userData.keep = true;
    const box = (g, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    V.objs.board = mk('noticeBoard', 14, 20, 'Village Notice Board', 'Requests from your neighbours', () => {
      const g = new THREE.Group(); for (const sx of [-0.9, 0.9]) box(g, 0.12, 2.2, 0.12, wood, sx, 1.1, 0); box(g, 2, 1.1, 0.08, wood, 0, 1.5, 0);
      for (let i = 0; i < 5; i++) box(g, 0.32, 0.42, 0.01, paper, -0.7 + i * 0.35 + rr(-0.03, 0.03), 1.5 + rr(-0.2, 0.2), 0.05);
      box(g, 2.4, 0.08, 0.6, roof, 0, 2.25, 0); return g;
    });
    V.objs.herb = mk('herbalist', -14, 70, 'Herbalist’s Stall (약방)', 'Herbal medicine for the sick — 8 nyang', () => {
      const g = new THREE.Group(); for (const sx of [-1, 1]) for (const sz of [-0.6, 0.6]) box(g, 0.1, 2, 0.1, wood, sx, 1, sz);
      box(g, 2.2, 0.08, 1.4, roof, 0, 2.05, 0); box(g, 2, 0.8, 1, wood, 0, 0.4, 0);
      const herbM = new THREE.MeshStandardMaterial({ color: 0x6f7a3a, roughness: 1 }); for (let i = 0; i < 6; i++) box(g, 0.12, 0.35, 0.12, herbM, -0.8 + i * 0.32, 1.7, 0.55);
      for (let i = 0; i < 4; i++) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a2c1e, roughness: 0.4 })); j.position.set(-0.6 + i * 0.4, 0.95, 0); g.add(j); }
      return g;
    });
    V.wells = [...new Map(G.world.objects.filter((o) => o.kind === 'well').map((o) => { const c = o.look || [o.x, o.z]; return [c.join(','), c]; })).values()];
  }

  // ================= SYSTEM =================
  function fastTick() {
    flushModal();
    for (const [id] of S.ill) { const s = byId(id); const a = s?.action; if (a?.obj?.kind === 'herbalist' && a.phase === 'do' && !a.leDosed) { a.leDosed = true; treat(s, 0.25, 'Herbal medicine from the stall'); s.say('Bitter… but it warms the belly.', 'talk'); } }
    for (const f of [...V.fires]) fireTick(f, 1);
    for (const r of V.rituals) ritualTick(r); V.rituals = V.rituals.filter((r) => !r.dead);
    if (V.ghost) ghostScare(V.ghost);
    captiveTick();
    reqTick();
  }
  function slowTick(m) {
    illTick(m);
    ensureRoles();
    const t = now();
    if (t > S.nextHH) { S.nextHH = t + rr(480, 900); if (HH().length) personal(true); }
    if (t > S.nextNPC) { S.nextNPC = t + rr(200, 420); personal(false); }
    if (t > S.nextReq) { S.nextReq = t + rr(200, 420); if (S.requests.filter((r) => r.stage === 'open').length < 3 && S.requests.length < 6) postRequest(); }
    if (S.drought) { if (t > S.drought) { S.drought = 0; G.env.setWeather('cloudy'); log('At last, clouds gather from the sea. The drought is over.', 'omen'); } else if (G.env.weather === 'rain' && !V.storm) G.env.setWeather('clear'); }
    // giver nags & board flavour
    if (chance(0.15)) { const r = pick(S.requests.filter((x) => x.stage === 'open')); const g = r && byId(r.giver); if (alive(g) && !g.hidden) g.say(pick(['Will no one help me?', 'Has anyone read my notice?', 'Aigo, what am I to do…']), 'sad'); }
  }

  const sys = {
    id: 'lifeevents',
    init() {
      const t = now(); S.nextHH = t + rr(180, 420); S.nextNPC = t + rr(60, 180); S.nextReq = t + rr(20, 60);
      try { placeObjects(); } catch (e) { console.error('[lifeevents] objects', e); }
      // persistent lights (intensity 0 when idle) so the light count never changes at runtime → no shader recompiles
      try { V.boltLight = new THREE.PointLight(0xcfe0ff, 0, 300, 1.2); V.fireLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.6); V.fireLight.userData.busy = false; G.scene.add(V.boltLight, V.fireLight); } catch { /* ignore */ }
      try { const env = G.env; if (!env.__lePatched) { const orig = env.update.bind(env); env.update = (...a) => { orig(...a); try { postEnv(a[0]); } catch { /* ignore */ } }; env.__lePatched = true; } } catch (e) { console.error(e); }
      try { G.ui?.addTopButton('📜 Requests', 'Village requests (notice board)', () => openBoard()); } catch { /* ignore */ }
      try { registerWorld(); } catch (e) { console.error('[lifeevents] world', e); }
    },
    update(dt, gm) {
      const nowT = performance.now(); const rdt = Math.min(0.05, (nowT - V.lastT) / 1000) * (gm > 0 ? 1 : 0); V.lastT = nowT;
      for (const f of V.fires) fireFrame(f, rdt);
      if (V.ghost) ghostFrame(V.ghost, rdt, gm);
      if (V.boltLight && V.boltLight.intensity > 0) V.boltLight.intensity = Math.max(0, V.boltLight.intensity - (rdt || 0.016) * 1600);
      for (const b of V.bolts) { b.life -= rdt || 0.016; b.g.visible = b.life > 0 && (b.life > 0.25 || chance(0.6)); }
      for (const b of V.bolts.filter((x) => x.life <= 0)) disposeObj(b.g); V.bolts = V.bolts.filter((x) => x.life > 0);
      const cam = G.camera?.position;
      if (V.comet && cam) { const c = V.comet; c.t += gm; const u = clamp(c.t / c.dur, 0, 1); const d = cometDir(c, u), d0 = cometDir(c, Math.max(0, u - 0.02)); const tail = d0.sub(d).normalize(); tail.y += 0.25; tail.normalize(); c.head.position.copy(d).multiplyScalar(1500).add(cam); c.tail.forEach((sp, i) => sp.position.copy(c.head.position).addScaledVector(tail, (i + 1) * 13)); c.g.visible = G.env.isNight !== false; }
      if (V.eclipse && cam && V.dome) { V.dome.position.copy(cam); V.dome.material.opacity = 0.85 * V.eclipse.k; V.corona.position.copy(G.env.sunDir).multiplyScalar(1700).add(cam); V.corona.material.opacity = V.eclipse.k; }
      for (const w of V.wisps) { w.t -= rdt; if (G.fx?.firePool && chance(0.5)) { const a = performance.now() / 600 + rr(0, 6.28); const p = new THREE.Vector3(w.x + Math.cos(a) * 3, groundAt(w.x, w.z) + 1 + Math.sin(a * 2) * 0.4, w.z + Math.sin(a) * 3); G.fx.firePool.emit(p, new THREE.Vector3(rr(-0.2, 0.2), rr(0.2, 0.6), rr(-0.2, 0.2)), new THREE.Color().setHSL(0.58, 1, 0.6), rr(0.3, 0.6), rr(0.6, 1.2), -0.3); } }
      V.wisps = V.wisps.filter((w) => w.t > 0);
      if (V.swarm && G.fx?.bloodPool) { const s = V.swarm; s.t += rdt; const cx = s.c[0] + Math.sin(s.t * 0.2) * 40, cz = s.c[1] + Math.cos(s.t * 0.13) * 30; for (let i = 0; i < 4; i++) G.fx.bloodPool.emit(new THREE.Vector3(cx + rr(-15, 15), groundAt(cx, cz) + rr(0.5, 5), cz + rr(-15, 15)), new THREE.Vector3(rr(-3, 3), rr(-0.5, 0.5), rr(-3, 3)), new THREE.Color(0x4a3a18), rr(0.06, 0.12), rr(1, 2), 0); }
      for (const b of V.beacons.values()) { const ring = b.userData.ring; if (ring) ring.scale.setScalar(1 + Math.sin(nowT / 300) * 0.15); }
      V.fastAcc += gm; V.slowAcc += gm;
      if (V.fastAcc >= 1) { V.fastAcc = 0; try { fastTick(); } catch (e) { if (!V.e1) { V.e1 = 1; console.error('[lifeevents] fast', e); } } }
      if (V.slowAcc >= 10) { const m = V.slowAcc; V.slowAcc = 0; try { slowTick(m); } catch (e) { if (!V.e2) { V.e2 = 1; console.error('[lifeevents] slow', e); } } }
    },
    onEvent(name, p) {
      if (name === 'ready') { ensureRoles(); if (!p?.loaded) { postRequest(); postRequest(); } }
      else if (name === 'season') { if (p?.season === 'spring') S.crop = 1; if (p?.season === 'winter' && chance(0.5)) S.nextNPC = now() + 30; }
      else if (name === 'death') {
        const s = p?.sim; if (!s) return; S.ill.delete(s.id);
        if (s.leThief && p.killer?.household) { bump(p.killer, 'honor', 10); log(`${nm(p.killer)} slew the thief who broke into their home.`, 'story', P(s)); }
        for (const r of [...S.requests]) {
          if (r.type === 'duel' && r.rival === s.id && r.stage === 'duel' && p.killer?.household) finishReq(r, p.killer, true, `avenged ${nm(byId(r.giver))}'s honour — though blood was spilled where a duel would have done`);
          if (r.type === 'heirloom' && r.carrier === s.id) r.target = [s.pos.x, s.pos.z];
        }
      } else if (name === 'duel') {
        const { winner, loser } = p || {};
        for (const r of [...S.requests]) if (r.type === 'duel' && r.stage === 'duel' && loser?.id === r.rival && winner?.household) finishReq(r, winner, true, `defeated ${nm(loser)} in a duel for ${nm(byId(r.giver))}'s honour`);
      }
    },
    serialize() { return { ill: [...S.ill], immune: S.immune, cool: S.cool, nextHH: S.nextHH, nextNPC: S.nextNPC, nextReq: S.nextReq, requests: S.requests.map((r) => ({ ...r })), rid: S.rid, healerId: S.healerId, mudangId: S.mudangId, captive: S.captive, crop: S.crop, drought: S.drought, fate: S.fate, lastWorld: S.lastWorld, epidemic: S.epidemic, herbLore: S.herbLore }; },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      try { S.ill = new Map(Array.isArray(d.ill) ? d.ill : []); } catch { S.ill = new Map(); }
      for (const k of ['immune', 'cool', 'fate', 'lastWorld', 'herbLore']) if (d[k] && typeof d[k] === 'object') S[k] = d[k];
      for (const k of ['nextHH', 'nextNPC', 'nextReq', 'rid', 'crop', 'drought', 'epidemic']) if (typeof d[k] === 'number') S[k] = d[k];
      S.healerId = d.healerId ?? null; S.mudangId = d.mudangId ?? null; S.captive = d.captive || null;
      S.requests = Array.isArray(d.requests) ? d.requests.filter((r) => r && REQ_INFO[r.type]) : [];
      for (const r of S.requests) { const c = byId(r.carrier); if (c) c.leCarrier = r.id; }
    },
    simMenuItems(me, o) {
      if (!me?.household || !o || o.dead) return [];
      const items = [];
      if (S.ill.has(o.id) && o !== me) items.push({ label: `🌿 Nurse ${gv(o)} with herbal tea (3 nyang)`, disabled: me.coins < 3, fn: () => doAt(me, o.pos.x, o.pos.z, `Nursing ${gv(o)}`, () => { pay(me, -3); treat(o, S.herbLore[me.id] ? 0.3 : 0.15, `Nursed by ${gv(me)}`); me.changeRel(o, 8); me.say('Drink, it will break the fever.', 'talk'); }) });
      const sick = HH().filter((s) => S.ill.has(s.id));
      if (o.id === S.healerId) for (const t of sick.slice(0, 3)) items.push({ label: `🩺 Ask the physician to treat ${gv(t)} (10 nyang)`, disabled: me.coins < 10, fn: () => { pay(me, -10); o.earn(10); o.cancelAction(); o.startAction({ type: 'goto', dest: [t.pos.x, t.pos.z], run: true, label: `Hurrying to treat ${gv(t)}`, le: 'doc', then: () => { if (alive(t) && treat(t, 0.4, 'Treated by the physician')) { o.say('Acupuncture and a strong decoction. Rest!', 'talk'); log(`The physician ${nm(o)} treated ${nm(t)}.`, 'story', P(t)); } } }); } });
      if (o.id === S.mudangId) {
        if (V.ghost && !V.ghost.leaving && !V.rituals.length) items.push({ label: '🥁 Commission a gut to banish the gwishin (30 nyang)', disabled: me.coins < 30, fn: () => { pay(me, -30); performGut([V.ghost.x, V.ghost.z], 'ghost', (ok) => { if (ok) { banishGhost('gut'); bump(me, 'honor', 12); } }); } });
        for (const t of sick.slice(0, 2)) items.push({ label: `🥁 Healing gut for ${gv(t)} (20 nyang)`, disabled: me.coins < 20 || V.rituals.length > 0, fn: () => { pay(me, -20); const d = t.home?.door || [t.pos.x, t.pos.z]; performGut([d[0] + 2, d[1] + 2], 'heal', (ok) => { if (ok && alive(t)) { treat(t, 0.3, 'Blessed by a healing gut'); for (const x of HH()) x.addMoodlet('le_gut', 'The spirits are appeased', 8, 1440); log(`The mudang ${nm(o)} danced a healing gut for ${nm(t)}; the sickness spirit was feasted and sent away.`, 'omen', P(t)); } }); } });
      }
      for (const r of S.requests) {
        if (r.giver === o.id && r.stage === 'open') items.push({ label: `📜 Accept ${gv(o)}'s request: ${REQ_INFO[r.type].title}`, fn: () => acceptReq(r, me) });
        if (r.giver === o.id && r.type === 'letter' && r.stage === 'write') items.push({ label: me.skills.scholarship >= 3 ? `✍ Write the love letter for ${gv(o)}` : '✍ Write the love letter (needs Scholarship 3)', disabled: me.skills.scholarship < 3, fn: () => {
          const c = byId(r.crush); if (!me.controlled) me.startAction({ type: 'event', dest: [me.pos.x, me.pos.z], anim: 'study', prop: 'brush', dur: 15, label: 'Composing a love poem' });
          if (!alive(c)) return finishReq(r, me, true, `wrote a love poem for ${nm(o)}`);
          const q = me.skills.scholarship; o.changeRel(c, 8, q * 4 + rr(0, 15));
          const won = c.getRel(o).r > 40 || chance(0.25 + q * 0.04);
          if (won && single(o) && single(c) && chance(0.4)) G.director?.wedding(o, c);
          finishReq(r, me, true, won ? `wrote a love poem so fine that ${nm(c)} wept — and agreed to walk out with ${nm(o)}` : `wrote a fine love poem for ${nm(o)}, though ${nm(c)}'s heart is not yet won`);
        } });
        if (r.giver === o.id && r.type === 'rice' && r.stage === 'deliver') {
          const has = (me.inv?.rice || 0) > 0;
          items.push({ label: has ? '🍚 Give a sack of rice' : '🍚 Buy & give a sack of rice (12 nyang)', disabled: !has && me.coins < 12, fn: () => { if (has) me.inv.rice--; else pay(me, -12); bump(o, 'hunger', 50); finishReq(r, me, true, `brought a sack of rice to ${nm(o)}, whose rice jar had stood empty`); } });
        }
        if (r.type === 'duel' && r.stage === 'duel' && r.rival === o.id) items.push({ label: `⚔ Duel ${gv(o)} for ${gv(byId(r.giver))}'s honour`, disabled: !me.fighter, fn: () => { me.say(`You will apologise to ${gv(byId(r.giver))}, or answer to my blade!`, 'shout'); G.startDuel(me, o); } });
      }
      return items;
    },
    objMenuItems(me, obj) {
      if (obj?.kind === 'noticeBoard') return [{ label: '📜 Read the requests', fn: () => openBoard() }];
      if (obj?.kind === 'herbalist' && me?.household) return HH().filter((s) => S.ill.has(s.id) && s !== me).slice(0, 3).map((t) => ({ label: `🌿 Buy a remedy for ${gv(t)} (8 nyang)`, disabled: me.coins < 8, fn: () => doAt(me, obj.x, obj.z, 'Buying medicine', () => { pay(me, -8); treat(t, 0.2, 'Herbal medicine'); toast(`${gv(me)} bought a remedy for ${gv(t)}.`); }) }));
      return [];
    },
    panelHtml(s) {
      const rows = [];
      const d = S.ill.get(s.id); if (d) { const D = DIS[d.k] || DIS.fever; rows.push(`${D.icon} <b>${D.name}</b> <em>${D.ko}</em> <small>(day ${G.env.day - d.d0 + 1} · ${d.sev > 0.7 ? 'grave' : d.sev > 0.4 ? 'serious' : 'mild'}${d.tr > 0 ? ' · treated' : ''})</small>`); }
      if (S.captive?.id === s.id) rows.push('⛓ <b>Held captive by bandits</b> in the western woods');
      const l = luck(s); if (l > 0) rows.push('🍀 Fortune smiles on them'); else if (l < 0) rows.push('🌑 Ill-omened');
      if (S.herbLore[s.id]) rows.push('🌿 Knows herb lore');
      if (s.id === S.healerId) rows.push('🩺 Village physician (의원)'); if (s.id === S.mudangId) rows.push('🥁 Village mudang (무당)');
      if (s.household) for (const r of S.requests) if (r.taker === s.id) rows.push(`${REQ_INFO[r.type].icon} ${esc(REQ_INFO[r.type].title)} — <small>${esc(stageText(r))}</small>`);
      for (const r of S.requests) if (r.giver === s.id && r.stage === 'open') rows.push(`📜 Has posted a request: ${esc(REQ_INFO[r.type].title)}`);
      return rows.length ? `<div class="facts">${rows.join('<br>')}</div>` : '';
    },
  };
  return sys;
}
