// Houses — 가문. What your family is worth, and who it cannot forgive.
//
// The valley had rivalry of two kinds and both were about the player: rivals.js gives the player's
// household one scheming enemy clan, and memories.js gives individuals a blood-debt they brood over.
// Between ordinary families there was nothing. A man could be robbed by his neighbour and his brothers
// would greet the thief warmly the next morning, because a wrong was only ever a number between two
// people.
//
// A house here is everyone living in the village who shares a surname. Houses carry standing of their
// own, remember what was done to them collectively, and act on it: members of feuding houses cut each
// other in the street, refuse to marry across the quarrel, vote against each other at the 향회, and
// their young men come to blows. A feud can be bought off with compensation, or — far better — ended by
// marrying the two houses together, which is how such things were actually settled.

export function createHousesSystem(G) {
  const st = { houses: {}, feuds: [], seq: 1, brawls: 0, settled: 0, weddings: 0 };
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const sysOf = (id) => G.systems.find((x) => x.id === id);
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const live = (s) => s && !s.dead && !s.removed;

  // who belongs to a house at all: ordinary villagers, not royals, bandits or the unfree
  const clanned = (s) => live(s) && s.faction === 'village' && !ROYAL.includes(s.job) && !s.serf && !s.merc && s.name?.surname;
  const houseOf = (s) => (clanned(s) ? s.name.surname : null);
  const membersOf = (h) => G.sims.filter((s) => clanned(s) && s.name.surname === h);

  // Tuned against measurement: at 55 with a 1.2/day decay, seven days of ordinary village life left the
  // worst grudge at 43 and no feud ever formed. These give roughly one or two live feuds in the valley
  // at a time — enough that a feud is a real event you will see, rare enough that it stays one.
  const FEUD = 48;   // grievance at which a quarrel becomes a feud
  const BURY = 15;   // and below which it is considered over

  function rec(h) { return (st.houses[h] ||= { name: h, honour: 0, grudge: {}, allies: [] }); }

  function grievance(a, b) { return a && b && a !== b ? (rec(a).grudge[b] || 0) : 0; }
  const feuding = (a, b) => grievance(a, b) >= FEUD || grievance(b, a) >= FEUD;
  // the public, player-facing question: are these two people on opposite sides of a feud?
  function atFeud(x, y) {
    const a = houseOf(x), b = houseOf(y);
    return !!(a && b && a !== b && feuding(a, b));
  }

  function wrong(victim, culprit, weight, why) {
    const a = houseOf(victim), b = houseOf(culprit);
    if (!a || !b || a === b) return;
    const R = rec(a);
    if (R.allies.includes(b)) weight *= 0.35;         // kin by marriage are forgiven more
    const before = R.grudge[b] || 0;
    R.grudge[b] = Math.min(140, before + weight);
    // the wronged house closes ranks: every member thinks worse of every one of theirs
    if (R.grudge[b] >= FEUD && before < FEUD) {
      declare(a, b, why, victim, culprit);
    } else if (weight >= 8) {
      for (const m of membersOf(a)) if (m !== victim) m.changeRel(culprit, -Math.min(10, weight), 0);
    }
  }

  function declare(a, b, why, victim, culprit) {
    if (st.feuds.some((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a))) return;
    st.feuds.push({ id: st.seq++, a, b, since: G.env.day, why: why || 'an old wrong' });
    for (const m of membersOf(a)) for (const o of membersOf(b)) { m.changeRel(o, -30, 0); }
    rec(a).allies = rec(a).allies.filter((x) => x !== b);
    rec(b).allies = rec(b).allies.filter((x) => x !== a);
    log(`⚔ The ${a} house and the ${b} house are at odds over ${why}${victim && culprit ? ` — ${culprit.name.full} and ${victim.name.full}` : ''}. Neither will sit at the other's table.`, 'danger', (victim || culprit)?.pos);
  }

  function end(f, how) {
    st.feuds = st.feuds.filter((x) => x !== f);
    rec(f.a).grudge[f.b] = 0; rec(f.b).grudge[f.a] = 0;
    for (const m of membersOf(f.a)) for (const o of membersOf(f.b)) m.changeRel(o, 25, 0);
    st.settled++;
    log(`🕊 The ${f.a} and ${f.b} houses have made their peace — ${how}. Old men on both sides say it was time.`, 'story');
  }

  // ---------------- what a house is worth ----------------
  function tally() {
    const soc = sysOf('society');
    const seen = new Set();
    for (const s of G.sims) {
      const h = houseOf(s); if (!h) continue;
      seen.add(h);
      rec(h);
    }
    for (const h of seen) {
      const R = rec(h), M = membersOf(h);
      if (!M.length) { R.honour = 0; continue; }
      let v = 0;
      for (const m of M) {
        v += (m.needs?.honor ?? 50) * 0.04;
        v += (m.factions?.court?.rank || 0) * 2.2;
        v += Math.min(10, (G.economy?.netWorth?.(m) || 0) / 300);
        if (soc?.standing) v += soc.standing(m) * 4;
        if (m.stall) v += 1.5;
        if (m.outlaw) v -= 6;
      }
      R.honour = Math.round((v / M.length) * 10) / 10;
      R.size = M.length;
    }
    // delete houses that have died out
    for (const h of Object.keys(st.houses)) if (!seen.has(h)) delete st.houses[h];
  }

  // ---------------- the daily life of a quarrel ----------------
  function daily() {
    tally();
    // grudges cool slowly if nothing fresh happens
    for (const h of Object.values(st.houses)) for (const k in h.grudge) {
      h.grudge[k] = Math.max(0, h.grudge[k] - 1.0);
      if (h.grudge[k] <= 0) delete h.grudge[k];
    }
    for (const f of [...st.feuds]) {
      const g = Math.max(grievance(f.a, f.b), grievance(f.b, f.a));
      if (g < BURY) { end(f, 'time did it'); continue; }
      // elders may seek a settlement, the more readily the longer it has dragged on
      const years = G.env.day - f.since;
      const A = membersOf(f.a), B = membersOf(f.b);
      if (!A.length || !B.length) { end(f, 'one house is gone from the valley'); continue; }
      const gentle = [...A, ...B].some((m) => m.has?.('Gentle') || m.has?.('Pious'));
      if (years > 12 && chance(gentle ? 0.14 : 0.06)) {
        // compensation: the house that gave the greater offence pays
        const payer = grievance(f.a, f.b) > grievance(f.b, f.a) ? B : A;
        const payee = payer === A ? B : A;
        const rich = payer.slice().sort((x, y) => y.coins - x.coins)[0];
        const head = payee.slice().sort((x, y) => y.coins - x.coins)[0];
        if (rich && head && rich.coins >= 80) {
          rich.coins -= 80; head.earn(80);
          end(f, `${rich.name.full} paid 80 nyang in compensation`);
          continue;
        }
      }
      // or their young come to blows
      if (chance(0.1)) brawl(f, A, B);
    }
  }

  function brawl(f, A, B) {
    const hot = (L) => L.filter((m) => !m.dead && !m.hidden && !m.controlled && !m.missionLock && !m.jailed && m.age !== 'child' && m.age !== 'elder');
    const a = pick(hot(A) || []), b = pick(hot(B) || []);
    if (!a || !b) return;
    if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 60) return;
    a.changeRel(b, -12, 0);
    try { a.startFight(b, true); if (!b.controlled) b.startFight(a, true); } catch {}  // nonlethal: fists, not blades
    st.brawls++;
    if (chance(0.5)) log(`${a.name.full} and ${b.name.full} came to blows in the street — the ${f.a}s and the ${f.b}s again.`, 'danger', a.pos);
  }

  // a marriage across the line is the old way of ending a quarrel
  function marriageBond(x, y) {
    const a = houseOf(x), b = houseOf(y);
    if (!a || !b || a === b) return;
    const f = st.feuds.find((z) => (z.a === a && z.b === b) || (z.a === b && z.b === a));
    if (f) { end(f, `the marriage of ${x.name.full} and ${y.name.full}`); st.weddings++; }
    for (const h of [rec(a), rec(b)]) { const o = h === rec(a) ? b : a; if (!h.allies.includes(o)) h.allies.push(o); }
    for (const m of membersOf(a)) for (const o of membersOf(b)) m.changeRel(o, 8, 0);
  }

  const S = {
    id: 'houses', st, houseOf, atFeud, honourOf: (h) => rec(h).honour,

    simAction(s) {
      if (!clanned(s) || s.household) return false;
      if (!chance(0.06)) return false;
      const h = houseOf(s); const R = st.houses[h]; if (!R) return false;
      const enemies = Object.keys(R.grudge).filter((k) => feuding(h, k));
      if (!enemies.length) return false;
      // keep well away from the other house
      for (const o of G.sims) {
        if (!clanned(o) || o === s || !enemies.includes(o.name.surname)) continue;
        if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) > 13) continue;
        const ang = Math.atan2(s.pos.x - o.pos.x, s.pos.z - o.pos.z);
        s.startAction({ type: 'goto', dest: [s.pos.x + Math.sin(ang) * 15, s.pos.z + Math.cos(ang) * 15], label: `Turning away from a ${o.name.surname}` });
        if (chance(0.3)) s.say(pick([`A ${o.name.surname}.`, 'Not while I live.', '…']), 'talk');
        return true;
      }
      return false;
    },

    onEvent(name, p) {
      try {
        if (name === 'ready') tally();
        if (name === 'day') daily();
        // two thefts by the same house is enough to fall out over: 26 + 26 clears the threshold
        if (name === 'steal' && p?.thief && p?.victim) wrong(p.victim, p.thief, 26, 'thieving');
        if (name === 'duel' && p?.winner && p?.loser) wrong(p.loser, p.winner, 12, 'a duel');
        if (name === 'death' && p?.killer && p?.sim) {
          const v = p.sim;
          if (!(v.faction === 'bandit' || v.outlaw)) wrong(v, p.killer, 95, 'a killing');
        }
        if (name === 'wedding' && p?.a && p?.b) marriageBond(p.a, p.b);
      } catch (e) { console.error('[houses]', e); }
    },

    panelHtml(s) {
      const h = houseOf(s); if (!h) return '';
      const R = st.houses[h]; if (!R) return '';
      const enemies = Object.keys(R.grudge).filter((k) => feuding(h, k));
      const rank = Object.values(st.houses).filter((x) => x.size).sort((a, b) => b.honour - a.honour).findIndex((x) => x.name === h);
      const word = R.honour > 8 ? 'a great house' : R.honour > 4 ? 'well regarded' : R.honour > 1 ? 'an ordinary house' : 'a poor house';
      return `<div class="facts"><b>家 House of ${h}</b> · ${word} <small>(${R.size || 0} living${rank >= 0 ? `, ${rank + 1}${rank === 0 ? 'st' : rank === 1 ? 'nd' : rank === 2 ? 'rd' : 'th'} in the valley` : ''})</small>
        ${enemies.length ? `<br><small>⚔ At odds with the ${enemies.join(' and ')} house${enemies.length > 1 ? 's' : ''}.</small>` : ''}
        ${R.allies.length ? `<br><small>Bound by marriage to the ${R.allies.join(' and ')}.</small>` : ''}</div>`;
    },

    simMenuItems(me, o) {
      if (!me?.household || o === me || !clanned(o)) return [];
      const mh = houseOf(me), oh = houseOf(o);
      if (!mh || !oh || mh === oh) return [];
      const f = st.feuds.find((z) => (z.a === mh && z.b === oh) || (z.a === oh && z.b === mh));
      if (!f) return [];
      return [{ label: `🕊 Pay 80 nyang to settle with the ${oh}s`, disabled: me.coins < 80, fn: () => {
        if (me.coins < 80) return;
        me.coins -= 80; o.earn(80);
        end(f, `${me.name.full} paid the price of peace`);
        G.ui?.toast(`The ${mh}s and the ${oh}s are at peace.`);
      } }];
    },

    status() {
      const top = Object.values(st.houses).filter((h) => h.size).sort((a, b) => b.honour - a.honour)[0];
      return [st.feuds.length ? `${st.feuds.length} house${st.feuds.length > 1 ? 's are' : ' is'} at feud.` : 'No house is at feud.',
        top ? `The ${top.name} house stands highest.` : ''].filter(Boolean);
    },

    serialize() { return { houses: st.houses, feuds: st.feuds, seq: st.seq, brawls: st.brawls, settled: st.settled, weddings: st.weddings }; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
