// Swords for hire, the art of escaping justice, and the road to the throne.
//  • Hire sellswords at the jumak; they follow, guard and fight for whoever leads them, for a daily wage.
//  • Found your own mercenary company, give it a banner and send it on contracts for coin and renown.
//  • Outlaws can lie low, bribe a constable, buy a disguise or flee the valley; big bounties draw hunters.
//  • Plot against the King: poison through a bribed cook, or strike him down — and with the Black Lotus
//    or a strong company at your back, seize the crown yourself.
import { SURNAMES } from './data.js';

const COMPANY_NAMES = [['Black Crane Company', '흑학대', '#1f1f28'], ['Red Tiger Band', '적호단', '#7d1f1f'], ['Blue Wave Swords', '청파검대', '#1f3f6b'], ['Iron Pine Company', '철송대', '#2f4a33'], ['White Fox Riders', '백호단', '#d8d2c4']];
const TRAITS = ['Brave', 'Greedy', 'Loyal', 'Hot-headed', 'Cunning', 'Lazy', 'Cheerful', 'Ambitious'];

export function createUnderworldSystem(G) {
  const day = () => G.env.day + G.env.hour / 24;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fame = (s, path, n) => G.systems.find((x) => x.id === 'missions')?.addFame?.(s, path, n);
  const S = {
    id: 'underworld', mercs: [], company: null, offers: [], offersDay: -1, contracts: [], hunters: [],

    // ---------------- Sellswords ----------------
    candidates() {
      if (this.offersDay === G.env.day && this.offers.length) return this.offers;
      this.offersDay = G.env.day;
      this.offers = Array.from({ length: 4 }, () => {
        const sk = 3.5 + Math.random() * 4.5; const sex = Math.random() < 0.8 ? 'm' : 'f';
        const tr = [pick(TRAITS)]; let t2 = pick(TRAITS); if (t2 !== tr[0]) tr.push(t2);
        const wage = Math.round(5 + sk * 2 + (tr.includes('Greedy') ? 4 : 0) - (tr.includes('Loyal') ? 2 : 0));
        return { sex, sk: +sk.toFixed(1), tr, wage, fee: wage * 3, sur: pick(SURNAMES) };
      });
      return this.offers;
    },
    hire(me, c) {
      const pay = G.household[0];
      if (pay.coins < c.fee) { G.ui.toast(`You need ${c.fee} nyang for the signing fee.`); return; }
      pay.coins -= c.fee;
      const j = G.world.objects.find((o) => o.kind === 'jumak') || { x: me.pos.x, z: me.pos.z };
      const m = G.spawn({ sex: c.sex, age: Math.random() < 0.6 ? 'adult' : 'young', job: 'swordsman', home: G.vhouses.barracks, surname: c.sur, traits: c.tr, armed: true, skillSword: c.sk, x: j.x + 2, z: j.z + 2, coins: 5 });
      m.merc = { wage: this.company ? Math.round(c.wage * 0.75) : c.wage, loyalty: 55 + (c.tr.includes('Loyal') ? 25 : 0), leader: me.id, mode: 'follow', since: G.env.day };
      m.missionLock = true;
      if (this.company) this.dress(m);
      for (const h of G.household) { m.changeRel(h, 20); h.changeRel(m, 15); }
      this.mercs.push(m);
      this.offers = this.offers.filter((x) => x !== c);
      m.say(pick(['My sword is yours — while the coin lasts.', 'Point me at your enemies.', 'Paid in advance? Good. I like you already.']), 'talk', 4);
      G.log(`${me.name.full} hires ${m.name.full}, a sellsword (sword ${c.sk}), for ${m.merc.wage} nyang a day${this.company ? ` into the ${this.company.name}` : ''}.`, 'story', me.pos);
      G.ui?.refreshHousehold?.();
      return m;
    },
    dress(m) {
      if (!this.company) return;
      m.uniform = { outfit: 'wanderer', colors: { robe: this.company.color, top: this.company.color, belt: '#a3262a' }, hat: 'jeonrip', weapon: true };
      m.rebuildModel();
    },
    leaderOf(m) { return G.sims.find((s) => s.id === m.merc.leader && !s.dead) || G.household.find((s) => !s.dead && !s.hidden); },
    dismiss(m, why) {
      m.merc = null; m.missionLock = false; m.cancelAction(); m.endFight?.();
      this.mercs = this.mercs.filter((x) => x !== m);
      if (this.company) this.company.members = this.company.members.filter((id) => id !== m.id);
      if (why) G.log(why, 'story', m.pos);
    },
    tickMercs(dt) {
      this.mercs = this.mercs.filter((m) => !m.dead && m.merc);
      this.mercs.forEach((m, i) => {
        if (m.hidden || m.merc.mode === 'contract') return;
        for (const k in m.needs) m.needs[k] = Math.max(m.needs[k], 45); // fed from their wages
        const L = this.leaderOf(m); if (!L) return;
        // defend the leader and the household
        if (!m.combat.target) {
          let foe = null;
          if (L.combat.target && !L.combat.target.dead && !L.combat.nonlethal && L.combat.target !== m) foe = L.combat.target;
          if (!foe) for (const o of G.sims) { if (o.dead || o.hidden || o.merc) continue; const t = o.combat.target; if (t && (t === L || t.household || this.mercs.includes(t)) && !o.combat.nonlethal && o.pos.distanceTo(L.pos) < 25) { foe = o; break; } }
          if (foe) { m.startFight(foe); if (Math.random() < 0.4) m.say(pick(['For the coin!', 'Stand behind me!', 'You picked the wrong master!']), 'shout', 2); return; }
        } else return;
        if (m.merc.mode === 'guard') { const d = L.home?.door || [0, 0]; if (Math.hypot(m.pos.x - d[0], m.pos.z - d[1]) > 6 && m.action?.type !== 'goto') { m.cancelAction(); m.startAction({ type: 'goto', dest: [d[0] + (i % 3) * 1.5 - 1.5, d[1] + 3], label: 'Guarding the house' }); } else if (!m.action) { m.action = { type: 'event', phase: 'do', anim: 'guard', dur: 60, t: 0, label: 'Guarding the house' }; } return; }
        // follow at a respectful distance, in a loose fan behind the leader
        const off = 2 + (i % 3), ang = L.heading + Math.PI + ((i % 3) - 1) * 0.6;
        const tx = L.pos.x + Math.sin(ang) * off, tz = L.pos.z + Math.cos(ang) * off;
        const d = Math.hypot(m.pos.x - tx, m.pos.z - tz);
        if (d > 70) { m.cancelAction(); m.pos.set(tx, m.pos.y, tz); }
        else if (d > 3.5) { if (m.action?.type !== 'goto' || (m._ft = (m._ft || 0) + dt) > 1) { m._ft = 0; m.cancelAction(); m.startAction({ type: 'goto', dest: [tx, tz], run: d > 9 || L.moving && L.curSpeed > 3, label: `Following ${L.name.given}` }); } }
        else if (!m.action) { m.heading = L.heading; m.action = { type: 'event', phase: 'do', anim: L.char.swordDrawn ? 'stance' : 'idle', dur: 4, t: 0, label: `Guarding ${L.name.given}` }; }
      });
    },
    payday() {
      const pay = G.household[0]; if (!pay) return;
      for (const m of this.mercs.slice()) {
        if (m.merc.mode === 'contract') continue;
        if (pay.coins >= m.merc.wage) { pay.coins -= m.merc.wage; m.coins += m.merc.wage; m.merc.loyalty = Math.min(100, m.merc.loyalty + 4); }
        else {
          m.merc.loyalty -= 30; m.say('Where is my pay?', 'angry', 4);
          G.log(`${m.name.full} goes unpaid and grumbles about it loudly at the jumak.`, 'danger', m.pos);
          if (m.merc.loyalty <= 0) {
            const turn = m.has('Greedy') || m.has('Hot-headed');
            this.dismiss(m, `${m.name.full} deserts${turn ? ' and goes to the bandits in the western woods, cursing your name' : ', unpaid and bitter'}.`);
            if (turn) { m.faction = 'bandit'; m.uniform = null; m.rebuildModel(); }
          }
        }
      }
    },

    // ---------------- Your own company ----------------
    found(me) {
      const pay = G.household[0];
      if (pay.coins < 150) { G.ui.toast('Founding a company costs 150 nyang (banner, armour, oaths at the shrine).'); return; }
      const free = COMPANY_NAMES.filter((c) => c[0] !== this.company?.name);
      const [name, ko, color] = pick(free);
      pay.coins -= 150;
      this.company = { name, ko, color, captain: me.id, rep: 0, members: this.mercs.map((m) => m.id), founded: G.env.day, done: 0 };
      for (const m of this.mercs) { m.merc.wage = Math.round(m.merc.wage * 0.75); this.dress(m); }
      me.addMoodlet('captain', `Captain of the ${name}`, 15, 2880);
      fame(me, 'blade', 10);
      G.log(`🏴 ${me.name.full} raises a banner at the jumak and founds the ${name} (${ko}). Sellswords from three valleys come asking to sign on.`, 'tournament', me.pos);
      G.ui.toast(`🏴 The ${name} is founded! Hire members at the jumak, then take contracts.`, 'festival');
    },
    contractOffers() {
      const atWar = G.systems.find((x) => x.id === 'war')?.st?.war;
      const rep = this.company?.rep || 0;
      const L = [
        { id: 'convoy', title: 'Escort a salt convoy to the coast', need: 2, days: 0.8, pay: 70 + rep, risk: 0.15 },
        { id: 'bandits', title: 'Clear the bandits from the western woods', need: 3, days: 0.6, pay: 110 + rep * 1.5, risk: 0.35, kills: true },
        { id: 'debt', title: 'Collect a gambling debt for a moneylender (shady)', need: 1, days: 0.3, pay: 45 + rep * 0.5, risk: 0.05, shady: true },
        { id: 'noble', title: 'Guard a noble’s country estate', need: 2, days: 1.2, pay: 90 + rep, risk: 0.08 },
      ];
      if (atWar) L.unshift({ id: 'war', title: 'Fight for the King against the invaders', need: 4, days: 1.5, pay: 260 + rep * 2, risk: 0.45, war: true });
      if (rep >= 40) L.push({ id: 'palace', title: 'Serve as the Crown Prince’s secret guard', need: 3, days: 1, pay: 200 + rep, risk: 0.1, court: true });
      return L;
    },
    takeContract(c, lead) {
      const free = this.mercs.filter((m) => m.merc.mode !== 'contract' && !m.dead);
      const go = free.slice(0, Math.max(c.need, Math.min(free.length, c.need + 2)));
      if (go.length < c.need) { G.ui.toast(`This contract needs ${c.need} free company members.`); return; }
      const leader = lead ? G.sims.find((s) => s.id === lead) : null;
      for (const m of go) { m.merc.mode = 'contract'; m.cancelAction(); m.setHidden(true); }
      if (leader) { leader.cancelAction(); leader.setHidden(true); leader.missionLock = true; leader.away = 'company'; G.ui?.refreshHousehold?.(); }
      this.contracts.push({ ...c, members: go.map((m) => m.id), leader: leader?.id ?? null, back: day() + c.days });
      G.log(`The ${this.company.name} marches out: "${c.title}" — ${go.length} blades${leader ? `, led by ${leader.name.given}` : ''}.`, 'story');
      G.ui.toast(`🏴 The company sets out. Back in about ${Math.round(c.days * 24)} hours.`);
    },
    resolveContract(c) {
      const ms = c.members.map((id) => G.sims.find((s) => s.id === id)).filter((s) => s && !s.dead);
      const leader = c.leader != null ? G.sims.find((s) => s.id === c.leader) : null;
      const power = ms.reduce((a, m) => a + m.skills.sword, 0) + (leader ? leader.skills.sword * 1.5 : 0);
      const lost = [];
      for (const m of ms) if (Math.random() < c.risk * (6 / Math.max(4, power / ms.length)) * 0.5) { lost.push(m); }
      const success = Math.random() < 0.55 + power / 60 - c.risk * 0.5;
      for (const m of ms) { m.setHidden(false); m.merc.mode = 'follow'; const j = G.world.objects.find((o) => o.kind === 'jumak'); if (j) m.pos.set(j.x + Math.random() * 3, m.pos.y, j.z + 3); m.skills.sword = Math.min(10, m.skills.sword + 0.2); }
      if (leader) { leader.setHidden(false); leader.missionLock = false; leader.away = null; const d = leader.home?.door || [0, 0]; leader.pos.set(d[0] + 1, leader.pos.y, d[1] + 1); G.ui?.refreshHousehold?.(); }
      for (const m of lost) { m.hp = 1; m.die(null); }
      const pay = success ? Math.round(c.pay * (lost.length ? 0.9 : 1)) : Math.round(c.pay * 0.25);
      G.household[0].earn(pay);
      this.company.rep += success ? (c.risk > 0.3 ? 12 : 6) : -4; if (c.shady && success) this.company.rep -= 2;
      this.company.done += success ? 1 : 0;
      if (c.kills && success) { for (const b of G.sims.filter((s) => !s.dead && s.faction === 'bandit' && !s.isChief).slice(0, 2 + Math.floor(Math.random() * 2))) b.die(ms[0] || null); }
      if (c.war && success) { const w = G.systems.find((x) => x.id === 'war')?.st?.war; if (w) w.wins = (w.wins || 0) + 1; }
      if (leader) { fame(leader, 'blade', success ? 6 : 1); leader.addMoodlet('contract', success ? 'Contract fulfilled' : 'A contract gone wrong', success ? 12 : -10, 900); }
      G.log(`🏴 The ${this.company.name} returns: ${success ? `contract fulfilled — ${pay} nyang` : `the job went badly; only ${pay} nyang`}${lost.length ? `. ${lost.map((m) => m.name.given).join(' and ')} did not come home.` : '.'}`, success ? 'tournament' : 'danger');
      G.ui.toast(`🏴 ${success ? 'Contract done' : 'Contract failed'}: +${pay} nyang${lost.length ? ` · ${lost.length} fallen` : ''}`, success ? 'festival' : 'danger');
    },
    openJumak(me) {
      const C = this.candidates(); const pay = G.household[0];
      const el = G.ui.modal(`<h2>Sellswords at the Jumak · 용병</h2>
        <p>Hard-eyed men and women nurse their rice wine and watch the door. ${pay.name.given}'s purse: <b>${Math.floor(pay.coins)} nyang</b>.${this.mercs.length ? ` You keep ${this.mercs.length} sword${this.mercs.length > 1 ? 's' : ''} (${this.mercs.reduce((a, m) => a + m.merc.wage, 0)} nyang a day).` : ''}</p>
        <div class="uw-list">${C.map((c, i) => `<div class="uw-row"><div><b>${esc(c.sur[0])} ${c.sex === 'f' ? '(woman)' : ''}</b> · sword ${c.sk} · ${c.tr.join(', ')}<small>${c.fee} nyang to sign, then ${this.company ? Math.round(c.wage * 0.75) : c.wage} a day</small></div><button data-hire="${i}" ${pay.coins < c.fee ? 'disabled' : ''}>Hire</button></div>`).join('') || '<p class="muted">No one else is looking for work today.</p>'}</div>
        ${this.company ? `<h3>🏴 ${esc(this.company.name)} <span class="ko">${this.company.ko}</span></h3><p>Renown ${this.company.rep} · ${this.mercs.length} members · ${this.company.done} contracts fulfilled${this.contracts.length ? ` · ${this.contracts.length} out on a job` : ''}.</p>
          <div class="uw-list">${this.contractOffers().map((c, i) => `<div class="uw-row"><div><b>${esc(c.title)}</b><small>needs ${c.need} · ~${Math.round(c.days * 24)}h · pays ~${Math.round(c.pay)} · ${c.risk > 0.3 ? '⚠ dangerous' : c.risk > 0.12 ? 'some danger' : 'low danger'}${c.shady ? ' · shady' : ''}</small></div><button data-c="${i}">Send</button><button data-cl="${i}" title="${esc(me.name.given)} leads in person: better odds, more fame">Lead it</button></div>`).join('')}</div>`
          : `<p class="uw-found">${me.skills.sword >= 5 ? `<button data-found>🏴 Found your own mercenary company (150 nyang)</button>` : `<small>Prove yourself with a sword (skill 5) to found your own company.</small>`}</p>`}`);
      el.querySelectorAll('[data-hire]').forEach((b) => (b.onclick = () => { this.hire(me, C[+b.dataset.hire]); this.openJumak(me); }));
      el.querySelector('[data-found]')?.addEventListener('click', () => { this.found(me); this.openJumak(me); });
      const offers = this.company ? this.contractOffers() : [];
      el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { this.takeContract(offers[+b.dataset.c], null); el.classList.add('hidden'); }));
      el.querySelectorAll('[data-cl]').forEach((b) => (b.onclick = () => { if (me.controlled) G.player.toggleMode('overseer'); this.takeContract(offers[+b.dataset.cl], me.id); el.classList.add('hidden'); }));
    },

    // ---------------- Escaping justice ----------------
    lieLow(me) {
      me.cancelAction(); me.setHidden(true); me.missionLock = true; me.away = 'hiding';
      me.lyingLow = { until: day() + 0.5 }; if (me.controlled) G.player.toggleMode('overseer');
      G.ui?.refreshHousehold?.();
      G.log(`${me.name.full} vanishes behind shuttered doors to let the hue and cry die down.`, 'story', me.pos);
    },
    flee(me) {
      me.cancelAction(); me.setHidden(true); me.missionLock = true; me.away = 'fled';
      me.lyingLow = { until: day() + 2, fled: true }; if (me.controlled) G.player.toggleMode('overseer');
      G.ui?.refreshHousehold?.();
      G.log(`${me.name.full} slips out of the valley by the goat paths, a price on their head.`, 'danger', me.pos);
    },
    bribe(me, cop) {
      const price = Math.round((me.bounty || 20) * 1.2 + 10);
      if (me.coins < price) { G.ui.toast(`The constable wants ${price} nyang to look the other way.`); return; }
      const honest = cop.has('Loyal') || cop.policeChief;
      if (Math.random() < (honest ? 0.25 : 0.8)) {
        me.coins -= price; cop.earn(price); me.outlaw = false; me.bounty = 0;
        cop.say('…I never saw you. Now walk.', 'talk', 4);
        G.log(`Coins pass quietly into ${cop.name.full}'s sleeve. The warrant for ${me.name.full} goes missing.`, 'story', me.pos);
      } else {
        G.economy.commitCrime(me, 30, 'attempting to bribe a constable');
        cop.say('A bribe? To ME? Seize them!', 'shout', 4); cop.startFight(me, true); cop.arresting = me;
      }
    },
    disguise(me) {
      if (me.coins < 25) { G.ui.toast('A disguise costs 25 nyang.'); return; }
      me.coins -= 25; me.disguised = { until: day() + 1, prevUniform: me.uniform || null };
      me.uniform = { outfit: 'commoner', colors: { top: '#a89a80', bottom: '#8a7e6a', robe: '#8a7e6a' }, hat: 'satgat', beard: me.sex === 'm' };
      me.rebuildModel(); me.char.setProp(null);
      G.ui.toast('🎭 Straw hat low, plain hemp clothes. The constables won’t know you for a day — unless you start trouble.', 'story');
    },
    tickOutlaws() {
      const now = day();
      for (const s of G.household) {
        if (s.lyingLow) for (const k in s.needs) s.needs[k] = Math.max(s.needs[k], 40);
        if (s.lyingLow && now >= s.lyingLow.until) {
          const fled = s.lyingLow.fled; s.lyingLow = null; s.setHidden(false); s.missionLock = false; s.away = null;
          if (s.outlaw) { s.bounty = Math.round((s.bounty || 0) * (fled ? 0.3 : 0.55)); if (s.bounty < 20) { s.outlaw = false; s.bounty = 0; } }
          if (fled) { s.needs.honor = Math.max(0, s.needs.honor - 10); const d = s.home?.door || [0, 0]; s.pos.set(d[0] + 1, s.pos.y, d[1] + 1); }
          G.log(`${s.name.full} ${fled ? 'returns to the valley' : 'comes out of hiding'}. ${s.outlaw ? `The bounty has cooled to ${s.bounty} nyang.` : 'The guards seem to have forgotten all about it.'}`, 'story', s.pos);
          G.ui?.refreshHousehold?.();
        }
        // a disguise hides the warrant from the constables until it expires or blood is spilt
        if (s.disguised) {
          if (s.outlaw) { s.disguised.bounty = (s.disguised.bounty || 0) + (s.bounty || 0); s.outlaw = false; s.bounty = 0; }
          if (now >= s.disguised.until || s.combat.target && !s.combat.nonlethal) {
            const b = s.disguised.bounty || 0; s.uniform = s.disguised.prevUniform; s.disguised = null; s.rebuildModel();
            if (b) { s.outlaw = true; s.bounty = b; }
            G.ui?.toast?.(`🎭 ${s.name.given}'s disguise is gone.`);
          }
        }
        // big bounties attract hunters
        if (s.outlaw && (s.bounty || 0) >= 150 && !s.hidden && !s.jailed && !this.hunters.some((h) => h.target === s && !h.s.dead) && Math.random() < 0.002) this.sendHunters(s);
      }
      this.hunters = this.hunters.filter((h) => { if (h.s.dead) return false; if (h.target.dead || !h.target.outlaw || day() - h.t > 1) { h.s.say('Another day, then.', 'talk'); h.s.dispose?.(); h.s.removed = true; h.s.dead = true; return false; } if (!h.s.combat.target && !h.target.hidden) h.s.startFight(h.target); return true; });
    },
    sendHunters(s) {
      const n = s.bounty > 400 ? 3 : 2; const a = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const h = G.spawn({ sex: 'm', age: 'adult', job: 'swordsman', surname: pick(SURNAMES), traits: ['Brave', 'Greedy'], armed: true, skillSword: 6 + Math.random() * 2.5, x: s.pos.x + Math.sin(a + i) * 25, z: s.pos.z + Math.cos(a + i) * 25 });
        h.faction = 'hunter'; h.uniform = { outfit: 'bandit', colors: { top: '#2a2a2a', bottom: '#1a1a1a' }, hat: 'satgat' }; h.rebuildModel(); h.missionLock = true;
        h.startFight(s); this.hunters.push({ s: h, target: s, t: day() });
        if (i === 0) h.say(`${s.name.given}! ${s.bounty} nyang says you come with us — breathing or not.`, 'shout', 4);
      }
      G.log(`Bounty hunters have come for ${s.name.full} — ${s.bounty} nyang on their head draws hard men from every province.`, 'danger', s.pos);
      G.ui.toast(`🗡 Bounty hunters are after ${s.name.given}!`, 'danger');
    },

    // ---------------- The throne ----------------
    canUsurp(k) {
      if (!k) return null;
      const hh = k.household ? k : k.merc ? this.leaderOf(k) : null; if (!hh || !hh.household) return null;
      const strong = this.company && this.mercs.filter((m) => !m.dead).length >= 5;
      if (strong) return { heir: hh, how: `seized the throne at the head of the ${this.company.name}, ${this.mercs.length} blades at their back` };
      if ((hh.factions?.court?.rank || 0) >= 5) return { heir: hh, how: 'seized the throne with half the ministers sworn to them in secret' };
      return null;
    },
    plot(me, king) {
      const strong = this.company && this.mercs.length >= 5, lotus = !!me.factions?.lotus, court = (me.factions?.court?.rank || 0) >= 5;
      const consort = G.sims.find((s) => ['prince', 'princess'].includes(s.job) && s.spouse && s.spouse.household && !s.dead);
      const el = G.ui.modal(`<h2>Treason · 역모</h2>
        <p>King ${esc(king.name.given)} sits the throne. There are several roads to it, each darker than the last.</p>
        <ul class="uw-roads">
          <li><b>Marriage:</b> wed the Prince or Princess (court them and propose like anyone else). If the King dies with no Crown Prince, the Princess's husband takes the crown. ${consort ? `✔ ${esc(consort.spouse.name.given)} is married into the royal house.` : ''}</li>
          <li><b>The Black Lotus:</b> join the secret society, then strike the King down; the Lotus will crown their own. ${lotus ? '✔ You are a Lotus brother.' : '✗ Not a member.'}</li>
          <li><b>The sword:</b> with your own mercenary company of 5 or more, killing the King lets you seize the throne. ${strong ? `✔ The ${esc(this.company.name)} stands ready.` : `✗ ${this.company ? this.mercs.length + '/5 blades' : 'No company yet'}.`}</li>
          <li><b>The court:</b> rise to the 5th court rank and the ministers will follow you after the deed. ${court ? '✔' : '✗'}</li>
          <li><b>Poison:</b> bribe a palace cook (500 nyang). If it works, the King dies quietly and the rightful heir takes the throne. If you are caught, every guard in the land hunts you.</li>
        </ul>
        <p class="uw-warn">Kill the King with none of these behind you and the realm will call it murder: a 1000-nyang bounty, and the Crown Prince reigns.</p>
        <button data-poison ${G.household[0].coins < 500 ? 'disabled' : ''}>☠ Bribe the cook (500 nyang)</button>`);
      el.querySelector('[data-poison]').onclick = () => {
        G.household[0].coins -= 500; el.classList.add('hidden');
        const caught = Math.random() < 0.4;
        setTimeout(() => {
          if (king.dead) return;
          if (Math.random() < 0.65) { king.naturalDeath = false; king.hp = 0; king.die(null); G.log('The King collapsed at his evening meal. The physicians speak of a sudden fever; no one dares speak of anything else.', 'omen'); }
          else G.log('The King fell ill after his supper but rallied by morning. The palace cook has not been seen since.', 'omen');
          if (caught) { G.economy.commitCrime(me, 600, 'plotting to poison the King'); G.ui.toast('☠ The cook talked! The realm hunts you.', 'danger'); for (const s of G.sims) if (!s.dead && ['soldier', 'police'].includes(s.job) && s.pos.distanceTo(me.pos) < 60 && Math.random() < 0.5) s.startFight(me, s.job === 'police'); }
        }, 8000);
      };
    },

    // ---------------- Hooks ----------------
    init() {
      // usurpation: patch succession so the realm follows the sword or the court
      const orig = G.succession.bind(G);
      G.succession = (oldKing, killer) => {
        const u = this.canUsurp(killer);
        if (u) { G.crown(u.heir, u.how); setTimeout(() => { for (const x of [killer, u.heir]) if (x) { x.outlaw = false; x.bounty = 0; } }, 50); return; }
        if (killer && (killer.household || killer.merc) && !killer.factions?.lotus) {
          const k = killer.household ? killer : this.leaderOf(killer) || killer;
          G.economy.commitCrime(k, 1000, 'the murder of the King');
          G.log(`REGICIDE! ${k.name.full} is named the King's murderer. Every soldier in Haeryeong is sworn to bring them in.`, 'danger', k.pos);
          for (const s of G.sims) if (!s.dead && ['soldier', 'general', 'police'].includes(s.job) && Math.random() < 0.6) { s.cancelAction(); s.startFight(k, s.job === 'police'); }
        }
        return orig(oldKing, killer);
      };
    },
    update(dt) {
      if (!G.started) return;
      this.tickMercs(dt);
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 1;
      this.tickOutlaws();
      for (const c of this.contracts.slice()) if (day() >= c.back) { this.contracts.splice(this.contracts.indexOf(c), 1); this.resolveContract(c); }
    },
    onEvent(name, p) {
      if (name === 'day') this.payday();
      if (name === 'death' && p.sim?.merc) { const L = this.leaderOf(p.sim); if (L) L.addMoodlet('lostMerc', `${p.sim.name.given} fell in my service`, -6, 720); this.dismiss(p.sim); }
      if (name === 'death' && p.killer?.merc && p.sim?.faction === 'bandit') { p.killer.merc.loyalty = Math.min(100, p.killer.merc.loyalty + 5); if (this.company) this.company.rep += 1; }
    },
    objMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      if (o.kind === 'jumak') out.push({ label: `⚔ Hire sellswords${this.company ? ' / company contracts' : ''}`, fn: () => this.openJumak(me) });
      if ((o.kind === 'shop' || o.kind === 'stallWork') && me.outlaw && !me.disguised) out.push({ label: '🎭 Buy a disguise (25 nyang)', fn: () => this.disguise(me) });
      return out;
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      if (o.merc && this.mercs.includes(o)) {
        out.push({ label: o.merc.mode === 'follow' && o.merc.leader === me.id ? '✔ Following you' : '🚶 Follow me', fn: () => { o.merc.leader = me.id; o.merc.mode = 'follow'; o.cancelAction(); o.say('Right behind you.', 'talk'); } });
        out.push({ label: '🏠 Guard the house', fn: () => { o.merc.mode = 'guard'; o.cancelAction(); o.say('No one gets past me.', 'talk'); } });
        out.push({ label: `💰 Pay a bonus (20) · loyalty ${Math.round(o.merc.loyalty)}`, disabled: me.coins < 20, fn: () => { me.coins -= 20; o.coins += 20; o.merc.loyalty = Math.min(100, o.merc.loyalty + 15); o.say('Generous! I won’t forget it.', 'happy'); } });
        out.push({ label: '✋ Dismiss', danger: true, fn: () => this.dismiss(o, `${o.name.full} is paid off and leaves your service.`) });
      }
      if (me === o && me.outlaw && !me.hidden) {
        out.push({ label: `🫥 Lie low at home for half a day (bounty ${me.bounty || 0})`, fn: () => this.lieLow(me) });
        out.push({ label: '🏞 Flee the valley for two days', danger: true, fn: () => this.flee(me) });
      }
      if (o.job === 'police' && me.outlaw) out.push({ label: `💰 Bribe the constable (~${Math.round((me.bounty || 20) * 1.2 + 10)} nyang)`, fn: () => this.bribe(me, o) });
      if (o.job === 'king' && !o.dead && me.job !== 'king') out.push({ label: '🗡 Consider treason…', danger: true, fn: () => this.plot(me, o) });
      return out;
    },
    panelHtml(s) {
      if (!s.household) return '';
      const mine = this.mercs.filter((m) => m.merc.leader === s.id);
      const bits = [];
      if (this.company && this.company.captain === s.id) bits.push(`🏴 Captain of the ${esc(this.company.name)} · renown ${this.company.rep}`);
      if (mine.length) bits.push(`⚔ Retinue: ${mine.map((m) => `${esc(m.name.given)} (${Math.round(m.merc.loyalty)})`).join(', ')}`);
      if (s.disguised) bits.push('🎭 In disguise');
      if (s.lyingLow) bits.push(s.lyingLow.fled ? '🏞 Fled the valley' : '🫥 Lying low');
      return bits.length ? `<div class="facts">${bits.join('<br>')}</div>` : '';
    },
    status() {
      const out = [];
      if (this.company) out.push(`🏴 The <b>${esc(this.company.name)}</b>: ${this.mercs.length} blades, renown ${this.company.rep}${this.contracts.length ? `, ${this.contracts.length} contract${this.contracts.length > 1 ? 's' : ''} under way` : ''}.`);
      else if (this.mercs.length) out.push(`⚔ ${this.mercs.length} sellsword${this.mercs.length > 1 ? 's' : ''} in your pay (${this.mercs.reduce((a, m) => a + m.merc.wage, 0)} nyang a day).`);
      return out;
    },
    serialize() {
      return { company: this.company, mercs: this.mercs.filter((m) => !m.dead).map((m) => ({ id: m.id, ...m.merc })), contracts: this.contracts };
    },
    restore(d, get) {
      for (const s of G.sims) if (s.faction === 'hunter') { s.dispose?.(); s.removed = true; s.dead = true; } // bounty hunters don't outlive a reload
      if (!d) return;
      this.company = d.company || null; this.contracts = d.contracts || [];
      for (const r of d.mercs || []) { const m = get(r.id); if (!m) continue; const { id, ...rest } = r; m.merc = rest; m.missionLock = true; this.mercs.push(m); if (rest.mode === 'contract') m.setHidden(true); if (this.company) this.dress(m); }
    },
  };
  return S;
}
