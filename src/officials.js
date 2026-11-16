// The officials of Haeryeong — what they wear, who guards them, what they do, and who chooses them.
//  • Court robes by grade (관복): green for the junior ranks, blue for the middle, red for the high
//    officials, with a gold rank badge (흉배) and the black winged hat.
//  • Retinues by office: the Chief State Councillor rides with two guards, high ministers and the police
//    chief with one, the General with soldiers at his back.
//  • The Chief State Councillor (영의정) governs beside the King every day: relief, reforms, purges,
//    graft — according to his character. Hold the seat yourself and you wield those powers.
//  • The police chief (포도대장) decides how hard the constables hunt — honest, lazy, or for sale.
//  • The village assembly (향회) elects a headman (이장) each season. Stand for office, campaign, buy
//    votes if you must; the headman settles disputes, raises a village levy and calls festivals.
//  • Status matters: people bow to rank, honour and fame; shopkeepers flatter the great; the palace
//    gate turns away those with no business inside.
import { LAYOUT } from './terrain.js';

const ROBE = (rank) => (rank >= 6 ? '#a3262a' : rank >= 4 ? '#2e4f8a' : '#3f6b4a');
const ROYAL = ['king', 'queen', 'prince', 'princess'];

export function createOfficialsSystem(G) {
  const st = { headman: null, lastElection: -9, pmActT: 0.5, ballots: {}, candidates: [], bribes: {} };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = () => G.env.day + G.env.hour / 24;
  const rank = (s) => s?.factions?.court?.rank ?? -1;
  const pm = () => { const p = sys('politics')?.primeMinister?.(); return p && rank(p) >= 5 ? p : null; };
  const chief = () => { let c = G.sims.find((s) => !s.dead && s.policeChief); if (!c) { c = G.sims.filter((s) => !s.dead && s.job === 'police').sort((a, b) => (b.skills.sword || 0) - (a.skills.sword || 0))[0]; if (c) c.policeChief = true; } return c || null; };
  const general = () => G.sims.find((s) => !s.dead && s.job === 'general') || null;
  const headman = () => G.sims.find((s) => s.id === st.headman && !s.dead) || null;
  const king = () => (G.king && !G.king.dead ? G.king : null);
  const log = (t, k = 'decree', p) => G.log(t, k, p);

  // ---------------- robes ----------------
  function robe(s) {
    const r = rank(s); if (r < 2 || ROYAL.includes(s.job) || s.job === 'general' || s.job === 'soldier' || s.job === 'police' || s.job === 'monk' || s.merc || s.royalGuard) return;
    if (s.sex === 'f') return; // court office was a man's road in this age; women of rank keep their own finery
    const want = ROBE(r); if (s._robe === want) return; s._robe = want;
    s.uniform = { outfit: 'scholar', colors: { robe: want, top: '#e8e2d2', bottom: '#e8e2d2', belt: r >= 6 ? '#d9b44a' : '#c8b88a' }, hat: 'gat', beard: s.age !== 'young' };
    s.rebuildModel();
  }
  // ---------------- retinues ----------------
  function retinueFor(s) { if (!s || s.dead) return 0; if (s === pm()) return 2; if (s.policeChief) return 1; if (rank(s) >= 6) return 1; if (s.job === 'general') return 2; return 0; }
  function staffRetinues() {
    const RG = sys('royalGuard'); if (!RG?._recruitFor) return;
    const all = RG.guards();
    // stand down guards whose master lost the office
    for (const g of all) if (g.royalGuard.official) { const m = G.sims.find((x) => x.id === g.royalGuard.charge); const need = retinueFor(m); const have = all.filter((x) => x.royalGuard.official && x.royalGuard.charge === g.royalGuard.charge).length; if (!m || m.dead || need === 0 || have > need) { g.royalGuard.charge = null; g.royalGuard.official = false; } }
    const officers = G.sims.filter((s) => !s.dead && retinueFor(s) > 0);
    for (const o of officers) {
      const have = RG.guards().filter((g) => g.royalGuard.official && g.royalGuard.charge === o.id).length;
      for (let i = have; i < retinueFor(o); i++) { const [g] = RG._recruitFor(1, o); if (g) { g.royalGuard.official = true; g.skills.sword = Math.min(g.skills.sword, 7.5); g.uniform = { outfit: 'police', colors: { top: '#1c1c26', bottom: '#1c1c26', belt: ROBE(Math.max(4, rank(o))), ribbon: ROBE(Math.max(4, rank(o))) }, hat: 'jeonrip', weapon: true }; g.rebuildModel(); } }
    }
  }

  // ---------------- the Chief State Councillor governs ----------------
  function pmActs() {
    const p = pm(); if (!p || p.household) return; const k = king();
    const RP = sys('royalPower'); const RW = sys('royalWorks'); const P = sys('politics');
    const t = (x) => p.has?.(x);
    const r = Math.random();
    if (t('Greedy') && RW && RW.st.treasury > 150 && r < 0.5) {
      const take = 30 + Math.floor(Math.random() * 50); RW.st.treasury -= take; p.coins += take;
      if (Math.random() < 0.25) { log(`A censor's memorial accuses Chief State Councillor ${p.name.full} of skimming ${take} nyang from the treasury. The court buzzes.`, 'danger'); p.needs.honor = Math.max(0, p.needs.honor - 20); RP?.heart?.(-3, 'saw corruption at court'); }
      return;
    }
    if ((t('Gentle') || t('Pious')) && RP && RP.st.minsim < 55 && r < 0.6) {
      const c = RP.CMDS.find((x) => x.id === (RP.st.tax === 'high' || RP.st.tax === 'crushing' ? 'tax_normal' : 'granary'));
      if (c && (!c.when || c.when()) && k && !k.household) { c.do(k); log(`On the counsel of Chief State Councillor ${p.name.full}, the King relents: ${c.label.toLowerCase()}.`, 'decree'); }
      else if (k?.household) G.ui?.toast(`Chief State Councillor ${p.name.given} begs Your Majesty to ${c?.label.toLowerCase() || 'show mercy to the hungry'}.`, 'decree');
      return;
    }
    if ((t('Ambitious') || t('Cunning')) && P && r < 0.5) {
      const side = p.id % 2 ? 'west' : 'east'; P.st[side] = Math.min(80, P.st[side] + 4); P.st[side === 'east' ? 'west' : 'east'] = 100 - P.st[side];
      const rival = G.sims.find((s) => !s.dead && rank(s) >= 4 && rank(s) < 7 && s !== p && (s.id % 2 ? 'west' : 'east') !== side && !s.household);
      if (rival && Math.random() < 0.4) { rival.factions.court.rank--; log(`Chief State Councillor ${p.name.full} has ${rival.name.full} demoted on a pretext. His clique tightens its grip.`, 'decree'); }
      return;
    }
    if (r < 0.5) { RP?.heart?.(+1); log(`Chief State Councillor ${p.name.full} spends the day hearing complaints from the provinces and dispatching inspectors.`, 'story'); }
  }
  // the player as Chief State Councillor
  function pmPowers(me) {
    const k = king(); const RP = sys('royalPower'); const RW = sys('royalWorks');
    const el = G.ui.modal(`<h2>The Chief State Councillor's Desk · 영의정</h2><p>${esc(me.name.full)}, first among ministers. ${k ? `King ${esc(k.name.given)}'s regard for you: ${Math.round(k.getRel(me).f)}.` : ''} Treasury ${RW?.st?.treasury ?? 0} nyang.</p>
      <div class="po-ch">
        <button data-p="propose">📜 Propose a royal decree to the King…</button>
        <button data-p="appoint">🏛 Appoint a deserving subject to court (rank 3)</button>
        <button data-p="purge">⚖ Remove a minister of the opposing clique</button>
        <button data-p="relief">🌾 Send relief inspectors to the villages (40 from the treasury)</button>
        <button data-p="skim">💰 Quietly skim the treasury (80)</button>
        <button data-p="court">🔔 Summon the court to a meeting now</button>
      </div>`);
    const act = (k2, fn) => el.querySelector(`[data-p="${k2}"]`)?.addEventListener('click', () => { el.classList.add('hidden'); fn(); });
    act('propose', () => {
      if (!RP || !k) return; const opts = RP.CMDS.filter((c) => (!c.when || c.when()) && !['war', 'petitions', 'pilgrimage'].includes(c.id)).slice(0, 18);
      const e2 = G.ui.modal(`<h2>Propose a Decree</h2><p>The King accepts counsel from those he favours. Your chance: ${Math.round(Math.min(95, 35 + (k.getRel(me).f || 0) * 0.8))}%.</p><div class="rp-cmds">${opts.map((c) => `<button data-c="${c.id}">${esc(c.label)}</button>`).join('')}</div>`);
      e2.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => { e2.classList.add('hidden'); const c = RP.CMDS.find((x) => x.id === b.dataset.c); if (k.household || Math.random() * 100 < 35 + k.getRel(me).f * 0.8) { if (c.cost) { if ((RW?.st?.treasury || 0) < c.cost) return G.ui.toast('The treasury cannot bear it.'); RW.st.treasury -= c.cost; } const out = c.do(k); log(`On the counsel of Chief State Councillor ${me.name.full}: ${out || c.label}`, 'decree', me.pos); me.factions.court.rep += 10; } else { k.changeRel(me, -4); G.ui.toast(`The King frowns at your proposal and turns to other business.`); } }));
    });
    act('appoint', () => { const s = G.sims.filter((x) => !x.dead && !x.household && !x.factions?.court && x.age !== 'child' && x.faction === 'village' && !x.serf).sort((a, b) => b.needs.honor + (b.skills.scholarship || 0) * 8 - a.needs.honor - (a.skills.scholarship || 0) * 8)[0]; if (!s) return; G.factions.join(s, 'court', true); s.factions.court.rank = 3; s.changeRel(me, 25); log(`${me.name.full} raises ${s.name.full}, a worthy scholar, to the court. A loyal friend is made.`, 'decree', me.pos); });
    act('purge', () => { const side = sys('politics')?.st?.side; const v = G.sims.find((x) => !x.dead && !x.household && rank(x) >= 3 && rank(x) < 7 && (!side || (x.id % 2 ? 'west' : 'east') !== side)); if (!v) return G.ui.toast('No minister of the opposing clique stands within reach.'); v.factions.court.rank = Math.max(0, rank(v) - 2); v.changeRel(me, -40); sys('memories')?.remember?.(v, me, `${me.name.given} had me thrown from office`, -30); log(`${me.name.full} has ${v.name.full} stripped of office. The other clique will remember.`, 'decree', me.pos); });
    act('relief', () => { if (!RW || RW.st.treasury < 40) return G.ui.toast('The treasury is too thin.'); RW.st.treasury -= 40; RP?.heart?.(+4, 'saw relief inspectors'); for (const s of G.sims) if (!s.dead && s.faction === 'village' && s.coins < 15) { s.earn(3); s.changeRel(me, 4); } log(`Inspectors sent by ${me.name.full} hand out rice and silver in the poorest lanes.`, 'decree', me.pos); });
    act('skim', () => { if (!RW || RW.st.treasury < 80) return; RW.st.treasury -= 80; me.earn(80); if (Math.random() < 0.3) { me.needs.honor = Math.max(0, me.needs.honor - 25); k?.changeRel(me, -20); me.factions.court.rep -= 60; log(`A censor's memorial names ${me.name.full} as a thief of the treasury! The King's eyes go cold.`, 'danger', me.pos); } });
    act('court', () => { const P = sys('politics'); if (!P) return; P.openUntil = day() + 0.12; P.st.lastMeet = G.env.day; G.ui.toast('The great drum sounds: court is in session. Click the King to take your place.'); });
  }
  // the police chief's character sets the tone of the constabulary
  function policeTone() {
    const c = chief(); const E = G.economy; if (!c || !E) return;
    if (c.household) return; // a player chief sets their own course
    if (c.has?.('Lazy') && E.scanT < 4) E.scanT = 4;
    if ((c.has?.('Brave') || c.has?.('Loyal')) && E.scanT > 1.2) E.scanT = 1.2;
  }
  function chiefPowers(me) {
    const out = [];
    const outlaws = G.sims.filter((s) => !s.dead && s.outlaw && !s.jailed && !s.household);
    out.push({ label: `🚨 Order a sweep for every wanted outlaw (${outlaws.length})`, fn: () => { const cops = G.sims.filter((s) => !s.dead && s.job === 'police' && s !== me && !s.combat.target); outlaws.forEach((o, i) => { const c = cops[i % Math.max(1, cops.length)]; if (c) { c.cancelAction(); c.startFight(o, true); c.arresting = o; } }); log(`Police Chief ${me.name.full} orders a sweep: constables fan out across the valley for ${outlaws.length} outlaws.`, 'decree', me.pos); } });
    out.push({ label: '💰 Take the bribes that come to your desk (+40, honour −)', fn: () => { me.earn(40); me.needs.honor = Math.max(0, me.needs.honor - 10); for (const s of G.sims) if (s.outlaw && !s.household && Math.random() < 0.4) { s.outlaw = false; s.bounty = 0; } } });
    return out;
  }

  // ---------------- the village assembly elects a headman ----------------
  function candidates() {
    const adults = G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'village' && ['young', 'adult', 'elder'].includes(s.age) && !s.serf && !s.merc && !s.royalGuard && !ROYAL.includes(s.job) && s.job !== 'eunuch');
    const declared = adults.filter((s) => s.household && st.candidates.includes(s.id));
    const npc = adults.filter((s) => !s.household).sort((a, b) => (b.needs.honor + (b.coins || 0) / 10 + (b.age === 'elder' ? 15 : 0)) - (a.needs.honor + (a.coins || 0) / 10 + (a.age === 'elder' ? 15 : 0))).slice(0, 2);
    const inc = headman(); const list = [...new Set([...(inc && !inc.household ? [inc] : []), ...declared, ...npc])].slice(0, 4);
    return list;
  }
  function holdElection() {
    const cands = candidates(); if (cands.length < 2) return;
    st.lastElection = G.env.day;
    const tally = new Map(cands.map((c) => [c, 0]));
    const voters = G.sims.filter((s) => !s.dead && s.faction === 'village' && s.age !== 'child' && !s.serf && !ROYAL.includes(s.job));
    for (const v of voters) {
      let best = null, bs = -1e9;
      for (const c of cands) {
        let sc = (v === c ? 60 : 0) + v.getRel(c).f * 0.8 + c.needs.honor * 0.25 + (v.name.surname === c.name.surname ? 15 : 0) + (st.bribes[c.id]?.includes(v.id) ? 25 : 0) + (sys('society')?.standing?.(c) || 0) * 22 + (c === headman() ? 6 : 0) + (Math.random() - 0.5) * 30;
        const fame = sys('missions')?.fame?.[c.id]; if (fame) sc += Math.min(20, Object.values(fame).reduce((a, b) => a + b, 0) / 10);
        if (sc > bs) { bs = sc; best = c; }
      }
      tally.set(best, tally.get(best) + 1);
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const [win, votes] = ranked[0];
    const old = headman(); st.headman = win.id; st.bribes = {}; st.candidates = [];
    win.needs.honor = Math.min(100, win.needs.honor + 15); win.addMoodlet('headman', 'Elected village headman', 20, 2880);
    if (old && old !== win) old.addMoodlet('lostElection', 'Lost the headmanship', -10, 1440);
    log(`🗳 The village assembly (향회) meets under the guardian tree. ${ranked.map(([c, n]) => `${c.name.full} ${n}`).join(' · ')}. ${win.name.full} is chosen village headman (이장)!`, 'festival', { x: LAYOUT.plaza[0], z: LAYOUT.plaza[1] });
    if (cands.some((c) => c.household)) G.ui.toast(win.household ? `🗳 ${win.name.given} is elected village headman with ${votes} votes!` : `🗳 The vote goes to ${win.name.given}. ${cands.filter((c) => c.household).map((c) => c.name.given).join(', ')} lost.`, win.household ? 'festival' : 'story');
    // the assembly gathers to vote
    for (const v of voters.slice(0, 16)) if (!v.missionLock && !v.combat.target && !v.household) { v.cancelAction(); v.startAction({ type: 'event', dest: [LAYOUT.plaza[0] + (Math.random() - 0.5) * 16, LAYOUT.plaza[1] + (Math.random() - 0.5) * 16], anim: () => (Math.random() < 0.01 ? 'cheer' : 'talk'), dur: 40, look: LAYOUT.plaza, label: 'At the village assembly' }); }
  }
  function headmanPowers(me) {
    return [
      { label: '🤝 Settle a quarrel between neighbours', fn: () => { const vs = G.sims.filter((s) => !s.dead && s.faction === 'village' && !s.household); let pair = null; for (const a of vs) { const b = vs.find((x) => x !== a && a.getRel(x).f < -15); if (b) { pair = [a, b]; break; } } if (!pair) return G.ui.toast('No quarrels need settling today.'); pair[0].changeRel(pair[1], 25); pair[1].changeRel(pair[0], 25); for (const p of pair) p.changeRel(me, 8); me.needs.honor = Math.min(100, me.needs.honor + 5); log(`Headman ${me.name.full} sits ${pair[0].name.given} and ${pair[1].name.given} down over rice wine and settles their quarrel.`, 'story', me.pos); } },
      { label: '🪙 Raise a village levy for repairs (+5 a household, honour −)', fn: () => { let n = 0; for (const s of G.sims) if (!s.dead && s.faction === 'village' && !s.household && s.coins > 8 && Math.random() < 0.5) { s.coins -= 5; n += 5; s.changeRel(me, -3); } me.earn(n); log(`Headman ${me.name.full} collects ${n} nyang for the village roads. Some pay with a sour face.`, 'story', me.pos); } },
      { label: '🏮 Call a village festival (30)', disabled: me.coins < 30, fn: () => { me.coins -= 30; G.director?.stop?.(); G.director?.ev_festival?.(); for (const s of G.sims) if (!s.dead && s.faction === 'village') s.changeRel(me, 3); } },
    ];
  }

  // ---------------- status ----------------
  const fameOf = (s) => { const f = sys('missions')?.fame?.[s.id]; return f ? Object.values(f).reduce((a, b) => a + b, 0) : 0; };
  const statusOf = (s) => (ROYAL.includes(s.job) ? 100 : 0) + Math.max(0, rank(s)) * 10 + (s.finery ? 15 : 0) + (s.home?.tier === 'mansion' ? 15 : s.home?.tier === 'house' ? 6 : s.home?.tier === 'hut' ? -10 : 0) + s.needs.honor * 0.2 + Math.min(25, fameOf(s) / 8) + (s === headman() ? 10 : 0) - (s.serf?.kind === 'bond' ? 30 : 0) - (s.outlaw ? 20 : 0);
  function palaceGate(dt) {
    const s = G.selected; if (!s || !s.controlled || !s.household) return;
    const allowed = ROYAL.includes(s.job) || rank(s) >= 1 || s.job === 'eunuch' || s.royalGuard || s.summoned > day() || G.director?.active?.kind === 'banquet';
    if (allowed) return;
    const [px, pz] = LAYOUT.palace; const d = Math.hypot(s.pos.x - px, s.pos.z - pz);
    if (d < 38) {
      st.gateWarn = (st.gateWarn || 0) - dt;
      if (st.gateWarn <= 0) { st.gateWarn = 6; G.ui.toast('🛑 A palace guard bars the way: "No one enters the inner palace without office or summons."', 'danger'); }
      const ang = Math.atan2(s.pos.x - px, s.pos.z - pz); s.pos.x = px + Math.sin(ang) * 38.5; s.pos.z = pz + Math.cos(ang) * 38.5;
    }
  }

  const S = {
    id: 'officials', st, pm, chief, headman, statusOf,
    init() {
      // people bow to rank, honour and fame
      const orig = G.socialExchange;
      G.socialExchange = (sp, li, c, f) => { const r = orig(sp, li, c, f); if (c?.turn === 0 && !f && statusOf(li) - statusOf(sp) > 25 && !sp.household && Math.random() < 0.7) { sp.char.setAnim?.('bow', 10); sp.say(ROYAL.includes(li.job) ? '(bows to the ground)' : rank(li) >= 5 ? `Your Excellency ${li.name.surname}.` : li === headman() ? 'Good day, Headman.' : `${li.name.given}-nim, an honour.`, 'talk', 3); } return r; };
      // shopkeepers flatter the great
      const E = G.economy; if (E?.buyPrice) { const bp = E.buyPrice.bind(E); E.buyPrice = (s, k) => Math.max(1, Math.round(bp(s, k) * (statusOf(s) > 60 ? 0.85 : statusOf(s) > 35 ? 0.93 : statusOf(s) < 5 ? 1.08 : 1))); }
      // being summoned by the King opens the palace gate for a while
      const A = sys('authority'); void A;
    },
    update(dt) {
      if (!G.started) return;
      palaceGate(dt);
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 3;
      for (const s of G.sims) if (!s.dead && rank(s) >= 2) robe(s);
      policeTone();
    },
    onEvent(name, p) {
      if (name === 'ready') {
        // seat a Chief State Councillor and a high minister if the court has none
        const court = G.sims.filter((s) => !s.dead && s.factions?.court && s.age !== 'child' && !ROYAL.includes(s.job) && s.job !== 'general' && s.job !== 'soldier' && !s.household).sort((a, b) => rank(b) - rank(a));
        if (court[0] && rank(court[0]) < 7) court[0].factions.court.rank = 7;
        if (court[1] && rank(court[1]) < 6) court[1].factions.court.rank = 6;
        setTimeout(staffRetinues, 1500);
      }
      if (name === 'promoted') { robe(p.sim); staffRetinues(); }
      if (name !== 'day') return;
      staffRetinues();
      st.pmActT -= 1; if (st.pmActT <= 0) { st.pmActT = 1; try { pmActs(); } catch (e) { console.error('[officials] pm', e); } }
      // the village assembly at the start of each season
      const ds = G.seasons?.dayOfSeason;
      if ((ds === 1 || (!st.headman && G.env.day >= 2)) && st.lastElection !== G.env.day) setTimeout(holdElection, 3000);
      const h = headman(); if (h) h.earn(6);
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const out = [];
      if (o === me) {
        if (pm() === me) out.push({ label: '🏛 The Chief State Councillor’s desk', fn: () => pmPowers(me) });
        if (me.policeChief) out.push(...chiefPowers(me));
        if (headman() === me) out.push(...headmanPowers(me));
        if (me.age !== 'child' && !me.serf && !ROYAL.includes(me.job) && headman() !== me) out.push({ label: st.candidates.includes(me.id) ? '🗳 Standing for village headman (election on day 1 of next season)' : '🗳 Stand for village headman', disabled: st.candidates.includes(me.id), fn: () => { st.candidates.push(me.id); G.ui.toast(`${me.name.given} will stand for village headman at the next assembly (day 1 of the season). Win friends, honour and fame — or buy votes.`); } });
      }
      if (st.candidates.includes(me.id) && o !== me && !o.household && o.faction === 'village' && o.age !== 'child' && !(st.bribes[me.id] || []).includes(o.id)) out.push({ label: '🗳 Ask for their vote (5 nyang “for the children”)', danger: true, disabled: me.coins < 5, fn: () => { me.coins -= 5; o.earn(5); (st.bribes[me.id] ||= []).push(o.id); if (o.has?.('Loyal') || o.has?.('Pious')) { o.changeRel(me, -10); o.say('Keep your silver. My vote is my own.', 'angry', 3); st.bribes[me.id].pop(); } else o.say('…I’ll remember your kindness at the assembly.', 'talk', 3); } });
      if (o === pm() && o !== me) out.push({ label: `🏛 Chief State Councillor ${o.name.given} · ${o.has?.('Greedy') ? 'they say his ledgers are crooked' : o.has?.('Gentle') ? 'known for his mercy' : o.has?.('Ambitious') ? 'his clique rules the court' : 'a careful old minister'}`, disabled: true });
      return out;
    },
    panelHtml(s) {
      const bits = [];
      if (s === pm()) bits.push('🏛 Chief State Councillor (영의정)'); else if (rank(s) >= 2) bits.push(`🏛 ${G.factions.rankTitle(s, 'court')} · ${ROBE(rank(s)) === '#a3262a' ? 'red' : ROBE(rank(s)) === '#2e4f8a' ? 'blue' : 'green'} robe`);
      if (s.policeChief) bits.push('🚨 Police Chief (포도대장)');
      if (s === headman()) bits.push('🗳 Village Headman (이장)');
      if (s.household) bits.push(`Standing ${Math.round(statusOf(s))}`);
      return bits.length ? `<div class="facts">${bits.join(' · ')}</div>` : '';
    },
    status() { const p = pm(), h = headman(), c = chief(); return [`🏛 Chief State Councillor: <b>${p ? esc(p.name.full) : 'vacant'}</b>${p ? ` (${p.has?.('Greedy') ? 'greedy' : p.has?.('Gentle') ? 'merciful' : p.has?.('Ambitious') ? 'ambitious' : 'cautious'})` : ''} · Police Chief: ${c ? esc(c.name.full) : '—'} · Village Headman: ${h ? esc(h.name.full) : 'none yet'} (next assembly on day 1 of the season).`]; },
    serialize() { return { headman: st.headman, lastElection: st.lastElection, bribes: st.bribes, candidates: st.candidates }; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
