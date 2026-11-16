// Careers for your own family. Villagers change trade through their ambitions, but a member of your
// household left on free will never looked for better work: a Wandering Swordsman "worked" at the
// training dummy for 4 nyang a day forever. Now, every few days, a free-willed family member with a weak
// or unsuitable trade goes looking — guided by their life goal first, then by their skills and the pay —
// walks to the workplace, takes the job there, and the ordinary work routine does the rest.
import { JOBS } from './data.js';

// trades a commoner may simply walk in and take up (never royal, noble, official, bonded or holy orders)
const OPEN = ['farmer', 'farmhand', 'fisher', 'hunter', 'merchant', 'scholar', 'innkeeper', 'soldier', 'police', 'swordsman'];
// what each life goal looks for, in order of preference
const BY_GOAL = { blade: ['soldier', 'police'], wealth: ['merchant', 'innkeeper'], scholar: ['scholar'], throne: ['scholar', 'soldier'], love: ['innkeeper', 'merchant'], friend: ['innkeeper', 'merchant'], shadow: ['merchant'] };

export function createCareersSystem(G) {
  const st = { last: {}, tried: {} };   // simId -> day of their last change of trade (by anyone, you included) / last attempt
  const day = () => G.env.day;
  const E = () => G.economy;

  function wanted(s) {
    const asp = G.systems.find((x) => x.id === 'aspirations')?.data?.[s.id]?.asp;
    const ok = (j) => OPEN.includes(j) && j !== s.job && !E().jobRequirement(s, j) && G.world.objects.some((o) => o.def.work === JOBS[j].work);
    for (const j of BY_GOAL[asp] || []) if (ok(j)) return { job: j, why: 'it suits their goal in life' };
    // no goal pulling them: the best-paid trade their skills allow
    const best = OPEN.filter(ok).sort((a, b) => JOBS[b].pay - JOBS[a].pay)[0];
    if (best && JOBS[best].pay >= (JOBS[s.job]?.pay || 0) + 3) return { job: best, why: 'it pays better' };
    return null;
  }

  function seek(s) {
    const w = wanted(s); if (!w) { st.last[s.id] = day(); return false; }   // content as they are: look again in a few days
    const kind = JOBS[w.job].work;
    const objs = G.world.objects.filter((o) => o.def.work === kind);
    const o = objs.sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z))[0];
    if (!o) return false;
    st.tried[s.id] = day();   // if something interrupts the walk (a funeral, a raid), they try again tomorrow
    const title = JOBS[w.job].title.toLowerCase();
    s.cancelAction?.();
    s.startAction({ type: 'goto', dest: s.standOf ? s.standOf(o) : [o.x, o.z], label: `Going to ask for work as a ${title}`, then: (z) => {
      if (z.dead || z.controlled || z.job === w.job || E().jobRequirement(z, w.job)) return;
      E().changeJob(z, w.job);
      if (z.job === w.job) G.ui?.toast(`💼 ${z.name.given} has taken work as a ${title} — ${w.why}.`);
    } });
    G.log(`${s.name.full} sets out to look for work as a ${title}.`, 'story', s.pos);
    return true;
  }

  const S = {
    id: 'careers', st,
    init() {
      // remember every change of trade, whoever made it, so a choice you made yourself is respected
      const eco = E(); if (!eco || eco._careersHooked) return; eco._careersHooked = true;
      const orig = eco.changeJob.bind(eco);
      eco.changeJob = (s, job) => { const before = s.job; orig(s, job); if (s.job !== before) st.last[s.id] = day(); };
    },
    // An hourly look rather than a claim on the next decision: family members spend long stretches in
    // events and chores and make only a few decisions a day, so a decision-time check almost never ran.
    update(dt, gm) {
      if (!G.started) return;
      this._t = (this._t || 0) + gm; if (this._t < 60) return; this._t = 0;
      const h = G.env.hour; if (h < 7 || h > 18) return;
      for (const s of G.household) {
        if (s.dead || !s.freeWill || s.controlled || s.missionLock || s.hidden || s.jailed || s.away) continue;
        if (s.age !== 'young' && s.age !== 'adult') continue;
        if (!OPEN.includes(s.job)) continue;                            // royals, nobles, officials, bondservants…
        if (Math.min(s.needs.hunger, s.needs.energy) < 25) continue;
        const a = s.action;                                              // only ordinary pursuits are interrupted
        if (a && (a.type === 'event' || a.type === 'fight' || a.type === 'flee' || a.type === 'converse' || a.forced || a.work)) continue;
        st.last[s.id] = st.last[s.id] ?? day() - 3;                      // first look comes a few days in
        if (day() - st.last[s.id] < 6) continue;                         // not again so soon — and not over your choice
        if (st.tried[s.id] === day() || Math.random() > 0.35) continue;
        if (seek(s)) return;                                             // one at a time
      }
    },
    serialize() { return st; },
    restore(d) { if (d?.last) st.last = d.last; if (d?.tried) st.tried = d.tried; },
  };
  return S;
}
