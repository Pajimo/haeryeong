import { FACTIONS, TASKS, JOBS } from './data.js';
import { pick, chance, rr } from './noise.js';

// Factions: membership, reputation, ranks, and tasks for the player's household.
export class Factions {
  constructor(G) { this.G = G; }

  members(fid) { return this.G.sims.filter((s) => !s.dead && s.factions[fid]); }
  leader(fid) { return this.members(fid).sort((a, b) => b.factions[fid].rank - a.factions[fid].rank || b.factions[fid].rep - a.factions[fid].rep)[0] || null; }
  rankTitle(s, fid) { const m = s.factions[fid]; if (!m) return null; if (fid === 'court' && s.job === 'king') return 'Sovereign of Haeryeong'; return FACTIONS[fid].ranks[Math.min(m.rank, FACTIONS[fid].ranks.length - 1)]; }

  assignInitial() {
    const G = this.G;
    for (const s of G.sims) {
      const set = (fid, rank) => { s.factions[fid] = { rep: rank * 60 + rr(0, 40), rank }; };
      if (['king', 'queen', 'prince', 'princess'].includes(s.job)) set('court', s.job === 'king' ? 7 : 5);
      else if (s.job === 'general') set('court', 6);
      else if (s.job === 'soldier') set('court', chance(0.3) ? 1 : 0);
      else if (s.job === 'noble') set('court', Math.floor(rr(2, 5)));
      else if (s.job === 'official') set('court', Math.floor(rr(1, 4)));
      else if (s.job === 'monk') set('temple', s.age === 'elder' ? 4 : 2);
      else if (s.job === 'bandit') set('bandits', s.isChief ? 3 : Math.floor(rr(0, 2)));
      else if (s.job === 'merchant' && chance(0.6)) set('guild', Math.floor(rr(0, 3)));
      if ((s.job === 'swordsman' || s.job === 'hunter') && !s.household && chance(0.6)) set('hwarang', Math.floor(rr(0, 3)));
      if (s.job === 'scholar' && chance(0.3) && !s.household) set('court', 1);
      if (s.has('Pious') && chance(0.4) && !s.factions.temple && !s.household) set('temple', 0);
    }
    // a few secret Lotus agents hide among the villagers
    const cands = G.sims.filter((s) => s.faction === 'village' && !s.household && !s.factions.court && s.age !== 'child' && (s.has('Cunning') || s.has('Ambitious')));
    for (const s of cands.sort(() => Math.random() - 0.5).slice(0, 4)) s.factions.lotus = { rep: rr(20, 120), rank: Math.floor(rr(0, 3)) };
    const lm = this.leader('lotus'); if (lm) lm.factions.lotus.rank = 3;
  }

  requirement(s, fid) {
    const enemies = FACTIONS[fid].enemies;
    for (const e of enemies) if (s.factions[e]) return `You are sworn to the ${FACTIONS[e].name}, their enemy.`;
    if (s.age === 'child') return 'Children cannot join.';
    if (fid === 'court' && (s.needs.honor < 40 || s.outlaw)) return 'The Court requires Honor ≥ 40 and a clean name.';
    if (fid === 'hwarang' && s.skills.sword < 3) return 'The Hwarang require Sword skill 3 (train at the dummies).';
    if (fid === 'guild' && s.coins < 20) return 'Guild dues are 20 nyang.';
    if (fid === 'lotus' && !this.G.env.isNight) return 'The Lotus only meets in darkness. Return at night.';
    if (fid === 'lotus' && s.needs.honor > 75 && !s.has('Cunning')) return 'They do not trust someone so honourable…';
    return null;
  }

  join(s, fid, silent = false) {
    if (s.factions[fid]) return true;
    if (!silent) { const r = this.requirement(s, fid); if (r) { this.G.ui?.toast(r); return false; } }
    if (fid === 'guild' && !silent) s.coins -= 20;
    s.factions[fid] = { rep: 0, rank: 0 };
    if (fid === 'bandits') { s.faction = 'bandit'; s.outlaw = true; }
    const F = FACTIONS[fid];
    if (!silent) {
      this.G.log(F.secret ? `${s.name.full} has been initiated into a secret society.` : `${s.name.full} has joined the ${F.name} (${F.ko}).`, F.secret ? 'omen' : 'story', s.pos);
      s.addMoodlet('joined' + fid, `Joined the ${F.name}`, 10, 720);
    }
    if (s.household) this.newTask(s, fid);
    return true;
  }

  leave(s, fid) {
    if (!s.factions[fid]) return;
    delete s.factions[fid]; delete s.tasks[fid];
    if (fid === 'bandits') { s.faction = 'village'; }
    this.G.log(`${s.name.full} has left the ${FACTIONS[fid].name}.`, 'story', s.pos);
    if (fid === 'lotus' || fid === 'bandits') for (const m of this.members(fid)) m.changeRel(s, -40);
  }

