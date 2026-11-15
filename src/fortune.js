// Rise and fall (흥망성쇠). Fortunes in Haeryeong move. A poor family that strikes it lucky buys silk,
// a horse, a servant, renovates — then moves up to a bigger house, and may even purchase a minor court
// post (납속). Old yangban sneer at the new money; poor relations come knocking. A rich house that loses
// everything sells off its horse, its servants, its silks, then its house, and moves down to a hut —
// fair-weather friends vanish, true friends and kin may help, and the desperate turn to crime.
import { WEALTH } from './economy.js';

const TIER = { hut: 0, cottage: 1, house: 2, mansion: 3 };
const FINERY = [{ top: '#f2d8e0', bottom: '#7a2a6b', robe: '#3c5d8c' }, { top: '#e8f0d8', bottom: '#b8241e', robe: '#5b7d6f' }, { top: '#f6e6b0', bottom: '#2e4f8a', robe: '#7a3b8f' }];

export function createFortuneSystem(G) {
  const st = { band: {}, peak: {}, newMoney: {}, ruined: {}, helped: {} };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const E = () => G.economy;
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const bandOf = (s) => { const w = E().netWorth(s); let i = 0; for (const [lim] of WEALTH) { if (w < lim) return i; i++; } return WEALTH.length - 1; };
  const bandName = (i) => WEALTH[i][1];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const kinOf = (s) => (s.home?.residents || []).filter((r) => r !== s && !r.dead && !r.serf);
  const heads = () => G.sims.filter((s) => !s.dead && !s.household && !s.hidden && !s.serf && !s.merc && !s.royalGuard && !ROYAL.includes(s.job) && s.home && !s.home.virtual && s.age !== 'child' && s.faction === 'village' && (s.home.owner === s.id || s.home.residents?.find((r) => !r.dead && !r.serf && r.age !== 'child') === s));
  const vacant = () => G.world.houses.filter((h) => !h.virtual && !(h.residents || []).some((r) => !r.dead) && h !== G.homeHouse && !h.reservedFor);

  function moveFamily(head, h, why) {
    const old = head.home; const fam = [head, ...kinOf(head)]; const serfs = (old?.residents || []).filter((r) => !r.dead && r.serf);
    for (const m of [...fam, ...serfs]) { if (m.home?.residents) m.home.residents = m.home.residents.filter((x) => x !== m); m.home = h; h.residents.push(m); if (m.serf) m.serf.house = h.id; }
    if (old && old.owner === head.id) old.owner = null;
    h.owner = head.id;
    for (const m of fam) if (!m.action && !m.missionLock) m.startAction({ type: 'goto', dest: h.door || [h.x, h.z], label: why === 'up' ? 'Moving into the new house' : 'Carrying bundles to a poorer home' });
  }
  function swapHomes(a, b) {
    const ha = a.home, hb = b.home; const famA = [a, ...kinOf(a)], famB = [b, ...kinOf(b)];
    const serfA = (ha.residents || []).filter((r) => !r.dead && r.serf), serfB = (hb.residents || []).filter((r) => !r.dead && r.serf);
    ha.residents = (ha.residents || []).filter((r) => r.dead); hb.residents = (hb.residents || []).filter((r) => r.dead);
    for (const m of [...famA, ...serfA]) { m.home = hb; hb.residents.push(m); if (m.serf) m.serf.house = hb.id; }
    for (const m of [...famB, ...serfB]) { m.home = ha; ha.residents.push(m); if (m.serf) m.serf.house = ha.id; }
    ha.owner = b.id; hb.owner = a.id;
    for (const m of [...famA, ...famB]) if (!m.action && !m.missionLock) m.startAction({ type: 'goto', dest: m.home.door || [m.home.x, m.home.z], label: 'Moving house' });
  }
  function setFinery(s, on) { if (on) s.finery = pick(FINERY); else s.finery = null; s.rebuildModel(); G.ui?.portraits?.cache.delete(s.id); }

  // ------- the climb -------
  function rise(s) {
    const c = s.coins; const h = s.home; const A = G.animals;
    const better = vacant().filter((v) => (TIER[v.tier] ?? 1) > (TIER[h.tier] ?? 1) && E().houseValue(v) + 60 <= c).sort((a, b) => E().houseValue(b) - E().houseValue(a))[0];
    if (better) {
      const price = E().houseValue(better); s.coins -= price; moveFamily(s, better, 'up'); st.newMoney[s.id] = G.env.day;
      log(`🏠 New money! The ${s.name.surname} family, who lived in a ${h.tier || 'small house'}, buys a ${better.tier === 'mansion' ? 'walled mansion' : better.tier === 'house' ? 'tiled house' : 'thatched cottage'} for ${price} nyang. The neighbours talk of nothing else.`, 'story', { x: better.x, z: better.z });
      const snob = G.sims.find((o) => !o.dead && !o.household && o.home?.tier === 'mansion' && o !== s && (o.job === 'noble' || o.factions?.court) && chance(0.6));
      if (snob && better.tier !== 'hut') { snob.changeRel(s, -12); snob.say(pick([`The ${s.name.surname}s? Their grandfather sold straw sandals.`, 'Silver cannot buy breeding.', 'Peasants in a tiled house. What next?']), 'talk', 4); }
      return true;
    }
    // no empty house? buy out a struggling family in a finer one — they take your old home and the difference
    if (!better) {
      const up = (o) => (TIER[o.home.tier] ?? 1) > (TIER[h.tier] ?? 1);
      const struggling = (o) => o.coins < 40 || st.ruined[o.id] != null;
      const seller = heads().filter((o) => o !== s && o.home !== h && up(o) && struggling(o)).sort((a, b) => (TIER[b.home.tier] ?? 1) - (TIER[a.home.tier] ?? 1))[0];
      if (seller) { const diff = Math.max(40, E().houseValue(seller.home) - E().houseValue(h)); if (c >= diff + 60) { const tier = seller.home.tier; s.coins -= diff; seller.earn(diff); swapHomes(s, seller); st.newMoney[s.id] = G.env.day; st.ruined[seller.id] = G.env.day; log(`🏠 The rising ${s.name.surname} family buys the ${tier === 'mansion' ? 'walled mansion' : 'tiled house'} of the struggling ${seller.name.surname}s for ${diff} nyang and their old home. The two families pass each other in the lane, carrying their bundles.`, 'story', s.pos); return true; } }
    }
    if (!s.finery && c >= 140 && chance(0.6)) { s.coins -= 90; setFinery(s, true); s.addMoodlet('finery', 'Dressed in silk', 12, 4320); log(`${s.name.full} is seen in a new silk hanbok. Business must be good.`, 'story', s.pos); return true; }
    if (!(s.horse && !s.horse.dead) && c >= 240 && A) { const horse = A.list.filter((a) => a.type === 'horse' && a.forSale && !a.dead).sort((a, b) => a.forSale - b.forSale)[0]; if (horse && c >= horse.forSale + 60) { A.buyHorse(s, horse); return true; } }
    if ((h.level || 0) < 3) { const cost = [120, 260, 520][h.level || 0]; if (c >= cost * 2 && h.owner === s.id) { E().renovate(s, h); return true; } }
    const SV = sys('servants'); const mine = SV ? SV.all().filter((x) => x.serf.master === s.id).length : 0;
    if (SV?.hire && c >= 320 && mine < (h.tier === 'mansion' ? 3 : 1) && (TIER[h.tier] ?? 1) >= 1) { const kind = c > 600 && chance(0.5) ? 'bond' : 'hired'; s.coins -= kind === 'bond' ? 120 : 20; const sv = SV.hire(h, kind, s); log(`The ${s.name.surname} household ${kind === 'bond' ? 'buys a bondservant' : 'takes on a farmhand'}, ${sv.name.given}. They have come up in the world.`, 'story', s.pos); return true; }
    if (!s.factions?.court && s.sex === 'm' && c >= 650 && s.needs.honor >= 35 && ['farmer', 'merchant', 'scholar', 'innkeeper', 'fisher', 'hunter', 'noble'].includes(s.job)) { s.coins -= 400; G.factions.join(s, 'court', true); s.factions.court.rank = 1; s.needs.honor = Math.min(100, s.needs.honor + 10); log(`📜 ${s.name.full} pays 400 nyang of grain into the royal granary and is granted a minor court rank (납속). The old families mutter about bought titles.`, 'decree', s.pos); return true; }
    // the generous rich
    if (c >= 400 && (s.has?.('Gentle') || s.has?.('Pious')) && chance(0.3)) { const poor = G.sims.filter((o) => !o.dead && o.faction === 'village' && o.coins < 15 && o !== s).slice(0, 4); for (const p of poor) { p.earn(8); p.changeRel(s, 10); } if (poor.length) { s.coins -= poor.length * 8; s.needs.honor = Math.min(100, s.needs.honor + 6); log(`${s.name.full} sends rice and silver to ${poor.length} poor households. They will not forget.`, 'story', s.pos); } return true; }
    return false;
  }
  // ------- the fall -------
  function fall(s) {
    const h = s.home; const SV = sys('servants'); const A = G.animals;
    const mine = SV ? SV.all().filter((x) => x.serf.master === s.id) : [];
    const hired = mine.find((x) => x.serf.kind === 'hired');
    if (hired) { hired.serf = null; hired.missionLock = false; hired.job = 'farmer'; hired.uniform = null; hired.rebuildModel(); log(`The ${s.name.surname} household can no longer pay its farmhand. ${hired.name.given} packs and leaves.`, 'story', s.pos); return true; }
    const bond = mine.find((x) => x.serf.kind === 'bond');
    if (bond) { s.earn(80); log(`⛓ Ruin at the ${s.name.surname} house: the bondservant ${bond.name.given} is sold to a broker for 80 nyang to pay the creditors.`, 'story', s.pos); bond.dispose?.(); bond.removed = true; bond.dead = true; return true; }
    if (s.horse && !s.horse.dead) { const horse = s.horse; horse.owner = null; horse.setTack?.(false); horse.forSale = 140; s.horse = null; s.earn(90); log(`${s.name.full} sells the family horse to pay debts. It stands at the roadside with a price tied to its bridle.`, 'story', s.pos); return true; }
    if (s.finery) { setFinery(s, false); s.earn(30); s.addMoodlet('pawned', 'Pawned my silks', -8, 2880); log(`${s.name.full}'s silk hanbok goes to the pawnbroker. They are back in coarse hemp.`, 'story', s.pos); return true; }
    if (h && (TIER[h.tier] ?? 1) > 0 && h.owner === s.id) {
      const down = vacant().filter((v) => (TIER[v.tier] ?? 1) < (TIER[h.tier] ?? 1)).sort((a, b) => E().houseValue(a) - E().houseValue(b))[0];
      if (down) { const gain = Math.round(E().houseValue(h) * 0.7) - E().houseValue(down); moveFamily(s, down, 'down'); s.earn(Math.max(0, gain)); st.ruined[s.id] = G.env.day; for (const m of [s, ...kinOf(s)]) m.addMoodlet('ruined', 'Lost our home', -20, 4320); s.needs.honor = Math.max(0, s.needs.honor - 15); log(`💔 The ${s.name.surname} family has lost everything. Their ${h.tier === 'mansion' ? 'mansion' : 'house'} is sold to the creditors and they carry their bundles down to a ${down.tier}.`, 'danger', { x: down.x, z: down.z }); fairWeather(s); return true; }
    }
    // nowhere cheaper stands empty: the creditors seize the house, and the family stays on as tenants
    if (h && h.owner === s.id && (TIER[h.tier] ?? 1) > 0 && s.coins < 8) { h.owner = null; s.earn(Math.round(E().houseValue(h) * 0.25)); s.debt = null; st.ruined[s.id] = G.env.day; s.needs.honor = Math.max(0, s.needs.honor - 15); for (const m of [s, ...kinOf(s)]) m.addMoodlet('ruined', 'Our house belongs to the creditors', -18, 4320); log(`💔 Creditors seize the ${s.name.surname} family's house. They live on in it as tenants, paying rent on the rooms they were born in.`, 'danger', s.pos); fairWeather(s); return true; }
    if (s.factions?.court && s.factions.court.rank <= 2 && chance(0.3)) { s.factions.court.rank = 0; log(`${s.name.full}, unable to keep up appearances, quietly resigns from the court.`, 'story', s.pos); return true; }
    // destitution: crime, kin, or begging
    if (s.coins <= 3) {
      const rich = G.sims.find((o) => !o.dead && o !== s && !o.household && o.name.surname === s.name.surname && o.coins > 200 && o.getRel(s).f > -10);
      if (rich && chance(0.5)) { rich.coins -= 60; s.earn(60); s.changeRel(rich, 30); log(`${rich.name.full} hears of a kinsman's ruin and sends 60 nyang. "Blood is thicker than water."`, 'story', s.pos); return true; }
      if ((s.has?.('Cunning') || s.has?.('Hot-headed') || s.has?.('Greedy')) && chance(0.25) && !s.outlaw) { s.outlaw = true; s.bounty = 20; log(`🌙 With nothing left, ${s.name.full} falls in with thieves. Purses start going missing in the market.`, 'danger', s.pos); return true; }
    }
    return false;
  }
  function fairWeather(s) {
    for (const o of G.sims) {
      if (o.dead || o === s || o.household) continue; const r = o.getRel(s);
      if (r.f > 25 && (o.has?.('Ambitious') || o.has?.('Greedy')) && chance(0.6)) { o.changeRel(s, -20); }
      else if (r.f > 45 && (o.has?.('Loyal') || o.has?.('Gentle')) && o.coins > 50 && chance(0.6)) { o.coins -= 25; s.earn(25); s.changeRel(o, 25); log(`When others look away, ${o.name.full} brings the ruined ${s.name.surname}s a sack of rice and 25 nyang. A true friend.`, 'story', s.pos); break; }
    }
  }
  // ------- strokes of fortune -------
  const UPS = [
    [(s) => s.job === 'merchant' ? 3 : 1, (s) => { const n = 120 + Math.floor(Math.random() * 260); s.earn(n); return `${s.name.full}'s cargo of ginseng sells in the capital for ${n} nyang.`; }],
    [() => 1, (s) => { const n = 80 + Math.floor(Math.random() * 200); s.earn(n); return `A distant uncle dies childless and leaves ${s.name.full} ${n} nyang.`; }],
    [(s) => (s.job === 'hunter' || s.job === 'farmer' ? 2 : 0.5), (s) => { const n = 150 + Math.floor(Math.random() * 150); s.earn(n); return `${s.name.full} digs up a wild mountain ginseng root the size of a child's arm. A merchant pays ${n} nyang on the spot.`; }],
  ];
  const DOWNS = [
    [(s) => (s.has?.('Greedy') || s.has?.('Hot-headed') ? 3 : 0.6), (s) => { const n = Math.round(s.coins * 0.7); s.coins -= n; return `${s.name.full} gambles through the night at the tavern and loses ${n} nyang at cards.`; }],
    [(s) => (s.job === 'merchant' ? 2.5 : 0.8), (s) => { const n = Math.round(s.coins * 0.6); s.coins -= n; return `A ship carrying ${s.name.full}'s goods sinks in a storm. ${n} nyang gone.`; }],
    [() => 0.8, (s) => { const n = Math.round(s.coins * 0.5); s.coins -= n; if (s.home) s.home.level = Math.max(0, (s.home.level || 0) - 1); return `Fire in the ${s.name.surname} storehouse! ${n} nyang of goods turn to ash.`; }],
    [(s) => (s.coins > 300 ? 1.5 : 0.3), (s) => { const n = Math.round(s.coins * 0.5); s.coins -= n; s.debt = null; return `A magistrate's clerk finds "irregularities" in ${s.name.full}'s tax papers. The fine: ${n} nyang.`; }],
  ];
  const roll = (list, s) => { const w = list.map(([f]) => f(s)); let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i][1]; } return list[0][1]; };

  function daily() {
    const hs = heads();
    for (const s of hs) {
      // a stroke of luck or ruin, now and then
      if (chance(0.012)) log(`✨ ${roll(UPS, s)(s)}`, 'story', s.pos);
      else if (s.coins > 40 && chance(0.012)) log(`🌧 ${roll(DOWNS, s)(s)}`, 'danger', s.pos);
      const b = bandOf(s); const prev = st.band[s.id] ?? b; st.band[s.id] = b; st.peak[s.id] = Math.max(st.peak[s.id] ?? b, b);
      if (b > prev && b >= 3) log(`The ${s.name.surname} family is now counted among the ${bandName(b)}.`, 'story', s.pos);
      // a rising family spends; a falling one sells
      if (s.coins >= 140 && chance(0.4)) rise(s);
      else if ((s.coins < 8 || (s.debt && s.debt.due < G.env.day)) && chance(0.6)) fall(s);
    }
    // the player household
    const me = G.household[0]; if (!me) return;
    const pb = G.household.reduce((m, x) => Math.max(m, bandOf(x)), 0); const prev = st.band.player ?? pb; st.band.player = pb;
    if (pb > prev) { G.ui?.toast(`📈 Your family is now counted among the ${bandName(pb)}. ${pb >= 4 ? 'Merchants bow lower, matchmakers call, and poor relations will soon come knocking.' : 'People notice.'}`, 'festival'); sys('missions')?.addFame?.(me, 'heart', 3); }
    if (pb < prev) G.ui?.toast(`📉 Your family has fallen to ${bandName(pb)}. ${pb <= 1 ? 'Sell what you must, beg your kin — or turn to darker work.' : 'Tongues are wagging.'}`, 'danger');
  }

  const S = {
    id: 'fortune', st, bandOf, rise, fall,
    onEvent(name) { if (name === 'day') { try { daily(); } catch (e) { console.error('[fortune]', e); } } },
    simMenuItems(me, o) {
      if (!me.household || o === me || o.household) return [];
      const out = [];
      if (st.ruined[o.id] != null && G.env.day - st.ruined[o.id] < 10 && !st.helped[o.id + ':' + me.id]) {
        out.push({ label: `🍚 Help the ruined ${o.name.surname}s (40)`, disabled: me.coins < 40, fn: () => { me.coins -= 40; o.earn(40); o.changeRel(me, 35); st.helped[o.id + ':' + me.id] = 1; me.needs.honor = Math.min(100, me.needs.honor + 8); sys('memories')?.remember?.(o, me, `${me.name.given} helped us when we lost everything`, 35); o.say('We will never forget this.', 'happy', 4); } });
        out.push({ label: `🧑‍🌾 Offer ${o.name.given} work as your farmhand`, fn: () => { const SV = sys('servants'); if (!SV?.hire || !me.home) return; if (o.has?.('Ambitious') || o.needs.honor > 60) { o.say('I would rather starve than serve where I once dined.', 'angry', 4); o.changeRel(me, -10); return; } o.serf = { kind: 'hired', master: me.id, house: me.home.id, loyalty: 70, wage: 5 }; o.job = 'farmhand'; o.missionLock = true; o.uniform = { outfit: 'commoner', colors: { top: '#c9b896', bottom: '#8a7e6a' }, hat: 'satgat' }; o.rebuildModel(); if (o.home?.residents) o.home.residents = o.home.residents.filter((x) => x !== o); o.home = me.home; me.home.residents.push(o); G.log(`${o.name.full}, once of a proud house, bows and enters ${me.name.given}'s service.`, 'story', me.pos); } });
      }
      if (st.newMoney[o.id] != null && o.coins > 150 && !st.helped['loan:' + o.id]) out.push({ label: `🤝 Ask the newly rich ${o.name.surname}s to invest in you (50)`, fn: () => { st.helped['loan:' + o.id] = 1; const ok = o.getRel(me).f > 20 || chance(0.25); if (ok) { o.coins -= 50; me.earn(50); o.say('Why not? Fortune favours friends.', 'happy', 3); } else { o.say('Everyone wants a piece of us now…', 'talk', 3); o.changeRel(me, -5); } } });
      return out;
    },
    panelHtml(s) { if (s.household || s.dead || ROYAL.includes(s.job)) return ''; const bits = []; if (st.newMoney[s.id] != null) bits.push('💰 New money — recently rose in the world'); if (st.ruined[s.id] != null) bits.push('💔 Fallen family — lost their house'); return bits.length ? `<div class="facts">${bits.join(' · ')}</div>` : ''; },
    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
