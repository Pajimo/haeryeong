import { rand, rr, pick, chance, clamp, weightedPick } from './noise.js';
import { LAYOUT } from './terrain.js';
import { line, makeName } from './data.js';

// The storyteller: watches the kingdom and stirs events (Sims-meets-saga "AI director").
export class Director {
  constructor(G) {
    this.G = G; this.cool = 90; this.active = null; this.lastFestivalDay = -5; this.lastRaidDay = 0; this.lastTourneyDay = -5; this.travelerT = 300;
    this.weddings = [];
  }

  get hour() { return this.G.env.hour; }

  update(gm) {
    const G = this.G;
    if (this.active) {
      this.active.t += gm;
      this.active.update?.(gm);
      if (this.active.done || this.active.t > this.active.max) { this.active.end?.(); this.active = null; this.cool = rr(140, 320); G.ui?.setEvent(null); G.env.spiritWindTarget = null; }
    } else {
      this.cool -= gm;
      if (this.cool <= 0) this.pickEvent();
    }
    // population upkeep
    this.travelerT -= gm;
    if (this.travelerT <= 0) {
      this.travelerT = rr(300, 600);
      const vil = G.sims.filter((s) => s.faction === 'village' && !s.dead).length;
      if (vil < 46) this.traveler();
      const bandits = G.sims.filter((s) => s.faction === 'bandit' && !s.dead).length;
      if (bandits < 4 && chance(0.35) && G.env.day - this.lastRaidDay >= 1) { const nb = G.spawnBandits(ri(2, 4)); G.log(`New faces have joined the bandits in the western woods: ${nb.map((b) => b.name.given).join(', ')}.`, 'danger'); }
    }
    // families grow: couples at home try for children
    this.familyT = (this.familyT ?? 120) - gm;
    if (this.familyT <= 0) {
      this.familyT = 90;
      const couples = G.sims.filter((s) => s.sex === 'f' && !s.dead && s.spouse && !s.spouse.dead && !s.pregnant && ['young', 'adult'].includes(s.age) && s.spouse.age !== 'child' && (s.children?.length || 0) < 3 && !s.household);
      const press = G.popPressure;
      if (G.aliveCount < G.popCap) for (const m of couples) if (chance(0.12 + press * 0.3)) G.tryForBaby(m.spouse, m);
      // young singles may find love
      const singles = G.sims.filter((s) => !s.dead && !s.spouse && s.age === 'young' && s.faction === 'village' && !s.household);
      for (const a of singles) { if (!chance(0.05 + G.popPressure * 0.22)) continue; const b = singles.find((x) => x.sex !== a.sex && !x.spouse && x !== a); if (b) { a.changeRel(b, 8, 12); if (a.getRel(b).r > 70 - G.popPressure * 25 && chance(0.3 + G.popPressure * 0.35)) this.wedding(a, b); } }
    }
    // weddings
    for (const w of this.weddings) w.t -= gm;
    this.weddings = this.weddings.filter((w) => w.t > 0);
  }

  pickEvent() {
    const G = this.G; const h = this.hour; const day = G.env.day;
    const bandits = G.sims.filter((s) => s.faction === 'bandit' && !s.dead);
    const W = {
      raid: (h > 18.5 || h < 2) && bandits.length >= 3 && day - this.lastRaidDay >= 2 ? 2.2 : 0,
      festival: h > 18 && h < 21 && day - this.lastFestivalDay >= 2 ? 3 : 0,
      tournament: h > 9.5 && h < 14 && day - this.lastTourneyDay >= 2 ? 2.5 : 0,
      market: h > 8 && h < 13 ? 1.2 : 0,
      decree: h > 9 && h < 17 ? 1.0 : 0,
      master: h > 8 && h < 17 ? 0.7 : 0,
      omen: 0.4,
      plot: (h > 21 || h < 3) && G.king && !G.king.dead && G.sims.filter((s) => s.factions?.lotus && !s.dead).length >= 2 && day - (this.lastPlotDay ?? -1) >= 3 ? 1.2 : 0,
      exam: h > 9.5 && h < 13 && day - (this.lastExamDay ?? -2) >= 3 ? 2.0 : 0,
      banquet: h > 17.5 && h < 20.5 && G.king && !G.king.dead && day - (this.lastBanquetDay ?? -1) >= 2 ? 1.4 : 0,
    };
    for (const [key, ev] of Object.entries(this.custom || {})) { try { W[key] = ev.weight(G, h, day) || 0; } catch { W[key] = 0; } }
    const k = weightedPick(Object.keys(W), (x) => W[x]);
    if (!W[k]) { this.cool = 30; return; }
    if (this.custom?.[k]) { this.custom[k].run(G); return; }
    this['ev_' + k]();
  }

