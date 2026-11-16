// Ambition — what a villager is trying to make of their life.
//
// Before this, every NPC ran a pure need-satisfaction loop: eat, sleep, work a shift, chat, go home.
// Their station only ever moved when something happened *to* them — a random windfall, a scripted exam,
// an inheritance, a system handing out a rank. A farmer with 400 nyang in his chest would sit on it
// forever, because nothing in the game ever made him *want* anything. Measured over nine days with 117
// adults: three job changes (all scripted), nobody bought a house, nobody opened a shop, while the
// median fortune grew sixfold and was never spent.
//
// So each adult now carries an ambition: a goal they chose, a sum they are saving toward, and actions
// they take to get there. They work extra shifts, study at the school hall, train at the posts, court
// one particular person, campaign for the headmanship, or take to crime. They reach it, or they give up,
// or they overreach and ruin themselves — and either way the valley's standing order keeps shifting
// without the player touching anything.
//
// It hangs off G.simAction (see game.js), which lets a system claim a sim's next decision before the
// need-driven utility AI gets it.
import { JOBS } from './data.js';

const ROYAL = ['king', 'queen', 'prince', 'princess'];

export function createAmbitionSystem(G) {
  const st = { amb: {}, won: 0, gaveUp: 0, ruined: 0, logs: 0, logDay: -1 };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const E = () => G.economy;
  const chance = (p) => Math.random() < p;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Someone who runs their own life. Excludes the player's household (they have Aspirations instead),
  // anyone another system has taken charge of, royals, children and the unfree.
  const own = (s) => s && !s.dead && !s.hidden && !s.household && !s.controlled
    && (!s.missionLock || !!s.serf) // a bondservant is spoken for, but still wants out
    && !s.merc && !s.royalGuard && !s.jailed && !s.removed && !s._leaving
    && s.faction === 'village' && s.age !== 'child' && !ROYAL.includes(s.job);
  // whose next action we may actually take over — never someone another system is steering
  const drivable = (s) => own(s) && !s.missionLock && !s.serf;

  const amb = (s) => s._amb;
  const def = (id) => LIST.find((a) => a.id === id);
  const has = (s, t) => !!s.has?.(t);
  const honor = (s) => s.needs?.honor ?? 50;

  // nearest usable object of a kind, ignoring the job filter the normal AI applies — the whole point is
  // that a farmer's son may walk to the school hall even though studying is not his trade
  function spot(s, kind) {
    let best = null, bd = 1e9;
    for (const o of G.world.objects) {
      if (o.kind !== kind) continue;
      if (o.users.size >= (o.def.cap || 1)) continue;
      const d = Math.hypot(o.x - s.pos.x, o.z - s.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  const go = (s, o, label) => { if (!o) return false; s.startAction({ type: 'use', obj: o, label }); return true; };

  // a daily saving rate: what they hold back from living expenses toward the goal
  const thrift = (s) => 0.55 + (has(s, 'Greedy') ? 0.2 : 0) + (has(s, 'Ambitious') ? 0.12 : 0) - (has(s, 'Lazy') ? 0.2 : 0);

  // ---------------- the ambitions ----------------
  // want(s)   how strongly this life suits them right now (0 = not for them)
  // cost(s)   nyang they must put by, if any
  // pursue(s) an action that advances it — this is what the player actually sees them doing
  // ready(s)  may it be completed now
  // finish(s) change their station for real
  const LIST = [
    {
      id: 'stall', name: 'Open a market stall', ko: '장사 밑천', icon: '⚖', dramatic: true,
      want: (s) => (s.stall || s.job === 'merchant' ? 0 : ['farmer', 'fisher', 'hunter', 'farmhand', 'innkeeper'].includes(s.job) ? 1 : 0.2)
        * (1 + (has(s, 'Greedy') ? 1.4 : 0) + (has(s, 'Ambitious') ? 1.0 : 0) + (has(s, 'Cunning') ? 0.6 : 0)),
      cost: () => 200,
      pursue: (s) => work(s),
      ready: (s) => s.coins >= 200 && !s.stall,
      finish: (s) => {
        s.coins -= 200; s.stall = true;
        if (['farmer', 'farmhand', 'fisher'].includes(s.job)) E().changeJob(s, 'merchant');
        log(`${s.name.full} counts out 200 nyang and takes a stall on the market street. ${s.sex === 'f' ? 'She' : 'He'} saved for it a coin at a time.`, 'story', s.pos);
      },
    },
    {
      id: 'land', name: 'Own rice land', ko: '전답', icon: '禾', dramatic: false,
      want: (s) => (['farmer', 'farmhand'].includes(s.job) ? 1.1 : 0) * (1 + (has(s, 'Ambitious') ? 0.8 : 0)),
      cost: () => (sys('housing')?.st?.landPrice || 90) + 30,
      pursue: (s) => work(s),
      ready: (s) => s.coins >= (sys('housing')?.st?.landPrice || 90) + 30,
      finish: (s) => {
        // housing.js holds land as a map of owner id -> number of parcels, not a list of plots
        const H = sys('housing'); if (!H?.st?.land) return false;
        const price = H.st.landPrice || 90;
        if (s.coins < price) return false;
        const seller = G.sims.filter((o) => !o.dead && o !== s && !o.household && (H.st.land[o.id] || 0) >= 2)
          .sort((a, b) => a.coins - b.coins)[0];
        s.coins -= price;
        if (seller) { H.st.land[seller.id]--; seller.earn(price); }
        H.st.land[s.id] = (H.st.land[s.id] || 0) + 1;
        delete H.st.tenancy[s.id];
        s.addMoodlet?.('ownland', 'Our own rice field at last', 25, 4320);
        log(`🌾 ${s.name.full} buys a paddy of ${s.sex === 'f' ? 'her' : 'his'} own${seller ? `, bought from ${seller.name.full}` : ''}. No more working another man's field for a share.`, 'story', s.pos);
        return true;
      },
    },
    {
      id: 'roof', name: 'A roof of our own', ko: '내 집', icon: '家', dramatic: false,
      want: (s) => {
        if (!s.home || s.home.virtual) return 1.4;
        if (s.home.owner === s.id) return s.home.tier === 'hut' ? 0.7 : 0;
        return 1.1; // a tenant
      },
      cost: (s) => roofPrice(s),
      pursue: (s) => work(s),
      ready: (s) => s.coins >= roofPrice(s),
      finish: (s) => {
        const H = sys('housing'); if (!H?.startProject) return false;
        const want = roofWant(s);
        // an empty house standing idle is the quickest way in
        const empty = G.world.houses.filter((h) => !h.virtual && h.owner == null && h.tier === want && !(h.residents || []).some((r) => !r.dead));
        if (empty.length) {
          const h = empty[0]; const price = E().houseValue(h);
          if (s.coins < price) return false;
          s.coins -= price; h.owner = s.id;
          const fam = G.sims.filter((o) => !o.dead && o.home === s.home);
          for (const m of fam) { if (s.home?.residents) s.home.residents = s.home.residents.filter((r) => r !== m); m.home = h; h.residents.push(m); }
          log(`${s.name.full} buys a ${want} outright and moves the family in.`, 'story', s.pos);
          return true;
        }
        // already own the roof over their head: rebuild it a tier grander
        if (s.home && !s.home.virtual && s.home.owner === s.id && H.startProject(s, want, { house: s.home }, 'live')) return true;
        // otherwise buy a plot and hire builders
        const free = (G.world.plots || []).filter((p) => !H.st.plots[p.id]).sort((a, b) => H.plotPrice(a) - H.plotPrice(b));
        const pl = free.find((p) => H.plotPrice(p) + H.buildCost(want) <= s.coins);
        if (pl && H.startProject(s, want, { plot: pl }, 'live')) return true;
        return false;
      },
    },
    {
      id: 'letters', name: 'Rise by the classics', ko: '과거급제', icon: '筆', dramatic: true,
      want: (s) => {
        if (s.job === 'official' || (s.factions?.court?.rank || 0) >= 2) return 0;
        const sc = s.skills?.scholarship || 0;
        const base = s.job === 'scholar' ? 1.3 : s.job === 'noble' ? 1.1 : sc > 1.2 ? 0.75 : 0.15;
        return base * (1 + (has(s, 'Scholarly') ? 1.6 : 0) + (has(s, 'Ambitious') ? 0.9 : 0)) * (s.age === 'elder' ? 0.25 : 1);
      },
      pursue: (s) => go(s, spot(s, 'study') || spot(s, 'pavilion'), 'Studying for the examination'),
      ready: (s) => (s.skills?.scholarship || 0) >= 3 && s.job !== 'scholar' && s.job !== 'noble' && s.job !== 'official',
      // reaching Scholarship 3 lets them take up the scholar's life, which is what makes them eligible
      // for the Gwageo at all — the exam itself is still the realm's to grant
      finish: (s) => { E().changeJob(s, 'scholar'); log(`${s.name.full} puts down the hoe and takes up the brush, hoping to sit the Gwageo.`, 'story', s.pos); },
      keepGoing: (s) => (s.skills?.scholarship || 0) < 7 && s.job !== 'official',
    },
    {
      id: 'blade', name: 'Make a name with the sword', ko: '무명', icon: '劍', dramatic: true,
      want: (s) => {
        if (['general', 'king'].includes(s.job)) return 0;
        const sw = s.skills?.sword || 0;
        const base = s.job === 'soldier' ? 1.2 : s.job === 'swordsman' ? 1.3 : sw > 2 ? 0.7 : 0.12;
        return base * (1 + (has(s, 'Brave') ? 1.5 : 0) + (has(s, 'Hot-headed') ? 1.0 : 0) + (has(s, 'Ambitious') ? 0.8 : 0)) * (s.age === 'elder' ? 0.2 : 1);
      },
      pursue: (s) => go(s, spot(s, 'dummy') || spot(s, 'target'), 'Drilling with the sword'),
      ready: (s) => (s.skills?.sword || 0) >= 3 && !['soldier', 'police', 'general'].includes(s.job),
      finish: (s) => { E().changeJob(s, chance(0.5) && honor(s) > 40 ? 'police' : 'soldier'); },
      keepGoing: (s) => (s.skills?.sword || 0) < 7.5 && s.job !== 'general',
    },
    {
      id: 'headman', name: 'Be chosen village headman', ko: '이장', icon: '✦', dramatic: true,
      want: (s) => {
        const O = sys('officials'); if (O?.st?.headman === s.id) return 0;
        if (honor(s) < 45) return 0;
        // only a handful should ever be campaigning: there is one sash
        const running = G.sims.filter((o) => o._amb?.id === 'headman').length;
        if (running >= 4) return 0;
        return (s.age === 'elder' ? 0.5 : 0.3) * (['noble', 'scholar', 'merchant', 'farmer'].includes(s.job) ? 1 : 0.4)
          * (1 + (has(s, 'Ambitious') ? 1.3 : 0) + (has(s, 'Cunning') ? 0.7 : 0) + (has(s, 'Cheerful') ? 0.5 : 0));
      },
      // campaigning is simply being seen and liked: the election already scores honour and goodwill
      pursue: (s) => {
        const near = G.sims.filter((o) => o !== s && !o.dead && !o.hidden && o.faction === 'village' && o.age !== 'child'
          && Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < 55);
        if (!near.length) return go(s, spot(s, 'well') || spot(s, 'platform'), 'Making himself seen in the village');
        const t = near.sort((a, b) => s.getRel(a).f - s.getRel(b).f)[0];
        s.startAction({ type: 'social', target: t, label: `Courting ${t.name.given}'s goodwill` });
        return true;
      },
      ready: (s) => sys('officials')?.st?.headman === s.id,
      finish: (s) => { log(`${s.name.full} wears the headman's sash at last — ${s.sex === 'f' ? 'she' : 'he'} worked the whole valley for it.`, 'story', s.pos); },
      slow: true, // never "completes" by saving; the election decides
    },
    {
      id: 'wed', name: 'Win a particular heart', ko: '혼약', icon: '❀', dramatic: true,
      want: (s) => (s.spouse || s.age === 'elder' ? 0 : 1.5) * (1 + (has(s, 'Romantic') ? 1.8 : 0)),
      begin: (s, a) => {
        // pick someone they actually fancy, rather than the first single in array order
        const H = sys('houses');
        const c = G.sims.filter((o) => own(o) && o !== s && !o.spouse && o.sex !== s.sex && o.age !== 'elder' && o.age !== 'child'
          && !(H?.atFeud && H.atFeud(s, o)));   // no one courts across a family quarrel
        if (!c.length) return false;
        const soc = sys('society');
        const score = (o) => s.getRel(o).r * 2 + s.getRel(o).f + honor(o) * 0.3
          + (soc?.standing ? soc.standing(o) * 25 : 0)   // what the valley says about them counts
          + (o.home?.tier === 'mansion' ? 20 : 0) + Math.random() * 40;
        a.who = c.sort((x, y) => score(y) - score(x))[0].id;
        return true;
      },
      pursue: (s, a) => {
        const t = G.sims.find((o) => o.id === a.who);
        if (!t || t.dead || t.spouse) return false;
        if (Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z) > 60) { s.startAction({ type: 'goto', dest: [t.pos.x, t.pos.z], label: `Going to find ${t.name.given}` }); return true; }
        s.startAction({ type: 'social', target: t, label: `Courting ${t.name.given}` });
        return true;
      },
      ready: (s, a) => {
        const t = G.sims.find((o) => o.id === a.who); if (!t || t.dead || t.spouse) return false;
        // a suitor nobody speaks well of must work harder to be accepted
        const bar = 45 - (sys('society')?.standing?.(s) || 0) * 18;
        return s.getRel(t).r > 55 && t.getRel(s).r > bar;
      },
      finish: (s, a) => {
        const t = G.sims.find((o) => o.id === a.who); if (!t) return false;
        G.director?.wedding?.(s, t);
        log(`${s.name.full} and ${t.name.full} are wed — ${s.sex === 'f' ? 'she' : 'he'} courted ${t.name.given} for ${Math.max(1, G.env.day - (a.day0 || G.env.day))} days.`, 'love', s.pos);
      },
      dead: (s, a) => { const t = G.sims.find((o) => o.id === a.who); return !t || t.dead || (t.spouse && t.spouse !== s); },
    },
    {
      id: 'freedom', name: 'Buy my freedom', ko: '속량', icon: '⛓', dramatic: true,
      want: (s) => (s.job === 'servant' || s.serf ? 4 : 0),
      cost: () => 150,
      pursue: (s) => work(s),
      ready: (s) => s.coins >= 150,
      finish: (s) => {
        const m = G.sims.find((o) => o.id === s.serf?.master);
        s.coins -= 150; if (m) m.earn(150);
        // the same teardown servants.js uses when a bondservant is released
        s.serf = null; s.missionLock = false; s.uniform = null; s.job = 'farmer'; s.rebuildModel?.();
        log(`${s.name.full} counts 150 nyang into ${m ? `${m.name.full}'s` : 'the master\u2019s'} hands and buys ${s.sex === 'f' ? 'her' : 'his'} freedom. ${s.sex === 'f' ? 'She' : 'He'} is nobody's property now.`, 'story', s.pos);
      },
    },
    {
      id: 'shadow', name: 'Take what the world withheld', ko: '밤길', icon: '☾', dramatic: true,
      want: (s) => {
        if (honor(s) > 55) return 0;
        const broke = s.coins < 12 ? 1.6 : 0.2;
        return broke * (1 + (has(s, 'Cunning') ? 1.8 : 0) + (has(s, 'Greedy') ? 0.9 : 0) + (has(s, 'Hot-headed') ? 0.6 : 0));
      },
      cost: () => 320,
      pursue: (s) => {
        const marks = G.sims.filter((o) => o !== s && !o.dead && !o.hidden && o.faction === 'village'
          && o.coins > 40 && Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < 45);
        if (marks.length && chance(0.4)) {
          const v = pick(marks);
          s.startAction({ type: 'goto', dest: [v.pos.x, v.pos.z], label: 'Following someone too closely', then: () => { try { G.pickpocket?.(s, v); } catch {} } });
          return true;
        }
        return work(s);
      },
      ready: (s) => s.coins >= 320,
      finish: (s) => {
        s.coins -= 160;
        E().changeJob(s, 'merchant'); s.stall = true;
        log(`${s.name.full} turns up respectable overnight — a stall, new clothes, and no one asking where the silver came from.`, 'story', s.pos);
      },
    },
  ];

  // what a villager without a roof of their own is reaching for, and what it costs today
  function roofWant(s) {
    const t = s.home && !s.home.virtual ? s.home.tier : null;
    return !t || t === 'hut' ? 'cottage' : 'house';
  }
  function roofPrice(s) {
    const H = sys('housing');
    const want = roofWant(s);
    if (!H?.buildCost) return want === 'cottage' ? 300 : 700;
    const free = (G.world.plots || []).filter((p) => !H.st.plots[p.id]);
    const cheapest = free.length ? Math.min(...free.map((p) => H.plotPrice(p))) : 140;
    return Math.round(H.buildCost(want) + cheapest);
  }

  // a working shift, which is how most ambitions are actually funded
  function work(s) {
    const jw = JOBS[s.job]?.work;
    if (!jw) return false; // without this, `x.def.work !== undefined` would match every idle object
    let best = null, bd = 1e9;
    for (const x of G.world.objects) {
      if (x.def.work !== jw) continue;
      if (x.users.size >= (x.def.cap || 1)) continue;
      const d = Math.hypot(x.x - s.pos.x, x.z - s.pos.z);
      if (d < bd) { bd = d; best = x; }
    }
    if (!best) return false;
    s.startAction({ type: 'use', obj: best, label: best.def.label, work: true });
    return true;
  }

  // ---------------- choosing and keeping an ambition ----------------
  function adopt(s) {
    const opts = [];
    for (const d of LIST) {
      let w = 0; try { w = d.want(s) || 0; } catch { w = 0; }
      if (w > 0) opts.push([d, w]);
    }
    if (!opts.length) return;
    const total = opts.reduce((a, b) => a + b[1], 0);
    let r = Math.random() * total;
    const d = (opts.find(([, w]) => (r -= w) <= 0) || opts[0])[0];
    const a = { id: d.id, day0: G.env.day, saved: 0, tries: 0 };
    if (d.begin && !d.begin(s, a)) return;
    s._amb = a; st.amb[s.id] = a;
    if (d.dramatic && st.logs < 3 && chance(0.5)) {
      st.logs++;
      log(`${s.name.full} has set ${s.sex === 'f' ? 'her' : 'his'} heart on one thing: ${d.name.toLowerCase()}.`, 'story', s.pos);
    }
  }

  function daily() {
    if (st.logDay !== G.env.day) { st.logDay = G.env.day; st.logs = 0; }
    const folk = G.sims.filter(own);
    for (const s of folk) {
      let a = s._amb || st.amb[s.id];
      if (a && !s._amb) s._amb = a;
      if (!a) { if (chance(0.16)) adopt(s); continue; }
      const d = def(a.id);
      if (!d) { s._amb = null; delete st.amb[s.id]; continue; }
      a.days = G.env.day - a.day0;

      // the goal died under them (the one they courted married someone else)
      if (d.dead && d.dead(s, a)) {
        s._amb = null; delete st.amb[s.id]; st.gaveUp++;
        if (chance(0.35)) log(`${s.name.full} gives up on what ${s.sex === 'f' ? 'she' : 'he'} was hoping for. It came to nothing.`, 'story', s.pos);
        continue;
      }
      // A bondservant is paid nothing at all (JOBS.servant.pay is 0) and their labour's fruits go to the
      // master, so without this the goal could never move an inch. Joseon nobi could hold property of
      // their own, and this is that: odd jobs and side work, kept back coin by coin. A kind master
      // leaves them more of it.
      if (a.id === 'freedom' && s.serf) {
        const m = G.sims.find((o) => o.id === s.serf.master);
        const keep = m?.has?.('Gentle') ? 7 : m?.has?.('Greedy') || m?.has?.('Hot-headed') ? 2 : 4;
        s.earn(1 + Math.random() * keep);
        if (s.coins >= 120 && !a.nearly) { a.nearly = true; log(`${s.name.full} is within sight of buying ${s.sex === 'f' ? 'her' : 'his'} freedom.`, 'story', s.pos); }
      }
      // put something by
      const c = d.cost ? d.cost(s) : 0;
      if (c) a.saved = clamp(Math.round(s.coins), 0, c);

      // done?
      let ok = false; try { ok = d.ready(s, a); } catch { ok = false; }
      if (ok) {
        let r = true; try { r = d.finish(s, a); } catch (e) { console.error('[ambition]', a.id, e); r = false; }
        if (r !== false) {
          st.won++; s._amb = null; delete st.amb[s.id];
          s.addMoodlet?.('ambition', 'Reached what I set out for', 22, 2880);
          s.needs.honor = Math.min(100, honor(s) + 8);
          // the ones who keep climbing take the next rung
          if (d.keepGoing && d.keepGoing(s) && chance(0.7)) adopt(s);
        }
        continue;
      }
      // give up on something hopeless, so nobody chases one goal for a lifetime
      const stale = a.days > (d.slow ? 90 : 45) && (!c || s.coins < c * 0.35);
      if (stale && chance(0.25)) {
        s._amb = null; delete st.amb[s.id]; st.gaveUp++;
        if (d.dramatic && chance(0.3)) log(`${s.name.full} lets go of an old hope. Some years just pass.`, 'story', s.pos);
      }
    }
  }

  const S = {
    id: 'ambition', st,
    ambitionOf: (s) => s?._amb || null,
    ambitionDef: def,

    // the hook: claim a villager's next decision to push their own plan forward
    simAction(s) {
      if (!drivable(s)) return false;
      const a = s._amb || st.amb[s.id]; if (!a) return false;
      if (!s._amb) s._amb = a;
      const d = def(a.id); if (!d?.pursue) return false;
      // never at the cost of something urgent — hunger, exhaustion and the small hours come first
      const n = s.needs;
      if (Math.min(n.hunger, n.energy, n.hygiene) < 28) return false;
      const hour = G.env.hour;
      if (hour < 6 || hour > 21) return false;
      // leave room for an ordinary life; a villager who only ever pursued would look like a machine
      const drive = 0.3 + (has(s, 'Ambitious') ? 0.25 : 0) + (has(s, 'Lazy') ? -0.12 : 0);
      if (!chance(clamp(drive, 0.12, 0.7))) return false;
      try { return !!d.pursue(s, a); } catch (e) { console.error('[ambition] pursue', a.id, e); return false; }
    },

    onEvent(name) {
      if (name === 'day') { try { daily(); } catch (e) { console.error('[ambition] daily', e); } }
      if (name === 'ready') {
        // give the valley a head start so lives are already in motion when the player arrives
        for (const s of G.sims.filter(own)) if (chance(0.45)) adopt(s);
      }
    },

    panelHtml(s) {
      const a = s?._amb; if (!a) return '';
      const d = def(a.id); if (!d) return '';
      const c = d.cost ? d.cost(s) : 0;
      const bar = c ? `<div class="ambbar"><i style="width:${clamp(Math.round((s.coins / c) * 100), 0, 100)}%"></i></div><small>${Math.round(Math.min(s.coins, c))} / ${c} nyang put by</small>` : '';
      const who = a.id === 'wed' ? (G.sims.find((o) => o.id === a.who)?.name.full || '') : '';
      return `<div class="facts"><b>${d.icon} Ambition</b> · ${d.name} <span class="ko">${d.ko}</span>${who ? ` — ${who}` : ''}
        <br><small>${Math.max(0, G.env.day - (a.day0 ?? G.env.day))} days in the trying.</small>${bar}</div>`;
    },

    simMenuItems(me, o) {
      if (!me?.household || o === me || !own(o)) return [];
      const a = o._amb; if (!a) return [];
      const d = def(a.id); const c = d?.cost ? d.cost(o) : 0;
      const out = [{ label: `${d.icon} Ask about their hopes`, fn: () => {
        const left = c ? ` ${Math.max(0, c - Math.round(o.coins))} nyang short.` : '';
        G.ui?.toast(`${o.name.given}: "${d.name}. ${Math.max(0, G.env.day - (a.day0 ?? G.env.day))} days now."${left}`);
        o.changeRel?.(me, 3, 0);
      } }];
      if (c && me.coins >= 40) out.push({ label: `🪙 Put 40 nyang toward it`, fn: () => {
        if (me.coins < 40) return; me.coins -= 40; o.earn(40); o.changeRel(me, 14, 2);
        G.ui?.toast(`${o.name.given} will not forget this.`);
        log(`${me.name.full} helps ${o.name.full} toward ${d.name.toLowerCase()}.`, 'story', o.pos);
      } });
      return out;
    },

    status() {
      const live = G.sims.filter((s) => own(s) && s._amb).length;
      return [`${live} villagers are chasing something of their own.`, `${st.won} have got there; ${st.gaveUp} gave up.`];
    },

    serialize() { return { won: st.won, gaveUp: st.gaveUp, amb: Object.fromEntries(G.sims.filter((s) => s._amb).map((s) => [s.id, s._amb])) }; },
    restore(d, get) {
      if (!d) return;
      st.won = d.won || 0; st.gaveUp = d.gaveUp || 0;
      for (const [id, a] of Object.entries(d.amb || {})) { const s = get?.(+id) || G.sims.find((x) => x.id === +id); if (s) { s._amb = a; st.amb[s.id] = a; } }
    },
  };
  return S;
}
