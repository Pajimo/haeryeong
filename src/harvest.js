// The agricultural year.
//
// The valley talked about harvests and never had one. "The rice ripens and the harvest begins" was a
// line of seasonal flavour text; the price of rice wandered at random by up to 30% a day with no
// reference to anything that had happened; and whether the summer was a drought or a monsoon made no
// difference to a single villager's life. There was no granary, no store of food, and no such thing as
// a bad year.
//
// Now the valley farms. Rain through spring and summer decides whether the crop is good; the farmers
// and the rice land worked decide how much of it there is; and the harvest fills a granary that the
// village then eats through until the next autumn. The price of rice follows the store rather than a
// random walk. A bad year empties the granary early, and then rice gets dear, the poor go hungry, some
// leave the valley, patience with whoever rules runs out — and the headman, the king or the player can
// open the stores and be remembered for it.

const RATION = 0.09;            // sacks of rice one person eats per day
const SEASONS_OF_GROWTH = ['spring', 'summer'];

export function createHarvestSystem(G) {
  const st = {
    year: 1, granary: 0, lastHarvest: 0, rainTicks: 0, growTicks: 0,
    famine: 0, relief: 0, history: [], quality: 1, warned: 0,
  };
  const chance = (p) => Math.random() < p;
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const sysOf = (id) => G.systems.find((x) => x.id === id);
  const live = (s) => s && !s.dead && !s.removed;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // the season lives on G.seasons.current (a getter), not on env
  const season = () => G.seasons?.current?.key || 'autumn';
  const eaters = () => G.sims.filter((s) => live(s) && !s.hidden && s.faction === 'village').length;
  // how long the store must last: the rest of the year until the next harvest
  const daysToHarvest = () => {
    const order = ['spring', 'summer', 'autumn', 'winter'];
    const SD = 4, YEAR = SD * 4;
    const i = Math.max(0, order.indexOf(season()));
    const ds = G.seasons?.dayOfSeason || 1;   // the game tracks this on G.seasons, not on env
    const pos = i * SD + (ds - 1);            // 0..15 through the year
    const HARVEST = 2 * SD;                   // the first day of autumn
    const d = (HARVEST - pos + YEAR) % YEAR;
    return d === 0 ? YEAR : d;                // standing on harvest day, the next one is a year off
  };

  // 0 (empty) .. 1 (a year's food in store) .. above 1 is surplus
  function stock() {
    const need = Math.max(1, eaters() * RATION * daysToHarvest());
    return st.granary / need;
  }

  // ---------------- the growing season ----------------
  function weatherTick(gm) {
    if (!SEASONS_OF_GROWTH.includes(season())) return;
    st.growTicks += gm;
    const w = G.env.weather;
    if (w === 'rain') st.rainTicks += gm;
    else if (w === 'mist' || w === 'cloudy') st.rainTicks += gm * 0.35;
  }

  // ---------------- the harvest ----------------
  function reap() {
    const H = sysOf('housing');
    const wet = st.growTicks > 0 ? st.rainTicks / st.growTicks : 0.35;
    // rice wants a wet summer, but not a drowned one: about a third of the season in rain is ideal
    const ideal = 0.34;
    const weather = clamp(1 - Math.abs(wet - ideal) * 2.4, 0.25, 1.15);
    // the hands that worked it, and the land they worked
    const farmers = G.sims.filter((s) => live(s) && ['farmer', 'farmhand', 'servant'].includes(s.job)).length;
    const parcels = Object.values(H?.st?.land || {}).reduce((a, b) => a + b, 0);
    const labour = clamp((farmers * 1.0 + parcels * 0.8) / 26, 0.35, 1.5);
    const luck = 0.88 + Math.random() * 0.26;
    const quality = weather * luck;
    const need = eaters() * RATION * 16;              // a full year's eating
    const yield_ = Math.round(need * 1.12 * quality * labour);

    st.granary += yield_;
    st.quality = +quality.toFixed(2);
    st.lastHarvest = G.env.day;
    st.history.push({ year: st.year, quality: st.quality, yield: yield_ });
    if (st.history.length > 12) st.history.shift();
    st.rainTicks = 0; st.growTicks = 0; st.warned = 0;
    st.year++;

    st.famine = clamp(1 - stock() / 0.55, 0, 1);   // the new crop lifts the shortage at once, not tomorrow

    const word = quality > 1.02 ? 'a fat harvest' : quality > 0.85 ? 'a fair harvest' : quality > 0.62 ? 'a thin harvest' : 'a failed harvest';
    const why = wet < 0.18 ? 'The summer was dry and the paddies cracked.' : wet > 0.55 ? 'The rains would not stop and the rice lay flat in the water.' : 'The weather held.';
    log(`🌾 Year ${st.year - 1}: ${word}. ${why} ${yield_} sacks are in the granary — ${Math.round(stock() * 100)}% of what the valley needs to see the year out.`,
      quality > 0.85 ? 'festival' : 'danger');

    // a good year is felt by everyone
    for (const s of G.sims) {
      if (!live(s) || s.faction !== 'village') continue;
      if (quality > 1.0) s.addMoodlet?.('goodyear', 'A good harvest', 14, 2880);
      else if (quality < 0.65) s.addMoodlet?.('badyear', 'The harvest failed', -16, 2880);
    }
  }

  // ---------------- eating, and going without ----------------
  function dayTick() {
    // the valley eats
    const ate = eaters() * RATION;
    st.granary = Math.max(0, st.granary - ate);

    const s0 = stock();
    st.famine = clamp(1 - s0 / 0.55, 0, 1);           // bites once the store is under half what's needed

    if (st.famine > 0.25 && st.warned < 1) {
      st.warned = 1;
      log(`The granary is low and the year is not yet turned. Rice is getting dear in the market.`, 'danger');
    }
    if (st.famine > 0.7 && st.warned < 2) {
      st.warned = 2;
      log(`😖 There is hunger in Haeryeong. Thin children at the well, and the price of a sack is past what a labourer earns in a week.`, 'danger');
    }

    if (st.famine <= 0.05) return;

    // Hunger falls hardest on those who cannot buy their way out of it.
    const soc = sysOf('society');
    for (const s of G.sims) {
      if (!live(s) || s.hidden || s.faction !== 'village') continue;
      const poor = s.coins < 25 + st.famine * 60;
      if (!poor) continue;
      s.needs.hunger = clamp(s.needs.hunger - st.famine * 16, 0, 100);
      if (chance(st.famine * 0.1)) s.addMoodlet?.('hungry', 'Going without', -18, 1440);
      // the worst of it drives people out of the valley, or to desperate things
      if (st.famine > 0.6 && chance(0.03)) s.coins = Math.max(0, s.coins - 3);
    }

    // patience with whoever rules runs out
    if (st.famine > 0.5) {
      const RP = sysOf('royalPower');
      if (RP?.st && typeof RP.st.minsim === 'number') RP.st.minsim = Math.max(0, RP.st.minsim - st.famine * 0.8);
      const O = sysOf('officials');
      const head = G.sims.find((s) => s.id === O?.st?.headman);
      if (head && chance(0.3)) head.needs.honor = clamp(head.needs.honor - 1.5, 0, 100);
    }

    // relief: those with stores and a conscience, or an office to protect
    if (st.famine > 0.45) openStores();
  }

  // the headman, the king, or a rich house moved by shame or kindness
  function openStores() {
    if (st.relief > G.env.day - 2) return;
    const O = sysOf('officials');
    const soc = sysOf('society');
    const head = G.sims.find((s) => s.id === O?.st?.headman);
    const king = G.king && !G.king.dead ? G.king : null;
    const giver = [head, king].find((s) => live(s) && s.coins > 200 && (s.has?.('Gentle') || s.has?.('Pious') || chance(0.4)))
      || G.sims.filter((s) => live(s) && !s.household && s.coins > 900 && (s.has?.('Gentle') || s.has?.('Pious'))).sort((a, b) => b.coins - a.coins)[0];
    if (!giver) return;
    const spend = Math.min(400, Math.floor(giver.coins * 0.25));
    if (spend < 60) return;
    giver.coins -= spend;
    const sacks = Math.round(spend / 10);
    st.granary += sacks;
    st.relief = G.env.day;
    soc?.addNews?.(giver, 'generous');
    giver.needs.honor = clamp(giver.needs.honor + 10, 0, 100);
    log(`🍚 ${giver.name.full} opened ${giver.sex === 'f' ? 'her' : 'his'} stores and bought ${sacks} sacks for the village. There was a queue at the gate before dawn.`, 'story', giver.pos);
  }

  const S = {
    id: 'harvest', st,
    stock, famine: () => st.famine, granary: () => st.granary,

    onEvent(name) {
      try {
        if (name === 'ready') {
          // start mid-stocked so the first autumn is not a crisis
          st.granary = Math.round(eaters() * RATION * 16 * 0.75);
        }
        if (name === 'day') {
          dayTick();
          // the harvest comes in on the first day of autumn
          if (season() === 'autumn' && G.env.day - st.lastHarvest > 3) reap();
        }
      } catch (e) { console.error('[harvest]', e); }
    },

    update(dt, gm) {
      if (!G.started) return;
      weatherTick(gm);
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 2;
      // the price of rice follows the store, instead of wandering at random
      const E = G.economy; if (!E?.prices) return;
      const s0 = stock();
      const mult = clamp(1.25 - s0 * 0.75, 0.75, 3.2);
      E.prices.rice = Math.max(3, Math.round(8 * mult));
    },

    panelHtml() { return ''; },

    status() {
      const s0 = stock();
      const word = s0 > 1 ? 'full' : s0 > 0.6 ? 'holding' : s0 > 0.35 ? 'running low' : s0 > 0.15 ? 'nearly empty' : 'empty';
      const last = st.history[st.history.length - 1];
      return [`The granary is ${word} — ${Math.round(st.granary)} sacks, ${Math.round(s0 * 100)}% of the year's need.`,
        last ? `Last harvest: ${last.quality > 1 ? 'good' : last.quality > 0.85 ? 'fair' : last.quality > 0.62 ? 'thin' : 'failed'} (${last.yield} sacks).` : '',
        st.famine > 0.3 ? `⚠ There is hunger in the valley.` : ''].filter(Boolean);
    },

    simMenuItems(me, o) {
      if (!me?.household || o !== me || st.famine < 0.25 || me.coins < 100) return [];
      return [{ label: `🍚 Buy rice for the hungry (100 nyang)`, fn: () => {
        if (me.coins < 100) return;
        me.coins -= 100; st.granary += 10; st.relief = G.env.day;
        me.needs.honor = Math.min(100, (me.needs.honor || 50) + 12);
        sysOf('society')?.addNews?.(me, 'generous');
        G.ui?.toast('You bought ten sacks for the village. They will remember it.');
        log(`${me.name.full} bought rice for the hungry out of ${me.sex === 'f' ? 'her' : 'his'} own purse.`, 'story', me.pos);
      } }];
    },

    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
