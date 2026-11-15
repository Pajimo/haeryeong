// Family (가족) — the people who share your name can lift you or drag you down. A gambling brother runs
// up debts in the family's name; a hot-headed son brawls and lands in jail; a cousin insults a noble
// house; someone dips into the family purse. But kin also share windfalls, put in a good word at court,
// nurse you when you are hurt, and bring useful friends. You can do the same for them — or to them:
// fund a tutor or an apprenticeship, recommend them at court, pay their debts; or seize their savings,
// turn them in, disown them. And you can raise the whole family's standing: ancestral rites (제사),
// a family genealogy (족보), a village school (서당).
export function createKinSystem(G) {
  const st = { lastRite: -99, jokbo: false, school: false, disowned: [], standingBonus: 0, cool: 0 };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hh = () => G.household.filter((s) => !s.dead);
  const me = () => (G.selected?.household ? G.selected : hh()[0]);
  const purse = () => hh().sort((a, b) => b.coins - a.coins)[0];
  const spend = (n) => { let left = n; for (const s of hh().sort((a, b) => b.coins - a.coins)) { const t = Math.min(s.coins, left); s.coins -= t; left -= t; if (left <= 0) break; } return left <= 0; };
  const total = () => hh().reduce((a, s) => a + s.coins, 0);
  const honour = (d) => { for (const s of hh()) s.needs.honor = Math.max(0, Math.min(100, s.needs.honor + d)); };
  const log = (t, k = 'story', p) => G.log(t, k, p);
  const isKin = (a, b) => a !== b && (a.household && b.household || a.parents?.includes(b) || b.parents?.includes(a) || a.spouse === b || (a.parents?.length && a.parents.some((p) => b.parents?.includes(p))));
  // extended kin outside the household: parents, children and siblings who live elsewhere
  const outerKin = () => { const H = hh(); return G.sims.filter((s) => !s.dead && !s.household && !s.hidden && H.some((h) => isKin(h, s))); };

  function ask(title, body, opts) {
    const el = G.ui.modal(`<h2>${title}</h2><p>${body}</p><div class="po-ch">${opts.map((o, i) => `<button data-i="${i}" ${o.disabled ? 'disabled' : ''}>${esc(o.label)}${o.hint ? `<small style="display:block;opacity:.7">${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>`);
    el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { el.classList.add('hidden'); try { opts[+b.dataset.i].fn(); } catch (e) { console.error('[kin]', e); } G.ui.refreshHousehold?.(); }));
  }

  // ---------------- what kin do to you ----------------
  const EVENTS = [
    // trouble
    { k: 'debt', w: (m) => (m.has?.('Greedy') || m.has?.('Cheerful') ? 3 : 0.8) * (m.age === 'child' ? 0 : 1), run(m) {
      const n = 40 + Math.floor(Math.random() * 90);
      ask(`🎲 ${esc(m.name.given)}'s gambling debt`, `A heavy-set man from the gambling den is at your gate. ${esc(m.name.given)} lost ${n} nyang at cards last night, and put it on the family's name.`, [
        { label: `Pay it (${n} nyang)`, disabled: total() < n, fn: () => { spend(n); m.changeRel(me(), 10); m.addMoodlet('kin_paid', 'Family covered my debt', 8, 1440); } },
        { label: 'Refuse — let them answer for it', hint: 'They will be beaten, and the family shamed', fn: () => { m.hp = Math.max(10, m.hp - 45); m.char?.setAnim?.('hit'); m.changeRel(me(), -25); honour(-5); m.addMoodlet('kin_beaten', 'Beaten for my debts', -20, 2880); log(`The den's men catch ${m.name.full} in an alley. The whole village hears of the ${m.name.surname} family's shame.`, 'danger', m.pos); } },
        { label: 'Make them work it off for the family', hint: 'No silver lost — but they will resent it', fn: () => { m.changeRel(me(), -10); m.needs.fun = Math.max(0, (m.needs.fun || 50) - 40); m.addMoodlet('kin_work', 'Working off my debt', -10, 2880); spend(Math.round(n / 3)); } },
      ]);
    } },
    { k: 'brawl', w: (m) => (m.has?.('Hot-headed') ? 3 : 0.5) * (m.age === 'child' || m.age === 'elder' ? 0 : 1), run(m) {
      const E = G.economy; if (!E || m.jailed || m.controlled) return false;
      E.jail(m); const bail = 30 + Math.floor(Math.random() * 30);
      ask(`⛓ ${esc(m.name.given)} is in jail`, `${esc(m.name.given)} broke a man's nose in a tavern brawl and was dragged off to the Podocheong. The jailer names a bail of ${bail} nyang.`, [
        { label: `Pay the bail (${bail})`, disabled: total() < bail, fn: () => { spend(bail); E.release(m); m.changeRel(me(), 12); } },
        { label: 'Leave them there to learn a lesson', fn: () => { m.changeRel(me(), -20); m.addMoodlet('kin_left', 'My family left me in jail', -15, 4320); } },
        { label: 'Slip the constable a bribe (15)', hint: 'Cheaper — if it works', disabled: total() < 15, fn: () => { spend(15); if (chance(0.6)) { E.release(m); } else { honour(-6); log(`The constable takes the ${m.name.surname} family's bribe — and reports it. The family's name is muddied.`, 'danger'); } } },
      ]);
    } },
    { k: 'insult', w: (m) => (m.has?.('Hot-headed') || m.has?.('Ambitious') ? 2 : 0.5) * (m.age === 'child' ? 0 : 1), run(m) {
      const noble = G.sims.find((s) => !s.dead && !s.household && (s.job === 'noble' || s.factions?.court?.rank >= 3) && !['king', 'queen', 'prince', 'princess'].includes(s.job)); if (!noble) return false;
      ask(`😤 ${esc(m.name.given)} insulted a noble house`, `In the market, ${esc(m.name.given)} called ${esc(noble.name.full)} “a perfumed thief” to his face. The ${esc(noble.name.surname)} house demands satisfaction.`, [
        { label: `${m.name.given} kneels and apologises`, fn: () => { m.needs.honor = Math.max(0, m.needs.honor - 12); m.changeRel(me(), -8); noble.changeRel(m, 10); } },
        { label: 'Pay compensation (50)', disabled: total() < 50, fn: () => { spend(50); noble.changeRel(me(), 5); } },
        { label: 'Stand by your kin', hint: 'Honour — and a powerful enemy', fn: () => { honour(4); m.changeRel(me(), 20); for (const s of hh()) noble.changeRel(s, -35); sys('rivals') && (sys('rivals').enmity = Math.min(100, (sys('rivals').enmity || 0) + 15)); log(`The ${me().name.surname} family stands behind ${m.name.given}. ${noble.name.full} swears they will regret it.`, 'danger', noble.pos); } },
      ]);
    } },
    { k: 'theft', w: (m) => (m.has?.('Cunning') || m.has?.('Greedy') ? 2 : 0.3) * (total() > 60 ? 1 : 0), run(m) {
      const n = Math.round(total() * 0.15); spend(n); m.earn(n);
      ask(`💰 Silver missing from the family chest`, `${n} nyang is gone from the family chest. The lock wasn't forced — and ${esc(m.name.given)} has a new pair of leather boots.`, [
        { label: 'Confront them', fn: () => { if (m.coins >= n && chance(0.6)) { m.coins -= n; me().earn(n); m.say('…Fine. Take it.', 'angry', 3); } m.changeRel(me(), -15); } },
        { label: 'Forgive and say nothing', fn: () => { m.changeRel(me(), 8); if (m.has?.('Cunning')) m.addMoodlet('kin_gotaway', 'Got away with it', 6, 1440); } },
        { label: 'Report them to the constables', hint: 'Justice is honoured — but family is family', fn: () => { G.economy?.jail(m); honour(3); m.changeRel(me(), -60); sys('memories')?.remember?.(m, me(), `${me().name.given} turned me in`, -45); } },
      ]);
    } },
    { k: 'scandal', w: (m) => (m.age === 'young' ? 1.2 : 0.3), run(m) {
      ask(`💌 Whispers about ${esc(m.name.given)}`, `The washerwomen say ${esc(m.name.given)} has been meeting someone by the river at night. The family's name is in every mouth.`, [
        { label: 'Pay the gossips to hush (35)', disabled: total() < 35, fn: () => { spend(35); } },
        { label: 'Ignore it and hold your head high', fn: () => { honour(-6); } },
        { label: 'Confine them to the house for a season', fn: () => { m.changeRel(me(), -20); m.addMoodlet('kin_confined', 'Locked away by the family', -15, 4320); honour(2); } },
      ]);
    } },
    // help
    { k: 'windfall', w: (m) => (m.age === 'child' ? 0 : 1.2), run(m) { const n = 25 + Math.floor(Math.random() * 60); me().earn(n); m.changeRel(me(), 4); G.ui.toast(`🎁 ${m.name.given} had a good day at market and shares ${n} nyang with the family.`, 'festival'); } },
    { k: 'courtword', w: (m) => ((m.factions?.court?.rank || 0) >= 1 || hh().some((h) => h.factions?.court) ? 1.2 : 0), run(m) { const t = hh().find((h) => h.factions?.court && h !== m) || m; if (!t.factions?.court) return false; t.factions.court.rep += 25; G.king && !G.king.dead && G.king.changeRel(t, 5); G.ui.toast(`🏛 ${m.name.given} put in a good word for ${t.name.given} with a senior minister. (+court reputation)`, 'decree'); } },
    { k: 'nurse', w: () => (hh().some((h) => h.hp < h.maxHp * 0.7) ? 3 : 0), run(m) { const t = hh().filter((h) => h !== m && h.hp < h.maxHp * 0.7)[0]; if (!t) return false; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.4); t.changeRel(m, 15); G.ui.toast(`🍵 ${m.name.given} sits up all night nursing ${t.name.given} with herbal broth. (Health restored)`, 'story'); } },
    { k: 'friend', w: (m) => (m.age === 'child' ? 0 : 0.8), run(m) { const f = G.sims.find((s) => !s.dead && !s.household && m.getRel(s).f > 30 && (s.coins > 150 || s.factions?.court)); if (!f) return false; f.changeRel(me(), 20); G.ui.toast(`🤝 ${m.name.given} introduces the family to their friend ${f.name.full}, who is ${f.factions?.court ? 'well placed at court' : 'well off'}. A useful acquaintance.`, 'story'); } },
    { k: 'elder', w: (m) => (m.age === 'elder' ? 2 : 0), run(m) { const kids = hh().filter((h) => h.age === 'child' || h.age === 'young'); for (const k of kids) { const sk = pick(['scholarship', 'charisma', 'sword', 'craft']); if (k.skills[sk] != null) k.skills[sk] = Math.min(10, k.skills[sk] + 0.6); k.changeRel(m, 6); } if (!kids.length) return false; G.ui.toast(`📜 ${m.name.given} spends the evening teaching the young ones old stories and hard lessons. (Skills +)`, 'story'); } },
    // poor relations come knocking when you are rich
    { k: 'poorRelation', w: () => (total() > 400 && outerKin().length ? 2 : total() > 400 ? 1 : 0), run() {
      const r = outerKin().find((s) => s.coins < 60) || null; const name = r ? r.name.full : `a cousin from the ${me().name.surname} line in the next valley`; const n = 30 + Math.floor(Math.random() * 40);
      ask(`🙏 A poor relation at the gate`, `${esc(name)} has come, cap in hand. The harvest failed; they need ${n} nyang to see the winter through. Word of your good fortune has travelled.`, [
        { label: `Give it (${n})`, disabled: total() < n, fn: () => { spend(n); honour(4); if (r) { r.earn(n); r.changeRel(me(), 30); sys('memories')?.remember?.(r, me(), `${me().name.given} saved us in a bad year`, 30); } } },
        { label: 'Give a sack of rice instead (10)', disabled: total() < 10, fn: () => { spend(10); if (r) r.changeRel(me(), 8); } },
        { label: 'Send them away', hint: 'People will call the family stingy', fn: () => { honour(-4); if (r) r.changeRel(me(), -30); log(`${name} leaves the ${me().name.surname} gate empty-handed. "So that is what silver does to blood," they say.`, 'story'); } },
      ]);
    } },
  ];

  function familyEvent() {
    const H = hh(); if (H.length < 2 && !outerKin().length) return;
    const actors = H.filter((s) => s !== G.selected && !s.controlled && !s.jailed);
    const pool = [];
    for (const ev of EVENTS) { const m = ev.k === 'poorRelation' ? null : pick(actors.length ? actors : H); if (ev.k !== 'poorRelation' && !m) continue; const w = ev.w(m || H[0]); if (w > 0) pool.push([ev, m, w]); }
    let r = Math.random() * pool.reduce((a, p) => a + p[2], 0);
    for (const [ev, m, w] of pool) { r -= w; if (r <= 0) { if (ev.run(m) !== false) return; break; } }
  }

  // ---------------- what you can do for (or to) your kin ----------------
  function kinMenu(I, o) {
    const out = [];
    const adult = o.age !== 'child';
    out.push({ label: `💰 Give ${o.name.given} an allowance (20)`, disabled: I.coins < 20, fn: () => { I.coins -= 20; o.earn(20); o.changeRel(I, 8); o.addMoodlet('kin_allow', 'Family looks after me', 6, 1440); } });
    out.push({ label: `📚 Hire a tutor for ${o.name.given} (40)`, disabled: I.coins < 40, fn: () => { I.coins -= 40; o.skills.scholarship = Math.min(10, (o.skills.scholarship || 0) + 1); o.skills.charisma = Math.min(10, (o.skills.charisma || 0) + 0.4); o.changeRel(I, 6); G.ui.toast(`${o.name.given} studies the classics with a hired tutor. (Scholarship +1)`); } });
    if (adult && ['farmer', 'farmhand', 'fisher', 'hunter', 'servant'].includes(o.job) && !o.serf) out.push({ label: `⚒ Buy ${o.name.given} an apprenticeship (60)`, disabled: I.coins < 60, fn: () => { I.coins -= 60; o.job = (o.skills.scholarship || 0) > 4 ? 'scholar' : 'merchant'; o.rebuildModel(); o.changeRel(I, 15); log(`${I.name.full} pays for ${o.name.given} to be apprenticed as a ${o.job}. A better life begins.`, 'story', o.pos); } });
    if (adult && !o.factions?.court && (I.factions?.court?.rank || 0) >= 3 && o.sex === 'm') out.push({ label: `🏛 Recommend ${o.name.given} for a court post`, fn: () => { if (chance(0.4 + (o.skills.scholarship || 0) * 0.07)) { G.factions.join(o, 'court', true); o.factions.court.rank = 1; o.changeRel(I, 20); log(`On ${I.name.full}'s recommendation, ${o.name.full} is given a junior post at court.`, 'decree', o.pos); } else { I.factions.court.rep -= 10; G.ui.toast('The minister smiles thinly: "Perhaps when they have passed the exams."'); } } });
    if (o.debt) out.push({ label: `💸 Pay off ${o.name.given}'s debt (${o.debt.amount})`, disabled: I.coins < o.debt.amount, fn: () => { I.coins -= o.debt.amount; o.debt = null; o.changeRel(I, 20); } });
    if (o.jailed) out.push({ label: `⛓ Pay ${o.name.given}'s bail (40)`, disabled: I.coins < 40, fn: () => { I.coins -= 40; G.economy?.release(o); o.changeRel(I, 15); } });
    if (o.coins > 10) out.push({ label: `✋ Take ${o.name.given}'s savings (${o.coins})`, danger: true, fn: () => { const n = o.coins; o.coins = 0; I.earn(n); o.changeRel(I, -35); o.addMoodlet('kin_robbed', 'My own family took my savings', -15, 4320); } });
    if (o.outlaw && !o.jailed) out.push({ label: `🚨 Turn ${o.name.given} in to the constables`, danger: true, fn: () => { G.economy?.jail(o); honour(3); o.changeRel(I, -60); sys('memories')?.remember?.(o, I, `${I.name.given} handed me to the constables`, -50); } });
    if (o.household && hh().length > 1 && adult && o !== hh()[0]) out.push({ label: `📜 Disown ${o.name.given} and cast them out`, danger: true, fn: () => {
      ask(`Disown ${esc(o.name.given)}?`, `They will be struck from the family register and leave your house for good. They will not forget it.`, [
        { label: 'Yes — cast them out', fn: () => { G.household = G.household.filter((x) => x !== o); o.household = false; o.controlled = false; o.freeWill = false; st.disowned.push(o.id); const v = G.world.houses.find((h) => !h.virtual && !(h.residents || []).some((r) => !r.dead) && h !== G.homeHouse); if (o.home?.residents) o.home.residents = o.home.residents.filter((x) => x !== o); if (v) { o.home = v; v.residents.push(o); v.owner = o.id; } o.changeRel(I, -80); sys('memories')?.remember?.(o, I, `${I.name.given} disowned me`, -60); if (G.selected === o) G.select?.(I); log(`${I.name.full} strikes ${o.name.full} from the family register. ${o.name.given} walks out of the gate with a bundle and does not look back.`, 'danger', o.pos); G.ui.refreshHousehold?.(); } },
        { label: 'No', fn: () => {} },
      ]);
    } });
    return out;
  }

  // ---------------- raising the family ----------------
  function standing() {
    const H = hh(); if (!H.length) return 0;
    const hon = H.reduce((a, s) => a + s.needs.honor, 0) / H.length;
    const w = G.economy ? Math.min(40, Math.log10(Math.max(1, H.reduce((a, s) => a + G.economy.netWorth(s), 0))) * 10) : 0;
    const court = Math.max(0, ...H.map((s) => s.factions?.court?.rank || 0)) * 4;
    return Math.round(hon * 0.4 + w + court + (st.jokbo ? 10 : 0) + (st.school ? 10 : 0) + (G.homeHouse?.tier === 'mansion' ? 8 : G.homeHouse?.tier === 'house' ? 4 : 0));
  }
  const rank = (n) => (n >= 80 ? 'a great house' : n >= 60 ? 'a respected house' : n >= 40 ? 'a decent family' : n >= 25 ? 'a struggling family' : 'a family of no account');
  function selfMenu(I) {
    const out = [{ label: `🏮 Family standing: ${standing()} — ${rank(standing())}`, disabled: true }];
    const seasonOk = G.env.day - st.lastRite >= 7;
    out.push({ label: seasonOk ? '🕯 Hold ancestral rites (제사) for the family (30)' : '🕯 Ancestral rites held recently', disabled: !seasonOk || total() < 30, fn: () => { spend(30); st.lastRite = G.env.day; const H = hh(); for (const a of H) for (const b of H) if (a !== b) a.changeRel(b, 6); for (const s of H) s.addMoodlet('jesa', 'Honoured the ancestors', 10, 2880); honour(4); for (const k of outerKin()) k.changeRel(I, 10); log(`The ${I.name.surname} family gathers before the ancestral tablets. Incense, bowed heads, a table of rice cakes and wine — the family is bound a little tighter.`, 'story', I.pos); } });
    if (!st.jokbo) out.push({ label: '📖 Compile the family genealogy (족보) (150)', disabled: total() < 150, fn: () => { spend(150); st.jokbo = true; honour(12); log(`A scholar is paid to compile the ${I.name.surname} family genealogy, tracing the line back eleven generations. Noble houses now speak the name with more respect.`, 'decree', I.pos); for (const s of G.sims) if (!s.dead && !s.household && (s.job === 'noble' || s.factions?.court)) s.changeRel(I, 6); } });
    if (!st.school && total() >= 300) out.push({ label: '🏫 Endow a village school (서당) in the family name (300)', fn: () => { spend(300); st.school = true; honour(18); sys('missions')?.addFame?.(I, 'heart', 15); for (const s of G.sims) if (!s.dead && s.faction === 'village') { s.changeRel(I, 5); if (s.age === 'child') s.skills.scholarship = Math.min(10, (s.skills.scholarship || 0) + 1); } log(`The ${I.name.surname} family endows a village school. Children who would have herded goats now learn their characters. The village blesses the name.`, 'festival', I.pos); } });
    return out;
  }

  const S = {
    id: 'kin', st, standing,
    onEvent(name) {
      if (name !== 'day' || !G.started) return;
      // roughly every other day something happens in the family
      if (chance(0.5)) setTimeout(() => { try { familyEvent(); } catch (e) { console.error('[kin]', e); } }, 4000 + Math.random() * 20000);
    },
    simMenuItems(I, o) {
      if (!I.household) return [];
      if (o === I) return selfMenu(I);
      if (isKin(I, o) || o.household) return kinMenu(I, o);
      return [];
    },
    panelHtml(s) { if (!s.household || s !== hh()[0]) return ''; return `<div class="facts">🏮 Family standing ${standing()} · ${rank(standing())}${st.jokbo ? ' · 족보 compiled' : ''}${st.school ? ' · school endowed' : ''}</div>`; },
    _event: (k) => { const ev = EVENTS.find((e) => e.k === k); const m = hh().find((s) => s !== G.selected) || hh()[0]; return ev?.run(m); },
    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
