// Hunting (사냥): game you bring down leaves meat and hides instead of instant coin.
// Sell them at the market (furs fetch more in winter), cook the meat, have a fur coat made,
// or present a tiger pelt to the King. Herds slowly return to the hills.
const LOOT = {
  deer: [['venison', 2], ['deerHide', 1]],
  boar: [['boarMeat', 3], ['boarHide', 1]],
  rabbit: [['rabbitMeat', 1], ['rabbitFur', 1]],
  fox: [['foxFur', 1]],
  tiger: [['tigerPelt', 1], ['tigerBone', 1]],
};
const NAMES = {
  venison: ['venison', '사슴고기'], boarMeat: ['boar meat', '멧돼지고기'], rabbitMeat: ['rabbit meat', '토끼고기'],
  deerHide: ['deer hide', '사슴가죽'], boarHide: ['boar hide', '멧돼지가죽'], rabbitFur: ['rabbit fur', '토끼털'], foxFur: ['fox fur', '여우털'],
  tigerPelt: ['tiger pelt', '호피'], tigerBone: ['tiger bone (medicine)', '호골'],
};
const BASE = { venison: 6, boarMeat: 7, rabbitMeat: 3, deerHide: 14, boarHide: 12, rabbitFur: 6, foxFur: 26, tigerPelt: 380, tigerBone: 90 };
const MEAT = ['venison', 'boarMeat', 'rabbitMeat'];
const FUR = ['deerHide', 'boarHide', 'rabbitFur', 'foxFur'];
const nm = (k, n = 1) => `${n} ${NAMES[k][0]}`;

