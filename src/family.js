// Married life, and family life.
//
// An audit of the simulation found that spouses were independent atoms who happened to share an address
// and a `spouse` pointer. Nothing in Sim.think() ever consulted `spouse`, `children`, `parents` or
// `home` when choosing what to do or whom to speak to: a husband was about 1.4x more likely to chat to
// his wife than to a stranger he liked equally, and only if she happened to be within 40 metres. They
// never ate together, never sat together, never prayed together, never walked anywhere together, never
// quarrelled with each other — and the only thing a couple could do as a couple was conceive a child.
//
// This gives a marriage a shape. Couples seek each other out and share a meal, a bench, a shrine, a cup
// at the jumak or an evening walk. Parents walk their children to the school hall and dote on them.
// Marriages warm and cool: they quarrel, they sulk, they make up, and a marriage left cold long enough
// becomes estranged — the wife returns to her kin, as she might have — and may yet be mended.
//
// Like src/ambition.js this hangs off G.simAction (see game.js), which lets a system claim a sim's next
// decision before the need-driven utility AI gets it.

export function createFamilySystem(G) {
  const st = { shared: 0, quarrels: 0, madeUp: 0, estranged: 0, reconciled: 0 };
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

  // someone whose time is their own
  const free = (s) => s && !s.dead && !s.hidden && !s.controlled && !s.missionLock && !s.jailed
    && !s.merc && !s.royalGuard && !s.removed && !s._leaving && !s.combat?.target;
  // ...and who isn't in the middle of something that matters
  const interruptible = (s) => free(s) && (!s.action || (!s.action.work && !['fight', 'flee', 'jailed', 'hide'].includes(s.action.type)));

  // Things two people can do side by side. Each needs an object with room for both.
  const TOGETHER = [
    { kind: 'cookpot', verb: 'Eating with', hours: [[6, 9], [11, 14], [17, 21]], warmth: 5 },
    { kind: 'platform', verb: 'Sitting with', hours: [[9, 21]], warmth: 6 },
    { kind: 'shrine', verb: 'Praying beside', hours: [[6, 19]], warmth: 5 },
    { kind: 'pavilion', verb: 'Idling away the hour with', hours: [[9, 20]], warmth: 6 },
    { kind: 'jumak', verb: 'Sharing a cup with', hours: [[17, 22]], warmth: 7, cost: 4 },
    { kind: 'stream', verb: 'Walking by the water with', hours: [[7, 19]], warmth: 6 },
  ];

  const hourOk = (a) => { const h = G.env.hour; return a.hours.some(([x, y]) => h >= x && h < y); };

  // an object of this kind with room for two, nearest first
  function roomForTwo(s, kind) {
    let best = null, bd = 1e9;
    for (const o of G.world.objects) {
      if (o.kind !== kind) continue;
      const cap = o.def.cap || 1; if (cap < 2) continue;
      if (o.users.size + 2 > cap) continue;
      if (o.def.home && (!s.home || o.house !== s.home.id)) continue;
      const d = Math.hypot(o.x - s.pos.x, o.z - s.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // who this person might want to spend an hour with
  function companion(s) {
    const out = [];
    const sp = s.spouse;
    if (sp && free(sp)) {
      const r = s.getRel(sp);
      if (r.f > -15) out.push([sp, 3.2 + Math.max(0, r.r) / 30]);
    }
    for (const c of s.children || []) if (free(c) && c.home === s.home) out.push([c, c.age === 'child' ? 1.5 : 0.7]);
    for (const p of s.parents || []) if (free(p) && p.home === s.home) out.push([p, 0.8]);
    // siblings under the same roof
    if (s.home) for (const o of (s.home.residents || [])) {
      if (!free(o) || o === s || o === sp || (s.children || []).includes(o) || (s.parents || []).includes(o)) continue;
      out.push([o, 0.5]);
    }
    if (!out.length) return null;
    const total = out.reduce((a, b) => a + b[1], 0);
    let r = Math.random() * total;
    return (out.find(([, w]) => (r -= w) <= 0) || out[0])[0];
  }

  // Send both to the same object. The partner is asked, not commandeered: if they are busy with work or
  // a fight they simply carry on, and the invitation quietly comes to nothing.
  function shareSomething(s) {
    const other = companion(s); if (!other) return false;
    if (!interruptible(other)) return false;
    if (dist(s, other) > 90) return false;
    const opts = TOGETHER.filter(hourOk).filter((a) => !a.cost || (s.coins >= a.cost && other.coins >= a.cost));
    if (!opts.length) return false;
    const a = pick(opts);
    const o = roomForTwo(s, a.kind); if (!o) return false;
    const name = (x) => x.name.given;
    s.startAction({ type: 'use', obj: o, label: `${a.verb} ${name(other)}` });
    other.cancelAction?.();
    other.startAction({ type: 'use', obj: o, label: `${a.verb} ${name(s)}` });
    // time spent together is what a marriage is made of
    s.changeRel(other, a.warmth, s.spouse === other ? a.warmth : 0);
    other.changeRel(s, a.warmth, other.spouse === s ? a.warmth : 0);
    s._togetherDay = G.env.day; other._togetherDay = G.env.day;
    st.shared++;
    return true;
  }

  // a parent walking a small child to the school hall
  function walkChildToSchool(s) {
    const h = G.env.hour; if (h < 8 || h > 10) return false;
    const kid = (s.children || []).find((c) => free(c) && c.age === 'child' && c.home === s.home && interruptible(c));
    if (!kid) return false;
    const o = roomForTwo(kid, 'lesson') || G.world.objects.find((x) => x.kind === 'lesson' && x.users.size < (x.def.cap || 1));
    if (!o) return false;
    kid.cancelAction?.();
    kid.startAction({ type: 'use', obj: o, label: 'At lessons' });
    s.startAction({ type: 'goto', dest: [o.x + (Math.random() - 0.5) * 3, o.z + (Math.random() - 0.5) * 3], label: `Walking ${kid.name.given} to the school hall` });
    s.changeRel(kid, 5, 0); kid.changeRel(s, 6, 0);
    st.shared++;
    return true;
  }

  // ---------------- the slow weather of a marriage ----------------
  function marriageDay() {
    const seen = new Set();
    for (const s of G.sims) {
      const sp = s.spouse;
      if (!sp || s.dead || sp.dead || seen.has(sp)) continue;
      seen.add(s);
      if (ROYAL.includes(s.job) && ROYAL.includes(sp.job)) continue;
      const r = s.getRel(sp);
      const apart = G.env.day - (s._togetherDay ?? G.env.day);

      // neglect cools a marriage; shared hours warm it
      if (apart > 2) { s.changeRel(sp, -2, -3); sp.changeRel(s, -2, -3); }

      // friction: hard days, clashing tempers, a bad harvest
      const strain = (s.needs.hunger < 35 ? 1 : 0) + (s.needs.energy < 30 ? 1 : 0) + (s.needs.honor < 30 ? 1 : 0)
        + (s.has?.('Hot-headed') || sp.has?.('Hot-headed') ? 1 : 0) + (s.coins < 6 ? 1 : 0);
      if (strain >= 2 && chance(0.1 + strain * 0.03) && !s.estranged) {
        s.changeRel(sp, -12, -10); sp.changeRel(s, -12, -10);
        s.addMoodlet?.('quarrel', `Quarrelled with ${sp.name.given}`, -14, 900);
        sp.addMoodlet?.('quarrel', `Quarrelled with ${s.name.given}`, -14, 900);
        st.quarrels++;
        if (!s.household && !sp.household && chance(0.3)) {
          log(`Hard words between ${s.name.full} and ${sp.name.full}. The neighbours heard it through the wall.`, 'story', s.pos);
        }
        continue;
      }

      // making up
      if (r.f < 25 && chance(0.18) && !s.estranged) {
        const kind = s.has?.('Gentle') || sp.has?.('Gentle');
        if (kind || chance(0.5)) {
          s.changeRel(sp, 14, 10); sp.changeRel(s, 14, 10);
          s.addMoodlet?.('madeup', `Made peace with ${sp.name.given}`, 12, 1440);
          sp.addMoodlet?.('madeup', `Made peace with ${s.name.given}`, 12, 1440);
          st.madeUp++;
        }
      }

      // a marriage left cold long enough: she goes back to her people, as she might have
      if (!s.estranged && r.f < -35 && sp.getRel(s).f < -35 && chance(0.12) && !s.household && !sp.household) {
        const leaver = s.sex === 'f' ? s : sp; const stay = leaver === s ? sp : s;
        const kin = (leaver.parents || []).find((p) => !p.dead && p.home && !p.home.virtual)?.home;
        leaver.estranged = { from: stay.id, since: G.env.day, was: leaver.home?.id ?? null };
        stay.estranged = { from: leaver.id, since: G.env.day, was: null };
        if (kin && kin !== leaver.home) {
          if (leaver.home?.residents) leaver.home.residents = leaver.home.residents.filter((x) => x !== leaver);
          leaver.home = kin; kin.residents.push(leaver);
          leaver.startAction?.({ type: 'goto', dest: leaver.home.door || [kin.x, kin.z], label: 'Going back to her own people' });
        }
        st.estranged++;
        log(`${leaver.name.full} has gone back to her own people. The ${stay.name.surname} house is quiet tonight.`, 'story', stay.pos);
        continue;
      }

      // and a cold marriage can still be mended
      if (s.estranged && r.f > 10 && chance(0.2)) {
        const back = s.sex === 'f' ? s : sp;
        const home = G.world.houses.find((h) => h.id === back.estranged?.was);
        s.estranged = null; sp.estranged = null;
        if (home) {
          if (back.home?.residents) back.home.residents = back.home.residents.filter((x) => x !== back);
          back.home = home; home.residents.push(back);
          back.startAction?.({ type: 'goto', dest: home.door || [home.x, home.z], label: 'Coming home' });
        }
        s.addMoodlet?.('reconciled', 'We mended it', 20, 2880); sp.addMoodlet?.('reconciled', 'We mended it', 20, 2880);
        st.reconciled++;
        log(`${s.name.full} and ${sp.name.full} have mended what was broken between them.`, 'love', s.pos);
      }
    }
  }

  const S = {
    id: 'family', st,

    simAction(s) {
      if (!free(s) || s.household) return false; // the player's family is theirs to direct
      if (s.age === 'child') return false;
      const n = s.needs;
      if (Math.min(n.hunger, n.energy) < 22) return false;
      const h = G.env.hour; if (h < 6 || h > 22) return false;
      if (s.estranged) return false;
      // a modest pull, so family life colours the day without crowding out everything else
      if (!chance(0.14)) return false;
      try {
        if (chance(0.25) && walkChildToSchool(s)) return true;
        return shareSomething(s);
      } catch (e) { console.error('[family]', e); return false; }
    },

    onEvent(name) { if (name === 'day') { try { marriageDay(); } catch (e) { console.error('[family] day', e); } } },

    panelHtml(s) {
      if (!s?.spouse || s.spouse.dead) return '';
      const r = s.getRel(s.spouse);
      const mood = s.estranged ? 'estranged' : r.f > 55 ? 'devoted' : r.f > 25 ? 'content' : r.f > -10 ? 'cool' : 'unhappy';
      const apart = G.env.day - (s._togetherDay ?? G.env.day);
      return `<div class="facts"><b>❀ Marriage</b> · ${s.spouse.name.full} — <i>${mood}</i>
        <br><small>${s.estranged ? 'Living apart.' : apart <= 0 ? 'They spent time together today.' : `${apart} day${apart === 1 ? '' : 's'} since they shared an hour.`}</small></div>`;
    },

    status() {
      const couples = new Set(); for (const s of G.sims) if (!s.dead && s.spouse && !s.spouse.dead) couples.add(s.id < s.spouse.id ? s.id : s.spouse.id);
      const apart = G.sims.filter((s) => !s.dead && s.estranged).length;
      return [`${couples.size} married couples${apart ? `, ${apart} living apart` : ''}.`];
    },

    serialize() { return { ...st, est: G.sims.filter((s) => s.estranged).map((s) => [s.id, s.estranged]) }; },
    restore(d, get) {
      if (!d) return; Object.assign(st, d);
      for (const [id, e] of d.est || []) { const s = get?.(+id) || G.sims.find((x) => x.id === +id); if (s) s.estranged = e; }
    },
  };
  return S;
}
