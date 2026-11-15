import { JOBS } from './data.js';
import { rr, pick, chance, clamp } from './noise.js';
import { LAYOUT } from './terrain.js';

// Trade goods with daily-fluctuating prices
export const GOODS = {
  rice: { name: 'Rice (sack)', ko: '쌀', base: 8 },
  salt: { name: 'Sea salt', ko: '소금', base: 14 },
  silk: { name: 'Silk bolt', ko: '비단', base: 34 },
  ginseng: { name: 'Mountain ginseng', ko: '산삼', base: 70 },
  porcelain: { name: 'Celadon vase', ko: '청자', base: 120 },
};

// Things you can buy for yourself
export const ITEMS = [
  { id: 'tteok', name: 'Rice cakes (tteok)', ko: '떡', price: 3, use: (s) => { s.needs.hunger = Math.min(100, s.needs.hunger + 45); } },
  { id: 'makgeolli', name: 'Jug of makgeolli', ko: '막걸리', price: 4, use: (s) => { s.needs.fun = Math.min(100, s.needs.fun + 25); s.needs.social = Math.min(100, s.needs.social + 10); s.addMoodlet('tipsy', 'Tipsy', 8, 180); } },
  { id: 'medicine', name: 'Herbal medicine', ko: '한약', price: 12, use: (s) => { s.hp = s.maxHp; } },
  { id: 'norigae', name: 'Jade norigae ornament', ko: '노리개', price: 45, use: (s) => { s.needs.honor = Math.min(100, s.needs.honor + 15); s.addMoodlet('jewel', 'Wearing fine jade', 12, 2880); } },
  { id: 'finery', name: 'Fine silk hanbok', ko: '비단 한복', price: 90, use: (s, G) => { s.finery = pick([{ top: '#f2d8e0', bottom: '#7a2a6b', robe: '#3c5d8c' }, { top: '#e8f0d8', bottom: '#b8241e', robe: '#5b7d6f' }, { top: '#f6e6b0', bottom: '#2e4f8a', robe: '#7a3b8f' }]); s.rebuildModel(); s.addMoodlet('finery', 'Dressed in silk', 15, 4320); } },
  { id: 'blade', name: 'Master-forged hwando', ko: '환도', price: 80, use: (s) => { s.armed = true; s.fineBlade = true; s.skills.sword = Math.min(10, s.skills.sword + 0.6); if (!s.char.sword) s.rebuildModel(); } },
];

export const WEALTH = [
  [15, 'Destitute', '#c04a3a'], [60, 'Poor', '#d08a4a'], [250, 'Commoner', '#c8b070'], [700, 'Prosperous', '#9ac06a'], [2000, 'Wealthy', '#6ac0a0'], [Infinity, 'Rich', '#e8cf8f'],
];

export const JOB_SPOTS = { stallWork: 'merchant', shop: 'merchant', field: 'farmer', serve: 'innkeeper', study: 'scholar', fishWork: 'fisher', fish: 'fisher', guard: 'soldier', templeWork: 'monk', patrol: 'police', policeHall: 'police', trainWork: 'swordsman' };

export class Economy {
  constructor(G) {
    this.G = G; this.prices = {}; this.lastDay = 0;
    for (const k in GOODS) this.prices[k] = GOODS[k].base;
    this.crimeT = 200;
  }

  // ---------- Wealth ----------
  houseValue(h) { if (!h || h.virtual) return 0; const base = { hut: 60, cottage: 160, house: 480, mansion: 1500 }[h.tier] ?? (h.noble ? 500 : 160); return Math.round(base * (1 + (h.w || 9) / 20) * (1 + (h.level || 0) * 0.35)); }
  netWorth(s) {
    let w = s.coins;
    if (s.home && !s.home.virtual && s.home.owner === s.id) w += this.houseValue(s.home);
    for (const h of this.G.world.houses) if (h.owner === s.id && h !== s.home) w += this.houseValue(h);
    if (s.horse && !s.horse.dead) w += 120;
    for (const k in s.inv || {}) w += (s.inv[k] || 0) * this.prices[k];
    if (s.stall) w += 200;
    return Math.round(w - (s.debt?.amount || 0));
  }
  wealthClass(s) { const w = this.netWorth(s); for (const [lim, label, col] of WEALTH) if (w < lim) return [label, col, w]; return WEALTH[WEALTH.length - 1]; }

