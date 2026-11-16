// Royal pilgrimage (행차): the King goes up to the mountain temple to pray — for rain, for victory,
// for an heir, for a sick child — with the Queen and heir, the royal guard, a column of soldiers,
// eunuchs and banner-bearers. The people line the road; the monks ring the great bell. Mountain roads
// are lonely, and those who hate the throne know exactly where the King will be.
import { LAYOUT } from './terrain.js';

export function createPilgrimageSystem(G) {
  let P = null;
  const day = () => G.env.day + G.env.hour / 24;
  const sys = (id) => G.systems.find((x) => x.id === id);
  const king = () => (G.king && !G.king.dead ? G.king : null);
  const REASONS = [['for rain on the parched fields', () => G.env.weather === 'clear' && G.env.season === 'summer'], ['for victory over the enemy', () => !!sys('war')?.st?.war], ['for the health of the royal house', () => G.sims.some((s) => !s.dead && ['queen', 'prince', 'princess'].includes(s.job) && s.hp < s.maxHp * 0.6)], ['for an heir to the throne', () => !G.sims.some((s) => !s.dead && s.job === 'prince')], ['for a bountiful harvest', () => G.env.season === 'autumn' || G.env.season === 'spring'], ['to honour the ancestors and the mountain spirits', () => true]];
  function start(byPlayer) {
    const k = king(); if (!k || P) return false;
    const why = (REASONS.find(([, c]) => c()) || REASONS[REASONS.length - 1])[0];
    const [tx, tz] = LAYOUT.temple;
    const family = G.sims.filter((s) => !s.dead && !s.hidden && ['queen', 'prince', 'princess'].includes(s.job) && !s.household).slice(0, 3);
    const soldiers = G.sims.filter((s) => !s.dead && !s.hidden && s.job === 'soldier' && !s.royalGuard && !s.combat.target && !s.household).slice(0, 8);
    const court = G.household.filter((s) => !s.dead && !s.hidden && (s.factions?.court?.rank || 0) >= 2 && !s.controlled);
    const all = [k, ...family, ...soldiers, ...court];
    for (const s of all) { s._pilLock = s.missionLock; s.missionLock = true; s.cancelAction(); }
    P = { k, family, soldiers, court, all, why, phase: 'out', t: 0, start: day(), at: [tx, tz + 14] };
    G.director?.start?.({ kind: 'pilgrimage', title: 'Royal Procession', ko: '어가 행렬', pos: [k.pos.x, k.pos.z], max: 600, update: () => { if (P && G.director.active) G.director.active.pos = [P.k.pos.x, P.k.pos.z]; } });
    G.log(`🏯 The royal procession (어가 행렬) sets out for the mountain temple: King ${k.name.given} goes to pray ${why}. Banners, drums, ${soldiers.length} soldiers and the royal guard; the people kneel along the road.`, 'decree', k.pos);
    if (court.length) G.ui?.toast(`🏯 ${court.map((s) => s.name.given).join(', ')} attend${court.length > 1 ? '' : 's'} the King on the royal pilgrimage.`, 'decree');
    G.audio?.drum?.();
    // villagers come out to watch and kneel
    for (const v of G.sims.filter((s) => !s.dead && !s.hidden && s.faction === 'village' && !s.household && !s.missionLock && !s.action && s.pos.distanceTo(k.pos) < 120).slice(0, 14)) v.startAction({ type: 'event', dest: [v.pos.x + (Math.random() - 0.5) * 4, v.pos.z + (Math.random() - 0.5) * 4], anim: 'bow', dur: 40, look: [k.pos.x, k.pos.z], label: 'Kneeling as the King passes' });
    void byPlayer; return true;
  }
  function march(dest, dt) {
    const { k, family, soldiers, court } = P;
    const go = (s, d, label) => { if (s.dead || s.combat.target) return; const dist = Math.hypot(s.pos.x - d[0], s.pos.z - d[1]); if (dist > 2.5 && (s.action?.type !== 'goto' || (s._pt = (s._pt || 0) + dt) > 2)) { s._pt = 0; s.cancelAction(); s.startAction({ type: 'goto', dest: d, label }); } };
    P.st = P.st || { x: k.pos.x, z: k.pos.z, t: 0 }; P.st.t += dt;
    if (P.st.t > 20) { const moved = Math.hypot(k.pos.x - P.st.x, k.pos.z - P.st.z); P.st = { x: k.pos.x, z: k.pos.z, t: 0 }; if (moved < 2 && k.action?.type === 'goto') k.cancelAction(); }
    if (!k.dead && !k.combat.target && k.action?.type !== 'goto' && Math.hypot(k.pos.x - dest[0], k.pos.z - dest[1]) > 2.5) { k.cancelAction(); k.startAction({ type: 'goto', dest, label: 'Riding in the royal procession' }); }
    const hd = Math.atan2(dest[0] - k.pos.x, dest[1] - k.pos.z);
    soldiers.forEach((s, i) => { const row = Math.floor(i / 2), side = i % 2 ? 1 : -1; const front = i < 4 ? 1 : -1; const off = front * (4 + row % 2 * 2); go(s, [k.pos.x + Math.sin(hd) * off + Math.cos(hd) * side * 1.6, k.pos.z + Math.cos(hd) * off - Math.sin(hd) * side * 1.6], 'Marching in the royal escort'); if (i === 0 && s.char.propName !== 'banner') s.char.setProp('banner'); });
    [...family, ...court].forEach((s, i) => go(s, [k.pos.x - Math.sin(hd) * (3 + i * 1.5), k.pos.z - Math.cos(hd) * (3 + i * 1.5)], 'Following the King in procession'));
    return Math.hypot(k.pos.x - dest[0], k.pos.z - dest[1]) < 4;
  }
  function pray() {
    const [tx, tz] = LAYOUT.temple; const { k, family, court } = P;
    [k, ...family, ...court].forEach((s, i) => { if (s.dead) return; s.cancelAction(); s.startAction({ type: 'event', dest: [tx - 3 + i * 1.5, tz + 9], anim: 'pray', dur: 9999, look: [tx, tz], label: 'Praying before the Buddha' }); });
    for (const m of G.sims.filter((s) => !s.dead && s.job === 'monk').slice(0, 4)) { m.cancelAction(); m.startAction({ type: 'event', dest: [tx + (Math.random() - 0.5) * 6, tz + 5], anim: 'pray', dur: 80, look: [tx, tz], label: 'Chanting sutras for the King' }); }
    G.log(`The great temple bell sounds thirty-three times. King ${k.name.given} bows before the Buddha and prays ${P.why}; the monks chant through the afternoon.`, 'omen', { x: tx, z: tz });
  }
  // the mountain road is a good place for an ambush — likelier when danger to the throne is high
  function maybeAmbush() {
    if (P.ambushed) return; P.ambushed = true;
    const T = sys('royalGuard')?.threat?.() || { score: 20 };
    if (Math.random() > Math.min(0.6, 0.08 + T.score / 150)) return;
    const k = P.k; const n = 3 + Math.floor(T.score / 30); const a = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) { const h = G.spawn({ sex: 'm', age: 'adult', job: 'bandit', armed: true, skillSword: 6.5 + Math.random() * 2, x: k.pos.x + Math.sin(a + i * 0.3) * 18, z: k.pos.z + Math.cos(a + i * 0.3) * 18 }); h.faction = 'bandit'; h.missionLock = true; h.startFight(k); if (i === 0) h.say('The tyrant is in the pass! Now!', 'shout', 3); setTimeout(() => { if (!h.dead && !h.removed) { h.dispose?.(); h.removed = true; h.dead = true; } }, 150000); }
    G.log(`⚔ AMBUSH in the mountain pass! ${n} armed men burst from the pines and fall upon the royal procession!`, 'danger', k.pos);
    G.ui?.toast('⚔ The royal procession is ambushed!', 'danger'); G.audio?.alarm?.();
  }
  function end(ok) {
    const p = P; P = null; if (!p) return;
    for (const s of p.all) { if (s.dead) continue; s.missionLock = s._pilLock || false; s.cancelAction(); if (s.char.propName === 'banner') s.char.setProp(null); }
    if (G.director?.active?.kind === 'pilgrimage') G.director.stop();
    if (!ok) return;
    const RP = sys('royalPower'); RP?.heart?.(+6, 'prayed at the mountain temple');
    if (RP) RP.st.blessed = day() + 6;
    for (const s of G.sims) if (!s.dead && s.has?.('Pious')) s.addMoodlet('pilgrimage', 'The King prayed for us', 8, 1440);
    for (const s of p.court) { s.needs.honor = Math.min(100, s.needs.honor + 10); s.factions?.court && (s.factions.court.rep += 25); p.k.changeRel(s, 8); }
    if (/rain/.test(p.why) && Math.random() < 0.6) { G.env.setWeather?.('rain'); G.log('That very evening, clouds roll in from the sea and rain falls on the parched fields. The people weep for joy.', 'omen'); }
    G.log(`The royal procession returns to the palace. ${p.court.length ? p.court.map((s) => s.name.given).join(', ') + ' won the King’s notice on the road.' : ''}`, 'decree');
  }
  const S = {
    id: 'pilgrimage', start, get active() { return !!P; },
    init() { const RP = sys('royalPower'); if (RP) RP.CMDS.push({ id: 'pilgrimage', g: 'Feasts & faith', label: 'Make a royal pilgrimage to the mountain temple', cd: 4, when: () => !P, do: () => (start(true) ? 'Drums and banners: the royal procession forms at the palace gate.' : 'The procession cannot form now.') }); },
    update(dt, gm) {
      if (!P) {
        // AI kings go up the mountain every few days, or when the realm needs prayer
        if (!G.started) return; const k = king(); if (!k || k.household) return;
        this._t = (this._t ?? 1.5) - gm / 1440; const h = G.env.hour;
        if (this._t <= 0 && h > 8 && h < 11 && !G.raidActive && !sys('war')?.st?.war?.battle) { this._t = 3 + Math.random() * 3; start(false); }
        return;
      }
      P.t += gm;
      if (P.k.dead) { G.log('The procession breaks apart in panic — the King has fallen on the mountain road!', 'danger'); return end(false); }
      const [tx, tz] = LAYOUT.temple; const [px, pz] = LAYOUT.palace;
      if (P.phase === 'out') { const near = Math.hypot(P.k.pos.x - tx, P.k.pos.z - tz) < 110 && Math.hypot(P.k.pos.x - tx, P.k.pos.z - tz) > 50; if (near) maybeAmbush(); if (march(P.at, dt) || P.t > 360) { P.phase = 'pray'; P.t = 0; pray(); } }
      else if (P.phase === 'pray') {
        // the monks feed the procession and let it rest before the long road home
        if (!P.fed) { P.fed = true; for (const s of P.all) if (!s.dead) { s.needs.hunger = Math.max(s.needs.hunger, 75); s.needs.energy = Math.max(s.needs.energy, 55); } }
        if (P.t > 90) { P.phase = 'home'; P.t = 0; }
      }
      else if (P.phase === 'home') { if (march([px + 22, pz - 12], dt) || P.t > 400) end(true); }
    },
    serialize() { return null; },
  };
  return S;
}
