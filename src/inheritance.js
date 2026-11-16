// What a life leaves behind.
//
// Until now, death destroyed property. When a villager died the only thing that happened was their name
// being struck from the house's resident list: their coins, the house they owned, their rice land, their
// market stall and their horse all ceased to exist. A great house's whole fortune evaporated the moment
// its head died, which made the clan standing in src/houses.js a thing that could only ever be built,
// never passed on — and it meant no villager was ever made by an inheritance, or ruined by missing one.
//
// Now an estate is settled, roughly as it was in later Joseon: debts first, the widow provided for, the
// eldest son taking the family roof and a double portion because the ancestral rites fall to him, the
// other children taking single portions and daughters a smaller one. Failing children it passes to the
// widow, then to brothers and sisters, then to the senior of the surname. A house with nobody left dies
// out and its property goes to the crown to be sold on.
//
// Brothers do not always take the division well.

export function createInheritanceSystem(G) {
  const st = { settled: 0, passed: 0, escheated: 0, disputes: 0, biggest: 0 };
  const chance = (p) => Math.random() < p;
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const sysOf = (id) => G.systems.find((x) => x.id === id);
  const live = (s) => s && !s.dead && !s.removed;
  const ROYAL = ['king', 'queen', 'prince', 'princess'];

  const housesOwned = (s) => G.world.houses.filter((h) => h.owner === s.id);
  const landOf = (s) => sysOf('housing')?.st?.land?.[s.id] || 0;

  function worth(s) {
    const E = G.economy;
    let v = Math.max(0, Math.round(s.coins));
    for (const h of housesOwned(s)) v += E?.houseValue?.(h) || 0;
    v += landOf(s) * (sysOf('housing')?.st?.landPrice || 90);
    if (s.stall) v += 200;
    if (s.horse && !s.horse.dead) v += 120;
    return v;
  }

  // Everyone with a claim, in the order custom gives them.
  function heirsOf(dead) {
    const kids = (dead.children || []).filter((c) => live(c) && c.age !== 'child');
    const sons = kids.filter((c) => c.sex === 'm');
    const daughters = kids.filter((c) => c.sex !== 'm');
    const widow = live(dead.spouse) ? dead.spouse : null;
    if (kids.length) return { widow, sons, daughters, kin: [] };
    if (widow) return { widow, sons: [], daughters: [], kin: [widow] };
    // no issue and no spouse: brothers and sisters, then the senior of the surname
    const sibs = G.sims.filter((s) => live(s) && s !== dead && s.age !== 'child'
      && (s.parents || []).some((p) => (dead.parents || []).includes(p)));
    if (sibs.length) return { widow: null, sons: [], daughters: [], kin: sibs };
    const clan = G.sims.filter((s) => live(s) && s !== dead && s.faction === 'village' && s.age !== 'child'
      && s.name?.surname === dead.name?.surname && !ROYAL.includes(s.job));
    clan.sort((a, b) => (b.age === 'elder' ? 1 : 0) - (a.age === 'elder' ? 1 : 0) || b.coins - a.coins);
    return { widow: null, sons: [], daughters: [], kin: clan.slice(0, 1) };
  }

  function settle(dead) {
    if (!dead || dead.faction !== 'village' || ROYAL.includes(dead.job) || dead.serf || dead.merc) return;
    const estate = worth(dead);
    const H = sysOf('housing');

    // 1. debts are paid before anyone inherits
    let cash = Math.max(0, Math.round(dead.coins));
    const owed = dead.debt?.amount || 0;
    if (owed > 0) {
      const paid = Math.min(cash, owed);
      cash -= paid;
      const lender = G.sims.find((s) => s.id === dead.debt?.lender);
      if (live(lender)) lender.earn(paid);
      if (paid < owed) {
        // the estate could not cover it: the creditor takes the roof
        const h = housesOwned(dead)[0];
        if (h && live(lender)) {
          h.owner = lender.id;
          log(`${dead.name.full} died owing ${Math.round(owed - paid)} nyang. ${lender.name.full} has taken the house against the debt.`, 'story', dead.pos);
        }
      }
      dead.debt = null;
    }

    const { widow, sons, daughters, kin } = heirsOf(dead);
    const takers = [...sons, ...daughters, ...kin];
    if (!takers.length && !widow) {
      // nobody is left: the house dies out
      for (const h of housesOwned(dead)) { h.owner = null; if (H?.st?.forSale) H.st.forSale[h.id] = { price: Math.round((G.economy?.houseValue?.(h) || 100) * 0.8) }; }
      if (H?.st?.land) delete H.st.land[dead.id];
      st.escheated++;
      if (estate > 150) log(`${dead.name.full} died with no one to inherit. The ${dead.name.surname} name ends, and the crown will sell what is left.`, 'story', dead.pos);
      return;
    }

    // 2. shares: the eldest son takes a double portion and the family roof, daughters a half portion,
    //    and the widow is kept out of want before anything is divided
    const dower = widow ? Math.round(cash * 0.3) : 0;
    if (widow && dower > 0) { widow.earn(dower); cash -= dower; }

    const eldest = sons.length ? sons.slice().sort((a, b) => (b.generation || 0) - (a.generation || 0) || b.id - a.id)[0] : null;
    const units = sons.reduce((a, s) => a + (s === eldest ? 2 : 1), 0) + daughters.length * 0.5 + kin.length;
    const share = units > 0 ? cash / units : 0;
    const got = [];
    for (const s of sons) { const n = Math.round(share * (s === eldest ? 2 : 1)); if (n > 0) s.earn(n); got.push([s, n]); }
    for (const d of daughters) { const n = Math.round(share * 0.5); if (n > 0) d.earn(n); got.push([d, n]); }
    for (const k of kin) { const n = Math.round(share); if (n > 0) k.earn(n); got.push([k, n]); }
    dead.coins = 0;

    // 3. the roof and the land follow the principal heir
    const principal = eldest || takers[0] || widow;
    if (principal) {
      for (const h of housesOwned(dead)) h.owner = principal.id;
      const parcels = landOf(dead);
      if (parcels && H?.st?.land) { H.st.land[principal.id] = (H.st.land[principal.id] || 0) + parcels; delete H.st.land[dead.id]; }
      if (dead.stall && !principal.stall) principal.stall = true;
      if (dead.horse && !dead.horse.dead && !principal.horse) principal.horse = dead.horse;
      // coming into money is reason to want something new of life
      if (principal._amb && (got.find(([s]) => s === principal)?.[1] || 0) > 150) principal._amb = null;
    }

    st.settled++; st.passed += estate; st.biggest = Math.max(st.biggest, estate);
    if (estate > 200) {
      const who = principal ? principal.name.full : widow?.name.full;
      log(`The estate of ${dead.name.full} — ${estate} nyang all told — passes to ${who}${widow && principal !== widow ? `, with ${widow.name.given} provided for` : ''}.`, 'story', dead.pos);
    }

    // 4. brothers do not always take the division well
    if (sons.length > 1 && estate > 300 && chance(0.4)) {
      const slighted = sons.filter((s) => s !== eldest);
      for (const s of slighted) {
        s.changeRel(eldest, -22, 0);
        s.addMoodlet?.('slighted', 'Cheated of my share', -16, 2880);
      }
      st.disputes++;
      log(`The ${dead.name.surname} brothers have fallen out over their father's land. ${slighted[0].name.full} says the division was not just.`, 'danger', dead.pos);
    }
  }

  const S = {
    id: 'inheritance', st, estateOf: worth,

    onEvent(name, p) {
      if (name !== 'death' || !p?.sim) return;
      try { settle(p.sim); } catch (e) { console.error('[inheritance]', e); }
    },

    panelHtml(s) {
      if (!s || s.dead || s.age === 'child') return '';
      const e = worth(s); if (e < 120) return '';
      const { widow, sons, daughters, kin } = heirsOf(s);
      const eldest = sons.length ? sons.slice().sort((a, b) => b.id - a.id)[0] : null;
      const to = eldest || kin[0] || widow;
      return `<div class="facts"><b>巻 Estate</b> · ${e} nyang
        <br><small>${to ? `Would pass to ${to.name.full}${widow && to !== widow ? `, ${widow.name.given} provided for` : ''}.` : 'No one living would inherit.'}
        ${sons.length + daughters.length > 1 ? ` ${sons.length + daughters.length} children would share it.` : ''}</small></div>`;
    },

    status() {
      return st.settled ? [`${st.settled} estates settled, ${Math.round(st.passed)} nyang passed down${st.escheated ? `; ${st.escheated} name${st.escheated > 1 ? 's have' : ' has'} died out` : ''}.`] : [];
    },

    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
