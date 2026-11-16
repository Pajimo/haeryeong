// Politics (정치): the long climb from palace retainer to Chief State Councillor (영의정, prime minister).
//  • Family standing decides where you start: a rich, honoured house enters as a Secretary; a poor one
//    sweeps the courtyard as a Retainer, and every step after that is harder.
//  • Court meetings (조회) every other morning: take a stance on real issues of the day and win or lose
//    the King's favour and the backing of the two court cliques.
//  • Promotions above Magistrate need the King's favour and a clique behind you; the top seat must be
//    won from whoever holds it — by outliving, out-arguing or impeaching them.
//  • Rank brings a salary and powers: pardons, audits, and finally a voice in war and taxes.
import { FACTIONS } from './data.js';
const CLIQUES = { east: { name: 'Easterners', ko: '동인', creed: 'reform, lighter taxes, scholars before soldiers' }, west: { name: 'Westerners', ko: '서인', creed: 'order, a strong army, the old noble houses' } };
const RANK_NEEDS = [0, 0, 0, 0, 0, { favour: 25, backing: 30 }, { favour: 45, backing: 50 }, { favour: 65, backing: 65 }];

export function createPoliticsSystem(G) {
  const day = () => G.env.day + G.env.hour / 24;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const F = () => G.factions;
  const S = {
    id: 'politics', st: { east: 50, west: 50, side: null, backing: { east: 10, west: 10 }, favour: {}, lastMeet: -9, meetings: 0, taxes: 0, lastAgenda: [] },

    // ---------------- Family standing ----------------
    standing() {
      const hh = G.household.filter((s) => !s.dead);
      const E = G.economy; const worth = hh.reduce((a, s) => a + (E?.netWorth?.(s) || s.coins || 0), 0);
      const honor = hh.reduce((a, s) => a + s.needs.honor, 0) / Math.max(1, hh.length);
      const court = Math.max(0, ...hh.map((s) => s.factions?.court?.rank || 0));
      const royal = hh.some((s) => s.royalConsort || ['king', 'queen', 'prince', 'princess'].includes(s.job) || ['prince', 'princess'].includes(s.spouse?.job));
      const noble = hh.some((s) => ['noble', 'official', 'scholar'].includes(s.job) || s.finery);
      const fame = G.systems.find((x) => x.id === 'missions')?.fame || {};
      const famous = hh.reduce((a, s) => a + Object.values(fame[s.id] || {}).reduce((x, y) => x + y, 0), 0);
      let score = Math.min(40, worth / 40) + honor * 0.2 + court * 6 + (royal ? 30 : 0) + (noble ? 10 : 0) + Math.min(15, famous / 20);
      const tier = score >= 70 ? ['Great House', '명문가', 3] : score >= 45 ? ['Yangban House', '양반', 2] : score >= 25 ? ['Respectable Commoners', '중인', 1] : ['Poor Commoners', '상민', 0];
      return { score: Math.round(score), tier, worth: Math.round(worth) };
    },
    entryRank() { return [0, 1, 3, 4][this.standing().tier[2]]; },
    favour(s) { const k = G.king; return k && !k.dead ? Math.round(clamp(k.getRel(s).f, -100, 100)) : 0; },
    backing(side) { return Math.round(this.st.backing[side] || 0); },

    // ---------------- Court meetings ----------------
    agenda() {
      const A = [];
      const w = G.systems.find((x) => x.id === 'war')?.st; const atWar = w?.war;
      const bandits = G.sims.filter((s) => !s.dead && s.faction === 'bandit').length;
      const rival = G.systems.find((x) => x.id === 'rivals');
      A.push(atWar
        ? { q: `The army needs silver to fight ${atWar.realm[0].toUpperCase() + atWar.realm.slice(1)}. Raise a war levy on every household?`, east: 'oppose', west: 'support', king: 'support', effect: { support: () => { this.tax(1); }, oppose: () => { this.tax(-0); } } }
        : { q: 'The granaries are full. Should the crown lower the grain tax this season?', east: 'support', west: 'oppose', king: Math.random() < 0.5 ? 'support' : 'oppose', effect: { support: () => this.tax(-1), oppose: () => {} } });
      if (bandits >= 4) A.push({ q: `Bandits (${bandits} known) plague the western road. Send soldiers to burn their camp, or offer them amnesty to settle the land?`, labels: ['Burn the camp', 'Offer amnesty'], east: 'oppose', west: 'support', king: 'support', effect: { support: () => G.director?.custom?.royalHunt ? null : G.log('The court orders soldiers against the bandits of the western woods.', 'decree'), oppose: () => { for (const b of G.sims.filter((s) => !s.dead && s.faction === 'bandit' && !s.isChief).slice(0, 2)) { b.faction = 'village'; b.job = 'farmer'; b.rebuildModel?.(); } G.log('Two bandits accept the royal amnesty and take up the plough.', 'decree'); } } });
      A.push(Math.random() < 0.5
        ? { q: 'Scholars petition to open a new Confucian academy (서원) at the crown’s expense.', east: 'support', west: 'oppose', king: Math.random() < 0.6 ? 'support' : 'oppose', effect: { support: () => { for (const s of G.sims) if (s.job === 'scholar') s.addMoodlet('academy', 'A new academy!', 8, 1440); }, oppose: () => {} } }
        : { q: 'Generals ask for new watchtowers along the northern passes.', east: 'oppose', west: 'support', king: Math.random() < 0.6 ? 'support' : 'oppose', effect: { support: () => { const r = w?.realms; if (r) for (const k in r) r[k].tension = Math.max(0, r[k].tension - 6); }, oppose: () => {} } });
      if (rival?.clan && !rival.allied && rival.enmity > 40) A.push({ q: `A censor accuses the ${rival.clan} clan of hoarding rice during the famine. Investigate them?`, east: 'support', west: 'oppose', king: 'abstain', effect: { support: () => { rival.evidence = Math.min(5, rival.evidence + 1); rival.enmity = Math.min(100, rival.enmity + 10); G.log(`The court orders an inquiry into the ${rival.clan} clan's granaries.`, 'decree'); }, oppose: () => {} } });
      const pm = this.primeMinister();
      if (pm && !pm.household && Math.random() < 0.35) A.push({ q: `Whispers of corruption surround Chief State Councillor ${pm.name.full}. Shall the court demand an inquiry?`, east: pm.id % 2 === 0 ? 'oppose' : 'support', west: pm.id % 2 === 1 ? 'oppose' : 'support', king: 'abstain', impeach: pm, effect: { support: () => this.inquiry(pm), oppose: () => { const h = G.household[0]; if (h && !h.dead) pm.changeRel(h, 6); } } });
      return A.sort(() => Math.random() - 0.5).slice(0, 3);
    },
    tax(d) { this.st.taxes = clamp(this.st.taxes + d, -2, 3); const P = G.economy?.prices; if (P) for (const k of ['rice', 'salt']) P[k] = Math.max(1, Math.round(P[k] * (1 + d * 0.08))); for (const s of G.sims) if (!s.dead && s.faction === 'village' && !['king', 'official', 'noble'].includes(s.job)) s.addMoodlet(d > 0 ? 'taxUp' : 'taxDown', d > 0 ? 'New war levy' : 'Lighter taxes', d > 0 ? -6 : 6, 1440); },
    primeMinister() { return G.sims.filter((s) => !s.dead && s.factions?.court && s.age !== 'child' && !['king', 'queen', 'prince', 'princess', 'general', 'soldier'].includes(s.job)).sort((a, b) => b.factions.court.rank - a.factions.court.rank)[0] || null; },
    inquiry(pm) {
      if (Math.random() < 0.55) {
        pm.factions.court.rank = Math.max(3, pm.factions.court.rank - 3); pm.needs.honor = Math.max(0, pm.needs.honor - 40);
        G.log(`The inquiry finds ledgers that do not balance. ${pm.name.full} is stripped of the Chief State Councillor's seal and sent into exile in the provinces.`, 'decree');
        pm.addMoodlet('exiled', 'Disgraced at court', -30, 2880);
        G.ui.toast('⚖ The Chief State Councillor has fallen! The highest seat stands empty.', 'festival');
      } else G.log(`The inquiry into ${pm.name.full} finds nothing — and ${pm.name.given} will remember who demanded it.`, 'danger');
    },
    attend(me) {
      const items = this.agenda(); this.st.lastAgenda = items;
      const rank = me.factions?.court?.rank || 0;
      const voice = rank >= 4 ? 'You may speak.' : rank >= 2 ? 'You may speak briefly from the back rows.' : 'You stand at the very back; only a bold word will be heard.';
      const answers = [];
      const render = (i) => {
        if (i >= items.length) return this.closeMeeting(me, answers);
        const it = items[i]; const [yes, no] = it.labels || ['Support', 'Oppose'];
        const el = G.ui.modal(`<h2>Court in Session · 조회 <small>(${i + 1}/${items.length})</small></h2>
          <p class="po-sub">${esc(me.name.given)} — ${esc(F().rankTitle(me, 'court'))}. ${voice}</p>
          <div class="po-q">${esc(it.q)}</div>
          <p class="po-hint">The King ${it.king === 'support' ? 'leans toward yes' : it.king === 'oppose' ? 'frowns at the idea' : 'keeps his counsel'}. Easterners: <b>${it.east}</b> · Westerners: <b>${it.west}</b>.</p>
          <div class="po-ch"><button data-a="support">${esc(yes)}</button><button data-a="oppose">${esc(no)}</button><button data-a="silent">Stay silent</button>${me.skills.scholarship >= 5 || me.skills.charisma >= 5 ? '<button data-a="compromise">Propose a compromise (scholarship/charisma)</button>' : ''}</div>`);
        el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { answers.push(this.vote(me, it, b.dataset.a)); render(i + 1); }));
      };
      render(0);
    },
    vote(me, it, a) {
      const k = G.king; const rank = me.factions?.court?.rank || 0; const weight = 0.5 + rank * 0.12;
      let favour = 0, east = 0, west = 0, rep = 6, line;
      if (a === 'silent') { rep = 2; line = 'kept silent'; favour = -1; }
      else if (a === 'compromise') {
        const sk = Math.max(me.skills.scholarship || 0, me.skills.charisma || 0);
        if (Math.random() < 0.3 + sk * 0.06) { favour = 6; east = 4; west = 4; rep = 18; line = 'brokered a compromise the whole hall accepted'; me.skills.scholarship = Math.min(10, (me.skills.scholarship || 0) + 0.2); it.effect.support?.(); }
        else { favour = -2; east = -2; west = -2; rep = 4; line = 'proposed a compromise that pleased no one'; }
      } else {
        favour = it.king === a ? 5 : it.king === 'abstain' ? 0 : -6;
        east = it.east === a ? 6 : -4; west = it.west === a ? 6 : -4; rep = 10; line = a === 'support' ? 'spoke in favour' : 'spoke against';
        // the chamber decides, swayed a little by your voice
        const yes = (it.king === 'support' ? 2 : it.king === 'oppose' ? -2 : 0) + (this.st.east - 50) / 25 * (it.east === 'support' ? 1 : -1) + (this.st.west - 50) / 25 * (it.west === 'support' ? 1 : -1) + (a === 'support' ? weight : -weight) + (Math.random() - 0.5) * 2;
        (yes > 0 ? it.effect.support : it.effect.oppose)?.();
        if (it.impeach && a === 'support') me.changeRel?.(it.impeach, -15);
      }
      if (k && !k.dead) { k.changeRel(me, favour * weight); }
      this.st.backing.east = clamp(this.st.backing.east + east * weight, 0, 100); this.st.backing.west = clamp(this.st.backing.west + west * weight, 0, 100);
      this.st.east = clamp(this.st.east + (east > 0 ? 1 : 0) - (west > 0 ? 1 : 0), 20, 80); this.st.west = 100 - this.st.east;
      if (me.factions.court) me.factions.court.rep += rep * (1 + this.standing().tier[2] * 0.2);
      return { q: it.q, line };
    },
    closeMeeting(me, answers) {
      this.st.meetings++; me.needs.honor = Math.min(100, me.needs.honor + 5); me.addMoodlet('court', 'Spoke at court', 6, 600);
      G.log(`At the morning court, ${me.name.full} ${answers.map((a) => a.line).join('; ')}.`, 'decree', me.pos);
      this.tryPromote(me);
      const el = G.ui.modal(`<h2>The Court Adjourns</h2><p>Royal favour: <b>${this.favour(me)}</b> · Easterner backing <b>${this.backing('east')}</b> · Westerner backing <b>${this.backing('west')}</b></p><p>${esc(this.nextStepHint(me))}</p>`);
      void el;
    },
    nextStepHint(me) {
      const m = me.factions?.court; if (!m) return '';
      const r = m.rank, nd = RANK_NEEDS[r + 1]; const need = (r + 1) * 60;
      if (r >= 7) return 'You hold the highest seat in the land beneath the throne.';
      const parts = [`Reputation ${Math.round(m.rep)}/${need}`];
      if (nd) parts.push(`royal favour ${this.favour(me)}/${nd.favour}`, `backing of one clique ${Math.max(this.backing('east'), this.backing('west'))}/${nd.backing}`);
      if (r + 1 === 7) { const pm = this.primeMinister(); if (pm && pm !== me && pm.factions.court.rank >= 7) parts.push(`and the seat must be vacant (held by ${pm.name.full})`); }
      return `Next: ${FACTIONS.court.ranks[r + 1]} — ${parts.join(', ')}.`;
    },
    tryPromote(me) {
      const m = me.factions?.court; if (!m) return;
      const r = m.rank; if (r >= 7) return;
      if (m.rep < (r + 1) * 60) return;
      const nd = RANK_NEEDS[r + 1];
      if (nd && (this.favour(me) < nd.favour || Math.max(this.backing('east'), this.backing('west')) < nd.backing)) return;
      if (r + 1 === 7) { const pm = G.sims.find((s) => !s.dead && s !== me && s.factions?.court?.rank >= 7); if (pm) return; }
      this._allow = true; F().promote(me, 'court'); this._allow = false;
      if (m.rank === 7) { G.log(`🏛 ${me.name.full} is named Chief State Councillor (영의정) — first among all ministers of Haeryeong!`, 'tournament', me.pos); G.ui.toast('🏛 You are the Prime Minister of Haeryeong!', 'festival'); me.addMoodlet('pm', 'Chief State Councillor', 40, 4320); }
    },

    // ---------------- Hooks ----------------
    init() {
      const Fa = F(); const origJoin = Fa.join.bind(Fa);
      Fa.join = (s, fid, silent = false) => {
        const was = !!s.factions[fid]; const ok = origJoin(s, fid, silent);
        if (ok && !was && fid === 'court' && s.household && !silent) {
          const er = this.entryRank(); const st = this.standing();
          if (er > 0) { s.factions.court.rank = er; s.factions.court.rep = er * 60; if (er >= 2 && s.job !== 'official' && !['king', 'queen', 'prince', 'princess', 'soldier', 'general'].includes(s.job)) { s.job = 'official'; s.rebuildModel(); } }
          G.log(`As a son or daughter of a ${st.tier[0].toLowerCase()} (${st.tier[1]}), ${s.name.full} enters the court as ${Fa.rankTitle(s, 'court')}.`, 'decree', s.pos);
          if (er === 0) G.ui.toast('A poor house starts at the very bottom: sweep the courtyards, win the exams, and earn every step.', 'story');
        }
        return ok;
      };
      // reputation from court duties comes faster to well-connected families
      const origComplete = Fa.complete.bind(Fa);
      Fa.complete = (s, fid, t) => { if (fid === 'court' && s.household && s.factions.court) s.factions.court.rep += 30 * this.standing().tier[2] * 0.25; return origComplete(s, fid, t); };
      // the high seats are not won by errands alone
      const origPromote = Fa.promote.bind(Fa);
      Fa.promote = (s, fid) => {
        if (fid === 'court' && s.household && !this._allow) {
          const r = s.factions.court.rank, nd = RANK_NEEDS[r + 1];
          const blocked = (nd && (this.favour(s) < nd.favour || Math.max(this.backing('east'), this.backing('west')) < nd.backing)) || (r + 1 === 7 && G.sims.some((o) => !o.dead && o !== s && o.factions?.court?.rank >= 7));
          if (blocked) { if (!s._promoHint || G.env.day !== s._promoHint) { s._promoHint = G.env.day; G.ui?.toast(`🏛 ${s.name.given} has earned the reputation, but not yet the standing. ${this.nextStepHint(s)}`, 'story'); } return; }
        }
        return origPromote(s, fid);
      };
    },
    update() {
      if (!G.started) return;
      const h = G.env.hour, d = G.env.day;
      // court sits every other morning
      if (d % 2 === 0 && h >= 9 && h < 9.2 && this.st.lastMeet !== d) {
        this.st.lastMeet = d;
        const members = G.household.filter((s) => !s.dead && !s.hidden && s.factions?.court);
        G.log('The great drum sounds at the palace gate: the King holds morning court (조회).', 'decree', { x: -30, z: -185 });
        if (members.length) {
          G.ui.toast(`🏛 Morning court is in session! ${members.map((s) => s.name.given).join(', ')} may attend — click the King and take your place (for about 3 hours).`, 'decree');
          this.openUntil = day() + 0.12; // about 3 hours
        }
        // ministers gather in the throne hall
        const officials = G.sims.filter((s) => !s.dead && !s.household && s.factions?.court && s.factions.court.rank >= 2 && !s.combat.target && !s.missionLock).slice(0, 10);
        officials.forEach((o, i) => { o.cancelAction(); o.startAction({ type: 'event', dest: [-30 + (i % 2 ? 3 : -3), -185 + 6 + Math.floor(i / 2) * 1.6], anim: 'bow', dur: 90, look: [-30, -185], label: 'Attending morning court' }); });
      }
    },
    onEvent(name) {
      if (name !== 'day') return;
      // salaries and absences
      for (const s of G.household) {
        const m = s.factions?.court; if (!m || s.dead) continue;
        const pay = [2, 4, 6, 10, 16, 24, 36, 60][m.rank] || 0; s.earn(pay);
        if (G.env.day % 2 === 1 && this.st.lastMeet === G.env.day - 1 && !this.attended?.[s.id + ':' + this.st.lastMeet] && m.rank >= 2) { m.rep = Math.max(0, m.rep - 10); }
      }
      // a slow drift of power between the cliques; the losing side may be purged
      this.st.east = clamp(this.st.east + (Math.random() - 0.5) * 8, 20, 80); this.st.west = 100 - this.st.east;
      if (this.st.side && Math.random() < 0.08) {
        const mine = this.st.side, strong = this.st[mine] > 55;
        if (!strong) for (const s of G.household) if (s.factions?.court?.rank >= 3) { s.factions.court.rank--; G.log(`A purge (사화) sweeps the court! The ${CLIQUES[mine].name} fall from favour, and ${s.name.full} is demoted.`, 'danger'); G.ui.toast('⚠ Purge at court — you were demoted.', 'danger'); }
      }
      for (const s of G.household) if (s.factions?.court) this.tryPromote(s);
      this.sitInCouncil();
    },

    // The realm governs itself. The agenda, the clique weights and the effects all existed, but they
    // were only ever resolved inside the player's court-session modal — so a player who never attended
    // court left the kingdom in permanent suspension: the granaries were never taxed, no academy was
    // ever built, no corrupt Chief State Councillor was ever investigated. The chamber now sits on its
    // own, and the player's voice sways a session they attend rather than being the only voice in it.
    sitInCouncil() {
      const k = G.king; if (!k || k.dead) return;
      if (this.st.lastCouncil === day()) return;
      if (Math.random() < 0.45) return;                      // the court does not sit every single day
      this.st.lastCouncil = day();
      const items = this.agenda(); if (!items.length) return;
      // the ministers who are actually in a position to speak
      const bench = G.sims.filter((s) => !s.dead && !s.hidden && s.factions?.court && (s.factions.court.rank || 0) >= 2
        && !['king', 'queen', 'prince', 'princess'].includes(s.job));
      const spoke = [];
      for (const it of items) {
        if (!it.effect) continue;
        // each minister's stance: his clique, his temper, and whether he reads the King's mood
        let yes = (it.king === 'support' ? 2 : it.king === 'oppose' ? -2 : 0);
        for (const m of bench) {
          const side = m.factions.court.side || (m.id % 2 ? 'east' : 'west');
          const lean = it[side] === 'support' ? 1 : it[side] === 'oppose' ? -1 : 0;
          const courtly = m.has?.('Loyal') || m.has?.('Pious') ? 0.6 : 0;   // defer to the throne
          const wilful = m.has?.('Hot-headed') || m.has?.('Ambitious') ? 0.5 : 0;
          const kingPull = (it.king === 'support' ? 1 : it.king === 'oppose' ? -1 : 0) * courtly;
          const v = lean * (1 + wilful) + kingPull;
          yes += v * (0.5 + (m.factions.court.rank || 0) * 0.12);
          if (spoke.length < 2 && Math.abs(v) > 0.9 && Math.random() < 0.4) {
            spoke.push(`${m.name.full} spoke ${v > 0 ? 'for' : 'against'} it`);
          }
        }
        const passed = yes > 0;
        try { (passed ? it.effect.support : it.effect.oppose)?.(); } catch (e) { console.error('[politics] effect', e); }
        G.log(`조정: "${it.q}" — the court ${passed ? 'assents' : 'refuses'}${spoke.length ? `. ${spoke.join('; ')}` : ''}.`, 'decree', G.world?.spots?.courtyard);
        spoke.length = 0;
      }
      this.st.meetings++;
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      const open = this.openUntil && day() < this.openUntil;
      if (o.job === 'king' && me.factions?.court && open && !this.attended?.[me.id + ':' + this.st.lastMeet]) out.push({ label: '🏛 Take your place at morning court', fn: () => { (this.attended ||= {})[me.id + ':' + this.st.lastMeet] = true; this.attend(me); } });
      if (o.job === 'king' && me.factions?.court) out.push({ label: `📜 Your standing at court`, fn: () => this.openStatus(me) });
      // powers of office
      const r = me.factions?.court?.rank || 0;
      if (r >= 4 && o.outlaw && o.household) out.push({ label: '⚖ Grant a magistrate’s pardon', fn: () => { o.outlaw = false; o.bounty = 0; me.needs.honor = Math.max(0, me.needs.honor - 15); G.log(`Magistrate ${me.name.full} quietly pardons ${o.name.full}. Tongues wag about favouritism.`, 'decree'); } });
      return out;
    },
    openStatus(me) {
      const st = this.standing(); const m = me.factions?.court;
      const sideBtns = Object.entries(CLIQUES).map(([k, c]) => `<button data-side="${k}" class="${this.st.side === k ? 'on' : ''}">${c.name} <span class="ko">${c.ko}</span><small>${c.creed} · power ${Math.round(this.st[k])} · backing you ${this.backing(k)}</small></button>`).join('');
      const pm = this.primeMinister();
      const el = G.ui.modal(`<h2>Your Standing at Court · 조정</h2>
        <p>House: <b>${st.tier[0]}</b> <span class="ko">${st.tier[1]}</span> (standing ${st.score}, worth ${st.worth} nyang). ${['A poor house climbs slowly and must be twice as good.', 'A respectable house is heard, if not yet heeded.', 'A yangban house opens doors with a name.', 'A great house walks the halls as if it owns them — because it nearly does.'][st.tier[2]]}</p>
        ${m ? `<p>${esc(me.name.given)}: <b>${esc(F().rankTitle(me, 'court'))}</b> · royal favour ${this.favour(me)} · salary ${[2, 4, 6, 10, 16, 24, 36, 60][m.rank]} nyang/day</p><p>${esc(this.nextStepHint(me))}</p>` : `<p>${esc(me.name.given)} does not serve at court. Join at the palace gate; this house would enter as <b>${FACTIONS.court.ranks[this.entryRank()]}</b>.</p>`}
        <p>Chief State Councillor: <b>${pm ? esc(pm.name.full) : '—'}</b>.</p>
        <h3>The cliques · 붕당</h3><div class="po-side">${sideBtns}</div>
        <p class="po-hint">Siding with a clique wins its backing faster, but if your side loses power, a purge may cost you your rank.</p>`);
      el.querySelectorAll('[data-side]').forEach((b) => (b.onclick = () => { this.st.side = b.dataset.side; this.st.backing[b.dataset.side] += 10; G.log(`${me.name.full} throws in with the ${CLIQUES[b.dataset.side].name}.`, 'decree'); this.openStatus(me); }));
    },
    panelHtml(s) {
      if (!s.household || !s.factions?.court) return '';
      return `<div class="facts">🏛 ${esc(F().rankTitle(s, 'court'))} · favour ${this.favour(s)}${this.st.side ? ` · ${CLIQUES[this.st.side].name}` : ''}</div>`;
    },
    serialize() { return this.st; },
    restore(d) { if (d) Object.assign(this.st, d); },
  };
  return S;
}
