// Aspirations (life goals), satisfaction rewards and Deeds (achievements) for the player's household.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ASPIRATIONS = {
  blade: { name: 'Master of the Blade', ko: '검성', icon: '⚔', desc: 'Become a legend of the sword.', steps: [
    { t: 'Reach Sword skill 6', c: (s) => s.skills.sword >= 6 },
    { t: 'Win 3 duels', c: (s, A) => A.stat(s, 'duels') >= 3 },
    { t: 'Become Tournament Champion', c: (s) => !!s.champion },
    { t: 'Slay the mountain tiger, or reach Sword 10', c: (s) => s.tigerSlayer || s.skills.sword >= 9.95 },
  ] },
  wealth: { name: 'Prosperous House', ko: '부귀영화', icon: '◆', desc: 'Build a fortune that outlasts you.', steps: [
    { t: 'Have a net worth of 500', c: (s, A) => A.G.economy.netWorth(s) >= 500 },
    { t: 'Own a market stall', c: (s) => !!s.stall },
    { t: 'Own 2 houses', c: (s, A) => A.G.world.houses.filter((h) => h.owner === s.id).length >= 2 },
    { t: 'Become Rich (net worth 2000)', c: (s, A) => A.G.economy.netWorth(s) >= 2000 },
  ] },
  love: { name: 'Romantic at Heart', ko: '사랑꾼', icon: '❀', desc: 'Love deeply and raise a family.', steps: [
    { t: 'Have a sweetheart', c: (s, A) => A.G.sims.some((o) => o !== s && s.getRel(o).r > 45) },
    { t: 'Marry', c: (s) => !!s.spouse },
    { t: 'Have a child', c: (s) => s.children.length >= 1 },
    { t: 'Have 3 children', c: (s) => s.children.length >= 3 },
  ] },
  throne: { name: 'Path to the Throne', ko: '왕좌', icon: '王', desc: 'Rise through the court — or seize the crown.', steps: [
    { t: 'Join the Royal Court', c: (s) => !!s.factions.court },
    { t: 'Reach Secretary rank (3)', c: (s) => (s.factions.court?.rank || 0) >= 3 },
    { t: 'Be favoured by the King (friendship 40)', c: (s, A) => !!(A.G.king && !A.G.king.dead && A.G.king.getRel(s).f >= 40) || s.job === 'king' },
    { t: 'Marry royalty or become King', c: (s) => s.job === 'king' || !!s.royalConsort || ['princess', 'prince', 'queen'].includes(s.spouse?.job) },
  ] },
  scholar: { name: 'Scholar-Official', ko: '선비', icon: '筆', desc: 'Master the classics and serve the realm.', steps: [
    { t: 'Reach Scholarship 4', c: (s) => s.skills.scholarship >= 4 },
    { t: 'Pass the Gwageo exam (become an official)', c: (s) => s.job === 'official' || (s.factions.court?.rank || 0) >= 1 },
    { t: 'Reach Scholarship 8', c: (s) => s.skills.scholarship >= 8 },
    { t: 'Reach Magistrate rank (4)', c: (s) => (s.factions.court?.rank || 0) >= 4 },
  ] },
  friend: { name: 'Friend to All', ko: '인싸', icon: '☺', desc: 'Be loved by the whole valley.', steps: [
    { t: 'Have 3 friends', c: (s, A) => A.friends(s) >= 3 },
    { t: 'Have 6 friends', c: (s, A) => A.friends(s) >= 6 },
    { t: 'Have a sworn friend (friendship 60+)', c: (s, A) => A.G.sims.some((o) => o !== s && !o.dead && s.getRel(o).f > 60) },
    { t: 'Have 12 friends', c: (s, A) => A.friends(s) >= 12 },
  ] },
  shadow: { name: 'Shadow of the Lotus', ko: '흑련', icon: '蓮', desc: 'Rule the night from the shadows.', steps: [
    { t: 'Find and join the Black Lotus', c: (s) => !!s.factions.lotus },
    { t: 'Pick 3 pockets without being jailed', c: (s, A) => A.stat(s, 'steals') >= 3 },
    { t: 'Reach Blade of the Lotus (rank 2)', c: (s) => (s.factions.lotus?.rank || 0) >= 2 },
    { t: 'Become Lotus Master — or King', c: (s) => (s.factions.lotus?.rank || 0) >= 3 || s.job === 'king' },
  ] },
  dynasty: { name: 'Legendary Dynasty', ko: '명문가', icon: '家', desc: 'Found a line that lasts for generations.', steps: [
    { t: 'Have a child', c: (s) => s.children.length >= 1 },
    { t: 'See a child come of age', c: (s) => s.children.some((c) => c.age !== 'child') },
    { t: 'Have a grandchild', c: (s) => s.children.some((c) => c.children?.length) },
    { t: 'Your family reaches generation 4', c: (s, A) => A.G.household.some((h) => h.generation >= 4) },
  ] },
};

