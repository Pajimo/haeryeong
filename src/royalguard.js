// The royal guard (내금위): a handful of elite swordsmen sworn to the person of the King.
// They shadow him everywhere and close on anyone who threatens him — killing a guarded king takes an
// army, a traitor, or a very great blade. Their loyalty follows the King's conduct: they are paid from
// the treasury, they despise cruelty and adore a beloved ruler, and they can be dismissed, desert,
// be bribed — or, when the realm burns and their hearts are cold, turn their swords on him.
import { LAYOUT } from './terrain.js';
import { SURNAMES } from './data.js';

const SIZE = 5, WAGE = 12;
export function createRoyalGuardSystem(G) {
  const st = { ids: [], dismissed: false, recruitAt: 0, captain: null };
  const day = () => G.env.day + G.env.hour / 24;
  const sys = (id) => G.systems.find((x) => x.id === id);
  const king = () => (G.king && !G.king.dead ? G.king : null);
  const guards = () => st.ids.map((id) => G.sims.find((s) => s.id === id)).filter((s) => s && !s.dead && s.royalGuard);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function dress(g, captain) {
    g.uniform = { outfit: 'general', colors: { top: captain ? '#7d1f1f' : '#2c2a4a', bottom: '#1a1a24', armor: captain ? '#b8242a' : '#3a2a5a', robe: '#1a1a24', belt: '#d9b44a' }, hat: 'helmet', weapon: true };
    g.rebuildModel();
  }
  function recruit(n, charge = null) {
    const k = charge || king(); const [px, pz] = k ? [k.pos.x, k.pos.z] : LAYOUT.palace;
    for (let i = 0; i < n; i++) {
      const sk = 8.5 + Math.random() * 1.5;
      const g = G.spawn({ sex: 'm', age: Math.random() < 0.6 ? 'adult' : 'young', job: 'soldier', home: G.vhouses?.barracks, surname: pick(SURNAMES), traits: ['Brave', 'Loyal'], armed: true, skillSword: sk, x: px + (Math.random() - 0.5) * 6, z: pz + 4 + Math.random() * 4 });
      g.royalGuard = { loyalty: 70 + Math.random() * 15, bribedBy: null, charge: charge ? charge.id : null };
      if (charge) { g.skills.sword = Math.min(g.skills.sword, 8); }
      g.maxHp = Math.round((charge ? 200 : 280) + g.skills.sword * 10); g.hp = g.maxHp; g.missionLock = true; g.skills.archery = 6;
      const captain = !charge && (!st.captain || !G.sims.find((s) => s.id === st.captain && !s.dead));
      if (captain) { st.captain = g.id; g.maxHp += 60; g.hp = g.maxHp; g.skills.sword = 10; }
      dress(g, captain); st.ids.push(g.id);
    }
  }
  function leave(g, why, traitor = false) {
    st.ids = st.ids.filter((id) => id !== g.id);
    g.royalGuard = null; g.missionLock = false; g.cancelAction(); g.endFight?.();
    if (traitor) { g.faction = 'bandit'; g.outlaw = true; const k = king(); if (k) g.startFight(k); }
    else { g.job = 'swordsman'; g.uniform = null; g.rebuildModel(); }
    G.log(why, traitor ? 'danger' : 'story', g.pos);
  }
  function loyaltyShift(d, why) { for (const g of guards()) g.royalGuard.loyalty = Math.max(0, Math.min(100, g.royalGuard.loyalty + d * (0.7 + Math.random() * 0.6))); if (why && Math.abs(d) >= 5) G.log(`The royal guard ${d > 0 ? 'stand a little taller' : 'exchange dark looks'}: ${why}.`, 'story'); }
  const avgLoyalty = () => { const g = guards(); return g.length ? g.reduce((a, x) => a + x.royalGuard.loyalty, 0) / g.length : 0; };

  const chargeOf = (g) => (g.royalGuard.charge == null ? king() : G.sims.find((x) => x.id === g.royalGuard.charge && !x.dead) || null);
  function threatTo(p) {
    if (!p) return null;
    if (p.combat.target && !p.combat.target.dead && !p.combat.nonlethal) return p.combat.target;
    for (const o of G.sims) { if (o.dead || o.hidden || o.royalGuard) continue; if (o.combat.target === p && !o.combat.nonlethal && o.pos.distanceTo(p.pos) < 60) return o; }
    return null;
  }
  function tick(dt) {
    const gs = guards(); const byCharge = new Map();
    for (const g of gs) { const c = chargeOf(g); if (!c) { if (g.royalGuard.charge != null) { g.royalGuard.charge = null; } continue; } if (!byCharge.has(c)) byCharge.set(c, []); byCharge.get(c).push(g); }
    for (const [k, list] of byCharge) {
      const threat = threatTo(k);
      list.forEach((g, i) => {
        for (const n in g.needs) g.needs[n] = Math.max(g.needs[n], 50);
        if (g.hidden) return;
        const bribed = threat && g.royalGuard.bribedBy != null && (threat.id === g.royalGuard.bribedBy || threat.household && G.household.some((h) => h.id === g.royalGuard.bribedBy));
        if (threat && !bribed) {
          if (g.combat.target !== threat) { g.cancelAction(); g.startFight(threat); if (Math.random() < 0.5) g.say(pick(['Protect the royal house!', 'Not one step closer!', '전하를 지켜라! Guard them!', 'Die for your treason!']), 'shout', 2.5); }
          return;
        }
        if (bribed && Math.random() < dt * 0.15 && !g._turned) { g._turned = true; if (Math.random() < 0.4) { g.say('Forgive me…', 'shout', 3); g.startFight(k); G.log(`💔 ${g.name.full} of the royal guard turns his blade on ${k.name.full}!`, 'danger', g.pos); } else g.say('…I saw nothing.', 'talk', 3); }
        if (g.combat.target) return;
        const ang = k.heading + Math.PI + (i - (list.length - 1) / 2) * 0.7, off = 2.4 + (i % 2) * 0.8;
        const tx = k.pos.x + Math.sin(ang) * off, tz = k.pos.z + Math.cos(ang) * off;
        const d = Math.hypot(g.pos.x - tx, g.pos.z - tz);
        if (d > 90) { g.cancelAction(); g.pos.set(tx, g.pos.y, tz); }
        else if (d > 3) { if (g.action?.type !== 'goto' || (g._ft = (g._ft || 0) + dt) > 1.2) { g._ft = 0; g.cancelAction(); g.startAction({ type: 'goto', dest: [tx, tz], run: d > 8, label: `Guarding ${k.job === 'king' ? 'His Majesty' : k.name.given}` }); } }
        else if (!g.action) { g.heading = k.heading; g.action = { type: 'event', phase: 'do', anim: 'guard', dur: 5, t: 0, label: `Guarding ${k.job === 'king' ? 'His Majesty' : k.name.given}` }; }
      });
    }
  }
  // the closer to the throne, the more swords: queen and heir 2, other princes and princesses 1, the rest none
  function heirId() { return sys('royalPower')?.st?.heir ?? G.sims.find((s) => !s.dead && s.job === 'prince')?.id; }
  function wardNeeds() {
    const out = [];
    for (const s of G.sims) {
      if (s.dead || s.hidden) continue;
      if (s.job === 'queen' || s.id === heirId()) out.push([s, 2]);
      else if (s.job === 'prince' || s.job === 'princess') out.push([s, 1]);
    }
    return out;
  }
  function staffWards() {
    if (st.dismissed) return;
    const RW = sys('royalWorks');
    for (const [s, n] of wardNeeds()) {
      const have = guards().filter((g) => g.royalGuard.charge === s.id).length;
      for (let i = have; i < n; i++) { if (RW && RW.st.treasury < 40) return; if (RW) RW.st.treasury -= 40; recruit(1, s); }
    }
    // guards of royals who died or lost their station rejoin the King's detail
    for (const g of guards()) { const c = g.royalGuard.charge; if (c != null && !g.royalGuard.official) { const w = G.sims.find((x) => x.id === c); if (!w || w.dead || !['queen', 'prince', 'princess'].includes(w.job) && w.id !== heirId()) g.royalGuard.charge = null; } }
  }

  // ---------------- why someone would try to kill a royal ----------------
  function threat() {
    const k = king(); if (!k) return { score: 0, reasons: [] };
    const R = []; const add = (v, why) => { if (v > 0.5) R.push([v, why]); };
    const RP = sys('royalPower')?.st; const m = RP?.minsim ?? 50;
    add((50 - m) * 0.6, 'the people hate the throne');
    const cruel = (RP?.reign || []).filter((r) => /seized|executed|forced|requisition|banish/.test(r.why)).length; add(cruel * 6, 'cruel decrees have made enemies');
    const lotus = G.sims.filter((s) => !s.dead && s.factions?.lotus).length; add(lotus * 4, `the Black Lotus (${lotus} sworn) wants the throne`);
    const W = sys('war')?.st; if (W?.war) add(14, `${W.war.realm} sends knives as well as armies`);
    const amb = G.sims.find((s) => !s.dead && s.job === 'prince' && (s.ambition >= 2 || (s.has?.('Ambitious') && heirId() !== s.id))); if (amb) add(12 + (amb.ambition || 0) * 4, `Prince ${amb.name.given} covets his father's seat`);
    const kin = G.sims.filter((s) => !s.dead && (s.memories || []).some((x) => x.tag === 'killedKin' && x.about === k.id)).length; add(kin * 8, 'families whose kin the King killed seek revenge');
    const exiled = G.sims.some((s) => s.exiled); add(exiled ? 8 : 0, 'a banished noble plots his return');
    if (/coup|seized|stormed|bloody/.test(k._crownHow || '')) add(12, 'a usurper sits uneasy on a stolen throne');
    const gs = guards().filter((g) => g.royalGuard.charge == null); const weak = Math.max(0, SIZE - gs.length) * 5 + Math.max(0, 50 - avgLoyalty()) * 0.3; add(weak, 'the royal guard is thin or disloyal');
    const score = R.reduce((a, r) => a + r[0], 0);
    return { score: Math.round(score), reasons: R.sort((a, b) => b[0] - a[0]).map((r) => r[1]) };
  }
  function attempt() {
    const T = threat(); const k = king(); if (!k || !T.reasons.length) return;
    const royals = G.sims.filter((s) => !s.dead && !s.hidden && ['queen', 'prince', 'princess'].includes(s.job));
    const target = Math.random() < 0.75 || !royals.length ? k : royals[Math.floor(Math.random() * royals.length)];
    const why = T.reasons[0];
    const kind = /Lotus/.test(why) ? ['Black Lotus assassins', 3, 7.5] : /realm|knives/.test(why) ? ['a foreign assassin', 1, 9.5] : /Prince/.test(why) ? ['hired blades of a royal rival', 2, 8] : /revenge|banished/.test(why) ? ['avengers', 2, 7] : ['desperate men with knives', 3, 5.5];
    const a = Math.random() * Math.PI * 2; const out = [];
    for (let i = 0; i < kind[1]; i++) {
      const h = G.spawn({ sex: 'm', age: 'adult', job: 'swordsman', surname: pick(SURNAMES), traits: ['Brave', 'Cunning'], armed: true, skillSword: kind[2], x: target.pos.x + Math.sin(a + i * 0.4) * 14, z: target.pos.z + Math.cos(a + i * 0.4) * 14 });
      h.faction = 'hunter'; h.missionLock = true; h.uniform = { outfit: 'bandit', colors: { top: '#111', bottom: '#111' }, hat: 'headband' }; h.rebuildModel(); h.startFight(target); out.push(h);
    }
    out[0]?.say(pick(['For the people!', 'Your reign ends tonight!', 'Death to the tyrant!', 'The Lotus remembers!']), 'shout', 3);
    G.log(`🗡 An attempt on the life of ${target.job === 'king' ? 'King ' + target.name.given : target.name.full}! ${kind[0][0].toUpperCase() + kind[0].slice(1)} strike — because ${why}.`, 'danger', target.pos);
    if (target.household || G.household.some((h) => h.factions?.court)) G.ui?.toast(`🗡 Assassins attack ${target.name.given}!`, 'danger');
    setTimeout(() => { for (const h of out) if (!h.dead && !h.removed) { h.dispose?.(); h.removed = true; h.dead = true; } }, 180000);
  }

  const S = {
    id: 'royalGuard', st, guards, avgLoyalty, threat, attempt, _recruit: (n) => recruit(n), _recruitFor: (n, who) => { const before = st.ids.length; recruit(n, who); return st.ids.slice(before).map((id) => G.sims.find((x) => x.id === id)).filter(Boolean); },
    init() {
      // the King himself is a trained warrior and hard to fell
      const origCrown = G.crown.bind(G);
      G.crown = (s, how) => { s._crownHow = how; const r = origCrown(s, how); s.maxHp = Math.max(s.maxHp, 260); s.hp = s.maxHp; s.skills.sword = Math.max(s.skills.sword, 7); onNewKing(s, how); return r; };
      // royal commands: dismiss / recall the guard; bribing a guard is a road to treason
      const RP = sys('royalPower');
      if (RP) {
        RP.CMDS.push(
          { id: 'guard_dismiss', g: 'Patronage', label: 'Dismiss the royal guard (save their wages)', when: () => guards().length > 0, do: () => { for (const g of guards()) leave(g, `${g.name.full} lays down the red-tasselled spear of the royal guard and walks out of the palace.`); st.dismissed = true; RP.heart?.(+1, 'dismissed the guard'); return 'The King dismisses his royal guard. "I fear no one in my own kingdom." The palace feels very empty.'; } },
          { id: 'guard_recall', g: 'Patronage', label: `Raise a new royal guard (${SIZE} elite swords, 200)`, cost: 200, when: () => guards().length < 2, do: () => { st.dismissed = false; recruit(SIZE - guards().length); return `${SIZE} of the finest swords in the realm swear the guard's oath before the throne.`; } },
          { id: 'guard_pay', g: 'Patronage', label: 'Give the royal guard a bonus (60)', cost: 60, cd: 3, when: () => guards().length > 0, do: () => { loyaltyShift(+15); return 'Each guardsman receives a silver cup and a bolt of silk. Their loyalty is renewed.'; } },
        );
      }
    },
    onEvent(name, p) {
      if (name === 'ready') { setTimeout(staffWards, 500); const k = king(); if (k) { k.maxHp = Math.max(k.maxHp, 260); k.hp = Math.max(k.hp, k.maxHp * 0.9); k.skills.sword = Math.max(k.skills.sword, 7); } if (!guards().length && !st.dismissed) recruit(SIZE); }
      if (name === 'day') {
        const gs = guards(); if (!gs.length) { if (!st.dismissed && king() && day() >= st.recruitAt) recruit(2); return; }
        // wages from the treasury
        const RW = sys('royalWorks'); const cost = gs.length * WAGE;
        if (RW && RW.st.treasury >= cost) { RW.st.treasury -= cost; loyaltyShift(+1); } else loyaltyShift(-12, 'their wages went unpaid');
        // the King's conduct
        const m = sys('royalPower')?.st?.minsim ?? 50; loyaltyShift((m - 50) / 12);
        // replace the fallen
        const kd = gs.filter((g) => g.royalGuard.charge == null).length;
        if (kd < SIZE && (RW?.st?.treasury ?? 0) >= 60) { const n = Math.min(SIZE - kd, Math.floor(RW.st.treasury / 60)); RW.st.treasury -= 60 * n; recruit(n); G.log(`${n} new sword${n > 1 ? 's' : ''} swear${n > 1 ? '' : 's'} the oath of the royal guard, replacing the fallen.`, 'story'); }
        staffWards();
        // will anyone dare strike at the royal house today?
        const T = threat(); const p = Math.max(0.02, Math.min(0.45, T.score / 220)); st.threat = T;
        if (G.env.day > 1 && Math.random() < p) setTimeout(attempt, 1000 + Math.random() * 4000);
        // desertion & betrayal
        for (const g of guards()) {
          const L = g.royalGuard.loyalty;
          if (L < 25 && Math.random() < 0.3) leave(g, `${g.name.full} of the royal guard deserts the palace in the night. "I swore to a king, not a tyrant."`);
          else if (L < 12 && sys('royalPower')?.st?.rebels && Math.random() < 0.5) leave(g, `⚔ ${g.name.full} of the royal guard throws in with the rebels!`, true);
        }
      }
      if (name === 'death' && p.sim?.royalGuard) { st.ids = st.ids.filter((id) => id !== p.sim.id); setTimeout(() => { const RW = sys('royalWorks'); if (king() && !st.dismissed && RW && RW.st.treasury >= 60) { RW.st.treasury -= 60; recruit(1, p.sim.royalGuard?.charge != null ? G.sims.find((x) => x.id === p.sim.royalGuard.charge && !x.dead) : null); } }, 20000); G.log(`${p.sim.name.full} of the royal guard dies defending the King.`, 'death', p.sim.pos); }
    },
    update(dt) { if (!G.started) return; this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 0.4; tick(0.4); },
    simMenuItems(me, o) {
      if (!me.household || !o.royalGuard) return [];
      const L = Math.round(o.royalGuard.loyalty); const price = Math.round(200 + L * 6);
      const out = [{ label: `🛡 Royal guardsman · loyalty ${L > 70 ? 'iron' : L > 45 ? 'steady' : L > 25 ? 'wavering' : 'broken'}`, disabled: true }];
      if (me.job !== 'king' && o.royalGuard.bribedBy == null) out.push({ label: `💰 Quietly bribe him to stand aside (${price} nyang)`, danger: true, disabled: G.household[0].coins < price, fn: () => {
        G.household[0].coins -= price;
        if (Math.random() < (100 - L) / 110) { o.royalGuard.bribedBy = me.id; o.say('…Some nights a guard may be looking the other way.', 'talk', 4); G.ui.toast(`${o.name.given} pockets the silver. When you strike, he will not stand in your way.`, 'story'); }
        else { o.say('You dare offer silver to the King’s guard?!', 'shout', 4); G.economy?.commitCrime?.(me, 200, 'trying to bribe the royal guard'); o.startFight(me); G.log(`${me.name.full} tried to bribe the royal guard and is denounced for treason!`, 'danger', me.pos); }
      } });
      return out;
    },
    panelHtml(s) { return s.household && s.job === 'king' ? `<div class="facts">🛡 Royal guard: ${guards().length} sworn swords · loyalty ${Math.round(avgLoyalty())}</div>` : ''; },
    status() { const g = guards(); const T = threat(); return [g.length ? `🛡 The royal guard: ${g.filter((x) => x.royalGuard.charge == null).length} swords on the King, ${g.filter((x) => x.royalGuard.charge != null).length} on the royal family, loyalty ${avgLoyalty() > 65 ? 'iron' : avgLoyalty() > 40 ? 'steady' : 'wavering'}.` : '🛡 The King rides without a royal guard.', `🗡 Danger to the throne: <b>${T.score > 60 ? 'grave' : T.score > 30 ? 'real' : 'low'}</b>${T.reasons.length ? ' — ' + T.reasons.slice(0, 3).join('; ') : ''}.`]; },
    serialize() { return { st, guards: guards().map((g) => ({ id: g.id, ...g.royalGuard })) }; },
    restore(d, get) {
      if (!d) return; Object.assign(st, d.st || {}); st.ids = [];
      for (const r of d.guards || []) { const g = get(r.id); if (!g) continue; g.royalGuard = { loyalty: r.loyalty, bribedBy: r.bribedBy }; g.missionLock = true; g.maxHp = Math.max(g.maxHp, 280); dress(g, g.id === st.captain); st.ids.push(g.id); }
    },
  };
  function onNewKing(k, how) {
    const violent = /coup|seized|stormed|bloody|throne at the head/.test(how || '');
    for (const g of guards()) {
      if (violent && Math.random() < 0.5) leave(g, `${g.name.full} of the royal guard refuses to serve the usurper and rides into exile.`);
      else g.royalGuard.loyalty = violent ? 40 : 65;
    }
    if (k.household) G.ui?.toast(`🛡 ${guards().length} royal guardsmen now shadow ${k.name.given}.`, 'story');
  }
  return S;
}
