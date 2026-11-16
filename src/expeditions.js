// Trade expeditions (행상): load a caravan with goods, send a family member (or hired drovers)
// over the passes to a neighbouring realm, and wait for news. Each realm pays more for what it lacks.
// The road has bandits, storms and greedy toll-keepers; war closes the border.
const REALM = {
  seorang: { name: 'Seorang', ko: '서랑', days: 1.5, wants: { rice: 1.6, silk: 1.3, painting: 1.8, kimchi: 1.5 }, brings: ['a lacquered box inlaid with mother-of-pearl', 'Seorang plum wine', 'a bolt of gold brocade'], road: ['the river ferry at Nakdong crossing', 'the plum orchards of the southern hills', 'a stone pagoda older than any kingdom'] },
  hwaru: { name: 'Hwaru', ko: '화루', days: 2, wants: { salt: 1.9, silk: 2.0, porcelain: 1.7, tteok: 1.5, kimchi: 1.4 }, brings: ['a sturdy steppe saddle', 'a silver-chased horn bow', 'fermented mare’s milk'], road: ['the windswept grass sea', 'the felt tents of a horse clan', 'a sky burial site on the high ridge'] },
  heukpa: { name: 'Heukpa', ko: '흑파', days: 1.5, wants: { ginseng: 2.0, foxFur: 2.2, deerHide: 1.7, rice: 1.4, tigerBone: 1.8 }, brings: ['dried abalone and sea cucumber', 'a pearl the size of a quail egg', 'a sea-captain’s brass spyglass'], road: ['the salt flats at low tide', 'a smugglers’ cove of black sand', 'the sea-princes’ red-sailed fleet at anchor'] },
};
const SELLABLE = ['rice', 'salt', 'silk', 'ginseng', 'porcelain', 'painting', 'kimchi', 'scroll', 'deerHide', 'boarHide', 'foxFur', 'rabbitFur', 'tigerBone'];
const nice = (k) => k.replace(/([A-Z])/g, ' $1').toLowerCase();