  newTask(s, fid) {
    const tpl = pick(TASKS[fid]);
    const t = { ...tpl, progress: 0, fid };
    if (tpl.needNpc) {
      const pool = this.G.sims.filter((o) => !o.dead && o !== s && o.faction === 'village' && o.age !== 'child' && (!tpl.npcJob || tpl.npcJob.includes(o.job)) && !o.household && o.job !== 'king');
      t.npc = pick(pool) || null;
      if (!t.npc) return this.newTask(s, fid);
      t.text = tpl.text.replace('{npc}', t.npc.name.full);
    }
    s.tasks[fid] = t;
    return t;
  }

  notify(s, ev) {
    if (!s || !s.household) return;
    for (const fid in s.tasks) {
      const t = s.tasks[fid]; if (!t || !s.factions[fid]) continue;
      let add = 0;
      if (t.type === 'use' && ev.type === 'use' && t.kind.includes(ev.kind)) add = ev.minutes;
      else if (t.type === 'kill' && ev.type === 'kill') {
        const v = ev.victim;
        if (t.npc ? v === t.npc : (t.faction ? v.faction === t.faction : t.job ? t.job.includes(v.job) : true)) add = 1;
      } else if (t.type === 'duelWin' && ev.type === 'duelWin') add = 1;
      else if (t.type === 'social' && ev.type === 'social' && t.kinds.includes(ev.kind) && (!t.targetJob || t.targetJob.includes(ev.target.job))) add = 1;
      else if (t.type === 'talk' && ev.type === 'talk' && ev.target === t.npc) add = 1;
      else if (t.type === 'steal' && ev.type === 'steal') add = 1;
      else if (t.type === 'coins' && ev.type === 'coins') add = ev.amount;
      else if (t.type === 'donate' && ev.type === 'donate') add = ev.amount;
      if (!add) continue;
      t.progress += add;
      if (t.progress >= t.goal) this.complete(s, fid, t);
    }
  }

  complete(s, fid, t) {
    const m = s.factions[fid]; const F = FACTIONS[fid];
    const reward = 8 + m.rank * 6;
    m.rep += 30; s.earn(reward); s.needs.honor = Math.min(100, s.needs.honor + (fid === 'lotus' || fid === 'bandits' ? 0 : 10));
    this.G.ui?.toast(`✔ ${F.name}: “${t.text}” complete — +${reward} nyang, +reputation`, 'festival');
    this.G.audio?.ui();
    const need = (m.rank + 1) * 60;
    if (m.rep >= need && m.rank < F.ranks.length - 1) this.promote(s, fid);
    this.newTask(s, fid);
  }

  promote(s, fid) {
    const m = s.factions[fid]; const F = FACTIONS[fid];
    m.rank++;
    const title = this.rankTitle(s, fid);
    this.G.log(`${s.name.full} rises to ${title} of the ${F.name}!`, 'decree', s.pos);
    s.addMoodlet('promoted' + fid, `Promoted: ${title}`, 25, 1440);
    s.rankBonus = Math.max(s.rankBonus || 0, m.rank * 0.15);
    this.G.emit('promoted', { sim: s, fid, title });
    // perks
    if (fid === 'court' && m.rank >= 2 && !['king', 'queen', 'prince', 'princess', 'general', 'soldier'].includes(s.job) && s.job !== 'official') {
      s.job = 'official'; s.rebuildModel(); this.G.log(`${s.name.full} now serves the throne as a court official.`, 'decree', s.pos);
    }
    if (fid === 'hwarang' && !s.armed) { s.armed = true; s.rebuildModel(); this.G.ui?.toast('The Order grants you a sword.'); }
    if (fid === 'lotus' && m.rank >= 2) this.G.ui?.toast('The Lotus Master whispers: “When the Lotus strikes the palace, be there.”');
  }

  // ---------- Royal audience ----------
  audienceOptions(me) {
    const G = this.G; const k = G.king;
    const opts = [];
    const court = me.factions.court;
    opts.push({ id: 'pledge', label: 'Pledge loyalty to the throne', ok: !court });
    opts.push({ id: 'post', label: 'Petition for a higher post', ok: !!court });
    opts.push({ id: 'bandits', label: 'Report the bandits in the western woods', ok: true });
    opts.push({ id: 'silver', label: 'Beg for silver for my family', ok: true });
    const pr = G.sims.find((s) => s.job === 'princess' && !s.dead && !s.spouse);
    if (pr && me.sex === 'm' && !me.spouse && me.age !== 'child') opts.push({ id: 'princess', label: `Ask for the hand of Princess ${pr.name.given}`, ok: true, pr });
    opts.push({ id: 'duel', label: 'Ask to serve as His Majesty’s champion', ok: me.fighter });
    if (!['noble', 'official', 'king', 'queen', 'prince', 'princess'].includes(me.job)) opts.push({ id: 'yangban', label: 'Purchase a yangban (noble) title — 500 nyang', ok: me.coins >= 500 });
    return opts;
  }

