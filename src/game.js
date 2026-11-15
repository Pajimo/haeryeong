import * as THREE from 'three';
import { Sim, Nav } from './sim.js';
import { KINDS } from './buildings.js';
import { JOBS, TRAIT_NAMES, OPPOSED, line, makeName, SURNAMES } from './data.js';
import { rand, rr, pick, chance, clamp, weightedPick } from './noise.js';
import { LAYOUT, groundAt } from './terrain.js';
import { Director } from './director.js';

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, env, world, fx, audio, ui
    this.sims = [];
    this.nav = new Nav(this.world.obbs, this.world.circles);
    this.chronicle = [];
    this.simGrid = new Map();
    this.raidActive = false;
    this.director = new Director(this);
    this.directorAssign = (s) => this.director.assign(s);
    this.timeScale = 1; this.paused = false;
    this.selected = null; this.kills = new Map();
    this.systems = [];
  }

  // ---------- Plugin systems ----------
  // A system is an object with any of:
  //   id, init(G), update(dt, gm), onEvent(name, payload), serialize(), restore(data),
  //   simMenuItems(me, other), objMenuItems(me, obj), animalMenuItems(me, animal), panelHtml(sim)
  get aliveCount() { let n = 0; for (const s of this.sims) if (!s.dead) n++; return n; }
  // How many souls the valley can feed, derived from the houses actually standing rather than a fixed
  // number. The old hard-coded birth gates (105 and 110) sat BELOW the starting population of ~125, so
  // they were false from the first frame and no villager could ever conceive — every child in the game
  // was the player's. Building more houses now genuinely makes room for more families.
  get popCap() {
    let homes = 0;
    for (const h of this.world?.houses || []) if (!h.virtual) homes += h.tier === 'mansion' ? 6 : h.tier === 'house' ? 5 : h.tier === 'cottage' ? 4 : 3;
    return Math.max(120, Math.round(homes + 36)); // + the palace, barracks, temple and bandit camp
  }
  registerSystem(sys) { this.systems.push(sys); sys.init?.(this); return sys; }
  emit(name, payload) { for (const s of this.systems) { try { s.onEvent?.(name, payload); } catch (e) { console.error(`[${s.id}] onEvent ${name}`, e); } } }
  // Lets a system take over a sim's next decision. The first system to return truthy claims the sim,
  // so a villager chasing a long-term ambition acts on it instead of falling back to the need-driven
  // utility AI. Called from Sim.think() after the director has had its turn.
  simAction(s) { for (const sys of this.systems) { try { if (sys.simAction?.(s)) return true; } catch (e) { if (!sys._aerr) { sys._aerr = true; console.error(`[${sys.id}] simAction`, e); } } } return false; }
  menuItems(fn, ...args) { const out = []; for (const s of this.systems) { try { const it = s[fn]?.(...args); if (it) out.push(...it); } catch (e) { console.error(`[${s.id}] ${fn}`, e); } } return out; }
  // add a smart object at runtime (kind must exist in KINDS — systems may add new kinds to KINDS first)
  addObject(kind, x, z, extra = {}) {
    const o = { id: 'x' + (this._xid = (this._xid || 0) + 1), kind, def: KINDS[kind], x, z, face: extra.face || 0, users: new Set(), y: groundAt(x, z), ...extra };
    this.world.objects.push(o); return o;
  }
  removeObject(o) { for (const u of o.users) u.cancelAction(); this.world.objects = this.world.objects.filter((x) => x !== o); }

  log(text, kind = 'info', pos = null) {
    const e = { day: this.env.day, time: this.env.timeLabel, text, kind, pos: pos ? [pos.x ?? pos[0], pos.z ?? pos[1]] : null };
    this.chronicle.unshift(e); if (this.chronicle.length > 200) this.chronicle.pop();
    this.ui?.onChronicle(e);
  }
  bubble(sim, text, kind, dur) { this.ui?.bubble(sim, text, kind, dur); }

  simsNear(x, z) { return this.simGrid.get(Math.floor(x / 8) * 10007 + Math.floor(z / 8)) || []; }
  rebuildGrid() {
    this.simGrid.clear();
    for (const s of this.sims) {
      if (s.dead || s.hidden) continue;
      const ci = Math.floor(s.pos.x / 8), cj = Math.floor(s.pos.z / 8);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const k = i * 10007 + j; if (!this.simGrid.has(k)) this.simGrid.set(k, []); this.simGrid.get(k).push(s);
      }
    }
  }

  randomTraits(n = 3) {
    const out = [];
    while (out.length < n) { const t = pick(TRAIT_NAMES); if (!out.includes(t) && !out.some((o) => OPPOSED[o] === t || OPPOSED[t] === o)) out.push(t); }
    return out;
  }

  spawn(o) {
    const s = new Sim(this, { traits: this.randomTraits(), ...o });
    this.sims.push(s);
    return s;
  }

  virtualHouse(id, door, bedCap = 8, withPot = true) {
    const mk = (kind, x, z, cap) => { const ob = { id: 'v' + id + kind, kind, def: { ...KINDS[kind], cap }, x, z, face: 0, users: new Set(), house: id, y: groundAt(x, z) }; this.world.objects.push(ob); return ob; };
    const h = { id, door, objs: [], residents: [], virtual: true };
    h.objs.push(mk('bed', door[0], door[1], bedCap));
    if (withPot) h.objs.push(mk('cookpot', door[0] + 2, door[1] + 2, 4));
    return h;
  }

  setupHouses() {
    this.vhouses = {
      barracks: this.virtualHouse('barracks', [LAYOUT.palace[0] - 28, LAYOUT.palace[1] - 4], 14),
      temple: this.virtualHouse('temple', [LAYOUT.temple[0] + 2, LAYOUT.temple[1] + 6], 4),
      royal: this.virtualHouse('royal', [LAYOUT.palace[0] + 22, LAYOUT.palace[1] - 18], 8),
      police: this.virtualHouse('police', [this.world.spots.police[0] + 3, this.world.spots.police[1] - 3], 8),
    };
  }
  houseById(id) { return this.vhouses[id] || this.world.houses.find((h) => h.id === id) || null; }

  populate() {
    const W = this.world;
    const houses = W.houses.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const around = (h) => ({ x: h.door[0] + rr(-2, 2), z: h.door[1] + rr(-2, 2) });
    // --- Player household: closest house to plaza ---
    const ph = houses[0];
    const sur = pick(SURNAMES);
    const hero = this.spawn({ sex: 'm', age: 'young', job: 'swordsman', home: ph, household: true, surname: sur, traits: ['Brave', 'Loyal', 'Romantic'], coins: 60, skillSword: 6.5, ...around(ph) });
    const sister = this.spawn({ sex: 'f', age: 'young', job: 'hunter', home: ph, household: true, surname: sur, traits: ['Cheerful', 'Hot-headed', 'Ambitious'], ...around(ph), armed: true });
    const grandma = this.spawn({ sex: 'f', age: 'elder', job: 'innkeeper', home: ph, household: true, surname: sur, married: true, traits: ['Gentle', 'Pious', 'Cunning'], ...around(ph) });
    for (const a of [hero, sister, grandma]) for (const b of [hero, sister, grandma]) if (a !== b) { const r = a.getRel(b); r.f = 65; r.met = true; }
    ph.residents.push(hero, sister, grandma); this.household = [hero, sister, grandma];
    this.homeHouse = ph;

    // --- Villagers ---
    const jobsPool = ['farmer', 'farmer', 'farmer', 'farmer', 'farmer', 'merchant', 'merchant', 'merchant', 'merchant', 'innkeeper', 'scholar', 'scholar', 'hunter', 'farmer', 'merchant', 'swordsman', 'farmer'];
    for (const h of houses.slice(1)) {
      const fam = pick(SURNAMES);
      const n = h.tier === 'mansion' ? 3 + (chance(0.5) ? 1 : 0) : h.tier === 'hut' ? (chance(0.5) ? 1 : 2) : h.noble ? (chance(0.6) ? 2 : 3) : (chance(0.35) ? 1 : chance(0.75) ? 2 : 3);
      const members = [];
      const couple = n >= 2 && chance(0.75);
      for (let i = 0; i < n; i++) {
        const sex = couple && i < 2 ? (i === 0 ? 'm' : 'f') : chance(0.5) ? 'm' : 'f';
        const age = couple && i < 2 ? (chance(0.25) ? 'elder' : 'adult') : chance(0.75) ? 'young' : 'adult';
        let job = h.noble ? (i === 0 ? 'noble' : chance(0.4) ? 'scholar' : 'noble') : pick(jobsPool);
        if (sex === 'f' && job === 'swordsman' && chance(0.5)) job = 'merchant';
        if (h.tier === 'hut' && ['merchant', 'scholar', 'innkeeper'].includes(job)) job = 'farmer';
        const s = this.spawn({ sex, age, job, home: h, surname: fam, married: couple && i < 2, ...around(h) });
        if (h.tier === 'hut') s.coins = rr(2, 15); else if (h.tier === 'house') s.coins = (s.coins || 20) + rr(40, 120); else if (h.tier === 'mansion') { s.coins = (s.coins || 20) + rr(250, 600); if (i === 0) s.finery = pick([{ top: '#f2e6cc', bottom: '#3c5d8c', robe: '#2d4a6b' }, { top: '#e8f0d8', bottom: '#7a2a2a', robe: '#5a2a3a' }]); }
        members.push(s); h.residents.push(s);
      }
      for (const a of members) for (const b of members) if (a !== b) { const r = a.getRel(b); r.f = rr(35, 75); r.met = true; }
      if (couple) { const [a, b] = members; a.spouse = b; b.spouse = a; a.getRel(b).r = rr(60, 95); b.getRel(a).r = a.getRel(b).r; }
    }
    // --- Palace: soldiers, general, nobles at court ---
    const barracks = this.vhouses.barracks;
    const gen = this.spawn({ sex: 'm', age: 'adult', job: 'general', home: barracks, x: LAYOUT.palace[0], z: LAYOUT.palace[1] + 10, traits: ['Brave', 'Loyal', 'Ambitious'] });
    for (let i = 0; i < 9; i++) {
      const s = this.spawn({ sex: chance(0.85) ? 'm' : 'f', age: chance(0.7) ? 'young' : 'adult', job: 'soldier', home: barracks, x: LAYOUT.palace[0] + rr(-20, 20), z: LAYOUT.palace[1] + rr(5, 30) });
      s.getRel(gen).f = 40; gen.getRel(s).f = 30;
    }
    // --- Podocheong constables ---
    for (let i = 0; i < 6; i++) { const [qx, qz] = this.world.spots.police; const c = this.spawn({ sex: chance(0.85) ? 'm' : 'f', age: i === 0 ? 'adult' : chance(0.6) ? 'young' : 'adult', job: 'police', home: this.vhouses.police, x: qx + rr(-4, 4), z: qz + rr(-2, 6), traits: [i === 0 ? 'Loyal' : pick(['Brave', 'Loyal', 'Hot-headed']), pick(['Ambitious', 'Gentle', 'Cunning'])] }); if (i === 0) { c.policeChief = true; c.skills.sword = 7; } }
    // --- Temple monks ---
    const temple = this.vhouses.temple;
    for (let i = 0; i < 2; i++) this.spawn({ sex: 'm', age: i ? 'elder' : 'adult', job: 'monk', home: temple, x: LAYOUT.temple[0] + rr(-6, 6), z: LAYOUT.temple[1] + rr(-6, 6), traits: ['Pious', 'Gentle', chance(0.5) ? 'Scholarly' : 'Loyal'] });
    // --- Royal family ---
    const royal = this.vhouses.royal; const [px, pz] = LAYOUT.palace;
    const rs = pick(SURNAMES.slice(0, 3));
    const king = this.spawn({ sex: 'm', age: chance(0.5) ? 'adult' : 'elder', job: 'king', home: royal, surname: ['Yi', '이'], x: px, z: pz, married: true, traits: [pick(['Ambitious', 'Gentle', 'Pious']), pick(['Loyal', 'Cunning', 'Scholarly']), 'Brave'].filter((v, i, a) => a.indexOf(v) === i), coins: 2000, skillSword: 6 });
    const queen = this.spawn({ sex: 'f', age: 'adult', job: 'queen', home: royal, surname: [rs[0], rs[1]], x: px + 3, z: pz, married: true, coins: 500 });
    king.spouse = queen; queen.spouse = king; king.getRel(queen).r = 70; queen.getRel(king).r = 70; king.getRel(queen).f = 50; queen.getRel(king).f = 50;
    const kids = [];
    if (chance(0.7)) kids.push(this.spawn({ sex: 'm', age: 'young', job: 'prince', home: royal, surname: ['Yi', '이'], x: px - 3, z: pz + 4, parents: [king, queen], generation: 2 }));
    kids.push(this.spawn({ sex: 'f', age: 'young', job: 'princess', home: royal, surname: ['Yi', '이'], x: px + 4, z: pz + 4, parents: [king, queen], generation: 2 }));
    for (const k of kids) { king.children.push(k); queen.children.push(k); for (const p of [king, queen]) { p.getRel(k).f = 70; k.getRel(p).f = 60; p.getRel(k).met = k.getRel(p).met = true; } }
    royal.residents.push(king, queen, ...kids);
    this.king = king;
    // --- Bandits ---
    this.spawnBandits(7);
    const chief = this.sims.filter((s) => s.faction === 'bandit')[0];
    chief.skills.sword = 8; chief.maxHp = 180; chief.hp = 180; chief.isChief = true;
    this.banditChief = chief;
    // --- random relationships across village ---
    const vil = this.sims.filter((s) => s.faction === 'village');
    for (let i = 0; i < 60; i++) {
      const a = pick(vil), b = pick(vil); if (a === b) continue;
      const v = chance(0.75) ? rr(10, 45) : rr(-55, -25);
      a.changeRel(b, v);
    }
    // a hero rival
    const rival = vil.find((s) => s.fighter && !s.household && s.job !== 'general');
    if (rival) { hero.changeRel(rival, -45); this.log(`${hero.name.full} and ${rival.name.full} have hated each other since a duel years ago.`, 'story'); }
    this.log(`His Majesty King ${king.name.given} reigns from the palace of Haeryeong.`, 'story');
    this.log({ spring: 'Spring blossoms open across the valley of Haeryeong.', summer: 'The long summer days settle over the valley of Haeryeong.', autumn: 'The autumn harvest has begun in the valley of Haeryeong.', winter: 'Snow blankets the valley of Haeryeong.' }[this.seasons?.current.key || 'autumn'], 'story');
    this.factions?.assignInitial();
  }

  spawnBandits(n) {
    const [bx, bz] = LAYOUT.banditCamp; const out = [];
    for (let i = 0; i < n; i++) out.push(this.spawn({ sex: chance(0.85) ? 'm' : 'f', age: chance(0.7) ? 'young' : 'adult', job: 'bandit', faction: 'bandit', x: bx + rr(-8, 8), z: bz + rr(-8, 8), traits: this.randomTraits().map((t) => (t === 'Gentle' ? 'Cunning' : t)) }));
    for (const a of out) for (const b of out) if (a !== b) { a.getRel(b).f = rr(20, 50); a.getRel(b).met = true; }
    return out;
  }

  // ---------- Social exchange ----------
  socialExchange(sp, li, convo, forced) {
    const r = sp.getRel(li);
    const eligible = sp.sex !== li.sex && sp.age !== 'elder' && li.age !== 'elder' && (!sp.spouse || sp.spouse === li) && (!li.spouse || li.spouse === sp);
    let kind = forced;
    if (!kind) {
      if (convo.turn === 0) kind = 'greet';
      else {
        const W = {
          chat: 3,
          joke: sp.has('Cheerful') ? 2 : 0.7,
          gossip: sp.has('Cunning') ? 2 : 0.7,
          compliment: (r.f > 10 ? 1.1 : 0.4) * (sp.has('Gentle') ? 2 : 1),
          flirt: eligible && r.f > 0 ? (sp.has('Romantic') ? 2 : 0.6) * (r.r > 20 ? 2 : 0.6) : 0,
          insult: (sp.has('Hot-headed') ? 0.9 : 0.06) + (r.f < -20 ? 1.4 : 0) + (sp.has('Cunning') ? 0.2 : 0),
          challenge: r.f < -40 && sp.fighter && li.fighter && (sp.has('Hot-headed') || sp.has('Brave') || sp.has('Ambitious')) && !this.raidActive ? 1.2 : 0,
          comfort: li.mood < -15 ? 2.2 : 0,
          propose: eligible && !sp.spouse && !li.spouse && r.r >= 75 && r.f >= 45 ? 4 : 0,
          tryBaby: sp.spouse === li && r.r > 45 && ![sp, li].some((x) => x.pregnant || x.age === 'elder') && (sp.children?.length || 0) < 4 && !this.raidActive && this.aliveCount < this.popCap ? 1.2 : 0,
        };
        kind = weightedPick(Object.keys(W), (k) => W[k]);
      }
    }
    const ch = 1 + sp.skills.charisma * 0.06;
    const setA = (s, a) => { if (!s.controlled) { s.char.setAnim(a, 10); } };
    switch (kind) {
      case 'greet': {
        const bowing = li.job === 'noble' || li.job === 'general' || li.age === 'elder';
        sp.say(bowing ? line('bow') : line('greet', li.name.given), 'talk'); setA(sp, bowing ? 'bow' : 'talk');
        sp.changeRel(li, 1.5); break;
      }
      case 'chat': sp.say(line('chat'), 'talk'); setA(sp, 'talk'); sp.changeRel(li, 2.5 * ch); sp.needs.fun += 3; break;
      case 'joke': {
        sp.say(line('joke'), 'talk'); setA(sp, 'talk');
        if (li.has('Cheerful') || r.f > 15 || chance(0.5)) { setTimeout(() => { li.say(line('laugh'), 'happy'); setA(li, 'laugh'); }, 1200); sp.changeRel(li, 5 * ch); li.needs.fun += 10; sp.needs.fun += 6; }
        else { setTimeout(() => li.say('…That is not funny.', 'talk'), 1200); sp.changeRel(li, -2); }
        break;
      }
      case 'gossip': {
        const others = [...sp.rel.keys()].map((id) => this.sims.find((s) => s.id === id)).filter((s) => s && s !== li && !s.dead);
        const o = others.length ? pick(others) : null;
        sp.say(o ? line('gossip', li.name.given, o.name.given) : line('chat'), 'talk'); setA(sp, 'talk');
        sp.changeRel(li, 3); if (o) li.changeRel(o, -4);
        break;
      }
      case 'compliment': sp.say(line('compliment', li.name.given), 'happy'); setA(sp, 'talk'); setA(li, 'bow'); sp.changeRel(li, 6 * ch); li.addMoodlet('complimented', 'Received a compliment', 6, 120); break;
      case 'flirt': {
        sp.say(line('flirt'), 'love'); setA(sp, 'flirt');
        const accept = rand() < 0.25 + r.f / 150 + r.r / 120 + (li.has('Romantic') ? 0.25 : 0);
        setTimeout(() => {
          if (sp.dead || li.dead) return;
          if (accept) { li.say(chance(0.5) ? '(blushes)' : 'You… flatter me.', 'love'); setA(li, 'flirt'); sp.changeRel(li, 4, 10); sp.addMoodlet('flirty', 'Feeling flirty', 10, 180); li.addMoodlet('flirty', 'Feeling flirty', 10, 180); }
          else { li.say(line('flirtBad'), 'angry'); setA(li, 'angry'); sp.changeRel(li, -5); sp.addMoodlet('rejected', 'Rejected', -12, 240); }
        }, 1300);
        break;
      }
      case 'insult': {
        sp.say(line('insult', li.name.given), 'angry'); setA(sp, 'angry');
        setTimeout(() => { li.say(line('angry'), 'angry'); setA(li, 'angry'); }, 1200);
        sp.changeRel(li, -12); li.addMoodlet('insulted', `Insulted by ${sp.name.given}`, -14, 240); li.needs.honor -= 8;
        // escalate?
        if (li.fighter && sp.fighter && (li.has('Hot-headed') || li.getRel(sp).f < -50) && chance(0.4) && !this.raidActive) this.startDuel(li, sp);
        break;
      }
      case 'challenge': sp.say(line('challenge', li.name.given), 'shout'); setA(sp, 'angry'); this.startDuel(sp, li); break;
      case 'comfort': sp.say(line('comfort', li.name.given), 'happy'); setA(sp, 'talk'); setA(li, 'sad'); sp.changeRel(li, 7); li.addMoodlet('comforted', 'Comforted by a friend', 12, 240); break;
      case 'propose': {
        sp.say('Will you share my home and my life?', 'love'); setA(sp, 'kneel');
        const yes = rand() < 0.55 + r.r / 200;
        setTimeout(() => {
          if (sp.dead || li.dead) return;
          if (yes) { li.say('Yes… a thousand times yes.', 'love'); setA(li, 'cheer'); this.director.wedding(sp, li); }
          else { li.say('I… cannot. Forgive me.', 'sad'); sp.changeRel(li, -10, -20); sp.addMoodlet('heartbroken', 'Heartbroken', -25, 600); }
        }, 1800);
        break;
      }
      case 'deep': break; // LLM driven elsewhere
      case 'tryBaby': this.tryForBaby(sp, li); setA(sp, 'flirt'); setA(li, 'flirt'); break;
      case 'steal': this.pickpocket(sp, li); break;
    }
    for (const s of [sp, li]) for (const k of ['fun', 'social', 'honor']) s.needs[k] = clamp(s.needs[k], 0, 100);
    if (convo) convo.lastKind = kind;
    this.ui?.onSocial(sp, li, kind);
    this.factions?.notify(sp, { type: 'social', kind, target: li });
    this.factions?.notify(sp, { type: 'talk', target: li }); this.factions?.notify(li, { type: 'talk', target: sp });
    return kind;
  }

  pickpocket(thief, v) {
    const chanceOk = 0.45 + thief.skills.charisma * 0.04 + (thief.has('Cunning') ? 0.15 : 0) - (v.has('Cunning') ? 0.15 : 0);
    if (Math.random() < chanceOk) {
      const n = Math.min(v.coins, Math.ceil(rr(3, 12)));
      v.coins -= n; thief.earn(n); thief.say(`(slips away with ${n} nyang)`, 'talk');
      this.factions?.notify(thief, { type: 'steal' });
      this.emit('steal', { thief, victim: v });
    } else {
      v.say('Thief! THIEF!', 'shout'); v.changeRel(thief, -30); thief.needs.honor = Math.max(0, thief.needs.honor - 15);
      if (!thief.outlaw) { thief.outlaw = true; this.log(`${thief.name.full} was caught picking ${v.name.full}'s pocket!`, 'danger', thief.pos); }
      this.economy?.commitCrime(thief, 25, thief.household ? 'pickpocketing' : null);
      for (const g of this.sims) if ((g.job === 'police' || ((g.job === 'soldier' || g.job === 'general') && g.pos.distanceTo(thief.pos) < 25)) && !g.dead && !g.combat.target && g.pos.distanceTo(thief.pos) < 45 && !g.controlled) { g.startFight(thief, true); g.arresting = thief; }
    }
  }

  startDuel(a, b) {
    if (a.dead || b.dead || a.combat.target || b.combat.target) return;
    a.startFight(b, true); if (!b.controlled) b.startFight(a, true); else b.combat.target = a, b.combat.nonlethal = true;
    this.log(`${a.name.full} challenged ${b.name.full} to a duel of honor!`, 'duel', a.pos);
    this.audio?.drum();
  }

  // ---------- Combat resolution ----------
  resolveHit(att, at) {
    const heavy = at.kind === 'heavy';
    const reach = heavy ? 2.9 : 2.6;
    const fx = Math.sin(att.heading), fz = Math.cos(att.heading);
    const victims = [];
    for (const s of this.sims) {
      if (s === att || s.dead || s.hidden) continue;
      const dx = s.pos.x - att.pos.x, dz = s.pos.z - att.pos.z; const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < 0.35) continue;
      const intended = att.combat.target === s || s.combat.target === att || att.isHostile(s) || att.controlled;
      if (!intended) continue;
      victims.push([d, s]);
    }
    // animals in the arc
    for (const an of this.animals?.list || []) {
      if (an.dead || an.owner === att) continue;
      const dx = an.pos.x - att.pos.x, dz = an.pos.z - att.pos.z; const d = Math.hypot(dx, dz);
      if (d > reach + 0.4 || (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      if (att.controlled || att.combat.target === an) { this.animals.hit(att, an, heavy); if (!heavy) return; }
    }
    victims.sort((a, b) => a[0] - b[0]);
    const hits = victims.slice(0, heavy ? 2 : 1);
    if (!hits.length) return;
    for (const [, v] of hits) this.applyHit(att, v, heavy);
  }

  applyHit(att, v, heavy) {
    const vc = v.combat; const ac = att.combat;
    const mid = v.pos.clone(); mid.y += 1.25;
    const toAtt = Math.atan2(att.pos.x - v.pos.x, att.pos.z - v.pos.z);
    const facing = Math.abs(((toAtt - v.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.5;
    const playerInvolved = att.controlled || v.controlled;
    if (vc.dodgeT > 0.08) { if (playerInvolved) this.ui?.floatText(v, 'Dodged', '#cde'); return; }
    if (vc.blocking && facing) {
      const parry = !heavy && performance.now() - vc.blockStart < 230;
      if (parry) {
        ac.staggerT = 1.0; ac.atk = null; att.char.atkStage = null; this.fx?.endTrail(att);
        this.fx?.sparks(mid, 34, 1.6); this.audio?.clash(mid, true);
        if (playerInvolved) { this.ui?.floatText(v, 'PARRY!', '#ffd76a'); this.hitStop?.(0.12, 0.25); }
        v.skills.sword = Math.min(10, v.skills.sword + 0.03);
        return;
      }
      if (heavy || v.stamina < 15) {
        vc.blocking = false; vc.staggerT = 0.85; v.stamina = 0;
        this.fx?.sparks(mid, 20, 1.2); this.audio?.clash(mid, false);
        if (playerInvolved) this.ui?.floatText(v, 'Guard Broken', '#f9a');
        return;
      }
      v.stamina -= 16; this.fx?.sparks(mid, 12, 0.8); this.audio?.clash(mid, false);
      const ang = Math.atan2(v.pos.x - att.pos.x, v.pos.z - att.pos.z); const nx = v.pos.x + Math.sin(ang) * 0.35, nz = v.pos.z + Math.cos(ang) * 0.35;
      if (!this.nav.blocked(nx, nz, 0.3)) { v.pos.x = nx; v.pos.z = nz; }
      return;
    }
    // clean hit
    let dmg = (heavy ? 30 : 14) * (0.75 + att.skills.sword * 0.06) * rr(0.85, 1.15);
    if (vc.atk && vc.atk.stage === 'wind') { vc.atk = null; v.char.atkStage = null; dmg *= 1.2; }
    if (!facing) dmg *= 1.35;
    if (att.missionHero) dmg *= 1.9; if (v.missionHero) dmg *= 0.42;
    v.hp -= dmg; vc.hitT = heavy ? 0.55 : 0.32; vc.blocking = false;
    if (heavy) vc.staggerT = 0.5;
    { const kb = (heavy ? 0.8 : 0.3) * (v.mount ? 0.3 : 1), nx = v.pos.x + Math.sin(att.heading) * kb, nz = v.pos.z + Math.cos(att.heading) * kb; if (!this.nav.blocked(nx, nz, 0.3)) { v.pos.x = nx; v.pos.z = nz; } }
    this.fx?.blood(mid, heavy ? 22 : 12, att.heading); this.audio?.hit(mid, heavy);
    if (playerInvolved) { this.hitStop?.(heavy ? 0.09 : 0.05, heavy ? 0.35 : 0.18); this.ui?.floatText(v, Math.round(dmg).toString(), heavy ? '#ff7a5a' : '#ffd0c0'); }
    if (chance(0.3)) v.say(line('hurt'), 'shout', 1.2);
    att.skills.sword = Math.min(10, att.skills.sword + 0.02);
    // crimes: attacking a non-hostile villager outside a duel
    const lawful = att.isHostile(v) || (ac.target === v && ac.nonlethal) || v.combat.target === att;
    if (!lawful && att.faction !== 'bandit' && v.faction !== 'bandit' && !v.outlaw) {
      if (!att.outlaw) { att.outlaw = true; this.log(`${att.name.full} attacked ${v.name.full} without cause! The guards are coming.`, 'danger', att.pos); }
      this.economy?.commitCrime(att, 60, null);
      for (const s of this.sims) if (s.job === 'police' || s.job === 'soldier' || s.job === 'general') { if (!s.dead && !s.combat.target && s.pos.distanceTo(att.pos) < 70 && !s.controlled) { s.startFight(att, true); s.arresting = att; } }
      for (const s of this.sims) if (!s.dead && s !== att) s.getRel(att).f -= 15;
    }
    // victim response
    if (!v.controlled && v.action?.type !== 'fight' && v.hp > 0) {
      if (v.fighter || v.has('Brave') || v.has('Hot-headed')) v.startFight(att, ac.nonlethal);
      else { v.cancelAction(); v.startAction({ type: 'flee', dest: v.home?.door || [0, 0], label: 'Fleeing!' }); }
    }
    if (ac.nonlethal && ac.target === v && v.hp < v.maxHp * 0.25) {
      v.hp = Math.max(v.hp, 5);
      this.duelResult(att, v); return;
    }
    if (v.hp <= 0) {
      v.die(att);
      this.kills.set(att.id, (this.kills.get(att.id) || 0) + 1);
      if (playerInvolved) this.hitStop?.(0.25, 0.65, true);
    }
  }

  duelResult(win, lose) {
    if (!lose.controlled) { lose.endFight(); lose.cancelAction(); lose.action = { type: 'yield', t: 0, phase: 'do', label: 'Yielding' }; lose.say('I yield! I yield!', 'shout'); }
    else { lose.endFight(); }
    win.endFight(); if (!win.controlled) { win.cancelAction(); win.char.setAnim('cheer'); }
    win.say(line('victory'), 'shout');
    win.needs.honor = clamp(win.needs.honor + 35, 0, 100); lose.needs.honor = clamp(lose.needs.honor - 25, 0, 100);
    win.addMoodlet('victor', 'Won a duel', 20, 600); lose.addMoodlet('defeated', 'Lost a duel', -20, 600);
    win.changeRel(lose, chance(0.4) ? 15 : -5);
    win.coins += 10; lose.coins = Math.max(0, lose.coins - 10);
    this.log(`${win.name.full} defeated ${lose.name.full} in single combat. ${pick(['The village will speak of it for weeks.', 'Honor is satisfied.', 'Blood was spilled, but not lives.', 'The crowd roared.'])}`, 'duel', win.pos);
    this.director.onDuel?.(win, lose);
    if (lose.outlaw && (win.job === 'police' || win.job === 'soldier' || win.job === 'general' || win.arresting === lose)) { win.arresting = null; this.economy?.jail(lose, win); }
    this.factions?.notify(win, { type: 'duelWin' });
    this.emit('duel', { winner: win, loser: lose });
  }

  onDeath(s, killer) {
    const where = s.pos.clone();
    if (s.faction !== 'village') {
      if (killer) { killer.needs.honor = clamp(killer.needs.honor + 25, 0, 100); killer.coins += Math.floor(rr(5, 25)); killer.addMoodlet('hero', 'Slew a bandit', 15, 480); }
      this.log(`${s.isChief ? 'The bandit chief ' : 'The bandit '}${s.name.full} was slain${killer ? ' by ' + killer.name.full : ''}.`, 'combat', where);
      if (s.isChief) this.log('With their chief dead, the bandits of the western woods are leaderless.', 'story');
    } else {
      if (s.deathCause) this.log(`${s.name.full} has died — ${s.deathCause}. ${pick(['The village mourns.', 'White mourning robes are hung.', 'Their family weeps.'])}`, 'death', where);
      else this.log(s.naturalDeath ? `${s.name.full} passed away peacefully in old age, surrounded by family. ${s.children?.length ? 'They leave ' + s.children.length + ' child' + (s.children.length > 1 ? 'ren' : '') + ' behind.' : ''}` : `${s.name.full}, ${s.title.toLowerCase()} of Haeryeong, has died${killer ? ' at the hands of ' + killer.name.full : ''}. ${pick(['The village mourns.', 'White mourning robes are hung.', 'Their family weeps.'])}`, 'death', where);
      for (const o of this.sims) {
        if (o.dead || o === s) continue;
        const r = o.getRel(s);
        if (o.spouse === s) { o.addMoodlet('grief', `Mourning ${s.name.given}`, -45, 2880); o.spouse = null; }
        else if (r.f > 30) o.addMoodlet('grief' + s.id, `Grieving ${s.name.given}`, -20, 1440);
        if (killer && r.f > 30 && o !== killer) o.changeRel(killer, -30);
      }
      if (s.home) s.home.residents = s.home.residents.filter((x) => x !== s);
    }
    if (killer) this.factions?.notify(killer, { type: 'kill', victim: s });
    if (killer && s.faction !== 'bandit' && killer.faction !== 'bandit' && !s.outlaw && !killer.isAssassin && !['police', 'soldier', 'general'].includes(killer.job)) this.economy?.commitCrime(killer, 150, `the murder of ${s.name.full}`);
    this.emit('death', { sim: s, killer });
    if (s.job === 'king') this.succession(s, killer);
    this.checkLegacy(s);
    if (this.selected === s) this.ui?.onSelect(s);
  }

  // ---------- Life cycle & generations ----------
  ageUp(s) {
    const order = ['child', 'young', 'adult', 'elder'];
    const next = order[order.indexOf(s.age) + 1]; if (!next) return;
    s.age = next; s.ageDays = 0;
    if (s.job === 'child') {
      const par = s.parents.find((p) => p && p.job) || null;
      const royalKid = s.parents.some((p) => p && (p.job === 'king' || p.job === 'queen'));
      if (royalKid) s.job = s.sex === 'm' && !this.sims.some((x) => x.job === 'prince' && !x.dead) ? 'prince' : s.sex === 'm' ? 'noble' : 'princess';
      else if (par && ['noble', 'official', 'scholar'].includes(par.job)) s.job = pick(['noble', 'scholar']);
      else s.job = par && chance(0.5) && !['innkeeper', 'monk', 'general', 'bandit', 'queen'].includes(par.job) ? par.job : pick(['farmer', 'merchant', 'scholar', 'swordsman', 'hunter', 'fisher', 'farmer']);
      if (s.job === 'swordsman' || s.job === 'hunter') s.armed = true;
      s.maxHp = 100 + (JOBS[s.job].fighter ? 30 : 0) + s.skills.sword * 4; s.hp = s.maxHp;
      this.log(`${s.name.full} has come of age and becomes a ${JOBS[s.job].title.toLowerCase()}.`, 'story', s.pos);
    } else if (next === 'elder') this.log(`${s.name.full}'s hair has turned silver. ${pick(['Wisdom comes with the years.', 'The grandchildren gather around.', 'They walk a little slower now.'])}`, 'story', s.pos);
    else if (s.household) this.log(`${s.name.full} grows into adulthood.`, 'story', s.pos);
    s.addMoodlet('birthday', 'Birthday!', 15, 600);
    s.rebuildModel();
    this.emit('cameOfAge', { sim: s, age: next });
    if (s.household) this.ui?.refreshHousehold();
  }

  oldAgeDeath(s) {
    s.naturalDeath = true;
    s.die(null);
  }

  tryForBaby(a, b) {
    const mom = a.sex === 'f' ? a : b.sex === 'f' ? b : null; const dad = mom === a ? b : a;
    if (!mom || mom === dad || mom.pregnant || mom.age === 'elder' || mom.age === 'child' || dad.age === 'child') return false;
    a.say(pick(['Shall we… go inside for a while?', 'Our house feels quiet, doesn’t it?', '(whispers something)']), 'love');
    a.addMoodlet('romance', 'Romantic evening', 20, 480); b.addMoodlet('romance', 'Romantic evening', 20, 480);
    a.changeRel(b, 5, 6);
    if (Math.random() < 0.6) {
      mom.pregnant = { t: 0, father: dad }; mom.char.setPregnant(true);
      mom.addMoodlet('expecting', 'Expecting a child', 20, 2880);
      if (mom.household || dad.household || mom.job === 'queen' || chance(0.3)) this.log(`${mom.name.full} and ${dad.name.full} are expecting a child!`, 'love', mom.pos);
      return true;
    }
    return false;
  }

  giveBirth(mom) {
    const dad = mom.pregnant.father && !mom.pregnant.father.removed ? mom.pregnant.father : null;
    mom.pregnant = null; mom.char.setPregnant(false);
    const sex = chance(0.5) ? 'm' : 'f';
    const sur = dad ? [dad.name.surname, dad.name.hangul[0]] : [mom.name.surname, mom.name.hangul[0]];
    const home = mom.home || dad?.home;
    const kid = this.spawn({ sex, age: 'child', job: 'child', home, surname: sur, household: mom.household || !!dad?.household, x: mom.pos.x + 0.8, z: mom.pos.z + 0.8, parents: [mom, dad].filter(Boolean), generation: Math.max(mom.generation, dad?.generation || 1) + 1, ageDays: 0, coins: 0, traits: this.inheritTraits(mom, dad) });
    kid.look = { skin: (chance(0.5) || !dad ? mom : dad).char.o.skin, hair: '#141110' }; kid.rebuildModel();
    for (const p of [mom, dad]) if (p) { p.children.push(kid); p.getRel(kid).f = 80; kid.getRel(p).f = 70; p.getRel(kid).met = kid.getRel(p).met = true; p.addMoodlet('newbaby', 'A new baby!', 30, 1440); }
    for (const sib of [...(mom.children || [])]) if (sib !== kid) { sib.getRel(kid).f = 40; kid.getRel(sib).f = 40; sib.getRel(kid).met = kid.getRel(sib).met = true; }
    if (home) home.residents.push(kid);
    if (kid.household) { this.household.push(kid); this.ui?.refreshHousehold(); }
    const royal = mom.job === 'queen' || dad?.job === 'king';
    this.log(`${royal ? 'Joy in the palace! ' : ''}A ${sex === 'm' ? 'son' : 'daughter'}, ${kid.name.full} (${kid.name.hangul}), is born to ${mom.name.full}${dad ? ' and ' + dad.name.full : ''}. Generation ${kid.generation} of the ${kid.name.surname} line.`, 'love', mom.pos);
    mom.say('Welcome to the world, little one…', 'love', 5);
    this.emit('birth', { child: kid, mother: mom, father: dad });
    return kid;
  }

  inheritTraits(a, b) {
    const pool = [...(a?.traits || []), ...(b?.traits || [])];
    const out = [];
    for (const t of pool) if (chance(0.45) && !out.includes(t) && out.length < 2) out.push(t);
    while (out.length < 3) { const t = pick(TRAIT_NAMES); if (!out.includes(t) && !out.some((o) => OPPOSED[o] === t || OPPOSED[t] === o)) out.push(t); }
    return out;
  }

  // when the household dwindles, the line continues through kin
  checkLegacy(dead) {
    if (!dead.household) return;
    dead.household = false;
    this.household = this.household.filter((s) => !s.dead);
    if (this.household.length) { if (this.selected === dead) this.select(this.household[0]); this.ui?.refreshHousehold(); return; }
    // find heirs: children, then spouse, then siblings
    const heirs = [...(dead.children || []), dead.spouse, ...this.sims.filter((s) => s.parents.some((p) => dead.parents.includes(p)))].filter((s) => s && !s.dead);
    if (heirs.length) {
      const fam = [...new Set(heirs)];
      for (const h of fam) h.household = true;
      this.household = fam;
      this.log(`The ${dead.name.surname} line continues through ${fam.map((h) => h.name.full).join(', ')}.`, 'story');
      this.select(fam[0]); this.ui?.refreshHousehold();
    } else {
      this.log(`The last of the ${dead.name.surname} line has passed. Choose a new family to follow.`, 'death');
      this.ui?.openLegacyPicker();
    }
  }

  adoptHousehold(sim) {
    const fam = sim.home ? sim.home.residents.filter((s) => !s.dead) : [sim];
    for (const s of this.household) s.household = false;
    for (const s of fam) s.household = true;
    this.household = fam;
    this.log(`You now guide the ${sim.name.surname} family.`, 'story', sim.pos);
    this.select(sim); this.ui?.refreshHousehold();
  }

  // ---------- Royal succession ----------
  succession(oldKing, killer) {
    const alive = (s) => s && !s.dead && !s.removed;
    let heir = null; let how = '';
    if (killer && killer.factions?.lotus && (killer.household || this.factions?.leader('lotus') === killer)) { heir = killer; how = `seized the throne in a bloody coup, the Black Lotus at their back`; }
    if (!heir) { heir = this.sims.find((s) => s.job === 'prince' && alive(s)); if (heir) how = 'ascends as the rightful Crown Prince'; }
    if (!heir) { const pr = this.sims.find((s) => s.job === 'princess' && alive(s) && alive(s.spouse) && s.spouse.sex === 'm'); if (pr) { heir = pr.spouse; how = `ascends through marriage to Princess ${pr.name.given}`; } }
    if (!heir) { const c = this.sims.filter((s) => alive(s) && s.factions?.court && s.age !== 'child').sort((a, b) => b.factions.court.rank - a.factions.court.rank || b.needs.honor - a.needs.honor)[0]; if (c) { heir = c; how = 'is chosen by the court ministers'; } }
    if (!heir) return;
    this.crown(heir, how);
  }
  crown(s, how) {
    const royal = this.vhouses.royal;
    if (s.home && s.home !== royal) s.home.residents = s.home.residents.filter((x) => x !== s);
    s.home = royal; royal.residents.push(s);
    s.job = 'king'; s.armed = true; s.outlaw = false; s.needs.honor = 100;
    if (s.spouse && !s.spouse.dead && s.spouse.sex === 'f') { const q = s.spouse; if (q.home !== royal) { if (q.home) q.home.residents = q.home.residents.filter((x) => x !== q); q.home = royal; royal.residents.push(q); } q.job = 'queen'; q.rebuildModel(); }
    if (s.household) for (const h of this.household) { if (h.home !== royal && h.age !== 'elder') { if (h.home) h.home.residents = h.home.residents.filter((x) => x !== h); h.home = royal; royal.residents.push(h); } }
    this.factions?.join(s, 'court', true); if (s.factions.court) s.factions.court.rank = Math.max(s.factions.court.rank, 7);
    s.rebuildModel();
    this.king = s;
    this.log(`👑 Long live the King! ${s.name.full} ${how}.`, 'decree', s.pos);
    this.emit('crowned', { sim: s });
    for (const o of this.sims) if (!o.dead && o.faction === 'village') o.addMoodlet('newking', 'A new reign', 5, 1440);
    if (s.household) { this.ui?.toast('You are now King of Haeryeong. Open ⚑ to issue royal decrees.', 'festival'); this.ui?.refreshHousehold(); }
  }

  // ---------- Save / load ----------
  serialize() {
    const id = (x) => (x && !x.dead ? x.id : null);
    const D = this.director;
    return {
      v: 1, seed: this.seed, quality: this.quality, savedAt: Date.now(),
      env: { hour: this.env.hour, day: this.env.day, weather: this.env.weather, seasonOffset: this.seasons?.offset, snow: this.seasons?.snow },
      household: this.household.filter((s) => !s.dead).map((s) => s.id), king: id(this.king),
      chronicle: this.chronicle.slice(0, 80),
      director: { lastRaidDay: D.lastRaidDay, lastFestivalDay: D.lastFestivalDay, lastTourneyDay: D.lastTourneyDay, lastExamDay: D.lastExamDay, lastPlotDay: D.lastPlotDay, lastBanquetDay: D.lastBanquetDay },
      sims: this.sims.filter((s) => !s.dead).map((s) => ({
        id: s.id, name: s.name, sex: s.sex, age: s.age, ageDays: s.ageDays, job: s.job, traits: s.traits, faction: s.faction,
        home: s.home ? s.home.id : null, household: s.household, married: s.married, spouse: id(s.spouse), coins: Math.round(s.coins),
        needs: s.needs, skills: s.skills, hp: s.hp, maxHp: s.maxHp, armed: s.armed,
        rel: [...s.rel].filter(([, r]) => r.met || Math.abs(r.f) > 3).map(([k, r]) => [k, Math.round(r.f), Math.round(r.r), r.met ? 1 : 0]),
        moodlets: s.moodlets, factions: s.factions,
        tasks: Object.fromEntries(Object.entries(s.tasks).map(([k, t]) => [k, { ...t, npc: id(t.npc) }])),
        parents: s.parents.map(id).filter((v) => v != null), children: s.children.map(id).filter((v) => v != null), generation: s.generation,
        pregnant: s.pregnant ? { t: s.pregnant.t, father: id(s.pregnant.father) } : null, look: s.look, x: s.pos.x, z: s.pos.z,
        econ: { inv: s.inv, debt: s.debt, stall: s.stall, bounty: s.bounty, jailed: s.jailed, finery: s.finery, fineBlade: s.fineBlade, policeChief: s.policeChief },
        flags: { outlaw: s.outlaw, champion: s.champion, isChief: s.isChief, tigerSlayer: s.tigerSlayer, royalConsort: s.royalConsort, rankBonus: s.rankBonus, freeWill: s.freeWill, furCoat: s.furCoat, archerChampion: s.archerChampion, bestFish: s.bestFish, wrestling: s.wrestling, wrestlingChampion: s.wrestlingChampion, bladeQ: s.bladeQ, bladeName: s.bladeName, courseBest: s.courseBest, mountedArcher: s.mountedArcher, prevJob: s.prevJob },
      })),
      animals: this.animals?.serialize(),
      systems: Object.fromEntries(this.systems.filter((x) => x.serialize).map((x) => [x.id, x.serialize()])),
      houses: this.world.houses.map((h) => [h.id, h.owner ?? null, h.level || 0]),
      prices: this.economy?.prices,
    };
  }

  restore(d) {
    for (const sys of this.systems) { try { sys.preRestore?.(d.systems?.[sys.id]); } catch (e) { console.error(`[${sys.id}] preRestore`, e); } }
    this.env.hour = d.env.hour; this.env.day = d.env.day; this.env.setWeather(d.env.weather);
    Object.assign(this.director, d.director || {});
    const byId = new Map();
    for (const o of d.sims) {
      const s = this.spawn({ id: o.id, name: o.name, sex: o.sex, age: o.age, ageDays: o.ageDays, job: o.job, traits: o.traits, faction: o.faction, home: o.home != null ? this.houseById(o.home) : null, household: o.household, married: o.married, coins: o.coins, look: o.look, x: o.x, z: o.z, armed: o.armed, generation: o.generation });
      Object.assign(s, o.econ || {}); if (s.finery) s.rebuildModel(); if (s.jailed) { s.action = { type: 'jailed', t: 0, phase: 'do', label: 'Imprisoned at the Podocheong' }; }
      Object.assign(s.needs, o.needs); Object.assign(s.skills, o.skills); s.hp = o.hp; s.maxHp = o.maxHp;
      s.moodlets = o.moodlets || []; s.factions = o.factions || {}; Object.assign(s, o.flags || {});
      if (s.home) s.home.residents.push(s);
      byId.set(s.id, { s, o });
    }
    const get = (i) => (i == null ? null : byId.get(i)?.s || null);
    for (const { s, o } of byId.values()) {
      s.spouse = get(o.spouse);
      s.parents = (o.parents || []).map(get).filter(Boolean); s.children = (o.children || []).map(get).filter(Boolean);
      for (const [k, f, r, met] of o.rel || []) s.rel.set(k, { f, r, met: !!met });
      for (const [k, t] of Object.entries(o.tasks || {})) { s.tasks[k] = { ...t, npc: get(t.npc) }; if (t.npc != null && !s.tasks[k].npc) this.factions?.newTask(s, k); }
      if (o.pregnant) { s.pregnant = { t: o.pregnant.t, father: get(o.pregnant.father) }; s.char.setPregnant(true); s.char.setBumpSize(Math.min(1, s.pregnant.t / 2880)); }
    }
    for (const [hid, owner, level] of d.houses || []) { const h = this.world.houses.find((x) => x.id === hid); if (h) { h.owner = owner; h.level = level; } }
    if (d.prices && this.economy) Object.assign(this.economy.prices, d.prices);
    this.household = (d.household || []).map(get).filter(Boolean);
    this.king = get(d.king) || this.sims.find((s) => s.job === 'king');
    this.banditChief = this.sims.find((s) => s.isChief);
    this.chronicle = [];
    for (const e of (d.chronicle || []).slice().reverse()) { this.chronicle.unshift(e); this.ui?.onChronicle(e); }
    for (const sys of this.systems) if (d.systems?.[sys.id] !== undefined) { try { sys.restore?.(d.systems[sys.id], get); } catch (e) { console.error(`[${sys.id}] restore`, e); } }
    this.log(`The chronicle resumes. Day ${this.env.day} in Haeryeong.`, 'story');
  }

  save(silent) {
    // test sessions (?test=1) never write over the player's real save
    if (/[?&]test=1/.test(location.search)) { if (!silent) this.ui?.toast('Test mode: saving is disabled.'); return; }
    try {
      localStorage.setItem('haeryeong_save', JSON.stringify(this.serialize()));
      if (!silent) this.ui?.toast('💾 Your dynasty has been saved.');
      return true;
    } catch (e) { this.ui?.toast('Could not save: ' + e.message); return false; }
  }

  // ---------- Frame ----------
  update(dt, gm) {
    this.rebuildGrid();
    for (const s of this.sims) s.update(dt, gm);
    // cleanup bodies
    for (const s of this.sims) if (s.dead && s.deadT > 240 && !s.household && s !== this.selected) { s.dispose(); s.removed = true; }
    this.sims = this.sims.filter((s) => !s.removed);
    this.director.update(gm);
    this.animals?.update(dt, gm, this.camera.position);
    for (const sys of this.systems) { try { sys.update?.(dt, gm); } catch (e) { if (!sys._err) { sys._err = true; console.error(`[${sys.id}] update`, e); } } }
    // never leave the player without a family to follow: re-offer the legacy picker if it was dismissed
    if (this.started && !this.household.some((x) => !x.dead)) { this._lpT = (this._lpT || 0) - dt; const m = document.getElementById('modal'); if (this._lpT <= 0 && m?.classList.contains('hidden')) { this._lpT = 3; this.ui?.openLegacyPicker(); } }
    if (this.env.day !== this._emDay) { this._emDay = this.env.day; this.emit('day', { day: this.env.day }); }
    this.economy?.update(gm);
    if (this.env.day !== this.lastSaveDay && this.env.hour > 6) { this.lastSaveDay = this.env.day; if (this.started) this.save(true); }
  }
}
