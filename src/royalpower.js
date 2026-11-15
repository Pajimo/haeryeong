// The power of the crown (왕권) and the heart of the people (민심).
// Whoever wears the crown — you, or an AI king ruling by temperament — governs the valley: taxes and
// granaries, laws and pardons, war and tribute, festivals and prohibitions, titles, banishments and
// confiscations. Every command moves the people's heart. A beloved crown is showered with gifts and
// volunteers; a hated one faces protests, riots, and at the last, a peasant army at the palace gate.
// Royal family members have their own duties: alms, village visits, petitions — and ambitions.
import { LAYOUT } from './terrain.js';

const TAX = { low: ['Light', 0.6, 3], normal: ['Customary', 1, 0], high: ['Heavy', 1.5, -4], crushing: ['Crushing', 2.1, -9] };

export function createRoyalPowerSystem(G) {
  const st = { minsim: 55, tax: 'normal', law: 'normal', grain: 60, cool: {}, dryUntil: -1, mourning: -1, aiT: 0.6, lastBand: 'content', rebels: null, heir: null, reign: [] };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = () => G.env.day + G.env.hour / 24;
  const sys = (id) => G.systems.find((x) => x.id === id);
  const RW = () => sys('royalWorks');
  const treasury = () => RW()?.st?.treasury ?? 0;
  const spend = (n) => { const r = RW(); if (!r) return false; if (r.st.treasury < n) return false; r.st.treasury -= n; return true; };
  const gain = (n) => { const r = RW(); if (r) r.st.treasury += n; };
  const vil = () => G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'village' && !['king', 'queen', 'prince', 'princess'].includes(s.job));
  const king = () => (G.king && !G.king.dead ? G.king : null);
  const heart = (d, why) => { const before = band(); st.minsim = Math.max(0, Math.min(100, st.minsim + d)); const k = king(); if (k && Math.abs(d) >= 3) for (const s of vil()) if (Math.random() < 0.5) s.changeRel(k, d * 0.6); if (why) st.reign.unshift({ day: G.env.day, why, d }); st.reign.length = Math.min(st.reign.length, 12); if (band() !== before) bandChanged(before); };
  function band() { const m = st.minsim; return m >= 75 ? 'beloved' : m >= 45 ? 'content' : m >= 25 ? 'restless' : m >= 12 ? 'angry' : 'revolt'; }
  const BANDS = { beloved: ['Beloved', '성군', '#2d6b4c'], content: ['Content', '태평', '#6b7a3a'], restless: ['Restless', '민심 동요', '#b8862a'], angry: ['Angry', '원성', '#b8452a'], revolt: ['On the brink of revolt', '민란', '#7d1f1f'] };
  function bandChanged(before) {
    const b = band(), k = king(); const name = k ? `King ${k.name.given}` : 'the throne';
    const lines = { beloved: `Children sing songs in praise of ${name} at the wells. The people's heart (민심) is full.`, content: `The valley grumbles little and works much. All is calm under ${name}.`, restless: `Muttering in the jumak, scrawled complaints on the palace wall. The people's heart turns against ${name}.`, angry: `Crowds gather at the palace gate. The people are ANGRY with ${name}.`, revolt: `Torches in the hills at night. Peasants sharpen sickles. The valley is on the edge of revolt against ${name}!` };
    G.log(lines[b], ['angry', 'revolt'].includes(b) ? 'danger' : b === 'beloved' ? 'festival' : 'story', { x: LAYOUT.palaceGate[0], z: LAYOUT.palaceGate[1] });
    if (G.household.some((s) => ['king', 'queen', 'prince', 'princess'].includes(s.job))) G.ui?.toast(`민심 · The people are ${BANDS[b][0].toLowerCase()}.`, ['angry', 'revolt'].includes(b) ? 'danger' : 'story');
    void before;
  }
  const cd = (k, days) => { if ((st.cool[k] || -9) > day()) return false; st.cool[k] = day() + days; return true; };
  const ready = (k) => !((st.cool[k] || -9) > day());

  // ---------------- the commands of the crown ----------------
  const CMDS = [
    // economy
    { id: 'tax_low', g: 'Treasury & grain', label: 'Lighten the taxes', when: () => st.tax !== 'low', do: () => setTax('low') },
    { id: 'tax_normal', g: 'Treasury & grain', label: 'Restore the customary tax', when: () => st.tax !== 'normal', do: () => setTax('normal') },
    { id: 'tax_high', g: 'Treasury & grain', label: 'Raise taxes', when: () => st.tax !== 'high', do: () => setTax('high') },
    { id: 'tax_crush', g: 'Treasury & grain', label: 'Impose crushing taxes', when: () => st.tax !== 'crushing', do: () => setTax('crushing') },
    { id: 'granary', g: 'Treasury & grain', label: 'Open the royal granaries to the hungry', cd: 2, when: () => st.grain >= 20, do: (k) => { st.grain -= 20; for (const s of vil()) { s.needs.hunger = Math.min(100, s.needs.hunger + 45); s.addMoodlet('granary', 'Rice from the royal granary', 10, 1440); } heart(+9, 'opened the granaries'); return `Carts of rice roll from the palace storehouses. Mothers weep with relief and bless ${k.name.given}'s name.`; } },
    { id: 'requisition', g: 'Treasury & grain', label: 'Requisition grain from the villages', cd: 3, do: () => { st.grain += 30; gain(60); for (const s of vil()) { s.needs.hunger = Math.max(0, s.needs.hunger - 20); s.addMoodlet('requisition', 'Grain seized by the crown', -10, 1440); } heart(-9, 'requisitioned grain'); return 'Soldiers go door to door with sacks. The storehouses fill; the cooking pots do not.'; } },
    { id: 'debase', g: 'Treasury & grain', label: 'Debase the coinage (+300 to the treasury)', cd: 6, do: () => { gain(300); const P = G.economy?.prices; if (P) for (const k in P) P[k] = Math.round(P[k] * 1.25); heart(-6, 'debased the coinage'); return 'New coins ring dull with lead. The treasury swells, and by noon every price in the market has risen a quarter.'; } },
    { id: 'charter', g: 'Treasury & grain', label: 'Grant the merchants a royal charter (80)', cost: 80, cd: 5, do: () => { for (const s of G.sims) if (!s.dead && s.job === 'merchant') { s.earn(15); s.addMoodlet('charter', 'Royal charter', 10, 2880); } heart(+3, 'chartered the merchants'); return 'Merchants hang the royal seal over their stalls. Trade quickens.'; } },
    // justice
    { id: 'amnesty', g: 'Law & justice', label: 'Proclaim a general amnesty', cd: 4, do: () => { let n = 0; for (const s of G.sims) if (s.outlaw && !s.dead) { s.outlaw = false; s.bounty = 0; n++; } for (const s of G.sims) if (s.jailed) G.economy?.release?.(s); heart(+6, 'granted an amnesty'); return `The jail doors swing open and ${n} warrants are burned in the square. Families embrace at the Podocheong gate.`; } },
    { id: 'harsh', g: 'Law & justice', label: 'Decree harsh laws', when: () => st.law !== 'harsh', do: () => { st.law = 'harsh'; heart(-4, 'decreed harsh laws'); return 'Constables double their patrols. Thieves are flogged in the square. Crime falls — and so do smiles.'; } },
    { id: 'lenient', g: 'Law & justice', label: 'Decree merciful laws', when: () => st.law !== 'lenient', do: () => { st.law = 'lenient'; heart(+3, 'softened the laws'); return 'Floggings are forbidden and fines halved. The poor breathe easier; pickpockets grow bold.'; } },
    { id: 'execute', g: 'Law & justice', label: 'Order a public execution of a prisoner', cd: 3, when: () => G.sims.some((s) => s.jailed && !s.dead && !s.household), do: () => { const p = G.sims.find((s) => s.jailed && !s.dead && !s.household); G.economy?.release?.(p); p.die(null); heart(st.law === 'harsh' ? -2 : -7, 'executed a prisoner'); for (const s of vil()) s.addMoodlet('execution', 'Saw an execution', -6, 720); return `${p.name.full} is beheaded before the Podocheong. The crowd is silent. No one steals for a week.`; } },
    { id: 'petitions', g: 'Law & justice', label: 'Hear the petitions of the people (sinmungo 신문고)', cd: 1, do: (k) => { petitions(k); return null; } },
    // war and peace
    { id: 'war', g: 'War & peace', label: 'Declare war on a neighbouring realm…', when: () => !sys('war')?.st?.war, do: (k) => { chooseRealm(k); return null; } },
    { id: 'peace', g: 'War & peace', label: 'Sue for peace (150 to the enemy)', cost: 150, when: () => !!sys('war')?.st?.war, do: () => { sys('war')?.api?.treaty('peace'); heart(+5, 'made peace'); return 'Envoys ride out under white banners. The war is over — bought with silver.'; } },
    { id: 'tribute', g: 'War & peace', label: 'Send tribute to the most dangerous realm (100)', cost: 100, cd: 4, when: () => !sys('war')?.st?.war, do: () => { const W = sys('war'); const rs = W?.st?.realms || {}; const rid = Object.keys(rs).sort((a, b) => rs[b].tension - rs[a].tension)[0]; if (rid) W.api.bump(rid, -30); heart(-2, 'paid tribute'); return `Silk and silver go north to ${rid ? rid[0].toUpperCase() + rid.slice(1) : 'the border'}. Tension eases; the proud grumble about kneeling.`; } },
    { id: 'demand', g: 'War & peace', label: 'Demand tribute from a weaker realm', cd: 5, when: () => !sys('war')?.st?.war, do: () => { const W = sys('war'); const rs = W?.st?.realms || {}; const rid = Object.keys(rs).sort((a, b) => rs[a].strength - rs[b].strength)[0]; if (!rid) return 'No realm answers.'; if (Math.random() < 0.55) { gain(120); W.api.bump(rid, 15); heart(+3, 'won tribute'); return `${rid[0].toUpperCase() + rid.slice(1)} pays 120 nyang rather than fight. The court toasts the King's boldness.`; } W.api.bump(rid, 40); heart(-2, 'was refused tribute'); return `${rid[0].toUpperCase() + rid.slice(1)} sends back the envoy's beard in a box. War drums sound in the north.`; } },
    { id: 'conscript', g: 'War & peace', label: 'Conscript young men into the army (40)', cost: 40, cd: 4, do: () => { const vh = G.vhouses?.barracks; let n = 0; for (const s of vil().filter((x) => x.sex === 'm' && x.age === 'young' && !x.household && x.job !== 'soldier').slice(0, 4)) { s.job = 'soldier'; s.armed = true; s.home = vh || s.home; s.rebuildModel(); s.addMoodlet('conscripted', 'Conscripted', -12, 2880); n++; } heart(-7, 'conscripted the young'); return `${n} young men are marched to the barracks. Their mothers follow the column to the palace gate.`; } },
    // society
    { id: 'festival', g: 'Feasts & faith', label: 'Proclaim a royal festival (60)', cost: 60, cd: 3, do: () => { G.director?.stop?.(); G.director?.ev_festival?.(); heart(+6, 'proclaimed a festival'); return 'Lanterns go up, rice wine flows, and for one night no one remembers their troubles.'; } },
    { id: 'banquet', g: 'Feasts & faith', label: 'Hold a royal banquet for the nobles', cd: 3, do: () => { G.director?.stop?.(); G.director?.ev_banquet?.(); sys('politics') && (sys('politics').st.backing.west = Math.min(100, sys('politics').st.backing.west + 5)); heart(-1, 'feasted the nobles'); return 'The nobles feast on roast pheasant; the gate guards smell it all night.'; } },
    { id: 'hunt', g: 'Feasts & faith', label: 'Lead a royal hunt against the bandits', cd: 3, do: (k) => { G.director?.royalHunt?.(k); heart(+2, 'hunted bandits'); return 'Horns sound. The royal guard rides for the western woods.'; } },
    { id: 'sacrifice', g: 'Feasts & faith', label: 'Offer the great sacrifice to Heaven (50)', cost: 50, cd: 6, do: () => { st.blessed = day() + 8; heart(+5, 'sacrificed to Heaven'); return 'A white ox on the altar, smoke rising straight to Heaven. The shamans say the coming harvest is blessed.'; } },
    { id: 'dry', g: 'Feasts & faith', label: 'Ban rice wine (prohibition, 금주령)', when: () => st.dryUntil < day(), do: () => { st.dryUntil = day() + 3; heart(-4, 'banned rice wine'); return 'The jumak taps are sealed with the royal seal. Brawls vanish. So does laughter.'; } },
    // patronage
    { id: 'reward', g: 'Patronage', label: 'Reward the most honoured subject (50)', cost: 50, cd: 2, do: () => { const s = vil().sort((a, b) => b.needs.honor - a.needs.honor)[0]; if (!s) return ''; s.earn(50); s.addMoodlet('royalgift', 'Rewarded by the King', 15, 2880); heart(+2, 'rewarded a subject'); return `${s.name.full} kneels to receive a purse of silver and a robe from the royal hand.`; } },
    { id: 'title', g: 'Patronage', label: 'Grant a court title to a member of your house', when: () => G.household.some((s) => !s.dead && s.factions?.court && s.factions.court.rank < 6 && s.job !== 'king'), cd: 4, do: () => { const s = G.household.find((x) => !x.dead && x.factions?.court && x.factions.court.rank < 6 && x.job !== 'king'); s.factions.court.rank++; sys('politics') && (sys('politics').st.backing.east = Math.max(0, sys('politics').st.backing.east - 6)); heart(-2, 'favoured his own house'); return `${s.name.full} is raised to ${G.factions.rankTitle(s, 'court')}. The ministers whisper about favouritism.`; } },
    { id: 'banish', g: 'Patronage', label: 'Banish the head of the rival clan', cd: 6, when: () => { const r = sys('rivals'); return r?.clan && r.head && !r.head.dead && !r.allied; }, do: () => { const r = sys('rivals'); const h = r.head; h.setHidden(true); h.missionLock = true; h.exiled = true; r.enmity = 100; r.head = null; heart(-3, 'banished a noble'); return `${h.name.full} is stripped of rank and marched to a distant island. The ${r.clan} clan will never forgive this.`; } },
    { id: 'heir', g: 'Patronage', label: 'Name a crown prince or princess', when: () => !st.heir, do: (k) => { const h = (k.children || []).find((c) => !c.dead) || G.sims.find((s) => !s.dead && s.job === 'prince'); if (!h) return 'There is no child of the royal blood to name.'; st.heir = h.id; heart(+3, 'named an heir'); return `${h.name.full} is proclaimed heir to the throne. The succession is secure.`; } },
    // tyranny
    { id: 'seize', g: 'The iron fist', label: 'Seize the wealth of the richest house', cd: 6, do: () => { const rich = G.sims.filter((s) => !s.dead && !s.household && !['king', 'queen', 'prince', 'princess'].includes(s.job)).sort((a, b) => b.coins - a.coins)[0]; if (!rich) return ''; const take = Math.floor(rich.coins * 0.6); rich.coins -= take; gain(take); rich.addMoodlet('seized', 'Robbed by the crown', -30, 4320); for (const s of vil()) if (Math.random() < 0.4) s.changeRel(king(), -5); heart(-10, 'seized a fortune'); return `Soldiers carry ${take} nyang out of ${rich.name.full}'s house. Every rich family in the valley locks its gate.`; } },
    { id: 'forced', g: 'The iron fist', label: 'Order forced labour on the royal works', cd: 5, when: () => (RW()?.st?.projects || []).length > 0, do: () => { for (const p of RW().st.projects) p.done -= 1; for (const s of vil().slice(0, 15)) { s.needs.energy = Math.max(0, s.needs.energy - 40); s.addMoodlet('forced', 'Forced labour', -14, 1440); } heart(-8, 'forced labour'); return 'Men are dragged from their fields to haul stone. The works rise a day sooner; the harvest will suffer.'; } },
  ];
  function setTax(k) { const was = st.tax; st.tax = k; const P = sys('politics'); if (P) P.st.taxes = { low: -1, normal: 0, high: 1, crushing: 2 }[k]; heart((TAX[k][2] - (TAX[was]?.[2] || 0)) * 1.2, `set ${TAX[k][0].toLowerCase()} taxes`); return `The tax rolls are rewritten: ${TAX[k][0].toLowerCase()} taxes from today. ${k === 'low' ? 'The markets cheer.' : k === 'crushing' ? 'Farmers stare at their rice jars in despair.' : k === 'high' ? 'Grumbling at every well.' : 'Things return to the old ways.'}`; }
  function run(cmd, k) {
    if (cmd.cost && !spend(cmd.cost)) return G.ui.toast(`The treasury holds only ${treasury()} nyang.`);
    if (cmd.cd && !cd(cmd.id, cmd.cd)) return G.ui.toast('Too soon — the court is still reeling from the last such order.');
    const out = cmd.do(k);
    if (out) { G.log(`📜 By royal decree of ${k.job === 'king' ? 'King ' : ''}${k.name.given}: ${out}`, 'decree', k.pos); if (k.household) G.ui.modal(`<h2>어명 · The Royal Command</h2><p class="sg-text">${esc(out)}</p><p class="po-hint">민심 (the people's heart): <b>${Math.round(st.minsim)}</b> — ${BANDS[band()][0]}.</p>`); }
  }
  function chooseRealm(k) {
    const W = sys('war'); const rs = W?.st?.realms || {};
    const el = G.ui.modal(`<h2>Declare War · 선전포고</h2><p>Which realm shall feel the wrath of Haeryeong?</p><div class="po-ch">${Object.entries(rs).map(([id, r]) => `<button data-r="${id}">${id[0].toUpperCase() + id.slice(1)} <small>(strength ${Math.round(r.strength)}, tension ${Math.round(r.tension)})</small></button>`).join('')}</div>`);
    el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { W.api.declareWar(b.dataset.r); heart(-6, 'declared war'); el.classList.add('hidden'); G.log(`⚔ ${k.name.full} declares war on ${b.dataset.r}! Mothers hide their sons; generals sharpen their swords.`, 'danger'); }));
  }
  function petitions(k) {
    const P = [
      { who: 'A widow', ask: 'relief for her children after her husband drowned', yes: () => { spend(20); heart(+3); return 'She is given 20 nyang and a sack of rice.'; }, no: () => { heart(-2); return 'She is sent away weeping.'; } },
      { who: 'The farmers of the paddies', ask: 'a delay of this season’s tax after the floods', yes: () => { gain(-30); heart(+5); return 'The tax is deferred. The farmers bow to the ground.'; }, no: () => { gain(30); heart(-4); return 'The tax will be collected in full.'; } },
      { who: 'A rich merchant', ask: 'a monopoly on salt — with a "gift" of 120 nyang to the treasury', yes: () => { gain(120); heart(-4); return 'The salt monopoly is granted. Salt prices climb by the week.'; }, no: () => { heart(+2); return 'The merchant is shown the door. The fishermen cheer.'; } },
      { who: 'A father', ask: 'justice: a noble’s son crippled his boy in a drunken brawl', yes: () => { heart(+5); sys('politics') && (sys('politics').st.backing.west = Math.max(0, sys('politics').st.backing.west - 8)); return 'The noble’s son is flogged and fined. The old houses are furious; the people adore you.'; }, no: () => { heart(-6); return 'The noble walks free. The father curses the throne in the square.'; } },
      { who: 'The temple monks', ask: 'royal land for a new hermitage', yes: () => { heart(+2); spend(30); return 'A hillside is granted. The monks chant for the King’s long life.'; }, no: () => { heart(-1); return 'The abbot bows politely and leaves without a word.'; } },
      { who: 'A soldier’s mother', ask: 'her only son released from the army', yes: () => { heart(+3); const s = G.sims.find((x) => !x.dead && x.job === 'soldier' && x.age === 'young'); if (s) { s.job = 'farmer'; s.rebuildModel(); } return 'He comes home to till the family field.'; }, no: () => { heart(-2); return 'The army needs every man. She leaves in silence.'; } },
      { who: 'A scholar', ask: 'the right to criticise the ministers without punishment', yes: () => { heart(+3); sys('politics') && (sys('politics').st.backing.east = Math.min(100, sys('politics').st.backing.east + 6)); return 'A drum of petitions is hung at the palace gate for any subject to strike.'; }, no: () => { heart(-2); return 'The scholar is told to mind his books.'; } },
    ].sort(() => Math.random() - 0.5).slice(0, 3);
    let i = 0; const res = [];
    const show = () => {
      if (i >= P.length) { G.log(`👑 ${k.name.full} hears the people's petitions: ${res.join(' ')}`, 'decree', k.pos); G.ui.modal(`<h2>The Petitions Are Heard</h2><p class="sg-text">${res.map(esc).join('<br>')}</p><p class="po-hint">민심: <b>${Math.round(st.minsim)}</b> — ${BANDS[band()][0]}.</p>`); return; }
      const p = P[i];
      const el = G.ui.modal(`<h2>The Petition Drum · 신문고 <small>(${i + 1}/${P.length})</small></h2><p class="sg-text"><b>${esc(p.who)}</b> kneels before the throne and begs for ${esc(p.ask)}.</p><div class="po-ch"><button data-y>Grant it</button><button data-n>Refuse</button></div>`);
      el.querySelector('[data-y]').onclick = () => { res.push(`${p.who}: granted — ${p.yes()}`); i++; show(); };
      el.querySelector('[data-n]').onclick = () => { res.push(`${p.who}: refused — ${p.no()}`); i++; show(); };
    };
    show();
  }
  function openThrone(k) {
    const groups = {}; for (const c of CMDS) { if (c.when && !c.when()) continue; (groups[c.g] ||= []).push(c); }
    const b = BANDS[band()];
    const el = G.ui.modal(`<h2>어명 · Royal Commands</h2>
      <div class="rp-heart"><div><b>민심 · The people's heart</b> <span style="color:${b[2]}">${b[0]} (${b[1]})</span></div><div class="rp-bar"><i style="width:${st.minsim}%;background:${b[2]}"></i></div>
      <small>Treasury ${treasury()} nyang · granary ${st.grain} carts · taxes ${TAX[st.tax][0].toLowerCase()} · laws ${st.law}${st.dryUntil > day() ? ' · rice wine banned' : ''}${st.heir ? ` · heir: ${esc(G.sims.find((s) => s.id === st.heir)?.name.given || '—')}` : ''}</small>
      ${st.reign.length ? `<small class="rp-reign">Lately the people remember that you ${st.reign.slice(0, 4).map((r) => `${r.why} (${r.d > 0 ? '+' : ''}${Math.round(r.d)})`).join(', ')}.</small>` : ''}</div>
      ${Object.entries(groups).map(([g, cs]) => `<h3>${esc(g)}</h3><div class="rp-cmds">${cs.map((c) => `<button data-c="${c.id}" ${!ready(c.id) || (c.cost && treasury() < c.cost) ? 'disabled' : ''}>${esc(c.label)}${!ready(c.id) ? ' <small>(too soon)</small>' : ''}</button>`).join('')}</div>`).join('')}
      <p class="po-hint">Public works are commissioned from the royal treasury (🏛 on yourself).</p>`);
    el.querySelectorAll('[data-c]').forEach((btn) => (btn.onclick = () => { const c = CMDS.find((x) => x.id === btn.dataset.c); el.classList.add('hidden'); run(c, k); }));
  }

  // ---------------- the royal family ----------------
  function royalDuties(me) {
    const isK = me.job === 'king';
    const el = G.ui.modal(`<h2>Royal Duties · 왕실</h2><p>${esc(me.name.full)}, ${esc(me.title)}. The people's heart: <b>${Math.round(st.minsim)}</b> — ${BANDS[band()][0]}.</p><div class="po-ch">
      ${isK ? '<button data-d="throne">👑 Issue royal commands</button>' : ''}
      <button data-d="alms" ${me.coins < 30 ? 'disabled' : ''}>Give alms at the market (30)</button>
      <button data-d="visit">Visit the villages and hear the people</button>
      <button data-d="temple" ${me.coins < 20 ? 'disabled' : ''}>Patronise the temple (20)</button>
      ${!isK && king() ? '<button data-d="petition">Petition the King on behalf of the people</button>' : ''}
      ${me.job === 'prince' && king() ? '<button data-d="ambition">Gather ministers to your cause (ambition)</button>' : ''}
      ${me.job === 'princess' || me.job === 'queen' ? '<button data-d="school">Found a school for girls and orphans (40)</button>' : ''}
    </div>`);
    const act = (k, fn) => el.querySelector(`[data-d="${k}"]`)?.addEventListener('click', () => { el.classList.add('hidden'); const out = fn(); if (out) { G.log(`👑 ${me.name.full} ${out}`, 'decree', me.pos); G.ui.toast(`👑 ${out}`, 'decree'); } });
    act('throne', () => { openThrone(me); return null; });
    act('alms', () => { if (!cd('alms' + me.id, 1)) return 'has already given alms today.'; me.coins -= 30; for (const s of vil().filter((x) => x.coins < 20).slice(0, 8)) { s.earn(4); s.changeRel(me, 8); } heart(+3, `saw ${me.name.given} give alms`); return 'scatters silver among the beggars at the market. "Long live the royal house!"'; });
    act('visit', () => { if (!cd('visit' + me.id, 1)) return 'is still weary from the last visit.'; for (const s of vil().slice(0, 12)) { s.changeRel(me, 5); s.addMoodlet('royalvisit', `${me.name.given} visited us`, 6, 1440); } heart(+2, 'was visited by royalty'); const worst = vil().sort((a, b) => a.mood - b.mood)[0]; return `walks among the villages. ${worst ? `${worst.name.given} speaks plainly of their hardship.` : ''}`; });
    act('temple', () => { me.coins -= 20; me.needs.honor = Math.min(100, me.needs.honor + 10); heart(+1); return 'lights incense at the temple and endows a lamp that will burn for a year.'; });
    act('petition', () => { const k = king(); const r = k.getRel(me).f; if (r > 30 || Math.random() < 0.35) { const c = CMDS.find((x) => x.id === (st.tax === 'crushing' || st.tax === 'high' ? 'tax_normal' : 'granary')); if (c && (!c.when || c.when())) c.do(k); return `pleads with King ${k.name.given} — and the King relents.`; } k.changeRel(me, -5); return `pleads with King ${k.name.given}, who coldly refuses.`; });
    act('ambition', () => { const P = sys('politics'); if (P) { P.st.backing.east += 6; P.st.backing.west += 6; } king()?.changeRel(me, -6); me.ambition = (me.ambition || 0) + 1; return `meets ministers behind closed doors. ${me.ambition >= 3 ? 'Whispers say the prince is ready to move against his father.' : 'His faction at court grows.'}`; });
    act('school', () => { if (me.coins < 40) return null; me.coins -= 40; for (const s of G.sims) if (!s.dead && s.age === 'child') s.skills.scholarship = Math.min(10, (s.skills.scholarship || 0) + 0.5); heart(+4, 'founded a school'); return 'founds a school where girls and orphans learn their letters. The people call it a jewel of the realm.'; });
  }

  // ---------------- AI kings rule by temperament ----------------
  function aiRule() {
    const k = king(); if (!k || k.household) return;
    const t = (x) => k.has?.(x);
    const W = sys('war')?.st; const atWar = !!W?.war;
    const opts = [];
    const add = (id, w) => { const c = CMDS.find((x) => x.id === id); if (!c || (c.when && !c.when()) || !ready(id) || (c.cost && treasury() < c.cost)) return; opts.push([c, Math.max(0, w)]); };
    const m = st.minsim;
    add('granary', (m < 45 ? 3 : 0.4) + (t('Gentle') ? 2 : 0));
    add('tax_low', m < 35 ? 2 + (t('Gentle') ? 2 : 0) : 0);
    add('tax_normal', st.tax !== 'normal' ? 1 : 0);
    add('tax_high', (treasury() < 150 ? 1.5 : 0.3) + (t('Greedy') ? 2 : 0) + (atWar ? 1 : 0) - (m < 35 ? 1.5 : 0));
    add('tax_crush', t('Greedy') && t('Ambitious') && treasury() < 100 ? 1 : 0);
    add('requisition', atWar ? 1 : 0.2);
    add('debase', treasury() < 80 ? 0.8 : 0);
    add('amnesty', (t('Gentle') || t('Pious') ? 1 : 0.2) + (m < 40 ? 0.8 : 0));
    add('harsh', (t('Hot-headed') ? 1.2 : 0.2) + (G.sims.filter((s) => s.outlaw).length > 4 ? 1 : 0));
    add('lenient', t('Gentle') ? 0.8 : 0.1);
    add('execute', t('Hot-headed') ? 0.8 : 0.1);
    add('festival', (m < 50 ? 1.2 : 0.4) + (t('Cheerful') ? 1 : 0));
    add('banquet', 0.4);
    add('sacrifice', t('Pious') ? 1.5 : 0.3);
    add('hunt', G.sims.filter((s) => !s.dead && s.faction === 'bandit').length > 5 ? 1.2 : 0);
    add('war', (t('Ambitious') ? 0.6 : 0) + (t('Hot-headed') ? 0.4 : 0) - (m < 40 ? 0.6 : 0));
    add('peace', atWar && (W.war.losses > W.war.wins || m < 30) ? 1.5 : 0);
    add('tribute', 0.15); add('demand', t('Ambitious') ? 0.5 : 0.1);
    add('conscript', atWar ? 0.8 : 0);
    add('reward', 0.4); add('heir', 0.6); add('dry', t('Pious') ? 0.3 : 0.05);
    add('seize', t('Greedy') && treasury() < 120 ? 0.7 : 0.05);
    add('forced', t('Ambitious') ? 0.4 : 0);
    if (!opts.length) return;
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0); let pick = opts[0][0];
    for (const [c, w] of opts) { r -= w; if (r <= 0) { pick = c; break; } }
    if (pick.id === 'war') { const rs = W?.realms || {}; const rid = Object.keys(rs).sort((a, b) => rs[b].tension - rs[a].tension)[0]; if (rid && cd('war', 6)) { sys('war').api.declareWar(rid); heart(-6, 'declared war'); } return; }
    if (pick.id === 'petitions') return;
    run(pick, k);
  }

  // ---------------- unrest & praise ----------------
  function protest() {
    const crowd = vil().filter((s) => s.age !== 'child' && !s.combat.target && !s.missionLock).sort((a, b) => a.mood - b.mood).slice(0, 10);
    const [gx, gz] = LAYOUT.palaceGate; const k = king();
    const SLOGANS = ['Bread, not taxes!', 'The King has forgotten us!', 'Open the granaries!', 'Our children starve!', 'Justice for the poor!', '못 살겠다! We cannot live like this!'];
    crowd.forEach((s, i) => { s.cancelAction(); s.startAction({ type: 'event', dest: [gx + (i % 5 - 2) * 1.6, gz + 5 + Math.floor(i / 5) * 1.6], run: true, anim: () => (Math.random() < 0.01 ? 'cheer' : 'angry'), dur: 90, look: [gx, gz], label: 'Protesting at the palace gate', then: (z) => z.say(SLOGANS[Math.floor(Math.random() * SLOGANS.length)], 'angry', 3) }); });
    G.log(`✊ ${crowd.length} villagers march on the palace gate, shouting "${SLOGANS[Math.floor(Math.random() * SLOGANS.length)]}"${k ? ` King ${k.name.given} watches from the walls.` : ''}`, 'danger', { x: gx, z: gz });
  }
  function riot() {
    const r = Math.random();
    if (r < 0.35) { st.grain = Math.max(0, st.grain - 25); G.log('🔥 Rioters break into the royal storehouse and carry off 25 carts of grain!', 'danger'); }
    else if (r < 0.65) { const P = G.economy?.prices; if (P) for (const k in P) P[k] = Math.round(P[k] * 1.15); for (const s of G.sims) if (!s.dead && s.job === 'merchant') s.coins = Math.max(0, s.coins - 20); G.log('🔥 A riot tears through the market. Stalls are smashed and prices soar.', 'danger'); }
    else { const guard = G.sims.find((s) => !s.dead && (s.job === 'soldier' || s.job === 'police')); const angry = vil().filter((s) => s.fighter || s.age === 'adult').sort((a, b) => a.mood - b.mood)[0]; if (guard && angry) { angry.startFight(guard); G.log(`🔥 ${angry.name.full} attacks a guard in a fury. The crowd roars.`, 'danger'); } }
    heart(-2);
  }
  function uprising() {
    if (st.rebels) return;
    const k = king(); if (!k) return;
    const band2 = vil().filter((s) => s.age !== 'child' && !s.household && !s.merc && s.job !== 'soldier' && s.job !== 'police').sort((a, b) => (a.getRel(k).f + a.mood) - (b.getRel(k).f + b.mood)).slice(0, 9);
    if (band2.length < 4) return;
    const leader = band2[0]; leader.rebelLeader = true;
    for (const s of band2) { s.faction = 'bandit'; s.rebel = true; s.armed = true; s.rebuildModel(); s.missionLock = true; s.cancelAction(); s.startAction({ type: 'goto', dest: [LAYOUT.palaceGate[0] + (Math.random() - 0.5) * 8, LAYOUT.palaceGate[1] + 4], run: true, label: 'Marching on the palace!' }); }
    st.rebels = { ids: band2.map((s) => s.id), leader: leader.id, t: day() };
    G.log(`⚑ REVOLT! ${leader.name.full} raises the peasants' banner — ${band2.length} rebels with sickles and stolen swords march on the palace of King ${k.name.given}!`, 'danger', leader.pos);
    G.ui?.toast('⚑ A peasant uprising marches on the palace!', 'danger'); G.audio?.alarm?.();
    for (const s of G.sims) if (!s.dead && ['soldier', 'general', 'police'].includes(s.job)) { const t = band2[Math.floor(Math.random() * band2.length)]; s.cancelAction(); s.startFight(t); }
  }
  function tickRebels() {
    const R = st.rebels; if (!R) return;
    const alive = R.ids.map((id) => G.sims.find((s) => s.id === id)).filter((s) => s && !s.dead);
    const k = king();
    for (const s of alive) if (!s.combat.target && k && s.pos.distanceTo(k.pos) < 40) s.startFight(k);
    if (!alive.length || day() - R.t > 1.5) {
      st.rebels = null;
      if (alive.length) for (const s of alive) { s.faction = 'village'; s.rebel = false; s.missionLock = false; s.outlaw = true; s.bounty = 60; }
      st.minsim = Math.max(st.minsim, 30);
      G.log(alive.length ? 'The uprising melts back into the hills. Its leaders are hunted with a price on their heads.' : 'The uprising is crushed at the palace gate. The valley falls into a sullen, frightened quiet.', 'danger');
    }
  }

  const S = {
    id: 'royalPower', st, CMDS, heart, band,
    openThrone, royalDuties,
    init() {
      // the jumak is shut while rice wine is banned
      const orig = G.succession.bind(G);
      G.succession = (oldKing, killer) => {
        if (killer?.rebel || killer?.rebelLeader) { const L = (st.rebels && G.sims.find((x) => x.id === st.rebels.leader && !x.dead)) || killer; L.rebelLeader = false; L.faction = 'village'; G.crown(L, 'is raised to the throne by a peasant army that stormed the palace'); st.minsim = 70; st.tax = 'low'; st.rebels = null; for (const s of G.sims) if (s.rebel) { s.rebel = false; s.faction = 'village'; s.missionLock = false; } return; }
        st.minsim = Math.max(40, Math.min(70, st.minsim + 15)); st.heir = null; st.reign = [];
        return orig(oldKing, killer);
      };
    },
    update(dt, gm) {
      if (!G.started) return;
      const J = G.world.objects.find((o) => o.kind === 'jumak')?.def; // all taverns share one definition
      if (J) { if (st.dryUntil > day()) { if (this._jcap == null) { this._jcap = J.cap; J.cap = 0; } } else if (this._jcap != null) { J.cap = this._jcap; this._jcap = null; } }
      // harsh laws: constables scan twice as often; lenient: crime comes faster
      if (G.economy) { if (st.law === 'harsh' && G.economy.scanT > 1) G.economy.scanT = 1; if (st.law === 'lenient' && G.economy.crimeT > 150) G.economy.crimeT = 150; }
      st.aiT -= gm / 1440; if (st.aiT <= 0) { st.aiT = 0.7 + Math.random() * 0.8; try { aiRule(); } catch (e) { console.error('[royalPower] ai', e); } }
      this._rt = (this._rt || 0) - dt; if (this._rt <= 0) { this._rt = 2; tickRebels(); }
    },
    onEvent(name, p) {
      if (name === 'day') {
        // the slow drift of the people's heart
        const v = vil(); const hunger = v.reduce((a, s) => a + s.needs.hunger, 0) / Math.max(1, v.length);
        const W = sys('war')?.st;
        let d = (50 - st.minsim) * 0.06 + TAX[st.tax][2] * 0.6;
        if (hunger < 35) d -= 4; if (W?.war) d -= W.war.losses > W.war.wins ? 4 : 1.5;
        if (st.law === 'harsh') d -= 1.5; if (st.law === 'lenient') d += 0.5;
        if (RW()?.has?.('granary')) d += 1; if (st.blessed > day()) d += 1;
        heart(d);
        // taxes beyond the treasury's base income
        gain(Math.round(v.length * 1.5 * (TAX[st.tax][1] - 1)));
        if (st.tax === 'crushing' || st.tax === 'high') for (const s of v) s.coins = Math.max(0, s.coins - (st.tax === 'crushing' ? 4 : 2));
        // grain: autumn harvests fill the storehouses
        if (G.env.season === 'autumn') st.grain += 15 + (st.blessed > day() ? 10 : 0) + (RW()?.has?.('granary') ? 10 : 0);
        if (hunger < 30 && st.grain >= 10 && king() && !king().household && st.minsim < 50) { st.grain -= 10; for (const s of v) s.needs.hunger = Math.min(100, s.needs.hunger + 20); }
        // consequences of the people's heart
        const b = band();
        if (b === 'beloved') { gain(25); if (Math.random() < 0.4) G.log(`Villagers leave baskets of persimmons and eggs at the palace gate for ${king() ? 'King ' + king().name.given : 'the royal house'}.`, 'festival'); }
        if (b === 'restless' && Math.random() < 0.35) protest();
        if (b === 'angry') { if (Math.random() < 0.6) protest(); if (Math.random() < 0.45) riot(); }
        if (b === 'revolt') { if (Math.random() < 0.5) riot(); if (Math.random() < 0.55) uprising(); else protest(); }
      }
      if (name === 'death' && ['king', 'queen', 'prince', 'princess'].includes(p.sim?.job)) { st.mourning = day() + 2; for (const s of vil()) s.addMoodlet('mourning', 'National mourning', -4, 2880); }
      if (name === 'crowned') { st.minsim = Math.max(st.minsim, 50); }
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const royal = ['king', 'queen', 'prince', 'princess'].includes(me.job);
      if (o === me && royal) return [{ label: '👑 Royal duties' + (me.job === 'king' ? ' & commands' : ''), fn: () => royalDuties(me) }];
      if (o.job === 'king' && me.job !== 'king') return [{ label: `🗣 Ask about the realm (민심 ${BANDS[band()][0].toLowerCase()})`, fn: () => G.ui.modal(`<h2>The State of the Realm</h2><p>The people are <b>${BANDS[band()][0].toLowerCase()}</b> (${Math.round(st.minsim)}/100). Taxes are ${TAX[st.tax][0].toLowerCase()}; the laws are ${st.law}; the royal granary holds ${st.grain} carts.</p>${st.reign.length ? `<p>People remember that the King lately ${st.reign.slice(0, 5).map((r) => r.why).join(', ')}.</p>` : ''}`) }];
      return [];
    },
    status() { return [`👑 민심: the people are <b>${BANDS[band()][0].toLowerCase()}</b> (${Math.round(st.minsim)}) · taxes ${TAX[st.tax][0].toLowerCase()} · laws ${st.law}${st.rebels ? ' · <b>REVOLT UNDER WAY</b>' : ''}.`]; },
    panelHtml(s) { return s.household && ['king', 'queen', 'prince', 'princess'].includes(s.job) ? `<div class="facts">👑 민심 ${Math.round(st.minsim)} — ${BANDS[band()][0]} · treasury ${treasury()}</div>` : ''; },
    serialize() { const { rebels, ...rest } = st; return rest; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
