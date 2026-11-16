// Comings and goings. When houses stand empty and the realm is at peace, families arrive from other
// provinces and rent or buy them. When a family has nothing left, it may pack a cart and leave the
// valley. Also a safety net for movement: anyone wedged inside a wall is set free, and you can always
// choose "I'm stuck" to step to the nearest clear ground (bringing a mission companion with you).
import { SURNAMES } from './data.js';
import { groundAt, ROADS } from './terrain.js';

const ORIGINS = ['Buyeo', 'Okjeo', 'the eastern coast', 'Gaema plateau', 'the southern islands', 'Hwando fortress', 'the salt flats', 'the northern steppe border', 'a flooded river valley', 'the old capital'];
const REASONS = ['fleeing a flood', 'after a bad harvest', 'looking for work', 'to be near kin', 'after hearing the valley is prosperous', 'escaping a cruel magistrate', 'to start again'];

export function createMigrationSystem(G) {
  const st = { arrived: 0, left: 0 };
  const sys = (id) => G.systems.find((x) => x.id === id);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = (p) => Math.random() < p;
  const ROYAL = ['king', 'queen', 'prince', 'princess'];
  const alive = (h) => (h.residents || []).filter((r) => !r.dead);
  const vacancies = () => G.world.houses.filter((h) => !h.virtual && !alive(h).length && h !== G.homeHouse && !(sys('housing')?.st.projects || []).some((p) => p.houseId === h.id));
  const edge = () => { const r = pick(ROADS.filter((rd) => rd.length > 2)); return Math.random() < 0.5 ? r[r.length - 1] : r[0]; };

  function clearSpot(x, z) {
    const N = G.nav; if (!N?.cellFree) return [x, z];
    for (let r = 0; r <= 12; r++) for (let a = 0; a < 16; a++) { const ang = (a / 16) * Math.PI * 2; const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r; if (N.cellFree(px, pz)) return [px, pz]; if (r === 0) break; }
    return [x, z];
  }
  function unstick(s, near) {
    const [x, z] = clearSpot(near ? near[0] : s.pos.x, near ? near[1] : s.pos.z);
    s.pos.x = x; s.pos.z = z; s.pos.y = groundAt(x, z); s.path = []; s.stuckCount = 0;
    if (s.mount) { s.mount.pos.x = x; s.mount.pos.z = z; }
  }

  function arrive() {
    // Newcomers stop at the same ceiling births respect, so immigration can no longer crowd out the
    // valley's own families — it used to be allowed up to 175 while conception stopped at 105.
    const V = vacancies(); if (V.length < 2 || G.aliveCount > G.popCap * 0.97) return;
    const RP = sys('royalPower'); if (RP && RP.st.minsim < 30) return;
    if (sys('war')?.st?.war) return;
    const h = V.sort((a, b) => (a.tier === 'hut' ? 0 : a.tier === 'cottage' ? 1 : 2) - (b.tier === 'hut' ? 0 : b.tier === 'cottage' ? 1 : 2))[Math.floor(Math.random() * Math.min(3, V.length))];
    const [ex, ez] = edge(); const surname = pick(SURNAMES); const origin = pick(ORIGINS), why = pick(REASONS);
    const rich = h.tier === 'house' || h.tier === 'mansion';
    const job = rich ? pick(['merchant', 'scholar', 'merchant']) : pick(['farmer', 'farmer', 'fisher', 'hunter', 'farmer']);
    const coins = rich ? 200 + Math.floor(Math.random() * 300) : 15 + Math.floor(Math.random() * 50);
    const mk = (o) => G.spawn({ home: h, surname, x: ex + (Math.random() - 0.5) * 4, z: ez + (Math.random() - 0.5) * 4, ...o });
    const head = mk({ sex: 'm', age: chance(0.6) ? 'adult' : 'young', job, coins });
    const fam = [head];
    if (chance(0.85)) { const wife = mk({ sex: 'f', age: head.age, job: job === 'scholar' ? 'merchant' : job, coins: Math.floor(coins / 3) }); wife.spouse = head; head.spouse = wife; wife.married = head.married = true; fam.push(wife); }
    const kids = chance(0.7) ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let i = 0; i < kids; i++) { const c = mk({ sex: chance(0.5) ? 'm' : 'f', age: 'child', job: 'child', coins: 0 }); c.parents = fam.slice(0, 2); for (const p of c.parents) p.children.push(c); fam.push(c); }
    if (chance(0.25)) fam.push(mk({ sex: chance(0.5) ? 'm' : 'f', age: 'elder', job: 'farmer', coins: 10 }));
    for (const m of fam) { h.residents.push(m); for (const o of fam) if (o !== m) m.changeRel(o, 50); m.startAction({ type: 'goto', dest: h.door || [h.x, h.z], label: 'Arriving with a loaded handcart' }); }
    const H = sys('housing');
    if (H && !H.st.rent[h.id]) { if (h.owner == null && coins > 400 && rich) h.owner = head.id; else H.st.rent[h.id] = { owner: h.owner ?? 'crown', tenant: head.id }; }
    st.arrived++;
    G.log(`🧳 A family arrives on the ${Math.abs(ex) > Math.abs(ez) ? (ex > 0 ? 'eastern' : 'western') : ez > 0 ? 'southern' : 'northern'} road: ${head.name.full}${fam.length > 1 ? ` and ${fam.length - 1} kin` : ''}, from ${origin}, ${why}. They ${h.owner === head.id ? 'buy' : 'take'} the empty ${h.tier === 'hut' ? 'hut' : h.tier === 'cottage' ? 'cottage' : 'tiled house'}.`, 'story', { x: h.x, z: h.z });
  }
  function depart() {
    const heads = G.sims.filter((s) => !s.dead && !s.household && !s.hidden && s.faction === 'village' && !ROYAL.includes(s.job) && !s.serf && !s.royalGuard && !s.merc && !s.missionLock && s.age !== 'child' && s.home && s.coins < 3 && s.needs.honor < 40);
    const s = heads.find(() => chance(0.12)); if (!s) return;
    const fam = G.sims.filter((o) => !o.dead && !o.household && o.home === s.home && !o.serf);
    if (fam.some((o) => o.household)) return;
    const [ex, ez] = edge();
    for (const m of fam) { m.missionLock = true; m.cancelAction(); m.startAction({ type: 'goto', dest: [ex, ez], label: 'Leaving the valley for good' }); m._leaving = performance.now(); }
    if (s.home?.residents) s.home.residents = s.home.residents.filter((r) => !fam.includes(r));
    st.left++;
    G.log(`🛤 With nothing left, the ${s.name.surname} family loads a handcart and takes the road out of the valley. The neighbours watch from their gates.`, 'story', s.pos);
  }

  const S = {
    id: 'migration', st, unstick,
    update(dt) {
      if (!G.started) return;
      this._t = (this._t || 0) - dt; if (this._t > 0) return; this._t = 4;
      // free anyone wedged inside a wall or a house (e.g. after a house was rebuilt around them)
      const N = G.nav;
      for (const s of G.sims) {
        if (s.dead || s.hidden || s.controlled) continue;
        // (never pull someone off a seat or out of a task they are doing in place)
        if ((!s.action || s.action.phase === 'move') && !s.mount && N.blocked(s.pos.x, s.pos.z, 0.02)) unstick(s);
        // departing families vanish once they reach the edge of the map (or after a long while)
        if (s._leaving && (!s.action || performance.now() - s._leaving > 240000)) { s.dispose?.(); s.removed = true; s.dead = true; s.hidden = true; }
      }
    },
    onEvent(name) {
      if (name !== 'day') return;
      try {
        // The arrival was scheduled on a real-time timer, so at any speed above 1x most days' arrivals
        // never landed. Families now come sooner, and far more readily, the emptier the valley is.
        const press = G.popPressure;
        if (chance(0.5 + press * 0.45)) setTimeout(arrive, 1500 + Math.random() * (press > 0.35 ? 4000 : 24000));
        if (press > 0.3 && chance(press * 0.5)) setTimeout(arrive, 2500 + Math.random() * 6000);
        if (chance(Math.max(0, 0.45 - press * 0.9))) depart(); // nobody packs up and leaves a half-empty valley
      } catch (e) { console.error('[migration]', e); }
    },
    simMenuItems(me, o) {
      if (!me.household || o !== me) return [];
      return [{ label: '🧭 I’m stuck — step to clear ground', fn: () => {
        me.cancelAction(); unstick(me);
        // bring a mission companion or a following servant along
        for (const c of G.sims) if (!c.dead && c !== me && (c.missionLock || c.serf?.mode === 'follow') && c.pos.distanceTo(me.pos) < 40 && !c.combat?.target) { c.cancelAction(); unstick(c, [me.pos.x + 1.5, me.pos.z + 1.5]); }
        G.ui.toast('Back on clear ground.');
      } }];
    },
    serialize() { return st; },
    restore(d) { if (d) Object.assign(st, d); },
  };
  return S;
}
