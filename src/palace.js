// The palace, and the people who keep it.
//
// Before this the palace was a gate, a throne hall and two empty side buildings. The king sat on his
// throne, four guards stood at the gate, and nothing else about the place was alive: no household, no
// ceremony, no way in for anyone who did not already hold rank. The grandest building in the valley had
// less going on inside it than a farmer's hut.
//
// Now it has an inner court with a council hall, the royal quarters, a kitchen and an infirmary
// (src/buildings.js), and this system gives it people and a routine:
//
//   궁녀  court ladies who keep the inner court and attend the queen
//   어의  a royal physician who attends the royal family when they are hurt or ill
//   사관  a court historian who follows the king and writes down what he does — and, as in life, will
//         not let the king read it
//   조회  the dawn assembly, where every official stands at the rank stone of his grade
//   신문고 the petition drum at the gate, which any commoner may strike when no magistrate will hear them

const ROYAL = ['king', 'queen', 'prince', 'princess'];

export function createPalaceSystem(G) {
  const st = { staffed: false, assemblyDay: -1, petitions: [], heard: 0, ignored: 0, records: [], banquetDay: -1 };
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const sysOf = (id) => G.systems.find((x) => x.id === id);
  const live = (s) => s && !s.dead && !s.removed;
  const spot = (k) => G.world?.spots?.[k];
  const king = () => G.sims.find((s) => live(s) && s.job === 'king');
  const queen = () => G.sims.find((s) => live(s) && s.job === 'queen');
  const rankOf = (s) => s.factions?.court?.rank || 0;
  const objOf = (kind) => G.world.objects.filter((o) => o.kind === kind);
  const freeObj = (kind) => objOf(kind).find((o) => o.users.size < (o.def.cap || 1));
  const idle = (s) => live(s) && !s.hidden && !s.controlled && !s.missionLock && !s.jailed && (!s.action || s.action.type === 'wander');

  // ---------------- the household of the palace ----------------
  function staff() {
    if (st.staffed) return; st.staffed = true;
    const [px, pz] = spot('palace') || [0, -120];
    // court ladies: the inner court was run almost entirely by women
    for (let i = 0; i < 5; i++) {
      const g = recruit(chance(0.3) ? 'adult' : 'young', true);
      if (i < 2) { g.palace.rank = 'sanggung'; g.palace.since = G.env.day - 8; ladyTitle(g); }
    }
    const doc = mkPalace({ sex: chance(0.5) ? 'f' : 'm', age: 'adult', job: 'scholar' });
    doc.palace = { role: 'physician' }; doc.titleOverride = 'Royal Physician'; doc.skills.scholarship = Math.max(doc.skills.scholarship, 6);
    const hist = mkPalace({ sex: 'm', age: 'adult', job: 'scholar' });
    hist.palace = { role: 'historian' }; hist.titleOverride = 'Court Historian'; hist.skills.scholarship = Math.max(hist.skills.scholarship, 7);
    log('The inner court is kept by its own household: court ladies, a royal physician, and a historian who writes down everything the King does.', 'story', { x: px, z: pz });
  }
  const staffOf = (role) => G.sims.filter((s) => live(s) && s.palace?.role === role);
  const mkPalace = (o) => { const [px, pz] = spot('palace') || [0, -120]; return G.spawn({ x: px + (Math.random() - 0.5) * 16, z: pz - 20 + (Math.random() - 0.5) * 10, home: G.vhouses?.court, ...o }); };
  // the household was spawned with no home at all, so none of them could ever go to bed
  const quarter = (s) => { const c = G.vhouses?.court; if (c && !s.home) { s.home = c; if (!c.residents.includes(s)) c.residents.push(s); } };

  // ---------------- 궁녀: ranks, royal favour and retirement ----------------
  // Palace women could not marry: they were nominally the King's for life. They rose instead — from
  // 나인 to 상궁, the eldest 상궁 holding the keys as 제조상궁 — and now and then one caught the King's eye
  // (승은) and was raised to 후궁, a royal consort. They left only when old, ill, or released.
  const LADY_TITLE = { nain: 'Court Lady (나인)', sanggung: 'Senior Court Lady (상궁)', jejo: 'Chief Court Lady (제조상궁)', consort: 'Royal Consort (후궁)' };
  function ladyTitle(s) { s.titleOverride = LADY_TITLE[s.palace?.rank || 'nain']; }
  function recruit(age = 'young', quiet = false) {
    const g = mkPalace({ sex: 'f', age, job: 'servant', outfit: 'commoner' });
    g.palace = { role: 'lady', rank: 'nain', since: G.env.day }; g.serf = null; g.missionLock = false; g.courtLady = true;
    ladyTitle(g);
    if (!quiet) log(`A girl from the provinces, ${g.name.full}, enters the palace as a 나인. She will not leave it again for many years.`, 'story', g.pos);
    return g;
  }
  function retire(l) {
    l.palace = null; l.titleOverride = null; l.courtLady = false; l.job = 'farmer'; l.coins += 120;
    if (l.home === G.vhouses?.court) { l.home.residents = l.home.residents.filter((x) => x !== l); l.home = null; }
    l.addMoodlet('released', 'Released from palace service', 10, 2880); l.rebuildModel?.();
    log(`After a lifetime in the inner court, ${l.name.full} is released from service with a small pension and goes to live out her years in the village.`, 'story', l.pos);
  }
  function favour(l, k) {
    l.palace.role = 'consort'; l.palace.rank = 'consort'; ladyTitle(l); l.royalConsort = true; l.courtLady = false;
    l.changeRel(k, 20, 30); l.needs.honor = 100; l.coins += 200;
    l.addMoodlet('favour', 'The King\'s favour', 25, 2880);
    const q = queen();
    if (q) { q.changeRel(l, -25); q.addMoodlet('slighted', `The King favours ${l.name.given}`, -12, 2880); }
    log(`승은 — the King's eye has fallen on the court lady ${l.name.full}. She is raised to 후궁, a royal consort, with quarters of her own.${q ? ' The Queen says nothing at all.' : ''}`, 'love', l.pos);
    if (chance(0.5)) G.tryForBaby(k, l);
  }
  function ladiesDaily() {
    for (const l of staffOf('lady')) {
      l.palace.since ??= G.env.day; l.palace.rank ||= 'nain';
      if (l.age === 'elder') { if (chance(0.5)) retire(l); continue; }
      if (l.palace.rank === 'nain' && G.env.day - l.palace.since >= 6 && chance(0.35)) {
        l.palace.rank = 'sanggung'; ladyTitle(l); l.addMoodlet('promoted', 'Raised to 상궁', 15, 1440);
        log(`${l.name.full} has served the inner court long enough to be raised to 상궁, a senior court lady.`, 'story', l.pos);
      }
    }
    // the longest-serving 상궁 heads the inner court
    const seniors = staffOf('lady').filter((l) => l.palace.rank === 'sanggung' || l.palace.rank === 'jejo').sort((a, b) => a.palace.since - b.palace.since);
    seniors.forEach((l, i) => {
      const want = i === 0 ? 'jejo' : 'sanggung'; if (l.palace.rank === want) return;
      l.palace.rank = want; ladyTitle(l);
      if (want === 'jejo') log(`${l.name.full} becomes 제조상궁, chief of the court ladies, and holds the keys of the inner court.`, 'story', l.pos);
    });
    const k = king();
    if (k && !G.royalMourning && staffOf('consort').length < 2 && chance(0.08)) {
      const pool = staffOf('lady').filter((l) => (l.age === 'young' || l.age === 'adult') && !l.pregnant);
      const score = (l) => l.getRel(k).f + (l.skills.charisma || 0) * 4 + Math.random() * 25;
      const f = pool.map((l) => [l, score(l)]).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (f) favour(f, k);
    }
    if (k && !G.royalMourning) for (const c of staffOf('consort')) if (!c.pregnant && chance(0.12)) G.tryForBaby(k, c);
    if (staffOf('lady').length < 5 && chance(0.4)) recruit();
  }
  function consort(s) {
    const k = king(); if (!k) return false;
    if (chance(0.35)) {
      const d = Math.hypot(k.pos.x - s.pos.x, k.pos.z - s.pos.z);
      if (d > 6) { s.startAction({ type: 'goto', dest: [k.pos.x - 1.6, k.pos.z + 0.8], label: 'Going to the King' }); return true; }
      s.startAction({ type: 'social', target: k, label: 'Keeping the King company' });
      return true;
    }
    const qq = spot('queenQuarters'); if (!qq) return false;
    s.startAction({ type: 'goto', dest: [qq[0] + (Math.random() - 0.5) * 6, qq[1] + (Math.random() - 0.5) * 6], label: 'In her own quarters' });
    return true;
  }

  // ---------------- 조회: the dawn assembly ----------------
  // Every official stands at the stone of his grade, the first grade nearest the throne.
  function assembly() {
    if (st.assemblyDay === G.env.day) return;
    const h = G.env.hour; if (h < 7 || h > 9.5) return;
    const k = king(); if (!k) return;
    st.assemblyDay = G.env.day;
    const stones = objOf('rankstone');
    if (!stones.length) return;
    const officials = G.sims.filter((s) => live(s) && !s.hidden && !s.controlled && rankOf(s) > 0 && !ROYAL.includes(s.job))
      .sort((a, b) => rankOf(b) - rankOf(a));
    let placed = 0;
    for (const o of officials.slice(0, 16)) {
      // a grade-6 man stands at the grade-6 stone; the nearest free one of his grade, else any
      const want = Math.min(9, Math.max(1, 10 - rankOf(o)));
      const stone = stones.find((x) => x.grade === want && x.users.size === 0) || stones.find((x) => x.users.size === 0);
      if (!stone) break;
      o.cancelAction?.();
      o.startAction({ type: 'use', obj: stone, label: `At the morning assembly (${rankOf(o)}품)` });
      placed++;
    }
    if (!k.controlled) {
      const t = objOf('throne')[0];
      if (t) { k.cancelAction?.(); k.startAction({ type: 'use', obj: t, label: 'Holding the morning assembly' }); }
    }
    if (placed >= 3) log(`조회: ${placed} officials stand at their rank stones before the throne hall as the sun comes up.`, 'decree', spot('courtyard'));
  }

  // ---------------- 사관: the historian ----------------
  function historian(s) {
    const k = king(); if (!k) return false;
    const d = Math.hypot(k.pos.x - s.pos.x, k.pos.z - s.pos.z);
    if (d > 9) { s.startAction({ type: 'goto', dest: [k.pos.x + 1.6, k.pos.z + 1.2], label: 'Following the King to record him' }); return true; }
    const desk = freeObj('study') || freeObj('court');
    if (desk) s.startAction({ type: 'use', obj: desk, label: 'Writing the daily record' });
    else s.startAction({ type: 'goto', dest: [k.pos.x + 2.2, k.pos.z + 1.4], label: 'Writing the daily record' });
    {
      // lowercasing the whole label mangled the names inside it ("chat with ryong-min")
      const what = String(k.action?.label || 'sat in silence');
      st.records.push({ day: G.env.day, text: `${k.name.full} — ${what.charAt(0).toLowerCase()}${what.slice(1)}` });
      if (st.records.length > 40) st.records.shift();
    }
    return true;
  }

  // ---------------- 어의: the royal physician ----------------
  function physician(s) {
    const sick = G.sims.filter((x) => live(x) && ROYAL.includes(x.job) && x.hp < x.maxHp * 0.75)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!sick) return false;
    const d = Math.hypot(sick.pos.x - s.pos.x, sick.pos.z - s.pos.z);
    if (d > 4) { s.startAction({ type: 'goto', dest: [sick.pos.x + 1.2, sick.pos.z], label: `Attending ${sick.name.given}` }); return true; }
    s.startAction({ type: 'social', target: sick, label: `Tending to ${sick.name.given}` });
    sick.hp = Math.min(sick.maxHp, sick.hp + 14 + s.skills.scholarship);
    if (chance(0.3)) log(`The royal physician attends ${sick.name.full} in the infirmary.`, 'story', sick.pos);
    return true;
  }

  // ---------------- 궁녀: the court ladies ----------------
  function lady(s) {
    const q = queen();
    if (q && live(q) && chance(0.5)) {
      const d = Math.hypot(q.pos.x - s.pos.x, q.pos.z - s.pos.z);
      if (d > 7) { s.startAction({ type: 'goto', dest: [q.pos.x + 1.8, q.pos.z + 0.8], label: `Attending the Queen` }); return true; }
      s.startAction({ type: 'social', target: q, label: 'Attending the Queen' });
      return true;
    }
    const o = freeObj('cookpot') || freeObj('well') || freeObj('platform');
    if (!o) return false;
    s.startAction({ type: 'use', obj: o, label: 'Keeping the inner court' });
    return true;
  }

  // ---------------- 신문고: the petition drum ----------------
  // The one door in the palace open to an ordinary villager.
  function maybePetition() {
    // one voice at a time at the gate: petitions were being raised faster than the court answered
    const inFlight = G.sims.filter((x) => live(x) && /grievance|petition drum/i.test(x.action?.label || '')).length;
    if (!spot('petitionDrum') || st.petitions.length + inFlight >= 2) return;
    const H = sysOf('houses'); const Hv = sysOf('harvest');
    // someone with a real grievance: ruined, robbed, evicted, hungry, or at feud with a greater house
    const hurt = G.sims.filter((s) => live(s) && !s.hidden && !s.controlled && !s.missionLock && s.faction === 'village'
      && s.age !== 'child' && rankOf(s) === 0
      && (s.coins < 8 || (s.needs.honor < 30) || (Hv?.famine?.() > 0.5 && s.coins < 40)));
    if (!hurt.length || !chance(0.3)) return;
    const p = pick(hurt);
    const drum = objOf('petitiondrum')[0]; if (!drum || drum.users.size) return;
    p.missionLock = true;
    p.cancelAction?.();
    p.startAction({ type: 'goto', dest: spot('petitionDrum'), label: 'Carrying a grievance to the palace gate', then: () => {
      p.missionLock = false;
      const they = p.sex === 'f' ? 'she' : 'he', their = p.sex === 'f' ? 'her' : 'his';
      const why = p.coins < 8 ? 'has nothing left to eat' : p.needs.honor < 30 ? `says ${they} was wronged and no magistrate would hear it` : `cannot feed ${their} household`;
      st.petitions.push({ id: p.id, day: G.env.day, why });
      log(`🥁 ${p.name.full} strikes the 신문고 at the palace gate. ${p.sex === 'f' ? 'She' : 'He'} ${why}.`, 'decree', p.pos);
      p.startAction({ type: 'use', obj: drum, label: 'Striking the petition drum' });
    } });
  }

  // the court answers, or does not
  function answerPetitions() {
    if (!st.petitions.length) return;
    const k = king(); const pm = sysOf('politics')?.primeMinister?.();
    const judge = [k, pm].find((s) => live(s) && !s.controlled);
    const pet = st.petitions.shift();
    const who = G.sims.find((s) => s.id === pet.id);
    if (!who || !live(who)) return;
    if (!judge) { st.ignored++; return; }
    const kind = judge.has?.('Gentle') || judge.has?.('Pious') ? 0.8 : judge.has?.('Greedy') ? 0.25 : 0.5;
    if (chance(kind) && judge.coins > 60) {
      const grant = Math.min(90, Math.floor(judge.coins * 0.12) + 20);
      judge.coins -= grant; who.earn(grant);
      who.needs.honor = Math.min(100, who.needs.honor + 10);
      st.heard++;
      sysOf('society')?.addNews?.(judge, 'generous');
      log(`The petition of ${who.name.full} was heard: ${judge.name.full} grants ${grant} nyang and orders the matter looked into.`, 'decree', who.pos);
    } else {
      st.ignored++;
      who.needs.honor = Math.max(0, who.needs.honor - 6);
      who.changeRel?.(judge, -14, 0);
      const RP = sysOf('royalPower');
      if (RP?.st && typeof RP.st.minsim === 'number') RP.st.minsim = Math.max(0, RP.st.minsim - 1.5);
      log(`${who.name.full} waited at the gate all day. Nobody came. The drum is quiet again.`, 'danger', who.pos);
    }
  }

  // ---------------- 연회: the royal banquet at 경회루 ----------------
  // The one building in the palace meant purely for pleasure and state occasions. The court crosses the
  // causeway and sits out over the water: the King, the Queen, the ministers of rank, and the court
  // ladies who serve them.
  function banquet(reason) {
    if (G.royalMourning) return false; // no music in the palace while the court mourns
    const seats = objOf('banquet'); if (!seats.length) return false;
    const k = king(); if (!k) return false;
    const guests = [k, queen(), ...G.sims.filter((s) => live(s) && !s.hidden && rankOf(s) >= 3 && !ROYAL.includes(s.job)).slice(0, 8),
      ...staffOf('lady').slice(0, 3)].filter((s) => live(s) && !s.controlled);
    let n = 0;
    for (const g of guests) {
      const seat = seats.find((o) => o.users.size < (o.def.cap || 1)); if (!seat) break;
      g.cancelAction?.();
      g.startAction({ type: 'use', obj: seat, label: `At the royal banquet` });
      g.addMoodlet?.('banquet', 'Feasted at 경회루', 18, 2880);
      n++;
    }
    if (n < 3) return false;
    st.banquetDay = G.env.day;   // only once it actually happened, or a failed attempt blocks it for days
    for (const a of guests) for (const b of guests) if (a !== b) a.changeRel(b, 4, 0);
    log(`🏮 A banquet at 경회루 — ${reason}. ${n} of the court sit out over the water while the musicians play.`, 'festival', spot('banquetHall'));
    return true;
  }

  // ---------------- an envoy from another kingdom ----------------
  const KINGDOMS = ['Buyeo', 'Okjeo', 'the Khitan', 'Silla', 'the Jurchen hills', 'Wa across the water'];
  function envoy() {
    if (st.envoy || !spot('palaceGate')) return;
    const k = king(); if (!k) return;
    const from = pick(KINGDOMS);
    const gate = spot('palaceGate');
    const party = [];
    for (let i = 0; i < 3; i++) {
      const e = G.spawn({ x: gate[0] + (Math.random() - 0.5) * 6, z: gate[1] + 26 + i * 2, sex: i ? (chance(0.5) ? 'f' : 'm') : 'm',
        age: 'adult', job: i === 0 ? 'noble' : 'soldier', surname: null });
      e.envoy = true; e.missionLock = true; e.faction = 'village';
      e.startAction({ type: 'goto', dest: [gate[0], gate[1] - 6], label: `An envoy of ${from}, come to the court` });
      party.push(e);
    }
    st.envoy = { from, day: G.env.day, party: party.map((p) => p.id), stage: 'arriving' };
    log(`🎌 An envoy of ${from} is at the palace gate, with gifts and a letter for the King.`, 'decree', gate);
  }

  function envoyTick() {
    const E = st.envoy; if (!E) return;
    const party = E.party.map((id) => G.sims.find((s) => s.id === id)).filter(live);
    if (!party.length) { st.envoy = null; return; }
    if (G.env.day - E.day < 1) return;
    const k = king();
    if (!k) { for (const p of party) { p.missionLock = false; p.removed = true; p.dead = true; p.hidden = true; } st.envoy = null; return; }
    // the King receives them, and his temper decides how it goes
    const warm = k.has?.('Gentle') || k.has?.('Cheerful') || k.needs.honor > 60;
    const greedy = k.has?.('Greedy');
    const RW = sysOf('royalWorks') || sysOf('royalPower');
    if (warm && !greedy) {
      const gift = 120 + Math.floor(Math.random() * 180);
      k.earn(gift);
      k.needs.honor = Math.min(100, k.needs.honor + 8);
      sysOf('society')?.addNews?.(k, 'office');
      log(`The envoy of ${E.from} was received with honour. They leave ${gift} nyang in tribute and a promise of open roads.`, 'decree', k.pos);
      banquet(`in honour of the envoy of ${E.from}`);
    } else if (greedy) {
      log(`The King demanded more of the envoy of ${E.from} than they had brought. They left before the second cup, and said little on the way out.`, 'danger', k.pos);
      k.needs.honor = Math.max(0, k.needs.honor - 6);
      const RP = sysOf('royalPower'); if (RP?.st && typeof RP.st.minsim === 'number') RP.st.minsim = Math.max(0, RP.st.minsim - 3);
    } else {
      log(`The envoy of ${E.from} was heard in the throne hall and sent away with courtesy and no promises.`, 'decree', k.pos);
    }
    for (const p of party) { p.missionLock = false; p.startAction({ type: 'goto', dest: [spot('palaceGate')[0], spot('palaceGate')[1] + 80], label: 'Leaving the valley' }); p._leaving = performance.now(); }
    st.envoy = null;
  }

  // ---------------- 국상: royal mourning ----------------
  // When a King dies the whole realm mourns for three days: no music, no banquets, no weddings and no
  // festivals; the court puts on undyed hemp and the new King receives envoys only after it ends.
  function mourningBegin(d) {
    st.mourning = { until: G.env.day + 3, name: d.name.full, id: d.id };
    G.royalMourning = true;
    for (const s of G.sims) if (live(s) && s.faction === 'village') s.addMoodlet('gukssang', `Mourning King ${d.name.given}`, -4, 4320);
    for (const s of G.sims) if (live(s) && (rankOf(s) > 0 || s.palace?.role)) s.addMoodlet('gukssangCourt', 'In mourning hemp for the late King', -6, 4320);
    log(`⚫ 국상 — King ${d.name.full} is dead. The court goes into three days of mourning: the drums are silent, the banquet hall is shut, and no wedding may be held in the valley.`, 'death', spot('courtyard'));
    // the historian records it, the ladies keen at the gate
    const h = staffOf('historian')[0]; if (h) st.records.unshift({ day: G.env.day, text: `The King ${d.name.full} departed this world. The court wept at the gate.` });
    const gate = spot('palaceGate');
    if (gate) staffOf('lady').slice(0, 4).forEach((l, i) => { if (l.controlled) return; l.cancelAction?.(); l.startAction({ type: 'event', dest: [gate[0] - 3 + i * 2, gate[1] + 4], anim: 'kneel', dur: 60, look: gate, label: 'Keening for the late King (곡)' }); });
  }
  function mourningTick() {
    const m = st.mourning; if (!m) { G.royalMourning = false; return; }
    if (G.env.day < m.until) return;
    st.mourning = null; G.royalMourning = false;
    log(`The three days of mourning for King ${m.name} are over. The hemp is folded away, and the drums of the palace are heard again.`, 'decree', spot('courtyard'));
    const k = king(); if (k) setTimeout(() => { try { banquet(`as ${k.name.given}'s reign truly begins`); } catch {} }, 3000);
  }

  // ---------------- a coronation ----------------
  function coronation(k) {
    if (!live(k)) return;
    const t = objOf('throne')[0];
    const stones = objOf('rankstone');
    if (t && !k.controlled) { k.cancelAction?.(); k.startAction({ type: 'use', obj: t, label: 'Receiving the mandate' }); }
    let n = 0;
    for (const o of G.sims.filter((s) => live(s) && !s.hidden && !s.controlled && rankOf(s) > 0 && s !== k).slice(0, 16)) {
      const stone = stones.find((x) => x.users.size === 0); if (!stone) break;
      o.cancelAction?.(); o.startAction({ type: 'use', obj: stone, label: 'Bowing to the new King' }); n++;
    }
    for (const s of G.sims) if (live(s) && s.faction === 'village') s.addMoodlet?.('newking', 'A new King is crowned', 10, 2880);
    log(`👑 ${k.name.full} receives the mandate in the throne hall. ${n} officials bow at their rank stones${G.royalMourning ? ', still in mourning hemp for the late King' : '; the drums are heard in the village'}.`, 'festival', spot('courtyard'));
    setTimeout(() => { try { banquet(`for the crowning of ${k.name.full}`); } catch {} }, 4000);
  }

  const S = {
    id: 'palace', st,
    records: () => st.records,

    simAction(s) {
      if (!live(s) || s.household || s.controlled || s.missionLock) return false;
      const role = s.palace?.role; if (!role) return false;
      const n = s.needs; if (Math.min(n.hunger, n.energy) < 25) return false;
      if (!chance(0.5)) return false;
      try {
        if (role === 'historian') return historian(s);
        if (role === 'physician') return physician(s);
        if (role === 'lady') return lady(s);
        if (role === 'consort') return consort(s);
      } catch (e) { console.error('[palace]', e); }
      return false;
    },

    update(dt) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 6;
      try { assembly(); maybePetition(); } catch (e) { console.error('[palace] update', e); }
    },

    onEvent(name, p) {
      try {
        if (name === 'ready') { staff(); for (const s of G.sims) if (live(s) && s.palace?.role) quarter(s); }
        if (name === 'death' && p?.sim?.job === 'king' && !p.sim.missionSpawn) mourningBegin(p.sim);
        if (name === 'crowned' && p?.sim) coronation(p.sim);
        if (name === 'day') {
          answerPetitions(); answerPetitions();
          st.petitions = st.petitions.filter((x) => G.env.day - x.day < 3);
          envoyTick();
          mourningTick();
          ladiesDaily();
          if (!st.envoy && !G.royalMourning && chance(0.22)) envoy();
          // the court feasts now and then of its own accord
          if (!st.envoy && G.env.day - st.banquetDay > 5 && chance(0.3)) banquet('the King is pleased with the season');
        }
      } catch (e) { console.error('[palace] event', e); }
    },

    simMenuItems(me, o) {
      const out = [];
      // the famous refusal: a king may not read his own record
      if (me?.household && o?.palace?.role === 'historian') {
        out.push({ label: '📜 Ask to read the daily record', fn: () => {
          if (me.job === 'king') { G.ui?.toast(`${o.name.given} bows low: "Your Majesty may not read it. That is the whole point of it."`); o.changeRel(me, -4, 0); }
          else G.ui?.toast(st.records.length ? `"${pick(st.records).text}."` : '"The brush has been idle today."');
        } });
      }
      if (me?.household && o === me && rankOf(me) === 0 && spot('petitionDrum')) {
        out.push({ label: '🥁 Take a grievance to the 신문고', fn: () => {
          me.cancelAction?.();
          me.startAction({ type: 'goto', dest: spot('petitionDrum'), label: 'Carrying a grievance to the palace gate', then: () => {
            st.petitions.push({ id: me.id, day: G.env.day, why: 'brings a grievance of their own' });
            log(`🥁 ${me.name.full} strikes the 신문고 at the palace gate.`, 'decree', me.pos);
            G.ui?.toast('The drum is struck. The court must answer — or be seen not to.');
          } });
        } });
      }
      return out;
    },

    status() {
      const l = staffOf('lady').length, h = staffOf('historian').length, d = staffOf('physician').length, c = staffOf('consort');
      const chief = staffOf('lady').find((x) => x.palace.rank === 'jejo');
      return [`The palace household: ${l} court ladies${d ? ', a royal physician' : ''}${h ? ', a court historian' : ''}.`,
        chief ? `${chief.name.full} holds the keys of the inner court as 제조상궁.` : '',
        c.length ? `Royal consort${c.length > 1 ? 's' : ''}: ${c.map((x) => x.name.full).join(', ')}.` : '',
        G.royalMourning ? 'The court is in mourning (국상).' : '',
        st.heard + st.ignored ? `${st.heard} petitions heard, ${st.ignored} left unanswered at the gate.` : ''].filter(Boolean);
    },

    // The sim serializer does not carry `palace` or `titleOverride`, and staff() will not re-run once
    // st.staffed is true — so without this the whole palace household came back from a save as
    // ordinary bondservants with no role, no title and nothing to do.
    serialize() {
      return { ...st, petitions: st.petitions,
        household: G.sims.filter((s) => live(s) && s.palace?.role).map((s) => [s.id, s.palace.role, s.titleOverride || '', s.palace.rank || '', s.palace.since ?? null]) };
    },
    restore(d, get) {
      if (!d) return;
      const { household, ...rest } = d; Object.assign(st, rest); G.royalMourning = !!st.mourning;
      for (const [id, role, title, rank, since] of household || []) {
        const s = get?.(+id) || G.sims.find((x) => x.id === +id);
        if (s) { quarter(s); s.palace = { role, rank: rank || (role === 'lady' ? 'nain' : role === 'consort' ? 'consort' : undefined), since: since ?? G.env.day }; if (title) s.titleOverride = title; s.serf = null; if (role === 'lady') s.courtLady = true; }
      }
    },
  };
  return S;
}
