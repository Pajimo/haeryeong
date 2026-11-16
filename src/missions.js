// GTA-style missions for a Joseon valley + Fame paths (reputation by way of life).
import * as THREE from 'three';
import { LAYOUT, BRIDGE, groundAt, riverDist, heightAt, WATER_LEVEL } from './terrain.js';
import { makeName, JOBS } from './data.js';
const JOBS_PAY = Object.fromEntries(Object.entries(JOBS).map(([k, v]) => [k, v.pay]));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const P = (s) => [s.pos.x, s.pos.z];

// missions that need a player at the controls (riding a race; sneaking past watchers) — never self-assigned
const HANDS_ON = new Set(['race', 'taxman', 'jadeseal', 'poison']);

// ---------- Fame paths ----------
export const PATHS = {
  blade: { name: 'Blade', ko: '검', icon: '⚔', titles: ['Unknown', 'Wandering Blade', 'Sword of the Valley', 'The Crimson Blade', 'Sword Saint of Haeryeong'] },
  shadow: { name: 'Shadow', ko: '影', icon: '🌑', titles: ['Unknown', 'Whisper', 'Silent Knife', 'The Faceless', 'Ghost of the Lotus'] },
  trade: { name: 'Trade', ko: '商', icon: '◆', titles: ['Unknown', 'Peddler of Note', 'Trusted Merchant', 'Merchant Prince', 'Silk Road Magnate'] },
  law: { name: 'Law', ko: '法', icon: '⛓', titles: ['Unknown', 'Watchman', 'Thief-taker', 'Terror of Outlaws', 'Iron Magistrate'] },
  heart: { name: 'Heart', ko: '情', icon: '❀', titles: ['Unknown', 'Kind Neighbour', 'Village Treasure', 'Beloved of All', 'Living Bodhisattva'] },
  hunt: { name: 'Hunt', ko: '獵', icon: '🏹', titles: ['Unknown', 'Tracker', 'Beast-slayer', 'Master of the Mountains', 'Tiger King'] },
};
const FAME_LV = [0, 20, 60, 130, 250];
export function fameLevel(f) { let l = 0; for (let i = 0; i < FAME_LV.length; i++) if (f >= FAME_LV[i]) l = i; return l; }

// ---------- Places ----------
function places(G) {
  const S = G.world.spots;
  return {
    plaza: [4, 4], market: S.market || [0, 78], jumak: S.jumak || [27, 15], temple: S.temple || LAYOUT.temple, palace: S.palaceGate || [LAYOUT.palace[0], -146],
    bamboo: [LAYOUT.bamboo[0][0], LAYOUT.bamboo[0][1]], bamboo2: [LAYOUT.bamboo[1][0], LAYOUT.bamboo[1][1]], pampas: [LAYOUT.pampas[0][0], LAYOUT.pampas[0][1]],
    bridgeW: BRIDGE.a, bridgeE: [BRIDGE.b[0] + 6, BRIDGE.b[1] - 2], training: LAYOUT.training, fields: S.fields || [0, 160], camp: LAYOUT.banditCamp,
    stable: S.stable || [40, 105], pavilion: S.pavilion || [122, 100], police: S.police || [-95, -14], south: [8, 300], swing: S.swing || [-18, -10],
  };
}

// ---------- Stage helpers ----------
// each stage: { text, where(M)->[x,z]|null, radius, start(M), tick(M,gm)->'ok'|'fail:reason'|null, time (game min limit) }
const goto = (text, where, radius = 4, extra = {}) => ({ text, where: (M) => (typeof where === 'function' ? where(M) : where), radius, tick: (M) => (d2(P(M.actor), M.stage.where(M)) < radius ? 'ok' : null), ...extra });
const talk = (text, who) => ({ text, where: (M) => { const s = who(M); return s ? P(s) : null; }, radius: 3, tick: (M) => { const s = who(M); if (!s || s.dead) return 'fail:They are gone.'; if (s.pos.distanceTo(M.actor.pos) < 2.6) { s.faceLook = M.actor; return 'ok'; } return null; } });
const kill = (text, targets, extra = {}) => ({ text, where: (M) => { const t = targets(M).find((x) => !x.dead); return t ? P(t) : null; }, radius: 3,
  tick: (M) => { const ts = targets(M); const alive = ts.filter((x) => !x.dead); for (const t of alive) if (!t.combat.target && !t.controlled && t.pos.distanceTo(M.actor.pos) < (extra.aggro || 16)) t.startFight(M.actor); return alive.length ? null : 'ok'; }, ...extra });
const wait = (text, minutes, where = null) => ({ text, where: () => where, radius: 0, start: (M) => { M.v.waitT = minutes; }, tick: (M, gm) => ((M.v.waitT -= gm) <= 0 ? 'ok' : null) });

// ---------- Spawning ----------
function thug(G, x, z, o = {}) {
  const s = G.spawn({ sex: o.sex || (Math.random() < 0.85 ? 'm' : 'f'), age: 'adult', job: o.job || 'bandit', faction: o.faction || 'bandit', x: x + rr(-2, 2), z: z + rr(-2, 2), skillSword: o.skill ?? rr(3, 6), uniform: o.uniform, armed: true });
  if (o.name) s.name = { ...s.name, full: o.name, given: o.name.split(' ').pop() };
  if (o.hp) { s.maxHp = o.hp; s.hp = o.hp; }
  s.missionLock = true; s.missionSpawn = true;
  return s;
}
function npc(G, x, z, o = {}) {
  const s = G.spawn({ sex: o.sex || 'm', age: o.age || 'adult', job: o.job || 'merchant', faction: 'village', x, z, ...o });
  s.missionLock = true; s.missionSpawn = true;
  return s;
}
function follower(M, s, dist = 2.5, run = false) {
  const a = M.actor; const d = s.pos.distanceTo(a.pos);
  if (s.combat.target) return;
  // hysteresis: start following beyond dist + 3, stop inside dist, and only re-aim when the leader has moved on
  const goingTo = s.action?.type === 'goto' ? s.action.dest : null;
  if (d > dist + 3 || (goingTo && d > dist)) {
    const stale = !goingTo || Math.hypot(goingTo[0] - a.pos.x, goingTo[1] - a.pos.z) > 4;
    if (stale) { s.cancelAction(); s.startAction({ type: 'goto', dest: [a.pos.x, a.pos.z], run: run || d > 9, label: 'Following' }); }
  } else if (goingTo && d <= dist) { s.cancelAction(); s.char.setAnim('idle'); }
}