  // ---------- Trade ----------
  buyPrice(s, k) { return Math.ceil(this.prices[k] * (1.08 - (s.factions?.guild?.rank || 0) * 0.03)); }
  sellPrice(s, k) { return Math.floor(this.prices[k] * (0.9 + (s.factions?.guild?.rank || 0) * 0.03 + s.skills.charisma * 0.008)); }
  buyGood(s, k, n = 1) {
    const p = this.buyPrice(s, k) * n; if (s.coins < p) return this.G.ui?.toast('Not enough nyang.');
    s.coins -= p; s.inv = s.inv || {}; s.inv[k] = (s.inv[k] || 0) + n;
  }
  sellGood(s, k, n = 1) {
    if (!s.inv?.[k]) return; n = Math.min(n, s.inv[k]);
    const p = this.sellPrice(s, k) * n; s.inv[k] -= n; s.earn(p);
    this.G.factions?.notify(s, { type: 'social', kind: 'chat', target: s });
    s.skills.charisma = Math.min(10, s.skills.charisma + 0.05 * n);
  }
  buyItem(s, id) {
    const it = ITEMS.find((i) => i.id === id); if (!it) return;
    if (s.coins < it.price) return this.G.ui?.toast('Not enough nyang.');
    s.coins -= it.price; it.use(s, this.G);
    this.G.ui?.toast(`Bought ${it.name}.`);
  }
  buyStall(s) {
    if (s.stall) return this.G.ui?.toast('You already own a stall.');
    if (s.coins < 200) return this.G.ui?.toast('A market stall costs 200 nyang.');
    s.coins -= 200; s.stall = true;
    this.G.log(`${s.name.full} buys a market stall and opens a shop in the market street.`, 'story', s.pos);
  }

  // ---------- Loans ----------
  borrow(s, amount = 100) {
    if (s.debt) return this.G.ui?.toast('Pay your existing debt first.');
    s.debt = { amount: Math.round(amount * 1.3), due: this.G.env.day + 3 };
    s.earn(amount);
    this.G.ui?.toast(`Borrowed ${amount} nyang. You owe ${s.debt.amount} by day ${s.debt.due}.`);
  }
  repay(s) {
    if (!s.debt) return;
    if (s.coins < s.debt.amount) return this.G.ui?.toast(`You need ${s.debt.amount} nyang.`);
    s.coins -= s.debt.amount; s.debt = null; this.G.ui?.toast('Debt repaid. The moneylender smiles thinly.');
  }

  // ---------- Real estate ----------
  initHouses() {
    for (const h of this.G.world.houses) { h.level = h.level || 0; if (h.owner === undefined) h.owner = h.residents.find((r) => !r.dead && r.age !== 'child')?.id ?? null; }
  }
  buyHouse(s, h, asRental = false) {
    const price = this.houseValue(h);
    if (h.owner != null && h.residents.some((r) => !r.dead)) return this.G.ui?.toast('This house is occupied.');
    if (s.coins < price) return this.G.ui?.toast(`This house costs ${price} nyang.`);
    s.coins -= price; h.owner = s.id;
    if (!asRental) {
      for (const m of this.G.household) { if (['king', 'queen'].includes(m.job)) continue; if (m.home) m.home.residents = m.home.residents.filter((x) => x !== m); m.home = h; h.residents.push(m); }
      this.G.homeHouse = h;
      this.G.log(`The ${s.name.surname} family moves into a ${h.noble ? 'tiled hanok' : 'thatched house'} worth ${price} nyang.`, 'story', { x: h.x, z: h.z });
    } else this.G.log(`${s.name.full} buys a house to rent out to newcomers.`, 'story', { x: h.x, z: h.z });
  }
  sellHouse(s, h) {
    if (h.owner !== s.id) return;
    const price = Math.round(this.houseValue(h) * 0.85);
    if (h === s.home) return this.G.ui?.toast('You cannot sell the house you live in. Buy another first.');
    h.owner = null; s.earn(price); this.G.ui?.toast(`Sold for ${price} nyang.`);
  }
  renovate(s, h) {
    const cost = [120, 260, 520][h.level || 0];
    if (cost === undefined) return this.G.ui?.toast('This house is already magnificent.');
    if (s.coins < cost) return this.G.ui?.toast(`Renovation costs ${cost} nyang.`);
    s.coins -= cost; h.level = (h.level || 0) + 1;
    this.G.log(`The ${s.name.surname} home is renovated: ${['new ondol floors', 'lacquered furniture and folding screens', 'a walled garden with a lotus pond'][h.level - 1]}.`, 'story', { x: h.x, z: h.z });
    for (const m of h.residents) m.addMoodlet('renovated', 'Beautiful home', 10 + h.level * 4, 4320);
  }