const REWARDS = [
  { id: 'iron', name: 'Iron Body', ko: '강철 몸', cost: 3, desc: '+30 max health', apply: (s) => { s.maxHp += 30; s.hp = s.maxHp; } },
  { id: 'tongue', name: 'Silver Tongue', ko: '달변', cost: 2, desc: '+2 charisma', apply: (s) => { s.skills.charisma = Math.min(10, s.skills.charisma + 2); } },
  { id: 'weary', name: 'Never Weary', ko: '불굴', cost: 3, desc: 'Energy drains 25% slower', apply: (s) => { s.perkNeverWeary = true; } },
  { id: 'blade', name: 'Heaven-sent Blade', ko: '천검', cost: 4, desc: '+1.5 sword skill', apply: (s) => { s.skills.sword = Math.min(10, s.skills.sword + 1.5); s.armed = true; } },
  { id: 'fortune', name: 'Pouch of Fortune', ko: '복주머니', cost: 2, desc: '+150 nyang', apply: (s) => { s.earn(150); } },
  { id: 'youth', name: 'Elixir of Youth', ko: '불로초', cost: 5, desc: 'Turn back the years (−2 days of age)', apply: (s) => { s.ageDays = Math.max(0, s.ageDays - 2); } },
  { id: 'charm', name: 'Beloved', ko: '인덕', cost: 3, desc: 'Everyone likes you a little more (+10 friendship with all)', apply: (s, G) => { for (const o of G.sims) if (o !== s && !o.dead) { const r = s.getRel(o); r.f = Math.min(100, r.f + 10); r.met = true; } } },
];

const DEEDS = [
  ['firstDuel', 'First Blood of Honour', 'Win a duel', (s, A) => A.stat(s, 'duels') >= 1],
  ['bandit', 'Bane of Bandits', 'Slay a bandit', (s, A) => A.stat(s, 'banditKills') >= 1],
  ['tiger', 'Tiger Slayer', 'Slay the Korean tiger', (s) => !!s.tigerSlayer],
  ['champion', 'Champion of Haeryeong', 'Win the martial tournament', (s) => !!s.champion],
  ['horse', 'Rider of the Valley', 'Own a horse', (s) => !!(s.horse && !s.horse.dead)],
  ['pet', 'Loyal Companion', 'Adopt a pet', (s) => !!(s.pet && !s.pet.dead)],
  ['married', 'Two Become One', 'Get married', (s) => !!s.spouse],
  ['parent', 'New Life', 'Have a child', (s) => s.children.length >= 1],
  ['bigfamily', 'A Full House', 'Have 4 children', (s) => s.children.length >= 4],
  ['court', 'In His Majesty’s Service', 'Join the Royal Court', (s) => !!s.factions.court],
  ['minister', 'Minister of State', 'Reach court rank 6', (s) => (s.factions.court?.rank || 0) >= 6],
  ['king', 'Son of Heaven', 'Become King', (s) => s.job === 'king'],
  ['consort', 'Royal Wedding', 'Marry into the royal family', (s) => !!s.royalConsort || ['princess', 'prince'].includes(s.spouse?.job)],
  ['lotus', 'Whispers in the Dark', 'Join the Black Lotus', (s) => !!s.factions.lotus],
  ['outlaw', 'Wanted', 'Have a bounty on your head', (s) => (s.bounty || 0) > 0 || s.outlaw],
  ['jailed', 'Behind Bars', 'Spend time in the Podocheong jail', (s) => !!s.jailed],
  ['rich', 'Rich as a Merchant Prince', 'Reach a net worth of 2000', (s, A) => A.G.economy.netWorth(s) >= 2000],
  ['landlord', 'Landlord', 'Own 3 houses', (s, A) => A.G.world.houses.filter((h) => h.owner === s.id).length >= 3],
  ['stall', 'Open for Business', 'Own a market stall', (s) => !!s.stall],
  ['yangban', 'Yangban', 'Become a noble', (s) => s.job === 'noble'],
  ['scholar', 'Brush of Wisdom', 'Reach Scholarship 8', (s) => s.skills.scholarship >= 8],
  ['master', 'Sword Saint', 'Reach Sword skill 10', (s) => s.skills.sword >= 9.95],
  ['friends', 'Beloved of the Valley', 'Have 10 friends', (s, A) => A.friends(s) >= 10],
  ['gen3', 'Third Generation', 'Your family reaches generation 3', (s, A) => A.G.household.some((h) => h.generation >= 3)],
  ['elder', 'Silver Hair', 'Live to old age', (s) => s.age === 'elder'],
  ['angler', 'Patient Angler', 'Earn 100 nyang from fishing & trade', (s, A) => A.stat(s, 'earned') >= 100],
  ['festival', 'Heart of the Festival', 'Enjoy a festival', (s) => s.moodlets.some((m) => m.id === 'festival')],
  ['survivor', 'Survivor', 'Survive a raid', (s) => s.moodlets.some((m) => m.id === 'raided' || m.id === 'safe')],
  ['winter', 'Four Seasons', 'Live through a full year', (s, A) => A.G.env.day >= 17],
  ['broke', 'Rags', 'Fall into destitution', (s, A) => A.G.economy.wealthClass(s)[0] === 'Destitute'],
];

