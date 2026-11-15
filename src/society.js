// What the village knows about you.
//
// Gossip already existed as a conversation kind, but it was scenery: it picked a random person the
// speaker happened to know, said a canned line about them, and docked the listener's opinion by four
// points. Nothing true ever travelled, and nobody's standing was ever the product of what they had
// actually done.
//
// Now news is real. Notable things that happen — a rise in fortune, a ruin, a wedding, a birth, a theft,
// a promotion, a quarrel, a killing — become items of news attached to the person they are about. People
// carry what they have heard, pass it on when they gossip, and think better or worse of the subject for
// it. Reputation is therefore emergent: it is the sum of what the valley has heard about you and how
// widely it has spread, not a number any code sets directly.
//
// On top of that, two things people do about each other:
//   friends  — a villager will cross the valley to sit with a friend, and will put money in the hand of
//              one who has been ruined.
//   rivals   — two people chasing the same scarce prize (the headman's sash, the same person's hand)
//              come to resent each other, talk each other down, and take a rival's success badly.

const KINDS = {
  rose: { v: 2, s: 'has come up in the world' },
  ruined: { v: -1, s: 'has lost everything' },
  wed: { v: 2, s: 'is newly married' },
  born: { v: 2, s: 'has a new child' },
  office: { v: 3, s: 'has risen in the court' },
  headman: { v: 3, s: 'wears the headman’s sash' },
  trade: { v: 2, s: 'has opened a stall of their own' },
  land: { v: 2, s: 'has bought land' },
  freed: { v: 2, s: 'has bought their freedom' },
  scholar: { v: 2, s: 'has taken up the brush' },
  duel: { v: 1, s: 'won a duel' },
  theft: { v: -3, s: 'was caught thieving' },
  outlaw: { v: -4, s: 'is an outlaw now' },
  jailed: { v: -3, s: 'has been in the cells' },
  quarrel: { v: -1, s: 'quarrels with their spouse' },
  estranged: { v: -2, s: 'lives apart from their husband' },
  killed: { v: -5, s: 'has blood on their hands' },
  slew: { v: 2, s: 'put down an outlaw' },
  generous: { v: 2, s: 'gave freely to those with nothing' },
  mission: { v: 3, s: 'did the valley a great service' },
};