  audience(me, id) {
    const G = this.G; const k = G.king; if (!k || k.dead) return 'There is no king upon the throne.';
    const rel = k.getRel(me); const honor = me.needs.honor;
    const favor = honor / 2 + rel.f / 2 + (me.factions.court?.rank || 0) * 8 + (me.champion ? 20 : 0);
    me.addMoodlet('audience', 'Had an audience with the King', 10, 600);
    k.changeRel(me, 2);
    switch (id) {
      case 'pledge':
        if (this.join(me, 'court')) { k.changeRel(me, 10); return `“Rise, ${me.name.given}. Serve us well, and you shall not be forgotten.”`; }
        return `“Return when your name carries more honour.”`;
      case 'post': {
        const m = me.factions.court;
        if (!m) return '“You do not serve this court.”';
        if (favor > 55 + m.rank * 8 && m.rep >= m.rank * 40) { this.promote(me, 'court'); return `“Your service pleases us. You are raised to ${this.rankTitle(me, 'court')}.”`; }
        k.changeRel(me, -3); return '“Ambition without merit is a dangerous thing. Prove yourself first.”';
      }
      case 'bandits':
        G.director.royalHunt?.(me);
        return '“Enough! The army will burn their nest. Ride with them if you have the stomach.”';
      case 'silver':
        if (favor > 45 && chance(0.7)) { const n = Math.floor(rr(30, 80)); me.earn(n); return `“Take ${n} nyang. Let it not be said our people starve.”`; }
        me.needs.honor = Math.max(0, me.needs.honor - 10); k.changeRel(me, -5); return '“Begging at the throne? Begone.”';
      case 'princess': {
        const pr = G.sims.find((s) => s.job === 'princess' && !s.dead && !s.spouse);
        const r = pr.getRel(me);
        if ((favor > 70 || me.champion || (me.factions.court?.rank || 0) >= 4) && r.f > 10) {
          G.director.wedding(me, pr);
          me.royalConsort = true;
          return `“Very well. Princess ${pr.name.given} shall be your bride. Treat her as the treasure she is.”`;
        }
        k.changeRel(me, -8); return `“My daughter? You?${r.f <= 10 ? ' She hardly knows your name.' : ''} Earn rank and glory first.”`;
      }
      case 'yangban':
        if (me.coins < 500) return '“Nobility is not given to the poor.”';
        me.coins -= 500; if (me.sex === 'm') me.job = 'noble'; me.finery = me.finery || { top: '#e8e2d2', bottom: '#3c5d8c', robe: '#3c5d8c' }; me.needs.honor = 100;
        this.join(me, 'court', true); me.factions.court.rank = Math.max(me.factions.court.rank, 2); me.rebuildModel();
        G.log(`${me.name.full} has been raised to the yangban aristocracy by royal patent.`, 'decree', me.pos);
        return '“So be it. Your house is now of the yangban. Wear the gat with dignity.”';
      case 'duel':
        if (me.skills.sword >= 7 || me.champion) { this.join(me, 'court', true); me.factions.court.rank = Math.max(me.factions.court.rank, 3); me.factions.court.rep += 60; return '“A blade like yours belongs at our side. You are named Royal Champion.”'; }
        return '“Win the tournament first, and we shall talk.”';
    }
    return '…';
  }

  // decrees available to a player-king
  decree(k, id) {
    const G = this.G; const vil = G.sims.filter((s) => s.faction === 'village' && !s.dead);
    if (id === 'lowerTax') { for (const s of vil) { s.coins += 5; s.addMoodlet('lowtax', 'Taxes lowered', 12, 1440); s.changeRel(k, 5); } k.coins -= vil.length * 5; G.log(`King ${k.name.given} lowers the grain tax. The people cheer.`, 'decree'); }
    if (id === 'raiseTax') { let sum = 0; for (const s of vil) { const n = Math.floor(s.coins * 0.15); s.coins -= n; sum += n; s.addMoodlet('taxed', 'Heavy taxes', -12, 1440); s.changeRel(k, -6); } k.coins += sum; G.log(`King ${k.name.given} raises taxes. ${sum} nyang flow into the treasury.`, 'decree'); }
    if (id === 'festival') { G.director.stop(); G.director.ev_festival(); }
    if (id === 'tournament') { G.director.stop(); G.director.ev_tournament(); }
    if (id === 'hunt') G.director.royalHunt?.(k);
    if (id === 'amnesty') { for (const s of G.sims) s.outlaw = false; G.log(`King ${k.name.given} grants a general amnesty.`, 'decree'); }
  }
}
