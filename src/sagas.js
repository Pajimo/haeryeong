// Story deck (이야기): every few game hours the storyteller deals the household a situation drawn from
// the deck — court trials, framed treason, lost siblings, iron that will not shatter, omens at birth —
// each with choices whose consequences ripple through the simulation.
//
// Deck files live in src/sagas/*.js and export an array of events:
//   { id, tag, title, once?, cooldown? (days, default 6),
//     weight: (c) => number   // 0 = not eligible now
//     who?: (c) => sim        // the household member this happens to (default: a random adult)
//     text: (c) => string,    // may use c.me, c.vars set in weight/who
//     choices: [{ label: string|(c)=>string, cost?: number, req?: (c) => true|string, do: (c) => string /* outcome text */ }] }
// The helper object `c` is documented in makeCtx() below.
import DECK_A from './sagas/deck_court.js';
import DECK_B from './sagas/deck_life.js';
import DECK_C from './sagas/deck_world.js';
import DECK_D from './sagas/deck_shadow.js';

export function createSagasSystem(G) {
  const DECK = [...DECK_A, ...DECK_B, ...DECK_C, ...DECK_D].filter((e) => e && e.id && e.choices?.length);
  const st = { last: {}, flags: {}, next: 0, queue: [], seen: 0, freq: 1 };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const day = () => G.env.day + G.env.hour / 24;
  const sys = (id) => G.systems.find((x) => x.id === id);

  function makeCtx(me) {
    const hh = G.household.filter((s) => !s.dead && !s.hidden);
    const c = {
      G, me, hh, vars: {},
      // ---- random & time ----
      pick: (a) => a[Math.floor(Math.random() * a.length)], chance: (p) => Math.random() < p, rand: (a, b) => a + Math.random() * (b - a),
      day: G.env.day, hour: G.env.hour, night: G.env.nightBlend > 0.5, season: G.env.season,
      // ---- people ----
      adults: () => hh.filter((s) => s.age !== 'child'),
      children: () => hh.filter((s) => s.age === 'child'),
      npc: (f = () => true) => { const L = G.sims.filter((s) => !s.dead && !s.hidden && !s.household && s.faction === 'village' && s.age !== 'child' && !s.merc && f(s)); return L[Math.floor(Math.random() * L.length)] || null; },
      king: () => (G.king && !G.king.dead ? G.king : null),
      royals: () => G.sims.filter((s) => !s.dead && ['prince', 'princess', 'queen'].includes(s.job)),
      rival: () => { const r = sys('rivals'); return r?.clan && !r.allied ? r : null; },
      courtRank: (s = me) => s?.factions?.court?.rank ?? -1,
      job: (s = me) => s?.job,
      skill: (s, k, n) => { if (n !== undefined) s.skills[k] = Math.max(0, Math.min(10, (s.skills[k] || 0) + n)); return s.skills[k] || 0; },
      // ---- state of the realm ----
      atWar: () => !!sys('war')?.st?.war, wealth: () => G.household.reduce((a, s) => a + (s.coins || 0), 0),
      bandits: () => G.sims.filter((s) => !s.dead && s.faction === 'bandit').length,
      festival: () => /festival|archery|tournament|kimjang/i.test(G.director?.active?.kind || ''),
      mercs: () => sys('underworld')?.mercs?.length || 0, company: () => sys('underworld')?.company || null,
      standing: () => sys('politics')?.standing?.() || { tier: ['', '', 0], score: 0 },
      // ---- effects (all return a short phrase for outcome text) ----
      coins: (n, s = G.household[0]) => { if (!s) return ''; if (n >= 0) s.earn(n); else s.coins = Math.max(0, s.coins + n); return n >= 0 ? `+${n} nyang` : `${n} nyang`; },
      afford: (n) => (G.household[0]?.coins || 0) >= n,
      honor: (s, n) => { s.needs.honor = Math.max(0, Math.min(100, s.needs.honor + n)); return `${n >= 0 ? '+' : ''}${n} honor`; },
      need: (s, k, n) => { s.needs[k] = Math.max(0, Math.min(100, s.needs[k] + n)); },
      mood: (s, label, v, hours = 12) => { s.addMoodlet('saga_' + label.slice(0, 12), label, v, hours * 60); return ''; },
      rel: (a, b, f, r = 0) => { if (a && b) { a.changeRel(b, f, r); b.changeRel(a, f * 0.8, r * 0.8); } },
      favour: (n, s = me) => { const k = c.king(); if (k) k.changeRel(s, n); return n ? `royal favour ${n > 0 ? '+' : ''}${n}` : ''; },
      fame: (s, path, n) => { sys('missions')?.addFame?.(s, path, n); return ''; },
      court: (s, rep) => { if (s.factions?.court) s.factions.court.rep += rep; },
      backing: (side, n) => { const p = sys('politics'); if (p) p.st.backing[side] = Math.max(0, Math.min(100, (p.st.backing[side] || 0) + n)); },
      enmity: (n) => { const r = c.rival(); if (r) r.enmity = Math.max(0, Math.min(100, r.enmity + n)); },
      evidence: (n) => { const r = sys('rivals'); if (r?.clan) r.evidence = Math.max(0, Math.min(5, r.evidence + n)); },
      crime: (s, bounty, what) => { G.economy?.commitCrime?.(s, bounty, what); return `wanted (${bounty} nyang bounty)`; },
      hurt: (s, frac) => { s.hp = Math.max(1, s.hp - s.maxHp * frac); },
      heal: (s) => { s.hp = s.maxHp; },
      kill: (s, by = null) => { if (!s.dead) s.die(by); },
      item: (s, k, n = 1) => { s.inv = s.inv || {}; s.inv[k] = Math.max(0, (s.inv[k] || 0) + n); },
      memory: (s, about, text, v) => sys('memories')?.remember?.(s, about, text, v),
      log: (t, kind = 'story') => G.log(t, kind, me?.pos), toast: (t, kind) => G.ui?.toast(t, kind),
      // spawn hostile fighters who attack `target` right now (e.g., assassins, raiders, a bear substitute)
      ambush: (target, n = 2, label = 'Assassin', skill = 6) => {
        const a = Math.random() * Math.PI * 2; const out = [];
        for (let i = 0; i < n; i++) {
          const h = G.spawn({ sex: 'm', age: 'adult', job: 'swordsman', traits: ['Brave', 'Cunning'], armed: true, skillSword: skill, x: target.pos.x + Math.sin(a + i) * 12, z: target.pos.z + Math.cos(a + i) * 12 });
          h.faction = 'hunter'; h.missionLock = true; h.uniform = { outfit: 'bandit', colors: { top: '#1a1a1a', bottom: '#111' }, hat: 'headband' }; h.rebuildModel(); h.startFight(target); out.push(h);
          if (i === 0) h.say(`${label}! For your life!`, 'shout', 3);
        }
        setTimeout(() => { for (const h of out) if (!h.dead && !h.removed) { h.dispose?.(); h.removed = true; h.dead = true; } }, 240000);
        return out;
      },
      // add a new villager (a foundling, refugee, freed captive, hostage…) — returns the sim
      newcomer: (o = {}) => { const d = G.household[0]?.home?.door || [0, 0]; return G.spawn({ sex: Math.random() < 0.5 ? 'm' : 'f', age: 'young', job: 'farmer', x: d[0] + 4, z: d[1] + 4, ...o }); },
      // bring someone into your household (adoption, ward, freed servant, sworn sibling)
      adopt: (s) => { if (!s || s.household) return; s.household = true; s.freeWill = true; const home = G.household[0]?.home; if (home && s.home !== home) { if (s.home?.residents) s.home.residents = s.home.residents.filter((x) => x !== s); s.home = home; home.residents?.push(s); } G.household.push(s); G.ui?.refreshHousehold?.(); },
      // ---- conveniences the deck writers asked for ----
      favourOf: (s = me) => { const k = c.king(); return k ? Math.round(k.getRel(s).f) : 0; },
      relOf: (a, b) => (a && b ? Math.round(a.getRel(b).f) : 0),
      pardon: (s) => { s.outlaw = false; s.bounty = 0; return 'pardoned'; },
      rank: (s, d) => { const m = s.factions?.court; if (!m) return ''; m.rank = Math.max(0, Math.min(7, m.rank + d)); return d > 0 ? 'promoted' : 'demoted'; },
      marry: (a, b) => { if (a && b && !a.spouse && !b.spouse) G.director?.wedding?.(a, b); },
      hasItem: (k, n = 1) => G.household.reduce((x, s) => x + (s.inv?.[k] || 0), 0) >= n,
      take: (k, n = 1) => { for (const s of G.household) { const t = Math.min(n, s.inv?.[k] || 0); if (t) { s.inv[k] -= t; n -= t; } } return n <= 0; },
      foe: () => { const w = sys('war')?.st?.war; return w ? w.realm[0].toUpperCase() + w.realm.slice(1) : 'the enemy'; },
      weather: G.env.weather,
      npcById: (id) => G.sims.find((s) => s.id === id && !s.dead) || null,
      jail: (s) => G.economy?.jail?.(s),
      // a non-family follower (freed servant, wrestler, sworn retainer) who fights for you like a hired sword, without wages
      retainer: (s) => { const U = sys('underworld'); if (!U || !s || s.household) return; s.merc = { wage: 0, loyalty: 80, leader: me?.id, mode: 'follow', since: G.env.day, retainer: true }; s.missionLock = true; s.armed = true; U.mercs.push(s); },
      // ---- persistence & chaining ----
      flag: (k, v) => { if (v !== undefined) st.flags[k] = v; return st.flags[k]; },
      chain: (id, hours = 6, vars = null) => { st.queue.push({ id, at: day() + hours / 24, who: me?.id, vars: vars || c.vars }); },
    };
    return c;
  }

  function eligible(e, c) {
    if (e.once && st.last[e.id]) return 0;
    if (st.last[e.id] && day() - st.last[e.id] < (e.cooldown ?? 6)) return 0;
    try { return Math.max(0, +e.weight(c) || 0); } catch { return 0; }
  }
  function busy() {
    const m = document.getElementById('modal');
    return !G.started || G.paused || (m && !m.classList.contains('hidden')) || G.standoffActive || sys('minigames')?.active || sys('yut')?.active || sys('wrestle')?.active || sys('forge')?.active || document.getElementById('creator') || G.household.some((s) => s.controlled && s.combat.target);
  }
  function deal(forceId, whoId, vars) {
    const adults = G.household.filter((s) => !s.dead && !s.hidden && s.age !== 'child');
    if (!adults.length) return false;
    let ev = null, c = null;
    if (forceId) { ev = DECK.find((e) => e.id === forceId); if (!ev) return false; const me = G.sims.find((s) => s.id === whoId && !s.dead) || adults[0]; c = makeCtx(me); if (vars) c.vars = { ...vars }; if (ev.who) { const w = ev.who(c); if (w) c.me = w; } }
    else {
      const pool = [];
      for (const e of DECK) {
        if (e.chainOnly) continue;
        const me = adults[Math.floor(Math.random() * adults.length)]; const cx = makeCtx(me);
        if (e.who) { try { const w = e.who(cx); if (!w) continue; cx.me = w; } catch { continue; } }
        const w = eligible(e, cx); if (w > 0) pool.push([e, cx, w]);
      }
      if (!pool.length) return false;
      let r = Math.random() * pool.reduce((a, x) => a + x[2], 0);
      for (const [e, cx, w] of pool) { r -= w; if (r <= 0) { ev = e; c = cx; break; } }
      if (!ev) [ev, c] = pool[0];
    }
    st.last[ev.id] = day(); st.seen++;
    show(ev, c);
    return true;
  }
  function show(ev, c) {
    let text = ''; try { text = ev.text(c); } catch (err) { console.error('[sagas] text', ev.id, err); return; }
    const me = c.me;
    const portrait = me ? G.ui.portraits.get(me) : '';
    const el = G.ui.modal(`<div class="sg-card"><div class="sg-head">${portrait ? `<img src="${portrait}">` : ''}<div><small class="sg-tag">${esc(ev.tag || 'story')}</small><h2>${esc(ev.title)}</h2>${me ? `<small>${esc(me.name.full)}</small>` : ''}</div></div>
      <p class="sg-text">${esc(text)}</p>
      <div class="sg-ch">${ev.choices.map((ch, i) => { let lbl = typeof ch.label === 'function' ? ch.label(c) : ch.label; let why = ''; try { const r = ch.req ? ch.req(c) : true; if (r !== true && r) why = typeof r === 'string' ? r : 'Not possible'; } catch { why = 'Not possible'; } if (ch.cost && !c.afford(ch.cost)) why = `Needs ${ch.cost} nyang`; return `<button data-i="${i}" ${why ? 'disabled' : ''}>${esc(lbl)}${ch.cost ? ` <small>(${ch.cost} nyang)</small>` : ''}${why ? `<small class="why">${esc(why)}</small>` : ''}</button>`; }).join('')}</div></div>`);
    el.querySelector('.mclose')?.remove();
    el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
      const ch = ev.choices[+b.dataset.i]; let out = '';
      try { if (ch.cost) c.coins(-ch.cost); out = ch.do(c) || ''; } catch (err) { console.error('[sagas] choice', ev.id, err); }
      G.log(`📜 ${ev.title}: ${me ? me.name.given + ' — ' : ''}${typeof ch.label === 'function' ? ch.label(c) : ch.label}. ${out}`, 'story', me?.pos);
      const r = G.ui.modal(`<div class="sg-card"><h2>${esc(ev.title)}</h2><p class="sg-text">${esc(out || 'So it is decided.')}</p></div>`);
      void r;
    }));
  }

  const S = {
    id: 'sagas', st, deck: DECK,
    deal, // deal(id?) for testing
    update() {
      if (!G.started) return;
      const now = day();
      if (st.queue.length && !busy()) { const q = st.queue.find((x) => now >= x.at); if (q) { st.queue.splice(st.queue.indexOf(q), 1); deal(q.id, q.who, q.vars); return; } }
      if (!st.next) st.next = now + 0.2;
      if (now < st.next || busy()) return;
      if (G.env.hour < 7 || G.env.hour > 22) return; // the storyteller sleeps at night (chains still fire)
      st.next = now + (0.3 + Math.random() * 0.3) / (st.freq || 1);
      deal();
    },
    menuItems() { return []; },
    serialize() { return { last: st.last, flags: st.flags, queue: st.queue, seen: st.seen, freq: st.freq }; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