  stop() { const a = this.active; if (!a) return; this.active = null; try { a.end?.(); } catch (e) { console.error(e); } this.G.ui?.setEvent(null); this.G.env.spiritWindTarget = null; this.cool = 60; }

  // systems can add storyteller events: weight(G, hour, day) -> number, run(G) -> should call director.start({...}) or just log
  registerEvent(key, ev) { (this.custom ||= {})[key] = ev; }

  start(ev) {
    this.active = { t: 0, max: 240, ...ev };
    this.G.ui?.setEvent(this.active);
    if (ev.pos) this.G.env.spiritWindTarget = { x: ev.pos[0], z: ev.pos[1] };
  }

  // sims ask the director whether the current event wants them
  assign(s) {
    const ev = this.active;
    if (!ev || !ev.assign || s.controlled) return false;
    return ev.assign(s);
  }

  // ---------- Events ----------
  ev_raid() {
    const G = this.G; this.lastRaidDay = G.env.day;
    const raiders = G.sims.filter((s) => s.faction === 'bandit' && !s.dead);
    const extra = G.spawnBandits(ri(1, 3));
    raiders.push(...extra);
    const targetPos = pick([[0, 60], [10, -20], [-30, 30], [30, 10]]);
    G.raidActive = true;
    G.log(`Torches in the western woods! ${raiders.length} bandits${G.banditChief && !G.banditChief.dead ? ' led by ' + G.banditChief.name.full : ''} are raiding Haeryeong!`, 'danger', { x: targetPos[0], z: targetPos[1] });
    G.audio?.alarm();
    for (const b of raiders) { b.cancelAction(); b.startAction({ type: 'goto', dest: [targetPos[0] + rr(-10, 10), targetPos[1] + rr(-10, 10)], run: true, label: 'Raiding!' }); if (b.char.sword) b.char.draw(); }
    this.start({
      kind: 'raid', title: 'Bandit Raid', ko: '산적 습격', pos: targetPos, max: 200, raiders,
      update: () => {
        const alive = raiders.filter((r) => !r.dead);
        if (!alive.length) { this.active.done = true; this.active.win = true; return; }
        for (const s of G.sims) {
          if (s.dead || s.hidden || s.controlled) continue;
          if (s.faction === 'bandit') {
            if (!s.combat.target && (!s.action || s.action.type !== 'goto' || chance(0.01))) {
              let best = null, bd = 30;
              for (const o of G.sims) if (o.faction !== 'bandit' && !o.dead && !o.hidden) { const d = o.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = o; } }
              if (best) { s.startFight(best); if (chance(0.3)) s.say(line('bandit'), 'shout'); }
              else if (!s.action) s.startAction({ type: 'goto', dest: [targetPos[0] + rr(-25, 25), targetPos[1] + rr(-25, 25)], run: true, label: 'Looting' });
            }
          } else {
            const nearB = alive.reduce((a, b) => (b.pos.distanceTo(s.pos) < (a ? a.pos.distanceTo(s.pos) : 1e9) ? b : a), null);
            if (!nearB) continue;
            const d = nearB.pos.distanceTo(s.pos);
            const defender = s.age !== 'child' && (s.job === 'soldier' || s.job === 'general' || ((s.fighter || s.has('Brave')) && s.job !== 'monk'));
            if (defender && d < (s.job === 'soldier' || s.job === 'general' ? 260 : 70) && !s.combat.target) { if (d > 50) { if (s.action?.type !== 'goto') s.startAction({ type: 'goto', dest: [nearB.pos.x, nearB.pos.z], run: true, label: 'Rushing to defend' }); } else { s.startFight(nearB); if (chance(0.3)) s.say(line('defend'), 'shout'); } }
            else if (!defender && d < 35 && (!s.action || !['flee', 'hide'].includes(s.action.type))) { s.cancelAction(); s.startAction({ type: 'flee', dest: s.home?.door || [LAYOUT.palace[0], -140], label: 'Fleeing!' }); }
          }
        }
      },
      end: () => {
        G.raidActive = false;
        const alive = raiders.filter((r) => !r.dead);
        if (!alive.length) {
          const heroes = [...G.kills.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => G.sims.find((s) => s.id === id)).filter(Boolean);
          G.log(`The raid was repelled!${heroes.length ? ' Songs are already being sung of ' + heroes.map((h) => h.name.full).join(' and ') + '.' : ''}`, 'story');
          for (const s of G.sims) if (s.faction === 'village' && !s.dead) s.addMoodlet('safe', 'The village is safe', 12, 600);
        } else {
          const stolen = Math.floor(rr(40, 120));
          G.log(`The bandits melted back into the forest with ${stolen} nyang of plunder. The village is shaken.`, 'danger');
          for (const s of G.sims) if (s.faction === 'village' && !s.dead) { s.coins = Math.max(0, s.coins - 4); s.addMoodlet('raided', 'Survived a raid', -12, 600); }
          for (const r of alive) { r.endFight(); r.cancelAction(); r.startAction({ type: 'goto', dest: LAYOUT.banditCamp, run: true, label: 'Retreating' }); }
        }
        for (const s of G.sims) if (s.action && (s.action.type === 'hide' || s.action.type === 'flee')) s.endAction();
        for (const s of G.sims) if (s.combat.target && s.faction !== 'bandit' && s.combat.target.faction === 'bandit') { s.endFight(); s.cancelAction(); }
        G.kills.clear();
      },
    });
  }

  ev_festival() {
    const G = this.G; this.lastFestivalDay = G.env.day;
    const season = G.env.season || 'autumn';
    const F = {
      spring: { title: 'Lantern Festival', ko: '연등회', text: 'The Lantern Festival (연등회) begins! Paper lanterns rise over the guardian tree and the blossoms.', anims: ['dance', 'dance', 'cheer', 'talk'], lanterns: true },
      summer: { title: 'Dano Festival', ko: '단오', text: 'It is Dano (단오)! Women wash their hair in iris water, the swing contest begins, and the men wrestle at ssireum.', anims: ['cheer', 'cheer', 'dance', 'talk', 'laugh'], lanterns: false },
      autumn: { title: 'Chuseok Harvest Moon', ko: '추석', text: 'Chuseok (추석): under the great harvest moon, families share songpyeon rice cakes and the women dance the ganggangsullae circle.', anims: ['dance', 'dance', 'eat', 'talk'], lanterns: true },
      winter: { title: 'Seollal New Year', ko: '설날', text: 'Seollal (설날)! A new year begins. The young bow deeply to their elders, children receive coins, and yut sticks fly.', anims: ['bow', 'talk', 'cheer', 'laugh'], lanterns: false },
    }[season];
    G.log(F.text, 'festival', { x: 0, z: 0 });
    if (season === 'winter') for (const s of G.sims) if (s.age === 'child' && !s.dead) s.earn(5);
    if (season === 'autumn') for (const s of G.sims) if (!s.dead) s.needs.hunger = Math.min(100, s.needs.hunger + 30);
    G.audio?.festival(true);
    this.start({
      kind: 'festival', title: F.title, ko: F.ko, pos: [0, 0], max: 220, lanterns: F.lanterns,
      assign: (s) => {
        if (s.faction !== 'village' || s.job === 'soldier' && chance(0.6)) return false;
        if (s.needs.energy < 15) return false;
        const a = rr(0, 6.28), r = rr(6, 20);
        const anim = pick(F.anims);
        s.startAction({ type: 'event', dest: [Math.cos(a) * r, Math.sin(a) * r], anim, dur: rr(40, 90), look: [0, 0], adv: { fun: 1.4, social: 1.0 }, prop: F.lanterns && chance(0.35) ? 'lantern' : null, label: `Celebrating ${F.title}` });
        return true;
      },
      update: () => { if (F.lanterns && chance(0.25)) G.fx?.skyLantern([rr(-18, 18), rr(-18, 18)]); },
      end: () => { G.audio?.festival(false); G.log(F.lanterns ? 'The last lanterns drift beyond the mountains. A good omen.' : `The ${F.title} draws to a close. Laughter echoes into the night.`, 'festival'); for (const s of G.sims) if (s.faction === 'village') s.addMoodlet('festival', 'Enjoyed the festival', 15, 720); },
    });
    for (const s of G.sims) if (s.faction === 'village' && !s.controlled && s.action && !s.action.work && s.action.type !== 'fight' && chance(0.7)) s.endAction();
  }

  ev_tournament() {
    const G = this.G; this.lastTourneyDay = G.env.day;
    const [cx, cz] = LAYOUT.training;
    const [tcx, tcz] = LAYOUT.training;
    const fighters = G.sims.filter((s) => s.faction === 'village' && s.fighter && !s.dead && !s.controlled && !s.household && !['general', 'king', 'prince'].includes(s.job)).sort(() => rand() - 0.5).slice(0, 6);
    for (const h of G.household) if (h.fighter && !h.dead && Math.hypot(h.pos.x - tcx, h.pos.z - tcz) < 35) fighters.unshift(h);
    if (G.household.some((h) => h.fighter)) G.ui?.toast('A tournament begins! Bring a fighter to the training ground to enter.');
    const player = G.household.find((s) => s.controlled);
    if (fighters.length < 2) { this.cool = 60; return; }
    G.log(`A martial tournament (무예 대회) is held at the training ground! ${fighters.length} warriors compete for 50 nyang and the title of Champion.`, 'tournament', { x: cx, z: cz });
    const st = { queue: fighters.slice(), current: null, champion: null, wait: 4 };
    this.start({
      kind: 'tournament', title: 'Martial Tournament', ko: '무예 대회', pos: [cx, cz], max: 360, st,
      assign: (s) => {
        if (s.faction !== 'village' || st.queue.includes(s) || (st.current && st.current.includes(s))) return false;
        if (chance(0.5)) return false;
        const a = rr(0, 6.28), r = rr(13, 17);
        s.startAction({ type: 'event', dest: [cx + Math.cos(a) * r, cz + Math.sin(a) * r], anim: () => (chance(0.003) ? 'cheer' : 'idle'), dur: rr(60, 120), look: [cx, cz], adv: { fun: 1.2, social: 0.5 }, label: 'Watching the tournament' });
        return true;
      },
      update: (gm) => {
        if (!st.current) {
          st.wait -= gm;
          if (st.wait > 0) return;
          if (st.queue.length < 2) {
            st.champion = st.queue[0];
            if (st.champion) { st.champion.coins += 50; st.champion.needs.honor = 100; st.champion.addMoodlet('champion', 'Tournament Champion', 30, 1440); st.champion.champion = true; G.log(`${st.champion.name.full} is crowned Champion of Haeryeong!`, 'tournament', st.champion.pos); st.champion.say('Heaven guided my blade!', 'shout'); }
            this.active.done = true; return;
          }
          const a = st.queue.shift(), b = st.queue.shift();
          st.current = [a, b];
          for (const [s, off] of [[a, -3], [b, 3]]) { s.cancelAction(); s.startAction({ type: 'goto', dest: [cx + off, cz], run: false, label: 'Entering the ring', then: (x) => x.startAction({ type: 'event', phase: 'do', anim: 'guard', dur: 45, look: [cx, cz], label: 'Awaiting the bout' }) }); }
          st.startT = 0;
          G.log(`Next bout: ${a.name.full} vs ${b.name.full}.`, 'tournament');
          return;
        }
        const [a, b] = st.current;
        st.startT += gm;
        const ready = (s) => Math.hypot(s.pos.x - cx, s.pos.z - cz) < 6;
        if (!a.combat.target && !b.combat.target && !st.fighting && (ready(a) && ready(b) || st.startT > 30)) { st.fighting = true; a.cancelAction(); b.cancelAction(); a.startFight(b, true); b.startFight(a, true); G.audio?.drum(); }
        if (st.fighting) {
          const done = a.action?.type === 'yield' || b.action?.type === 'yield' || a.dead || b.dead || (!a.combat.target && !b.combat.target);
          if (done) {
            const winner = a.action?.type === 'yield' || a.dead ? b : a;
            st.queue.push(winner); st.current = null; st.fighting = false; st.wait = 6;
            a.hp = Math.max(a.hp, a.maxHp * 0.6); b.hp = Math.max(b.hp, b.maxHp * 0.6);
          }
        }
      },
    });
  }

  ev_market() {
    const G = this.G;
    G.log(`Market day! Merchants from ${pick(['Hanyang', 'the southern ports', 'beyond the mountains', 'the Goryeo coast'])} have brought ${pick(['silk', 'salt', 'ginseng', 'porcelain', 'dried fish'])}.`, 'info', { x: 0, z: 78 });
    this.start({
      kind: 'market', title: 'Market Day', ko: '장날', pos: [0, 78], max: 180,
      assign: (s) => {
        if (s.faction !== 'village' || chance(0.6) || s.coins < 4) return false;
        s.startAction({ type: 'event', dest: [rr(-4, 4), rr(55, 100)], anim: () => pick(['talk', 'idle']), dur: rr(20, 40), adv: { fun: 1.0, social: 0.8 }, label: 'Shopping at the market' });
        s.coins -= 3;
        return true;
      },
    });
  }

  ev_decree() {
    const G = this.G;
    const k = pick(['tax', 'gift', 'drill', 'amnesty']);
    const vil = G.sims.filter((s) => s.faction === 'village' && !s.dead);
    if (k === 'tax') { G.log('A royal messenger reads a decree: the grain tax is raised by a tenth. Grumbling fills the jumak.', 'decree'); for (const s of vil) { s.coins = Math.floor(s.coins * 0.85); s.addMoodlet('taxed', 'Heavy taxes', -8, 720); } }
    if (k === 'gift') { G.log('By royal grace, sacks of rice are distributed to every household!', 'decree'); for (const s of vil) { s.needs.hunger = 100; s.addMoodlet('gift', 'Royal rice gift', 12, 720); } }
    if (k === 'drill') {
      G.log('The General orders the soldiers to drill at the training ground.', 'decree');
      const [cx, cz] = LAYOUT.training;
      this.start({ kind: 'drill', title: 'Military Drill', ko: '훈련', pos: [cx, cz], max: 120, assign: (s) => { if (s.job !== 'soldier') return false; const i = s.id % 9; s.startAction({ type: 'event', dest: [cx - 6 + (i % 3) * 3, cz - 4 + Math.floor(i / 3) * 3], anim: 'train', dur: 100, look: [cx - 20, cz], prop: null, label: 'Drilling' }); if (s.char.sword) s.char.draw(); return true; } });
      return;
    }
    if (k === 'amnesty') { G.log('The King declares an amnesty. All outlaws are pardoned.', 'decree'); for (const s of G.sims) s.outlaw = false; }
    this.cool = rr(120, 240);
  }

  ev_master() {
    const G = this.G;
    const m = G.spawn({ sex: chance(0.8) ? 'm' : 'f', age: 'adult', job: 'swordsman', x: 8, z: 300, skillSword: rr(8, 9.8), traits: ['Brave', 'Ambitious', pick(['Hot-headed', 'Loyal', 'Cunning'])] });
    m.maxHp = 170; m.hp = 170;
    const champ = G.sims.filter((s) => s.faction === 'village' && s.fighter && !s.dead && s !== m).sort((a, b) => b.skills.sword - a.skills.sword)[0];
    G.log(`A wandering master in a bamboo hat, ${m.name.full}, approaches from the southern road${champ ? ', seeking ' + champ.name.full : ''}.`, 'duel', m.pos);
    const st = { stage: 'walk' };
    m.startAction({ type: 'goto', dest: [4, 20], label: 'Seeking a worthy opponent' });
    this.start({
      kind: 'master', title: 'The Wandering Master', ko: '떠돌이 검객', pos: [4, 20], max: 300,
      update: (gm) => {
        if (m.dead) { this.active.done = true; return; }
        if (st.stage === 'walk' && !m.action) {
          st.stage = 'challenge';
          if (champ && !champ.dead) {
            m.say(`${champ.name.given}! They say yours is the finest blade in Haeryeong. Show me.`, 'shout');
            if (!champ.controlled) { champ.cancelAction(); champ.startAction({ type: 'goto', dest: [m.pos.x + 3, m.pos.z], run: true, label: 'Answering the challenge' }); }
            st.wait = 6;
          } else { this.active.done = true; }
        } else if (st.stage === 'challenge') {
          st.wait -= gm;
          this.active.pos = [m.pos.x, m.pos.z];
          if (st.wait <= 0 && champ && !champ.dead) { G.startDuel(m, champ); st.stage = 'duel'; }
        } else if (st.stage === 'duel') {
          if (!m.combat.target && !champ.combat.target) {
            this.active.done = true;
            m.home = G.homeHouse && chance(0.0) ? G.homeHouse : (G.world.houses.find((h) => h.residents.length < 2) || null);
            if (m.home) m.home.residents.push(m);
            G.log(`${m.name.full} decides to stay in Haeryeong for a while.`, 'story');
          }
        }
      },
      assign: (s) => {
        if (s.faction !== 'village' || chance(0.75) || st.stage === 'walk') return false;
        const a = rr(0, 6.28), r = rr(8, 12);
        s.startAction({ type: 'event', dest: [m.pos.x + Math.cos(a) * r, m.pos.z + Math.sin(a) * r], anim: () => (chance(0.002) ? 'cheer' : 'idle'), dur: 40, look: [m.pos.x, m.pos.z], adv: { fun: 1.0 }, label: 'Watching the duel' });
        return true;
      },
    });
  }

  ev_omen() {
    const G = this.G;
    const k = pick(['crane', 'storm', 'mist', 'dream']);
    if (k === 'crane') G.log('A pair of red-crowned cranes circles the guardian tree. The elders say it means long life.', 'omen');
    if (k === 'storm') { G.env.setWeather('rain'); G.log('Dark clouds gather over the peaks. The shaman warns of a restless river spirit.', 'omen'); }
    if (k === 'mist') { G.env.setWeather('mist'); G.log('A thick mist rolls down from the mountains, swallowing the paddies.', 'omen'); }
    if (k === 'dream') { const s = pick(G.sims.filter((x) => x.faction === 'village' && !x.dead)); G.log(`${s.name.full} dreamt of a blue dragon rising from the river. ${pick(['They are sure it means wealth.', 'They have not slept since.', 'They told everyone at the jumak.'])}`, 'omen'); s.addMoodlet('dream', 'Dragon dream', 15, 600); }
    this.cool = rr(80, 200);
  }

  royalHunt(requester) {
    const G = this.G; if (this.active?.kind === 'hunt') return;
    const camp = LAYOUT.banditCamp;
    const army = G.sims.filter((s) => (s.job === 'soldier' || s.job === 'general' || s.factions?.hwarang) && !s.dead && !s.controlled && s.age !== 'child' && s.faction === 'village').slice(0, 14);
    if (requester) this.huntRequester = requester;
    G.log(`War drums! The royal army marches on the bandit camp in the western woods${requester ? ', at the urging of ' + requester.name.full : ''}.`, 'danger', { x: camp[0], z: camp[1] });
    G.audio?.alarm();
    for (const s of army) { s.cancelAction(); s.startAction({ type: 'goto', dest: [camp[0] + rr(-6, 6), camp[1] + rr(-6, 6)], run: true, label: 'Marching on the bandits' }); if (s.char.sword) s.char.draw(); }
    if (G.household.some((h) => h.fighter)) G.ui?.toast('The army marches west. Follow the spirit wind (G) to join the battle!');
    this.stop();
    this.start({
      kind: 'hunt', title: 'Bandit Suppression', ko: '산적 토벌', pos: camp, max: 400, army,
      update: () => {
        const bandits = G.sims.filter((s) => s.faction === 'bandit' && !s.dead);
        if (!bandits.length) { this.active.done = true; this.active.win = true; return; }
        for (const s of [...army, ...bandits]) {
          if (s.dead || s.controlled || s.combat.target) continue;
          if (Math.hypot(s.pos.x - camp[0], s.pos.z - camp[1]) > 60 && s.faction !== 'bandit') continue;
          const foes = s.faction === 'bandit' ? army.filter((a) => !a.dead) : bandits;
          let best = null, bd = 50; for (const f of foes) { const d = f.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = f; } }
          if (best) s.startFight(best);
        }
      },
      end: () => {
        if (this.active?.win) {
          G.log('The bandit camp has been burned to the ground. The western road is safe — for now.', 'story');
          const r = this.huntRequester; if (r && !r.dead && r.factions.court) { r.factions.court.rep += 60; r.needs.honor = 100; }
          this.lastRaidDay = G.env.day + 2;
        } else G.log('The royal army returns bloodied. The bandits still hold the woods.', 'danger');
        for (const s of army) if (!s.dead) { s.endFight(); s.cancelAction(); }
      },
    });
  }

  ev_plot() {
    const G = this.G; this.lastPlotDay = G.env.day;
    const k = G.king; const [px, pz] = LAYOUT.palace;
    const ass = G.spawnBandits(3);
    for (const a of ass) { a.name = { ...a.name, full: 'Lotus Assassin ' + a.name.given }; a.factions = { lotus: { rep: 0, rank: 0 } }; a.skills.sword = rr(6, 8.5); a.pos.set(px + rr(-30, 30), 0, pz - 40); a.isAssassin = true; a.startFight(k); }
    const pl = G.household.filter((h) => h.factions.lotus && !h.dead);
    G.log(`Shadows move on the palace walls… The Black Lotus strikes at King ${k.name.given}!`, 'danger', { x: px, z: pz });
    if (pl.length) G.ui?.toast('The Lotus strikes the palace tonight! Strike down the King and the throne may be yours…', 'danger');
    else if (G.household.some((h) => h.factions.court)) G.ui?.toast('Assassins in the palace! Defend His Majesty!', 'danger');
    G.audio?.alarm();
    this.start({
      kind: 'plot', title: 'Assassins in the Palace', ko: '역모', pos: [px, pz], max: 240,
      update: () => {
        const alive = ass.filter((a) => !a.dead);
        if (!alive.length || k.dead) { this.active.done = true; return; }
        for (const s of G.sims) {
          if (s.dead || s.controlled || s.combat.target || s.faction === 'bandit') continue;
          if ((s.job === 'soldier' || s.job === 'general' || s.job === 'prince') && s.pos.distanceTo(k.pos) < 120) { const t = alive[Math.floor(Math.random() * alive.length)]; s.startFight(t); }
        }
      },
      end: () => {
        if (k.dead) return;
        const alive = ass.filter((a) => !a.dead);
        for (const a of alive) { a.endFight(); a.cancelAction(); a.missionLock = true; a.startAction({ type: 'goto', dest: [-200, 200], run: true, label: 'Fleeing into the night', then: (z) => { z.dispose(); z.removed = true; } }); }
        G.log(`The assassination failed. King ${k.name.given} lives, and the palace hunts for traitors.`, 'story');
        for (const h of G.household) if (h.factions.court && !h.dead && h.pos.distanceTo(k.pos) < 80) { h.factions.court.rep += 50; k.changeRel(h, 25); G.factions.promote(h, 'court'); }
      },
    });
  }

  ev_exam() {
    const G = this.G; this.lastExamDay = G.env.day; const [px, pz] = LAYOUT.palace;
    const cands = G.sims.filter((s) => !s.dead && !s.household && s.faction === 'village' && ['scholar', 'noble'].includes(s.job) && s.age !== 'child' && s.age !== 'elder').slice(0, 6);
    G.log('The royal civil service examination (과거) is held in the palace courtyard. Candidates sharpen their brushes.', 'decree', { x: px, z: pz + 10 });
    if (G.household.some((h) => h.age !== 'child' && h.skills.scholarship >= 2)) G.ui?.toast('The Gwageo exam has begun at the palace! Send a scholarly household member to sit it (stay in the courtyard).');
    const spots = G.world.objects.filter((o) => o.kind === 'court');
    cands.forEach((s, i) => { const sp = spots[i % spots.length]; s.cancelAction(); s.startAction({ type: 'event', dest: [sp.x, sp.z], anim: 'study', prop: 'book', dur: 120, look: [px, pz - 4], label: 'Sitting the Gwageo exam' }); });
    this.start({
      kind: 'exam', title: 'Civil Service Exam', ko: '과거 시험', pos: [px, pz + 10], max: 120,
      end: () => {
        const takers = [...cands, ...G.household.filter((h) => !h.dead && h.age !== 'child' && Math.hypot(h.pos.x - px, h.pos.z - (pz + 8)) < 40)];
        const scored = takers.map((s) => [s, s.skills.scholarship * 10 + rr(0, 30) + s.needs.honor / 6]).sort((a, b) => b[1] - a[1]);
        const passed = scored.filter(([s, sc], i) => sc >= 70 || (i === 0 && sc >= 55));
        if (!passed.length) { G.log('No candidate was found worthy this year. The examiners frown.', 'decree'); return; }
        for (const [s] of passed) { G.factions.join(s, 'court', true); s.factions.court.rank = Math.max(1, s.factions.court.rank); s.factions.court.rep += 40; if (!['king', 'queen', 'prince', 'princess', 'general'].includes(s.job) && s.sex === 'm') { s.job = 'official'; s.rebuildModel(); } s.needs.honor = 100; s.addMoodlet('exam', 'Passed the Gwageo!', 30, 2880); if (s.household && !s.tasks.court) G.factions.newTask(s, 'court'); }
        G.log(`Gwageo results: ${passed.map(([s]) => s.name.full).join(', ')} passed and enter royal service!`, 'decree');
        for (const [s] of scored) if (!passed.find(([p]) => p === s)) s.addMoodlet('examfail', 'Failed the exam', -10, 1440);
      },
    });
  }

  ev_banquet() {
    const G = this.G; this.lastBanquetDay = G.env.day; const [px, pz] = LAYOUT.palace;
    G.log(`King ${G.king.name.given} hosts a royal banquet. Musicians play the gayageum in the palace courtyard.`, 'festival', { x: px, z: pz + 10 });
    G.audio?.festival(true);
    this.start({
      kind: 'banquet', title: 'Royal Banquet', ko: '궁중 연회', pos: [px, pz + 10], max: 150,
      assign: (s) => {
        if (s.faction !== 'village' || !(s.factions.court || ['king', 'queen', 'prince', 'princess'].includes(s.job)) || s.job === 'soldier') return false;
        const a = rr(0, 6.28), r = rr(4, 14);
        s.startAction({ type: 'event', dest: [px + Math.cos(a) * r, pz + 12 + Math.sin(a) * r * 0.6], anim: () => (Math.random() < 0.004 ? 'laugh' : pick(['dance', 'talk', 'idle'])), dur: rr(40, 80), adv: { hunger: 2, fun: 1.3, social: 1.2 }, look: [px, pz], label: 'Feasting at the royal banquet' });
        return true;
      },
      end: () => { G.audio?.festival(false); for (const h of G.household) if (h.factions.court && h.pos.distanceTo(G.king.pos) < 40) { G.king.changeRel(h, 10); h.factions.court.rep += 20; } },
    });
  }

  wedding(a, b) {
    const G = this.G;
    a.married = b.married = true; a.spouse = b; b.spouse = a;
    a.changeRel(b, 15, 15);
    if (b.home !== a.home && a.home) { if (b.home) b.home.residents = b.home.residents.filter((x) => x !== b); b.home = a.home; a.home.residents.push(b); if (a.household) { b.household = true; G.household.push(b); G.ui?.refreshHousehold(); } }
    else if (b.household && !a.household) { a.household = true; G.household.push(a); G.ui?.refreshHousehold(); }
    G.log(`${a.name.full} and ${b.name.full} were married beneath the guardian tree. The whole village came to bow.`, 'love', a.pos);
    G.emit('wedding', { a, b });
    if (!this.active) {
      const guests = G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'village' && s !== a && s !== b && (s.getRel(a).f > 15 || s.getRel(b).f > 15 || s.household) && !s.controlled).slice(0, 18);
      this.start({ kind: 'wedding', title: 'A Wedding', ko: '혼례', pos: [0, 6], max: 90,
        update: () => { if (Math.random() < 0.5) G.fx?.flyPool.emit(new a.pos.constructor(rr(-4, 4), 6 + rr(0, 2), 6 + rr(-4, 4)), new a.pos.constructor(rr(-0.3, 0.3), -0.6, rr(-0.3, 0.3)), { r: 1, g: 0.75, b: 0.85, isColor: true }, 0.12, 6, 0.05); },
        end: () => { G.audio?.festival(false); } });
      for (const [k, s] of [a, b].entries()) if (!s.controlled) { s.cancelAction(); s.startAction({ type: 'event', dest: [k ? 1 : -1, 5.5], anim: () => (Math.random() < 0.5 ? 'bow' : 'cheer'), dur: 80, look: [k ? -1 : 1, 5.5], label: 'Exchanging wedding bows' }); }
      guests.forEach((g, i) => { const ang = Math.PI * (0.2 + 0.6 * i / Math.max(1, guests.length - 1)); g.cancelAction(); g.startAction({ type: 'event', dest: [Math.cos(ang) * 7, 5.5 + Math.sin(ang) * 7], anim: () => (Math.random() < 0.005 ? 'cheer' : Math.random() < 0.003 ? 'bow' : 'idle'), dur: 80, look: [0, 5.5], label: 'Attending the wedding' }); });
      G.audio?.festival(true);
    }
    for (const s of [a, b]) s.addMoodlet('wed', 'Just married!', 35, 2880);
    for (const s of G.sims) if (s.faction === 'village' && !s.dead && s !== a && s !== b && (s.getRel(a).f > 20 || s.getRel(b).f > 20)) s.addMoodlet('wedding', 'Attended a wedding', 10, 600);
    if (!this.active) { G.audio?.festival(true); setTimeout(() => { if (!this.active || this.active.kind !== 'festival') G.audio?.festival(false); }, 30000); }
  }

  traveler() {
    const G = this.G;
    const house = G.world.houses.filter((h) => h.residents.length < 3).sort(() => rand() - 0.5)[0];
    const job = pick(['farmer', 'merchant', 'swordsman', 'hunter', 'scholar', 'farmer']);
    const s = G.spawn({ job, x: 8 + rr(-2, 2), z: 330, home: house || null });
    if (house) house.residents.push(s);
    s.startAction({ type: 'goto', dest: house ? house.door : [0, 20], label: 'Arriving in Haeryeong' });
    G.log(`A traveler named ${s.name.full}, a ${s.title.toLowerCase()}, arrives seeking a new life in Haeryeong.`, 'story', s.pos);
  }
}
function ri(a, b) { return Math.floor(rr(a, b + 1)); }