export function createAspirationsSystem(G) {
  const A = {
    id: 'aspirations', G,
    data: {}, // simId -> { asp, step, points, stats:{}, perks:[] }
    deeds: {}, // deedId -> { by, day }
    checkT: 3,
    rec(s) { return (this.data[s.id] ||= { asp: null, step: 0, points: 0, stats: {}, perks: [] }); },
    stat(s, k) { return this.rec(s).stats[k] || 0; },
    bump(s, k, n = 1) { if (s?.household) { const st = this.rec(s).stats; st[k] = (st[k] || 0) + n; } },
    friends(s) { let n = 0; for (const o of G.sims) if (o !== s && !o.dead && s.getRel(o).f > 30) n++; return n; },

    init() {
      G.ui?.addTopButton('🎯 Goals', 'Aspirations & Deeds (J)', () => this.open());
      addEventListener('keydown', (e) => { if (e.code === 'KeyJ' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) this.open(); });
      // track earnings via a wrapper on earn (only for household)
      this._origEarn = null;
    },
    onEvent(name, p) {
      if (name === 'duel' && p.winner?.household) this.bump(p.winner, 'duels');
      if (name === 'steal' && p.thief?.household) this.bump(p.thief, 'steals');
      if (name === 'death' && p.killer?.household && p.sim?.faction === 'bandit') this.bump(p.killer, 'banditKills');
      if (name === 'ready' && !p.loaded) setTimeout(() => this.welcome(), 2500);
    },
    update(dt, gm) {
      this.checkT -= gm; if (this.checkT > 0) return; this.checkT = 3;
      for (const s of G.household) {
        if (s.dead) continue;
        const r = this.rec(s);
        // money earned stat (coins delta)
        if (r.lastCoins !== undefined && s.coins > r.lastCoins) r.stats.earned = (r.stats.earned || 0) + (s.coins - r.lastCoins);
        r.lastCoins = s.coins;
        if (s.factions?.lotus && r.lastSteal === undefined) r.lastSteal = 0;
        // aspiration milestones
        if (r.asp) {
          const asp = ASPIRATIONS[r.asp]; const step = asp.steps[r.step];
          if (step && step.c(s, this)) {
            r.step++; r.points += 1 + Math.floor(r.step / 2);
            s.addMoodlet('aspire', 'Fulfilled a life goal', 20, 720);
            G.ui?.toast(`${asp.icon} ${s.name.given}: “${step.t}” — milestone reached! (+${1 + Math.floor(r.step / 2)} satisfaction)`, 'festival');
            G.audio?.festival(true); setTimeout(() => G.audio?.festival(false), 2500);
            if (r.step >= asp.steps.length) { r.points += 3; G.log(`${s.name.full} has fulfilled the aspiration “${asp.name}” (${asp.ko}). A life well lived!`, 'tournament', s.pos); s.addMoodlet('aspire', 'Lifelong dream fulfilled!', 40, 4320); }
          }
        }
        // deeds
        for (const [id, title, desc, c] of DEEDS) {
          if (this.deeds[id]) continue;
          let ok = false; try { ok = c(s, this); } catch { ok = false; }
          if (ok) { this.deeds[id] = { by: s.name.full, day: G.env.day }; r.points += 1; G.ui?.toast(`🏅 Deed unlocked: ${title}`, 'tournament'); }
        }
      }
    },
    panelHtml(s) {
      if (!s.household) return '';
      const r = this.rec(s); if (!r.asp) return `<div class="facts">🎯 <a class="lnk" onclick="document.querySelector('#modebar button[title^=Aspirations]')?.click()">Choose a life goal</a></div>`;
      const asp = ASPIRATIONS[r.asp]; const step = asp.steps[r.step];
      return `<div class="facts">🎯 ${asp.icon} <b>${esc(asp.name)}</b> ${r.step}/${asp.steps.length}${step ? ` — next: ${esc(step.t)}` : ' — fulfilled!'} · ✦ ${r.points}</div>`;
    },
    welcome() {
      const hero = G.household[0]; if (!hero || document.querySelector('#title:not(.gone)')) { setTimeout(() => this.welcome(), 2000); return; }
      const el = G.ui.modal(`<h2>Welcome to Haeryeong · 해령에 오신 것을 환영합니다</h2>
        <p>You guide the <b>${esc(hero.name.surname)}</b> family in a living valley. Everyone here has needs, dreams and grudges — and the storyteller will throw raids, festivals, wars, plagues, romances and ghosts at you.</p>
        <ul class="tips"><li><b>Click your family</b> (top-left) and <b>click places or people</b> to act. Let them live on their own with free will, or take a sword yourself with <b>V</b>.</li>
        <li>Pick a <b>life goal</b> for each family member below — fulfilling milestones earns satisfaction points for powerful rewards.</li>
        <li>Open <b>⚑ Kingdom</b> to join factions, <b>🏠</b> for property, follow the <b>spirit wind (G)</b> to whatever is happening, and press <b>P</b> for photo mode.</li></ul>
        <button class="go">Choose life goals</button>`);
      el.querySelector('.go').onclick = () => { el.classList.add('hidden'); this.open(); };
    },
    open() {
      const render = () => {
        const fam = G.household.filter((s) => !s.dead);
        const el = G.ui.modal(`<h2>Aspirations & Deeds · 꿈과 업적</h2>
          ${fam.map((s) => { const r = this.rec(s); const asp = r.asp && ASPIRATIONS[r.asp];
            return `<div class="asp"><div class="asph"><img src="${G.ui.portraits.get(s)}"><div><b>${esc(s.name.full)}</b> <small>✦ ${r.points} satisfaction</small><br>${asp ? `${asp.icon} <b>${asp.name}</b> <em>${asp.ko}</em> <button data-clear="${s.id}">change</button>` : '<i>No life goal yet</i>'}</div></div>
            ${asp ? `<ol class="steps">${asp.steps.map((st, i) => `<li class="${i < r.step ? 'done' : i === r.step ? 'cur' : ''}">${i < r.step ? '✔' : i === r.step ? '▸' : '·'} ${esc(st.t)}</li>`).join('')}</ol>` : `<div class="aspgrid">${Object.entries(ASPIRATIONS).map(([k, a]) => `<button data-pick="${s.id}:${k}"><b>${a.icon} ${a.name}</b> <em>${a.ko}</em><small>${a.desc}</small></button>`).join('')}</div>`}
            <div class="rewards">${REWARDS.map((w) => `<button data-buy="${s.id}:${w.id}" ${r.points < w.cost || r.perks.includes(w.id) ? 'disabled' : ''} title="${esc(w.desc)}">${w.name} <em>${w.ko}</em> <small>✦${w.cost} · ${esc(w.desc)}</small></button>`).join('')}</div></div>`; }).join('')}
          <h3>Deeds 업적 — ${Object.keys(this.deeds).length}/${DEEDS.length}</h3>
          <div class="deeds">${DEEDS.map(([id, t, d]) => { const got = this.deeds[id]; return `<div class="deed ${got ? 'got' : ''}" title="${esc(d)}">${got ? '🏅' : '○'} <b>${esc(t)}</b><small>${got ? `${esc(got.by)}, day ${got.day}` : esc(d)}</small></div>`; }).join('')}</div>`);
        el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { const [id, k] = b.dataset.pick.split(':'); const s = G.sims.find((x) => x.id === +id); const r = this.rec(s); r.asp = k; r.step = 0; G.log(`${s.name.full} dreams of becoming: ${ASPIRATIONS[k].name}.`, 'story', s.pos); render(); }));
        el.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => { const r = this.data[+b.dataset.clear]; r.asp = null; r.step = 0; render(); }));
        el.querySelectorAll('[data-buy]').forEach((b) => (b.onclick = () => { const [id, wid] = b.dataset.buy.split(':'); const s = G.sims.find((x) => x.id === +id); const r = this.rec(s); const w = REWARDS.find((x) => x.id === wid); if (r.points < w.cost) return; r.points -= w.cost; r.perks.push(wid); w.apply(s, G); G.ui.toast(`${s.name.given} gains ${w.name}!`, 'festival'); render(); }));
      };
      render();
    },
    serialize() { return { data: Object.fromEntries(Object.entries(this.data).map(([k, v]) => [k, { ...v, lastCoins: undefined }])), deeds: this.deeds }; },
    restore(d) {
      this.data = d?.data || {}; this.deeds = d?.deeds || {};
      for (const [id, r] of Object.entries(this.data)) { const s = G.sims.find((x) => x.id === +id); if (s && r.perks?.includes('weary')) s.perkNeverWeary = true; }
    },
  };
  return A;
}