export function createExpeditionsSystem(G) {
  const day = () => G.env.day + G.env.hour / 24;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = {
    id: 'expeditions', trips: [],
    atWar(rid) { const w = G.systems.find((x) => x.id === 'war')?.st?.war; return w && w.realm === rid; },
    objMenuItems(me, o) {
      if (!me.household || !(o.kind === 'shop' || o.kind === 'stallWork')) return [];
      return [{ label: `🐫 Send a trade caravan${this.trips.length ? ` (${this.trips.length} on the road)` : ''}`, fn: () => this.open(me) }];
    },
    open(me) {
      const owner = G.household[0];
      const stock = SELLABLE.filter((k) => G.household.some((s) => s.inv?.[k] > 0));
      const leaders = G.household.filter((s) => !s.dead && !s.hidden && s.age !== 'child' && s.age !== 'elder' && !s.controlled);
      const sel = { realm: 'seorang', leader: 'hired', cargo: {} };
      const total = (k) => G.household.reduce((a, s) => a + (s.inv?.[k] || 0), 0);
      const P = G.economy.prices;
      const render = () => {
        const R = REALM[sel.realm]; const war = this.atWar(sel.realm);
        const est = Object.entries(sel.cargo).reduce((a, [k, n]) => a + n * (P[k] || 10) * (R.wants[k] || 1.1), 0);
        const el = G.ui.modal(`<h2>Trade Caravan · 행상</h2>
          <p>Load goods, choose a realm and a leader. Each realm pays well for what it lacks. The road takes about ${R.days} days each way, and it is not safe.</p>
          <div class="ex-realms">${Object.entries(REALM).map(([id, r]) => `<button data-realm="${id}" class="${id === sel.realm ? 'on' : ''}" ${this.atWar(id) ? 'disabled' : ''}>${r.name} <span class="ko">${r.ko}</span><small>${this.atWar(id) ? '⚔ border closed — at war' : 'wants ' + Object.keys(r.wants).map(nice).join(', ')}</small></button>`).join('')}</div>
          <h3>Cargo</h3>
          ${stock.length ? `<div class="ex-cargo">${stock.map((k) => `<div><span>${nice(k)} <small>(have ${total(k)}, ~${Math.round((P[k] || 10) * (R.wants[k] || 1.1))} each there)</small></span><span><button data-dec="${k}">−</button> <b>${sel.cargo[k] || 0}</b> <button data-inc="${k}">+</button></span></div>`).join('')}</div>` : '<p class="muted">Your household has nothing to trade. Buy goods at the market, hunt furs, or make paintings and kimchi first.</p>'}
          <h3>Leader</h3>
          <div class="ex-lead"><button data-lead="hired" class="${sel.leader === 'hired' ? 'on' : ''}">Hired drovers (25 nyang, timid)</button>${leaders.map((s) => `<button data-lead="${s.id}" class="${String(sel.leader) === String(s.id) ? 'on' : ''}">${esc(s.name.given)} <small>${s.fighter ? '⚔ ' : ''}charisma ${s.skills.charisma.toFixed(1)}</small></button>`).join('')}</div>
          <p class="ex-est">Expected takings: <b>~${Math.round(est)} nyang</b>${sel.leader !== 'hired' ? ', plus whatever stories and gifts they bring home' : ''}.</p>
          <button class="ex-go" ${!Object.values(sel.cargo).some((n) => n > 0) || war || (sel.leader === 'hired' && owner.coins < 25) ? 'disabled' : ''}>Set out · 출발</button>`);
        el.querySelectorAll('[data-realm]').forEach((b) => (b.onclick = () => { sel.realm = b.dataset.realm; render(); }));
        el.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => { sel.leader = b.dataset.lead; render(); }));
        el.querySelectorAll('[data-inc]').forEach((b) => (b.onclick = () => { const k = b.dataset.inc; sel.cargo[k] = Math.min(total(k), (sel.cargo[k] || 0) + 1); render(); }));
        el.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = () => { const k = b.dataset.dec; sel.cargo[k] = Math.max(0, (sel.cargo[k] || 0) - 1); render(); }));
        const go = el.querySelector('.ex-go'); if (go) go.onclick = () => { this.depart(sel); el.classList.add('hidden'); };
      };
      render();
    },
    depart(sel) {
      const owner = G.household[0]; const R = REALM[sel.realm];
      // take the cargo out of the household's stores
      for (const [k, n0] of Object.entries(sel.cargo)) { let n = n0; for (const s of G.household) { const t = Math.min(n, s.inv?.[k] || 0); if (t > 0) { s.inv[k] -= t; n -= t; } } }
      let leader = null;
      if (sel.leader === 'hired') owner.coins -= 25;
      else { leader = G.sims.find((s) => s.id === +sel.leader); if (leader) { leader.cancelAction(); leader.setHidden(true); leader.missionLock = true; leader.away = 'caravan'; if (G.selected === leader) G.select(owner === leader ? G.household.find((x) => x !== leader) : owner); G.ui.refreshHousehold(); } }
      const trip = { realm: sel.realm, cargo: { ...sel.cargo }, leader: leader?.id ?? null, leaderName: leader?.name.given || 'the hired drovers', start: day(), back: day() + R.days * 2 + Math.random() * 0.5, events: [], loss: 0, bonus: 0, nextNews: day() + 0.4 };
      this.trips.push(trip);
      G.log(`A caravan of the ${owner.name.surname} household sets out for ${R.name}, led by ${trip.leaderName}: ${Object.entries(sel.cargo).filter(([, n]) => n).map(([k, n]) => `${n} ${nice(k)}`).join(', ')}.`, 'story', owner.pos);
      G.ui.toast(`🐫 The caravan departs for ${R.name}. Expect them back in about ${Math.round(R.days * 2)} days.`, 'story');
    },
    news(trip) {
      const R = REALM[trip.realm]; const leader = trip.leader != null ? G.sims.find((s) => s.id === trip.leader) : null;
      const fighter = leader?.fighter, cha = leader?.skills.charisma || 1;
      const r = Math.random();
      let msg;
      if (r < 0.18) {
        const fend = fighter ? 0.75 : leader ? 0.35 : 0.15;
        if (Math.random() < fend) { msg = `Bandits in the pass! ${trip.leaderName} ${fighter ? 'drew steel and drove them off' : 'talked and bribed their way past'}.`; trip.bonus += fighter ? 0.05 : -0.05; if (leader && fighter) leader.skills.sword = Math.min(10, leader.skills.sword + 0.3); }
        else { msg = `Bandits in the pass! They made off with part of the cargo.`; trip.loss += 0.2 + Math.random() * 0.15; if (leader) leader.hp = Math.max(leader.maxHp * 0.3, leader.hp - leader.maxHp * 0.4); }
      } else if (r < 0.35) { msg = 'A storm on the road; a cart overturned in the mud.'; trip.loss += 0.07; }
      else if (r < 0.48) { msg = `A greedy toll-keeper at the border demanded his cut.${cha > 4 ? ` ${trip.leaderName} charmed him down to half.` : ''}`; trip.loss += cha > 4 ? 0.03 : 0.06; }
      else if (r < 0.62) { msg = `A rich ${R.name} merchant took a liking to the goods and promised a better price.`; trip.bonus += 0.15 + cha * 0.01; }
      else msg = `They passed ${R.road[Math.floor(Math.random() * R.road.length)]}. All is well.`;
      trip.events.push(msg);
      G.log(`📜 Letter from the caravan (${R.name}): ${msg}`, 'story');
    },
    arrive(trip) {
      const R = REALM[trip.realm]; const P = G.economy.prices; const owner = G.household[0] || (trip.leader != null ? G.sims.find((s) => s.id === trip.leader && !s.dead) : null);
      const leader = trip.leader != null ? G.sims.find((s) => s.id === trip.leader) : null;
      let gross = 0; for (const [k, n] of Object.entries(trip.cargo)) gross += n * (P[k] || 10) * (R.wants[k] || 1.1);
      const mult = Math.max(0.2, 1 - trip.loss + trip.bonus) * (leader ? 1 + leader.skills.charisma * 0.025 : 0.9);
      const takings = Math.round(gross * mult);
      if (!owner) { G.log(`The caravan returns from ${R.name}, but there is no one left of the house to receive it. The drovers sell the goods and go their way.`, 'story'); return; }
      owner.earn(takings);
      let gift = '';
      if (leader && !leader.dead) {
        leader.setHidden(false); leader.missionLock = false; leader.away = null; G.ui.refreshHousehold();
        const door = leader.home?.door || [0, 0]; leader.pos.set(door[0] + 1, leader.pos.y, door[1] + 1);
        leader.skills.charisma = Math.min(10, leader.skills.charisma + 0.6);
        leader.addMoodlet('traveled', `Home from ${R.name}`, 14, 1440); leader.needs.fun = 100;
        if (Math.random() < 0.6) { gift = R.brings[Math.floor(Math.random() * R.brings.length)]; for (const s of G.household) s.addMoodlet('gift', `A gift from ${R.name}: ${gift}`, 8, 1440); }
        G.systems.find((x) => x.id === 'memories')?.remember?.(leader, null, `The road to ${R.name}`, 14);
      }
      G.log(`🐫 The caravan returns from ${R.name}! ${trip.leaderName} brings home ${takings} nyang${gift ? ` and ${gift}` : ''}. ${trip.events.length ? 'They have stories to tell.' : ''}`, 'tournament', owner.pos);
      G.ui.toast(`🐫 Caravan home from ${R.name}: +${takings} nyang${gift ? ` · ${gift}` : ''}`, 'festival');
    },
    update() {
      if (!this.trips.length) return;
      const now = day();
      for (const t of this.trips) { const s = t.leader != null ? G.sims.find((x) => x.id === t.leader) : null; if (s) for (const k in s.needs) s.needs[k] = Math.max(s.needs[k], 55); } // fed and sheltered on the road
      for (const t of this.trips.slice()) {
        if (this.atWar(t.realm) && !t.warned) { t.warned = true; t.loss += 0.25; t.events.push('War broke out! They fled back across the border.'); t.back = Math.min(t.back, now + 0.5); G.log(`⚔ War with ${REALM[t.realm].name}! The caravan abandons its business and races home.`, 'danger'); }
        if (now >= t.nextNews && now < t.back - 0.2) { t.nextNews = now + 0.75 + Math.random() * 0.45; this.news(t); }
        if (now >= t.back) { this.trips.splice(this.trips.indexOf(t), 1); this.arrive(t); }
      }
    },
    status() { return this.trips.map((t) => `🐫 Caravan to <b>${REALM[t.realm].name}</b> led by ${esc(t.leaderName)}, due back day ${Math.ceil(t.back)}.`); },
    serialize() { return this.trips; },
    restore(d, get) { this.trips = d || []; for (const t of this.trips) { const s = t.leader != null ? get(t.leader) : null; if (s) { s.setHidden(true); s.missionLock = true; s.away = 'caravan'; } } },
  };
  return S;
}
