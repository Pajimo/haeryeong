// Accident of birth (팔자): where in the kingdom your family begins — chosen in the creator, or left
// to fate. A crown prince in the palace, a great yangban house, honest commoners, the poorest hut,
// bondage in a rich man's house, or the bandit camp in the western woods. Fate can even make you King.
export const BIRTHS = {
  fate: { icon: '🎲', name: 'Let fate decide', ko: '팔자', desc: 'Roll the dice of heaven. Most are born common; a lucky few are born to the palace — one in thirty to the throne itself.' },
  king: { icon: '👑', name: 'The young King', ko: '왕', desc: 'Your father has just abdicated. You sit the throne from day one — with every danger that comes with it.' },
  royal: { icon: '🏯', name: 'Royal heir', ko: '왕세자', desc: 'Born to the King and Queen. Guarded, envied, and next in line for the throne.' },
  yangban: { icon: '🏛', name: 'Yangban house', ko: '양반', desc: 'A walled mansion, servants, silver, and a name that opens the court’s doors.' },
  commoner: { icon: '🏡', name: 'Commoners', ko: '평민', desc: 'A thatched cottage and honest work. The usual start.' },
  poor: { icon: '🛖', name: 'Poor family', ko: '빈민', desc: 'A leaky hut and an empty rice jar. Everything must be earned.' },
  bond: { icon: '⛓', name: 'Born in bondage', ko: '노비', desc: 'You belong to a rich house. Work, endure — and buy or win your freedom.' },
  bandit: { icon: '🗡', name: 'Bandit camp', ko: '산적', desc: 'Raised among outlaws in the western woods, with a price on your head.' },
};
const FATE = [['king', 3], ['royal', 7], ['yangban', 14], ['commoner', 38], ['poor', 20], ['bond', 9], ['bandit', 9]];

export function rollFate() { let r = Math.random() * 100; for (const [k, w] of FATE) { r -= w; if (r <= 0) return k; } return 'commoner'; }

