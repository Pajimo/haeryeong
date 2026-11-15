// Household servants. Great houses keep bondservants (노비) — owned, not paid, bought and sold on
// papers — and hire farmhands (머슴) for a daily wage. Both work the master's fields and yard, and
// stand between the household and anyone who comes to rob or harm it. Owned servants who are
// mistreated or see no hope may run; freeing one (면천) is a mark of a good name.
import { SURNAMES } from './data.js';
import { birthMenu } from './birth.js';

export function createServantsSystem(G) {
  const sys = (id) => G.systems.find((x) => x.id === id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const all = () => G.sims.filter((s) => !s.dead && s.serf);
  const master = (sv) => G.sims.find((s) => s.id === sv.serf.master && !s.dead) || null;
  const homeOf = (sv) => G.world.houses.find((h) => h.id === sv.serf.house) || null;
  function make(house, kind, masterSim) {
    const d = house.door || [house.x, house.z];
    const sv = G.spawn({ sex: Math.random() < 0.65 ? 'm' : 'f', age: pick(['young', 'adult']), job: kind === 'bond' ? 'servant' : 'farmhand', home: house, surname: pick(SURNAMES), traits: [pick(['Loyal', 'Lazy', 'Brave', 'Cheerful', 'Gentle', 'Hot-headed'])], x: d[0] + 2, z: d[1] + 2, coins: kind === 'bond' ? 0 : 10, armed: Math.random() < 0.35 });
    sv.serf = { kind, master: masterSim?.id ?? null, house: house.id, loyalty: kind === 'bond' ? 45 + Math.random() * 30 : 60, wage: kind === 'hired' ? 5 : 0 };
    sv.uniform = { outfit: 'commoner', colors: { top: kind === 'bond' ? '#b7aa90' : '#c9b896', bottom: '#8a7e6a' }, hat: kind === 'bond' ? 'headband' : 'satgat' };
    sv.rebuildModel(); sv.missionLock = true;
    house.residents?.push(sv);
    for (const r of house.residents || []) if (r !== sv) { r.changeRel(sv, 10); sv.changeRel(r, 10); }
    return sv;
  }
  function work(sv, dt) {
    const h = homeOf(sv); if (!h || sv.hidden || sv.combat.target || sv.serf.mode === 'follow') return;
    for (const k of ['hunger', 'energy', 'hygiene']) sv.needs[k] = Math.max(sv.needs[k], 35);
    // defend the house and its people
    const people = (h.residents || []).filter((r) => !r.dead && r !== sv);
    for (const o of G.sims) {
      if (o.dead || o.hidden || o.serf || o.royalGuard) continue;
      const t = o.combat.target; if (t && people.includes(t) && !o.combat.nonlethal && o.pos.distanceTo(sv.pos) < 25) { if (sv.serf.loyalty > 25) { sv.cancelAction(); sv.startFight(o); sv.say(pick(['Get away from the master!', 'Thief! Thief!', 'Not this house!']), 'shout', 2); } return; }
    }
    if (sv.action) return;
    const d = h.door || [h.x, h.z];
    const r = Math.random();
    if (r < 0.45) sv.startAction({ type: 'event', dest: [d[0] + (Math.random() - 0.5) * 8, d[1] + (Math.random() - 0.5) * 8], anim: 'farm', dur: 40 + Math.random() * 40, label: sv.serf.kind === 'bond' ? 'Labouring in the yard' : 'Working the master’s field' });
    else if (r < 0.7) sv.startAction({ type: 'event', dest: [d[0] + 3, d[1] + 3], anim: 'carry', dur: 30, label: 'Hauling water and firewood' });
    else if (r < 0.85) sv.startAction({ type: 'event', dest: [d[0] + (Math.random() - 0.5) * 4, d[1] + 2], anim: 'guard', dur: 40, label: 'Keeping the gate' });
    else sv.startAction({ type: 'event', dest: [d[0] + 1, d[1] + 1], anim: 'sit', dur: 30, label: 'Resting a moment' });
  }

  const S = {
    id: 'servants', all, hire: make,
    onEvent(name, p) {
      if (name === 'ready' && !all().length) {
        for (const h of G.world.houses) {
          const head = (h.residents || []).find((r) => !r.dead && r.age !== 'child' && !r.serf); if (!head || h === G.homeHouse) continue;
          if (h.tier === 'mansion') { make(h, 'bond', head); make(h, 'bond', head); if (Math.random() < 0.7) make(h, 'hired', head); }
          else if (h.tier === 'house' && Math.random() < 0.6) make(h, Math.random() < 0.5 ? 'bond' : 'hired', head);
        }
      }
      if (name === 'day') {
        for (const sv of all()) {
          if (sv.household) continue;
          const m = master(sv);
          if (!m) { // master gone: the household's next adult inherits, or they slip away
            const heir = (homeOf(sv)?.residents || []).find((r) => !r.dead && !r.serf && r.age !== 'child');
            if (heir) sv.serf.master = heir.id; else { sv.serf = null; sv.missionLock = false; sv.job = 'farmer'; sv.uniform = null; sv.rebuildModel(); continue; }
          }
          const mm = master(sv);
          if (sv.serf.kind === 'hired') {
            if (mm && mm.coins >= sv.serf.wage) { mm.coins -= sv.serf.wage; sv.earn(sv.serf.wage); sv.serf.loyalty = Math.min(100, sv.serf.loyalty + 2); }
            else { sv.serf.loyalty -= 20; if (sv.serf.loyalty < 20) { G.log(`${sv.name.full}, a hired hand of the ${mm?.name.surname || ''} house, quits over unpaid wages.`, 'story'); sv.serf = null; sv.missionLock = false; sv.job = 'farmer'; sv.uniform = null; sv.rebuildModel(); continue; } }
          } else {
            // the master's character shapes a bondservant's lot
            const kind = mm?.has?.('Gentle') ? 3 : mm?.has?.('Hot-headed') || mm?.has?.('Greedy') ? -4 : -1;
            sv.serf.loyalty = Math.max(0, Math.min(100, sv.serf.loyalty + kind + (sv.has('Loyal') ? 2 : 0)));
            if (sv.serf.loyalty < 12 && Math.random() < 0.35) { G.log(`🌙 ${sv.name.full}, a bondservant of the ${mm?.name.surname || ''} house, has run away in the night. A slave-catcher is already asking questions.`, 'danger', sv.pos); sv.serf = null; sv.missionLock = false; sv.outlaw = true; sv.bounty = 20; sv.job = 'farmer'; sv.uniform = null; sv.rebuildModel(); sv.startAction({ type: 'goto', dest: [-280 + Math.random() * 40, 220 + Math.random() * 40], run: true, label: 'Fleeing into the hills' }); continue; }
          }
          if (mm) mm.earn(sv.serf.kind === 'bond' ? 4 : 3); // the fruits of their labour go to the master
        }
      }
      if (name === 'death' && p.sim?.serf) { const m = master(p.sim); if (m?.household) m.addMoodlet('lostServant', `${p.sim.name.given} died`, -6, 1440); }
    },
    update(dt) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 1;
      for (const sv of all()) if (!sv.household) work(sv, 1);
    },
    simMenuItems(me, o) {
      if (!me.household) return [];
      const out = [...birthMenu(G, me, o)];
      if (o.serf && !o.household && G.household.some((h) => h.id === o.serf.master)) {
        out.push({ label: `${o.serf.kind === 'bond' ? '노비 · Bondservant' : '머슴 · Hired hand'} · loyalty ${Math.round(o.serf.loyalty)}`, disabled: true });
        if (o.serf.kind === 'bond') {
          out.push({ label: '🕊 Burn their papers and set them free (면천)', fn: () => { const name = o.name.full; o.serf = null; o.missionLock = false; o.job = 'farmer'; o.uniform = null; o.rebuildModel(); o.changeRel(me, 40); o.addMoodlet('freed', 'Freed from bondage', 30, 4320); me.needs.honor = Math.min(100, me.needs.honor + 15); sys('missions')?.addFame?.(me, 'heart', 8); sys('memories')?.remember?.(o, me, `${me.name.given} gave me my freedom`, 40); G.log(`${me.name.full} burns the bond papers of ${name} before witnesses. ${name} weeps, then bows to the ground — a free person.`, 'story', me.pos); } });
          out.push({ label: '📜 Sell their papers to a broker (80 nyang)', danger: true, fn: () => { me.earn(80); me.needs.honor = Math.max(0, me.needs.honor - 12); sys('missions')?.addFame?.(me, 'heart', -6); for (const r of G.household) r.addMoodlet('soldServant', `Sold ${o.name.given}`, -8, 1440); G.log(`${o.name.full} is led away in a broker's cart, sold for 80 nyang.`, 'story', o.pos); o.dispose?.(); o.removed = true; o.dead = true; } });
        } else out.push({ label: '✋ Let them go with a week’s wages (35)', disabled: me.coins < 35, fn: () => { me.coins -= 35; o.earn(35); o.serf = null; o.missionLock = false; o.job = 'farmer'; o.uniform = null; o.rebuildModel(); } });
        out.push({ label: '🍚 Give them a good meal and a day of rest', fn: () => { o.serf.loyalty = Math.min(100, o.serf.loyalty + 12); o.needs.hunger = 100; o.needs.energy = 100; o.say('Thank you, master.', 'happy'); } });
      }
      return out;
    },
    objMenuItems(me, o) {
      if (!me.household || !(o.kind === 'shop' || o.kind === 'stallWork' || o.kind === 'jumak')) return [];
      const home = me.home; if (!home || home.virtual) return [];
      const mine = all().filter((s) => G.household.some((h) => h.id === s.serf.master));
      const out = [{ label: `🧑‍🌾 Hire a farmhand (머슴) — 20 now, 5 a day${mine.length ? ` · you keep ${mine.length}` : ''}`, disabled: me.coins < 20, fn: () => { me.coins -= 20; const sv = make(home, 'hired', me); G.log(`${me.name.full} hires ${sv.name.full} as a farmhand.`, 'story', me.pos); } }];
      if (o.kind !== 'jumak') out.push({ label: '⛓ Buy a bondservant from a broker (120)', danger: true, disabled: me.coins < 120, fn: () => { me.coins -= 120; const sv = make(home, 'bond', me); me.needs.honor = Math.max(0, me.needs.honor - 4); G.log(`${me.name.full} buys the bond papers of ${sv.name.full}. ${sv.name.given} follows without a word.`, 'story', me.pos); } });
      return out;
    },
    panelHtml(s) { const mine = all().filter((x) => x.serf.master === s.id); return mine.length ? `<div class="facts">🧑‍🌾 Servants: ${mine.map((x) => `${x.name.given} (${x.serf.kind === 'bond' ? '노비' : '머슴'}, loyalty ${Math.round(x.serf.loyalty)})`).join(', ')}</div>` : ''; },
    serialize() { return all().map((s) => ({ id: s.id, ...s.serf })); },
    restore(d, get) { for (const r of d || []) { const s = get(r.id); if (!s) continue; const { id, ...rest } = r; s.serf = rest; s.missionLock = true; s.uniform = { outfit: 'commoner', colors: { top: rest.kind === 'bond' ? '#b7aa90' : '#c9b896', bottom: '#8a7e6a' }, hat: rest.kind === 'bond' ? 'headband' : 'satgat' }; s.rebuildModel(); } },
  };
  return S;
}
