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
    const mk = (o) => G.spawn({ x: px + (Math.random() - 0.5) * 16, z: pz - 20 + (Math.random() - 0.5) * 10, ...o });
    // court ladies: the inner court was run almost entirely by women
    for (let i = 0; i < 5; i++) {
      const g = mk({ sex: 'f', age: chance(0.3) ? 'adult' : 'young', job: 'servant', outfit: 'commoner' });
      g.palace = { role: 'lady' }; g.serf = null; g.missionLock = false;
      g.name.given = g.name.given; g.courtLady = true;
    }
    const doc = mk({ sex: chance(0.5) ? 'f' : 'm', age: 'adult', job: 'scholar' });
    doc.palace = { role: 'physician' }; doc.skills.scholarship = Math.max(doc.skills.scholarship, 6);
    const hist = mk({ sex: 'm', age: 'adult', job: 'scholar' });
    hist.palace = { role: 'historian' }; hist.skills.scholarship = Math.max(hist.skills.scholarship, 7);
    log('The inner court is kept by its own household: court ladies, a royal physician, and a historian who writes down everything the King does.', 'story', { x: px, z: pz });
  }
  const staffOf = (role) => G.sims.filter((s) => live(s) && s.palace?.role === role);

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
      } catch (e) { console.error('[palace]', e); }
      return false;
    },

    update(dt) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 6;
      try { assembly(); maybePetition(); } catch (e) { console.error('[palace] update', e); }
    },

    onEvent(name) {
      try {
        if (name === 'ready') staff();
        if (name === 'day') { answerPetitions(); answerPetitions(); st.petitions = st.petitions.filter((p) => G.env.day - p.day < 3); }
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
      const l = staffOf('lady').length, h = staffOf('historian').length, d = staffOf('physician').length;
      return [`The palace household: ${l} court ladies${d ? ', a royal physician' : ''}${h ? ', a court historian' : ''}.`,
        st.heard + st.ignored ? `${st.heard} petitions heard, ${st.ignored} left unanswered at the gate.` : ''].filter(Boolean);
    },

    serialize() { return { ...st, petitions: st.petitions }; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