export function applyBirth(G, kind) {
  if (kind === 'fate') kind = rollFate();
  const hh = G.household.filter((s) => !s.dead); const hero = hh[0]; if (!hero) return kind;
  const sys = (id) => G.systems.find((x) => x.id === id);
  const moveTo = (house) => {
    // swap homes with the family that lived there
    const old = G.homeHouse; if (!house || house === old) return;
    const them = (house.residents || []).filter((r) => !r.dead);
    house.residents = []; if (old) old.residents = (old.residents || []).filter((r) => !hh.includes(r));
    for (const s of hh) { s.home = house; house.residents.push(s); const d = house.door || [house.x, house.z]; s.pos.set(d[0] + (Math.random() - 0.5) * 3, s.pos.y, d[1] + (Math.random() - 0.5) * 3); }
    for (const r of them) { r.home = old; old?.residents.push(r); if (old) { const d = old.door; r.pos.set(d[0] + (Math.random() - 0.5) * 3, r.pos.y, d[1] + (Math.random() - 0.5) * 3); } }
    G.homeHouse = house;
  };
  const tierHouse = (t) => G.world.houses.filter((h) => h.tier === t && h !== G.homeHouse).sort(() => Math.random() - 0.5)[0];
  let line = '';
  if (kind === 'king' || kind === 'royal') {
    const k = G.king; const q = G.sims.find((s) => !s.dead && s.job === 'queen');
    const royalHome = G.vhouses?.royal;
    for (const s of hh) {
      if (s.age === 'elder') { s.job = 'noble'; s.title2 = 'Dowager'; }
      else { s.job = s.sex === 'f' ? 'princess' : 'prince'; s.parents = [k, q].filter(Boolean); for (const p of s.parents) { p.children = p.children || []; p.children.push(s); p.getRel(s).f = 70; s.getRel(p).f = 60; } }
      s.name.surname = k?.name.surname || s.name.surname; s.name.full = `${s.name.surname} ${s.name.given}`;
      if (royalHome) { if (s.home?.residents) s.home.residents = s.home.residents.filter((x) => x !== s); s.home = royalHome; royalHome.residents.push(s); }
      s.coins = 300; s.needs.honor = 90; s.armed = true; s.look = null; s.uniform = null; s.rebuildModel();
      const d = royalHome?.door; if (d) s.pos.set(d[0] + (Math.random() - 0.5) * 4, s.pos.y, d[1] + (Math.random() - 0.5) * 4);
    }
    const RP = sys('royalPower'); if (RP) RP.st.heir = hero.id;
    if (kind === 'king' && k) {
      const old = k; old.job = 'noble'; old.retired = true; old.rebuildModel();
      G.crown(hero, `inherits the throne as his father, ${old.name.given}, lays down the crown and retires to a quiet pavilion`);
      line = `${hero.name.full} is crowned King of Haeryeong at the start of the story.`;
    } else line = `${hero.name.full} is born a child of the royal house, heir to King ${k?.name.given || ''}.`;
  } else if (kind === 'yangban') {
    moveTo(tierHouse('mansion') || tierHouse('house'));
    for (const s of hh) { s.coins = 450; s.needs.honor = 80; s.finery = { top: '#f2e6cc', bottom: '#2d4a6b', robe: '#3c5d8c' }; s.rebuildModel(); }
    const SV = sys('servants'); if (SV) { /* the mansion's servants now serve your family */ for (const sv of SV.all()) if (sv.serf.house === G.homeHouse.id) sv.serf.master = hero.id; }
    line = `${hero.name.full} is born into a great yangban house behind tiled walls.`;
  } else if (kind === 'poor') {
    moveTo(tierHouse('hut'));
    for (const s of hh) s.coins = 3 + Math.floor(Math.random() * 8);
    line = `${hero.name.full} is born in a leaking hut on the edge of the village.`;
  } else if (kind === 'bond') {
    const m = G.world.houses.find((h) => h.tier === 'mansion') || tierHouse('house');
    const master = (m?.residents || []).find((r) => !r.dead && r.age !== 'child' && !r.serf);
    for (const s of hh) s.coins = 0;
    if (m && master) { hero.job = 'servant'; hero.serf = { kind: 'bond', master: master.id, house: m.id, loyalty: 50, wage: 0, player: true }; hero.uniform = { outfit: 'commoner', colors: { top: '#b7aa90', bottom: '#8a7e6a' }, hat: 'headband' }; hero.rebuildModel(); const d = m.door; hero.pos.set(d[0] + 2, hero.pos.y, d[1] + 2); }
    line = `${hero.name.full} is born a bondservant (노비) of the ${master?.name.surname || ''} house. Freedom costs 150 nyang — or courage.`;
  } else if (kind === 'bandit') {
    for (const s of hh) { if (s.age === 'elder') continue; G.factions?.join(s, 'bandits', true); s.faction = 'bandit'; s.outlaw = true; s.bounty = 40; s.armed = true; s.rebuildModel(); }
    line = `${hero.name.full} grows up among the bandits of the western woods, wanted before they could walk.`;
  } else line = `${hero.name.full} is born to honest commoners in a thatched cottage.`;
  G.birth = kind;
  G.log(`${BIRTHS[kind].icon} ${line}`, 'story', hero.pos);
  G.ui?.refreshHousehold?.();
  for (const s of hh) G.ui?.portraits?.cache.delete(s.id);
  return kind;
}

// a born bondservant can buy their own freedom
export function birthMenu(G, me, o) {
  if (me !== o || !me.serf?.player) return [];
  return [{ label: '🕊 Buy your own freedom (150 nyang)', disabled: me.coins < 150, fn: () => { me.coins -= 150; me.serf = null; me.job = 'farmer'; me.uniform = null; me.rebuildModel(); me.addMoodlet('free', 'Free at last', 40, 4320); G.log(`${me.name.full} lays 150 nyang before the master and walks out of the gate a free person.`, 'story', me.pos); } }];
}