// ---------- Mission catalogue ----------
// giver: job(s) whose villagers offer it; path: fame path; min: fame level needed
function catalogue(G) {
  const L = places(G);
  return [
    // ===== BLADE =====
    { id: 'butcher', path: 'blade', min: 0, giver: ['innkeeper', 'police', 'farmer'], title: 'The Butcher of the Bamboo Grove', ko: '대숲의 백정', pay: 60, fame: 15,
      brief: 'A brute who calls himself “the Butcher” and two thugs are robbing travellers in the bamboo grove. The jumak pays a bounty for his head.',
      stages: [goto('Travel to the bamboo grove', L.bamboo, 14),
        { ...kill('Defeat the Butcher and his thugs', (M) => M.v.foes), start: (M) => { M.v.foes = [thug(G, L.bamboo[0], L.bamboo[1], { name: 'the Butcher Gwak', skill: 6.5, hp: 190 }), thug(G, L.bamboo[0] + 3, L.bamboo[1] + 2), thug(G, L.bamboo[0] - 3, L.bamboo[1] - 2)]; M.v.foes[0].say('Fresh meat walks into my grove!', 'shout'); } },
        goto('Return to the jumak for your bounty', L.jumak, 5)] },
    { id: 'bodyguard', path: 'blade', min: 1, giver: ['noble', 'official'], title: 'A Minister’s Shadow', ko: '대감의 그림자', pay: 120, fame: 25,
      brief: 'Minister {giver} must travel from the palace gate to the temple to pray. He has enemies. Walk beside him — and keep him breathing.',
      stages: [goto('Meet the minister at the palace gate', L.palace, 6),
        { text: 'Escort the minister to the temple', where: () => L.temple, radius: 8,
          start: (M) => { const g = M.giver; M.v.vip = g; g.missionLock = true; M.v.amb = false; },
          tick: (M) => { const v = M.v.vip; if (!v || v.dead) return 'fail:The minister was slain.'; follower(M, v, 2.2);
            if (!M.v.amb && d2(P(v), L.palace) > 70) { M.v.amb = true; const x = v.pos.x + 12, z = v.pos.z + 8; M.v.ass = [0, 1, 2].map(() => thug(G, x, z, { name: 'Masked assassin', skill: rr(5, 7), uniform: { colors: { top: '#121214', bottom: '#121214' }, hat: 'headband', weapon: true } })); for (const a of M.v.ass) a.startFight(v); G.ui.toast('⚔ Ambush! Protect the minister!', 'danger'); G.audio.alarm(); }
            if (M.v.ass) for (const a of M.v.ass) if (!a.dead && !a.combat.target) a.startFight(Math.random() < 0.5 ? v : M.actor);
            return d2(P(v), L.temple) < 10 && (!M.v.ass || M.v.ass.every((a) => a.dead)) ? 'ok' : null; },
          end: (M) => { if (M.v.vip) M.v.vip.missionLock = false; } }] },
    { id: 'sevenblades', path: 'blade', min: 2, giver: ['swordsman', 'general'], title: 'Duel of the Three Masters', ko: '삼검 대결', pay: 150, fame: 40,
      brief: 'Three masters from beyond the mountains await at the training ground. Defeat them one after another — honourably, to yielding.',
      stages: [goto('Enter the training ground', L.training, 10),
        ...[0, 1, 2].map((i) => ({ text: `Defeat master ${i + 1} of 3`, where: () => L.training, radius: 0,
          start: (M) => { const m = npc(G, L.training[0] + 4, L.training[1], { job: 'swordsman', skillSword: 6 + i * 1.3 }); m.name = { ...m.name, full: ['Kim the Willow', 'Seo the Thunder', 'Old Master Baek'][i], given: ['Willow', 'Thunder', 'Baek'][i] }; m.maxHp = m.hp = 150 + i * 30; M.v.cur = m; m.say(['Show me your stance.', 'Your blade or your pride — one will break.', 'Hm. Let us begin, child.'][i], 'shout'); G.startDuel(m, M.actor); },
          tick: (M) => { const m = M.v.cur; if (m.action?.type === 'yield' || m.dead) return 'ok'; if (M.actor.action?.type === 'yield' || M.actor.hp < M.actor.maxHp * 0.26) return 'fail:You yielded.'; if (!m.combat.target && !M.actor.combat.target && m.pos.distanceTo(M.actor.pos) < 30) G.startDuel(m, M.actor); return null; } }))] },
    { id: 'rescue', path: 'blade', min: 1, giver: ['merchant', 'farmer', 'innkeeper'], title: 'The Merchant’s Daughter', ko: '상인의 딸', pay: 140, fame: 30,
      brief: '{giver}’s daughter was taken by the western bandits for ransom. Bring her home alive.',
      stages: [goto('Go to the bandit camp in the western woods', L.camp, 22),
        { ...kill('Cut down her captors', (M) => M.v.guards, { aggro: 22 }), start: (M) => { M.v.girl = npc(G, L.camp[0] + 2, L.camp[1] + 2, { sex: 'f', age: 'young', job: 'merchant' }); M.v.girl.char.setAnim('kneel'); M.v.girl.missionLock = true; M.v.guards = [0, 1, 2, 3].map(() => thug(G, L.camp[0], L.camp[1])); } },
        { text: 'Bring the girl home to the market', where: () => L.market, radius: 8, tick: (M) => { const g = M.v.girl; if (g.dead) return 'fail:The girl was killed.'; follower(M, g, 2, true); return d2(P(g), L.market) < 10 ? 'ok' : null; }, end: (M) => { if (M.v.girl) { M.v.girl.missionLock = false; M.v.girl.say('Father! Father!', 'happy'); } } }] },
    // ===== SHADOW =====
    { id: 'taxman', path: 'shadow', min: 0, giver: ['lotus'], title: 'The Tax Collector’s Last Night', ko: '세리의 마지막 밤', pay: 110, fame: 25, dark: true,
      brief: 'Tax collector Byeon squeezes widows dry and drinks at the jumak each night. The Lotus wants him silenced — quietly. If the constables see the blade, you will hang.',
      stages: [{ text: 'Find Byeon near the jumak', where: () => L.jumak, radius: 18,
          start: (M) => { M.v.t = npc(G, L.jumak[0] + 4, L.jumak[1] + 6, { job: 'official', skillSword: 2 }); M.v.t.name = { ...M.v.t.name, full: 'Tax Collector Byeon', given: 'Byeon' }; M.v.t.char.setAnim('drink'); M.v.bg = [npc(G, L.jumak[0] + 5, L.jumak[1] + 8, { job: 'police' })]; },
          tick: (M) => (d2(P(M.actor), P(M.v.t)) < 18 ? 'ok' : null) },
        { text: 'Kill Byeon without the guard seeing you', where: (M) => P(M.v.t), radius: 2, tick: (M) => { if (M.v.t.dead) return 'ok'; return M.v.spotted ? null : null; }, stealth: (M) => M.v.bg },
        goto('Vanish into the bamboo grove', L.bamboo, 12, { tick2: true })] , night: true },
    { id: 'jadeseal', path: 'shadow', min: 1, giver: ['lotus'], title: 'The Jade Seal', ko: '옥새', pay: 220, fame: 40, dark: true,
      brief: 'A jade seal rests in the palace east hall. Steal it at night. Guards walk the courtyard — stay out of their sight.',
      stages: [{ text: 'Steal the jade seal from the palace (night)', where: () => [LAYOUT.palace[0] + 30, LAYOUT.palace[1] - 4], radius: 2.5, item: true,
          start: (M) => { const [x, z] = [LAYOUT.palace[0] + 30, LAYOUT.palace[1] - 4]; M.v.guards = [0, 1, 2].map((i) => { const g = npc(G, x - 8 + i * 6, z + 6, { job: 'soldier' }); g.patrol = [[x - 12, z + 8], [x + 4, z + 10], [x, z - 8]]; return g; }); },
          tick: (M) => (d2(P(M.actor), M.stage.where(M)) < 2.5 ? 'ok' : null), stealth: (M) => M.v.guards },
        goto('Deliver the seal to the shrine on the western road', [-147, 80], 4)], night: true },
    { id: 'poison', path: 'shadow', min: 2, giver: ['lotus'], title: 'Wine for the General', ko: '장군의 술', pay: 260, fame: 50, dark: true,
      brief: 'The General drinks at the royal banquet hall tonight. Slip ground monkshood into his cup at the barracks kitchen and walk away before anyone remembers your face.',
      stages: [goto('Reach the barracks kitchen unseen', [LAYOUT.palace[0] - 26, LAYOUT.palace[1] - 2], 3, { stealth: (M) => G.sims.filter((s) => s.job === 'soldier' && !s.dead && s.pos.distanceTo(M.actor.pos) < 40) }),
        wait('Poison the wine…', 5), goto('Leave the palace grounds', L.plaza, 10),
        { text: 'Wait for the news…', where: () => null, radius: 0, start: (M) => { const g = G.sims.find((s) => s.job === 'general' && !s.dead); M.v.gen = g; M.v.wt = 30; }, tick: (M, gm) => { if ((M.v.wt -= gm) > 0) return null; const g = M.v.gen; if (g && !g.dead) { g.naturalDeath = false; g.die(null); G.log(`General ${g.name.full} collapsed at the banquet, foam on his lips. The physicians whisper of poison.`, 'death', g.pos); } return 'ok'; } }], night: true },
    // ===== TRADE =====
    { id: 'ginseng', path: 'trade', min: 0, giver: ['merchant'], title: 'Ginseng Before the Bell', ko: '종 울리기 전에', pay: 70, fame: 15,
      brief: 'The abbot needs wild ginseng for a dying monk. Carry it from the market to the temple before the bell tolls — 4 hours. A horse would help.',
      stages: [goto('Collect the ginseng at the market', L.market, 6), { ...goto('Rush to the temple before the bell', L.temple, 9), time: 240 }] },
    { id: 'smuggle', path: 'trade', min: 1, giver: ['merchant'], title: 'Salt Beneath the Straw', ko: '밀소금', pay: 160, fame: 30, dark: true,
      brief: 'Untaxed salt hidden in a straw cart. Get it from the bridge to the stable without a constable getting close enough to sniff it.',
      stages: [goto('Pick up the cart at the east bridge', L.bridgeE, 6), { ...goto('Deliver to the stable', L.stable, 7), stealth: (M) => G.sims.filter((s) => s.job === 'police' && !s.dead), sight: 9 }] },
    { id: 'race', path: 'trade', min: 0, giver: ['merchant', 'swordsman', 'noble'], title: 'The Bridge Race', ko: '말 달리기', pay: 90, fame: 20, needsHorse: true,
      brief: 'Young bloods race horses from the plaza to the far side of the bridge and back to the stable. Winner takes the purse.',
      stages: [{ text: 'Mount your horse at the plaza', where: () => L.plaza, radius: 8, tick: (M) => (M.actor.mount && d2(P(M.actor), L.plaza) < 10 ? 'ok' : null),
          start: (M) => { if (!M.actor.horse || M.actor.horse.dead) { const h = G.animals.spawn('horse', M.actor.pos.x + 2, M.actor.pos.z, { variant: 1 }); G.animals.giveHorse(M.actor, h); G.ui.toast('The organiser lends you a horse. Press E near it to mount.'); } } },
        { text: 'Race! Reach the east bridge first', where: () => L.bridgeE, radius: 7,
          start: (M) => { M.v.riders = [0, 1].map((i) => { const r = npc(G, L.plaza[0] - 3 - i * 2, L.plaza[1] + 2, { job: 'swordsman' }); const h = G.animals.spawn('horse', r.pos.x, r.pos.z, { variant: 3 + i }); h.setTack(true); G.animals.mount(r, h); r.startAction({ type: 'goto', dest: L.bridgeE, run: true, label: 'Racing!' }); return r; }); G.audio.drum(); G.ui.toast('🐎 GO!', 'festival'); },
          tick: (M) => { if (M.v.riders.some((r) => d2(P(r), L.bridgeE) < 7)) M.v.lostLeg1 = true; return d2(P(M.actor), L.bridgeE) < 7 ? 'ok' : null; } },
        { text: 'Race back to the stable!', where: () => L.stable, radius: 8,
          start: (M) => { for (const r of M.v.riders) { r.cancelAction(); r.startAction({ type: 'goto', dest: L.stable, run: true, label: 'Racing!' }); } },
          tick: (M) => { if (d2(P(M.actor), L.stable) < 8) return 'ok'; if (M.v.riders.some((r) => d2(P(r), L.stable) < 8)) return 'fail:A rival crossed the line first.'; return null; },
          end: (M) => { for (const r of M.v.riders || []) { if (r.mount) G.animals.dismount(r); r.missionLock = false; } } }] },
    // ===== LAW =====
    { id: 'nightthief', path: 'law', min: 0, giver: ['police'], title: 'The Rooftop Thief', ko: '지붕 위의 도둑', pay: 70, fame: 20,
      brief: 'A thief is breaking into houses near the plaza. Catch him — beat him into yielding and he goes to the cage.',
      stages: [{ text: 'Find the thief near the plaza', where: (M) => (M.v.th ? P(M.v.th) : L.plaza), radius: 10, start: (M) => { M.v.th = thug(G, L.plaza[0] + rr(-20, 20), L.plaza[1] + rr(-20, 20), { job: 'merchant', faction: 'village', skill: 3 }); M.v.th.outlaw = true; M.v.th.bounty = 40; M.v.th.name = { ...M.v.th.name, full: 'Rat-faced Choe', given: 'Choe' }; }, tick: (M) => (M.v.th.pos.distanceTo(M.actor.pos) < 10 ? 'ok' : null) },
        { text: 'Chase him down and subdue him!', where: (M) => P(M.v.th), radius: 0, start: (M) => { const t = M.v.th; t.say('The law! Run!', 'shout'); t.startAction({ type: 'flee', dest: L.bamboo, label: 'Fleeing!' }); },
          tick: (M) => { const t = M.v.th; if (t.dead) return 'ok'; if (t.jailed) return 'ok'; if (t.action?.type === 'yield') { G.economy.jail(t, M.actor); return 'ok'; } if (t.pos.distanceTo(M.actor.pos) > 70) return 'fail:The thief got away.'; if (t.pos.distanceTo(M.actor.pos) < 3 && !t.combat.target) { t.startFight(M.actor, true); M.actor.combat.nonlethal = true; } return null; } }] },
    { id: 'whodunit', path: 'law', min: 1, giver: ['police'], title: 'Death at the Well', ko: '우물가의 죽음', pay: 130, fame: 35,
      brief: 'A peddler was found dead by the well. Question three witnesses, then arrest the one whose story doesn’t hold.',
      stages: [...[0, 1, 2].map((i) => ({ ...talk(`Question witness ${i + 1}/3`, (M) => M.v.w?.[i]), start: (M) => { if (!M.v.w) { M.v.w = G.sims.filter((s) => !s.dead && !s.household && s.faction === 'village' && s.age !== 'child' && !['king', 'queen', 'police'].includes(s.job) && s.pos.length() < 120).sort(() => Math.random() - 0.5).slice(0, 3); M.v.culprit = pick(M.v.w); } }, end: (M) => { const w = M.v.w[i]; w.say(w === M.v.culprit ? pick(['I was… asleep. Yes, asleep.', 'Why do you look at me like that?']) : pick(['I saw a shadow near the well at the Hour of the Rat.', 'Ask the one with mud on their sleeves…', 'I heard shouting, then nothing.']), 'talk', 5); } })),
        { text: 'Arrest the guilty one (subdue them)', where: (M) => P(M.v.culprit), radius: 0, start: (M) => { const c = M.v.culprit; c.outlaw = true; c.bounty = 80; G.ui.toast(`Your instincts point to ${c.name.full}.`); },
          tick: (M) => { const c = M.v.culprit; if (c.jailed || c.dead) return 'ok'; if (c.action?.type === 'yield') { G.economy.jail(c, M.actor); return 'ok'; } if (c.pos.distanceTo(M.actor.pos) < 3 && !c.combat.target) { c.startFight(M.actor, true); } return null; } }] },
    // ===== HEART =====
    { id: 'twins', path: 'heart', min: 0, giver: ['noble', 'official', 'merchant'], title: 'The Terrible Twins', ko: '말썽꾸러기 쌍둥이', pay: 50, fame: 15,
      brief: '{giver} must attend court and needs someone to mind the twins at the market for two hours. “They are angels,” {giver} says, not making eye contact.',
      stages: [goto('Collect the twins at the market', L.market, 8),
        { text: 'Keep the twins happy and in sight (click them → Play / Scold)', where: (M) => { const k = M.v.kids?.slice().sort((a, b) => b.pos.distanceTo(M.actor.pos) - a.pos.distanceTo(M.actor.pos))[0]; return k ? P(k) : null; }, radius: 0, time: 120, timeOk: true,
          start: (M) => { M.v.kids = ['Dol-i', 'Bok-i'].map((n, i) => { const k = npc(G, L.market[0] + i, L.market[1] + 2, { age: 'child', job: 'child', sex: i ? 'f' : 'm' }); k.name = { ...k.name, given: n, full: n }; k.joy = 70; return k; }); M.v.wT = 0; },
          tick: (M, gm) => { for (const k of M.v.kids) { k.joy -= gm * 0.35; const d = k.pos.distanceTo(M.actor.pos);
              if (d > 45) return `fail:${k.name.given} wandered off and got lost!`; if (k.joy <= 0) return `fail:${k.name.given} threw a tantrum so loud the whole market complained.`;
              if (riverDist(k.pos.x, k.pos.z) < 13) { k.say('Splash! Splash!', 'happy'); if (Math.random() < 0.005) return `fail:${k.name.given} fell in the river! (they're fine. You are not.)`; }
              if (!k.action || Math.random() < gm * 0.03) { const dest = Math.random() < 0.2 ? [k.pos.x + rr(-35, 35), k.pos.z + rr(-35, 35)] : [M.actor.pos.x + rr(-14, 14), M.actor.pos.z + rr(-14, 14)]; k.cancelAction(); k.startAction({ type: 'goto', dest, run: Math.random() < 0.5, label: 'Causing chaos' }); if (Math.random() < 0.3) k.say(pick(['Catch me!', 'I want rice cakes!', 'Dol-i hit me!', 'Look, a chicken!', 'I’m going to see the horses!', 'Waaah!']), 'shout'); } }
            return null; } },
        goto('Return the twins to their parent at the market', L.market, 8)] },
    { id: 'loveletter', path: 'heart', min: 0, giver: ['farmer', 'fisher', 'hunter'], title: 'Ink and Longing', ko: '연서', pay: 30, fame: 15,
      brief: '{giver} is too shy to speak to the one they love. Carry this love letter to them in secret — and come back with an answer.',
      stages: [{ ...talk('Deliver the letter to {crush}', (M) => M.v.crush), start: (M) => { const g = M.giver; M.v.crush = G.sims.filter((s) => !s.dead && s.sex !== g.sex && !s.spouse && s.age !== 'child' && s.faction === 'village' && s !== M.actor && !s.household).sort((a, b) => a.pos.distanceTo(g.pos) - b.pos.distanceTo(g.pos))[0]; if (!M.v.crush) return; M.title2 = M.v.crush.name.full; } , end: (M) => { const c = M.v.crush; M.v.yes = Math.random() < 0.65 + M.actor.skills.charisma * 0.03; c.say(M.v.yes ? '(reads, blushes deeply) Tell them… yes.' : '(reads) …I am sorry. My heart is elsewhere.', M.v.yes ? 'love' : 'sad', 6); } },
        { ...talk('Bring the answer back to {giver}', (M) => M.giver), end: (M) => { const g = M.giver, c = M.v.crush; if (M.v.yes) { g.changeRel(c, 20, 35); g.say('Truly?! I could fly!', 'love'); G.log(`Thanks to a letter carried by ${M.actor.name.full}, ${g.name.full} and ${c.name.full} are courting.`, 'love', g.pos); } else { g.addMoodlet('rejected', 'Rejected', -15, 720); g.say('…I see. Thank you, friend.', 'sad'); } } }] },
    { id: 'lostdog', path: 'heart', min: 0, giver: ['farmer', 'merchant', 'innkeeper', 'child'], title: 'Where Is Baduk?', ko: '바둑이를 찾아서', pay: 25, fame: 10,
      brief: '{giver}’s dog Baduk ran off after a rabbit and hasn’t come home. Someone saw him heading toward the fields.',
      stages: [{ text: 'Search the fields for Baduk', where: (M) => M.v.dogPos, radius: 4, start: (M) => { M.v.dogPos = [L.fields[0] + rr(-40, 40), L.fields[1] + rr(-30, 30)]; const d = G.animals.spawn('dog', M.v.dogPos[0], M.v.dogPos[1], { variant: 1, petName: 'Baduk' }); d.range = 2; d.home = M.v.dogPos; M.v.dog = d; },
          tick: (M) => { const d = M.v.dog; M.v.dogPos = [d.pos.x, d.pos.z]; return d.pos.distanceTo(M.actor.pos) < 4 ? 'ok' : null; } },
        { text: 'Bring Baduk home', where: (M) => (M.giver ? P(M.giver) : L.plaza), radius: 4, start: (M) => { M.v.dog.owner = M.actor; M.v.dog.state = 'follow'; }, tick: (M) => (M.v.dog.pos.distanceTo(M.giver.pos) < 5 ? 'ok' : null), end: (M) => { const d = M.v.dog; d.owner = M.giver; d.home = P(M.giver); M.giver.pet = d; } }] },
    { id: 'grandma', path: 'heart', min: 1, giver: ['farmer', 'merchant'], title: 'Grandmother’s Last Wish', ko: '할머니의 소원', pay: 40, fame: 25,
      brief: 'Old {giver}’s mother is too frail to walk, but she wishes to see the river pavilion one last time. Walk with her slowly — she cannot hurry.',
      stages: [{ text: 'Escort Grandmother to the riverside pavilion (stay close, walk slowly)', where: () => L.pavilion, radius: 9,
          start: (M) => { M.v.gm = npc(G, M.giver.pos.x + 1, M.giver.pos.z + 1, { sex: 'f', age: 'elder', job: 'farmer' }); M.v.gm.name = { ...M.v.gm.name, full: 'Grandmother ' + M.giver.name.surname, given: 'Grandmother' }; },
          tick: (M) => { const g = M.v.gm; if (g.dead) return 'fail:Grandmother has passed.'; follower(M, g, 2, false); if (M.actor.moving && (M.actor.curSpeed || 0) > 3 && g.pos.distanceTo(M.actor.pos) > 8) g.say('Aigo… slower, child, slower…', 'sad'); return d2(P(g), L.pavilion) < 10 ? 'ok' : null; } },
        { ...wait('Sit with her as the light falls on the water', 20), end: (M) => { const g = M.v.gm; g.say('Ah… it is just as I remember. Thank you.', 'happy', 6); G.log(`${M.actor.name.full} walked old ${g.name.full} to the river one last time. She smiled the whole way home.`, 'love', g.pos); g.missionLock = false; } }] },
    // ===== HUNT =====
    { id: 'boars', path: 'hunt', min: 0, giver: ['farmer'], title: 'Tusks in the Paddies', ko: '논밭의 멧돼지', pay: 60, fame: 15,
      brief: 'Wild boars are tearing up the paddies at night. Kill three of them before the harvest is ruined.',
      stages: [{ text: 'Slay the boars in the paddies (0/3)', where: (M) => { const b = M.v.boars?.find((x) => !x.dead); return b ? [b.pos.x, b.pos.z] : null; }, radius: 0,
          start: (M) => { M.v.boars = [0, 1, 2].map(() => { const b = G.animals.spawn('boar', L.fields[0] + rr(-30, 30), L.fields[1] + rr(-20, 20)); b.range = 25; return b; }); },
          tick: (M) => { const n = M.v.boars.filter((b) => b.dead).length; M.stageText = `Slay the boars in the paddies (${n}/3)`; for (const b of M.v.boars) if (!b.dead && b.pos.distanceTo(M.actor.pos) < 9 && b.state !== 'attack') { b.state = 'attack'; b.target = M.actor; b.t = 60; } return n >= 3 ? 'ok' : null; } }] },
    { id: 'tigerhunt', path: 'hunt', min: 2, giver: ['hunter', 'general', 'king'], title: 'The Tiger of Inwang Ridge', ko: '인왕산 호랑이', pay: 300, fame: 70,
      brief: 'A man-eating tiger stalks the northern ridge. The court offers 300 nyang and eternal glory to whoever brings back its pelt.',
      stages: [{ text: 'Track the tiger into the mountains', where: (M) => (M.v.tg ? [M.v.tg.pos.x, M.v.tg.pos.z] : null), radius: 20, start: (M) => { const t = G.animals.list.find((a) => a.type === 'tiger' && !a.dead) || G.animals.spawn('tiger', -60, -330, { range: 60 }); M.v.tg = t; }, tick: (M) => (M.v.tg.dead ? 'ok' : M.v.tg.pos.distanceTo(M.actor.pos) < 20 ? 'ok' : null) },
        { text: 'Kill the tiger', where: (M) => [M.v.tg.pos.x, M.v.tg.pos.z], radius: 0, start: (M) => { const t = M.v.tg; t.state = 'attack'; t.target = M.actor; t.t = 999; G.audio.alarm(); G.ui.toast('🐯 The tiger charges!', 'danger'); }, tick: (M) => (M.v.tg.dead ? 'ok' : null) },
        goto('Bring the pelt to the palace gate', L.palace, 7)] },
  ];
}

