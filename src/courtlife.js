// Palace eunuchs (내시) and the temple's monks (스님).
//  • Eunuchs run the inner palace: they attend the King, guard his doors and know every secret.
//    A little silver buys gossip, a private audience, or a kind word in the royal ear — and the Chief
//    Eunuch (상선) notices treason before anyone else.
//  • Monks keep the mountain temple: blessings, sanctuary for the hunted, vows for the weary, the old
//    staff-and-sword arts for the worthy, and a morning alms round through the village.
import { LAYOUT } from './terrain.js';
import { SURNAMES } from './data.js';

export function createCourtLifeSystem(G) {
  const st = { eunuchs: [], chief: null, almsDay: -1 };
  const day = () => G.env.day + G.env.hour / 24;
  const sys = (id) => G.systems.find((x) => x.id === id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const king = () => (G.king && !G.king.dead ? G.king : null);
  const eunuchs = () => st.eunuchs.map((id) => G.sims.find((s) => s.id === id)).filter((s) => s && !s.dead);
  const chief = () => G.sims.find((s) => s.id === st.chief && !s.dead) || null;
  function dress(e, isChief) { e.uniform = { outfit: 'scholar', colors: { robe: isChief ? '#5a2a5a' : '#2f4a4a', top: '#e8e2d2', bottom: '#e8e2d2', belt: isChief ? '#d9b44a' : '#1a1a1a' }, hat: 'gat', beard: false, weapon: false }; e.rebuildModel(); }
  function spawnEunuchs(n) {
    const [px, pz] = LAYOUT.palace;
    for (let i = 0; i < n; i++) {
      const isChief = !chief();
      const e = G.spawn({ sex: 'm', age: isChief ? 'elder' : pick(['young', 'adult']), job: 'eunuch', home: G.vhouses?.royal, surname: pick(SURNAMES), traits: [pick(['Cunning', 'Loyal', 'Greedy', 'Gentle']), pick(['Scholarly', 'Pious', 'Ambitious'])], x: px + 18 + Math.random() * 6, z: pz - 12 + Math.random() * 4, coins: isChief ? 300 : 40 });
      e.eunuch = { loyalty: 60 + Math.random() * 30 }; e.missionLock = true; dress(e, isChief);
      if (isChief) st.chief = e.id;
      st.eunuchs.push(e.id);
    }
  }
  function attend(dt) {
    const k = king(); const [px, pz] = LAYOUT.palace;
    eunuchs().forEach((e, i) => {
      if (e.hidden || e.combat.target) return;
      for (const n in e.needs) e.needs[n] = Math.max(e.needs[n], 45);
      const inPalace = k && Math.hypot(k.pos.x - px, k.pos.z - pz) < 70;
      const [tx, tz] = inPalace ? [k.pos.x + Math.sin(k.heading + 2.4 + i * 0.5) * (4 + i), k.pos.z + Math.cos(k.heading + 2.4 + i * 0.5) * (4 + i)] : [px + 16 + i * 2, pz - 10];
      const d = Math.hypot(e.pos.x - tx, e.pos.z - tz);
      if (d > 3.5) { if (e.action?.type !== 'goto' || (e._t = (e._t || 0) + dt) > 2) { e._t = 0; e.cancelAction(); e.startAction({ type: 'goto', dest: [tx, tz], label: inPalace ? 'Attending His Majesty' : 'Keeping the inner palace' }); } }
      else if (!e.action) { if (k) e.heading = Math.atan2(k.pos.x - e.pos.x, k.pos.z - e.pos.z); e.action = { type: 'event', phase: 'do', anim: inPalace ? 'bow' : 'idle', dur: 6, t: 0, label: inPalace ? 'Attending His Majesty' : 'Keeping the inner palace' }; }
    });
  }
  function gossip(me) {
    const k = king(); const lines = [];
    if (k) { const f = Math.round(k.getRel(me).f); lines.push(`His Majesty ${f > 40 ? 'speaks warmly of your house' : f >= 0 ? 'knows your name, no more' : f > -30 ? 'frowns when your name is mentioned' : 'calls your family "that pack of wolves"'} (favour ${f}).`); }
    const RP = sys('royalPower'); if (RP) lines.push(`The people are ${RP.band()} (${Math.round(RP.st.minsim)}); the King ${RP.st.tax === 'high' || RP.st.tax === 'crushing' ? 'counts every coin and means to keep the taxes high' : 'is minded to keep the peace at home'}.`);
    const W = sys('war')?.st; if (W?.realms) { const rid = Object.keys(W.realms).sort((a, b) => W.realms[b].tension - W.realms[a].tension)[0]; lines.push(`The generals whisper most about ${rid[0].toUpperCase() + rid.slice(1)} (tension ${Math.round(W.realms[rid].tension)}).`); }
    const lotus = G.sims.filter((s) => !s.dead && s.factions?.lotus).length; if (lotus >= 2) lines.push(`Lamps burn late in odd houses: the Black Lotus has at least ${lotus} sworn brothers in the valley.`);
    const R = sys('rivals'); if (R?.clan && !R.allied && Math.random() < 0.5) { R.evidence = Math.min(5, R.evidence + 1); lines.push(`A ${R.clan} servant was seen paying a clerk at night. (Evidence against the ${R.clan} clan +1.)`); }
    const pm = sys('politics')?.primeMinister?.(); if (pm && !pm.household) lines.push(`Chief State Councillor ${pm.name.given} ${pm.has?.('Greedy') ? 'keeps two sets of ledgers — an inquiry would find them' : 'is clean as a scholar’s inkstone'}.`);
    const T = sys('royalGuard')?.threat?.(); if (T?.reasons?.length) lines.push(`Danger to the throne is ${T.score > 60 ? 'grave' : T.score > 30 ? 'real' : 'slight'}: ${T.reasons.slice(0, 2).join('; ')}.`);
    const RG = sys('royalGuard'); if (RG) { const L = RG.avgLoyalty(); lines.push(`The royal guard's loyalty is ${L > 65 ? 'iron' : L > 40 ? 'steady' : 'wavering — silver might buy one'}.`); }
    return lines;
  }
  function eunuchMenu(me, e) {
    const isChief = e.id === st.chief; const out = [];
    out.push({ label: '🤫 Buy palace gossip (15 nyang)', disabled: me.coins < 15, fn: () => { me.coins -= 15; e.earn(15); const L = gossip(me); G.ui.modal(`<h2>Whispers of the Inner Palace</h2><p class="sg-text">${e.name.given} glances down the corridor and lowers his voice:</p><ul class="uw-roads">${L.map((l) => `<li>${l.replace(/</g, '&lt;')}</li>`).join('')}</ul>`); } });
    if (king()) out.push({ label: '🚪 Arrange a private audience with the King (30)', disabled: me.coins < 30, fn: () => { me.coins -= 30; e.earn(30); G.ui.openAudience?.(me); } });
    if (isChief && king()) out.push({ label: '👂 Ask the Chief Eunuch to speak well of you to the King (60)', disabled: me.coins < 60, fn: () => { me.coins -= 60; e.earn(60); const ok = Math.random() < 0.75; if (ok) { king().changeRel(me, 12); G.ui.toast(`${e.name.given} murmurs in the royal ear. The King's favour warms.`, 'story'); } else G.ui.toast(`${e.name.given} takes the silver and smiles. Nothing seems to change.`); } });
    return out;
  }
  // ---------------- monks ----------------
  function monkMenu(me, m) {
    const out = [];
    out.push({ label: '🙏 Ask for a blessing (5 nyang)', disabled: me.coins < 5, fn: () => { me.coins -= 5; me.needs.honor = Math.min(100, me.needs.honor + 6); me.addMoodlet('blessing', `Blessed by ${m.name.given}`, 8, 1440); m.say('나무아미타불… May your path be clear.', 'happy', 4); } });
    if (me.outlaw) out.push({ label: '🏯 Seek sanctuary at the temple (a day and a night)', fn: () => {
      me.cancelAction(); me.setHidden(true); me.missionLock = true; me.away = 'temple'; me.sanctuary = day() + 1; if (me.controlled) G.player.toggleMode('overseer'); G.ui?.refreshHousehold?.();
      G.log(`${me.name.full} kneels at the temple gate and asks for sanctuary. The abbot closes the gate behind them; no constable may enter.`, 'story', me.pos);
    } });
    if (me.age !== 'child' && !me.spouse && me.job !== 'monk' && me.job !== 'king') out.push({ label: '📿 Take monastic vows (become a monk)', danger: true, fn: () => {
      me.prevJob = me.job; me.job = 'monk'; me.uniform = null; me.rebuildModel(); me.needs.honor = Math.min(100, me.needs.honor + 15); me.addMoodlet('vows', 'Took the vows', 15, 4320);
      G.log(`${me.name.full} shaves their head before the Buddha and takes the vows of a monk. The world grows very quiet.`, 'omen', me.pos);
    } });
    if (me.job === 'monk' && me.prevJob) out.push({ label: '🚶 Return your robes and go back to the world', fn: () => { me.job = me.prevJob; me.prevJob = null; me.rebuildModel(); G.log(`${me.name.full} returns their robes and walks back down the mountain.`, 'story', me.pos); } });
    if (me.age !== 'child') out.push({ label: '🥋 Train in the temple’s staff-and-sword arts (40 nyang)', disabled: me.coins < 40 || (me._monkTrain || -9) > day(), fn: () => { me.coins -= 40; me._monkTrain = day() + 1; me.skills.sword = Math.min(10, me.skills.sword + 0.6); me.needs.energy = Math.max(0, me.needs.energy - 30); me.addMoodlet('templetrain', 'Trained with the warrior monks', 8, 720); G.ui.toast(`${me.name.given} spars with the warrior monks until dusk. (Sword +0.6)`); } });
    return out;
  }
  function almsRound() {
    const monks = G.sims.filter((s) => !s.dead && !s.hidden && s.job === 'monk' && !s.household && !s.combat.target).slice(0, 3);
    if (!monks.length) return;
    const [vx, vz] = LAYOUT.village;
    monks.forEach((m, i) => { m.cancelAction(); m.startAction({ type: 'event', dest: [vx + (i - 1) * 6, vz + 6], run: false, anim: 'bow', dur: 50, look: [vx, vz], label: 'On the morning alms round (탁발)', then: (z) => { const givers = G.sims.filter((s) => !s.dead && s.faction === 'village' && s.coins > 10 && s.pos.distanceTo(z.pos) < 25).slice(0, 4); for (const g of givers) { g.coins -= 2; z.earn(2); g.addMoodlet('alms', 'Gave alms to a monk', 4, 600); } } }); });
    G.log('In the grey dawn, monks with wooden bowls walk the village lanes on their alms round (탁발). A temple bell answers from the mountain.', 'omen', { x: vx, z: vz });
  }

  const S = {
    id: 'courtLife', st, eunuchs, chief,
    onEvent(name, p) {
      if (name === 'ready' && !eunuchs().length) spawnEunuchs(4);
      if (name === 'day') {
        if (eunuchs().length < 3) spawnEunuchs(1);
        // the Chief Eunuch notices bribed guards — sometimes
        const c = chief(); const RG = sys('royalGuard');
        if (c && RG) for (const g of RG.guards()) if (g.royalGuard?.bribedBy != null && Math.random() < 0.18) {
          const who = G.sims.find((s) => s.id === g.royalGuard.bribedBy);
          G.log(`The Chief Eunuch ${c.name.given} lays a purse of foreign silver before the King: ${g.name.full} of the royal guard has been bought${who ? ' by ' + who.name.full : ''}. The guardsman is executed at dawn.`, 'danger');
          g.die(null); if (who) G.economy?.commitCrime?.(who, 300, 'corrupting the royal guard');
        }
      }
      if (name === 'death' && p.sim?.eunuch && p.sim.id === st.chief) { st.chief = null; const next = eunuchs().find((e) => e.id !== p.sim.id); if (next) { st.chief = next.id; dress(next, true); G.log(`${next.name.full} is raised to Chief Eunuch (상선) of the inner palace.`, 'decree'); } }
    },
    update(dt) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t <= 0) { this._t = 0.8; attend(0.8); }
      // sanctuary ends; small warrants are forgiven by the temple's grace
      for (const s of G.household) if (s.sanctuary && day() >= s.sanctuary) { s.sanctuary = null; s.setHidden(false); s.missionLock = false; s.away = null; const [tx, tz] = LAYOUT.temple; s.pos.set(tx + 2, s.pos.y, tz + 8); if (s.outlaw && (s.bounty || 0) < 120) { s.outlaw = false; s.bounty = 0; } else if (s.outlaw) s.bounty = Math.round(s.bounty * 0.5); G.log(`${s.name.full} leaves the temple's sanctuary${s.outlaw ? ', the warrant halved by the abbot’s plea' : ', the warrant forgiven at the abbot’s plea'}.`, 'story', s.pos); G.ui?.refreshHousehold?.(); }
      if (G.env.hour >= 6 && G.env.hour < 6.3 && st.almsDay !== G.env.day && G.env.day % 2 === 1) { st.almsDay = G.env.day; almsRound(); }
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      if (o.eunuch) return eunuchMenu(me, o);
      if (o.job === 'monk' && !o.household) return monkMenu(me, o);
      if (o === me && me.job === 'monk' && me.prevJob) return [{ label: '🚶 Return your robes and go back to the world', fn: () => { me.job = me.prevJob; me.prevJob = null; me.rebuildModel(); } }];
      return [];
    },
    serialize() { return { chief: st.chief, eunuchs: eunuchs().map((e) => ({ id: e.id, loyalty: e.eunuch.loyalty })) }; },
    restore(d, get) { if (!d) return; st.chief = d.chief; st.eunuchs = []; for (const r of d.eunuchs || []) { const e = get(r.id); if (!e) continue; e.eunuch = { loyalty: r.loyalty }; e.missionLock = true; dress(e, e.id === st.chief); st.eunuchs.push(e.id); } },
  };
  return S;
}