export function createHuntingSystem(G) {
  const S = {
    id: 'hunting',
    init() { const P = G.economy.prices; for (const k in BASE) P[k] ??= BASE[k]; },
    hook() {
      const A = G.animals; if (!A || A._huntHooked) return; A._huntHooked = true; const orig = A.kill.bind(A);
      A.kill = (a, killer) => {
        const loot = killer && LOOT[a.type];
        if (!loot || !killer.household) return orig(a, killer);
        // household hunters get the animal itself, not a coin purse
        orig(a, null); // death bookkeeping without the old payout
        if (a.type === 'tiger') { killer.needs.honor = 100; killer.addMoodlet('tiger', 'Tiger Slayer!', 40, 4320); killer.tigerSlayer = true; G.log(`🐯 ${killer.name.full} has slain the great Korean tiger of the mountains! Its pelt alone is worth a fortune.`, 'tournament', a.pos); G.systems.find((x) => x.id === 'missions')?.addFame?.(killer, 'blade', 12); }
        const got = [];
        const skill = killer.skills.archery || 0;
        for (const [k, n0] of loot) { const n = n0 + (Math.random() < skill / 20 ? 1 : 0); killer.inv = killer.inv || {}; killer.inv[k] = (killer.inv[k] || 0) + n; got.push(nm(k, n)); }
        killer.skills.hunting = Math.min(10, (killer.skills.hunting || 0) + 0.25); G.systems.find((x) => x.id === 'missions')?.addFame?.(killer, 'hunt', a.type === 'tiger' ? 0 : 2);
        G.ui?.toast(`🦌 ${killer.name.given} dresses the ${a.def.name.toLowerCase()}: ${got.join(', ')}. Sell at the market or cook it.`);
      };
    },
    // seasonal prices: furs dear in winter, meat dear in lean spring
    onEvent(name) {
      if (name === 'ready') this.hook();
      if (name === 'day') {
        const P = G.economy.prices, se = G.env.season;
        for (const k in BASE) {
          let m = 0.85 + Math.random() * 0.3;
          if (FUR.includes(k) || k === 'tigerPelt') m *= se === 'winter' ? 1.6 : se === 'autumn' ? 1.2 : se === 'summer' ? 0.8 : 1;
          if (MEAT.includes(k)) m *= se === 'spring' ? 1.3 : se === 'autumn' ? 0.9 : 1;
          P[k] = Math.max(1, Math.round(BASE[k] * m));
        }
        // herds return to the hills
        const A = G.animals; const count = (t) => A.list.filter((a) => a.type === t && !a.dead).length;
        const want = { deer: 14, rabbit: 10, boar: 5, fox: 3 };
        for (const [t, n] of Object.entries(want)) {
          const missing = n - count(t); if (missing <= 0) continue;
          const k = Math.min(missing, t === 'deer' ? 3 : 2);
          const ang = Math.random() * Math.PI * 2, r = 220 + Math.random() * 160; const cx = Math.cos(ang) * r, cz = Math.sin(ang) * r;
          for (let i = 0; i < k; i++) A.spawn(t, cx + (Math.random() - 0.5) * 8, cz + (Math.random() - 0.5) * 8, { home: [cx, cz], range: 40 });
        }
        if (!count('tiger') && Math.random() < 0.15) { A.spawn('tiger', 400 * Math.sign(Math.random() - 0.5), 400 * Math.sign(Math.random() - 0.5), { range: 90 }); G.log('Woodcutters whisper of fresh pawprints high on the ridge. A tiger has come down from the northern mountains.', 'omen'); }
      }
    },
    have(s, keys) { return keys.reduce((a, k) => a + (s.inv?.[k] || 0), 0); },
    take(s, keys, n) { for (const k of keys) { while (n > 0 && s.inv?.[k] > 0) { s.inv[k]--; n--; } } },
    objMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      if (o.kind === 'shop' || o.kind === 'stallWork') {
        const P = G.economy.prices; const goods = Object.keys(BASE).filter((k) => me.inv?.[k] > 0 && k !== 'tigerPelt');
        if (goods.length) {
          const total = goods.reduce((a, k) => a + Math.floor(P[k] * (0.9 + me.skills.charisma * 0.01)) * me.inv[k], 0);
          out.push({ label: `🦌 Sell game (${goods.map((k) => `${me.inv[k]} ${NAMES[k][0]}`).join(', ')}) — ${total} nyang`, fn: () => { for (const k of goods) me.inv[k] = 0; me.earn(total); G.audio?.ui?.(); G.ui.toast(`Sold the hunt for ${total} nyang.`); } });
        }
        if (me.inv?.tigerPelt > 0) out.push({ label: `🐯 Sell the tiger pelt — ${P.tigerPelt} nyang`, fn: () => { me.inv.tigerPelt--; me.earn(P.tigerPelt); G.log(`${me.name.full} sells a tiger pelt for ${P.tigerPelt} nyang. The merchant can hardly breathe.`, 'story', me.pos); } });
        if (!me.furCoat && this.have(me, FUR) >= 3) out.push({ label: `🧥 Have a fur-lined coat made (3 hides/furs + 20 nyang)`, disabled: me.coins < 20, fn: () => { this.take(me, ['rabbitFur', 'boarHide', 'deerHide', 'foxFur'], 3); me.coins -= 20; me.furCoat = true; G.ui.toast(`${me.name.given} wears a fur-lined coat. Winter will bite less.`, 'festival'); } });
      }
      if ((o.kind === 'cookpot' || o.kind === 'campfire') && this.have(me, MEAT) > 0) out.push({ label: '🍖 Cook the meat (feeds the household)', fn: () => {
        const k = MEAT.find((x) => me.inv?.[x] > 0); me.inv[k]--;
        for (const s of G.household) if (!s.dead && s.pos.distanceTo(me.pos) < 30) { s.needs.hunger = Math.min(100, s.needs.hunger + 55); s.addMoodlet('feast', k === 'venison' ? 'Venison stew' : k === 'boarMeat' ? 'Roast boar' : 'Rabbit soup', 9, 600); }
        me.char.setAnim?.('stir'); G.fx?.smoke?.(me.pos.clone().setY(me.pos.y + 1), 6);
        G.log(`The smell of ${NAMES[k][0]} drifts from the ${me.name.surname} kitchen.`, 'story', me.pos);
      } });
      return out;
    },
    simMenuItems(me, o) {
      if (!me.household || o.job !== 'king' || o.dead || !(me.inv?.tigerPelt > 0)) return [];
      return [{ label: '🐯 Present a tiger pelt to the King', fn: () => {
        me.inv.tigerPelt--; me.earn(250); me.needs.honor = 100; o.changeRel(me, 30);
        const F = G.factions; if (me.factions.court) me.factions.court.rep += 80;
        G.log(`${me.name.full} lays a great tiger pelt before King ${o.name.given}. The court gasps; the King rewards the hunter with 250 nyang and his favour.`, 'tournament', me.pos);
        G.ui.toast('👑 The King is delighted! +250 nyang', 'festival'); void F;
      } }];
    },
    update(dt, gm) {
      // a fur coat keeps the cold off in winter
      if (G.env.season !== 'winter') return;
      this._t = (this._t || 0) - gm; if (this._t > 0) return; this._t = 60;
      for (const s of G.household) if (s.furCoat && !s.dead) { s.needs.energy = Math.min(100, s.needs.energy + 1.5); if (!s.moodlets.some((m) => m.id === 'furWarm')) s.addMoodlet('furWarm', 'Warm in a fur coat', 6, 180); }
    },
    panelHtml(s) {
      const items = Object.keys(BASE).filter((k) => s.inv?.[k] > 0);
      if (!items.length && !s.furCoat && !s.skills.hunting) return '';
      return `<div class="facts">🏹 Hunting ${(s.skills.hunting || 0).toFixed(1)}${s.furCoat ? ' · 🧥 fur coat' : ''}${items.length ? '<br>' + items.map((k) => `${s.inv[k]}× ${NAMES[k][0]}`).join(', ') : ''}</div>`;
    },
  };
  return S;
}
