// Rival clan (원수 집안): another house watches your family rise with envy, and schemes.
// Slander, hired thugs, public challenges, bribed fines, stolen sweethearts — answered with gifts,
// duels, a marriage alliance, or exposing them once you have gathered enough evidence.
const SLANDER = [
  'cheats at yut and waters down their rice wine',
  'was seen bowing to a fox spirit at midnight',
  'owes money to half the valley',
  'insulted the King’s ancestors while drunk',
  'stole a bronze bell from the temple',
  'has the manners of a mountain boar',
];

export function createRivalsSystem(G) {
  const day = () => G.env.day + G.env.hour / 24;
  const S = {
    id: 'rivals',
    clan: null, head: null, enmity: 35, evidence: 0, nextScheme: 1.6, allied: false, exposedDay: -9, lostDay: null, log: [],
    members() {
      if (!this.clan) return [];
      const h = this.head;
      return G.sims.filter((s) => !s.dead && !s.hidden && s.name.surname === this.clan && !s.household && (s === h || (h && (s.home === h.home || s.spouse === h || s.parents?.includes(h) || h.parents?.includes(s)))));
    },
    choose() {
      const fam = {};
      for (const s of G.sims) {
        if (s.dead || s.household || !s.home || s.home.virtual || ['king', 'queen', 'prince', 'princess', 'bandit', 'police', 'monk'].includes(s.job) || s.faction === 'bandit') continue;
        if (G.household[0] && s.name.surname === G.household[0].name.surname) continue;
        const k = s.name.surname + '|' + s.home.id; (fam[k] ||= []).push(s);
      }
      let best = null, bs = -1;
      for (const list of Object.values(fam)) {
        const adults = list.filter((s) => s.age !== 'child'); if (adults.length < 2) continue;
        const sc = list.length * 2 + list.reduce((a, s) => a + (s.coins || 0), 0) / 60 + list.filter((s) => ['noble', 'merchant', 'official', 'scholar'].includes(s.job)).length * 3 + list.filter((s) => s.fighter).length;
        if (sc > bs) { bs = sc; best = adults; }
      }
      if (!best) return false;
      const head = best.slice().sort((a, b) => (b.has('Ambitious') + b.has('Cunning') + (b.coins || 0) / 100) - (a.has('Ambitious') + a.has('Cunning') + (a.coins || 0) / 100))[0];
      this.clan = head.name.surname; this.head = head; this.enmity = 35; this.evidence = 0; this.allied = false; this.nextScheme = day() + 0.8 + Math.random() * 0.6;
      head.coins = Math.max(head.coins || 0, 150);
      if (!head.traits.includes('Ambitious') && head.traits.length < 4) head.traits.push('Ambitious');
      for (const m of this.members()) for (const h of G.household) { m.changeRel(h, -15); }
      const hh = G.household[0]?.name.surname;
      G.log(`The ${this.clan} clan, led by ${head.name.full}, watch the ${hh} household's arrival with narrowed eyes. Two proud houses cannot share one small valley.`, 'danger', head.pos);
      return true;
    },
    status() {
      if (!this.clan) return '';
      if (this.allied) return `🤝 The <b>${this.clan}</b> clan are your allies by marriage.`;
      const mood = this.enmity > 75 ? 'burn with hatred' : this.enmity > 50 ? 'scheme openly' : this.enmity > 25 ? 'watch you with envy' : 'grudgingly respect you';
      return `🏯 The <b>${this.clan}</b> clan (head: ${this.head?.name.full || '—'}) ${mood}. Enmity ${Math.round(this.enmity)}/100 · evidence of their schemes ${this.evidence}/3.`;
    },
    witnessed(what) {
      if (Math.random() < 0.4) { this.evidence = Math.min(5, this.evidence + 1); G.ui?.toast(`👁 A servant saw it all: the ${this.clan} clan was behind ${what}. Evidence ${this.evidence}/3.`, 'story'); }
    },
    scheme() {
      const M = this.members(); const head = this.head;
      if (!M.length || !head || head.dead) return;
      const hh = G.household.filter((s) => !s.dead && !s.hidden && s.age !== 'child');
      if (!hh.length) return;
      const tgt = hh[Math.floor(Math.random() * hh.length)];
      const fighters = M.filter((m) => m.fighter && !m.combat.target);
      const bandits = G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'bandit' && !s.isChief && !s.combat.target && !s.missionLock);
      const singles = hh.filter((s) => !s.spouse && s.age !== 'elder');
      const W = {
        slander: 3,
        fine: this.enmity > 30 ? 1.5 : 0,
        thugs: this.enmity > 45 && bandits.length >= 2 && G.env.hour > 8 && G.env.hour < 20 ? 1.4 + this.enmity / 50 : 0,
        challenge: fighters.length && tgt.fighter && !G.raidActive ? 1.6 : 0,
        poach: singles.some((s) => [...s.rel.entries()].some(([, r]) => r.r > 20)) ? 1.2 : 0,
        spoil: hh.some((s) => Object.values(s.inv || {}).some((n) => n > 0)) ? 0.8 : 0,
      };
      const tot = Object.values(W).reduce((a, b) => a + b, 0); let r = Math.random() * tot; let k = 'slander';
      for (const [kk, w] of Object.entries(W)) { r -= w; if (r <= 0) { k = kk; break; } }
      const C = this.clan;
      if (k === 'slander') {
        const lie = SLANDER[Math.floor(Math.random() * SLANDER.length)];
        tgt.needs.honor = Math.max(0, tgt.needs.honor - 15);
        const ears = G.sims.filter((o) => !o.dead && !o.household && o.faction === 'village').sort(() => Math.random() - 0.5).slice(0, 10);
        for (const o of ears) o.changeRel(tgt, -6);
        tgt.addMoodlet('slandered', `Slandered by the ${C} clan`, -10, 720);
        G.log(`Whispers at the well: ${head.name.given} of the ${C} clan says ${tgt.name.given} ${lie}. Some villagers believe it.`, 'danger', head.pos);
        this.witnessed('the slander');
      } else if (k === 'fine') {
        const payer = G.household[0]; const amt = Math.min(Math.floor(payer.coins), Math.round(15 + this.enmity / 4));
        if (amt <= 0) return;
        payer.coins -= amt; head.coins += Math.round(amt / 2);
        G.log(`A magistrate's clerk — a cousin of the ${C} clan — fines the ${payer.name.surname} household ${amt} nyang for "unpaid levies".`, 'danger', payer.pos);
        if (payer.household) G.ui?.toast(`⚖ Fined ${amt} nyang on a trumped-up charge. The ${C} clan smiles.`, 'danger');
        this.witnessed('the false fine');
      } else if (k === 'thugs') {
        const two = bandits.slice(0, 2 + (this.enmity > 70 ? 1 : 0));
        const a = Math.random() * Math.PI * 2;
        for (const [i, b] of two.entries()) {
          b.cancelAction(); b.pos.set(tgt.pos.x + Math.sin(a + i * 0.5) * 14, b.pos.y, tgt.pos.z + Math.cos(a + i * 0.5) * 14);
          b.rivalThug = true; b.startFight(tgt);
          if (i === 0) b.say(`The ${C} family sends regards!`, 'shout', 3);
        }
        G.log(`Hired thugs fall upon ${tgt.name.full}! Coins from the ${C} clan jingle in their purses.`, 'danger', tgt.pos);
        G.ui?.toast(`🗡 Thugs hired by the ${C} clan attack ${tgt.name.given}!`, 'danger');
        G.audio?.drum();
      } else if (k === 'challenge') {
        const champ = fighters.sort((a, b) => b.skills.sword - a.skills.sword)[0];
        champ.cancelAction();
        champ.startAction({ type: 'goto', dest: [tgt.pos.x + 2, tgt.pos.z + 2], run: true, label: `Seeking out ${tgt.name.given}`, then: (z) => { if (!z.dead && !tgt.dead && z.pos.distanceTo(tgt.pos) < 8) { z.say(`${tgt.name.given}! The ${C} name demands satisfaction!`, 'shout', 3); G.startDuel(z, tgt); } } });
        G.log(`${champ.name.full} of the ${C} clan sets out to publicly challenge ${tgt.name.full}.`, 'duel', champ.pos);
      } else if (k === 'poach') {
        const s = singles.find((x) => [...x.rel.entries()].some(([, r]) => r.r > 20));
        const [id] = [...s.rel.entries()].sort((a, b) => b[1].r - a[1].r)[0];
        const love = G.sims.find((o) => o.id === id);
        const suitor = M.find((m) => !m.spouse && m.sex !== love?.sex && m.age !== 'child' && m.age !== 'elder');
        if (!love || love.dead || !suitor) return;
        suitor.changeRel(love, 10, 18); love.changeRel(suitor, 8, 14); love.changeRel(s, 0, -10);
        s.addMoodlet('jealous', `${suitor.name.given} is courting ${love.name.given}`, -12, 720);
        G.log(`${suitor.name.full} of the ${C} clan has begun courting ${love.name.full} — the very one ${s.name.given} adores.`, 'love', love.pos);
      } else if (k === 'spoil') {
        const s = hh.find((x) => Object.values(x.inv || {}).some((n) => n > 0)); const item = Object.keys(s.inv).find((kk) => s.inv[kk] > 0);
        s.inv[item] = Math.max(0, s.inv[item] - 2);
        G.log(`Someone crept into the ${s.name.surname} storehouse in the night and spoiled their ${item}. Muddy footprints lead toward the ${C} house.`, 'danger', s.pos);
        this.witnessed('the spoiled stores');
      }
      this.enmity = Math.max(0, this.enmity - 4); // a scheme vents a little spite
    },
    update() {
      if (!G.started) return;
      if (!this.clan) { if (this.lostDay == null || day() - this.lostDay > 2) { if (!this.choose()) this.lostDay = day(); } return; }
      if (!this.head || this.head.dead || this.head.removed) {
        const M = this.members().filter((m) => m.age !== 'child').concat(G.sims.filter((s) => !s.dead && s.name.surname === this.clan && !s.household && s.age !== 'child'));
        if (M.length) { this.head = M[0]; G.log(`${this.head.name.full} takes up the leadership of the ${this.clan} clan — and its grudges.`, 'story', this.head.pos); }
        else { G.log(`The ${this.clan} clan is no more. Their house stands empty.`, 'story'); this.clan = null; this.head = null; this.lostDay = day(); return; }
      }
      if (this.allied) return;
      if (day() >= this.nextScheme) {
        const h = G.env.hour;
        if (!(h > 7 && h < 21) || G.raidActive || G.standoffActive || !G.household.length) return; // wait for a quiet daylight hour
        this.scheme();
        this.nextScheme = day() + 0.45 + (1 - this.enmity / 100) * 1.1 + Math.random() * 0.4;
      }
    },
    onEvent(name, p) {
      if (!this.clan) return;
      const isClan = (s) => s && !s.household && s.name?.surname === this.clan;
      if (name === 'day') {
        const mine = G.household.reduce((a, s) => a + (s.coins || 0), 0), theirs = this.members().reduce((a, s) => a + (s.coins || 0), 0);
        this.enmity = Math.min(100, this.enmity + (mine > theirs ? 4 : 1));
        if (this.allied && Math.random() < 0.4 && G.household[0]) { G.household[0].earn(20); G.log(`The ${this.clan} in-laws send a basket of persimmons and 20 nyang.`, 'love'); }
      }
      if (name === 'duel') {
        if (p.winner?.household && isClan(p.loser)) { this.enmity = Math.min(100, this.enmity + 10); G.log(`The ${this.clan} clan seethes at their champion's defeat.`, 'danger'); }
        if (isClan(p.winner) && p.loser?.household) this.enmity = Math.max(0, this.enmity - 8);
      }
      if (name === 'death') {
        if (p.sim?.rivalThug && p.killer?.household) this.witnessed('the hired thugs');
        if (isClan(p.sim) && p.killer?.household) this.enmity = 100;
      }
      if (name === 'promoted' && p.sim?.household) this.enmity = Math.min(100, this.enmity + 8);
      if (name === 'mission' && p.sim?.household && p.ok) this.enmity = Math.min(100, this.enmity + 3);
      if (name === 'wedding' && [p.a, p.b].some((x) => x.household) && [p.a, p.b].some((x) => x.name?.surname === this.clan)) {
        this.allied = true; this.enmity = 0;
        G.log(`A wedding joins the ${G.household[0]?.name.surname} and ${this.clan} houses. The old feud is buried beneath red silk and rice wine.`, 'love');
        G.ui?.toast(`🤝 The ${this.clan} clan are now your allies.`, 'festival');
      }
    },
    simMenuItems(me, o) {
      if (!this.clan || !me.household || !(o.name.surname === this.clan && !o.household)) return [];
      const out = [];
      if (this.allied) return [{ label: `🤝 ${this.clan} in-law`, disabled: true }];
      out.push({ label: `🎁 Peace gift to the ${this.clan} (30 nyang)`, disabled: me.coins < 30, fn: () => { me.coins -= 30; o.coins += 30; this.enmity = Math.max(0, this.enmity - 14); o.changeRel(me, 10); o.say('…Hmph. A start.', 'talk'); G.log(`${me.name.given} sends a peace gift to the ${this.clan} house. Enmity cools.`, 'story', me.pos); } });
      const eligible = !me.spouse && !o.spouse && me.sex !== o.sex && ['young', 'adult'].includes(me.age) && ['young', 'adult'].includes(o.age);
      if (eligible) out.push({ label: `💍 Propose a marriage alliance`, fn: () => {
        const r = o.getRel(me); const yes = r.f > 15 + this.enmity / 4 || (r.r > 30 && Math.random() < 0.7);
        if (yes) { o.say('If it ends this feud… yes. I will.', 'love', 4); G.director.wedding(me, o); }
        else { o.say(this.enmity > 60 ? 'Marry into YOUR house? Never!' : 'Not yet. Win my family’s trust first.', 'angry', 4); this.enmity = Math.min(100, this.enmity + 4); }
      } });
      if (me.fighter && o.fighter && !me.combat.target) out.push({ label: `⚔ Challenge to a duel of honour`, fn: () => G.startDuel(me, o) });
      if (o === this.head) out.push({ label: `📜 Expose their schemes (${this.evidence}/3 evidence)`, disabled: this.evidence < 3 || day() - this.exposedDay < 2, fn: () => {
        this.evidence -= 3; this.exposedDay = day(); const fine = Math.min(Math.floor(o.coins), 120);
        o.coins -= fine; me.earn(fine);
        for (const v of G.sims) if (!v.dead && v.faction === 'village' && !this.members().includes(v)) v.changeRel(o, -12);
        o.needs.honor = Math.max(0, o.needs.honor - 40); o.addMoodlet('disgraced', 'Publicly disgraced', -25, 1440);
        this.enmity = Math.max(0, this.enmity - 35); this.nextScheme = day() + 2;
        G.log(`Before the magistrate, ${me.name.full} lays out proof of the ${this.clan} clan's schemes. ${o.name.full} is fined ${fine} nyang and disgraced before the whole valley.`, 'tournament', me.pos);
        G.ui?.toast(`📜 The ${this.clan} clan is exposed! +${fine} nyang`, 'festival');
      } });
      return out;
    },
    panelHtml(s) {
      if (!this.clan || !s.household) return '';
      return `<div class="facts rival">${this.status()}</div>`;
    },
    serialize() { return { clan: this.clan, head: this.head && !this.head.dead ? this.head.id : null, enmity: this.enmity, evidence: this.evidence, allied: this.allied, nextScheme: this.nextScheme, exposedDay: this.exposedDay }; },
    restore(d, get) { if (!d) return; Object.assign(this, { clan: d.clan, enmity: d.enmity ?? 35, evidence: d.evidence || 0, allied: !!d.allied, nextScheme: d.nextScheme || 1, exposedDay: d.exposedDay ?? -9 }); this.head = get(d.head) || null; },
  };
  return S;
}