  // ---------- Jobs ----------
  jobRequirement(s, job) {
    if (s.age === 'child') return 'Children go to school, not to work.';
    if (['king', 'queen', 'prince', 'princess'].includes(s.job)) return 'Royals do not take common work.';
    if (job === 'soldier' && s.skills.sword < 3) return 'The army requires Sword skill 3.';
    if (job === 'police' && (s.outlaw || s.needs.honor < 35)) return 'The Podocheong wants honest men and women (Honor ≥ 35, no crimes).';
    if (job === 'scholar' && s.skills.scholarship < 3) return 'You need Scholarship 3 to teach and study.';
    if (job === 'monk' && s.spouse) return 'Monks renounce marriage.';
    return null;
  }
  changeJob(s, job) {
    if (s.job === job) return;
    const r = this.jobRequirement(s, job); if (r) return this.G.ui?.toast(r);
    const old = s.job; s.job = job; s.workedToday = 0;
    if (JOBS[job].fighter) s.armed = true;
    if (job === 'soldier') { s.home && s.home.virtual ? null : null; this.G.factions?.join(s, 'court', true); }
    s.rebuildModel();
    this.G.log(`${s.name.full} leaves life as a ${JOBS[old].title.toLowerCase()} and becomes a ${JOBS[job].title.toLowerCase()}.`, 'story', s.pos);
  }

  // ---------- Crime & police ----------
  commitCrime(s, bounty, what) {
    s.outlaw = true; s.bounty = (s.bounty || 0) + bounty;
    if (what) this.G.log(`${s.name.full} is wanted for ${what}. Bounty: ${s.bounty} nyang.`, 'danger', s.pos);
  }
  jail(s, by) {
    const G = this.G; const cells = G.world.spots.jail;
    if (s.mount) G.animals.dismount(s);
    s.endFight(); s.cancelAction(); s.queue = [];
    const fine = Math.floor(Math.min(s.coins, s.bounty || 20)); s.coins -= fine;
    if (by && by !== s) { by.earn(Math.round((s.bounty || 20) * 0.5)); by.needs.honor = Math.min(100, by.needs.honor + 10); G.factions?.notify(by, { type: 'kill', victim: s }); }
    const c = cells[Math.floor(Math.random() * cells.length)];
    s.pos.set(c[0], s.pos.y, c[1]);
    s.jailed = { t: 0, dur: 300 + (s.bounty || 20) * 2 };
    s.action = { type: 'jailed', t: 0, phase: 'do', label: 'Imprisoned at the Podocheong' }; s.currentLabel = s.action.label;
    s.outlaw = false; s.bounty = 0; s.hp = Math.max(s.hp, s.maxHp * 0.4);
    if (s.controlled && G.player.mode === 'warrior') G.player.toggleMode('overseer');
    G.log(`${s.name.full} was arrested${by ? ' by ' + by.name.full : ''} and thrown into the Podocheong jail. Fined ${fine} nyang.`, 'danger', s.pos);
  }
  release(s, bail) {
    s.jailed = null; s.action = null; s.currentLabel = 'Idle';
    const d = this.G.world.spots.police; s.pos.set(d[0] + 2, s.pos.y, d[1] + 3);
    this.G.log(`${s.name.full} ${bail ? 'paid bail and' : ''} walks free from the Podocheong.`, 'story', s.pos);
    s.addMoodlet('freed', 'Free again', 10, 600);
  }
  payBail(s) {
    if (!s.jailed) return;
    const cost = 40;
    if (s.coins < cost) return this.G.ui?.toast('Bail is 40 nyang.');
    s.coins -= cost; this.release(s, true);
  }