// ---------- The system ----------
export function createMissionsSystem(G) {
  const MS = {
    id: 'missions', G, active: null, offers: [], fame: {}, history: [], offerT: 0,
    init() {
      this.cat = null;
      G.ui?.addTopButton('🗡 Missions', 'Missions & Fame (M)', () => this.openBoard());
      addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) this.openBoard(); });
      // HUD
      const hud = document.createElement('div'); hud.id = 'mission-hud'; hud.className = 'hidden'; document.querySelector('#ui').appendChild(hud); this.hud = hud;
      const card = document.createElement('div'); card.id = 'mission-card'; card.className = 'hidden'; document.body.appendChild(card); this.card = card;
      // waypoint beacon
      const g = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcf6a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 30; const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 40), new THREE.MeshBasicMaterial({ color: '#ffcf6a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(beam, ring); g.visible = false; G.scene.add(g); this.beacon = g; this.ring = ring;
      // giver markers
      this.markerMat = new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8b030'; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.fill(); x.strokeStyle = '#7a1a12'; x.lineWidth = 4; x.stroke(); x.fillStyle = '#2a1410'; x.font = 'bold 40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 32, 34); return new THREE.CanvasTexture(c); })(), depthTest: false, transparent: true });
      this.markers = new Map();
    },
    famePts(s, path) { return (this.fame[s.id] ||= {})[path] || 0; },
    addFame(s, path, n) {
      if (!s?.household) return; const f = (this.fame[s.id] ||= {}); const before = fameLevel(f[path] || 0); f[path] = Math.max(0, (f[path] || 0) + n); const after = fameLevel(f[path]);
      if (after > before) { const t = PATHS[path].titles[after]; G.log(`${s.name.full} is now known across the valley as “${t}”.`, 'tournament', s.pos); G.ui.toast(`${PATHS[path].icon} Fame rises: ${s.name.given} is “${t}”`, 'festival'); s.addMoodlet('fame' + path, `Famous: ${t}`, 12, 2880); }
    },
    titleOf(s) { const f = this.fame[s.id]; if (!f) return null; let best = null, bv = 0; for (const p in f) if (f[p] > bv && p !== 'shadow') { bv = f[p]; best = p; } const l = fameLevel(bv); return l ? { path: best, title: PATHS[best].titles[l], level: l } : null; },

    onEvent(name, p) {
      if (name === 'duel' && p.winner?.household) this.addFame(p.winner, 'blade', 6);
      if (name === 'death' && p.killer?.household) { const v = p.sim; if (v.faction === 'bandit' || v.faction?.startsWith?.('enemy')) this.addFame(p.killer, 'blade', 5); }
      if (name === 'steal' && p.thief?.household) this.addFame(p.thief, 'shadow', 3);
      if (name === 'death' && this.active && p.killer === this.active.actor) { const a = p.killer; a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.35); a.stamina = 100; G.ui?.floatText(a, 'Second wind!', '#9fe08a'); }
      if (name === 'ready') this.offerT = 0;
    },

    refreshOffers() {
      const cat = catalogue(G); const now = G.env.day;
      this.offers = this.offers.filter((o) => o.expires > now && o.giver && !o.giver.dead);
      const want = 6;
      let tries = 0;
      while (this.offers.length < want && tries++ < 40) {
        const m = pick(cat); if (this.offers.some((o) => o.id === m.id)) continue;
        let giver;
        if (m.giver.includes('lotus')) giver = G.factions?.leader('lotus');
        else giver = pick(G.sims.filter((s) => !s.dead && !s.household && s.faction === 'village' && m.giver.includes(s.job) && !s.missionSpawn));
        if (!giver) continue;
        this.offers.push({ id: m.id, giver, expires: now + 2 + Math.floor(Math.random() * 2) });
      }
    },

    canTake(s, m) {
      if (!s || !s.household || s.dead) return 'Select a member of your household.';
      if (s.age === 'child') return 'Too young for this.';
      if (this.active) return 'You already have an active mission.';
      const lvl = fameLevel(this.famePts(s, m.path)); if (lvl < m.min) return `Requires ${PATHS[m.path].name} fame level ${m.min} (“${PATHS[m.path].titles[m.min]}”).`;
      if (m.giver.includes('lotus') && !s.factions?.lotus) return 'Only Black Lotus members are trusted with this.';
      return null;
    },

    start(s, offer) {
      const m = catalogue(G).find((x) => x.id === offer.id); const why = this.canTake(s, m); if (why) { G.ui.toast(why); return; }
      this.offers = this.offers.filter((o) => o !== offer);
      const def = m.night ? { ...m, stages: [{ text: 'Wait for nightfall (press 3 to hurry time)', where: () => null, radius: 0, tick: () => (G.env.isNight ? 'ok' : null) }, ...m.stages] } : m;
      const M = { def, actor: s, giver: offer.giver, i: -1, v: {}, t: 0, spotted: 0 };
      this.active = M; s.missionHero = true; s.hp = Math.max(s.hp, s.maxHp * 0.85);
      this.titleCard('MISSION', m.title, m.ko, this.fill(m.brief, M));
      G.log(`${s.name.full} accepts a task: “${m.title}”.`, 'story', s.pos);
      this.next();
    },
    fill(t, M) { return t.replace(/\{giver\}/g, M.giver?.name.given || 'the patron').replace(/\{crush\}/g, M.v.crush?.name.given || M.title2 || 'them'); },
    next() {
      const M = this.active; if (!M) return;
      if (M.stage?.end) try { M.stage.end(M); } catch (e) { console.error(e); }
      M.i++;
      if (M.i >= M.def.stages.length) return this.finish(true);
      M.stage = M.def.stages[M.i]; M.st = 0; M.stageText = null;
      try { M.stage.start?.(M); } catch (e) { console.error(e); }
      G.audio?.ui();
    },
    finish(ok, reason) {
      const M = this.active; if (!M) return;
      const wasAuto = !!M.autoLock || (M.actor && !M.actor.controlled && M.actor.freeWill);
      this.releaseAuto(M);
      this.active = null; if (M.actor) M.actor.missionHero = false; this.beacon.visible = false; this.hud.classList.add('hidden'); G.env.spiritWindTarget = null;
      // Swallowing this silently is dangerous: stage end handlers are what clear missionLock on
      // escorted villagers, so a throw here froze someone out of all AI permanently.
      try { M.stage?.end?.(M); } catch (e) { console.error('[missions] stage end', e); }
      const exit = places(G).south;
      for (const k in M.v) { const v = M.v[k]; const list = Array.isArray(v) ? v : [v]; for (const x of list) {
        if (!x || x.dead || x.missionSpawn === undefined || x.removed) continue;
        if (x.jailed) continue;
        x.missionLock = true; x.endFight?.(); x.cancelAction?.();
        if (x.mount) G.animals.dismount(x);
        const dest = x.faction === 'bandit' ? LAYOUT.banditCamp : exit;
        x.startAction({ type: 'goto', dest, run: x.faction === 'bandit', label: 'Leaving', then: (z) => { if (z.faction === 'bandit') { z.missionLock = false; return; } z.dispose(); z.removed = true; } });
      } }
      const s = M.actor; const m = M.def;
      // a task they took on themselves and lost: get clear of whoever beat them and go home to mend —
      // one swordsman lingered near the assassins of a failed escort and was cut down two hours later
      if (!ok && wasAuto && s && !s.dead && !s.jailed && !s.controlled) {
        s.endFight?.(); const door = s.home?.door || [0, 0];
        s.startAction({ type: 'goto', dest: [door[0] + 1, door[1] + 1], run: true, label: 'Going home after a hard day' });
        this.cooldown = this.cooldown || {}; this.cooldown[s.id] = G.env.day + 1;
      }
      if (ok) {
        const pay = Math.round(m.pay * (1 + fameLevel(this.famePts(s, m.path)) * 0.15));
        s.earn(pay); s.needs.honor = Math.min(100, s.needs.honor + (m.dark ? 0 : 12)); this.addFame(s, m.path, m.fame);
        if (M.giver && !M.giver.dead) M.giver.changeRel(s, 18);
        s.addMoodlet('mission', 'Mission accomplished', 18, 720);
        this.titleCard('MISSION PASSED', m.title, `+${pay} nyang · +${m.fame} ${PATHS[m.path].name} fame`, '', true);
        G.log(`${s.name.full} completed “${m.title}”.`, 'tournament', s.pos);
        this.history.unshift({ t: m.title, ok: true, day: G.env.day, by: s.name.full });
        G.emit('mission', { sim: s, title: m.title, ok: true, fame: m.fame });
      } else {
        this.addFame(s, m.path, -Math.round(m.fame * 0.3)); s.addMoodlet('missionfail', 'Mission failed', -10, 480);
        this.titleCard('MISSION FAILED', m.title, reason || '', '', false);
        G.log(`${s.name.full} failed “${m.title}”${reason ? ': ' + reason : '.'}`, 'danger', s.pos);
        this.history.unshift({ t: m.title, ok: false, day: G.env.day, by: s.name.full });
      }
      this.history = this.history.slice(0, 30);
    },
    abandon() { if (this.active) this.finish(false, 'You abandoned the mission.'); },

    titleCard(top, title, sub, body = '', good) {
      // never paint a title card across an open dialog (the welcome letter, a court session…): wait
      if (document.querySelector('#modal:not(.hidden)') && (this._cardWait = (this._cardWait || 0) + 1) < 40) {
        clearTimeout(this._cw); this._cw = setTimeout(() => this.titleCard(top, title, sub, body, good), 500); return;
      }
      this._cardWait = 0;
      const c = this.card; c.className = good === true ? 'pass' : good === false ? 'fail' : '';
      c.innerHTML = `<div class="mc-top">${top}</div><div class="mc-title">${esc(title)}</div><div class="mc-sub">${esc(sub)}</div>${body ? `<div class="mc-body">${esc(body)}</div>` : ''}`;
      c.classList.remove('hidden'); clearTimeout(this._ct); this._ct = setTimeout(() => c.classList.add('hidden'), body ? 7000 : 4200);
      if (good === true) { G.audio?.festival(true); setTimeout(() => G.audio?.festival(false), 2500); } else G.audio?.drum();
    },

    stealthCheck(M, gm) {
      const watchers = M.stage.stealth?.(M); if (!watchers) return null;
      const a = M.actor; const night = G.env.isNight; const sight = M.stage.sight || (night ? 8 : 15);
      let seen = false;
      for (const w of watchers) {
        if (!w || w.dead || w.hidden) continue;
        if (w.patrol) { w.missionLock = true; w.pi = w.pi || 0; const tgt = w.patrol[w.pi % w.patrol.length]; if (!w.action || w.action.type !== 'goto') { w.startAction({ type: 'goto', dest: tgt, label: 'Patrolling', then: () => { w.pi++; } }); } }
        const dx = a.pos.x - w.pos.x, dz = a.pos.z - w.pos.z; const d = Math.hypot(dx, dz);
        if (d > sight) continue;
        const ang = Math.abs(((Math.atan2(dx, dz) - w.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang < 1.1 || d < 2.5) seen = true;
      }
      M.spotted = Math.max(0, (M.spotted || 0) + (seen ? gm * (night ? 0.5 : 1) : -gm * 0.5));
      if (M.spotted > 2.5) {
        for (const w of watchers) if (w && !w.dead && w.pos.distanceTo(a.pos) < 30) { w.missionLock = false; if (w.job === 'police' || w.job === 'soldier') { w.startFight(a, true); w.arresting = a; } }
        if (M.def.dark) { G.economy.commitCrime(a, 120, M.def.title.toLowerCase()); }
        return 'fail:You were spotted!';
      }
      return null;
    },

    // A household member left to their own devices will take work that suits them, rather than waiting
    // to be told. Gated entirely on the "Free will" switch in their panel: turn it off and nobody acts
    // without you. Only one mission runs at a time, as before, so this never steals one you wanted.
    // ---------- Mission drive ----------
    // A family member on free will does not drop their trade for any task on the board. A drive builds
    // only for a reason — they need money fast, a task on offer serves their life goal, a friend has
    // asked a favour, or they burn to prove themselves — and fades when there is none. Only when it is
    // full, outside their working hours, do they take on the task that answers that reason.
    driveReasons(s, cat) {
      const R = [];
      if (s.coins < 25) R.push({ k: 'cash', w: 8, why: 'needs money, fast' });
      else if (s.coins < 70) R.push({ k: 'cash', w: 3, why: 'could use some money' });
      const takeable = (o) => { const m = cat.find((x) => x.id === o.id); return m && !this.canTake(s, m) && !HANDS_ON.has(m.id) && !(['blade', 'hunt', 'law'].includes(m.path) && (s.skills?.sword || 0) < 4) ? m : null; };
      const fav = this.offers.find((o) => o.giver && !o.giver.dead && o.giver !== s && s.getRel(o.giver).f > 40 && takeable(o));
      if (fav) R.push({ k: 'favour', w: 6, why: `${fav.giver.name.given} asked a favour`, offer: fav });
      const asp = G.systems.find((x) => x.id === 'aspirations')?.data?.[s.id]?.asp;
      if (asp) {
        const lean = this.leaning(s);
        const goal = this.offers.find((o) => { const m = takeable(o); return m && (lean[m.path] || 0) >= 0.9; });
        if (goal) R.push({ k: 'goal', w: 4, why: 'a task on offer serves their life goal', offer: goal });
      }
      if (s.has?.('Ambitious') || s.has?.('Brave') || s.has?.('Hot-headed')) R.push({ k: 'prove', w: 2, why: 'restless to make a name' });
      return { R, takeable };
    },
    atWork(s) {
      // jobs come first: someone with a real trade keeps their working hours for it
      const pay = (JOBS_PAY[s.job] ?? 0); const h = G.env.hour;
      if (s.action?.work) return true;
      return pay >= 5 && h >= 8 && h < 17 && (s.workedToday || 0) < 300;
    },
    selfAssign() {
      // let a new player look around first: nobody wanders off on a task in the opening two hours
      const now = G.env.day * 24 + G.env.hour; this._t0 ??= now; if (now - this._t0 < 2) return;
      const cat = catalogue(G);
      this.drive ||= {};
      for (const s of G.household) {
        const D = (this.drive[s.id] ||= { v: 0, why: '' });
        if (s.dead || !s.freeWill || s.controlled || s.age === 'child') { D.v = Math.max(0, D.v - 5); continue; }
        const { R, takeable } = this.driveReasons(s, cat);
        if (!R.length) { D.v = Math.max(0, D.v - 6); D.why = ''; continue; }
        const top = R.slice().sort((a, b) => b.w - a.w)[0];
        D.v = Math.min(100, D.v + R.reduce((a, r) => a + r.w, 0) * (this.atWork(s) ? 0.5 : 1)); D.why = top.why;
        if (D.v < 100 || this.active) continue;
        if (s.hidden || s.missionLock || s.jailed || this.atWork(s)) continue;
        if (s.hp < s.maxHp * 0.75) continue;                                   // hurt: mend first
        if (this.cooldown?.[s.id] != null && G.env.day <= this.cooldown[s.id]) continue;   // a day's rest after a failure
        // the task that answers the reason
        let offer = top.offer;
        if (!offer && top.k === 'cash') offer = this.offers.filter((o) => takeable(o)).sort((a, b) => (takeable(b).pay || 0) - (takeable(a).pay || 0))[0];
        if (!offer) { const lean = this.leaning(s); offer = this.offers.filter((o) => takeable(o)).sort((a, b) => (lean[takeable(b).path] || 0) - (lean[takeable(a).path] || 0))[0]; }
        if (!offer) { D.v = 80; continue; }                                    // nothing suitable posted yet
        const m = takeable(offer);
        D.v = 0;
        this.start(s, offer);
        if (this.active?.actor !== s) continue;
        G.ui?.toast(`🎯 ${s.name.given} has taken on “${m.title}” — ${top.why}.`);
        G.log(`${s.name.full} took on “${m.title}” of ${s.sex === 'f' ? 'her' : 'his'} own accord: ${top.why}.`, 'story', s.pos);
        return;
      }
    },
    // Missions were written for a player at the controls: nothing walked a character to the objective.
    // So a household member who took a task on their own account (free will) accepted it and then went
    // on cooking and chatting until it failed. While you are not steering them, they now pursue it:
    // walk (or run) to each objective, fight back, defeat or subdue the targets, and escort at a walk.
    autopilot(M) {
      const s = M.actor; if (!s || s.dead || s.controlled || s.hidden) { this.releaseAuto(M); return; }
      if (s.household && !s.freeWill) { this.releaseAuto(M); return; }   // free will off: you direct them
      // badly hurt on a task they chose themselves: break off and go home rather than die for it
      if (s.hp < s.maxHp * 0.35 && (s.action?.type === 'fight' || G.sims.some((o) => !o.dead && o.combat?.target === s))) {
        s.endFight?.(); s.cancelAction?.();
        const door = s.home?.door || [0, 0];
        this.releaseAuto(M);
        this.finish(false, `${s.name.given} was badly hurt and broke off the fight.`);
        s.startAction({ type: 'goto', dest: [door[0] + 1, door[1] + 1], run: true, label: 'Limping home' });
        return;
      }
      // already fighting (an actual fight — a stale combat target left behind after a beast ran off
      // used to make the autopilot stand aside forever)
      const isEnemy = (o) => !!o && (o.missionSpawn || o.faction === 'bandit' || o.faction === 'enemy' || !!o.type);   // .type: a beast
      const cur = s.action?.type === 'fight' ? s.combat?.target : null;
      if (cur && !cur.dead && isEnemy(cur)) return;
      // a side-quarrel (a villager's brawl) is dropped: the mission comes first — one bodyguard chased a
      // brawler 600 m across the valley while assassins cut down the minister
      if (cur && !cur.dead && !isEnemy(cur)) { s.endFight?.(); s.cancelAction?.(); }
      // anyone attacking them gets an answer
      // anyone attacking them — or attacking whoever the mission put in their care (the minister, the
      // girl, the twins, grandmother) — gets an answer
      const ward = new Set(Object.values(M.v).flat().filter((x) => x && x.pos && x.name && !x.dead && x.faction === 'village'));
      if (M.giver) ward.add(M.giver);
      // Only real enemies (mission foes, bandits, an enemy army) are fought; a villager's brawl is not the
      // mission's business — answering one with steel once made a sibling a murderer on a boar hunt
      const foe = G.sims.find((o) => !o.dead && isEnemy(o) && o.combat?.target && (o.combat.target === s || ward.has(o.combat.target)) && o.pos.distanceTo(s.pos) < 18);
      if (foe && (s.fighter || s.armed)) { s.startFight(foe, !!foe.combat?.nonlethal || /subdue|arrest/i.test(M.stage.text)); return; }
      const w = M.stage.where?.(M);
      if (!w) { this.releaseAuto(M); return; }                           // waiting stages: live normally meanwhile
      s.missionLock = true; M.autoLock = true;
      const d = Math.hypot(s.pos.x - w[0], s.pos.z - w[1]);
      const text = this.fill(M.stageText || M.stage.text, M);
      // a fighting stage: engage any proper target within reach, wherever it has wandered
      if (/defeat|cut down|kill|slay|subdue|arrest|chase|hunt/i.test(text)) {
        const gentle = /subdue|arrest/i.test(text);
        // only what is actually within reach (a fight begun from 100 m was dropped and restarted every
        // step, and nobody ever walked anywhere); the objective itself is walked to below
        const close = (p) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 14;
        const atObj = (p) => Math.hypot(p.x - w[0], p.z - w[1]) < 3;   // the mission's own quarry first
        // only the mission's own quarry: whoever stands at the objective, or people the mission itself
        // brought into the world — never an ordinary villager who happens to be nearby
        const sims = G.sims.filter((o) => !o.dead && !o.household && o !== s && close(o.pos) && (o.missionSpawn || atObj(o.pos)));
        const beasts = (G.animals?.list || []).filter((a2) => !a2.dead && close(a2.pos) && ['boar', 'tiger', 'wolf', 'bear'].includes(a2.type) && !a2.ownerId);
        const t = [...sims, ...beasts].find((x) => atObj(x.pos)) || sims[0] || beasts[0];
        if (t) { s.startFight(t, gentle); if (gentle) s.arresting = t; return; }
      }
      const radius = M.stage.radius || 3;
      if (d > Math.max(1.2, radius * 0.7)) {
        const a = s.action;
        const escort = /escort|slowly|stay close|keep the/i.test(text);
        if (!(a?.type === 'goto' && a._mission && Math.hypot(a.dest[0] - w[0], a.dest[1] - w[1]) < 2.5)) {
          s.startAction({ type: 'goto', dest: [w[0], w[1]], run: !escort && d > 12, label: `🎯 ${text}`, _mission: true });
        }
        return;
      }
    },
    releaseAuto(M) { if (M?.autoLock && M.actor) { M.actor.missionLock = false; M.autoLock = false; if (M.actor.action?._mission) M.actor.cancelAction(); } },
    // how much each fame path suits them, from their life goal, their trade and their temper
    leaning(s) {
      const w = { blade: 0, shadow: 0, trade: 0, law: 0, heart: 0, hunt: 0 };
      const asp = G.systems.find((x) => x.id === 'aspirations')?.data?.[s.id]?.asp || null;
      if (asp === 'blade') w.blade += 1.1;
      if (asp === 'shadow') w.shadow += 1.1;
      if (asp === 'wealth') w.trade += 1.0;
      if (asp === 'friend' || asp === 'love') w.heart += 0.9;
      if (asp === 'throne' || asp === 'scholar') w.law += 0.7;
      const job = { swordsman: 'blade', soldier: 'blade', general: 'blade', police: 'law', merchant: 'trade', innkeeper: 'trade', hunter: 'hunt', bandit: 'shadow', monk: 'heart', scholar: 'law' }[s.job];
      if (job) w[job] += 0.8;
      if (s.has?.('Brave')) w.blade += 0.5;
      if (s.has?.('Hot-headed')) w.blade += 0.3;
      if (s.has?.('Cunning')) w.shadow += 0.5;
      if (s.has?.('Greedy')) w.trade += 0.5;
      if (s.has?.('Gentle') || s.has?.('Pious')) w.heart += 0.5;
      if (s.has?.('Loyal')) w.law += 0.4;
      if ((s.skills?.sword || 0) > 5) w.blade += 0.4;
      if ((s.skills?.archery || 0) > 4) w.hunt += 0.4;
      return w;
    },

    update(dt, gm) {
      // offers & giver markers
      this.offerT -= gm; if (this.offerT <= 0) { this.offerT = 120; this.refreshOffers(); }
      this.selfT = (this.selfT || 0) - gm;
      if (this.selfT <= 0) { this.selfT = 45; try { this.selfAssign(); } catch (e) { console.error('[missions] selfAssign', e); } }
      const want = new Set();
      for (const o of this.offers) { const g = o.giver; if (!g || g.dead || g.hidden) continue; if (catalogue && (o.id === 'taxman' || o.id === 'jadeseal' || o.id === 'poison') && !G.household.some((h) => h.factions?.lotus)) continue; want.add(g);
        let sp = this.markers.get(g); if (!sp) { sp = new THREE.Sprite(this.markerMat); sp.scale.setScalar(0.55); G.scene.add(sp); this.markers.set(g, sp); }
        sp.position.set(g.pos.x, g.pos.y + 2.35 * g.char.scale + Math.sin(performance.now() / 300) * 0.06, g.pos.z); sp.visible = g.char.root.visible; }
      for (const [g, sp] of this.markers) if (!want.has(g)) { G.scene.remove(sp); this.markers.delete(g); }

      const M = this.active; if (!M) return;
      const s = M.actor;
      if (s.dead) return this.finish(false, `${s.name.given} has fallen.`);
      if (s.jailed) return this.finish(false, 'You were arrested.');
      M.t += gm; M.st += gm;
      if (M.stage.time && M.st > M.stage.time) { if (M.stage.timeOk) { this.next(); return; } return this.finish(false, 'Out of time.'); }
      let r = null;
      try { r = this.stealthCheck(M, gm) || M.stage.tick(M, gm); } catch (e) { console.error(e); r = null; }
      if (r === 'ok') this.next(); else if (typeof r === 'string' && r.startsWith('fail')) this.finish(false, r.slice(5));
      if (!this.active) return;
      try { this.autopilot(this.active); } catch (e) { if (!this._apErr) { this._apErr = true; console.error('[missions] autopilot', e); } }
      if (!this.active) return;   // the autopilot may have broken off a lost fight
      // waypoint + HUD
      const w = this.active.stage.where?.(this.active);
      if (w) { this.beacon.visible = true; this.beacon.position.set(w[0], groundAt(w[0], w[1]), w[1]); this.ring.scale.setScalar(1 + Math.sin(performance.now() / 250) * 0.08); G.env.spiritWindTarget = { x: w[0], z: w[1] }; } else this.beacon.visible = false;
      const st = this.active.stage; const left = st.time ? Math.max(0, st.time - this.active.st) : null;
      const dist = w ? Math.round(d2(P(s), w)) : null;
      const spot = st.stealth ? `<div class="mh-stealth"><i style="width:${Math.min(100, (this.active.spotted || 0) / 2.5 * 100)}%"></i></div>` : '';
      this.hud.classList.remove('hidden');
      this.hud.innerHTML = `<div class="mh-t">${esc(this.active.def.title)}</div><div class="mh-o">▸ ${esc(this.fill(this.active.stageText || st.text, this.active))}</div><div class="mh-m">${dist != null ? dist + 'm' : ''}${left != null ? ` · ⏳ ${Math.floor(left / 60)}h ${Math.floor(left % 60)}m` : ''}${st.stealth ? ' · 👁 stay unseen' : ''} <button id="mh-ab">Abandon</button></div>${spot}`;
      const ab = this.hud.querySelector('#mh-ab'); if (ab) ab.onclick = () => this.abandon();
    },

    simMenuItems(me, o) {
      const out = [];
      const offer = this.offers.find((x) => x.giver === o);
      if (offer && me.household) { const m = catalogue(G).find((x) => x.id === offer.id); const why = this.canTake(me, m); out.push({ label: `❗ ${m.title}`, disabled: !!why, fn: () => this.offerModal(me, offer) }); }
      const M = this.active;
      if (M && M.v.kids?.includes(o)) out.push({ label: `Play with ${o.name.given}`, fn: () => { o.joy = Math.min(100, (o.joy || 0) + 35); o.say(pick(['Hehe! Again!', 'Piggyback!', 'You’re fun!']), 'happy'); me.char.setAnim('laugh'); o.cancelAction(); } }, { label: `Scold ${o.name.given}`, fn: () => { o.joy = Math.max(5, (o.joy || 0) - 10); o.cancelAction(); o.startAction({ type: 'goto', dest: [me.pos.x + 1, me.pos.z + 1], label: 'Sulking' }); o.say('…Fine.', 'sad'); } });
      // fame greetings
      return out;
    },
    offerModal(me, offer) {
      const m = catalogue(G).find((x) => x.id === offer.id); const why = this.canTake(me, m);
      const el = G.ui.modal(`<div class="moffer"><img src="${G.ui.portraits.get(offer.giver)}"><div><div class="mo-path">${PATHS[m.path].icon} ${PATHS[m.path].name} mission</div><h2>${esc(m.title)} <em>${m.ko}</em></h2><p>${esc(this.fill(m.brief, { giver: offer.giver, v: {} }))}</p><p><b>Reward:</b> ${m.pay}+ nyang, ${PATHS[m.path].name} fame${m.dark ? ' · <span style="color:#8a1a12">a dark deed — if caught, you will be wanted</span>' : ''}${m.needsHorse ? ' · horse provided' : ''}${m.night ? ' · night only' : ''}</p>${why ? `<p class="req">${esc(why)}</p>` : '<button class="go">Accept</button>'}</div></div>`);
      const go = el.querySelector('.go'); if (go) go.onclick = () => { el.classList.add('hidden'); this.start(me, offer); };
    },
    openBoard() {
      const G2 = G; const me = G.selected?.household ? G.selected : G.household[0];
      const cat = catalogue(G);
      const el = G.ui.modal(`<h2>Missions & Fame · 임무와 명성</h2>
        ${this.active ? `<p class="mact">Active: <b>${esc(this.active.def.title)}</b> — ${esc(this.fill(this.active.stageText || this.active.stage.text, this.active))} <button id="mb-ab">Abandon</button></p>` : ''}
        <h3>Fame of ${esc(me?.name.full || '')}</h3><div class="fame">${Object.entries(PATHS).filter(([k]) => k !== 'shadow' || me?.factions?.lotus).map(([k, p]) => { const f = me ? this.famePts(me, k) : 0; const l = fameLevel(f); const nx = FAME_LV[l + 1]; return `<div class="fp"><b>${p.icon} ${p.name} ${p.ko}</b><small>${p.titles[l]}</small><div class="lbar2"><i style="width:${nx ? Math.min(100, (f - FAME_LV[l]) / (nx - FAME_LV[l]) * 100) : 100}%"></i></div></div>`; }).join('')}</div>
        <h3>Offers in the valley <small>— look for ❗ above people's heads</small></h3>
        ${this.offers.length ? this.offers.filter((o) => !(['taxman', 'jadeseal', 'poison'].includes(o.id) && !me?.factions?.lotus)).map((o) => { const m = cat.find((x) => x.id === o.id); const why = this.canTake(me, m); return `<div class="mrow"><span class="mpath">${PATHS[m.path].icon}</span><div><b>${esc(m.title)}</b> <em>${m.ko}</em><small>from ${esc(o.giver.name.full)} (${o.giver.title}) · ${m.pay}+ nyang${why ? ` · <span class="req">${esc(why)}</span>` : ''}</small></div><button data-show="${o.giver.id}">Find</button><button data-take="${o.id}" ${why ? 'disabled' : ''}>Accept</button></div>`; }).join('') : '<p class="muted">No one needs help right now. Check again later.</p>'}
        <h3>Record</h3><div class="mhist">${this.history.slice(0, 8).map((h) => `<div>${h.ok ? '✔' : '✘'} ${esc(h.t)} <small>— ${esc(h.by)}, day ${h.day}</small></div>`).join('') || '<p class="muted">No missions yet.</p>'}</div>`);
      el.querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => { const o = this.offers.find((x) => x.id === b.dataset.take); el.classList.add('hidden'); this.start(me, o); }));
      el.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => { const g = G.sims.find((x) => x.id === +b.dataset.show); if (g) { G.player.focusTarget.copy(g.pos); G.player.follow = false; G.env.spiritWindTarget = { x: g.pos.x, z: g.pos.z }; G.env.spiritWindTimer = 4; } el.classList.add('hidden'); }));
      const ab = el.querySelector('#mb-ab'); if (ab) ab.onclick = () => { this.abandon(); el.classList.add('hidden'); };
    },
    panelHtml(s) {
      if (!s.household) return ''; const t = this.titleOf(s);
      const D = this.drive?.[s.id];
      const bar = s.freeWill && s.age !== 'child' ? `<div class="facts mdrive-row" title="Fills only for a reason; at full they take on a task outside their working hours">🎯 Mission drive <span class="mdrive"><i style="width:${Math.round(D?.v || 0)}%"></i></span> <small>${esc(D?.why || 'content with their work')}</small></div>` : '';
      return (t ? `<div class="facts">${PATHS[t.path].icon} Known as <b>“${esc(t.title)}”</b></div>` : '') + bar;
    },
    serialize() { return { fame: this.fame, history: this.history, drive: this.drive || {} }; },
    restore(d) { this.fame = d?.fame || {}; this.history = d?.history || []; this.drive = d?.drive || {}; },
  };
  return MS;
}
