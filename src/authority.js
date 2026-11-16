// Authority over what is yours.
//  • As King, command any subject directly: arrest, pardon, execute, banish, summon, reward, grant a house,
//    raise them to court, make them Chief State Councillor or General — and grow your guard beyond five.
//  • As a master, command your servants: walk with you as escort, keep the gate, run to market, cook a
//    feast, work the fields — or discipline them, at a cost.
//  • Choose whom you marry: send the matchmaker (중매) to any eligible match, or, as royalty, hold a
//    bride selection (간택) among the daughters and sons of the great houses.
import { LAYOUT } from './terrain.js';

export function createAuthoritySystem(G) {
  const sys = (id) => G.systems.find((x) => x.id === id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const treasury = () => sys('royalWorks')?.st?.treasury ?? 0;
  const spend = (n) => { const r = sys('royalWorks'); if (!r || r.st.treasury < n) return false; r.st.treasury -= n; return true; };
  const heart = (d, why) => sys('royalPower')?.heart?.(d, why);
  const decree = (k, text, kind = 'decree') => { G.log(`📜 By order of King ${k.name.given}: ${text}`, kind, k.pos); G.ui.toast(`📜 ${text}`, kind); };

  // ---------------- the King's hand ----------------
  function royalOrders(k, o) {
    if (k.job !== 'king' || o === k || o.dead || ROYAL.includes(o.job) && o.job !== 'prince' && o.job !== 'princess') return [];
    const out = [];
    const police = () => G.sims.filter((s) => !s.dead && !s.hidden && (s.job === 'police' || s.job === 'soldier') && !s.royalGuard && !s.combat.target).sort((a, b) => a.pos.distanceTo(o.pos) - b.pos.distanceTo(o.pos)).slice(0, 2);
    if (!o.jailed) out.push({ label: '⛓ Order their arrest', danger: true, fn: () => { G.economy?.commitCrime?.(o, 20); for (const p of police()) { p.cancelAction(); p.startFight(o, true); p.arresting = o; } o.changeRel(k, -25); heart(-1); decree(k, `${o.name.full} is to be seized and brought to the Podocheong.`, 'danger'); } });
    if (o.outlaw || o.jailed) out.push({ label: '🕊 Grant a royal pardon', fn: () => { o.outlaw = false; o.bounty = 0; if (o.jailed) G.economy?.release?.(o); o.changeRel(k, 30); heart(+1); decree(k, `${o.name.full} is pardoned. Let no constable lay a hand on them.`); } });
    if (o.jailed) out.push({ label: '⚔ Order their execution', danger: true, fn: () => { G.economy?.release?.(o); o.die(null); heart(-5, 'executed a prisoner'); decree(k, `${o.name.full} is beheaded before the Podocheong.`, 'danger'); } });
    out.push({ label: '🏝 Banish them from the realm', danger: true, fn: () => { o.cancelAction(); o.endFight?.(); o.setHidden(true); o.missionLock = true; o.exiled = true; for (const r of G.sims) if (!r.dead && (r.spouse === o || r.parents?.includes(o) || o.parents?.includes(r))) { r.changeRel(k, -30); sys('memories')?.remember?.(r, k, `The King banished my ${r.spouse === o ? 'spouse' : 'kin'}, ${o.name.given}`, -25, 'grudge'); } heart(-2, 'banished a subject'); decree(k, `${o.name.full} is banished to a distant island and may never return.`); } });
    out.push({ label: '🏯 Summon them to the palace', fn: () => { o.cancelAction(); o.startAction({ type: 'goto', dest: [k.pos.x + 2, k.pos.z + 2], run: true, label: 'Summoned by the King', then: (z) => { z.say('Your Majesty summoned me?', 'talk', 3); z.char.setAnim('bow'); } }); G.ui.toast(`A eunuch hurries off to summon ${o.name.given}.`); } });
    out.push({ label: '💰 Reward them from the treasury (50)', disabled: treasury() < 50, fn: () => { spend(50); o.earn(50); o.changeRel(k, 15); o.addMoodlet('royalreward', 'Rewarded by the King', 15, 2880); heart(+1); decree(k, `${o.name.full} is rewarded with fifty nyang of royal silver.`); } });
    const empty = G.world.houses.filter((h) => !h.virtual && !(h.residents || []).some((r) => !r.dead));
    if (empty.length && o.home !== empty[0]) out.push({ label: `🏠 Grant them an empty ${empty[0].tier || 'house'}`, fn: () => { const h = empty.sort((a, b) => ({ mansion: 3, house: 2, cottage: 1, hut: 0 }[b.tier] || 0) - ({ mansion: 3, house: 2, cottage: 1, hut: 0 }[a.tier] || 0))[0]; if (o.home?.residents) o.home.residents = o.home.residents.filter((x) => x !== o); o.home = h; h.residents.push(o); h.owner = o.id; o.changeRel(k, 25); decree(k, `${o.name.full} is granted a ${h.tier || 'house'} by royal favour.`); } });
    if (!o.factions?.court && o.age !== 'child' && !o.household && !o.serf) out.push({ label: '🏛 Appoint them to the court', fn: () => { G.factions.join(o, 'court', true); o.factions.court.rank = 3; o.factions.court.rep = 180; o.job = o.job === 'farmer' || o.job === 'merchant' || o.job === 'scholar' ? 'official' : o.job; o.rebuildModel(); o.changeRel(k, 20); sys('politics') && (sys('politics').st.backing.east = Math.max(0, sys('politics').st.backing.east - 2)); decree(k, `${o.name.full} is appointed Secretary (정7품) of the royal court.`); } });
    if (o.factions?.court && (o.factions.court.rank || 0) < 7) out.push({ label: '🏛 Make them Chief State Councillor (영의정)', fn: () => { for (const s of G.sims) if (!s.dead && s !== o && s.factions?.court?.rank >= 7 && !ROYAL.includes(s.job)) { s.factions.court.rank = 5; s.addMoodlet('demoted', 'Removed as Chief State Councillor', -20, 2880); } o.factions.court.rank = 7; o.changeRel(k, 30); decree(k, `${o.name.full} is raised to Chief State Councillor, first among ministers.`); } });
    if (o.fighter && o.job !== 'general' && !o.serf) out.push({ label: '🎖 Appoint them General of the army', fn: () => { for (const s of G.sims) if (!s.dead && s !== o && s.job === 'general') { s.job = 'soldier'; s.rebuildModel(); } o.job = 'general'; o.armed = true; o.rebuildModel(); o.changeRel(k, 25); decree(k, `${o.name.full} is given command of the royal army.`); } });
    if (!o.royalGuard && o.fighter && o.age !== 'child' && !o.household) out.push({ label: '🛡 Take them into the royal guard', fn: () => { const RG = sys('royalGuard'); if (!RG) return; o.royalGuard = { loyalty: 60 + Math.min(30, o.getRel(k).f / 2), bribedBy: null, charge: null }; o.job = 'soldier'; o.missionLock = true; o.maxHp = Math.max(o.maxHp, 260); o.hp = o.maxHp; RG.st.ids.push(o.id); o.uniform = { outfit: 'general', colors: { top: '#2c2a4a', bottom: '#1a1a24', armor: '#3a2a5a', robe: '#1a1a24', belt: '#d9b44a' }, hat: 'helmet', weapon: true }; o.rebuildModel(); decree(k, `${o.name.full} swears the oath of the royal guard.`); } });
    return out;
  }

  // ---------------- servants ----------------
  function servantOrders(me, o) {
    if (!o.serf || !G.household.some((h) => h.id === o.serf.master) || o.household) return [];
    const mode = o.serf.mode || 'house';
    const out = [];
    out.push({ label: mode === 'follow' ? '✔ Walking with you' : '🚶 Walk with me as an escort', fn: () => { o.serf.mode = 'follow'; o.serf.follow = me.id; o.cancelAction(); o.say('Right behind you, master.', 'talk'); } });
    if (mode !== 'house') out.push({ label: '🏠 Go back and keep the house', fn: () => { o.serf.mode = 'house'; o.cancelAction(); } });
    out.push({ label: '🛒 Run to the market for food (10)', disabled: me.coins < 10, fn: () => { me.coins -= 10; const [mx, mz] = G.world.spots.market || [0, 78]; o.cancelAction(); o.startAction({ type: 'goto', dest: [mx, mz], run: true, label: 'Running an errand to the market', then: (z) => { const h = z.home?.door || [0, 0]; z.startAction({ type: 'goto', dest: h, label: 'Carrying food home', then: () => { for (const s of G.household) if (!s.dead) s.needs.hunger = Math.min(100, s.needs.hunger + 30); G.ui.toast(`${z.name.given} is back from the market with rice, fish and greens.`); } }); } }); } });
    out.push({ label: '🍲 Cook a feast for the family (15)', disabled: me.coins < 15, fn: () => { me.coins -= 15; for (const s of G.household) if (!s.dead) { s.needs.hunger = 100; s.addMoodlet('feast', 'A feast cooked at home', 10, 720); } o.cancelAction(); o.startAction({ type: 'event', dest: o.home?.door || [o.pos.x, o.pos.z], anim: 'stir', dur: 40, label: 'Cooking a feast' }); G.ui.toast(`${o.name.given} sets out a feast: rice, grilled fish, kimchi and steaming soup.`); } });
    out.push({ label: '🌾 Work the fields hard today (+income)', fn: () => { me.earn(6); o.needs.energy = Math.max(0, o.needs.energy - 30); o.serf.loyalty = Math.max(0, o.serf.loyalty - 3); o.cancelAction(); } });
    out.push({ label: '✋ Discipline them harshly', danger: true, fn: () => { o.serf.loyalty = Math.max(0, o.serf.loyalty - 18); o.hp = Math.max(1, o.hp - o.maxHp * 0.2); me.needs.honor = Math.max(0, me.needs.honor - 6); o.say('…Yes, master.', 'sad', 3); sys('memories')?.remember?.(o, me, `${me.name.given} had me beaten`, -20); for (const s of G.sims) if (!s.dead && s.serf && s.serf.master === o.serf.master && s !== o) s.serf.loyalty = Math.max(0, s.serf.loyalty - 5); } });
    return out;
  }
  function servantFollow() {
    for (const s of G.sims) {
      if (s.dead || !s.serf || s.serf.mode !== 'follow') continue;
      const L = G.sims.find((x) => x.id === s.serf.follow && !x.dead); if (!L) { s.serf.mode = 'house'; continue; }
      if (s.combat.target) continue;
      const t = L.combat.target || G.sims.find((o) => !o.dead && o.combat.target === L && o.pos.distanceTo(L.pos) < 20);
      if (t && !L.combat.nonlethal && s.serf.loyalty > 25) { s.cancelAction(); s.startFight(t); continue; }
      const d = s.pos.distanceTo(L.pos);
      if (d > 60) { s.cancelAction(); s.pos.set(L.pos.x - 2, s.pos.y, L.pos.z - 2); }
      else if (d > 4 && s.action?.type !== 'goto') { s.cancelAction(); s.startAction({ type: 'goto', dest: [L.pos.x - Math.sin(L.heading) * 2.5, L.pos.z - Math.cos(L.heading) * 2.5], run: d > 9, label: `Attending ${L.name.given}` }); }
    }
  }

  // ---------------- marriage ----------------
  const kin = (a, b) => (a.parents || []).includes(b) || (b.parents || []).includes(a) || (a.parents || []).some((p) => (b.parents || []).includes(p)) || (a.children || []).includes(b) || (b.children || []).includes(a) || (a.name.surname === b.name.surname && ROYAL.includes(a.job) && ROYAL.includes(b.job));
  const eligible = (a, b) => b && b !== a && !kin(a, b) && !(ROYAL.includes(a.job) && ROYAL.includes(b.job)) && !b.dead && !b.hidden && !b.spouse && b.sex !== a.sex && ['young', 'adult'].includes(b.age) && !b.household && !b.serf && !b.merc && !b.royalGuard && b.job !== 'monk' && b.job !== 'king' && !['lady', 'consort'].includes(b.palace?.role) && b.faction !== 'bandit' && b.faction !== 'hunter';
  const tierOf = (s) => (ROYAL.includes(s.job) ? 4 : { mansion: 3, house: 2, cottage: 1, hut: 0 }[s.home?.tier] ?? (s.job === 'noble' || s.job === 'official' ? 2 : 1));
  function matchmaker(me) {
    const royal = ROYAL.includes(me.job);
    let pool = G.sims.filter((b) => eligible(me, b));
    if (royal) pool = pool.filter((b) => tierOf(b) >= 2 || b.job === 'noble' || b.job === 'princess' || b.job === 'prince');
    const myTier = tierOf(me); const myStanding = sys('politics')?.standing?.().score ?? 30;
    const score = (b) => { const r = me.getRel(b); return r.f + r.r * 1.5 + (b.traits || []).filter((t) => (me.traits || []).includes(t)).length * 10 + tierOf(b) * 6; };
    const list = pool.sort((a, b) => score(b) - score(a)).slice(0, 8);
    const chance = (b) => { if (royal) return 0.95; const r = b.getRel(me); let p = 0.35 + r.f / 200 + r.r / 150 + (myTier - tierOf(b)) * 0.14 + (myStanding - 40) / 300; return Math.max(0.05, Math.min(0.95, p)); };
    const fee = royal ? 0 : 10 + myTier * 10;
    const el = G.ui.modal(`<h2>${royal ? '간택 · Royal Bride Selection' : '중매 · The Matchmaker'}</h2>
      <p>${royal ? `The daughters and sons of the great houses are presented at the palace. ${esc(me.name.given)} may choose.` : `The matchmaker spreads her silks and names the eligible matches of the valley. Her fee: ${fee} nyang. A poor house aiming high may be refused; a family that likes you may accept a humble suitor.`}</p>
      <div class="uw-list">${list.map((b, i) => { const r = me.getRel(b); return `<div class="uw-row"><div><b>${esc(b.name.full)}</b> <span class="ko">${esc(b.name.hangul)}</span> · ${esc(b.title)}, ${b.age}<small>${(b.traits || []).join(', ')} · home: ${b.home?.tier || '—'} · knows you: ${Math.round(r.f)}${r.r > 5 ? ' · fond of you ♥' : ''} · chance ${Math.round(chance(b) * 100)}%</small></div><button data-m="${i}" ${me.coins < fee ? 'disabled' : ''}>${royal ? 'Choose' : 'Send the matchmaker'}</button></div>`; }).join('') || '<p>No eligible match in the valley right now.</p>'}</div>`);
    el.querySelectorAll('[data-m]').forEach((btn) => (btn.onclick = () => {
      const b = list[+btn.dataset.m]; me.coins -= fee;
      if (Math.random() < chance(b)) {
        G.log(`💍 ${royal ? 'From the bride selection,' : 'The matchmaker returns with good news:'} ${b.name.full} will marry ${me.name.full}!`, 'love', me.pos);
        G.director.wedding(me, b);
        if (me.job === 'king' && b.sex === 'f') { b.job = 'queen'; b.rebuildModel(); }
        else if ((me.job === 'prince' || me.job === 'princess') && !ROYAL.includes(b.job)) b.royalConsort = true;
        el.classList.add('hidden');
      } else { b.changeRel(me, -3); G.ui.toast(`The ${b.name.surname} family politely declines. "Perhaps another year."`); btn.disabled = true; btn.textContent = 'Declined'; }
    }));
  }

  const S = {
    id: 'authority',
    init() {
      const RP = sys('royalPower');
      if (RP) RP.CMDS.push({ id: 'guard_expand', g: 'Patronage', label: 'Expand the royal guard (+1 elite sword, 100)', cost: 100, when: () => (sys('royalGuard')?.guards()?.filter((g) => g.royalGuard.charge == null).length || 0) < 10, do: () => { const RG = sys('royalGuard'); const before = RG.guards().length; RG._recruit(1); return RG.guards().length > before ? 'A sixth sword — a seventh — the royal guard swells with the best fighters of the provinces.' : 'The captain is still searching for worthy swords.'; } });
    },
    update(dt) { this._t = (this._t || 0) - dt; if (this._t <= 0) { this._t = 0.6; servantFollow(); } },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const out = [...royalOrders(me, o), ...servantOrders(me, o)];
      if (o === me && !me.spouse && ['young', 'adult'].includes(me.age) && !me.serf) out.push({ label: ROYAL.includes(me.job) ? '👑 Hold a royal bride selection (간택)' : '💍 Seek a spouse through the matchmaker (중매)', fn: () => matchmaker(me) });
      for (const c of (me.children || [])) if (o === me && c && !c.dead && !c.spouse && ['young', 'adult'].includes(c.age) && c.household) out.push({ label: `💍 Arrange a match for ${c.name.given}`, fn: () => matchmaker(c) });
      return out;
    },
  };
  return S;
}