  // police AI: spot outlaws nearby and arrest them
  policeScan(p) {
    if (p.combat.target || p.dead || p.hidden || p.jailed || p.controlled) return;
    let best = null, bd = 30;
    for (const o of this.G.simsNear(p.pos.x, p.pos.z).concat(this.G.household)) {
      if (!o.outlaw || o.dead || o.hidden || o.jailed || o === p || o.faction === 'bandit') continue;
      const d = o.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = o; }
    }
    if (best) { p.say(pick(['Halt! In the name of the Podocheong!', 'You there — stop!', 'Seize that criminal!']), 'shout'); p.startFight(best, true); p.arresting = best; }
  }

  // ---------- Daily & periodic ----------
  update(gm) {
    const G = this.G;
    // jail timers
    for (const s of G.sims) if (s.jailed) { s.jailed.t += gm; s.char.setAnim('kneel'); if (s.jailed.t > s.jailed.dur) this.release(s); }
    // police scanning (cheap, staggered)
    this.scanT = (this.scanT ?? 0) - gm;
    if (this.scanT <= 0) { this.scanT = 2; for (const p of G.sims) if ((p.job === 'police') && !p.dead) this.policeScan(p); }
    // petty crime by the desperate and the cunning
    this.crimeT -= gm;
    if (this.crimeT <= 0) {
      this.crimeT = rr(120, 300);
      const cands = G.sims.filter((s) => !s.dead && !s.household && s.faction === 'village' && s.age !== 'child' && !['police', 'king', 'queen', 'prince', 'princess', 'soldier', 'general', 'monk'].includes(s.job) && (s.coins < 12 || s.has('Cunning') || s.factions.lotus));
      const thief = pick(cands);
      if (thief && !thief.action?.type?.match(/fight|flee/)) {
        const victims = G.sims.filter((v) => v !== thief && !v.dead && !v.hidden && v.faction === 'village' && v.pos.distanceTo(thief.pos) < 40);
        const v = pick(victims);
        if (v) { const before = thief.outlaw; G.pickpocket(thief, v); if (!before && thief.outlaw) G.log(`${thief.name.full} is wanted for pickpocketing. Bounty: ${thief.bounty} nyang.`, 'danger', thief.pos); }
      }
    }
    // a new day
    if (G.env.day !== this.lastDay && G.env.hour > 6) {
      this.lastDay = G.env.day;
      for (const k in GOODS) { const drift = rr(-0.25, 0.3); this.prices[k] = Math.max(Math.round(GOODS[k].base * 0.5), Math.min(Math.round(GOODS[k].base * 2.2), Math.round(this.prices[k] * (1 + drift) * 0.6 + GOODS[k].base * 0.4))); }
      for (const s of G.sims) {
        if (s.dead) continue;
        // stall income & rent
        if (s.stall) { const n = Math.round(14 + s.skills.charisma * 3); s.earn(n); }
        for (const h of G.world.houses) if (h.owner === s.id && h.residents.some((r) => !r.dead && r.home === h && !G.household.includes(r))) s.earn(Math.round(this.houseValue(h) * 0.03));
        // debts
        if (s.debt && G.env.day > s.debt.due && !s.debt.defaulted) { s.debt.defaulted = true; s.needs.honor = Math.max(0, s.needs.honor - 25); this.commitCrime(s, Math.round(s.debt.amount * 0.5), 'defaulting on a debt to the moneylender'); }
        // wealth moods
        if (s.household || chance(0.2)) {
          const [label] = this.wealthClass(s);
          if (label === 'Destitute') s.addMoodlet('wealth', 'Penniless', -14, 1440); else if (label === 'Poor') s.addMoodlet('wealth', 'Struggling to get by', -5, 1440);
          else if (label === 'Wealthy') s.addMoodlet('wealth', 'Comfortable wealth', 8, 1440); else if (label === 'Rich') s.addMoodlet('wealth', 'Living in luxury', 14, 1440);
        }
      }
      if (G.household.length) { const top = Object.entries(this.prices).filter(([k]) => GOODS[k]).sort((a, b) => b[1] / GOODS[b[0]].base - a[1] / GOODS[a[0]].base)[0]; G.log(`Market rumour: ${GOODS[top[0]].name.toLowerCase()} sells high today (${top[1]} nyang).`, 'info', { x: 0, z: 78 }); }
    }
  }
}