export function createSocietySystem(G) {
  const st = { news: [], seq: 1, told: 0, helped: 0, rivalries: 0, snap: {} };
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const sysOf = (id) => G.systems.find((x) => x.id === id);
  const live = (s) => s && !s.dead && !s.removed;
  const around = (s) => live(s) && !s.hidden && !s.controlled && !s.missionLock && !s.jailed && !s.merc && !s.royalGuard && s.age !== 'child';

  const MEM = 10;   // how many items of news one person carries
  const KEEP = 240; // how many days before news is forgotten

  function add(subj, kind, from) {
    if (!live(subj) || !KINDS[kind]) return null;
    // one item per person per kind per day; the valley doesn't retell the same thing twice in an hour
    if (st.news.some((n) => n.subj === subj.id && n.kind === kind && G.env.day - n.day < 2)) return null;
    const n = { id: st.seq++, subj: subj.id, kind, v: KINDS[kind].v, day: G.env.day };
    st.news.push(n);
    if (st.news.length > 160) st.news.shift();
    // whoever it happened to knows it, and so does anyone standing nearby
    learn(subj, n, true);
    if (from && live(from)) learn(from, n);
    for (const o of G.sims) if (around(o) && o !== subj && Math.hypot(o.pos.x - subj.pos.x, o.pos.z - subj.pos.z) < 18) learn(o, n);
    return n;
  }

  function learn(s, n, firsthand = false) {
    if (!s || n.subj === s.id && !firsthand) return;
    s.heard = s.heard || [];
    if (s.heard.some((h) => h.id === n.id)) return;
    s.heard.push({ id: n.id, v: n.v, subj: n.subj, day: G.env.day });
    if (s.heard.length > MEM) s.heard.shift();
    // hearing something about someone changes what you think of them
    if (n.subj !== s.id) {
      const t = G.sims.find((x) => x.id === n.subj);
      if (t) { const r = s.getRel(t); r.f = Math.max(-100, Math.min(100, r.f + n.v * 1.6)); r.met = true; }
    }
  }

  // called from Game.socialExchange when the speaker gossips; returns true if real news was passed on
  function gossipTurn(sp, li, line, setA) {
    const mine = (sp.heard || []).filter((h) => h.subj !== li.id && !(li.heard || []).some((x) => x.id === h.id));
    // a rival is always worth talking down
    const rivals = (sp.rivals || []).map((id) => G.sims.find((x) => x.id === id)).filter(live);
    let item = null, subj = null;
    if (rivals.length && chance(0.35)) {
      subj = pick(rivals);
      item = { v: -2, subj: subj.id, id: -1 };
    } else if (mine.length) {
      item = pick(mine);
      subj = G.sims.find((x) => x.id === item.subj);
    }
    if (!item || !subj || !live(subj)) return false;
    const k = st.news.find((n) => n.id === item.id);
    const phrase = k ? KINDS[k.kind].s : 'is not to be trusted';
    sp.say(`Did you hear? ${subj.name.given} ${phrase}.`, 'talk'); setA && setA(sp, 'talk');
    sp.changeRel(li, 3);
    if (item.id > 0) learn(li, { ...st.news.find((n) => n.id === item.id) });
    else { const r = li.getRel(subj); r.f = Math.max(-100, r.f - 3); r.met = true; }
    st.told++;
    return true;
  }

  // how the valley sees someone: what has been heard about them, and by how many
  function reputation(s) {
    if (!live(s)) return { score: 0, tellings: 0 };
    let v = 0, n = 0;
    for (const o of G.sims) {
      if (!live(o) || o === s) continue;
      for (const h of o.heard || []) if (h.subj === s.id) { v += h.v; n++; }
    }
    // the average thing people have heard, not the sum: being widely talked about should spread a
    // reputation, not multiply it
    return { score: n ? +(v / n).toFixed(2) : 0, tellings: n, reach: n };
  }

  // ---------------- noticing what happened ----------------
  // Rather than asking every other system to announce itself, society looks at the valley each morning
  // and sees what has changed since yesterday. Anything worth remarking on becomes news.
  function sweep() {
    for (const s of G.sims) {
      if (!live(s) || s.age === 'child') continue;
      const was = st.snap[s.id];
      const now = { job: s.job, rank: s.factions?.court?.rank || 0, stall: !!s.stall, serf: !!s.serf, spouse: !!s.spouse, outlaw: !!s.outlaw, coins: Math.round(s.coins), est: !!s.estranged };
      if (was) {
        if (!was.stall && now.stall) add(s, 'trade');
        if (was.serf && !now.serf) add(s, 'freed');
        if (now.rank > was.rank) add(s, 'office');
        if (!was.spouse && now.spouse) add(s, 'wed');
        if (!was.outlaw && now.outlaw) add(s, 'outlaw');
        if (!was.est && now.est) add(s, 'estranged');
        if (was.job !== now.job && now.job === 'scholar') add(s, 'scholar');
        if (now.coins > was.coins * 2.2 && now.coins > 260) add(s, 'rose');
        if (was.coins > 120 && now.coins < 12) add(s, 'ruined');
      }
      st.snap[s.id] = now;
      // old news fades from memory
      if (s.heard?.length) s.heard = s.heard.filter((h) => G.env.day - h.day < KEEP);
    }
    st.news = st.news.filter((n) => G.env.day - n.day < KEEP);
  }

  // ---------------- rivals ----------------
  function rivalSweep() {
    const A = sysOf('ambition'); if (!A) return;
    const byGoal = {};
    for (const s of G.sims) {
      if (!around(s) || s.household) continue;
      const a = s._amb; if (!a) continue;
      const key = a.id === 'wed' ? `wed:${a.who}` : a.id === 'headman' ? 'headman' : null; // only scarce prizes
      if (!key) continue;
      (byGoal[key] ||= []).push(s);
    }
    for (const group of Object.values(byGoal)) {
      if (group.length < 2) continue;
      for (const s of group) {
        s.rivals = s.rivals || [];
        for (const o of group) {
          if (o === s) continue;
          if (!s.rivals.includes(o.id)) { s.rivals.push(o.id); st.rivalries++; }
          // wanting the same thing wears on a friendship
          if (chance(0.5)) s.changeRel(o, -3, 0);
        }
      }
    }
    // rivalries lapse when the goal does
    for (const s of G.sims) {
      if (!s.rivals?.length) continue;
      if (!s._amb) { s.rivals = []; continue; }
      s.rivals = s.rivals.filter((id) => { const o = G.sims.find((x) => x.id === id); return live(o) && o._amb; });
    }
  }

  // ---------------- friends ----------------
  // Scanning every relationship (a villager may know a hundred people) on each decision was the single
  // most expensive thing here, so the list is rebuilt at most once a game-hour per person.
  function friendsOf(s) {
    const h = Math.floor(G.env.day * 24 + G.env.hour);
    if (s._friendsAt === h && s._friends) return s._friends;
    const out = [];
    for (const [id, r] of s.rel || []) {
      if (r.f < 48) continue;
      const o = G.sims.find((x) => x.id === id);
      if (around(o) && o !== s.spouse && o.home !== s.home) out.push(o);
    }
    s._friendsAt = h; s._friends = out;
    return out;
  }

  // a villager with something to spare will put it in a ruined friend's hand
  function helpFriend(s) {
    if (s.coins < 60) return false;
    const needy = friendsOf(s).filter((o) => (o.coins < 25 || (o.debt && o.coins < 60)) && !o._helpedDay);
    if (!needy.length) return false;
    const o = needy[0];
    if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) > 70) return false;
    const give = Math.min(40, Math.floor(s.coins * 0.25));
    s.coins -= give; o.earn(give); o._helpedDay = G.env.day;
    s.changeRel(o, 10, 0); o.changeRel(s, 16, 0);
    add(s, 'generous');
    s.startAction({ type: 'social', target: o, label: `Helping ${o.name.given}` });
    st.helped++;
    if (chance(0.4)) log(`${s.name.full} pressed ${give} nyang into ${o.name.full}'s hand. Nobody asked ${s.sex === 'f' ? 'her' : 'him'} to.`, 'story', o.pos);
    return true;
  }

  // or simply seek their company
  function seekFriend(s) {
    const f = friendsOf(s); if (!f.length) return false;
    const o = pick(f);
    const d = Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z);
    if (d > 110 || (!o.action && d > 60)) return false;
    s.startAction({ type: 'social', target: o, label: `Looking for ${o.name.given}` });
    return true;
  }

  const S = {
    id: 'society', st, reputation, gossipTurn, addNews: add,

    simAction(s) {
      if (!around(s) || s.household) return false;
      const n = s.needs;
      if (Math.min(n.hunger, n.energy) < 25) return false;
      const h = G.env.hour; if (h < 7 || h > 21) return false;
      if (!chance(0.1)) return false;
      try {
        if (chance(0.3) && helpFriend(s)) return true;
        return seekFriend(s);
      } catch (e) { console.error('[society]', e); return false; }
    },

    onEvent(name, p) {
      try {
        if (name === 'day') { sweep(); rivalSweep(); for (const s of G.sims) if (s._helpedDay && G.env.day - s._helpedDay > 3) s._helpedDay = 0; }
        if (name === 'birth' && p?.mother) add(p.mother, 'born');
        if (name === 'duel' && p?.winner) add(p.winner, 'duel');
        if (name === 'steal' && p?.thief) add(p.thief, 'theft');
        if (name === 'death' && p?.killer) {
          // a constable or soldier who cuts down a bandit has done his job; only an unlawful killing
          // blackens a name. Without this every guard in the valley was branded a murderer.
          const v = p.sim, k = p.killer;
          const lawful = ['soldier', 'police', 'general', 'king'].includes(k.job);
          const fair = v && (v.faction === 'bandit' || v.outlaw);
          add(k, lawful && fair ? 'slew' : fair ? 'duel' : 'killed');
        }
        if (name === 'promoted' && p?.sim) add(p.sim, 'office');
        if (name === 'ready') sweep();
      } catch (e) { console.error('[society] event', e); }
    },

    panelHtml(s) {
      if (!s || s.age === 'child') return '';
      const r = reputation(s);
      if (!r.tellings) return '';
      const word = r.score > 1.8 ? 'well spoken of' : r.score > 0.4 ? 'thought well of' : r.score > -0.4 ? 'barely remarked on' : r.score > -2 ? 'spoken of poorly' : 'badly spoken of';
      const rivals = (s.rivals || []).map((id) => G.sims.find((x) => x.id === id)).filter(live);
      return `<div class="facts"><b>🗣 Word in the valley</b> · ${word}
        <br><small>${r.tellings} ${r.tellings === 1 ? 'person has' : 'people have'} heard something about ${s.sex === 'f' ? 'her' : 'him'}.</small>
        ${rivals.length ? `<br><small>Rival${rivals.length > 1 ? 's' : ''}: ${rivals.map((x) => x.name.given).join(', ')}</small>` : ''}</div>`;
    },

    status() {
      const spoken = G.sims.filter((s) => !s.dead && (s.heard || []).length).length;
      return [`${st.news.length} things are being talked about; ${st.told} tellings so far.`,
        st.helped ? `${st.helped} times a friend has been helped out of their own pocket.` : ''].filter(Boolean);
    },

    serialize() { return { news: st.news, seq: st.seq, told: st.told, helped: st.helped, heard: G.sims.filter((s) => s.heard?.length).map((s) => [s.id, s.heard]), rivals: G.sims.filter((s) => s.rivals?.length).map((s) => [s.id, s.rivals]) }; },
    restore(d, get) {
      if (!d) return;
      st.news = d.news || []; st.seq = d.seq || 1; st.told = d.told || 0; st.helped = d.helped || 0;
      for (const [id, h] of d.heard || []) { const s = get?.(+id) || G.sims.find((x) => x.id === +id); if (s) s.heard = h; }
      for (const [id, r] of d.rivals || []) { const s = get?.(+id) || G.sims.find((x) => x.id === +id); if (s) s.rivals = r; }
    },
  };
  return S;
}
